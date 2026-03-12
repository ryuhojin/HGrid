import { afterEach, describe, expect, it } from 'vitest';
import { Grid } from '../src/core/grid';
import { createWorkerOkResponse, type WorkerRequestMessage } from '../src/data/worker-protocol';

interface DictionaryEncodedValues {
  kind: 'dictionary';
  dictionary: unknown[];
  codes: Uint32Array;
}

function isDictionaryEncodedValues(values: unknown): values is DictionaryEncodedValues {
  if (!values || typeof values !== 'object' || !('kind' in values) || values.kind !== 'dictionary') {
    return false;
  }

  const candidate = values as Partial<DictionaryEncodedValues>;
  return Array.isArray(candidate.dictionary) && candidate.codes instanceof Uint32Array;
}

function decodeWorkerColumnValues(values: unknown): unknown[] | null {
  if (Array.isArray(values)) {
    return values;
  }

  if (values instanceof Float64Array || values instanceof Int32Array) {
    return Array.from(values);
  }

  if (isDictionaryEncodedValues(values)) {
    return Array.from(values.codes, (code) => values.dictionary[code]);
  }

  return null;
}

class MockSortWorker {
  private readonly listeners: Record<string, Array<(event: { data?: unknown; message?: string }) => void>> = {
    message: [],
    error: []
  };
  public static urls: string[] = [];
  public static requests: WorkerRequestMessage[] = [];

  public constructor(url: string) {
    MockSortWorker.urls.push(url);
  }

  public addEventListener(type: string, listener: (event: { data?: unknown; message?: string }) => void): void {
    this.listeners[type] ??= [];
    this.listeners[type].push(listener);
  }

  public removeEventListener(type: string, listener: (event: { data?: unknown; message?: string }) => void): void {
    const bucket = this.listeners[type];
    if (!bucket) {
      return;
    }

    const index = bucket.indexOf(listener);
    if (index >= 0) {
      bucket.splice(index, 1);
    }
  }

  public postMessage(message: unknown): void {
    const request = message as WorkerRequestMessage;
    MockSortWorker.requests.push(request);
    if (request.type === 'sort') {
      setTimeout(() => {
        const bucket = this.listeners.message;
        for (let index = 0; index < bucket.length; index += 1) {
          bucket[index]({
            data: createWorkerOkResponse(request.opId, {
              opId: request.opId,
              mapping: new Int32Array([2, 1, 0])
            })
          });
        }
      }, 0);
      return;
    }

    if (request.type === 'filter') {
      setTimeout(() => {
        const bucket = this.listeners.message;
        for (let index = 0; index < bucket.length; index += 1) {
          bucket[index]({
            data: createWorkerOkResponse(request.opId, {
              opId: request.opId,
              mapping: new Int32Array([1])
            })
          });
        }
      }, 0);
      return;
    }

    if (request.type === 'group') {
      setTimeout(() => {
        const bucket = this.listeners.message;
        for (let index = 0; index < bucket.length; index += 1) {
          bucket[index]({
            data: createWorkerOkResponse(request.opId, {
              opId: request.opId,
              rows: [
                {
                  kind: 'group',
                  groupKey: 'region=string:KR',
                  level: 0,
                  columnId: 'region',
                  value: 'KR',
                  leafCount: 2,
                  isExpanded: true,
                  values: {
                    region: 'Region: KR (2)'
                  }
                },
                {
                  kind: 'data',
                  dataIndex: 0
                },
                {
                  kind: 'data',
                  dataIndex: 1
                },
                {
                  kind: 'group',
                  groupKey: 'region=string:US',
                  level: 0,
                  columnId: 'region',
                  value: 'US',
                  leafCount: 1,
                  isExpanded: true,
                  values: {
                    region: 'Region: US (1)'
                  }
                },
                {
                  kind: 'data',
                  dataIndex: 2
                }
              ],
              groupKeys: ['region=string:KR', 'region=string:US'],
              groupLeafDataIndexesByKey: {
                'region=string:KR': [0, 1],
                'region=string:US': [2]
              }
            })
          });
        }
      }, 0);
      return;
    }

    if (request.type === 'pivot') {
      setTimeout(() => {
        const bucket = this.listeners.message;
        for (let index = 0; index < bucket.length; index += 1) {
          bucket[index]({
            data: createWorkerOkResponse(request.opId, {
              opId: request.opId,
              columns: [
                { id: 'region', header: 'Region', width: 160, type: 'text', visible: true, editable: false },
                { id: '__pivot_1_Jan_sales_custom_1', header: 'Jan (custom)', width: 120, type: 'number', visible: true, editable: false },
                { id: '__pivot_2_Feb_sales_custom_1', header: 'Feb (custom)', width: 120, type: 'number', visible: true, editable: false }
              ],
              rows: [
                { __pivot_row_key: 'region=string:KR', region: 'KR' },
                { __pivot_row_key: 'region=string:US', region: 'US' }
              ],
              rowGroupColumnIds: ['region'],
              pivotColumnCount: 2,
              pivotKeyCount: 2,
              sourceRowCount: 3,
              customValueDataIndexesByCell: [
                {
                  rowKey: 'region=string:KR',
                  columnId: '__pivot_1_Jan_sales_custom_1',
                  valueColumnId: 'sales',
                  pivotLabel: 'Jan',
                  dataIndexes: [0, 1]
                },
                {
                  rowKey: 'region=string:US',
                  columnId: '__pivot_2_Feb_sales_custom_1',
                  valueColumnId: 'sales',
                  pivotLabel: 'Feb',
                  dataIndexes: [2]
                }
              ]
            })
          });
        }
      }, 0);
    }
  }

