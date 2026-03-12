import { describe, expect, it } from 'vitest';
import {
  collectTransferables,
  createWorkerCancelRequest,
  createWorkerCanceledResponse,
  createWorkerErrorResponse,
  createWorkerOkResponse,
  createWorkerRequest,
  isWorkerRequestMessage,
  isWorkerResponseMessage,
  postWorkerMessage,
  resolveWorkerTransferables,
  type WorkerRequestMessage,
  type WorkerResponseMessage
} from '../src/data/worker-protocol';

describe('Worker protocol', () => {
  it('builds request/cancel envelopes and validates request guards', () => {
    const sortRequest = createWorkerRequest('op-1', 'sort', {
      sortModel: [{ columnId: 'score', direction: 'asc' }]
    });
    const cancelRequest = createWorkerCancelRequest('op-1');

    expect(sortRequest).toEqual({
      opId: 'op-1',
      type: 'sort',
      payload: {
        sortModel: [{ columnId: 'score', direction: 'asc' }]
      }
    });
    expect(cancelRequest).toEqual({
      opId: 'op-1',
      type: 'cancel'
    });

    expect(isWorkerRequestMessage(sortRequest)).toBe(true);
    expect(isWorkerRequestMessage(cancelRequest)).toBe(true);
    expect(isWorkerRequestMessage({ opId: 'op-2', type: 'sort' })).toBe(false);
    expect(isWorkerRequestMessage({ opId: '', type: 'sort', payload: {} })).toBe(false);

    expect(() => createWorkerRequest('', 'sort', {})).toThrowError();
    expect(() => createWorkerRequest('op-2', 'cancel', {})).toThrowError();
    expect(() => createWorkerCancelRequest('')).toThrowError();
  });

  it('builds ok/canceled/error envelopes and validates response guards', () => {
    const okResponse = createWorkerOkResponse('op-1', { viewToData: new Int32Array([2, 0, 1]) });
    const canceledResponse = createWorkerCanceledResponse('op-2');
    const errorResponse = createWorkerErrorResponse('op-3', {
      message: 'Comparator failed',
      code: 'SORT_COMPARATOR_FAILURE'
    });

    expect(okResponse.status).toBe('ok');
    expect(canceledResponse).toEqual({ opId: 'op-2', status: 'canceled', result: null });
    expect(errorResponse).toEqual({
      opId: 'op-3',
      status: 'error',
      result: {
        message: 'Comparator failed',
        code: 'SORT_COMPARATOR_FAILURE'
      }
    });

    expect(isWorkerResponseMessage(okResponse)).toBe(true);
    expect(isWorkerResponseMessage(canceledResponse)).toBe(true);
    expect(isWorkerResponseMessage(errorResponse)).toBe(true);
    expect(isWorkerResponseMessage({ opId: 'x', status: 'canceled', result: [] })).toBe(false);
    expect(isWorkerResponseMessage({ opId: 'x', status: 'error', result: { message: '' } })).toBe(false);

    expect(() => createWorkerErrorResponse('op-4', { message: '' })).toThrowError();
  });

  it('collects transferable buffers from nested payloads and deduplicates repeated buffers', () => {
    const baseBuffer = new ArrayBuffer(16);
    const payload = {
      view1: new Int32Array(baseBuffer),
      nested: [
        {
          view2: new Uint8Array(baseBuffer),
          copyBuffer: baseBuffer
        }
      ]
    };

    const transferables = collectTransferables(payload);
    expect(transferables.length).toBe(1);
    expect(transferables[0]).toBe(baseBuffer);
  });

  it('does not traverse typed array element indexes while collecting transferables', () => {
    const baseBuffer = new ArrayBuffer(16);
    const values = new Int32Array(baseBuffer);
    const originalObjectKeys = Object.keys;
    let typedArrayKeyReadCount = 0;

    Object.keys = ((target: object) => {
      if (target === values) {
        typedArrayKeyReadCount += 1;
      }
      return originalObjectKeys(target);
    }) as typeof Object.keys;

    try {
      const transferables = collectTransferables({
        values
      });

      expect(transferables).toEqual([baseBuffer]);
      expect(typedArrayKeyReadCount).toBe(0);
    } finally {
      Object.keys = originalObjectKeys;
    }
  });

  it('resolves transferables and posts messages with auto-detect/explicit options', () => {
    const payloadBuffer = new ArrayBuffer(12);
    const extraBuffer = new ArrayBuffer(8);

    const request: WorkerRequestMessage = createWorkerRequest('op-1', 'filter', {
      mask: new Uint8Array(payloadBuffer)
    });

    const response: WorkerResponseMessage = createWorkerOkResponse('op-1', {
      viewToData: new Int32Array(payloadBuffer)
    });

    const requestTransferables = resolveWorkerTransferables(request);
    expect(requestTransferables).toEqual([payloadBuffer]);

    const responseTransferables = resolveWorkerTransferables(response, [extraBuffer]);
    expect(responseTransferables).toContain(payloadBuffer);
    expect(responseTransferables).toContain(extraBuffer);

    const calls: Array<{ message: unknown; transfer: Transferable[] | undefined }> = [];
    const target = {
      postMessage(message: unknown, transfer?: Transferable[]) {
        calls.push({ message, transfer });
      }
    };

    const postedTransferables = postWorkerMessage(target, request, {
      transferables: [extraBuffer]
    });
    expect(postedTransferables).toContain(payloadBuffer);
    expect(postedTransferables).toContain(extraBuffer);
    expect(calls[0].transfer).toBeDefined();
    expect(calls[0].transfer).toContain(payloadBuffer);
    expect(calls[0].transfer).toContain(extraBuffer);

    const cancelMessage: WorkerRequestMessage = createWorkerCancelRequest('op-1');
    const cancelTransferables = postWorkerMessage(target, cancelMessage, {
      autoDetectTransferables: false
    });
    expect(cancelTransferables).toEqual([]);
    expect(calls[1].transfer).toBeUndefined();
  });
});
