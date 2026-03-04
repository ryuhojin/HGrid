import type { ColumnDef } from '../core/grid-options';
import type { GridRowData } from './data-provider';

const DEFAULT_MIN_WIDTH = 40;
const DEFAULT_MAX_WIDTH = 1200;

export interface ResolvedColumnDef extends ColumnDef {
  minWidth: number;
  maxWidth: number;
  visible: boolean;
}

function normalizeWidthBounds(column: ColumnDef): { minWidth: number; maxWidth: number } {
  const rawMinWidth = Number(column.minWidth);
  const rawMaxWidth = Number(column.maxWidth);

  const minWidth = Number.isFinite(rawMinWidth) ? Math.max(1, rawMinWidth) : DEFAULT_MIN_WIDTH;
  const maxWidthBase = Number.isFinite(rawMaxWidth) ? rawMaxWidth : DEFAULT_MAX_WIDTH;
  const maxWidth = Math.max(minWidth, maxWidthBase);

  return { minWidth, maxWidth };
}

function clampColumnWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, width));
}

function normalizeColumn(column: ColumnDef): ResolvedColumnDef {
  const { minWidth, maxWidth } = normalizeWidthBounds(column);
  const rawWidth = Number(column.width);
  const width = Number.isFinite(rawWidth) ? rawWidth : minWidth;

  return {
    ...column,
    minWidth,
    maxWidth,
    width: clampColumnWidth(width, minWidth, maxWidth),
    visible: column.visible !== false
  };
}

function assertUniqueColumnIds(columns: ColumnDef[]): void {
  const columnIdSet = new Set<string>();

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const columnId = columns[columnIndex].id;

    if (columnIdSet.has(columnId)) {
      throw new Error(`Duplicate column id is not allowed: ${columnId}`);
    }

    columnIdSet.add(columnId);
  }
}

export class ColumnModel {
  private columnsById: Map<string, ResolvedColumnDef> = new Map();
  private orderedColumnIds: string[] = [];

  public constructor(columns: ColumnDef[]) {
    this.setColumns(columns);
  }

  public setColumns(columns: ColumnDef[]): void {
    assertUniqueColumnIds(columns);

    this.columnsById = new Map();
    this.orderedColumnIds = [];

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const normalizedColumn = normalizeColumn(columns[columnIndex]);
      this.columnsById.set(normalizedColumn.id, normalizedColumn);
      this.orderedColumnIds.push(normalizedColumn.id);
    }
  }

  public getColumns(): ResolvedColumnDef[] {
    const columns: ResolvedColumnDef[] = [];

    for (let columnIndex = 0; columnIndex < this.orderedColumnIds.length; columnIndex += 1) {
      const columnId = this.orderedColumnIds[columnIndex];
      const column = this.columnsById.get(columnId);
      if (column) {
        columns.push(column);
      }
    }

    return columns;
  }

  public getVisibleColumns(): ResolvedColumnDef[] {
    return this.getColumns().filter((column) => column.visible);
  }

  public setColumnOrder(nextOrderedColumnIds: string[]): void {
    const uniqueIds = Array.from(new Set(nextOrderedColumnIds));

    for (let index = 0; index < uniqueIds.length; index += 1) {
      const columnId = uniqueIds[index];
      if (!this.columnsById.has(columnId)) {
        throw new Error(`Unknown column id in order list: ${columnId}`);
      }
    }

    const nextOrder = uniqueIds.slice();
    for (let index = 0; index < this.orderedColumnIds.length; index += 1) {
      const columnId = this.orderedColumnIds[index];
      if (nextOrder.indexOf(columnId) === -1) {
        nextOrder.push(columnId);
      }
    }

    this.orderedColumnIds = nextOrder;
  }

  public setColumnVisibility(columnId: string, isVisible: boolean): void {
    const column = this.columnsById.get(columnId);
    if (!column) {
      throw new Error(`Unknown column id: ${columnId}`);
    }

    this.columnsById.set(columnId, {
      ...column,
      visible: isVisible
    });
  }

  public setColumnWidth(columnId: string, width: number): void {
    const column = this.columnsById.get(columnId);
    if (!column) {
      throw new Error(`Unknown column id: ${columnId}`);
    }

    const numericWidth = Number(width);
    const safeWidth = Number.isFinite(numericWidth) ? numericWidth : column.width;

    this.columnsById.set(columnId, {
      ...column,
      width: clampColumnWidth(safeWidth, column.minWidth, column.maxWidth)
    });
  }
}

export function getColumnValue(column: ColumnDef, row: GridRowData): unknown {
  if (column.valueGetter) {
    return column.valueGetter(row, column);
  }

  return row[column.id];
}

export function formatColumnValue(column: ColumnDef, row: GridRowData): string {
  const value = getColumnValue(column, row);

  if (column.formatter) {
    return column.formatter(value, row);
  }

  return value === undefined || value === null ? '' : String(value);
}
