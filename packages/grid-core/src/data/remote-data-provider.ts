import type { DataProvider, DataTransaction, GridRowData, RowKey, RowsChangedListener } from './data-provider';
import type { GroupModelItem } from '../core/grid-options';

const DEFAULT_BLOCK_SIZE = 1000;
const DEFAULT_MAX_BLOCKS = 24;
const DEFAULT_PREFETCH_BLOCKS = 1;

export type SortDirection = 'asc' | 'desc';
export type RemoteLoadingRowPolicy = 'skeleton' | 'none';

export interface SortModelItem {
  columnId: string;
  direction: SortDirection;
}

export type FilterModel = Record<string, unknown>;

export interface RemoteQueryModel {
  sortModel: SortModelItem[];
  filterModel: FilterModel;
  groupModel?: GroupModelItem[];
}

export interface RemoteBlockRequest {
  startIndex: number;
  endIndex: number;
  operationId: string;
  queryModel: RemoteQueryModel;
  signal?: AbortSignal;
}

export interface RemoteBlockResponse {
  rows: GridRowData[];
  rowKeys?: RowKey[];
  totalRowCount?: number;
}

export interface RemoteDataSource {
  fetchBlock(request: RemoteBlockRequest): Promise<RemoteBlockResponse>;
}

export interface RemoteCacheConfig {
  blockSize: number;
  maxBlocks: number;
  prefetchBlocks?: number;
}

export interface RemoteDataProviderOptions {
  dataSource: RemoteDataSource;
  rowCount?: number;
  cache?: Partial<RemoteCacheConfig>;
  queryModel?: Partial<RemoteQueryModel>;
  loadingRowPolicy?: RemoteLoadingRowPolicy;
}

export interface RemoteDataProviderDebugState {
  rowCount: number;
  blockSize: number;
  maxBlocks: number;
  prefetchBlocks: number;
  cachedBlockIndexes: number[];
  loadingBlockIndexes: number[];
  queryModel: RemoteQueryModel;
  inFlightOperations: number;
}

export interface RemoteDataProvider extends DataProvider {
  setQueryModel(queryModel: Partial<RemoteQueryModel>): void;
  getQueryModel(): RemoteQueryModel;
  setDataSource(dataSource: RemoteDataSource): void;
  invalidateCache(): void;
  cancelOperation(operationId: string): void;
  getCacheConfig(): RemoteCacheConfig;
  getLoadingRowPolicy(): RemoteLoadingRowPolicy;
  getDebugState(): RemoteDataProviderDebugState;
}

interface CachedBlock {
  blockIndex: number;
  startIndex: number;
  endIndex: number;
  status: 'loading' | 'ready' | 'error';
  rows: GridRowData[];
  rowKeys: RowKey[];
  operationId: string | null;
  errorMessage: string | null;
}

interface InFlightOperation {
  blockIndex: number;
  abortController: AbortController | null;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'AbortError');
}

function normalizePositiveInt(value: unknown, fallback: number, min: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.max(min, Math.floor(numericValue));
}

function cloneSortModel(sortModel: SortModelItem[] | undefined): SortModelItem[] {
  if (!Array.isArray(sortModel)) {
    return [];
  }

  const normalizedSortModel: SortModelItem[] = [];
  for (let index = 0; index < sortModel.length; index += 1) {
    const item = sortModel[index];
    if (!item || typeof item.columnId !== 'string' || item.columnId.length === 0) {
      continue;
    }

    normalizedSortModel.push({
      columnId: item.columnId,
      direction: item.direction === 'desc' ? 'desc' : 'asc'
    });
  }

  return normalizedSortModel;
}

function cloneFilterModel(filterModel: FilterModel | undefined): FilterModel {
  if (!filterModel || typeof filterModel !== 'object') {
    return {};
  }

  const normalizedFilterModel: FilterModel = {};
  const keys = Object.keys(filterModel);
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex];
    normalizedFilterModel[key] = filterModel[key];
  }

  return normalizedFilterModel;
}

function cloneQueryModel(queryModel: RemoteQueryModel): RemoteQueryModel {
  return {
    sortModel: cloneSortModel(queryModel.sortModel),
    filterModel: cloneFilterModel(queryModel.filterModel),
    groupModel: queryModel.groupModel
  };
}

