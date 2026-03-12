import type { ColumnDef, ColumnPinPosition } from '../core/grid-options';
import type { GridRowData } from './data-provider';

const DEFAULT_MIN_WIDTH = 40;
const DEFAULT_MAX_WIDTH = 1200;

export interface ResolvedColumnDef extends ColumnDef {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  visible: boolean;
}

export interface ColumnValueFormatContext {
  locale: string;
  numberFormatter: Intl.NumberFormat;
  dateTimeFormatter: Intl.DateTimeFormat;
}

export interface ColumnValueFormatContextOptions {
  locale?: string;
  numberFormatOptions?: Intl.NumberFormatOptions;
  dateTimeFormatOptions?: Intl.DateTimeFormatOptions;
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
  const initialWidth = Number.isFinite(rawWidth) ? rawWidth : minWidth;

  return {
    ...column,
    initialWidth,
    minWidth,
    maxWidth,
    width: clampColumnWidth(initialWidth, minWidth, maxWidth),
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

  public setColumnPin(columnId: string, pinned?: ColumnPinPosition): void {
    const column = this.columnsById.get(columnId);
    if (!column) {
      throw new Error(`Unknown column id: ${columnId}`);
    }

    this.columnsById.set(columnId, {
      ...column,
      pinned
    });
  }
}

export function getColumnValue(column: ColumnDef, row: GridRowData): unknown {
  if (column.valueGetter) {
    return column.valueGetter(row, column);
  }

  return row[column.id];
}

export function createColumnValueFormatContext(options?: ColumnValueFormatContextOptions): ColumnValueFormatContext {
  const locale = typeof options?.locale === 'string' && options.locale.trim().length > 0 ? options.locale : 'en-US';
  const numberFormatOptions = options?.numberFormatOptions ? { ...options.numberFormatOptions } : undefined;
  const dateTimeFormatOptions = options?.dateTimeFormatOptions ? { ...options.dateTimeFormatOptions } : undefined;
  let numberFormatter: Intl.NumberFormat;
  let dateTimeFormatter: Intl.DateTimeFormat;

  try {
    numberFormatter = new Intl.NumberFormat(locale, numberFormatOptions);
  } catch {
    numberFormatter = new Intl.NumberFormat('en-US');
  }

  try {
    dateTimeFormatter = new Intl.DateTimeFormat(locale, dateTimeFormatOptions);
  } catch {
    dateTimeFormatter = new Intl.DateTimeFormat('en-US');
  }

  return {
    locale,
    numberFormatter,
    dateTimeFormatter
  };
}

function resolveDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  return null;
}

export function formatColumnValue(column: ColumnDef, row: GridRowData, context?: ColumnValueFormatContext): string {
  const value = getColumnValue(column, row);

  if (column.formatter) {
    return column.formatter(value, row);
  }

  if (value === undefined || value === null) {
    return '';
  }

  if (column.type === 'number' && context) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return context.numberFormatter.format(value);
    }

    if (typeof value === 'bigint') {
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) {
        return context.numberFormatter.format(asNumber);
      }
      return String(value);
    }
  }

  if (column.type === 'date' && context) {
    const date = resolveDateValue(value);
    if (date) {
      return context.dateTimeFormatter.format(date);
    }
  }

  return String(value);
}
