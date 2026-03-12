import { describe, expect, it } from 'vitest';
import { WorkerOperationDispatcher, type WorkerOperationWorker } from '../src/data/worker-operation-dispatcher';
import {
  createWorkerCanceledResponse,
  createWorkerOkResponse,
  type WorkerRequestMessage,
  type WorkerResponseMessage
} from '../src/data/worker-protocol';

class MockWorker implements WorkerOperationWorker {
  public readonly posted: Array<{ message: unknown; transfer?: Transferable[] }> = [];
  public terminated = false;
  private readonly listeners: Record<string, Array<(event: { data?: unknown; message?: string; error?: unknown }) => void>> = {
    message: [],
    error: []
  };

  public constructor(
    private readonly onPostMessage?: (
      message: WorkerRequestMessage,
      worker: MockWorker,
      transfer?: Transferable[]
    ) => void
  ) {}

  public addEventListener(
    type: string,
    listener: (event: { data?: unknown; message?: string; error?: unknown }) => void
  ): void {
    this.listeners[type] ??= [];
    this.listeners[type].push(listener);
  }

  public removeEventListener(
    type: string,
    listener: (event: { data?: unknown; message?: string; error?: unknown }) => void
  ): void {
    const bucket = this.listeners[type];
    if (!bucket) {
      return;
    }

    const index = bucket.indexOf(listener);
    if (index >= 0) {
      bucket.splice(index, 1);
    }
  }

