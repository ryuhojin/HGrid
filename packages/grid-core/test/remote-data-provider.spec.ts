import { describe, expect, it } from 'vitest';
import {
  Grid,
  GROUP_ROW_COLUMN_ID_FIELD,
  GROUP_ROW_KIND_FIELD,
  TREE_ROW_DEPTH_FIELD,
  TREE_ROW_KIND_FIELD,
  TREE_ROW_NODE_KEY_FIELD
} from '../src';
import {
  RemoteDataProvider,
  type RemoteBlockRequest,
  type RemoteBlockResponse,
  type RemoteDataSource,
  type RemoteServerSideRowMetadata
} from '../src/data/remote-data-provider';
import type { RemoteServerSideQueryModel } from '../src/data/remote-server-side-contracts';

function createRows(startIndex: number, endIndex: number): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let dataIndex = startIndex; dataIndex < endIndex; dataIndex += 1) {
    rows.push({
      id: dataIndex + 1,
      name: `Remote-${dataIndex + 1}`,
      status: dataIndex % 2 === 0 ? 'active' : 'idle'
    });
  }

  return rows;
}

function cloneRequestWithoutSignal(request: RemoteBlockRequest): Omit<RemoteBlockRequest, 'signal'> {
  return {
    startIndex: request.startIndex,
    endIndex: request.endIndex,
    operationId: request.operationId,
    queryModel: JSON.parse(JSON.stringify(request.queryModel))
  };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }

    await flushAsync();
    await waitForFrame();
  }

  throw new Error('Timed out waiting for condition');
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolveFn: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolveFn = resolve;
  });

  return {
    promise,
    resolve(value: T) {
      if (!resolveFn) {
        throw new Error('Deferred resolver is not initialized');
      }
      resolveFn(value);
    }
  };
}

