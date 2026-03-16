import type {
  AppliedHistoryCellUpdate,
  DataProvider,
  DataTransaction,
  GridRowData,
  HistoryCellUpdate,
  RowKey,
  RowsChangedListener
} from './data-provider';
import type { ColumnDef, GroupModelItem, PivotModelItem, PivotValueDef } from '../core/grid-options';
import { cloneAdvancedFilterModel, type AdvancedFilterModel } from './filter-model';
import {
  cloneRemoteServerSidePivotResult,
  cloneRemoteServerSideQueryModel,
  cloneRemoteServerSideRowMetadata,
  cloneRemoteServerSideRowMetadataList,
  isSameRemoteServerSideQueryModel
} from './remote-server-side-contracts';
import type {
  RemoteServerSidePivotResult,
  RemoteServerSideQueryModel,
  RemoteServerSideRowMetadata
} from './remote-server-side-contracts';
export type {
  RemoteServerSideGroupingAggregation,
  RemoteServerSideGroupingQuery,
  RemoteServerSidePivotResult,
  RemoteServerSideQueryModel,
  RemoteServerSideRequestKind,
  RemoteServerSideRouteItem,
  RemoteServerSideRowKind,
  RemoteServerSideRowMetadata,
  RemoteServerSideStoreStrategy,
  RemoteServerSideTreeQuery
} from './remote-server-side-contracts';

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
  advancedFilterModel?: AdvancedFilterModel;
  groupModel?: GroupModelItem[];
  pivotModel?: PivotModelItem[];
  pivotValues?: PivotValueDef[];
  serverSide?: RemoteServerSideQueryModel;
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
  rowMetadata?: Array<RemoteServerSideRowMetadata | undefined>;
  pivotResult?: RemoteServerSidePivotResult;
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

export type RemoteBlockRuntimeStatus = 'loading' | 'ready' | 'refreshing' | 'error';
export type RemoteQueryChangeScope = 'none' | 'sort' | 'filter' | 'group' | 'pivot' | 'serverSide' | 'mixed';
export type RemoteQueryInvalidationPolicy = 'none' | 'full';

export interface RemoteBlockRangeOptions {
  startIndex?: number;
  endIndex?: number;
  blockIndexes?: number[];
}

export interface RemoteBlockRefreshOptions extends RemoteBlockRangeOptions {
  background?: boolean;
}

export interface RemoteBlockState {
  blockIndex: number;
  startIndex: number;
  endIndex: number;
  status: RemoteBlockRuntimeStatus;
  hasData: boolean;
  errorMessage: string | null;
}

export interface RemoteQueryChangeSummary {
  scope: RemoteQueryChangeScope;
  changedKeys: Array<'sort' | 'filter' | 'group' | 'pivot' | 'serverSide'>;
  invalidationPolicy: RemoteQueryInvalidationPolicy;
}

export interface RemotePendingCellChange {
  columnId: string;
  originalValue: unknown;
  value: unknown;
}

export interface RemotePendingRowChange {
  rowKey: RowKey;
  changes: RemotePendingCellChange[];
}

export interface RemotePendingChangeSummary {
  rowCount: number;
  cellCount: number;
  rowKeys: RowKey[];
}

export interface RemotePendingChangeOptions {
  rowKeys?: RowKey[];
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
  refreshingBlockIndexes: number[];
  errorBlockIndexes: number[];
  blockStates: RemoteBlockState[];
  queryModel: RemoteQueryModel;
  lastQueryChange: RemoteQueryChangeSummary;
  inFlightOperations: number;
  pendingChangeSummary: RemotePendingChangeSummary;
  pivotResultColumnIds: string[];
}

export interface RemoteDataProvider extends DataProvider {
  setQueryModel(queryModel: Partial<RemoteQueryModel>): void;
  getQueryModel(): RemoteQueryModel;
  setServerSideQueryModel(serverSideQueryModel: Partial<RemoteServerSideQueryModel> | undefined): void;
  getServerSideQueryModel(): RemoteServerSideQueryModel | undefined;
  getPivotResult(): RemoteServerSidePivotResult | undefined;
  getPivotResultColumns(): ColumnDef[];
  setDataSource(dataSource: RemoteDataSource): void;
  invalidateCache(): void;
  invalidateBlocks(options?: RemoteBlockRangeOptions): void;
  refreshBlocks(options?: RemoteBlockRefreshOptions): void;
  retryFailedBlocks(options?: RemoteBlockRangeOptions): void;
  cancelOperation(operationId: string): void;
  getCacheConfig(): RemoteCacheConfig;
  getLoadingRowPolicy(): RemoteLoadingRowPolicy;
  getRowMetadata(dataIndex: number): RemoteServerSideRowMetadata | undefined;
  getBlockStates(): RemoteBlockState[];
  getLastQueryChange(): RemoteQueryChangeSummary;
  hasPendingChanges(): boolean;
  getPendingChanges(): RemotePendingRowChange[];
  getPendingChangeSummary(): RemotePendingChangeSummary;
  acceptPendingChanges(options?: RemotePendingChangeOptions): void;
  discardPendingChanges(options?: RemotePendingChangeOptions): void;
  revertPendingChange(rowKey: RowKey, columnId?: string): void;
  getDebugState(): RemoteDataProviderDebugState;
}

interface CachedBlock {
  blockIndex: number;
  startIndex: number;
  endIndex: number;
  status: RemoteBlockRuntimeStatus;
  rows: GridRowData[];
  rowKeys: RowKey[];
  rowMetadata: Array<RemoteServerSideRowMetadata | undefined>;
  operationId: string | null;
  errorMessage: string | null;
}

interface InFlightOperation {
  blockIndex: number;
  abortController: AbortController | null;
}

