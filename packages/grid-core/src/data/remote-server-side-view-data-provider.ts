import type {
  AppliedHistoryCellUpdate,
  DataProvider,
  DataTransaction,
  GridRowData,
  HistoryCellUpdate,
  RowKey
} from './data-provider';
import {
  GROUP_ROW_COLUMN_ID_FIELD,
  GROUP_ROW_EXPANDED_FIELD,
  GROUP_ROW_KEY_FIELD,
  GROUP_ROW_KIND_FIELD,
  GROUP_ROW_LEAF_COUNT_FIELD,
  GROUP_ROW_LEVEL_FIELD
} from './grouped-data-provider';
import type { RemoteDataProvider } from './remote-data-provider';
import type { RemoteServerSideRowMetadata } from './remote-server-side-contracts';
import {
  TREE_ROW_DEPTH_FIELD,
  TREE_ROW_EXPANDED_FIELD,
  TREE_ROW_HAS_CHILDREN_FIELD,
  TREE_ROW_KIND_FIELD,
  TREE_ROW_NODE_KEY_FIELD,
  TREE_ROW_NODE_KEY_TOKEN_FIELD,
  TREE_ROW_PARENT_NODE_KEY_FIELD,
  TREE_ROW_TREE_COLUMN_ID_FIELD
} from './tree-data-provider';
import { toTreeNodeKeyToken } from './tree-executor';

export type RemoteServerSideViewMode = 'flat' | 'grouping' | 'tree';

const REMOTE_GROUP_ROW_KEY_PREFIX = 'remote-group:';

function cloneRow(row: GridRowData | undefined): GridRowData {
  return row ? { ...row } : {};
}

function isGroupLikeRow(metadata: RemoteServerSideRowMetadata | undefined): boolean {
  return Boolean(metadata && (metadata.kind === 'group' || metadata.kind === 'aggregate'));
}

function resolveGroupRowKey(metadata: RemoteServerSideRowMetadata | undefined, dataIndex: number): RowKey {
  if (metadata && (typeof metadata.groupKey === 'string' || typeof metadata.groupKey === 'number')) {
    return `${REMOTE_GROUP_ROW_KEY_PREFIX}${metadata.groupKey}`;
  }

  return `${REMOTE_GROUP_ROW_KEY_PREFIX}${dataIndex}`;
}

function resolveTreeNodeKey(metadata: RemoteServerSideRowMetadata | undefined, fallbackKey: RowKey): RowKey {
  if (metadata && (typeof metadata.treeNodeKey === 'string' || typeof metadata.treeNodeKey === 'number')) {
    return metadata.treeNodeKey;
  }

  return fallbackKey;
}

export class RemoteServerSideViewDataProvider implements DataProvider {
  private sourceDataProvider: RemoteDataProvider;
  private viewMode: RemoteServerSideViewMode = 'flat';
  private treeColumnId = '';
  private rowCache: Array<GridRowData | null> = [];

  public constructor(sourceDataProvider: RemoteDataProvider) {
    this.sourceDataProvider = sourceDataProvider;
  }

  public configure(sourceDataProvider: RemoteDataProvider, viewMode: RemoteServerSideViewMode, treeColumnId: string): void {
    this.sourceDataProvider = sourceDataProvider;
    this.viewMode = viewMode;
    this.treeColumnId = typeof treeColumnId === 'string' ? treeColumnId : '';
    this.rowCache = new Array<GridRowData | null>(this.sourceDataProvider.getRowCount());
  }

  public getSourceDataProvider(): RemoteDataProvider {
    return this.sourceDataProvider;
  }

  public getRowCount(): number {
    return this.sourceDataProvider.getRowCount();
  }

  public getRowKey(dataIndex: number): RowKey {
    const metadata = this.getRowMetadata(dataIndex);
    if (this.viewMode === 'tree') {
      return resolveTreeNodeKey(metadata, this.sourceDataProvider.getRowKey(dataIndex));
    }

    if (this.viewMode === 'grouping' && isGroupLikeRow(metadata)) {
      return resolveGroupRowKey(metadata, dataIndex);
    }

    return this.sourceDataProvider.getRowKey(dataIndex);
  }

