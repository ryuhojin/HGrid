import {
  createWorkerCanceledResponse,
  createWorkerErrorResponse,
  isWorkerRequestMessage,
  postWorkerMessage,
  type WorkerOperationRequest,
  type WorkerResponseMessage
} from './worker-protocol';

export interface WorkerMessageEventLike {
  data: unknown;
}

export interface WorkerEntrypointScope {
  addEventListener(type: 'message', listener: (event: WorkerMessageEventLike) => void | Promise<void>): void;
  removeEventListener?(type: 'message', listener: (event: WorkerMessageEventLike) => void | Promise<void>): void;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

export interface WorkerExecutionContext<TType extends string> {
  opId: string;
  type: TType;
  isCanceled: () => boolean;
}

export interface WorkerEntrypointDefinition<TPayload, TResult, TType extends string> {
  operationType: TType;
  execute: (
    request: WorkerOperationRequest<TPayload, TType>,
    context: WorkerExecutionContext<TType>
  ) => Promise<WorkerResponseMessage<TResult>> | WorkerResponseMessage<TResult>;
}

interface WorkerOperationState {
  isCanceled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasWorkerScopeShape(value: unknown): value is WorkerEntrypointScope {
  return (
    isRecord(value) &&
    typeof value.addEventListener === 'function' &&
    typeof value.postMessage === 'function'
  );
}

export function resolveWorkerEntrypointScope(): WorkerEntrypointScope | null {
  if (typeof window !== 'undefined') {
    return null;
  }

  return hasWorkerScopeShape(globalThis) ? (globalThis as unknown as WorkerEntrypointScope) : null;
}

export function createWorkerEntrypointListener<TPayload, TResult, TType extends string>(
  scope: WorkerEntrypointScope,
  definition: WorkerEntrypointDefinition<TPayload, TResult, TType>
): (event: WorkerMessageEventLike) => Promise<void> {
  const activeOperations = new Map<string, WorkerOperationState>();

  return async (event: WorkerMessageEventLike): Promise<void> => {
    const message = event.data;
    if (!isWorkerRequestMessage(message)) {
      return;
    }

    if (message.type === 'cancel') {
      const activeOperation = activeOperations.get(message.opId);
      if (activeOperation) {
        activeOperation.isCanceled = true;
      }
      return;
    }

    if (message.type !== definition.operationType) {
      postWorkerMessage(
        scope,
        createWorkerErrorResponse(message.opId, {
          message: `Unsupported worker operation: ${message.type}`,
          code: 'WORKER_UNSUPPORTED_OPERATION'
        })
      );
      return;
    }

    const request = message as WorkerOperationRequest<TPayload, TType>;
    const operationState: WorkerOperationState = {
      isCanceled: false
    };
    activeOperations.set(request.opId, operationState);

    try {
      let response = await definition.execute(request, {
        opId: request.opId,
        type: definition.operationType,
        isCanceled: () => operationState.isCanceled
      });

      if (operationState.isCanceled && response.status === 'ok') {
        response = createWorkerCanceledResponse(request.opId) as WorkerResponseMessage<TResult>;
      }

      postWorkerMessage(scope, response);
    } catch (error) {
      postWorkerMessage(
        scope,
        createWorkerErrorResponse(request.opId, {
          message: error instanceof Error ? error.message : `Unknown ${definition.operationType} worker error`,
          code: 'WORKER_RUNTIME_ERROR'
        })
      );
    } finally {
      activeOperations.delete(request.opId);
    }
  };
}

export function registerWorkerEntrypoint<TPayload, TResult, TType extends string>(
  scope: WorkerEntrypointScope,
  definition: WorkerEntrypointDefinition<TPayload, TResult, TType>
): () => void {
  const listener = createWorkerEntrypointListener(scope, definition);
  scope.addEventListener('message', listener);
  return () => {
    scope.removeEventListener?.('message', listener);
  };
}
