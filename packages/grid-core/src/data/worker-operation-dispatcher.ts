import {
  createWorkerCanceledResponse,
  createWorkerCancelRequest,
  createWorkerErrorResponse,
  createWorkerRequest,
  isWorkerResponseMessage,
  postWorkerMessage,
  type WorkerOperationType,
  type WorkerResponseMessage
} from './worker-protocol';

const DEFAULT_WORKER_TIMEOUT_MS = 15_000;
const MIN_WORKER_TIMEOUT_MS = 250;
const DEFAULT_LARGE_DATA_THRESHOLD = 100_000;
const MIN_LARGE_DATA_THRESHOLD = 1;
const DEFAULT_WORKER_POOL_SIZE = 1;
const MIN_WORKER_POOL_SIZE = 1;

export interface WorkerOperationWorker {
  addEventListener(type: string, listener: (event: { data?: unknown; message?: string; error?: unknown }) => void): void;
  removeEventListener?(type: string, listener: (event: { data?: unknown; message?: string; error?: unknown }) => void): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
}

export interface WorkerOperationSerializationContext {
  isCanceled?: () => boolean;
  yieldControl?: () => Promise<void>;
}

export interface WorkerOperationRuntimeOptions {
  enabled?: boolean;
  assetUrl?: string;
  timeoutMs?: number;
  largeDataThreshold?: number;
  allowMainThreadFallback?: boolean;
  poolSize?: number;
}

export type WorkerOperationWorkerFactory = (assetUrl: string) => WorkerOperationWorker;

export interface WorkerExecutorLike<TRequest, TResult, TContext> {
  execute(request: TRequest, context?: TContext): Promise<WorkerResponseMessage<TResult>>;
}

export interface WorkerOperationDispatcherOptions<
  TRequest extends { opId: string; rowCount: number },
  TResult,
  TContext,
  TPayload,
  TType extends WorkerOperationType
> {
  operationType: TType;
  fallbackExecutor: WorkerExecutorLike<TRequest, TResult, TContext>;
  serializeRequest: (
    request: TRequest,
    context: WorkerOperationSerializationContext
  ) => TPayload | Promise<TPayload | null> | null;
  getRuntimeOptions: () => WorkerOperationRuntimeOptions | undefined;
  createWorker?: WorkerOperationWorkerFactory;
}

interface PendingWorkerOperation<TResult> {
  opId: string;
  slotIndex: number;
  resolve: (response: WorkerResponseMessage<TResult>) => void;
  timeoutId: ReturnType<typeof setTimeout> | null;
  cancelCheckId: ReturnType<typeof setTimeout> | null;
  cancelRequested: boolean;
}

interface WorkerSlot<TResult> {
  worker: WorkerOperationWorker;
  pendingOpIds: Set<string>;
  handleWorkerMessageBound: (event: { data?: unknown }) => void;
  handleWorkerErrorBound: (event: { message?: string; error?: unknown }) => void;
}

function normalizeTimeoutMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_WORKER_TIMEOUT_MS;
  }

  return Math.max(MIN_WORKER_TIMEOUT_MS, Math.floor(value));
}

function normalizeLargeDataThreshold(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LARGE_DATA_THRESHOLD;
  }

  return Math.max(MIN_LARGE_DATA_THRESHOLD, Math.floor(value));
}

function normalizePoolSize(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_WORKER_POOL_SIZE;
  }

  return Math.max(MIN_WORKER_POOL_SIZE, Math.floor(value));
}