describe('RemoteDataProvider', () => {
  it('loads remote blocks and notifies listeners', async () => {
    const requests: Array<Omit<RemoteBlockRequest, 'signal'>> = [];
    const dataSource: RemoteDataSource = {
      async fetchBlock(request) {
        requests.push(cloneRequestWithoutSignal(request));
        return {
          rows: createRows(request.startIndex, request.endIndex),
          totalRowCount: 200
        };
      }
    };

    const provider = new RemoteDataProvider({
      dataSource,
      rowCount: 200,
      cache: {
        blockSize: 10,
        maxBlocks: 3,
        prefetchBlocks: 0
      }
    });

    let changeCount = 0;
    provider.onRowsChanged(() => {
      changeCount += 1;
    });

    expect(provider.getValue(0, 'name')).toBeUndefined();
    await flushAsync();

    expect(provider.getValue(0, 'name')).toBe('Remote-1');
    expect(provider.getRowKey(0)).toBe(1);
    expect(requests.length).toBe(1);
    expect(changeCount).toBeGreaterThan(0);
  });

  it('applies LRU eviction for block cache', async () => {
    const dataSource: RemoteDataSource = {
      async fetchBlock(request) {
        return {
          rows: createRows(request.startIndex, request.endIndex)
        };
      }
    };

    const provider = new RemoteDataProvider({
      dataSource,
      rowCount: 40,
      cache: {
        blockSize: 5,
        maxBlocks: 2,
        prefetchBlocks: 0
      }
    });

    provider.getValue(0, 'id');
    await flushAsync();
    provider.getValue(7, 'id');
    await flushAsync();
    provider.getValue(14, 'id');
    await flushAsync();

    const debugState = provider.getDebugState();
    expect(debugState.cachedBlockIndexes).toEqual([1, 2]);
  });

  it('prefetches adjacent blocks using scroll direction', async () => {
    const requests: Array<Omit<RemoteBlockRequest, 'signal'>> = [];
    const dataSource: RemoteDataSource = {
      async fetchBlock(request) {
        requests.push(cloneRequestWithoutSignal(request));
        return {
          rows: createRows(request.startIndex, request.endIndex)
        };
      }
    };

    const provider = new RemoteDataProvider({
      dataSource,
      rowCount: 100,
      cache: {
        blockSize: 4,
        maxBlocks: 8,
        prefetchBlocks: 1
      }
    });

    provider.getValue(8, 'id');
    await flushAsync();
    expect(requests.some((request) => request.startIndex === 8)).toBe(true);
    expect(requests.some((request) => request.startIndex === 12)).toBe(true);

    provider.getValue(3, 'id');
    await flushAsync();
    expect(requests.some((request) => request.startIndex === 0)).toBe(true);
  });

  it('invalidates cache when query model changes and forwards query to server', async () => {
    const requests: Array<Omit<RemoteBlockRequest, 'signal'>> = [];
    const dataSource: RemoteDataSource = {
      async fetchBlock(request) {
        requests.push(cloneRequestWithoutSignal(request));
        return {
          rows: createRows(request.startIndex, request.endIndex)
        };
      }
    };

    const provider = new RemoteDataProvider({
      dataSource,
      rowCount: 64,
      cache: {
        blockSize: 8,
        maxBlocks: 4,
        prefetchBlocks: 0
      }
    });

    provider.getValue(0, 'id');
    await flushAsync();

    provider.setQueryModel({
      sortModel: [{ columnId: 'name', direction: 'desc' }],
      filterModel: {
        status: {
          type: 'set',
          values: ['active']
        }
      },
      pivotModel: [{ columnId: 'status' }],
      pivotValues: [{ columnId: 'id', type: 'count' }]
    });

    provider.getValue(0, 'id');
    await flushAsync();

    const latestRequest = requests[requests.length - 1];
    expect(latestRequest.queryModel.sortModel).toEqual([{ columnId: 'name', direction: 'desc' }]);
    expect(latestRequest.queryModel.filterModel).toEqual({
      status: {
        type: 'set',
        values: ['active']
      }
    });
    expect(latestRequest.queryModel.pivotModel).toEqual([{ columnId: 'status' }]);
    expect(latestRequest.queryModel.pivotValues).toEqual([{ columnId: 'id', type: 'count' }]);
  });

  it('tracks query diff summary when query model changes', () => {
    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(): Promise<RemoteBlockResponse> {
          return {
            rows: []
          };
        }
      },
      rowCount: 10
    });

    provider.setQueryModel({
      sortModel: [{ columnId: 'name', direction: 'desc' }]
    });

    expect(provider.getLastQueryChange()).toEqual({
      scope: 'sort',
      changedKeys: ['sort'],
      invalidationPolicy: 'full'
    });
  });

  it('invalidates only targeted cached blocks', async () => {
    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          return {
            rows: createRows(request.startIndex, request.endIndex),
            totalRowCount: 30
          };
        }
      },
      rowCount: 30,
      cache: {
        blockSize: 5,
        maxBlocks: 8,
        prefetchBlocks: 0
      }
    });

    provider.getValue(0, 'name');
    await flushAsync();
    provider.getValue(6, 'name');
    await flushAsync();
    provider.getValue(12, 'name');
    await flushAsync();

    provider.invalidateBlocks({
      startIndex: 5,
      endIndex: 10
    });

    expect(provider.getDebugState().cachedBlockIndexes).toEqual([0, 2]);
  });

  it('keeps stale rows visible during background refresh and exposes refreshing state', async () => {
    const refreshDeferred = createDeferred<RemoteBlockResponse>();
    let requestCount = 0;
    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          requestCount += 1;
          if (requestCount === 1) {
            return {
              rows: createRows(request.startIndex, request.endIndex).map((row) => ({
                ...row,
                revision: 'v1'
              })),
              totalRowCount: 20
            };
          }

          return refreshDeferred.promise;
        }
      },
      rowCount: 20,
      cache: {
        blockSize: 5,
        maxBlocks: 4,
        prefetchBlocks: 0
      }
    });

    provider.getValue(0, 'name');
    await flushAsync();
    expect(provider.getValue(0, 'revision')).toBe('v1');

    provider.refreshBlocks({
      startIndex: 0,
      endIndex: 5,
      background: true
    });

    expect(provider.getValue(0, 'revision')).toBe('v1');
    expect(provider.getDebugState().refreshingBlockIndexes).toEqual([0]);
    expect(provider.getBlockStates()).toEqual([
      {
        blockIndex: 0,
        startIndex: 0,
        endIndex: 5,
        status: 'refreshing',
        hasData: true,
        errorMessage: null
      }
    ]);

    refreshDeferred.resolve({
      rows: createRows(0, 5).map((row) => ({
        ...row,
        revision: 'v2'
      })),
      totalRowCount: 20
    });
    await flushAsync();

    expect(provider.getValue(0, 'revision')).toBe('v2');
    expect(provider.getDebugState().refreshingBlockIndexes).toEqual([]);
  });

  it('retries failed blocks while keeping stale rows available', async () => {
    let requestCount = 0;
    let shouldFailRefresh = false;
    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          requestCount += 1;
          if (requestCount === 1) {
            return {
              rows: createRows(request.startIndex, request.endIndex).map((row) => ({
                ...row,
                revision: 'v1'
              })),
              totalRowCount: 20
            };
          }

          if (shouldFailRefresh) {
            throw new Error('forced refresh failure');
          }

          return {
            rows: createRows(request.startIndex, request.endIndex).map((row) => ({
              ...row,
              revision: 'v2'
            })),
            totalRowCount: 20
          };
        }
      },
      rowCount: 20,
      cache: {
        blockSize: 5,
        maxBlocks: 4,
        prefetchBlocks: 0
      }
    });

    provider.getValue(0, 'name');
    await flushAsync();
    expect(provider.getValue(0, 'revision')).toBe('v1');

    shouldFailRefresh = true;
    provider.refreshBlocks({
      blockIndexes: [0],
      background: true
    });
    await flushAsync();

    expect(provider.getValue(0, 'revision')).toBe('v1');
    expect(provider.getDebugState().errorBlockIndexes).toEqual([0]);

    shouldFailRefresh = false;
    provider.retryFailedBlocks({
      blockIndexes: [0]
    });
    await flushAsync();

    expect(provider.getValue(0, 'revision')).toBe('v2');
    expect(provider.getDebugState().errorBlockIndexes).toEqual([]);
  });

  it('supports loading row policy', () => {
    const dataSource: RemoteDataSource = {
      async fetchBlock(_request): Promise<RemoteBlockResponse> {
        return { rows: [] };
      }
    };

    const skeletonProvider = new RemoteDataProvider({
      dataSource,
      rowCount: 10,
      cache: {
        blockSize: 5,
        maxBlocks: 2,
        prefetchBlocks: 0
      }
    });
    const noneProvider = new RemoteDataProvider({
      dataSource,
      rowCount: 10,
      loadingRowPolicy: 'none',
      cache: {
        blockSize: 5,
        maxBlocks: 2,
        prefetchBlocks: 0
      }
    });

    expect(skeletonProvider.isRowLoading(0)).toBe(true);
    expect(noneProvider.isRowLoading(0)).toBe(false);
  });

  it('clears optional query fields when explicitly set to undefined', () => {
    const dataSource: RemoteDataSource = {
      async fetchBlock(_request): Promise<RemoteBlockResponse> {
        return { rows: [] };
      }
    };

    const provider = new RemoteDataProvider({
      dataSource,
      rowCount: 10
    });

    provider.setQueryModel({
      groupModel: [{ columnId: 'status' }],
      pivotModel: [{ columnId: 'region' }],
      pivotValues: [{ columnId: 'id', type: 'count' }]
    });

    provider.setQueryModel({
      groupModel: undefined,
      pivotModel: undefined,
      pivotValues: undefined
    });

    const queryModel = provider.getQueryModel();
    expect(queryModel.groupModel).toBeUndefined();
    expect(queryModel.pivotModel).toBeUndefined();
    expect(queryModel.pivotValues).toBeUndefined();
  });

  it('forwards server-side row model contract fields and stores row metadata', async () => {
    const requests: Array<Omit<RemoteBlockRequest, 'signal'>> = [];
    const initialServerSideQuery: RemoteServerSideQueryModel = {
      schemaVersion: 'v2',
      requestKind: 'children',
      route: [
        { columnId: 'region', key: 'APAC' },
        { columnId: 'country', key: 'KR' }
      ],
      rootStoreStrategy: 'partial',
      childStoreStrategy: 'full'
    };
    const dataSource: RemoteDataSource = {
      async fetchBlock(request) {
        requests.push(cloneRequestWithoutSignal(request));
        return {
          rows: createRows(request.startIndex, request.endIndex),
          rowMetadata: [
            {
              kind: 'group',
              level: 1,
              childCount: 12,
              isExpandedByDefault: true,
              groupColumnId: 'country',
              groupKey: 'KR',
              route: initialServerSideQuery.route,
              aggregateValues: {
                totalScore: 240
              }
            }
          ]
        };
      }
    };

    const provider = new RemoteDataProvider({
      dataSource,
      rowCount: 64,
      cache: {
        blockSize: 8,
        maxBlocks: 4,
        prefetchBlocks: 0
      },
      queryModel: {
        serverSide: initialServerSideQuery
      }
    });

    provider.getValue(0, 'id');
    await flushAsync();

    expect(requests[0].queryModel.serverSide).toEqual(initialServerSideQuery);
    expect(provider.getServerSideQueryModel()).toEqual(initialServerSideQuery);
    expect(provider.getRowMetadata(0)).toEqual({
      kind: 'group',
      level: 1,
      childCount: 12,
      isExpandedByDefault: true,
      groupColumnId: 'country',
      groupKey: 'KR',
      route: initialServerSideQuery.route,
      aggregateValues: {
        totalScore: 240
      }
    });
  });

  it('updates server-side query model through helper API', () => {
    const dataSource: RemoteDataSource = {
      async fetchBlock(_request): Promise<RemoteBlockResponse> {
        return { rows: [] };
      }
    };

    const provider = new RemoteDataProvider({
      dataSource,
      rowCount: 10
    });

    provider.setServerSideQueryModel({
      schemaVersion: 'v3',
      requestKind: 'children',
      route: [{ columnId: 'region', key: 'EMEA' }],
      rootStoreStrategy: 'full',
      childStoreStrategy: 'partial'
    });

    expect(provider.getServerSideQueryModel()).toEqual({
      schemaVersion: 'v3',
      requestKind: 'children',
      route: [{ columnId: 'region', key: 'EMEA' }],
      rootStoreStrategy: 'full',
      childStoreStrategy: 'partial'
    });

    provider.setServerSideQueryModel(undefined);
    expect(provider.getServerSideQueryModel()).toBeUndefined();
  });

  it('preserves pending changes across cache eviction and refetch', async () => {
    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          return {
            rows: createRows(request.startIndex, request.endIndex),
            totalRowCount: 20
          };
        }
      },
      rowCount: 20,
      cache: {
        blockSize: 5,
        maxBlocks: 1,
        prefetchBlocks: 0
      }
    });

    provider.getValue(0, 'name');
    await flushAsync();
    provider.setValue(0, 'name', 'Remote-1-Edited');
    expect(provider.getValue(0, 'name')).toBe('Remote-1-Edited');
    expect(provider.getPendingChanges()).toEqual([
      {
        rowKey: 1,
        changes: [
          {
            columnId: 'name',
            originalValue: 'Remote-1',
            value: 'Remote-1-Edited'
          }
        ]
      }
    ]);

    provider.getValue(6, 'name');
    await flushAsync();
    expect(provider.getDebugState().cachedBlockIndexes).toEqual([1]);

    expect(provider.getValue(0, 'name')).toBeUndefined();
    await flushAsync();

    expect(provider.getValue(0, 'name')).toBe('Remote-1-Edited');
    expect(provider.getPendingChangeSummary()).toEqual({
      rowCount: 1,
      cellCount: 1,
      rowKeys: [1]
    });
    expect(provider.getDebugState().pendingChangeSummary).toEqual({
      rowCount: 1,
      cellCount: 1,
      rowKeys: [1]
    });
  });

  it('supports accept, discard, and revert for pending remote edits', async () => {
    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          return {
            rows: createRows(request.startIndex, request.endIndex),
            totalRowCount: 20
          };
        }
      },
      rowCount: 20,
      cache: {
        blockSize: 5,
        maxBlocks: 2,
        prefetchBlocks: 0
      }
    });

    provider.getValue(0, 'name');
    provider.getValue(1, 'status');
    await flushAsync();

    provider.setValue(0, 'name', 'Remote-1-Edited');
    provider.setValue(0, 'status', 'paused');
    provider.setValue(1, 'status', 'archived');

    expect(provider.hasPendingChanges()).toBe(true);
    expect(provider.getPendingChangeSummary()).toEqual({
      rowCount: 2,
      cellCount: 3,
      rowKeys: [1, 2]
    });

    provider.revertPendingChange(1, 'status');
    expect(provider.getValue(0, 'status')).toBe('active');
    expect(provider.getPendingChanges()).toEqual([
      {
        rowKey: 1,
        changes: [
          {
            columnId: 'name',
            originalValue: 'Remote-1',
            value: 'Remote-1-Edited'
          }
        ]
      },
      {
        rowKey: 2,
        changes: [
          {
            columnId: 'status',
            originalValue: 'idle',
            value: 'archived'
          }
        ]
      }
    ]);

    provider.acceptPendingChanges({
      rowKeys: [1]
    });
    expect(provider.getValue(0, 'name')).toBe('Remote-1-Edited');
    expect(provider.getPendingChangeSummary()).toEqual({
      rowCount: 1,
      cellCount: 1,
      rowKeys: [2]
    });

    provider.discardPendingChanges();
    expect(provider.getValue(1, 'status')).toBe('idle');
    expect(provider.hasPendingChanges()).toBe(false);
    expect(provider.getPendingChanges()).toEqual([]);
  });

  it('ignores pending edits for remote group rows', async () => {
    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(): Promise<RemoteBlockResponse> {
          return {
            rows: [{ region: 'APAC', score: 300 }],
            rowMetadata: [
              {
                kind: 'group',
                level: 0,
                childCount: 2,
                groupColumnId: 'region',
                groupKey: 'APAC',
                aggregateValues: {
                  region: 'APAC',
                  score: 300
                }
              }
            ],
            totalRowCount: 1
          };
        }
      },
      rowCount: 1,
      cache: {
        blockSize: 5,
        maxBlocks: 1,
        prefetchBlocks: 0
      }
    });

    provider.getValue(0, 'region');
    await flushAsync();

    provider.setValue(0, 'region', 'EMEA');

    expect(provider.getValue(0, 'region')).toBe('APAC');
    expect(provider.hasPendingChanges()).toBe(false);
  });
});