function getFallbackRowKey(row: GridRowData | undefined, dataIndex: number): RowKey {
  if (!row) {
    return dataIndex;
  }

  const candidate = row.id ?? row.rowId ?? row.key;
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    return candidate;
  }

  return dataIndex;
}

function createInitialQueryModel(input?: Partial<RemoteQueryModel>): RemoteQueryModel {
  return {
    sortModel: cloneSortModel(input?.sortModel),
    filterModel: cloneFilterModel(input?.filterModel),
    groupModel: input?.groupModel
  };
}

function isSameSortModel(left: SortModelItem[], right: SortModelItem[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index].columnId !== right[index].columnId || left[index].direction !== right[index].direction) {
      return false;
    }
  }

  return true;
}

function isSameFilterModel(left: FilterModel, right: FilterModel): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  leftKeys.sort();
  rightKeys.sort();
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) {
      return false;
    }
  }

  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) {
      return false;
    }
  }

  return true;
}

function isSameQueryModel(left: RemoteQueryModel, right: RemoteQueryModel): boolean {
  if (!isSameSortModel(left.sortModel, right.sortModel)) {
    return false;
  }

  if (!isSameFilterModel(left.filterModel, right.filterModel)) {
    return false;
  }

  if (JSON.stringify(left.groupModel) !== JSON.stringify(right.groupModel)) {
    return false;
  }

  return true;
}

export class RemoteDataProvider implements DataProvider {
  private dataSource: RemoteDataSource;
  private rowCount: number;
  private readonly cacheConfig: { blockSize: number; maxBlocks: number; prefetchBlocks: number };
  private queryModel: RemoteQueryModel;
  private readonly loadingRowPolicy: RemoteLoadingRowPolicy;
  private readonly blockCache: Map<number, CachedBlock> = new Map();
  private readonly inFlightOperations: Map<string, InFlightOperation> = new Map();
  private readonly listeners: Set<RowsChangedListener> = new Set();
  private readonly canceledOperationIds: Set<string> = new Set();
  private requestSequence = 0;
  private queryVersion = 0;
  private lastAccessedDataIndex: number | null = null;

  public constructor(options: RemoteDataProviderOptions) {
    this.dataSource = options.dataSource;
    this.rowCount = normalizePositiveInt(options.rowCount, 0, 0);
    this.cacheConfig = {
      blockSize: normalizePositiveInt(options.cache?.blockSize, DEFAULT_BLOCK_SIZE, 1),
      maxBlocks: normalizePositiveInt(options.cache?.maxBlocks, DEFAULT_MAX_BLOCKS, 1),
      prefetchBlocks: normalizePositiveInt(options.cache?.prefetchBlocks, DEFAULT_PREFETCH_BLOCKS, 0)
    };
    this.queryModel = createInitialQueryModel(options.queryModel);
    this.loadingRowPolicy = options.loadingRowPolicy === 'none' ? 'none' : 'skeleton';
  }

  public getRowCount(): number {
    return this.rowCount;
  }

  public getRowKey(dataIndex: number): RowKey {
    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.rowCount) {
      return dataIndex;
    }

    const block = this.ensureBlockForDataIndex(dataIndex, true);
    if (!block || block.status !== 'ready') {
      return dataIndex;
    }

    const offset = dataIndex - block.startIndex;
    const key = block.rowKeys[offset];
    if (typeof key === 'string' || typeof key === 'number') {
      return key;
    }

