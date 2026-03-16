import type { DataProvider, DataTransaction, GridRowData, RowKey, RowsChangedListener } from './data-provider';
import type { TreeViewRow } from './tree-executor';
import { toTreeNodeKeyToken } from './tree-executor';

const TREE_ROW_KIND = 'tree';

export const TREE_ROW_KIND_FIELD = '__hgrid_internal_row_kind_tree';
export const TREE_ROW_NODE_KEY_FIELD = '__hgrid_internal_tree_node_key';
export const TREE_ROW_NODE_KEY_TOKEN_FIELD = '__hgrid_internal_tree_node_key_token';
export const TREE_ROW_PARENT_NODE_KEY_FIELD = '__hgrid_internal_tree_parent_node_key';
export const TREE_ROW_DEPTH_FIELD = '__hgrid_internal_tree_depth';
export const TREE_ROW_HAS_CHILDREN_FIELD = '__hgrid_internal_tree_has_children';
export const TREE_ROW_EXPANDED_FIELD = '__hgrid_internal_tree_expanded';
export const TREE_ROW_TREE_COLUMN_ID_FIELD = '__hgrid_internal_tree_column_id';

export interface TreeDataProviderSnapshot {
  rows: TreeViewRow[];
  nodeKeys: RowKey[];
  nodeKeyTokens: string[];
}

export function isTreeRowData(row: GridRowData | null | undefined): boolean {
  return Boolean(row && row[TREE_ROW_KIND_FIELD] === TREE_ROW_KIND);
}

export function getTreeRowDepth(row: GridRowData | null | undefined): number {
  if (!row) {
    return 0;
  }

  const value = Number(row[TREE_ROW_DEPTH_FIELD]);
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function cloneRows(rows: TreeViewRow[]): TreeViewRow[] {
  const clonedRows = new Array<TreeViewRow>(rows.length);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    clonedRows[index] = {
      kind: 'tree',
      nodeKey: row.nodeKey,
      parentNodeKey: row.parentNodeKey,
      sourceDataIndex: row.sourceDataIndex,
      depth: row.depth,
      hasChildren: row.hasChildren,
      isExpanded: row.isExpanded,
      localRow: row.localRow ? { ...row.localRow } : null
    };
  }

  return clonedRows;
}

export class TreeDataProvider implements DataProvider {
  private sourceDataProvider: DataProvider;
  private rows: TreeViewRow[] = [];
  private nodeKeys: RowKey[] = [];
  private nodeKeyTokens: string[] = [];
  private treeColumnId = '';
  private rowCache: Array<GridRowData | null> = [];
  private nodeIndexByToken: Map<string, number> = new Map();
  private listeners: Set<RowsChangedListener> = new Set();

  public constructor(sourceDataProvider: DataProvider) {
    this.sourceDataProvider = sourceDataProvider;
  }

  public setSourceDataProvider(sourceDataProvider: DataProvider): void {
    this.sourceDataProvider = sourceDataProvider;
    this.rowCache = new Array<GridRowData | null>(this.rows.length);
    this.emitRowsChanged();
  }

  public setTreeColumnId(treeColumnId: string): void {
    this.treeColumnId = typeof treeColumnId === 'string' ? treeColumnId : '';
    this.rowCache = new Array<GridRowData | null>(this.rows.length);
  }

  public applySnapshot(snapshot: TreeDataProviderSnapshot): void {
    this.rows = cloneRows(snapshot.rows);
    this.nodeKeys = Array.isArray(snapshot.nodeKeys) ? snapshot.nodeKeys.slice() : [];
    this.nodeKeyTokens = Array.isArray(snapshot.nodeKeyTokens)
      ? snapshot.nodeKeyTokens.slice()
      : this.nodeKeys.map((nodeKey) => toTreeNodeKeyToken(nodeKey));
    this.rowCache = new Array<GridRowData | null>(this.rows.length);
    this.nodeIndexByToken = new Map<string, number>();
    for (let index = 0; index < this.nodeKeyTokens.length; index += 1) {
      this.nodeIndexByToken.set(this.nodeKeyTokens[index], index);
    }
    this.emitRowsChanged();
  }

  public getSnapshot(): TreeDataProviderSnapshot {
    return {
      rows: cloneRows(this.rows),
      nodeKeys: this.nodeKeys.slice(),
      nodeKeyTokens: this.nodeKeyTokens.slice()
    };
  }

  public getTreeRow(viewDataIndex: number): TreeViewRow | null {
    if (!Number.isInteger(viewDataIndex) || viewDataIndex < 0 || viewDataIndex >= this.rows.length) {
      return null;
    }

    return this.rows[viewDataIndex];
  }

  public getTreeRowByNodeKey(nodeKey: RowKey): TreeViewRow | null {
    const token = toTreeNodeKeyToken(nodeKey);
    const index = this.nodeIndexByToken.get(token);
    if (index === undefined) {
      return null;
    }

    return this.rows[index] ?? null;
  }

  public getRowCount(): number {
    return this.rows.length;
  }