describe('Grid + RemoteDataProvider', () => {
  it('renders loading skeleton cells and updates when remote block is resolved', async () => {
    const container = document.createElement('div');
    container.style.width = '760px';
    document.body.append(container);

    const pendingBlock = createDeferred<RemoteBlockResponse>();
    const dataSource: RemoteDataSource = {
      async fetchBlock(_request): Promise<RemoteBlockResponse> {
        return pendingBlock.promise;
      }
    };

    const provider = new RemoteDataProvider({
      dataSource,
      rowCount: 5000,
      cache: {
        blockSize: 100,
        maxBlocks: 6,
        prefetchBlocks: 0
      }
    });

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 240, type: 'text' },
        { id: 'status', header: 'Status', width: 160, type: 'text' }
      ],
      dataProvider: provider,
      height: 300,
      rowHeight: 28,
      overscan: 4
    });

    await waitForFrame();

    const firstNameCell = container.querySelector('.hgrid__row--center .hgrid__cell[data-column-id="name"]') as HTMLDivElement | null;
    expect(firstNameCell).not.toBeNull();
    expect(firstNameCell?.classList.contains('hgrid__cell--loading')).toBe(true);

    pendingBlock.resolve({
      rows: createRows(0, 100),
      totalRowCount: 5000
    });

    await flushAsync();
    await waitForFrame();

    const updatedNameCell = container.querySelector('.hgrid__row--center .hgrid__cell[data-column-id="name"]') as HTMLDivElement | null;
    expect(updatedNameCell).not.toBeNull();
    expect(updatedNameCell?.classList.contains('hgrid__cell--loading')).toBe(false);
    expect(updatedNameCell?.textContent).toBe('Remote-1');

    grid.destroy();
  });

  it('preserves server-side query contract while grid syncs remote sort and filter state', async () => {
    const requests: Array<Omit<RemoteBlockRequest, 'signal'>> = [];
    const container = document.createElement('div');
    container.style.width = '760px';
    document.body.append(container);

    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          requests.push(cloneRequestWithoutSignal(request));
          return {
            rows: createRows(request.startIndex, request.endIndex),
            totalRowCount: 500
          };
        }
      },
      rowCount: 500,
      cache: {
        blockSize: 50,
        maxBlocks: 4,
        prefetchBlocks: 0
      },
      queryModel: {
        serverSide: {
          schemaVersion: 'v2',
          requestKind: 'root',
          route: [],
          rootStoreStrategy: 'partial',
          childStoreStrategy: 'full'
        }
      }
    });

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 240, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      dataProvider: provider,
      grouping: {
        mode: 'server',
        groupModel: [{ columnId: 'status' }]
      },
      height: 300,
      rowHeight: 28,
      overscan: 4
    });

    await waitForFrame();
    await grid.setSortModel([{ columnId: 'id', direction: 'desc' }]);
    await grid.setFilterModel({
      status: {
        kind: 'set',
        values: ['active']
      }
    });

    const remoteQueryModel = provider.getQueryModel();
    expect(remoteQueryModel.serverSide).toEqual({
      schemaVersion: 'v2',
      requestKind: 'root',
      route: [],
      rootStoreStrategy: 'partial',
      childStoreStrategy: 'full',
      grouping: {
        defaultExpanded: true
      }
    });
    expect(remoteQueryModel.sortModel).toEqual([{ columnId: 'id', direction: 'desc' }]);
    expect(remoteQueryModel.filterModel).toEqual({
      status: {
        kind: 'set',
        values: ['active']
      }
    });
    expect(remoteQueryModel.groupModel).toEqual([{ columnId: 'status' }]);
    expect(requests.length).toBeGreaterThan(0);

    grid.destroy();
  });

  it('renders remote grouping rows from row metadata', async () => {
    const container = document.createElement('div');
    container.style.width = '760px';
    document.body.append(container);

    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          return {
            rows: [
              { region: 'APAC', score: 300 },
              { id: 1, region: 'KR', score: 120 },
              { id: 2, region: 'JP', score: 180 }
            ],
            rowMetadata: [
              {
                kind: 'group',
                level: 0,
                childCount: 2,
                isExpanded: true,
                groupColumnId: 'region',
                groupKey: 'APAC',
                aggregateValues: {
                  region: 'APAC',
                  score: 300
                }
              },
              { kind: 'leaf', level: 1 },
              { kind: 'leaf', level: 1 }
            ],
            totalRowCount: 3
          };
        }
      },
      rowCount: 3,
      cache: {
        blockSize: 8,
        maxBlocks: 2,
        prefetchBlocks: 0
      },
      queryModel: {
        serverSide: {
          schemaVersion: 'v2',
          requestKind: 'root',
          route: [],
          rootStoreStrategy: 'partial',
          childStoreStrategy: 'partial'
        }
      }
    });

    const grid = new Grid(container, {
      columns: [
        { id: 'region', header: 'Region', width: 180, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      dataProvider: provider,
      grouping: {
        mode: 'server',
        groupModel: [{ columnId: 'region' }]
      },
      height: 200,
      rowHeight: 28,
      overscan: 2
    });

    await flushAsync();
    await waitForFrame();

    const activeProvider = grid.getDataProvider();
    const firstRow = activeProvider.getRow?.(0);
    expect(firstRow?.[GROUP_ROW_KIND_FIELD]).toBe('group');
    expect(firstRow?.[GROUP_ROW_COLUMN_ID_FIELD]).toBe('region');
    expect(firstRow?.region).toBe('APAC');
    expect(firstRow?.score).toBe(300);

    grid.destroy();
  });

  it('renders remote tree rows and syncs expanded node keys to the query contract', async () => {
    const requests: Array<Omit<RemoteBlockRequest, 'signal'>> = [];
    const container = document.createElement('div');
    container.style.width = '760px';
    document.body.append(container);

    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          requests.push(cloneRequestWithoutSignal(request));
          const expandedNodeKeys = request.queryModel.serverSide?.tree?.expandedNodeKeys ?? [];
          const rows =
            expandedNodeKeys.indexOf('root-1') >= 0
              ? [
                  { id: 'root-1', name: 'Root 1' },
                  { id: 'child-1', name: 'Child 1' }
                ]
              : [{ id: 'root-1', name: 'Root 1' }];
          const rowMetadata: RemoteServerSideRowMetadata[] =
            expandedNodeKeys.indexOf('root-1') >= 0
              ? [
                  {
                    kind: 'leaf',
                    treeNodeKey: 'root-1',
                    treeParentNodeKey: null,
                    treeDepth: 0,
                    treeHasChildren: true,
                    treeExpanded: true,
                    treeColumnId: 'name'
                  },
                  {
                    kind: 'leaf',
                    treeNodeKey: 'child-1',
                    treeParentNodeKey: 'root-1',
                    treeDepth: 1,
                    treeHasChildren: false,
                    treeExpanded: false,
                    treeColumnId: 'name'
                  }
                ]
              : [
                  {
                    kind: 'leaf',
                    treeNodeKey: 'root-1',
                    treeParentNodeKey: null,
                    treeDepth: 0,
                    treeHasChildren: true,
                    treeExpanded: false,
                    treeColumnId: 'name'
                  }
                ];

          return {
            rows,
            rowMetadata,
            totalRowCount: rows.length
          };
        }
      },
      rowCount: 1,
      cache: {
        blockSize: 8,
        maxBlocks: 2,
        prefetchBlocks: 0
      },
      queryModel: {
        serverSide: {
          schemaVersion: 'v2',
          requestKind: 'tree',
          route: [],
          rootStoreStrategy: 'partial',
          childStoreStrategy: 'partial'
        }
      }
    });

    const grid = new Grid(container, {
      columns: [
        { id: 'name', header: 'Name', width: 220, type: 'text' }
      ],
      dataProvider: provider,
      treeData: {
        enabled: true,
        mode: 'server',
        treeColumnId: 'name',
        idField: 'id',
        parentIdField: 'parentId',
        hasChildrenField: 'hasChildren'
      },
      height: 200,
      rowHeight: 28,
      overscan: 2
    });

    await flushAsync();
    await waitForFrame();

    let activeProvider = grid.getDataProvider();
    let firstRow = activeProvider.getRow?.(0);
    expect(firstRow?.[TREE_ROW_KIND_FIELD]).toBe('tree');
    expect(firstRow?.[TREE_ROW_NODE_KEY_FIELD]).toBe('root-1');
    expect(firstRow?.[TREE_ROW_DEPTH_FIELD]).toBe(0);

    await grid.setTreeExpanded('root-1', true);
    await waitForCondition(() => {
      const providerAfterExpand = grid.getDataProvider();
      return providerAfterExpand.getRow?.(1)?.[TREE_ROW_KIND_FIELD] === 'tree';
    });

    const latestRequest = requests[requests.length - 1];
    expect(latestRequest.queryModel.serverSide?.tree?.expandedNodeKeys).toEqual(['root-1']);

    activeProvider = grid.getDataProvider();
    firstRow = activeProvider.getRow?.(1);
    expect(firstRow?.[TREE_ROW_KIND_FIELD]).toBe('tree');
    expect(firstRow?.[TREE_ROW_NODE_KEY_FIELD]).toBe('child-1');
    expect(firstRow?.[TREE_ROW_DEPTH_FIELD]).toBe(1);

    grid.destroy();
  });

  it('applies remote pivot result columns from the server response', async () => {
    const container = document.createElement('div');
    container.style.width = '920px';
    document.body.append(container);

    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(_request): Promise<RemoteBlockResponse> {
          return {
            rows: [
              {
                region: 'APAC',
                'sales::Jan': 100,
                'sales::Feb': 200
              }
            ],
            pivotResult: {
              columns: [
                { id: 'region', header: 'Region', width: 180, type: 'text' },
                { id: 'sales::Jan', header: 'Sales Jan', width: 140, type: 'number' },
                { id: 'sales::Feb', header: 'Sales Feb', width: 140, type: 'number' }
              ]
            },
            totalRowCount: 1
          };
        }
      },
      rowCount: 1,
      cache: {
        blockSize: 8,
        maxBlocks: 2,
        prefetchBlocks: 0
      },
      queryModel: {
        serverSide: {
          schemaVersion: 'v2',
          requestKind: 'pivot',
          route: [],
          rootStoreStrategy: 'partial',
          childStoreStrategy: 'partial'
        }
      }
    });

    const grid = new Grid(container, {
      columns: [
        { id: 'region', header: 'Region', width: 180, type: 'text' },
        { id: 'month', header: 'Month', width: 140, type: 'text' },
        { id: 'sales', header: 'Sales', width: 120, type: 'number' }
      ],
      dataProvider: provider,
      pivoting: {
        mode: 'server',
        pivotModel: [{ columnId: 'month' }],
        values: [{ columnId: 'sales', type: 'sum' }]
      },
      height: 200,
      rowHeight: 28,
      overscan: 2
    });

    await flushAsync();
    await waitForFrame();

    const visibleColumnIds = grid.getVisibleColumns().map((column) => column.id);
    expect(visibleColumnIds).toContain('sales::Jan');
    expect(visibleColumnIds).toContain('sales::Feb');
    expect(provider.getPivotResultColumns().map((column) => column.id)).toEqual(['region', 'sales::Jan', 'sales::Feb']);

    grid.destroy();
  });

  it('prioritizes remote tree contract over server grouping and pivot query payloads', async () => {
    const requests: Array<Omit<RemoteBlockRequest, 'signal'>> = [];
    const container = document.createElement('div');
    container.style.width = '920px';
    document.body.append(container);

    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          requests.push(cloneRequestWithoutSignal(request));
          return {
            rows: [
              { id: 'root-1', parentId: null, hasChildren: true, name: 'Root 1', region: 'APAC', month: 'Jan', sales: 120 }
            ],
            rowMetadata: [
              {
                kind: 'leaf',
                treeNodeKey: 'root-1',
                treeParentNodeKey: null,
                treeDepth: 0,
                treeHasChildren: true,
                treeExpanded: false,
                treeColumnId: 'name'
              }
            ],
            totalRowCount: 1
          };
        }
      },
      rowCount: 1,
      cache: {
        blockSize: 8,
        maxBlocks: 2,
        prefetchBlocks: 0
      },
      queryModel: {
        serverSide: {
          schemaVersion: 'v2',
          requestKind: 'tree',
          route: [],
          rootStoreStrategy: 'partial',
          childStoreStrategy: 'partial'
        }
      }
    });

    const grid = new Grid(container, {
      columns: [
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'region', header: 'Region', width: 160, type: 'text' },
        { id: 'month', header: 'Month', width: 120, type: 'text' },
        { id: 'sales', header: 'Sales', width: 140, type: 'number' }
      ],
      dataProvider: provider,
      grouping: {
        mode: 'server',
        groupModel: [{ columnId: 'region' }]
      },
      pivoting: {
        mode: 'server',
        pivotModel: [{ columnId: 'month' }],
        values: [{ columnId: 'sales', type: 'sum' }]
      },
      treeData: {
        enabled: true,
        mode: 'server',
        treeColumnId: 'name',
        idField: 'id',
        parentIdField: 'parentId',
        hasChildrenField: 'hasChildren'
      },
      height: 200,
      rowHeight: 28,
      overscan: 2
    });

    await flushAsync();
    await waitForFrame();

    const queryModel = provider.getQueryModel();
    expect(queryModel.groupModel).toBeUndefined();
    expect(queryModel.pivotModel).toBeUndefined();
    expect(queryModel.pivotValues).toBeUndefined();
    expect(queryModel.serverSide?.requestKind).toBe('tree');
    expect(queryModel.serverSide?.tree).toEqual({
      idField: 'id',
      parentIdField: 'parentId',
      hasChildrenField: 'hasChildren',
      treeColumnId: 'name'
    });
    expect(requests.length).toBeGreaterThan(0);

    grid.destroy();
  });

  it('keeps remote edit UX immediate while tracking pending changes for save/discard', async () => {
    const container = document.createElement('div');
    container.style.width = '760px';
    document.body.append(container);

    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request): Promise<RemoteBlockResponse> {
          return {
            rows: createRows(request.startIndex, request.endIndex),
            totalRowCount: 2
          };
        }
      },
      rowCount: 2,
      cache: {
        blockSize: 8,
        maxBlocks: 2,
        prefetchBlocks: 0
      }
    });

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text', editable: true },
        { id: 'status', header: 'Status', width: 160, type: 'text' }
      ],
      dataProvider: provider,
      height: 200,
      rowHeight: 28,
      overscan: 2
    });

    await flushAsync();
    await waitForFrame();

    const renderer = (
      grid as unknown as {
        renderer: {
          startEditingAtCell: (rowIndex: number, colIndex: number) => boolean;
          editorInputElement: HTMLInputElement;
        };
      }
    ).renderer;

    expect(renderer.startEditingAtCell(0, 1)).toBe(true);
    renderer.editorInputElement.value = 'Remote-1-Edited';
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(provider.getValue(0, 'name')).toBe('Remote-1-Edited');
    expect(provider.getPendingChanges()).toEqual([
      {
        rowKey: 1,
        changes: [
          {
            columnId: 'name',
            originalValue: 'Remote-1',
            value: 'Remote-1-Edited'
          }
        ]
      }
    ]);

    const editedNameCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement | null;
    expect(editedNameCell?.textContent).toBe('Remote-1-Edited');

    provider.discardPendingChanges();
    await waitForFrame();

    const revertedNameCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement | null;
    expect(provider.getValue(0, 'name')).toBe('Remote-1');
    expect(revertedNameCell?.textContent).toBe('Remote-1');

    grid.destroy();
    container.remove();
  });
});