  public postMessage(message: unknown, transfer?: Transferable[]): void {
    this.posted.push({ message, transfer });
    this.onPostMessage?.(message as WorkerRequestMessage, this, transfer);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public emitMessage(message: WorkerResponseMessage): void {
    const bucket = this.listeners.message;
    for (let index = 0; index < bucket.length; index += 1) {
      bucket[index]({ data: message });
    }
  }

  public emitError(message: string): void {
    const bucket = this.listeners.error;
    for (let index = 0; index < bucket.length; index += 1) {
      bucket[index]({ message });
    }
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('WorkerOperationDispatcher', () => {
  it('falls back to the cooperative executor for low-volume operations', async () => {
    let fallbackCount = 0;
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'sort',
      fallbackExecutor: {
        execute: async () => {
          fallbackCount += 1;
          return createWorkerOkResponse('sort-1', { ok: true });
        }
      },
      serializeRequest: () => ({ rows: [] }),
      getRuntimeOptions: () => ({
        assetUrl: '/sort.worker.js'
      })
    });

    const response = await dispatcher.execute({ opId: 'sort-1', rowCount: 99_999 });

    expect(fallbackCount).toBe(1);
    expect(response.status).toBe('ok');
  });

  it('dispatches 100k+ operations to a worker and posts transferable buffers', async () => {
    const workers: MockWorker[] = [];
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'filter',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('filter-1', { ok: false })
      },
      serializeRequest: () => ({
        sourceOrder: new Int32Array([2, 0, 1])
      }),
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/filter.worker.js',
        timeoutMs: 1000
      }),
      createWorker: () => {
        const worker = new MockWorker((message, currentWorker) => {
          if (message.type === 'filter') {
            currentWorker.emitMessage(
              createWorkerOkResponse(message.opId, {
                opId: message.opId,
                mapping: new Int32Array([2, 0, 1])
              })
            );
          }
        });
        workers.push(worker);
        return worker;
      }
    });

    const response = await dispatcher.execute({ opId: 'filter-1', rowCount: 100_000 });

    expect(workers).toHaveLength(1);
    expect(response.status).toBe('ok');
    expect(workers[0].posted[0].transfer).toHaveLength(1);
    expect(workers[0].posted[0].transfer?.[0]).toBeInstanceOf(ArrayBuffer);
  });

  it('prewarms a worker once when runtime is enabled and an asset URL is resolved', () => {
    const workers: MockWorker[] = [];
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'sort',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('sort-prewarm', { ok: true })
      },
      serializeRequest: () => ({
        rows: []
      }),
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/sort.worker.js'
      }),
      createWorker: () => {
        const worker = new MockWorker();
        workers.push(worker);
        return worker;
      }
    });

    expect(dispatcher.prewarm()).toBe(true);
    expect(dispatcher.prewarm()).toBe(true);
    expect(workers).toHaveLength(1);
  });

  it('prewarms an entire worker pool when poolSize is configured', () => {
    const workers: MockWorker[] = [];
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'sort',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('sort-prewarm-pool', { ok: true })
      },
      serializeRequest: () => ({
        rows: []
      }),
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/sort.worker.js',
        poolSize: 2
      }),
      createWorker: () => {
        const worker = new MockWorker();
        workers.push(worker);
        return worker;
      }
    });

    expect(dispatcher.prewarm()).toBe(true);
    expect(dispatcher.prewarm()).toBe(true);
    expect(workers).toHaveLength(2);
  });

  it('returns an error for large operations when worker is required and no asset URL is configured', async () => {
    let fallbackCount = 0;
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'sort',
      fallbackExecutor: {
        execute: async () => {
          fallbackCount += 1;
          return createWorkerOkResponse('sort-asset-missing', { ok: false });
        }
      },
      serializeRequest: () => ({ rows: [] }),
      getRuntimeOptions: () => ({
        enabled: true
      })
    });

    const response = await dispatcher.execute({ opId: 'sort-asset-missing', rowCount: 100_000 });

    expect(fallbackCount).toBe(0);
    expect(response.status).toBe('error');
    if (response.status !== 'error') {
      throw new Error('Expected error response');
    }
    expect(response.result.code).toBe('WORKER_ASSET_URL_REQUIRED');
  });

  it('allows explicit main-thread fallback for large operations', async () => {
    let fallbackCount = 0;
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'group',
      fallbackExecutor: {
        execute: async () => {
          fallbackCount += 1;
          return createWorkerOkResponse('group-fallback', { ok: true });
        }
      },
      serializeRequest: () => null,
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/group.worker.js',
        allowMainThreadFallback: true
      })
    });

    const response = await dispatcher.execute({ opId: 'group-fallback', rowCount: 100_000 });

    expect(fallbackCount).toBe(1);
    expect(response.status).toBe('ok');
  });

  it('cancels before posting to the worker when async serialization is invalidated', async () => {
    let canceled = false;
    const workers: MockWorker[] = [];
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'sort',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('sort-serialize-cancel', { mapping: new Int32Array([0]) })
      },
      serializeRequest: async (_request, context) => {
        await context.yieldControl?.();
        canceled = true;
        await context.yieldControl?.();
        return {
          rows: []
        };
      },
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/sort.worker.js',
        timeoutMs: 1000
      }),
      createWorker: () => {
        const worker = new MockWorker();
        workers.push(worker);
        return worker;
      }
    });

    const response = await dispatcher.execute(
      { opId: 'sort-serialize-cancel', rowCount: 100_000 },
      {
        isCanceled: () => canceled
      }
    );

    expect(response).toEqual({
      opId: 'sort-serialize-cancel',
      status: 'canceled',
      result: null
    });
    expect(workers).toHaveLength(0);
  });

  it('sends cancel to the worker when the context becomes canceled', async () => {
    let canceled = false;
    let sawCancel = false;
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'group',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('group-1', { rows: [] })
      },
      serializeRequest: () => ({
        rows: []
      }),
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/group.worker.js',
        timeoutMs: 1000
      }),
      createWorker: () =>
        new MockWorker((message, worker) => {
          if (message.type === 'cancel') {
            sawCancel = true;
            worker.emitMessage(createWorkerCanceledResponse(message.opId));
          }
        })
    });

    const pending = dispatcher.execute(
      { opId: 'group-1', rowCount: 100_000 },
      {
        isCanceled: () => canceled
      }
    );

    await flushAsyncWork();
    canceled = true;
    const response = await pending;

    expect(sawCancel).toBe(true);
    expect(response).toEqual({
      opId: 'group-1',
      status: 'canceled',
      result: null
    });
  });

  it('treats a late ok response as canceled after cancel was requested', async () => {
    let workerRef: MockWorker | undefined;
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'group',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('group-race', { rows: [] })
      },
      serializeRequest: () => ({
        rows: []
      }),
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/group.worker.js',
        timeoutMs: 1000
      }),
      createWorker: () => {
        workerRef = new MockWorker((message, worker) => {
          if (message.type !== 'group') {
            return;
          }

          setTimeout(() => {
            worker.emitMessage(
              createWorkerOkResponse(message.opId, {
                rows: ['late-ok']
              })
            );
          }, 10);
        });
        return workerRef;
      }
    });

    const pending = dispatcher.execute({ opId: 'group-race', rowCount: 100_000 });
    await flushAsyncWork();
    dispatcher.cancel('group-race');
    const response = await pending;

    expect(workerRef?.posted.some((entry) => (entry.message as WorkerRequestMessage).type === 'cancel')).toBe(true);
    expect(response).toEqual({
      opId: 'group-race',
      status: 'canceled',
      result: null
    });
  });

  it('recreates the worker on the next operation after a crash', async () => {
    const workers: MockWorker[] = [];
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'sort',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('sort-retry', { mapping: new Int32Array([0, 1, 2]) })
      },
      serializeRequest: () => ({
        rows: []
      }),
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/sort.worker.js',
        timeoutMs: 1000
      }),
      createWorker: () => {
        const worker = new MockWorker((message, currentWorker) => {
          if (message.type !== 'sort') {
            return;
          }

          if (workers.length === 1) {
            currentWorker.emitError('sort worker crashed');
            return;
          }

          currentWorker.emitMessage(
            createWorkerOkResponse(message.opId, {
              mapping: new Int32Array([2, 1, 0])
            })
          );
        });
        workers.push(worker);
        return worker;
      }
    });

    const crashedResponse = await dispatcher.execute({ opId: 'sort-retry-1', rowCount: 100_000 });
    expect(crashedResponse.status).toBe('error');
    if (crashedResponse.status !== 'error') {
      throw new Error('Expected error response');
    }
    expect(crashedResponse.result.code).toBe('WORKER_RUNTIME_ERROR');
    expect(workers[0].terminated).toBe(true);

    const recoveredResponse = await dispatcher.execute({ opId: 'sort-retry-2', rowCount: 100_000 });
    expect(recoveredResponse.status).toBe('ok');
    expect(workers).toHaveLength(2);
    expect(workers[1].terminated).toBe(false);
  });

  it('distributes concurrent operations across worker pool slots', async () => {
    const workers: MockWorker[] = [];
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'sort',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('sort-pool', { mapping: new Int32Array([0]) })
      },
      serializeRequest: () => ({
        rows: []
      }),
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/sort.worker.js',
        timeoutMs: 1000,
        poolSize: 2
      }),
      createWorker: () => {
        const worker = new MockWorker();
        workers.push(worker);
        return worker;
      }
    });

    const firstPending = dispatcher.execute({ opId: 'sort-pool-1', rowCount: 100_000 });
    const secondPending = dispatcher.execute({ opId: 'sort-pool-2', rowCount: 100_000 });
    await flushAsyncWork();

    expect(workers).toHaveLength(2);
    expect((workers[0].posted[0].message as WorkerRequestMessage).opId).toBe('sort-pool-1');
    expect((workers[1].posted[0].message as WorkerRequestMessage).opId).toBe('sort-pool-2');

    workers[0].emitMessage(createWorkerOkResponse('sort-pool-1', { mapping: new Int32Array([0]) }));
    workers[1].emitMessage(createWorkerOkResponse('sort-pool-2', { mapping: new Int32Array([0]) }));

    const [firstResponse, secondResponse] = await Promise.all([firstPending, secondPending]);
    expect(firstResponse.status).toBe('ok');
    expect(secondResponse.status).toBe('ok');
  });

  it('isolates worker crashes to the affected pool slot', async () => {
    const workers: MockWorker[] = [];
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'sort',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('sort-pool-crash', { mapping: new Int32Array([0]) })
      },
      serializeRequest: () => ({
        rows: []
      }),
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/sort.worker.js',
        timeoutMs: 1000,
        poolSize: 2
      }),
      createWorker: () => {
        const worker = new MockWorker();
        workers.push(worker);
        return worker;
      }
    });

    const firstPending = dispatcher.execute({ opId: 'sort-pool-crash-1', rowCount: 100_000 });
    const secondPending = dispatcher.execute({ opId: 'sort-pool-crash-2', rowCount: 100_000 });
    await flushAsyncWork();

    workers[0].emitError('sort pool slot crashed');
    workers[1].emitMessage(createWorkerOkResponse('sort-pool-crash-2', { mapping: new Int32Array([2, 1, 0]) }));

    const [firstResponse, secondResponse] = await Promise.all([firstPending, secondPending]);
    expect(firstResponse.status).toBe('error');
    if (firstResponse.status !== 'error') {
      throw new Error('Expected error response');
    }
    expect(firstResponse.result.code).toBe('WORKER_RUNTIME_ERROR');
    expect(secondResponse.status).toBe('ok');
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].terminated).toBe(false);
  });

  it('returns a timeout error and ignores a late worker response', async () => {
    let workerRef: MockWorker | undefined;
    const dispatcher = new WorkerOperationDispatcher({
      operationType: 'pivot',
      fallbackExecutor: {
        execute: async () => createWorkerOkResponse('pivot-1', { rows: [] })
      },
      serializeRequest: () => ({
        rows: []
      }),
      getRuntimeOptions: () => ({
        enabled: true,
        assetUrl: '/pivot.worker.js',
        timeoutMs: 10
      }),
      createWorker: () => {
        workerRef = new MockWorker();
        return workerRef;
      }
    });

    const response = await dispatcher.execute({ opId: 'pivot-1', rowCount: 100_000 });
    if (workerRef) {
      workerRef.emitMessage(createWorkerOkResponse('pivot-1', { rows: ['late'] }));
    }

    expect(response.status).toBe('error');
    if (response.status !== 'error') {
      throw new Error('Expected error response');
    }
    expect(response.result.code).toBe('WORKER_TIMEOUT');
  });
});
