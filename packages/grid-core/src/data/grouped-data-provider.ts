import type { DataProvider, DataTransaction, GridRowData, RowKey, RowsChangedListener } from './data-provider';
import type { GroupViewGroupRow, GroupViewRow } from './group-executor';

const GROUP_ROW_KEY_PREFIX = 'group:';
const GROUP_ROW_KIND = 'group';

export const GROUP_ROW_KIND_FIELD = '__hgrid_internal_row_kind';
export const GROUP_ROW_KEY_FIELD = '__hgrid_internal_group_key';
export const GROUP_ROW_LEVEL_FIELD = '__hgrid_internal_group_level';
export const GROUP_ROW_COLUMN_ID_FIELD = '__hgrid_internal_group_column_id';
export const GROUP_ROW_LEAF_COUNT_FIELD = '__hgrid_internal_group_leaf_count';
export const GROUP_ROW_EXPANDED_FIELD = '__hgrid_internal_group_expanded';

export interface GroupedDataProviderSnapshot {
  rows: GroupViewRow[];
  groupKeys: string[];
}

export function isGroupRowData(row: GridRowData | null | undefined): boolean {
  return Boolean(row && row[GROUP_ROW_KIND_FIELD] === GROUP_ROW_KIND);
}

export function getGroupRowLevel(row: GridRowData | null | undefined): number {
  if (!row) {
    return 0;
  }

  const level = Number(row[GROUP_ROW_LEVEL_FIELD]);
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.max(0, Math.floor(level));
}

function cloneRows(rows: GroupViewRow[]): GroupViewRow[] {
  const clonedRows = new Array<GroupViewRow>(rows.length);
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.kind === 'data') {
      clonedRows[index] = {
        kind: 'data',
        dataIndex: row.dataIndex
      };
      continue;
    }

    clonedRows[index] = {
      kind: 'group',
      groupKey: row.groupKey,
      level: row.level,
      columnId: row.columnId,
      value: row.value,
      leafCount: row.leafCount,
      isExpanded: row.isExpanded,
      values: { ...row.values }
    };
  }

  return clonedRows;
}

export class GroupedDataProvider implements DataProvider {
  private sourceDataProvider: DataProvider;
  private rows: GroupViewRow[] = [];
  private groupKeys: string[] = [];
  private groupRowsByKey: Map<string, GroupViewGroupRow> = new Map();
  private groupRowObjects: Array<GridRowData | null> = [];
  private listeners: Set<RowsChangedListener> = new Set();

  public constructor(sourceDataProvider: DataProvider) {
    this.sourceDataProvider = sourceDataProvider;
  }

  public setSourceDataProvider(sourceDataProvider: DataProvider): void {
    this.sourceDataProvider = sourceDataProvider;
    this.emitRowsChanged();
  }

  public applySnapshot(snapshot: GroupedDataProviderSnapshot): void {
    this.rows = cloneRows(snapshot.rows);
    this.groupKeys = Array.isArray(snapshot.groupKeys) ? snapshot.groupKeys.slice() : [];
    this.groupRowObjects = new Array<GridRowData | null>(this.rows.length);
    this.groupRowsByKey = new Map<string, GroupViewGroupRow>();

    for (let index = 0; index < this.rows.length; index += 1) {
      const row = this.rows[index];
      if (row.kind === 'group') {
        this.groupRowsByKey.set(row.groupKey, row);
      }
    }

    this.emitRowsChanged();
  }

  public getSnapshot(): GroupedDataProviderSnapshot {
    return {
      rows: cloneRows(this.rows),
      groupKeys: this.groupKeys.slice()
    };
  }

  public getGroupRow(viewDataIndex: number): GroupViewGroupRow | null {
    if (!Number.isInteger(viewDataIndex) || viewDataIndex < 0 || viewDataIndex >= this.rows.length) {
      return null;
    }

    const row = this.rows[viewDataIndex];
    if (row.kind !== 'group') {
      return null;
    }

    return row;
  }

  public getGroupRowByKey(groupKey: string): GroupViewGroupRow | null {
    if (typeof groupKey !== 'string' || groupKey.length === 0) {
      return null;
    }

    return this.groupRowsByKey.get(groupKey) ?? null;
  }

  public getRowCount(): number {
    return this.rows.length;
  }

  public getRowKey(viewDataIndex: number): RowKey {
    const row = this.rows[viewDataIndex];
    if (!row) {
      return viewDataIndex;
    }

    if (row.kind === 'group') {
      return `${GROUP_ROW_KEY_PREFIX}${row.groupKey}`;
    }

    return this.sourceDataProvider.getRowKey(row.dataIndex);
  }

  public getValue(viewDataIndex: number, columnId: string): unknown {
    const row = this.rows[viewDataIndex];
    if (!row) {
      return undefined;
    }

    if (row.kind === 'group') {
      return row.values[columnId];
    }

    return this.sourceDataProvider.getValue(row.dataIndex, columnId);
  }

  public getRow(viewDataIndex: number): GridRowData | undefined {
    const row = this.rows[viewDataIndex];
    if (!row) {
      return undefined;
    }

    if (row.kind === 'data') {
      return this.sourceDataProvider.getRow?.(row.dataIndex);
    }

    const cached = this.groupRowObjects[viewDataIndex];
    if (cached) {
      return cached;
    }

    const groupRowObject: GridRowData = {
      ...row.values,
      [GROUP_ROW_KIND_FIELD]: GROUP_ROW_KIND,
      [GROUP_ROW_KEY_FIELD]: row.groupKey,
      [GROUP_ROW_LEVEL_FIELD]: row.level,
      [GROUP_ROW_COLUMN_ID_FIELD]: row.columnId,
      [GROUP_ROW_LEAF_COUNT_FIELD]: row.leafCount,
      [GROUP_ROW_EXPANDED_FIELD]: row.isExpanded
    };

    this.groupRowObjects[viewDataIndex] = groupRowObject;
    return groupRowObject;
  }

  public peekRow(viewDataIndex: number): GridRowData | undefined {
    return this.getRow(viewDataIndex);
  }

  public setValue(viewDataIndex: number, columnId: string, value: unknown): void {
    const row = this.rows[viewDataIndex];
    if (!row || row.kind === 'group') {
      return;
    }

    this.sourceDataProvider.setValue(row.dataIndex, columnId, value);
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

    for (let viewDataIndex = 0; viewDataIndex < rowCount; viewDataIndex += 1) {
      if (this.getRowKey(viewDataIndex) === rowKey) {
        return viewDataIndex;
      }
    }

    return -1;
  }

  public isRowLoading(viewDataIndex: number): boolean {
    const row = this.rows[viewDataIndex];
    if (!row || row.kind === 'group') {
      return false;
    }

    return this.sourceDataProvider.isRowLoading?.(row.dataIndex) === true;
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
