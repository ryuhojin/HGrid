import { describe, expect, it } from 'vitest';
import { Grid } from '../src';
import {
  RemoteDataProvider,
  type RemoteBlockRequest,
  type RemoteBlockResponse,
  type RemoteDataSource
} from '../src/data/remote-data-provider';

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
      }
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
});
