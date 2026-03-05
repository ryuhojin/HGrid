export type WorkerOperationType = 'sort' | 'filter' | (string & {});
export type WorkerResponseStatus = 'ok' | 'canceled' | 'error';

export interface WorkerOperationRequest<TPayload = unknown, TType extends string = WorkerOperationType> {
  opId: string;
  type: TType;
  payload: TPayload;
}

export interface WorkerCancelRequest {
  opId: string;
  type: 'cancel';
}

export type WorkerRequestMessage = WorkerOperationRequest | WorkerCancelRequest;

export interface WorkerSuccessResponse<TResult = unknown> {
  opId: string;
  status: 'ok';
  result: TResult;
}

export interface WorkerCanceledResponse {
  opId: string;
  status: 'canceled';
  result: null;
}

export interface WorkerErrorResult {
  message: string;
  code?: string;
  details?: unknown;
}

export interface WorkerErrorResponse {
  opId: string;
  status: 'error';
  result: WorkerErrorResult;
}

export type WorkerResponseMessage<TResult = unknown> =
  | WorkerSuccessResponse<TResult>
  | WorkerCanceledResponse
  | WorkerErrorResponse;

export interface WorkerPostTarget {
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

export interface WorkerPostMessageOptions {
  transferables?: Transferable[];
  autoDetectTransferables?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isKnownTransferable(value: unknown): value is Transferable {
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return true;
  }

  if (typeof MessagePort !== 'undefined' && value instanceof MessagePort) {
    return true;
  }

  return false;
}

function addTransferable(uniqueTransferables: Set<Transferable>, candidate: unknown): void {
  if (isKnownTransferable(candidate)) {
    uniqueTransferables.add(candidate);
    return;
  }

  if (!ArrayBuffer.isView(candidate)) {
    return;
  }

  const viewBuffer = (candidate as ArrayBufferView).buffer;
  if (viewBuffer instanceof ArrayBuffer) {
    uniqueTransferables.add(viewBuffer);
  }
}

function traverseTransferables(source: unknown, uniqueTransferables: Set<Transferable>, visited: WeakSet<object>): void {
  addTransferable(uniqueTransferables, source);

  if (!isRecord(source)) {
    return;
  }

  if (visited.has(source)) {
    return;
  }
  visited.add(source);

  if (Array.isArray(source)) {
    for (let index = 0; index < source.length; index += 1) {
      traverseTransferables(source[index], uniqueTransferables, visited);
    }
    return;
  }

  if (source instanceof Map) {
    source.forEach((mapValue, mapKey) => {
      traverseTransferables(mapKey, uniqueTransferables, visited);
      traverseTransferables(mapValue, uniqueTransferables, visited);
    });
    return;
  }

  if (source instanceof Set) {
    source.forEach((setValue) => {
      traverseTransferables(setValue, uniqueTransferables, visited);
    });
    return;
  }

  const keys = Object.keys(source);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    traverseTransferables(source[key], uniqueTransferables, visited);
  }
}

export function createWorkerRequest<TPayload, TType extends WorkerOperationType>(
  opId: string,
  type: TType,
  payload: TPayload
): WorkerOperationRequest<TPayload, TType> {
  if (!hasNonEmptyString(opId)) {
    throw new Error('createWorkerRequest: opId must be a non-empty string');
  }

  if (!hasNonEmptyString(type) || type === 'cancel') {
    throw new Error('createWorkerRequest: type must be a non-empty operation type and cannot be "cancel"');
  }

  return {
    opId,
    type,
    payload
  };
}

export function createWorkerCancelRequest(opId: string): WorkerCancelRequest {
  if (!hasNonEmptyString(opId)) {
    throw new Error('createWorkerCancelRequest: opId must be a non-empty string');
  }

  return {
    opId,
    type: 'cancel'
  };
}

export function createWorkerOkResponse<TResult>(opId: string, result: TResult): WorkerSuccessResponse<TResult> {
  if (!hasNonEmptyString(opId)) {
    throw new Error('createWorkerOkResponse: opId must be a non-empty string');
  }

  return {
    opId,
    status: 'ok',
    result
  };
}

export function createWorkerCanceledResponse(opId: string): WorkerCanceledResponse {
  if (!hasNonEmptyString(opId)) {
    throw new Error('createWorkerCanceledResponse: opId must be a non-empty string');
  }

  return {
    opId,
    status: 'canceled',
    result: null
  };
}

export function createWorkerErrorResponse(opId: string, result: WorkerErrorResult): WorkerErrorResponse {
  if (!hasNonEmptyString(opId)) {
    throw new Error('createWorkerErrorResponse: opId must be a non-empty string');
  }

  if (!result || !hasNonEmptyString(result.message)) {
    throw new Error('createWorkerErrorResponse: result.message must be a non-empty string');
  }

  return {
    opId,
    status: 'error',
    result
  };
}

export function isWorkerRequestMessage(value: unknown): value is WorkerRequestMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (!hasNonEmptyString(value.opId) || !hasNonEmptyString(value.type)) {
    return false;
  }

  if (value.type === 'cancel') {
    return true;
  }

  return hasOwn(value, 'payload');
}

export function isWorkerResponseMessage(value: unknown): value is WorkerResponseMessage {
  if (!isRecord(value)) {
    return false;
  }

  if (!hasNonEmptyString(value.opId) || !hasNonEmptyString(value.status)) {
    return false;
  }

  if (value.status === 'ok') {
    return hasOwn(value, 'result');
  }

  if (value.status === 'canceled') {
    return value.result === null;
  }

  if (value.status === 'error') {
    if (!isRecord(value.result)) {
      return false;
    }

    return hasNonEmptyString(value.result.message);
  }

  return false;
}

export function collectTransferables(source: unknown): Transferable[] {
  const uniqueTransferables = new Set<Transferable>();
  const visited = new WeakSet<object>();
  traverseTransferables(source, uniqueTransferables, visited);
  return Array.from(uniqueTransferables);
}

function mergeTransferables(primary: Transferable[], secondary: Transferable[] | undefined): Transferable[] {
  if (!secondary || secondary.length === 0) {
    return primary;
  }

  const merged = new Set<Transferable>(primary);
  for (let index = 0; index < secondary.length; index += 1) {
    merged.add(secondary[index]);
  }

  return Array.from(merged);
}

export function resolveWorkerTransferables(
  message: WorkerRequestMessage | WorkerResponseMessage,
  explicitTransferables?: Transferable[]
): Transferable[] {
  let detected: Transferable[] = [];

  if (isWorkerRequestMessage(message)) {
    if (message.type !== 'cancel') {
      detected = collectTransferables((message as WorkerOperationRequest).payload);
    }
  }

  if (isWorkerResponseMessage(message) && message.status === 'ok') {
    detected = collectTransferables(message.result);
  }

  return mergeTransferables(detected, explicitTransferables);
}

export function postWorkerMessage(
  target: WorkerPostTarget,
  message: WorkerRequestMessage | WorkerResponseMessage,
  options?: WorkerPostMessageOptions
): Transferable[] {
  const shouldAutoDetect = options?.autoDetectTransferables ?? true;
  const transferables = shouldAutoDetect
    ? resolveWorkerTransferables(message, options?.transferables)
    : options?.transferables ?? [];

  if (transferables.length > 0) {
    target.postMessage(message, transferables);
    return transferables;
  }

  target.postMessage(message);
  return transferables;
}