interface InternalRemotePendingCellChange extends RemotePendingCellChange {
  hadOriginalValue: boolean;
}

interface InternalRemotePendingRowChange {
  rowKey: RowKey;
  dataIndexHint: number | null;
  allowUnloadedValueRead: boolean;
  changes: Map<string, InternalRemotePendingCellChange>;
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

function cloneGroupModel(groupModel: GroupModelItem[] | undefined): GroupModelItem[] | undefined {
  if (!Array.isArray(groupModel)) {
    return undefined;
  }

  const normalizedGroupModel: GroupModelItem[] = [];
  for (let index = 0; index < groupModel.length; index += 1) {
    const item = groupModel[index];
    if (!item || typeof item.columnId !== 'string' || item.columnId.length === 0) {
      continue;
    }

    normalizedGroupModel.push({
      columnId: item.columnId
    });
  }

  return normalizedGroupModel.length > 0 ? normalizedGroupModel : [];
}

function clonePivotModel(pivotModel: PivotModelItem[] | undefined): PivotModelItem[] | undefined {
  if (!Array.isArray(pivotModel)) {
    return undefined;
  }

  const normalizedPivotModel: PivotModelItem[] = [];
  for (let index = 0; index < pivotModel.length; index += 1) {
    const item = pivotModel[index];
    if (!item || typeof item.columnId !== 'string' || item.columnId.length === 0) {
      continue;
    }

    normalizedPivotModel.push({
      columnId: item.columnId
    });
  }

  return normalizedPivotModel.length > 0 ? normalizedPivotModel : [];
}

function clonePivotValues(pivotValues: PivotValueDef[] | undefined): PivotValueDef[] | undefined {
  if (!Array.isArray(pivotValues)) {
    return undefined;
  }

  const normalizedPivotValues: PivotValueDef[] = [];
  for (let index = 0; index < pivotValues.length; index += 1) {
    const item = pivotValues[index];
    if (!item || typeof item.columnId !== 'string' || item.columnId.length === 0) {
      continue;
    }

    normalizedPivotValues.push({
      columnId: item.columnId,
      type: item.type
    });
  }

  return normalizedPivotValues.length > 0 ? normalizedPivotValues : [];
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
    advancedFilterModel: cloneAdvancedFilterModel(queryModel.advancedFilterModel) ?? undefined,
    groupModel: cloneGroupModel(queryModel.groupModel),
    pivotModel: clonePivotModel(queryModel.pivotModel),
    pivotValues: clonePivotValues(queryModel.pivotValues),
    serverSide: cloneRemoteServerSideQueryModel(queryModel.serverSide)
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
    advancedFilterModel: cloneAdvancedFilterModel(input?.advancedFilterModel) ?? undefined,
    groupModel: cloneGroupModel(input?.groupModel),
    pivotModel: clonePivotModel(input?.pivotModel),
    pivotValues: clonePivotValues(input?.pivotValues),
    serverSide: cloneRemoteServerSideQueryModel(input?.serverSide)
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

  if (JSON.stringify(left.advancedFilterModel) !== JSON.stringify(right.advancedFilterModel)) {
    return false;
  }

  if (JSON.stringify(left.groupModel) !== JSON.stringify(right.groupModel)) {
    return false;
  }

  if (JSON.stringify(left.pivotModel) !== JSON.stringify(right.pivotModel)) {
    return false;
  }

  if (JSON.stringify(left.pivotValues) !== JSON.stringify(right.pivotValues)) {
    return false;
  }

  if (!isSameRemoteServerSideQueryModel(left.serverSide, right.serverSide)) {
    return false;
  }

  return true;
}

function createNoQueryChangeSummary(): RemoteQueryChangeSummary {
  return {
    scope: 'none',
    changedKeys: [],
    invalidationPolicy: 'none'
  };
}

function createQueryChangeSummary(left: RemoteQueryModel, right: RemoteQueryModel): RemoteQueryChangeSummary {
  const changedKeys: Array<'sort' | 'filter' | 'group' | 'pivot' | 'serverSide'> = [];
  if (!isSameSortModel(left.sortModel, right.sortModel)) {
    changedKeys.push('sort');
  }

  if (!isSameFilterModel(left.filterModel, right.filterModel)) {
    changedKeys.push('filter');
  }

  if (JSON.stringify(left.advancedFilterModel) !== JSON.stringify(right.advancedFilterModel) && changedKeys.indexOf('filter') === -1) {
    changedKeys.push('filter');
  }

  if (JSON.stringify(left.groupModel) !== JSON.stringify(right.groupModel)) {
    changedKeys.push('group');
  }

  if (JSON.stringify(left.pivotModel) !== JSON.stringify(right.pivotModel) || JSON.stringify(left.pivotValues) !== JSON.stringify(right.pivotValues)) {
    changedKeys.push('pivot');
  }

  if (!isSameRemoteServerSideQueryModel(left.serverSide, right.serverSide)) {
    changedKeys.push('serverSide');
  }

  if (changedKeys.length === 0) {
    return createNoQueryChangeSummary();
  }

  return {
    scope: changedKeys.length === 1 ? changedKeys[0] : 'mixed',
    changedKeys,
    invalidationPolicy: 'full'
  };
}

function hasBlockData(block: CachedBlock): boolean {
  return block.rows.length > 0;
}

function canReadFromBlock(block: CachedBlock | null | undefined): boolean {
  if (!block) {
    return false;
  }

  return block.status === 'ready' || block.status === 'refreshing' || (block.status === 'error' && hasBlockData(block));
}

function isRemoteEditableRow(metadata: RemoteServerSideRowMetadata | undefined): boolean {
  return !metadata || metadata.kind === 'leaf';
}

function clonePendingRowChange(rowChange: InternalRemotePendingRowChange): RemotePendingRowChange {
  return {
    rowKey: rowChange.rowKey,
    changes: Array.from(rowChange.changes.values()).map((cellChange) => ({
      columnId: cellChange.columnId,
      originalValue: cellChange.originalValue,
      value: cellChange.value
    }))
  };
}

function createPendingChangeSummary(rowChanges: Map<RowKey, InternalRemotePendingRowChange>): RemotePendingChangeSummary {
  const rowKeys = Array.from(rowChanges.keys());
  let cellCount = 0;
  rowChanges.forEach((rowChange) => {
    cellCount += rowChange.changes.size;
  });

  return {
    rowCount: rowKeys.length,
    cellCount,
    rowKeys
  };
}

function applyCellValue(row: GridRowData, columnId: string, value: unknown, hadOriginalValue = true): void {
  if (value === undefined && !hadOriginalValue) {
    delete row[columnId];
    return;
  }

  row[columnId] = value;
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
  private readonly pendingRowChanges: Map<RowKey, InternalRemotePendingRowChange> = new Map();
  private pivotResult: RemoteServerSidePivotResult | undefined;
  private requestSequence = 0;
  private queryVersion = 0;
  private lastAccessedDataIndex: number | null = null;
  private lastQueryChange: RemoteQueryChangeSummary = createNoQueryChangeSummary();

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
    if (!block || !canReadFromBlock(block)) {
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
    if (!block || !canReadFromBlock(block)) {
      return undefined;
    }

    return block.rows[dataIndex - block.startIndex];
  }

  public peekRow(dataIndex: number): GridRowData | undefined {
    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.rowCount) {
      return undefined;
    }

    const block = this.getReadableBlockForDataIndex(dataIndex);
    if (!block) {
      return undefined;
    }

    return block.rows[dataIndex - block.startIndex];
  }