  public getValue(dataIndex: number, columnId: string): unknown {
    const metadata = this.getRowMetadata(dataIndex);
    if (this.viewMode === 'grouping' && isGroupLikeRow(metadata)) {
      if (columnId === GROUP_ROW_KIND_FIELD) {
        return 'group';
      }
      if (columnId === GROUP_ROW_KEY_FIELD) {
        return metadata?.groupKey;
      }
      if (columnId === GROUP_ROW_LEVEL_FIELD) {
        return metadata?.level ?? 0;
      }
      if (columnId === GROUP_ROW_COLUMN_ID_FIELD) {
        return metadata?.groupColumnId ?? '';
      }
      if (columnId === GROUP_ROW_LEAF_COUNT_FIELD) {
        return metadata?.childCount ?? 0;
      }
      if (columnId === GROUP_ROW_EXPANDED_FIELD) {
        return metadata?.isExpanded === true || metadata?.isExpandedByDefault === true;
      }
      if (metadata?.aggregateValues && Object.prototype.hasOwnProperty.call(metadata.aggregateValues, columnId)) {
        return metadata.aggregateValues[columnId];
      }
    }

    if (this.viewMode === 'tree' && metadata) {
      const fallbackRowKey = this.sourceDataProvider.getRowKey(dataIndex);
      if (columnId === TREE_ROW_KIND_FIELD) {
        return 'tree';
      }
      if (columnId === TREE_ROW_NODE_KEY_FIELD) {
        return resolveTreeNodeKey(metadata, fallbackRowKey);
      }
      if (columnId === TREE_ROW_NODE_KEY_TOKEN_FIELD) {
        return toTreeNodeKeyToken(resolveTreeNodeKey(metadata, fallbackRowKey));
      }
      if (columnId === TREE_ROW_PARENT_NODE_KEY_FIELD) {
        return metadata.treeParentNodeKey ?? null;
      }
      if (columnId === TREE_ROW_DEPTH_FIELD) {
        return metadata.treeDepth ?? metadata.level ?? 0;
      }
      if (columnId === TREE_ROW_HAS_CHILDREN_FIELD) {
        return metadata.treeHasChildren === true || (metadata.childCount ?? 0) > 0;
      }
      if (columnId === TREE_ROW_EXPANDED_FIELD) {
        return metadata.treeExpanded === true || metadata.isExpanded === true || metadata.isExpandedByDefault === true;
      }
      if (columnId === TREE_ROW_TREE_COLUMN_ID_FIELD) {
        return metadata.treeColumnId ?? this.treeColumnId;
      }
    }

    return this.sourceDataProvider.getValue(dataIndex, columnId);
  }

  public getRow(dataIndex: number): GridRowData | undefined {
    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.getRowCount()) {
      return undefined;
    }

    const cachedRow = this.rowCache[dataIndex];
    if (cachedRow) {
      return cachedRow;
    }

    const metadata = this.getRowMetadata(dataIndex);
    const row = cloneRow(this.sourceDataProvider.getRow?.(dataIndex));

    if (this.viewMode === 'grouping' && isGroupLikeRow(metadata)) {
      if (metadata?.aggregateValues) {
        const keys = Object.keys(metadata.aggregateValues);
        for (let index = 0; index < keys.length; index += 1) {
          const key = keys[index];
          row[key] = metadata.aggregateValues[key];
        }
      }

      row[GROUP_ROW_KIND_FIELD] = 'group';
      row[GROUP_ROW_KEY_FIELD] = metadata?.groupKey;
      row[GROUP_ROW_LEVEL_FIELD] = metadata?.level ?? 0;
      row[GROUP_ROW_COLUMN_ID_FIELD] = metadata?.groupColumnId ?? '';
      row[GROUP_ROW_LEAF_COUNT_FIELD] = metadata?.childCount ?? 0;
      row[GROUP_ROW_EXPANDED_FIELD] = metadata?.isExpanded === true || metadata?.isExpandedByDefault === true;
      this.rowCache[dataIndex] = row;
      return row;
    }

