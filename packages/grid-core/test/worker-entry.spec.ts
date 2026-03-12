import { describe, expect, it } from 'vitest';
import { createWorkerEntrypointListener, type WorkerEntrypointScope } from '../src/data/worker-entry';
import {
  createWorkerCancelRequest,
  createWorkerOkResponse,
  createWorkerRequest,
  type WorkerRequestMessage,
  type WorkerResponseMessage
} from '../src/data/worker-protocol';

class MockWorkerScope implements WorkerEntrypointScope {
  public readonly messages: WorkerResponseMessage[] = [];
  private readonly listeners: Array<(event: { data: unknown }) => void | Promise<void>> = [];

  public addEventListener(type: 'message', listener: (event: { data: unknown }) => void | Promise<void>): void {
    if (type === 'message') {
      this.listeners.push(listener);
    }
  }

  public postMessage(message: unknown): void {
    this.messages.push(message as WorkerResponseMessage);
  }

  public async emit(message: WorkerRequestMessage | unknown): Promise<void> {
    for (let index = 0; index < this.listeners.length; index += 1) {
      await this.listeners[index]({ data: message });
    }
  }
}

function getOkResult<TResult>(message: WorkerResponseMessage): TResult {
  if (message.status !== 'ok') {
    throw new Error('Expected ok response');
  }

  return message.result as TResult;
}

describe('Worker entry', () => {
  it('routes matching operations and posts the handler response', async () => {
    const scope = new MockWorkerScope();
    const listener = createWorkerEntrypointListener(scope, {
      operationType: 'sort',
      execute: async (request) => createWorkerOkResponse(request.opId, { opId: request.opId, mapping: new Int32Array([1, 0]) })
    });
    scope.addEventListener('message', listener);

    await scope.emit(
      createWorkerRequest('sort-1', 'sort', {
        rows: [{ id: 1 }, { id: 2 }]
      })
    );

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('ok');
    const result = getOkResult<{ opId: string; mapping: Int32Array }>(scope.messages[0]);
    expect(Array.from(result.mapping)).toEqual([1, 0]);
  });

  it('posts an error for unsupported worker operations', async () => {
    const scope = new MockWorkerScope();
    const listener = createWorkerEntrypointListener(scope, {
      operationType: 'filter',
      execute: async (request) => createWorkerOkResponse(request.opId, { opId: request.opId, mapping: new Int32Array([0]) })
    });
    scope.addEventListener('message', listener);

    await scope.emit(createWorkerRequest('pivot-1', 'pivot', { rows: [] }));

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('error');
    if (scope.messages[0].status !== 'error') {
      throw new Error('Expected error response');
    }
    expect(scope.messages[0].result.code).toBe('WORKER_UNSUPPORTED_OPERATION');
  });

  it('overrides stale ok results to canceled after a cancel message', async () => {
    const scope = new MockWorkerScope();
    const listener = createWorkerEntrypointListener(scope, {
      operationType: 'group',
      execute: async (request) => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        return createWorkerOkResponse(request.opId, {
          opId: request.opId,
          rows: []
        });
      }
    });
    scope.addEventListener('message', listener);

    const pending = scope.emit(createWorkerRequest('group-1', 'group', { rows: [] }));
    await scope.emit(createWorkerCancelRequest('group-1'));
    await pending;

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0]).toEqual({
      opId: 'group-1',
      status: 'canceled',
      result: null
    });
  });

  it('ignores malformed messages', async () => {
    const scope = new MockWorkerScope();
    const listener = createWorkerEntrypointListener(scope, {
      operationType: 'tree',
      execute: async (request) => createWorkerOkResponse(request.opId, { opId: request.opId, rows: [] })
    });
    scope.addEventListener('message', listener);

    await scope.emit({ opId: '', type: 'tree' });

    expect(scope.messages).toEqual([]);
  });
});