    return getFallbackRowKey(block.rows[offset], dataIndex);
  }

  public getRow(dataIndex: number): GridRowData | undefined {
    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.rowCount) {
      return undefined;
    }

    const block = this.ensureBlockForDataIndex(dataIndex, true);
    if (!block || block.status !== 'ready') {
      return undefined;
    }

    return block.rows[dataIndex - block.startIndex];
  }

  public getValue(dataIndex: number, columnId: string): unknown {
    const row = this.getRow(dataIndex);
    return row ? row[columnId] : undefined;
  }

  public setValue(dataIndex: number, columnId: string, value: unknown): void {
    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.rowCount) {
      return;
    }

    const blockIndex = this.getBlockIndexByDataIndex(dataIndex);
    const block = this.blockCache.get(blockIndex);
    if (!block || block.status !== 'ready') {
      return;
    }

    const rowOffset = dataIndex - block.startIndex;
    const row = block.rows[rowOffset];
    if (!row) {
      return;
    }

    row[columnId] = value;
    this.emitRowsChanged();
  }

  public applyTransactions(transactions: DataTransaction[]): void {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return;
    }

    let shouldNotify = false;
    for (let transactionIndex = 0; transactionIndex < transactions.length; transactionIndex += 1) {
      const transaction = transactions[transactionIndex];

      if (transaction.type === 'updateCell') {
        const block = this.blockCache.get(this.getBlockIndexByDataIndex(transaction.index));
        if (block && block.status === 'ready') {
          const rowOffset = transaction.index - block.startIndex;
          if (rowOffset >= 0 && rowOffset < block.rows.length) {
            const row = block.rows[rowOffset];
            if (row) {
              row[transaction.columnId] = transaction.value;
              shouldNotify = true;
            }
          }
        }
        continue;
      }

      if (transaction.type === 'update') {
        const block = this.blockCache.get(this.getBlockIndexByDataIndex(transaction.index));
        if (block && block.status === 'ready') {
          const rowOffset = transaction.index - block.startIndex;
          if (rowOffset >= 0 && rowOffset < block.rows.length) {
            block.rows[rowOffset] = { ...transaction.row };
            shouldNotify = true;
          }
        }
        continue;
      }

      if (transaction.type === 'add') {
        const addCount = Math.max(0, transaction.rows.length);
        if (addCount > 0) {
          this.rowCount += addCount;
          this.invalidateCache();
          return;
        }
        continue;
      }

      if (transaction.type === 'remove') {
        const removeCount = Math.max(1, transaction.count ?? 1);
        this.rowCount = Math.max(0, this.rowCount - removeCount);
        this.invalidateCache();
        return;
      }
    }

    if (shouldNotify) {
      this.emitRowsChanged();
    }
  }

  public onRowsChanged(listener: RowsChangedListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public isRowLoading(dataIndex: number): boolean {
    if (this.loadingRowPolicy === 'none') {
      return false;
    }

    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.rowCount) {
      return false;
    }

    const blockIndex = this.getBlockIndexByDataIndex(dataIndex);
    const block = this.blockCache.get(blockIndex);
    return !block || block.status !== 'ready';
  }

  public setQueryModel(queryModel: Partial<RemoteQueryModel>): void {
    const nextQueryModel: RemoteQueryModel = {
      sortModel: queryModel.sortModel ? cloneSortModel(queryModel.sortModel) : this.queryModel.sortModel,
      filterModel: queryModel.filterModel ? cloneFilterModel(queryModel.filterModel) : this.queryModel.filterModel,
      groupModel: queryModel.groupModel !== undefined ? queryModel.groupModel : this.queryModel.groupModel
    };

    if (isSameQueryModel(this.queryModel, nextQueryModel)) {
      return;
    }

    this.queryModel = cloneQueryModel(nextQueryModel);
    this.queryVersion += 1;
    this.invalidateCache();
  }

  public getQueryModel(): RemoteQueryModel {
    return cloneQueryModel(this.queryModel);
  }

  public setDataSource(dataSource: RemoteDataSource): void {
    this.dataSource = dataSource;
    this.queryVersion += 1;
    this.invalidateCache();
  }

  public invalidateCache(): void {
    this.cancelAllInFlightOperations();
    this.blockCache.clear();
    this.lastAccessedDataIndex = null;
    this.emitRowsChanged();
  }

  public cancelOperation(operationId: string): void {
    if (!operationId) {
      return;
    }

    this.canceledOperationIds.add(operationId);
    const inFlightOperation = this.inFlightOperations.get(operationId);
    if (inFlightOperation?.abortController) {
      inFlightOperation.abortController.abort();
    }
  }

  public getCacheConfig(): RemoteCacheConfig {
    return {
      blockSize: this.cacheConfig.blockSize,
      maxBlocks: this.cacheConfig.maxBlocks,
      prefetchBlocks: this.cacheConfig.prefetchBlocks
    };
  }

  public getLoadingRowPolicy(): RemoteLoadingRowPolicy {
    return this.loadingRowPolicy;
  }

  public getDebugState(): RemoteDataProviderDebugState {
    const cachedBlockIndexes = Array.from(this.blockCache.keys()).sort((left, right) => left - right);
    const loadingBlockIndexes = cachedBlockIndexes.filter((blockIndex) => {
      const block = this.blockCache.get(blockIndex);
      return block?.status === 'loading';
    });

    return {
      rowCount: this.rowCount,
      blockSize: this.cacheConfig.blockSize,
      maxBlocks: this.cacheConfig.maxBlocks,
      prefetchBlocks: this.cacheConfig.prefetchBlocks,
      cachedBlockIndexes,
      loadingBlockIndexes,
      queryModel: this.getQueryModel(),
      inFlightOperations: this.inFlightOperations.size
    };
  }

  private ensureBlockForDataIndex(dataIndex: number, enablePrefetch: boolean): CachedBlock | null {
    if (dataIndex < 0 || dataIndex >= this.rowCount) {
      return null;
    }

    const blockIndex = this.getBlockIndexByDataIndex(dataIndex);
    const block = this.ensureBlock(blockIndex, enablePrefetch ? 'read' : 'prefetch');
    if (!block) {
      return null;
    }

    if (enablePrefetch) {
      this.prefetchBlocksByDirection(blockIndex, dataIndex);
    }

    return block;
  }

  private ensureBlock(blockIndex: number, reason: 'read' | 'prefetch'): CachedBlock | null {
    if (blockIndex < 0 || blockIndex >= this.getBlockCount()) {
      return null;
    }

    let block = this.blockCache.get(blockIndex);
    if (!block) {
      block = {
        blockIndex,
        startIndex: blockIndex * this.cacheConfig.blockSize,
        endIndex: Math.min(this.rowCount, (blockIndex + 1) * this.cacheConfig.blockSize),
        status: 'loading',
        rows: [],
        rowKeys: [],
        operationId: null,
        errorMessage: null
      };
      this.blockCache.set(blockIndex, block);
      this.fetchBlock(block);
      this.evictIfNeeded(blockIndex);
      return block;
    }

    if (block.status === 'error') {
      block.status = 'loading';
      block.errorMessage = null;
      this.fetchBlock(block);
    }

    this.touchBlock(blockIndex);
    if (reason === 'read') {
      this.evictIfNeeded(blockIndex);
    }
    return block;
  }

  private fetchBlock(block: CachedBlock): void {
    const blockIndex = block.blockIndex;
    const currentOperationId = block.operationId;
    if (currentOperationId && this.inFlightOperations.has(currentOperationId)) {
      return;
    }

    const operationId = `remote-${this.queryVersion}-${blockIndex}-${++this.requestSequence}`;
    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    block.status = 'loading';
    block.operationId = operationId;
    block.errorMessage = null;
    this.inFlightOperations.set(operationId, {
      blockIndex,
      abortController
    });

    const request: RemoteBlockRequest = {
      startIndex: block.startIndex,
      endIndex: block.endIndex,
      operationId,
      queryModel: this.getQueryModel(),
      signal: abortController?.signal
    };

    const onSettled = (): void => {
      this.inFlightOperations.delete(operationId);
      this.canceledOperationIds.delete(operationId);
    };

    void this.dataSource
      .fetchBlock(request)
      .then((response) => {
        const inFlightOperation = this.inFlightOperations.get(operationId);
        if (!inFlightOperation || inFlightOperation.blockIndex !== blockIndex) {
          return;
        }

        if (this.canceledOperationIds.has(operationId)) {
          return;
        }

        const currentBlock = this.blockCache.get(blockIndex);
        if (!currentBlock || currentBlock.operationId !== operationId) {
          return;
        }

        const expectedLength = currentBlock.endIndex - currentBlock.startIndex;
        const sourceRows = Array.isArray(response.rows) ? response.rows : [];
        const rows: GridRowData[] = new Array(expectedLength);
        const rowKeys: RowKey[] = new Array(expectedLength);
        for (let rowOffset = 0; rowOffset < expectedLength; rowOffset += 1) {
          const row = sourceRows[rowOffset] ? { ...sourceRows[rowOffset] } : {};
          rows[rowOffset] = row;
          rowKeys[rowOffset] =
            Array.isArray(response.rowKeys) && response.rowKeys.length > rowOffset
              ? response.rowKeys[rowOffset]
              : getFallbackRowKey(row, currentBlock.startIndex + rowOffset);
        }

        currentBlock.rows = rows;
        currentBlock.rowKeys = rowKeys;
        currentBlock.status = 'ready';
        currentBlock.errorMessage = null;
        this.touchBlock(blockIndex);

        if (Number.isFinite(response.totalRowCount)) {
          const nextRowCount = Math.max(0, Math.floor(Number(response.totalRowCount)));
          if (this.rowCount !== nextRowCount) {
            this.rowCount = nextRowCount;
            this.trimInvalidBlocks();
          }
        }

        this.evictIfNeeded(blockIndex);
        this.emitRowsChanged();
      })
      .catch((error: unknown) => {
        if (this.canceledOperationIds.has(operationId) || isAbortError(error)) {
          return;
        }

        const currentBlock = this.blockCache.get(blockIndex);
        if (!currentBlock || currentBlock.operationId !== operationId) {
          return;
        }

        currentBlock.status = 'error';
        currentBlock.errorMessage = error instanceof Error ? error.message : 'Remote block fetch failed';
        this.emitRowsChanged();
      })
      .then(onSettled, onSettled);
  }

  private prefetchBlocksByDirection(currentBlockIndex: number, dataIndex: number): void {
    const prefetchCount = this.cacheConfig.prefetchBlocks;
    if (prefetchCount <= 0) {
      this.lastAccessedDataIndex = dataIndex;
      return;
    }

    let direction = 1;
    if (this.lastAccessedDataIndex !== null) {
      if (dataIndex > this.lastAccessedDataIndex) {
        direction = 1;
      } else if (dataIndex < this.lastAccessedDataIndex) {
        direction = -1;
      } else {
        direction = 0;
      }
    }
    this.lastAccessedDataIndex = dataIndex;

    if (direction === 0) {
      return;
    }

    for (let step = 1; step <= prefetchCount; step += 1) {
      const targetBlockIndex = currentBlockIndex + direction * step;
      if (targetBlockIndex < 0 || targetBlockIndex >= this.getBlockCount()) {
        break;
      }

      const block = this.ensureBlock(targetBlockIndex, 'prefetch');
      if (block) {
        this.evictIfNeeded(currentBlockIndex);
      }
    }
  }

  private getBlockCount(): number {
    if (this.rowCount <= 0) {
      return 0;
    }

    return Math.ceil(this.rowCount / this.cacheConfig.blockSize);
  }

  private getBlockIndexByDataIndex(dataIndex: number): number {
    return Math.floor(dataIndex / this.cacheConfig.blockSize);
  }

  private touchBlock(blockIndex: number): void {
    const cached = this.blockCache.get(blockIndex);
    if (!cached) {
      return;
    }

    this.blockCache.delete(blockIndex);
    this.blockCache.set(blockIndex, cached);
  }

  private trimInvalidBlocks(): void {
    const blockCount = this.getBlockCount();
    for (const blockIndex of Array.from(this.blockCache.keys())) {
      if (blockIndex < blockCount) {
        continue;
      }

      this.blockCache.delete(blockIndex);
    }
  }

  private evictIfNeeded(protectedBlockIndex: number): void {
    if (this.blockCache.size <= this.cacheConfig.maxBlocks) {
      return;
    }

    const blockIndexes = Array.from(this.blockCache.keys());
    for (let index = 0; index < blockIndexes.length && this.blockCache.size > this.cacheConfig.maxBlocks; index += 1) {
      const blockIndex = blockIndexes[index];
      if (blockIndex === protectedBlockIndex) {
        continue;
      }

      const block = this.blockCache.get(blockIndex);
      if (!block) {
        continue;
      }

      if (block.operationId && this.inFlightOperations.has(block.operationId)) {
        continue;
      }

      this.blockCache.delete(blockIndex);
    }
  }

  private cancelAllInFlightOperations(): void {
    const operationIds = Array.from(this.inFlightOperations.keys());
    for (let operationIndex = 0; operationIndex < operationIds.length; operationIndex += 1) {
      this.cancelOperation(operationIds[operationIndex]);
    }
    this.inFlightOperations.clear();
  }

  private emitRowsChanged(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}
