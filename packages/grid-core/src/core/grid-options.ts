import type { DataProvider, GridRowData } from '../data/data-provider';
import type { RowModel } from '../data/row-model';
import type { RowModelOptions } from '../data/row-model';

export type CellValueType = 'text' | 'number' | 'date' | 'boolean';
export type ColumnPinPosition = 'left' | 'right';
export type ScrollbarVisibility = 'auto' | 'always' | 'hidden';
export type RowHeightMode = 'fixed' | 'estimated' | 'measured';

export type ColumnFormatter = (value: unknown, row: GridRowData) => string;
export type ColumnComparator = (a: unknown, b: unknown) => number;
export type ColumnValueGetter = (row: GridRowData, column: ColumnDef) => unknown;
export type ColumnValueSetter = (row: GridRowData, value: unknown, column: ColumnDef) => void;
export type RowHeightGetter = (rowIndex: number, dataIndex: number) => number;

export interface ColumnDef {
  id: string;
  header: string;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  type: CellValueType;
  editable?: boolean;
  visible?: boolean;
  pinned?: ColumnPinPosition;
  formatter?: ColumnFormatter;
  comparator?: ColumnComparator;
  valueGetter?: ColumnValueGetter;
  valueSetter?: ColumnValueSetter;
}

export interface ScrollbarPolicy {
  vertical?: ScrollbarVisibility;
  horizontal?: ScrollbarVisibility;
}

export interface GridOptions {
  columns: ColumnDef[];
  dataProvider: DataProvider;
  rowModel: RowModel;
  height?: number;
  rowHeight?: number;
  rowHeightMode?: RowHeightMode;
  estimatedRowHeight?: number;
  getRowHeight?: RowHeightGetter;
  overscan?: number;
  overscanCols?: number;
  scrollbarPolicy?: ScrollbarPolicy;
}

export interface GridConfig extends Partial<Omit<GridOptions, 'dataProvider' | 'rowModel'>> {
  rowData?: GridRowData[];
  dataProvider?: DataProvider;
  rowModelOptions?: RowModelOptions;
}

export interface GridState {
  scrollTop: number;
}

export interface GridTheme {
  [cssVariableName: string]: string;
}