function normalizeAssetUrl(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function createBrowserWorker(assetUrl: string): WorkerOperationWorker {
  return new Worker(assetUrl);
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && typeof (value as Promise<T>).then === 'function';
}

export class WorkerOperationDispatcher<
  TRequest extends { opId: string; rowCount: number },
  TResult,
  TContext extends { isCanceled?: () => boolean } | undefined,
  TPayload,
  TType extends WorkerOperationType
> {
  private readonly operationType: TType;
  private readonly fallbackExecutor: WorkerExecutorLike<TRequest, TResult, TContext>;
  private readonly serializeRequest: (
    request: TRequest,
    context: WorkerOperationSerializationContext
  ) => TPayload | Promise<TPayload | null> | null;
  private readonly getRuntimeOptions: () => WorkerOperationRuntimeOptions | undefined;
  private readonly createWorker: WorkerOperationWorkerFactory;
  private readonly hasCustomWorkerFactory: boolean;
  private readonly workerSlots: Array<WorkerSlot<TResult> | null> = [];
  private workerAssetUrl: string | null = null;
  private nextWorkerSlotIndex = 0;
  private readonly pending = new Map<string, PendingWorkerOperation<TResult>>();

  public constructor(options: WorkerOperationDispatcherOptions<TRequest, TResult, TContext, TPayload, TType>) {
    this.operationType = options.operationType;
    this.fallbackExecutor = options.fallbackExecutor;
    this.serializeRequest = options.serializeRequest;
    this.getRuntimeOptions = options.getRuntimeOptions;
    this.createWorker = options.createWorker ?? createBrowserWorker;
    this.hasCustomWorkerFactory = typeof options.createWorker === 'function';
  }

  public prewarm(): boolean {
    const runtimeOptions = this.getRuntimeOptions();
    const workerEnabled = runtimeOptions?.enabled !== false;
    const assetUrl = normalizeAssetUrl(runtimeOptions?.assetUrl);
    const poolSize = normalizePoolSize(runtimeOptions?.poolSize);

    if (!workerEnabled || !assetUrl) {
      return false;
    }

    if (typeof Worker === 'undefined' && !this.hasCustomWorkerFactory) {
      return false;
    }

    try {
      this.ensureWorkerPool(assetUrl, poolSize);
      return true;
    } catch {
      return false;
    }
  }

  public async execute(request: TRequest, context?: TContext): Promise<WorkerResponseMessage<TResult>> {
    const runtimeOptions = this.getRuntimeOptions();
    const normalizedRowCount = Math.max(0, Math.floor(request.rowCount));
    const largeDataThreshold = normalizeLargeDataThreshold(runtimeOptions?.largeDataThreshold);
    const isLargeDataOperation = normalizedRowCount >= largeDataThreshold;
    const workerEnabled = runtimeOptions?.enabled !== false;
    const allowMainThreadFallback = runtimeOptions?.allowMainThreadFallback === true;
    const assetUrl = normalizeAssetUrl(runtimeOptions?.assetUrl);
    const poolSize = normalizePoolSize(runtimeOptions?.poolSize);

    if (!workerEnabled || !isLargeDataOperation) {
      return this.fallbackExecutor.execute(request, context);
    }

    if (!assetUrl) {
      if (allowMainThreadFallback) {
        return this.fallbackExecutor.execute(request, context);
      }

      return createWorkerErrorResponse(request.opId, {
        message: `${this.operationType} requires a worker for ${String(normalizedRowCount)} rows, but no worker asset URL was resolved`,
        code: 'WORKER_ASSET_URL_REQUIRED'
      }) as WorkerResponseMessage<TResult>;
    }

    if (typeof Worker === 'undefined' && !this.hasCustomWorkerFactory) {
      if (allowMainThreadFallback) {
        return this.fallbackExecutor.execute(request, context);
      }

      return createWorkerErrorResponse(request.opId, {
        message: `${this.operationType} requires a worker for ${String(normalizedRowCount)} rows, but Worker is not supported in this environment`,
        code: 'WORKER_ENVIRONMENT_UNSUPPORTED'
      }) as WorkerResponseMessage<TResult>;
    }

    if (context?.isCanceled?.()) {
      return createWorkerCanceledResponse(request.opId) as WorkerResponseMessage<TResult>;
    }

    const serializationContext: WorkerOperationSerializationContext = {
      isCanceled: context?.isCanceled,
      yieldControl: () => this.yieldControl()
    };
    const serializedRequest = this.serializeRequest(request, serializationContext);
    const payload = isPromiseLike(serializedRequest) ? await serializedRequest : serializedRequest;
    if (context?.isCanceled?.()) {
      return createWorkerCanceledResponse(request.opId) as WorkerResponseMessage<TResult>;
    }
    if (!payload) {
      if (allowMainThreadFallback) {
        return this.fallbackExecutor.execute(request, context);
      }

      return createWorkerErrorResponse(request.opId, {
        message: `${this.operationType} requires a worker for ${String(normalizedRowCount)} rows, but the request payload is not serializable`,
        code: 'WORKER_SERIALIZATION_UNSUPPORTED'
      }) as WorkerResponseMessage<TResult>;
    }

    try {
      this.ensureWorkerPool(assetUrl, poolSize);
    } catch (error) {
      if (allowMainThreadFallback) {
        return this.fallbackExecutor.execute(request, context);
      }

      return createWorkerErrorResponse(request.opId, {
        message:
          error instanceof Error
            ? error.message
            : `${this.operationType} worker could not be created for large data execution`,
        code: 'WORKER_CREATE_FAILED'
      }) as WorkerResponseMessage<TResult>;
    }

    return new Promise<WorkerResponseMessage<TResult>>((resolve) => {
      const slotIndex = this.selectWorkerSlotIndex();
      const workerSlot = slotIndex >= 0 ? this.workerSlots[slotIndex] : null;
      if (!workerSlot) {
        resolve(
          createWorkerErrorResponse(request.opId, {
            message: `${this.operationType} worker pool could not provide a worker slot`,
            code: 'WORKER_POOL_UNAVAILABLE'
          }) as WorkerResponseMessage<TResult>
        );
        return;
      }

      const timeoutMs = normalizeTimeoutMs(runtimeOptions?.timeoutMs);
      const pendingOperation: PendingWorkerOperation<TResult> = {
        opId: request.opId,
        slotIndex,
        resolve,
        timeoutId: null,
        cancelCheckId: null,
        cancelRequested: false
      };

      pendingOperation.timeoutId = setTimeout(() => {
        this.finishPendingOperation(request.opId);
        this.postCancel(request.opId);
        resolve(
          createWorkerErrorResponse(request.opId, {
            message: `${this.operationType} worker operation timed out after ${String(timeoutMs)}ms`,
            code: 'WORKER_TIMEOUT'
          }) as WorkerResponseMessage<TResult>
        );
      }, timeoutMs);

      this.pending.set(request.opId, pendingOperation);
      workerSlot.pendingOpIds.add(request.opId);
      this.scheduleCancelMonitor(request.opId, context);
      postWorkerMessage(workerSlot.worker, createWorkerRequest(request.opId, this.operationType, payload));
    });
  }

  public cancel(opId: string): void {
    const pendingOperation = this.pending.get(opId);
    if (!pendingOperation || pendingOperation.cancelRequested) {
      return;
    }

    this.postCancel(opId);
  }

  public destroy(): void {
    const pendingOpIds = Array.from(this.pending.keys());
    for (let index = 0; index < pendingOpIds.length; index += 1) {
      const opId = pendingOpIds[index];
      const pendingOperation = this.pending.get(opId);
      if (!pendingOperation) {
        continue;
      }

      this.finishPendingOperation(opId);
      pendingOperation.resolve(
        createWorkerErrorResponse(opId, {
          message: `${this.operationType} worker dispatcher destroyed before completion`,
          code: 'WORKER_DISPATCHER_DESTROYED'
        }) as WorkerResponseMessage<TResult>
      );
    }

    this.terminateAllWorkers();
  }

  private ensureWorkerPool(assetUrl: string, poolSize: number): void {
    const normalizedPoolSize = normalizePoolSize(poolSize);
    if (
      this.workerAssetUrl &&
      (this.workerAssetUrl !== assetUrl || this.workerSlots.length !== normalizedPoolSize)
    ) {
      if (this.pending.size > 0) {
        this.failAllPending(
          'WORKER_POOL_CHANGED',
          `${this.operationType} worker asset URL or pool size changed while operations were pending`
        );
      }
      this.terminateAllWorkers();
    }

    if (!this.workerAssetUrl) {
      this.workerAssetUrl = assetUrl;
    }

    for (let slotIndex = 0; slotIndex < normalizedPoolSize; slotIndex += 1) {
      if (this.workerSlots[slotIndex]) {
        continue;
      }

      const worker = this.createWorker(assetUrl);
      const slot: WorkerSlot<TResult> = {
        worker,
        pendingOpIds: new Set<string>(),
        handleWorkerMessageBound: (event: { data?: unknown }): void => {
          this.handleWorkerMessage(slotIndex, event);
        },
        handleWorkerErrorBound: (event: { message?: string; error?: unknown }): void => {
          this.handleWorkerError(slotIndex, event);
        }
      };
      worker.addEventListener('message', slot.handleWorkerMessageBound);
      worker.addEventListener('error', slot.handleWorkerErrorBound);
      this.workerSlots[slotIndex] = slot;
    }
  }

  private selectWorkerSlotIndex(): number {
    if (this.workerSlots.length === 0) {
      return -1;
    }

    let selectedIndex = -1;
    let selectedPendingCount = Number.POSITIVE_INFINITY;
    for (let offset = 0; offset < this.workerSlots.length; offset += 1) {
      const slotIndex = (this.nextWorkerSlotIndex + offset) % this.workerSlots.length;
      const slot = this.workerSlots[slotIndex];
      if (!slot) {
        continue;
      }

      const pendingCount = slot.pendingOpIds.size;
      if (pendingCount < selectedPendingCount) {
        selectedIndex = slotIndex;
        selectedPendingCount = pendingCount;
        if (pendingCount === 0) {
          break;
        }
      }
    }

    if (selectedIndex >= 0) {
      this.nextWorkerSlotIndex = (selectedIndex + 1) % this.workerSlots.length;
    }

    return selectedIndex;
  }

  private handleWorkerMessage(slotIndex: number, event: { data?: unknown }): void {
    if (!isWorkerResponseMessage(event.data)) {
      return;
    }

    const pendingOperation = this.pending.get(event.data.opId);
    if (!pendingOperation) {
      return;
    }

    this.finishPendingOperation(event.data.opId);
    if (pendingOperation.cancelRequested && event.data.status === 'ok') {
      pendingOperation.resolve(createWorkerCanceledResponse(event.data.opId) as WorkerResponseMessage<TResult>);
      return;
    }

    pendingOperation.resolve(event.data as WorkerResponseMessage<TResult>);
  }

  private handleWorkerError(slotIndex: number, event: { message?: string; error?: unknown }): void {
    const message =
      typeof event.message === 'string' && event.message.length > 0
        ? event.message
        : event.error instanceof Error
          ? event.error.message
          : `${this.operationType} worker crashed`;
    this.failPendingForSlot(slotIndex, 'WORKER_RUNTIME_ERROR', message);
    this.terminateWorkerSlot(slotIndex);
  }

  private scheduleCancelMonitor(opId: string, context?: TContext): void {
    if (!context?.isCanceled) {
      return;
    }

    const monitor = (): void => {
      const pendingOperation = this.pending.get(opId);
      if (!pendingOperation) {
        return;
      }

      if (context.isCanceled && context.isCanceled()) {
        this.postCancel(opId);
        return;
      }

      pendingOperation.cancelCheckId = setTimeout(monitor, 0);
    };

    const pendingOperation = this.pending.get(opId);
    if (!pendingOperation) {
      return;
    }

    pendingOperation.cancelCheckId = setTimeout(monitor, 0);
  }

  private postCancel(opId: string): void {
    const pendingOperation = this.pending.get(opId);
    if (!pendingOperation || pendingOperation.cancelRequested) {
      return;
    }

    pendingOperation.cancelRequested = true;
    const workerSlot = this.workerSlots[pendingOperation.slotIndex];
    if (workerSlot) {
      postWorkerMessage(workerSlot.worker, createWorkerCancelRequest(opId), {
        autoDetectTransferables: false
      });
    }
  }

  private finishPendingOperation(opId: string): void {
    const pendingOperation = this.pending.get(opId);
    if (!pendingOperation) {
      return;
    }

    if (pendingOperation.timeoutId) {
      clearTimeout(pendingOperation.timeoutId);
    }
    if (pendingOperation.cancelCheckId) {
      clearTimeout(pendingOperation.cancelCheckId);
    }

    const workerSlot = this.workerSlots[pendingOperation.slotIndex];
    workerSlot?.pendingOpIds.delete(opId);
    this.pending.delete(opId);
  }

  private failPendingForSlot(slotIndex: number, code: string, message: string): void {
    const workerSlot = this.workerSlots[slotIndex];
    if (!workerSlot) {
      return;
    }

    const pendingOpIds = Array.from(workerSlot.pendingOpIds);
    for (let index = 0; index < pendingOpIds.length; index += 1) {
      const opId = pendingOpIds[index];
      const pendingOperation = this.pending.get(opId);
      if (!pendingOperation) {
        continue;
      }

      this.finishPendingOperation(opId);
      pendingOperation.resolve(
        createWorkerErrorResponse(opId, {
          message,
          code
        }) as WorkerResponseMessage<TResult>
      );
    }
  }

  private failAllPending(code: string, message: string): void {
    const pendingOpIds = Array.from(this.pending.keys());
    for (let index = 0; index < pendingOpIds.length; index += 1) {
      const opId = pendingOpIds[index];
      const pendingOperation = this.pending.get(opId);
      if (!pendingOperation) {
        continue;
      }

      this.finishPendingOperation(opId);
      pendingOperation.resolve(
        createWorkerErrorResponse(opId, {
          message,
          code
        }) as WorkerResponseMessage<TResult>
      );
    }
  }

  private terminateWorkerSlot(slotIndex: number): void {
    const workerSlot = this.workerSlots[slotIndex];
    if (!workerSlot) {
      return;
    }

    workerSlot.worker.removeEventListener?.('message', workerSlot.handleWorkerMessageBound);
    workerSlot.worker.removeEventListener?.('error', workerSlot.handleWorkerErrorBound);
    workerSlot.worker.terminate();
    this.workerSlots[slotIndex] = null;
  }

  private terminateAllWorkers(): void {
    for (let slotIndex = 0; slotIndex < this.workerSlots.length; slotIndex += 1) {
      this.terminateWorkerSlot(slotIndex);
    }
    this.workerSlots.length = 0;
    this.workerAssetUrl = null;
    this.nextWorkerSlotIndex = 0;
  }

  private async yieldControl(): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
