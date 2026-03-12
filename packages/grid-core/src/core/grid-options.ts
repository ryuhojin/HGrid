import type { DataProvider, GridRowData, RowKey } from '../data/data-provider';
import type { RowModel } from '../data/row-model';
import type { RowModelOptions } from '../data/row-model';
import type { EditCommitAuditLogger } from './edit-events';

export type CellValueType = 'text' | 'number' | 'date' | 'boolean';
export type ColumnPinPosition = 'left' | 'right';
export type ScrollbarVisibility = 'auto' | 'always' | 'hidden';
export type RowHeightMode = 'fixed' | 'estimated' | 'measured';
export type RowIndicatorCheckAllScope = 'all' | 'filtered' | 'viewport';
export type RowStatusTone = 'inserted' | 'updated' | 'deleted' | 'invalid' | 'error' | 'clean';
export type GroupingMode = 'client' | 'server';
export type GroupAggregationType = 'sum' | 'avg' | 'min' | 'max' | 'count';
export type TreeDataMode = 'client' | 'server';
export type PivotingMode = 'client' | 'server';
export type GridWorkerOperationType = 'sort' | 'filter' | 'group' | 'pivot' | 'tree';
export type GridColumnMenuTrigger = 'button' | 'contextmenu' | 'both';
export type GridMenuOpenSource = 'button' | 'contextmenu' | 'keyboard';
export type GridBuiltInColumnMenuActionId =
  | 'sortAsc'
  | 'sortDesc'
  | 'clearSort'
  | 'pinLeft'
  | 'pinRight'
  | 'unpin'
  | 'autoSizeColumn'
  | 'resetColumnWidth'
  | 'hideColumn';

export type ColumnFormatter = (value: unknown, row: GridRowData) => string;
export type ColumnComparator = (a: unknown, b: unknown) => number;
export type ColumnValueGetter = (row: GridRowData, column: ColumnDef) => unknown;
export type ColumnValueSetter = (row: GridRowData, value: unknown, column: ColumnDef) => void;
export type RowHeightGetter = (rowIndex: number, dataIndex: number) => number;
export type UnsafeHtmlSanitizer = (unsafeHtml: string, context: UnsafeHtmlSanitizeContext) => string;

export interface GridLocaleText {
  selectAllRows: string;
  selectRow: string;
  selectRowGeneric: string;
  groupingRow: string;
  rowStatus: string;
  rowStatusWithValue: string;
  rowNumber: string;
  validationFailed: string;
  columnMenuSortAsc: string;
  columnMenuSortDesc: string;
  columnMenuClearSort: string;
  columnMenuPinLeft: string;
  columnMenuPinRight: string;
  columnMenuUnpin: string;
  columnMenuAutoSizeColumn: string;
  columnMenuResetColumnWidth: string;
  columnMenuHideColumn: string;
  scopeAll: string;
  scopeFiltered: string;
  scopeViewport: string;
}

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

export interface GroupModelItem {
  columnId: string;
}

export interface GroupAggregationContext {
  groupKey: string;
  level: number;
  columnId: string;
  groupValue: unknown;
  rowCount: number;
}

export type GroupAggregationReducer = (values: unknown[], context: GroupAggregationContext) => unknown;

export interface GroupAggregationDef {
  columnId: string;
  type?: GroupAggregationType;
  reducer?: GroupAggregationReducer;
}

export interface GroupingOptions {
  mode?: GroupingMode;
  groupModel?: GroupModelItem[];
  aggregations?: GroupAggregationDef[];
  defaultExpanded?: boolean;
}

export interface PivotModelItem {
  columnId: string;
}

export interface PivotValueDef {
  columnId: string;
  type?: GroupAggregationType;
  reducer?: GroupAggregationReducer;
}

export interface PivotingOptions {
  mode?: PivotingMode;
  pivotModel?: PivotModelItem[];
  values?: PivotValueDef[];
}

export interface TreeLoadChildrenContext {
  parentNodeKey: RowKey;
  parentRow: GridRowData;
  depth: number;
  signal?: AbortSignal;
}

export interface TreeLoadChildrenResult {
  rows: GridRowData[];
}

export type TreeLoadChildren = (
  context: TreeLoadChildrenContext
) => Promise<TreeLoadChildrenResult | GridRowData[]> | TreeLoadChildrenResult | GridRowData[];

export interface TreeDataOptions {
  enabled?: boolean;
  mode?: TreeDataMode;
  idField?: string;
  parentIdField?: string;
  hasChildrenField?: string;
  treeColumnId?: string;
  defaultExpanded?: boolean;
  rootParentValue?: RowKey | null;
  loadChildren?: TreeLoadChildren;
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
  unsafeHtml?: boolean;
  sanitizeHtml?: UnsafeHtmlSanitizer;
}

export interface GridColumnMenuContext {
  column: ColumnDef;
  visibleColumns: ColumnDef[];
  source: GridMenuOpenSource;
}

export interface GridMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  separator?: boolean;
  onSelect?: (context: GridColumnMenuContext) => void;
}

export interface GridColumnMenuOptions {
  enabled?: boolean;
  trigger?: GridColumnMenuTrigger;
  getItems?: (context: GridColumnMenuContext) => GridMenuItem[];
}

export interface GridContextMenuOptions {
  enabled?: boolean;
  getItems?: (context: GridColumnMenuContext) => GridMenuItem[];
}

export interface UnsafeHtmlSanitizeContext {
  rowIndex: number;
  dataIndex: number;
  rowKey: RowKey;
  column: ColumnDef;
  row: GridRowData;
  value: unknown;
}

export interface ScrollbarPolicy {
  vertical?: ScrollbarVisibility;
  horizontal?: ScrollbarVisibility;
}

export interface GridWorkerAssetUrls {
  sort?: string;
  filter?: string;
  group?: string;
  pivot?: string;
  tree?: string;
}

export type GridWorkerFallbackPolicy = 'lowVolumeOnly' | 'allowAlways';

export interface GridWorkerRuntimeOptions {
  enabled?: boolean;
  assetBaseUrl?: string;
  assetUrls?: GridWorkerAssetUrls;
  timeoutMs?: number;
  largeDataThreshold?: number;
  poolSize?: number;
  fallbackPolicy?: GridWorkerFallbackPolicy;
  prewarm?: boolean;
}

export interface GridOptions {
  columns: ColumnDef[];
  columnGroups?: ColumnGroupDef[];
  columnMenu?: GridColumnMenuOptions;
  contextMenu?: GridContextMenuOptions;
  grouping?: GroupingOptions;
  pivoting?: PivotingOptions;
  treeData?: TreeDataOptions;
  dataProvider: DataProvider;
  rowModel: RowModel;
  locale?: string;
  localeText?: Partial<GridLocaleText>;
  styleNonce?: string;
  sanitizeHtml?: UnsafeHtmlSanitizer;
  onAuditLog?: EditCommitAuditLogger;
  rtl?: boolean;
  numberFormatOptions?: Intl.NumberFormatOptions;
  dateTimeFormatOptions?: Intl.DateTimeFormatOptions;
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
  workerRuntime?: GridWorkerRuntimeOptions;
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
  groupModel?: GroupModelItem[];
  pivotModel?: PivotModelItem[];
  groupExpansionState?: Record<string, boolean>;
  treeExpansionState?: Record<string, boolean>;
}

export interface GridTheme {
  [cssVariableName: string]: string;
}