  public getRowKey(viewDataIndex: number): RowKey {
    const row = this.rows[viewDataIndex];
    if (!row) {
      return viewDataIndex;
    }

    return row.nodeKey;
  }

  public getValue(viewDataIndex: number, columnId: string): unknown {
    const row = this.rows[viewDataIndex];
    if (!row) {
      return undefined;
    }

    if (columnId === TREE_ROW_KIND_FIELD) {
      return TREE_ROW_KIND;
    }

    if (columnId === TREE_ROW_NODE_KEY_FIELD) {
      return row.nodeKey;
    }

    if (columnId === TREE_ROW_NODE_KEY_TOKEN_FIELD) {
      return this.nodeKeyTokens[viewDataIndex] ?? toTreeNodeKeyToken(row.nodeKey);
    }

    if (columnId === TREE_ROW_PARENT_NODE_KEY_FIELD) {
      return row.parentNodeKey;
    }

    if (columnId === TREE_ROW_DEPTH_FIELD) {
      return row.depth;
    }

    if (columnId === TREE_ROW_HAS_CHILDREN_FIELD) {
      return row.hasChildren;
    }

    if (columnId === TREE_ROW_EXPANDED_FIELD) {
      return row.isExpanded;
    }

    if (columnId === TREE_ROW_TREE_COLUMN_ID_FIELD) {
      return this.treeColumnId;
    }

    if (row.sourceDataIndex !== null) {
      return this.sourceDataProvider.getValue(row.sourceDataIndex, columnId);
    }

    return row.localRow ? row.localRow[columnId] : undefined;
  }

  public getRow(viewDataIndex: number): GridRowData | undefined {
    const row = this.rows[viewDataIndex];
    if (!row) {
      return undefined;
    }

    const cachedRow = this.rowCache[viewDataIndex];
    if (cachedRow) {
      return cachedRow;
    }

    let baseRow: GridRowData;
    if (row.sourceDataIndex !== null) {
      const sourceRow = this.sourceDataProvider.getRow?.(row.sourceDataIndex);
      baseRow = sourceRow ? { ...sourceRow } : {};
    } else {
      baseRow = row.localRow ? { ...row.localRow } : {};
    }

    const decoratedRow: GridRowData = {
      ...baseRow,
      [TREE_ROW_KIND_FIELD]: TREE_ROW_KIND,
      [TREE_ROW_NODE_KEY_FIELD]: row.nodeKey,
      [TREE_ROW_NODE_KEY_TOKEN_FIELD]: this.nodeKeyTokens[viewDataIndex] ?? toTreeNodeKeyToken(row.nodeKey),
      [TREE_ROW_PARENT_NODE_KEY_FIELD]: row.parentNodeKey,
      [TREE_ROW_DEPTH_FIELD]: row.depth,
      [TREE_ROW_HAS_CHILDREN_FIELD]: row.hasChildren,
      [TREE_ROW_EXPANDED_FIELD]: row.isExpanded,
      [TREE_ROW_TREE_COLUMN_ID_FIELD]: this.treeColumnId
    };

    this.rowCache[viewDataIndex] = decoratedRow;
    return decoratedRow;
  }

  public peekRow(viewDataIndex: number): GridRowData | undefined {
    return this.getRow(viewDataIndex);
  }

  public setValue(viewDataIndex: number, columnId: string, value: unknown): void {
    const row = this.rows[viewDataIndex];
    if (!row) {
      return;
    }

    if (row.sourceDataIndex !== null) {
      this.sourceDataProvider.setValue(row.sourceDataIndex, columnId, value);
    } else if (row.localRow) {
      row.localRow[columnId] = value;
    }

    const cachedRow = this.rowCache[viewDataIndex];
    if (cachedRow) {
      cachedRow[columnId] = value;
    }
  }

  public applyTransactions(transactions: DataTransaction[]): void {
    this.sourceDataProvider.applyTransactions(transactions);
  }

  public getDataIndexByRowKey(rowKey: RowKey, dataIndexHint?: number): number {
    const rowCount = this.rows.length;
    if (
      Number.isInteger(dataIndexHint) &&
      dataIndexHint !== undefined &&
      dataIndexHint >= 0 &&
      dataIndexHint < rowCount &&
      this.getRowKey(dataIndexHint) === rowKey
    ) {
      return dataIndexHint;
    }

    const token = toTreeNodeKeyToken(rowKey);
    const hintedIndex = this.nodeIndexByToken.get(token);
    if (hintedIndex !== undefined) {
      return hintedIndex;
    }

    return -1;
  }

  public isRowLoading(viewDataIndex: number): boolean {
    const row = this.rows[viewDataIndex];
    if (!row || row.sourceDataIndex === null) {
      return false;
    }

    return this.sourceDataProvider.isRowLoading?.(row.sourceDataIndex) === true;
  }

  public onRowsChanged(listener: RowsChangedListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitRowsChanged(): void {
    this.listeners.forEach((listener) => listener());
  }
}