  public getValue(dataIndex: number, columnId: string): unknown {
    const pendingValue = this.getPendingValueForDataIndex(dataIndex, columnId);
    if (pendingValue.hasValue) {
      return pendingValue.value;
    }

    const row = this.getRow(dataIndex);
    return row ? row[columnId] : undefined;
  }

  public getRowMetadata(dataIndex: number): RemoteServerSideRowMetadata | undefined {
    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.rowCount) {
      return undefined;
    }

    const block = this.ensureBlockForDataIndex(dataIndex, true);
    if (!block || !canReadFromBlock(block)) {
      return undefined;
    }

    return cloneRemoteServerSideRowMetadata(block.rowMetadata[dataIndex - block.startIndex]);
  }

  public setValue(dataIndex: number, columnId: string, value: unknown): void {
    if (this.applyUpdateCellTransaction(dataIndex, columnId, value)) {
      this.emitRowsChanged();
    }
  }

  public applyTransactions(transactions: DataTransaction[]): void {
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return;
    }

    let shouldNotify = false;
    for (let transactionIndex = 0; transactionIndex < transactions.length; transactionIndex += 1) {
      const transaction = transactions[transactionIndex];

      if (transaction.type === 'updateCell') {
        shouldNotify = this.applyUpdateCellTransaction(transaction.index, transaction.columnId, transaction.value) || shouldNotify;
        continue;
      }

      if (transaction.type === 'update') {
        shouldNotify = this.applyUpdateRowTransaction(transaction.index, transaction.row) || shouldNotify;
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

  public applyHistoryUpdates(updates: HistoryCellUpdate[]): AppliedHistoryCellUpdate[] {
    if (!Array.isArray(updates) || updates.length === 0) {
      return [];
    }

    const appliedUpdates: AppliedHistoryCellUpdate[] = [];
    for (let index = 0; index < updates.length; index += 1) {
      const update = updates[index];
      const dataIndex = this.applyHistoryCellUpdate(update);
      if (dataIndex < 0) {
        continue;
      }

      appliedUpdates.push({
        rowKey: update.rowKey,
        dataIndex,
        columnId: update.columnId,
        previousValue: update.currentValue,
        value: update.nextValue
      });
    }

    if (appliedUpdates.length > 0) {
      this.emitRowsChanged();
    }

    return appliedUpdates;
  }

  public getDataIndexByRowKey(rowKey: RowKey, dataIndexHint?: number): number {
    if (Number.isInteger(dataIndexHint) && dataIndexHint !== undefined && dataIndexHint >= 0 && dataIndexHint < this.rowCount) {
      const hintBlock = this.ensureBlockForDataIndex(dataIndexHint, true);
      if (hintBlock && canReadFromBlock(hintBlock)) {
        const rowOffset = dataIndexHint - hintBlock.startIndex;
        if (rowOffset >= 0 && rowOffset < hintBlock.rows.length && this.resolveRowKey(hintBlock, rowOffset) === rowKey) {
          return dataIndexHint;
        }
      }
    }

    const blocks = Array.from(this.blockCache.values());
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex];
      if (!canReadFromBlock(block)) {
        continue;
      }

      for (let rowOffset = 0; rowOffset < block.rows.length; rowOffset += 1) {
        if (this.resolveRowKey(block, rowOffset) === rowKey) {
          return block.startIndex + rowOffset;
        }
      }
    }

    return -1;
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
    return !block || block.status === 'loading';
  }

  public setQueryModel(queryModel: Partial<RemoteQueryModel>): void {
    const hasSortModel = Object.prototype.hasOwnProperty.call(queryModel, 'sortModel');
    const hasFilterModel = Object.prototype.hasOwnProperty.call(queryModel, 'filterModel');
    const hasAdvancedFilterModel = Object.prototype.hasOwnProperty.call(queryModel, 'advancedFilterModel');
    const hasGroupModel = Object.prototype.hasOwnProperty.call(queryModel, 'groupModel');
    const hasPivotModel = Object.prototype.hasOwnProperty.call(queryModel, 'pivotModel');
    const hasPivotValues = Object.prototype.hasOwnProperty.call(queryModel, 'pivotValues');
    const hasServerSide = Object.prototype.hasOwnProperty.call(queryModel, 'serverSide');

    const nextQueryModel: RemoteQueryModel = {
      sortModel: hasSortModel ? cloneSortModel(queryModel.sortModel) : this.queryModel.sortModel,
      filterModel: hasFilterModel ? cloneFilterModel(queryModel.filterModel) : this.queryModel.filterModel,
      advancedFilterModel: hasAdvancedFilterModel
        ? cloneAdvancedFilterModel(queryModel.advancedFilterModel) ?? undefined
        : this.queryModel.advancedFilterModel,
      groupModel: hasGroupModel ? cloneGroupModel(queryModel.groupModel) : this.queryModel.groupModel,
      pivotModel: hasPivotModel ? clonePivotModel(queryModel.pivotModel) : this.queryModel.pivotModel,
      pivotValues: hasPivotValues ? clonePivotValues(queryModel.pivotValues) : this.queryModel.pivotValues,
      serverSide: hasServerSide ? cloneRemoteServerSideQueryModel(queryModel.serverSide) : this.queryModel.serverSide
    };

    const queryChange = createQueryChangeSummary(this.queryModel, nextQueryModel);
    if (queryChange.invalidationPolicy === 'none') {
      return;
    }

    this.queryModel = cloneQueryModel(nextQueryModel);
    this.lastQueryChange = queryChange;
    this.queryVersion += 1;
    this.invalidateCache();
  }

  public getQueryModel(): RemoteQueryModel {
    return cloneQueryModel(this.queryModel);
  }

  public setServerSideQueryModel(serverSideQueryModel: Partial<RemoteServerSideQueryModel> | undefined): void {
    this.setQueryModel({
      serverSide: cloneRemoteServerSideQueryModel(serverSideQueryModel)
    });
  }

  public getServerSideQueryModel(): RemoteServerSideQueryModel | undefined {
    return cloneRemoteServerSideQueryModel(this.queryModel.serverSide);
  }

  public getPivotResult(): RemoteServerSidePivotResult | undefined {
    return cloneRemoteServerSidePivotResult(this.pivotResult);
  }

  public getPivotResultColumns(): ColumnDef[] {
    return cloneRemoteServerSidePivotResult(this.pivotResult)?.columns ?? [];
  }

  public setDataSource(dataSource: RemoteDataSource): void {
    this.dataSource = dataSource;
    this.pendingRowChanges.clear();
    this.queryVersion += 1;
    this.invalidateCache();
  }

  public invalidateCache(): void {
    this.cancelAllInFlightOperations();
    this.blockCache.clear();
    this.pivotResult = undefined;
    this.lastAccessedDataIndex = null;
    this.emitRowsChanged();
  }

  public invalidateBlocks(options?: RemoteBlockRangeOptions): void {
    const targetBlockIndexes = this.resolveTargetBlockIndexes(options, false);
    let hasChanged = false;

    for (let index = 0; index < targetBlockIndexes.length; index += 1) {
      const blockIndex = targetBlockIndexes[index];
      if (!this.blockCache.has(blockIndex)) {
        continue;
      }

      this.cancelInFlightOperationsForBlock(blockIndex);
      this.blockCache.delete(blockIndex);
      hasChanged = true;
    }

    if (hasChanged) {
      if (this.blockCache.size === 0) {
        this.pivotResult = undefined;
        this.lastAccessedDataIndex = null;
      }
      this.emitRowsChanged();
    }
  }

  public refreshBlocks(options?: RemoteBlockRefreshOptions): void {
    this.refreshTargetBlocks(this.resolveTargetBlockIndexes(options, true), options?.background === true);
  }

  public retryFailedBlocks(options?: RemoteBlockRangeOptions): void {
    const targetBlockIndexes = this.resolveTargetBlockIndexes(options, false).filter((blockIndex) => {
      const block = this.blockCache.get(blockIndex);
      return Boolean(block && block.status === 'error');
    });

    let hasChanged = false;
    for (let index = 0; index < targetBlockIndexes.length; index += 1) {
      const blockIndex = targetBlockIndexes[index];
      const block = this.blockCache.get(blockIndex);
      if (!block) {
        continue;
      }

      this.cancelInFlightOperationsForBlock(blockIndex);
      if (!hasBlockData(block)) {
        block.rows = [];
        block.rowKeys = [];
        block.rowMetadata = [];
      }
      block.endIndex = this.getExpectedBlockEndIndex(blockIndex);
      block.status = hasBlockData(block) ? 'refreshing' : 'loading';
      block.errorMessage = null;
      this.fetchBlock(block, { background: hasBlockData(block) });
      hasChanged = true;
    }

    if (hasChanged) {
      this.emitRowsChanged();
    }
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

  public getBlockStates(): RemoteBlockState[] {
    const states = Array.from(this.blockCache.values()).map((block) => ({
      blockIndex: block.blockIndex,
      startIndex: block.startIndex,
      endIndex: block.endIndex,
      status: block.status,
      hasData: hasBlockData(block),
      errorMessage: block.errorMessage
    }));

    states.sort((left, right) => left.blockIndex - right.blockIndex);
    return states;
  }

  public getLastQueryChange(): RemoteQueryChangeSummary {
    return {
      scope: this.lastQueryChange.scope,
      changedKeys: this.lastQueryChange.changedKeys.slice(),
      invalidationPolicy: this.lastQueryChange.invalidationPolicy
    };
  }

  public hasPendingChanges(): boolean {
    return this.pendingRowChanges.size > 0;
  }

  public getPendingChanges(): RemotePendingRowChange[] {
    return Array.from(this.pendingRowChanges.values()).map((rowChange) => clonePendingRowChange(rowChange));
  }

  public getPendingChangeSummary(): RemotePendingChangeSummary {
    return createPendingChangeSummary(this.pendingRowChanges);
  }

  public acceptPendingChanges(options?: RemotePendingChangeOptions): void {
    const targetRowKeys = this.resolvePendingTargetRowKeys(options);
    if (targetRowKeys.length === 0) {
      return;
    }

    for (let index = 0; index < targetRowKeys.length; index += 1) {
      this.pendingRowChanges.delete(targetRowKeys[index]);
    }

    this.emitRowsChanged();
  }

  public discardPendingChanges(options?: RemotePendingChangeOptions): void {
    const targetRowKeys = this.resolvePendingTargetRowKeys(options);
    if (targetRowKeys.length === 0) {
      return;
    }

    for (let index = 0; index < targetRowKeys.length; index += 1) {
      this.revertPendingRow(targetRowKeys[index]);
    }

    this.emitRowsChanged();
  }

  public revertPendingChange(rowKey: RowKey, columnId?: string): void {
    const rowChange = this.pendingRowChanges.get(rowKey);
    if (!rowChange) {
      return;
    }

    if (typeof columnId === 'string' && columnId.length > 0) {
      const cellChange = rowChange.changes.get(columnId);
      if (!cellChange) {
        return;
      }

      this.applyPendingCellRollback(rowKey, cellChange);
      rowChange.changes.delete(columnId);
      if (rowChange.changes.size === 0) {
        this.pendingRowChanges.delete(rowKey);
      }
      this.emitRowsChanged();
      return;
    }

    this.revertPendingRow(rowKey);
    this.emitRowsChanged();
  }

  public getDebugState(): RemoteDataProviderDebugState {
    const cachedBlockIndexes = Array.from(this.blockCache.keys()).sort((left, right) => left - right);
    const loadingBlockIndexes = cachedBlockIndexes.filter((blockIndex) => {
      const block = this.blockCache.get(blockIndex);
      return block?.status === 'loading';
    });
    const refreshingBlockIndexes = cachedBlockIndexes.filter((blockIndex) => {
      const block = this.blockCache.get(blockIndex);
      return block?.status === 'refreshing';
    });
    const errorBlockIndexes = cachedBlockIndexes.filter((blockIndex) => {
      const block = this.blockCache.get(blockIndex);
      return block?.status === 'error';
    });

    return {
      rowCount: this.rowCount,
      blockSize: this.cacheConfig.blockSize,
      maxBlocks: this.cacheConfig.maxBlocks,
      prefetchBlocks: this.cacheConfig.prefetchBlocks,
      cachedBlockIndexes,
      loadingBlockIndexes,
      refreshingBlockIndexes,
      errorBlockIndexes,
      blockStates: this.getBlockStates(),
      queryModel: this.getQueryModel(),
      lastQueryChange: this.getLastQueryChange(),
      inFlightOperations: this.inFlightOperations.size,
      pendingChangeSummary: this.getPendingChangeSummary(),
      pivotResultColumnIds: this.getPivotResultColumns().map((column) => column.id)
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
        rowMetadata: [],
        operationId: null,
        errorMessage: null
      };
      this.blockCache.set(blockIndex, block);
      this.fetchBlock(block);
      this.evictIfNeeded(blockIndex);
      return block;
    }

    const expectedEndIndex = this.getExpectedBlockEndIndex(blockIndex);
    const expectedLength = expectedEndIndex - block.startIndex;
    if (block.endIndex !== expectedEndIndex) {
      block.endIndex = expectedEndIndex;
      if (block.status === 'ready') {
        block.rows = block.rows.slice(0, expectedLength);
        block.rowKeys = block.rowKeys.slice(0, expectedLength);
        block.rowMetadata = block.rowMetadata.slice(0, expectedLength);
      }
    }

    if (
      (block.status === 'ready' || block.status === 'refreshing') &&
      expectedLength > 0 &&
      (block.rows.length < expectedLength || block.rowKeys.length < expectedLength || block.rowMetadata.length < expectedLength)
    ) {
      block.status = 'loading';
      block.errorMessage = null;
      this.fetchBlock(block, { background: false });
    }

    if (block.status === 'error' && !hasBlockData(block)) {
      block.status = 'loading';
      block.errorMessage = null;
      this.fetchBlock(block, { background: false });
    }

    this.touchBlock(blockIndex);
    if (reason === 'read') {
      this.evictIfNeeded(blockIndex);
    }
    return block;
  }

  private fetchBlock(block: CachedBlock, options?: { background?: boolean }): void {
    const blockIndex = block.blockIndex;
    const currentOperationId = block.operationId;
    if (currentOperationId && this.inFlightOperations.has(currentOperationId)) {
      return;
    }

    const operationId = `remote-${this.queryVersion}-${blockIndex}-${++this.requestSequence}`;
    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    const shouldUseBackgroundRefresh = options?.background === true && hasBlockData(block);
    block.status = shouldUseBackgroundRefresh ? 'refreshing' : 'loading';
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

        const sourceRows = Array.isArray(response.rows) ? response.rows : [];

        if (Number.isFinite(response.totalRowCount)) {
          const nextRowCount = Math.max(0, Math.floor(Number(response.totalRowCount)));
          if (this.rowCount !== nextRowCount) {
            this.rowCount = nextRowCount;
            this.trimInvalidBlocks();
          }
        }

        const maxBlockEndIndex = this.getExpectedBlockEndIndex(blockIndex);
        if (sourceRows.length > currentBlock.endIndex - currentBlock.startIndex) {
          currentBlock.endIndex = Math.min(currentBlock.startIndex + sourceRows.length, maxBlockEndIndex);
        } else {
          currentBlock.endIndex = Math.min(currentBlock.endIndex, maxBlockEndIndex);
        }

        const expectedLength = currentBlock.endIndex - currentBlock.startIndex;
        const rows: GridRowData[] = new Array(expectedLength);
        const rowKeys: RowKey[] = new Array(expectedLength);
        const rowMetadata = cloneRemoteServerSideRowMetadataList(response.rowMetadata, expectedLength);
        for (let rowOffset = 0; rowOffset < expectedLength; rowOffset += 1) {
          const row = sourceRows[rowOffset] ? { ...sourceRows[rowOffset] } : {};
          const rowKey =
            Array.isArray(response.rowKeys) && response.rowKeys.length > rowOffset
              ? response.rowKeys[rowOffset]
              : getFallbackRowKey(row, currentBlock.startIndex + rowOffset);
          this.applyPendingValuesToRow(rowKey, row);
          rows[rowOffset] = row;
          rowKeys[rowOffset] = rowKey;
        }

        currentBlock.rows = rows;
        currentBlock.rowKeys = rowKeys;
        currentBlock.rowMetadata = rowMetadata;
        this.pivotResult = cloneRemoteServerSidePivotResult(response.pivotResult);
        currentBlock.status = 'ready';
        currentBlock.errorMessage = null;
        this.touchBlock(blockIndex);

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

  private resolveTargetBlockIndexes(options: RemoteBlockRangeOptions | RemoteBlockRefreshOptions | undefined, includeMissing: boolean): number[] {
    const blockCount = this.getBlockCount();
    const seenBlockIndexes = new Set<number>();
    const targetBlockIndexes: number[] = [];

    if (Array.isArray(options?.blockIndexes) && options.blockIndexes.length > 0) {
      for (let index = 0; index < options.blockIndexes.length; index += 1) {
        const blockIndex = Math.floor(options.blockIndexes[index]);
        if (blockIndex < 0 || blockIndex >= blockCount || seenBlockIndexes.has(blockIndex)) {
          continue;
        }

        if (includeMissing || this.blockCache.has(blockIndex)) {
          seenBlockIndexes.add(blockIndex);
          targetBlockIndexes.push(blockIndex);
        }
      }
    } else if (Number.isFinite(options?.startIndex) || Number.isFinite(options?.endIndex)) {
      const startIndex = Math.max(0, Math.floor(Number(options?.startIndex ?? 0)));
      const endIndex = Math.max(startIndex + 1, Math.floor(Number(options?.endIndex ?? startIndex + 1)));
      const startBlockIndex = this.getBlockIndexByDataIndex(startIndex);
      const endBlockIndex = this.getBlockIndexByDataIndex(Math.max(startIndex, endIndex - 1));
      for (let blockIndex = startBlockIndex; blockIndex <= endBlockIndex; blockIndex += 1) {
        if (blockIndex < 0 || blockIndex >= blockCount || seenBlockIndexes.has(blockIndex)) {
          continue;
        }

        if (includeMissing || this.blockCache.has(blockIndex)) {
          seenBlockIndexes.add(blockIndex);
          targetBlockIndexes.push(blockIndex);
        }
      }
    } else {
      const cachedBlockIndexes = Array.from(this.blockCache.keys()).sort((left, right) => left - right);
      for (let index = 0; index < cachedBlockIndexes.length; index += 1) {
        const blockIndex = cachedBlockIndexes[index];
        if (seenBlockIndexes.has(blockIndex)) {
          continue;
        }

        seenBlockIndexes.add(blockIndex);
        targetBlockIndexes.push(blockIndex);
      }
    }

    return targetBlockIndexes;
  }

  private getBlockCount(): number {
    if (this.rowCount <= 0) {
      return 0;
    }

    return Math.ceil(this.rowCount / this.cacheConfig.blockSize);
  }

  private getExpectedBlockEndIndex(blockIndex: number): number {
    return Math.min(this.rowCount, (blockIndex + 1) * this.cacheConfig.blockSize);
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

  private refreshTargetBlocks(blockIndexes: number[], background: boolean): void {
    let hasChanged = false;

    for (let index = 0; index < blockIndexes.length; index += 1) {
      const blockIndex = blockIndexes[index];
      let block = this.blockCache.get(blockIndex);
      if (!block) {
        if (blockIndex < 0 || blockIndex >= this.getBlockCount()) {
          continue;
        }

        block = {
          blockIndex,
          startIndex: blockIndex * this.cacheConfig.blockSize,
          endIndex: this.getExpectedBlockEndIndex(blockIndex),
          status: 'loading',
          rows: [],
          rowKeys: [],
          rowMetadata: [],
          operationId: null,
          errorMessage: null
        };
        this.blockCache.set(blockIndex, block);
      }

      this.cancelInFlightOperationsForBlock(blockIndex);
      block.endIndex = this.getExpectedBlockEndIndex(blockIndex);
      if (!background || !hasBlockData(block)) {
        block.rows = [];
        block.rowKeys = [];
        block.rowMetadata = [];
      }
      block.status = background && hasBlockData(block) ? 'refreshing' : 'loading';
      block.errorMessage = null;
      this.fetchBlock(block, { background });
      hasChanged = true;
    }

    if (hasChanged) {
      this.emitRowsChanged();
    }
  }

  private cancelAllInFlightOperations(): void {
    const operationIds = Array.from(this.inFlightOperations.keys());
    for (let operationIndex = 0; operationIndex < operationIds.length; operationIndex += 1) {
      this.cancelOperation(operationIds[operationIndex]);
    }
    this.inFlightOperations.clear();
  }

  private cancelInFlightOperationsForBlock(blockIndex: number): void {
    const inFlightEntries = Array.from(this.inFlightOperations.entries());
    for (let index = 0; index < inFlightEntries.length; index += 1) {
      const [operationId, inFlightOperation] = inFlightEntries[index];
      if (inFlightOperation.blockIndex !== blockIndex) {
        continue;
      }

      this.cancelOperation(operationId);
      this.inFlightOperations.delete(operationId);
      const block = this.blockCache.get(blockIndex);
      if (block && block.operationId === operationId) {
        block.operationId = null;
      }
    }
  }

  private getReadableBlockForDataIndex(dataIndex: number): CachedBlock | null {
    const block = this.blockCache.get(this.getBlockIndexByDataIndex(dataIndex));
    if (!block || !canReadFromBlock(block)) {
      return null;
    }

    return block;
  }

  private peekRowKey(dataIndex: number): RowKey | undefined {
    const block = this.getReadableBlockForDataIndex(dataIndex);
    if (!block) {
      return undefined;
    }

    const rowOffset = dataIndex - block.startIndex;
    if (rowOffset < 0 || rowOffset >= block.rows.length) {
      return undefined;
    }

    return this.resolveRowKey(block, rowOffset);
  }

  private resolveRowKey(block: CachedBlock, rowOffset: number): RowKey {
    const rowKey = block.rowKeys[rowOffset];
    if (typeof rowKey === 'string' || typeof rowKey === 'number') {
      return rowKey;
    }

    return getFallbackRowKey(block.rows[rowOffset], block.startIndex + rowOffset);
  }

  private applyUpdateCellTransaction(dataIndex: number, columnId: string, value: unknown): boolean {
    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.rowCount) {
      return false;
    }

    const block = this.getReadableBlockForDataIndex(dataIndex);
    if (!block) {
      return false;
    }

    const rowOffset = dataIndex - block.startIndex;
    const row = block.rows[rowOffset];
    if (!row || !isRemoteEditableRow(block.rowMetadata[rowOffset])) {
      return false;
    }

    if (Object.is(row[columnId], value)) {
      return false;
    }

    const rowKey = this.resolveRowKey(block, rowOffset);
    this.recordPendingValue(rowKey, row, columnId, value, dataIndex);
    applyCellValue(row, columnId, value);
    return true;
  }

  private applyUpdateRowTransaction(dataIndex: number, nextRow: GridRowData): boolean {
    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.rowCount) {
      return false;
    }

    const block = this.getReadableBlockForDataIndex(dataIndex);
    if (!block) {
      return false;
    }

    const rowOffset = dataIndex - block.startIndex;
    const row = block.rows[rowOffset];
    if (!row || !isRemoteEditableRow(block.rowMetadata[rowOffset])) {
      return false;
    }

    const rowKey = this.resolveRowKey(block, rowOffset);
    const nextLoadedRow: GridRowData = { ...nextRow };
    const keys = new Set<string>([...Object.keys(row), ...Object.keys(nextLoadedRow)]);
    let hasChanged = false;
    keys.forEach((columnId) => {
      const nextValue = nextLoadedRow[columnId];
      if (Object.is(row[columnId], nextValue)) {
        return;
      }

      this.recordPendingValue(rowKey, row, columnId, nextValue, dataIndex);
      hasChanged = true;
    });

    if (!hasChanged) {
      return false;
    }

    this.applyPendingValuesToRow(rowKey, nextLoadedRow);
    block.rows[rowOffset] = nextLoadedRow;
    return true;
  }

  private applyHistoryCellUpdate(update: HistoryCellUpdate): number {
    const hintedDataIndex = update.dataIndexHint;
    if (Number.isInteger(hintedDataIndex) && hintedDataIndex >= 0 && hintedDataIndex < this.rowCount) {
      const hintedBlock = this.getReadableBlockForDataIndex(hintedDataIndex);
      if (hintedBlock) {
        const rowOffset = hintedDataIndex - hintedBlock.startIndex;
        if (
          rowOffset >= 0 &&
          rowOffset < hintedBlock.rows.length &&
          this.resolveRowKey(hintedBlock, rowOffset) === update.rowKey &&
          isRemoteEditableRow(hintedBlock.rowMetadata[rowOffset])
        ) {
          const row = hintedBlock.rows[rowOffset];
          if (!row) {
            return -1;
          }

          if (!Object.is(row[update.columnId], update.nextValue)) {
            this.recordPendingValue(update.rowKey, row, update.columnId, update.nextValue, hintedDataIndex, true);
            applyCellValue(row, update.columnId, update.nextValue);
          }
          return hintedDataIndex;
        }
      }
    }

    const rowChange = this.resolveOrCreatePendingRowChangeForHistory(update);
    const currentCellChange = rowChange.changes.get(update.columnId);
    const currentValue = currentCellChange ? currentCellChange.value : update.currentValue;
    if (Object.is(currentValue, update.nextValue)) {
      return update.dataIndexHint;
    }

    if (!currentCellChange) {
      rowChange.changes.set(update.columnId, {
        columnId: update.columnId,
        originalValue: update.currentValue,
        value: update.nextValue,
        hadOriginalValue: true
      });
    } else if (Object.is(update.nextValue, currentCellChange.originalValue)) {
      rowChange.changes.delete(update.columnId);
      if (rowChange.changes.size === 0) {
        this.pendingRowChanges.delete(update.rowKey);
      }
    } else {
      currentCellChange.value = update.nextValue;
    }

    const loadedRows = this.findLoadedRowsByKey(update.rowKey);
    for (let matchIndex = 0; matchIndex < loadedRows.length; matchIndex += 1) {
      const match = loadedRows[matchIndex];
      const pendingRowChange = this.pendingRowChanges.get(update.rowKey);
      const pendingCellChange = pendingRowChange?.changes.get(update.columnId);
      if (pendingCellChange) {
        applyCellValue(match.row, update.columnId, pendingCellChange.value);
      } else {
        applyCellValue(match.row, update.columnId, update.nextValue);
      }
    }

    return update.dataIndexHint;
  }

  private resolveOrCreatePendingRowChangeForHistory(update: HistoryCellUpdate): InternalRemotePendingRowChange {
    let rowChange = this.pendingRowChanges.get(update.rowKey);
    if (!rowChange) {
      rowChange = {
        rowKey: update.rowKey,
        dataIndexHint: update.dataIndexHint,
        allowUnloadedValueRead: true,
        changes: new Map()
      };
      this.pendingRowChanges.set(update.rowKey, rowChange);
    }

    if (!Number.isInteger(rowChange.dataIndexHint) || rowChange.dataIndexHint === null) {
      rowChange.dataIndexHint = update.dataIndexHint;
    }
    rowChange.allowUnloadedValueRead = true;

    return rowChange;
  }

  private recordPendingValue(
    rowKey: RowKey,
    row: GridRowData,
    columnId: string,
    value: unknown,
    dataIndexHint?: number,
    allowUnloadedValueRead = false
  ): void {
    let rowChange = this.pendingRowChanges.get(rowKey);
    if (!rowChange) {
      rowChange = {
        rowKey,
        dataIndexHint: Number.isInteger(dataIndexHint) ? Number(dataIndexHint) : null,
        allowUnloadedValueRead,
        changes: new Map()
      };
      this.pendingRowChanges.set(rowKey, rowChange);
    }

    if (Number.isInteger(dataIndexHint)) {
      rowChange.dataIndexHint = Number(dataIndexHint);
    }
    rowChange.allowUnloadedValueRead = rowChange.allowUnloadedValueRead || allowUnloadedValueRead;

    const existingCellChange = rowChange.changes.get(columnId);
    if (!existingCellChange) {
      rowChange.changes.set(columnId, {
        columnId,
        originalValue: row[columnId],
        value,
        hadOriginalValue: Object.prototype.hasOwnProperty.call(row, columnId)
      });
      return;
    }

    if (Object.is(value, existingCellChange.originalValue)) {
      rowChange.changes.delete(columnId);
      if (rowChange.changes.size === 0) {
        this.pendingRowChanges.delete(rowKey);
      }
      return;
    }

    existingCellChange.value = value;
  }

  private getPendingValueForDataIndex(dataIndex: number, columnId: string): { hasValue: boolean; value: unknown } {
    const pendingRows = Array.from(this.pendingRowChanges.values());
    for (let index = 0; index < pendingRows.length; index += 1) {
      const rowChange = pendingRows[index];
      if (!rowChange.allowUnloadedValueRead || rowChange.dataIndexHint !== dataIndex) {
        continue;
      }

      const cellChange = rowChange.changes.get(columnId);
      if (!cellChange) {
        continue;
      }

      return {
        hasValue: true,
        value: cellChange.value
      };
    }

    return {
      hasValue: false,
      value: undefined
    };
  }

  private applyPendingValuesToRow(rowKey: RowKey, row: GridRowData): void {
    const rowChange = this.pendingRowChanges.get(rowKey);
    if (!rowChange) {
      return;
    }

    rowChange.changes.forEach((cellChange) => {
      applyCellValue(row, cellChange.columnId, cellChange.value);
    });
  }

  private resolvePendingTargetRowKeys(options?: RemotePendingChangeOptions): RowKey[] {
    if (!Array.isArray(options?.rowKeys) || options.rowKeys.length === 0) {
      return Array.from(this.pendingRowChanges.keys());
    }

    const targetRowKeys: RowKey[] = [];
    for (let index = 0; index < options.rowKeys.length; index += 1) {
      const rowKey = options.rowKeys[index];
      if (!this.pendingRowChanges.has(rowKey)) {
        continue;
      }

      targetRowKeys.push(rowKey);
    }

    return targetRowKeys;
  }

  private revertPendingRow(rowKey: RowKey): void {
    const rowChange = this.pendingRowChanges.get(rowKey);
    if (!rowChange) {
      return;
    }

    rowChange.changes.forEach((cellChange) => {
      this.applyPendingCellRollback(rowKey, cellChange);
    });
    this.pendingRowChanges.delete(rowKey);
  }

  private applyPendingCellRollback(rowKey: RowKey, cellChange: InternalRemotePendingCellChange): void {
    const loadedRows = this.findLoadedRowsByKey(rowKey);
    for (let index = 0; index < loadedRows.length; index += 1) {
      const match = loadedRows[index];
      applyCellValue(match.row, cellChange.columnId, cellChange.originalValue, cellChange.hadOriginalValue);
    }
  }

  private findLoadedRowsByKey(rowKey: RowKey): Array<{ row: GridRowData; dataIndex: number }> {
    const matches: Array<{ row: GridRowData; dataIndex: number }> = [];
    const blocks = Array.from(this.blockCache.values());
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
      const block = blocks[blockIndex];
      if (!canReadFromBlock(block)) {
        continue;
      }

      for (let rowOffset = 0; rowOffset < block.rows.length; rowOffset += 1) {
        if (this.resolveRowKey(block, rowOffset) !== rowKey) {
          continue;
        }

        const row = block.rows[rowOffset];
        if (!row) {
          continue;
        }

        matches.push({
          row,
          dataIndex: block.startIndex + rowOffset
        });
      }
    }

    return matches;
  }

  private emitRowsChanged(): void {
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}
