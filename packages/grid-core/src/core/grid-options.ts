import type { DataProvider, GridRowData } from '../data/data-provider';
import type { RowModel } from '../data/row-model';
import type { RowModelOptions } from '../data/row-model';

export type CellValueType = 'text' | 'number' | 'date' | 'boolean';
export type ColumnPinPosition = 'left' | 'right';
export type ScrollbarVisibility = 'auto' | 'always' | 'hidden';
export type RowHeightMode = 'fixed' | 'estimated' | 'measured';
export type RowIndicatorCheckAllScope = 'all' | 'filtered' | 'viewport';
export type RowStatusTone = 'inserted' | 'updated' | 'deleted' | 'invalid' | 'error' | 'clean';

export type ColumnFormatter = (value: unknown, row: GridRowData) => string;
export type ColumnComparator = (a: unknown, b: unknown) => number;
export type ColumnValueGetter = (row: GridRowData, column: ColumnDef) => unknown;
export type ColumnValueSetter = (row: GridRowData, value: unknown, column: ColumnDef) => void;
export type RowHeightGetter = (rowIndex: number, dataIndex: number) => number;
export interface EditValidationContext {
  rowIndex: number;
  dataIndex: number;
  column: ColumnDef;
  value: unknown;
  previousValue: unknown;
  row: GridRowData;
}
export type EditValidationResult = string | null | undefined | Promise<string | null | undefined>;
export type EditValidator = (context: EditValidationContext) => EditValidationResult;

export interface RowIndicatorStatusContext {
  rowIndex: number;
  dataIndex: number;
  row: GridRowData;
  isSelected: boolean;
}

export type RowIndicatorStatusGetter = (context: RowIndicatorStatusContext) => RowStatusTone | null | undefined;

export interface RowIndicatorOptions {
  width?: number;
  showCheckbox?: boolean;
  checkAllScope?: RowIndicatorCheckAllScope;
  getRowStatus?: RowIndicatorStatusGetter;
}

export interface StateColumnRenderContext {
  rowIndex: number;
  dataIndex: number;
  row: GridRowData;
  status: RowStatusTone | null;
}

export interface StateColumnRenderResult {
  text?: string;
  ariaLabel?: string;
  tooltip?: string;
  tone?: RowStatusTone | 'dirty' | 'commit';
}

export type StateColumnRenderer = (context: StateColumnRenderContext) => string | StateColumnRenderResult | null | undefined;

export interface StateColumnOptions {
  render?: StateColumnRenderer;
}

export interface ColumnGroupDef {
  groupId: string;
  header: string;
  children: Array<string | ColumnGroupDef>;
  collapsed?: boolean;
}

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
  columnGroups?: ColumnGroupDef[];
  dataProvider: DataProvider;
  rowModel: RowModel;
  height?: number;
  rowHeight?: number;
  rowHeightMode?: RowHeightMode;
  estimatedRowHeight?: number;
  getRowHeight?: RowHeightGetter;
  validateEdit?: EditValidator;
  overscan?: number;
  overscanCols?: number;
  scrollbarPolicy?: ScrollbarPolicy;
  rowIndicator?: RowIndicatorOptions;
  stateColumn?: StateColumnOptions;
}

export interface GridConfig extends Partial<Omit<GridOptions, 'dataProvider' | 'rowModel'>> {
  rowData?: GridRowData[];
  dataProvider?: DataProvider;
  rowModelOptions?: RowModelOptions;
}

export interface GridState {
  scrollTop: number;
  columnOrder?: string[];
  hiddenColumnIds?: string[];
  pinnedColumns?: Record<string, ColumnPinPosition>;
}

export interface GridTheme {
  [cssVariableName: string]: string;
}