    if (this.viewMode === 'tree' && metadata) {
      const nodeKey = resolveTreeNodeKey(metadata, this.sourceDataProvider.getRowKey(dataIndex));
      row[TREE_ROW_KIND_FIELD] = 'tree';
      row[TREE_ROW_NODE_KEY_FIELD] = nodeKey;
      row[TREE_ROW_NODE_KEY_TOKEN_FIELD] = toTreeNodeKeyToken(nodeKey);
      row[TREE_ROW_PARENT_NODE_KEY_FIELD] = metadata.treeParentNodeKey ?? null;
      row[TREE_ROW_DEPTH_FIELD] = metadata.treeDepth ?? metadata.level ?? 0;
      row[TREE_ROW_HAS_CHILDREN_FIELD] = metadata.treeHasChildren === true || (metadata.childCount ?? 0) > 0;
      row[TREE_ROW_EXPANDED_FIELD] =
        metadata.treeExpanded === true || metadata.isExpanded === true || metadata.isExpandedByDefault === true;
      row[TREE_ROW_TREE_COLUMN_ID_FIELD] = metadata.treeColumnId ?? this.treeColumnId;
      this.rowCache[dataIndex] = row;
      return row;
    }

    this.rowCache[dataIndex] = row;
    return row;
  }

  public peekRow(dataIndex: number): GridRowData | undefined {
    if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= this.getRowCount()) {
      return undefined;
    }

    const sourceRow = this.sourceDataProvider.peekRow?.(dataIndex);
    if (!sourceRow) {
      return undefined;
    }

    return this.getRow(dataIndex);
  }

  public setValue(dataIndex: number, columnId: string, value: unknown): void {
    const metadata = this.getRowMetadata(dataIndex);
    if (this.viewMode === 'grouping' && isGroupLikeRow(metadata)) {
      return;
    }

    this.sourceDataProvider.setValue(dataIndex, columnId, value);
    const cachedRow = this.rowCache[dataIndex];
    if (cachedRow) {
      cachedRow[columnId] = value;
    }
  }

  public applyTransactions(transactions: DataTransaction[]): void {
    const passthroughTransactions: DataTransaction[] = [];
    for (let index = 0; index < transactions.length; index += 1) {
      const transaction = transactions[index];
      if (transaction.type === 'updateCell') {
        this.setValue(transaction.index, transaction.columnId, transaction.value);
        continue;
      }

      passthroughTransactions.push(transaction);
    }

    if (passthroughTransactions.length > 0) {
      this.sourceDataProvider.applyTransactions(passthroughTransactions);
    }
  }

  public applyHistoryUpdates(updates: HistoryCellUpdate[]): AppliedHistoryCellUpdate[] {
    if (typeof this.sourceDataProvider.applyHistoryUpdates !== 'function') {
      return [];
    }

    return this.sourceDataProvider.applyHistoryUpdates(updates);
  }

  public getDataIndexByRowKey(rowKey: RowKey, dataIndexHint?: number): number {
    if (typeof this.sourceDataProvider.getDataIndexByRowKey === 'function') {
      return this.sourceDataProvider.getDataIndexByRowKey(rowKey, dataIndexHint);
    }

    return -1;
  }

  public isRowLoading(dataIndex: number): boolean {
    return this.sourceDataProvider.isRowLoading?.(dataIndex) === true;
  }

  private getRowMetadata(dataIndex: number): RemoteServerSideRowMetadata | undefined {
    if (typeof this.sourceDataProvider.getRowMetadata !== 'function') {
      return undefined;
    }

    return this.sourceDataProvider.getRowMetadata(dataIndex);
  }
}