  public terminate(): void {}
}

const originalWorker = globalThis.Worker;

afterEach(() => {
  MockSortWorker.urls = [];
  MockSortWorker.requests = [];
  document.head.querySelectorAll('script[src*="grid.umd.js"]').forEach((element) => element.remove());
  if (originalWorker === undefined) {
    // @ts-expect-error restoring undefined Worker
    globalThis.Worker = undefined;
  } else {
    globalThis.Worker = originalWorker;
  }
});

describe('Grid worker runtime', () => {
  it('prewarms operation workers during grid construction when configured', () => {
    globalThis.Worker = MockSortWorker as unknown as typeof Worker;
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/hgrid/grid.umd.js';
    document.head.appendChild(script);

    const container = document.createElement('div');
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 160, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' },
        { id: 3, name: 'Gamma' }
      ],
      workerRuntime: {
        prewarm: true,
        timeoutMs: 500,
        largeDataThreshold: 2
      }
    });

    expect(MockSortWorker.urls).toEqual([
      'https://cdn.example.com/hgrid/sort.worker.js',
      'https://cdn.example.com/hgrid/filter.worker.js',
      'https://cdn.example.com/hgrid/group.worker.js',
      'https://cdn.example.com/hgrid/pivot.worker.js',
      'https://cdn.example.com/hgrid/tree.worker.js'
    ]);

    grid.destroy();
    script.remove();
  });

  it('prewarms the configured worker pool size during grid construction', () => {
    globalThis.Worker = MockSortWorker as unknown as typeof Worker;
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/hgrid/grid.umd.js';
    document.head.appendChild(script);

    const container = document.createElement('div');
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 160, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' },
        { id: 3, name: 'Gamma' }
      ],
      workerRuntime: {
        prewarm: true,
        poolSize: 2,
        timeoutMs: 500,
        largeDataThreshold: 2
      }
    });

    expect(MockSortWorker.urls).toEqual([
      'https://cdn.example.com/hgrid/sort.worker.js',
      'https://cdn.example.com/hgrid/sort.worker.js',
      'https://cdn.example.com/hgrid/filter.worker.js',
      'https://cdn.example.com/hgrid/filter.worker.js',
      'https://cdn.example.com/hgrid/group.worker.js',
      'https://cdn.example.com/hgrid/group.worker.js',
      'https://cdn.example.com/hgrid/pivot.worker.js',
      'https://cdn.example.com/hgrid/pivot.worker.js',
      'https://cdn.example.com/hgrid/tree.worker.js',
      'https://cdn.example.com/hgrid/tree.worker.js'
    ]);

    grid.destroy();
    script.remove();
  });

  it('uses inferred worker assets automatically when row count reaches the large-data threshold', async () => {
    globalThis.Worker = MockSortWorker as unknown as typeof Worker;
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/hgrid/grid.umd.js';
    document.head.appendChild(script);

    const container = document.createElement('div');
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 160, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' },
        { id: 3, name: 'Gamma' }
      ],
      workerRuntime: {
        timeoutMs: 500,
        largeDataThreshold: 2
      }
    });

    await grid.setSortModel([{ columnId: 'id', direction: 'asc' }]);
    const result = await grid.exportCsv({
      includeHeaders: false
    });

    expect(MockSortWorker.urls).toEqual(['https://cdn.example.com/hgrid/sort.worker.js']);
    expect(result.content).toBe('3,Gamma\n2,Beta\n1,Alpha');

    grid.destroy();
    script.remove();
  });

  it('does not send an identity sourceOrder payload for unsorted worker filters', async () => {
    globalThis.Worker = MockSortWorker as unknown as typeof Worker;
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/hgrid/grid.umd.js';
    document.head.appendChild(script);

    const container = document.createElement('div');
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'status', header: 'Status', width: 160, type: 'text' }
      ],
      rowData: [
        { id: 1, status: 'hold' },
        { id: 2, status: 'active' },
        { id: 3, status: 'hold' }
      ],
      workerRuntime: {
        timeoutMs: 500,
        largeDataThreshold: 2
      }
    });

    await grid.setFilterModel({
      status: {
        kind: 'set',
        values: ['active']
      }
    });

    const filterRequests = MockSortWorker.requests.filter((request) => request.type === 'filter' && 'payload' in request);
    const latestFilterRequest = filterRequests[filterRequests.length - 1] as WorkerRequestMessage & {
      payload: {
        sourceOrder?: Int32Array | number[];
      };
    };

    expect(latestFilterRequest.payload.sourceOrder).toBeUndefined();

    grid.destroy();
    script.remove();
  });

  it('reuses cached valueGetter projections between worker sorts and invalidates them after row replacement', async () => {
    globalThis.Worker = MockSortWorker as unknown as typeof Worker;
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/hgrid/grid.umd.js';
    document.head.appendChild(script);

    let valueGetterCallCount = 0;
    const container = document.createElement('div');
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'firstName', header: 'First Name', width: 160, type: 'text' },
        { id: 'lastName', header: 'Last Name', width: 160, type: 'text' },
        {
          id: 'fullName',
          header: 'Full Name',
          width: 220,
          type: 'text',
          visible: false,
          valueGetter: (row) => {
            valueGetterCallCount += 1;
            return `${String(row.firstName)} ${String(row.lastName)}`;
          }
        }
      ],
      rowData: [
        { id: 1, firstName: 'Ada', lastName: 'Lovelace' },
        { id: 2, firstName: 'Grace', lastName: 'Hopper' },
        { id: 3, firstName: 'Alan', lastName: 'Turing' }
      ],
      workerRuntime: {
        timeoutMs: 500,
        largeDataThreshold: 2
      }
    });

    valueGetterCallCount = 0;
    await grid.setSortModel([{ columnId: 'fullName', direction: 'asc' }]);
    expect(valueGetterCallCount).toBe(3);

    await grid.setSortModel([{ columnId: 'fullName', direction: 'desc' }]);
    expect(valueGetterCallCount).toBe(3);

    const callCountBeforeReplacement = valueGetterCallCount;
    grid.setOptions({
      rowData: [
        { id: 1, firstName: 'Katherine', lastName: 'Johnson' },
        { id: 2, firstName: 'Dorothy', lastName: 'Vaughan' },
        { id: 3, firstName: 'Margaret', lastName: 'Hamilton' }
      ]
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(valueGetterCallCount).toBeGreaterThan(callCountBeforeReplacement);

    const sortRequests = MockSortWorker.requests.filter((request) => request.type === 'sort' && 'payload' in request);
    const latestSortRequest = sortRequests[sortRequests.length - 1] as WorkerRequestMessage & {
      payload: {
        columnValuesById?: Record<string, unknown>;
      };
    };

    expect(decodeWorkerColumnValues(latestSortRequest.payload.columnValuesById?.fullName)).toEqual([
      'Katherine Johnson',
      'Dorothy Vaughan',
      'Margaret Hamilton'
    ]);
    expect(latestSortRequest.payload.columnValuesById?.fullName).toMatchObject({
      kind: 'dictionary'
    });

    grid.destroy();
    script.remove();
  });

  it('hydrates custom grouping reducers from worker leaf indexes on the main thread', async () => {
    globalThis.Worker = MockSortWorker as unknown as typeof Worker;
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/hgrid/grid.umd.js';
    document.head.appendChild(script);

    const container = document.createElement('div');
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'region', header: 'Region', width: 160, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      rowData: [
        { id: 1, region: 'KR', score: 10 },
        { id: 2, region: 'KR', score: 15 },
        { id: 3, region: 'US', score: 20 }
      ],
      workerRuntime: {
        timeoutMs: 500,
        largeDataThreshold: 2
      },
      height: 160,
      rowHeight: 28
    });

    await grid.setGroupAggregations([
      {
        columnId: 'score',
        reducer: (values) => values.reduce<number>((sum, value) => sum + Number(value ?? 0), 0) * 2
      }
    ]);
    await grid.setGroupModel([{ columnId: 'region' }]);

    const groupedRows = grid.getGroupedRowsSnapshot();
    expect(groupedRows[0]).toMatchObject({
      kind: 'group',
      groupKey: 'region=string:KR'
    });
    if (groupedRows[0]?.kind !== 'group') {
      throw new Error('Expected grouped row');
    }
    expect(groupedRows[0].values.score).toBe(50);
    expect(groupedRows[3]).toMatchObject({
      kind: 'group',
      groupKey: 'region=string:US'
    });
    if (groupedRows[3]?.kind !== 'group') {
      throw new Error('Expected grouped row');
    }
    expect(groupedRows[3].values.score).toBe(40);

    grid.destroy();
    script.remove();
  });

  it('hydrates custom pivot reducers from worker cell indexes on the main thread', async () => {
    globalThis.Worker = MockSortWorker as unknown as typeof Worker;
    const script = document.createElement('script');
    script.src = 'https://cdn.example.com/hgrid/grid.umd.js';
    document.head.appendChild(script);

    const container = document.createElement('div');
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'region', header: 'Region', width: 160, type: 'text' },
        { id: 'month', header: 'Month', width: 140, type: 'text' },
        { id: 'sales', header: 'Sales', width: 120, type: 'number' }
      ],
      rowData: [
        { id: 1, region: 'KR', month: 'Jan', sales: 100 },
        { id: 2, region: 'KR', month: 'Jan', sales: 40 },
        { id: 3, region: 'US', month: 'Feb', sales: 30 }
      ],
      workerRuntime: {
        timeoutMs: 500,
        largeDataThreshold: 2
      },
      height: 160,
      rowHeight: 28
    });

    await grid.setGroupModel([{ columnId: 'region' }]);
    await grid.setPivotingMode('client');
    await grid.setPivotModel([{ columnId: 'month' }]);
    await grid.setPivotValues([
      {
        columnId: 'sales',
        reducer: (values) => values.reduce<number>((sum, value) => sum + Number(value ?? 0), 0) * 2
      }
    ]);

    const result = await grid.exportCsv({ includeHeaders: false });
    expect(result.content).toContain('KR,280');
    expect(result.content).toContain('US,,60');

    grid.destroy();
    script.remove();
  });
});
