import type { DataProvider, GridRowData, RowKey } from '../data/data-provider';
import type { GridFilterModel } from '../data/filter-executor';
import type { AdvancedFilterModel } from '../data/filter-model';
import type { RowModel } from '../data/row-model';
import type { RowModelOptions } from '../data/row-model';
import type { EditCommitAuditLogger } from './edit-events';
import type { GridSelection } from '../interaction/selection-model';

export type CellValueType = 'text' | 'number' | 'date' | 'boolean';
export type ColumnFilterMode = 'auto' | 'text' | 'set';
export type GridCellEditorType = 'auto' | 'text' | 'number' | 'date' | 'boolean' | 'select' | 'masked';
export type GridMaskedEditorMode = 'digits' | 'alphanumeric' | 'uppercase' | 'lowercase';
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
export type GridBuiltInBodyMenuActionId =
  | 'copyCell'
  | 'copyRow'
  | 'copySelection'
  | 'filterByValue'
  | 'clearColumnFilter';
export type GridUnsafeHtmlPolicy = 'sanitizedOnly' | 'allowRaw';
export type GridThemePreset = 'default' | 'enterprise';
export type GridThemeMode = 'light' | 'dark' | 'system';
export type GridResolvedThemeMode = 'light' | 'dark';

export type ColumnFormatter = (value: unknown, row: GridRowData) => string;
export type ColumnComparator = (a: unknown, b: unknown) => number;
export type ColumnValueGetter = (row: GridRowData, column: ColumnDef) => unknown;
export type ColumnValueSetter = (row: GridRowData, value: unknown, column: ColumnDef) => void;
export type RowHeightGetter = (rowIndex: number, dataIndex: number) => number;
export type UnsafeHtmlSanitizer = (unsafeHtml: string, context: UnsafeHtmlSanitizeContext) => string;

export interface GridHtmlRenderingOptions {
  unsafeHtmlPolicy?: GridUnsafeHtmlPolicy;
  trustedTypesPolicyName?: string;
}

export interface GridCellEditorOption {
  value: string | number | boolean | null;
  label: string;
}

export interface GridCellEditorOptions {
  type?: GridCellEditorType;
  placeholder?: string;
  options?: GridCellEditorOption[];
  strict?: boolean;
  min?: number;
  max?: number;
  step?: number;
  inputMode?: HTMLInputElement['inputMode'];
  autoComplete?: string;
  pattern?: string;
  maskMode?: GridMaskedEditorMode;
}

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
  columnMenuOpenFilter: string;
  contextMenuCopyCell: string;
  contextMenuCopyRow: string;
  contextMenuCopySelection: string;
  contextMenuFilterByValue: string;
  contextMenuClearColumnFilter: string;
  filterPanelTitle: string;
  filterPanelQuickMode: string;
  filterPanelBuilderMode: string;
  filterPanelOperator: string;
  filterPanelValue: string;
  filterPanelMin: string;
  filterPanelMax: string;
  filterPanelSearch: string;
  filterPanelConditionOne: string;
  filterPanelConditionTwo: string;
  filterPanelAnd: string;
  filterPanelTextMode: string;
  filterPanelSetMode: string;
  filterPanelColumn: string;
  filterPanelMatch: string;
  filterPanelAddRule: string;
  filterPanelAddGroup: string;
  filterPanelGroup: string;
  filterPanelRemoveRule: string;
  filterPanelNoRules: string;
  filterPanelApply: string;
  filterPanelClear: string;
  filterPanelCancel: string;
  filterPanelConditionKind: string;
  filterPanelPresetsTitle: string;
  filterPanelPresetName: string;
  filterPanelPresetSave: string;
  filterPanelPresetApply: string;
  filterPanelPresetDelete: string;
  filterPanelPresetEmpty: string;
  filterRowPlaceholderText: string;
  filterRowPlaceholderNumber: string;
  filterRowPlaceholderDate: string;
  filterRowBooleanAny: string;
  filterRowBooleanTrue: string;
  filterRowBooleanFalse: string;
  filterRowBooleanBlank: string;
  filterRowSetAny: string;
  filterRowSetBlank: string;
  toolPanelColumnsTitle: string;
  toolPanelFiltersTitle: string;
  toolPanelGroupingTitle: string;
  toolPanelPivotTitle: string;
  toolPanelToggle: string;
  toolPanelClose: string;
  toolPanelSearchColumns: string;
  toolPanelNoColumns: string;
  toolPanelMoveColumnUp: string;
  toolPanelMoveColumnDown: string;
  toolPanelLayoutPresets: string;
  toolPanelApplyLayoutPreset: string;
  toolPanelNoLayoutPresets: string;
  editActionBarDirtySummary: string;
  editActionBarSave: string;
  editActionBarDiscard: string;
  editActionBarSaving: string;
  editActionBarDiscarding: string;
  editActionBarSaved: string;
  editActionBarDiscarded: string;
  editActionBarSaveFailed: string;
  editActionBarDiscardFailed: string;
  statusBarSelectionCells: string;
  statusBarSelectionRows: string;
  statusBarVisibleRows: string;
  statusBarRows: string;
  statusBarFilteredRows: string;
  statusBarAggregatesCalculating: string;
  statusBarSum: string;
  statusBarAvg: string;
  statusBarMin: string;
  statusBarMax: string;
  statusBarRemoteSynced: string;
  statusBarRemoteLoading: string;
  statusBarRemoteRefreshing: string;
  statusBarRemoteError: string;
  statusBarRemotePending: string;
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

export interface EditValidationIssue {
  message: string;
  code?: string;
}

export type EditValidationResult =
  | string
  | EditValidationIssue
  | null
  | undefined
  | Promise<string | EditValidationIssue | null | undefined>;
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
}

export interface ColumnDef {
  id: string;
  header: string;
  width: number;
  minWidth?: number;
  maxWidth?: number;
  type: CellValueType;
  filterMode?: ColumnFilterMode;
  editable?: boolean;
  visible?: boolean;
  pinned?: ColumnPinPosition;
  formatter?: ColumnFormatter;
  comparator?: ColumnComparator;
  valueGetter?: ColumnValueGetter;
  valueSetter?: ColumnValueSetter;
  editor?: GridCellEditorOptions;
  unsafeHtml?: boolean;
  sanitizeHtml?: UnsafeHtmlSanitizer;
}

export interface GridDirtyCellChange {
  columnId: string;
  originalValue: unknown;
  value: unknown;
}

export interface GridDirtyRowChange {
  rowKey: RowKey;
  dataIndexHint: number;
  changes: GridDirtyCellChange[];
}

export interface GridDirtyChangeSummary {
  rowCount: number;
  cellCount: number;
  rowKeys: RowKey[];
}

export interface GridDirtyChangeOptions {
  rowKeys?: RowKey[];
}

export interface GridEditActionBarActionContext {
  dirtyChanges: GridDirtyRowChange[];
  summary: GridDirtyChangeSummary;
  remote: GridStatusBarRemoteSummary | null;
}

export interface GridEditActionBarActionResult {
  completed?: boolean;
  message?: string;
  tone?: GridStatusBarItemTone;
}

export type GridEditActionBarActionHandler = (
  context: GridEditActionBarActionContext
) =>
  | boolean
  | void
  | GridEditActionBarActionResult
  | Promise<boolean | void | GridEditActionBarActionResult>;

export interface GridEditActionBarOptions {
  enabled?: boolean;
  onSave?: GridEditActionBarActionHandler;
  onDiscard?: GridEditActionBarActionHandler;
}

export interface GridColumnMenuContext {
  column: ColumnDef;
  visibleColumns: ColumnDef[];
  source: GridMenuOpenSource;
}

export interface GridContextMenuContext extends GridColumnMenuContext {
  kind?: 'header' | 'cell';
  rowIndex?: number;
  dataIndex?: number;
  rowKey?: RowKey | null;
  row?: GridRowData | null;
  value?: unknown;
  selection?: GridSelection;
}

export interface GridMenuItem {
  id: string;
  label: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  separator?: boolean;
  onSelect?: (context: GridContextMenuContext) => void;
}

export interface GridColumnMenuOptions {
  enabled?: boolean;
  trigger?: GridColumnMenuTrigger;
  getItems?: (context: GridColumnMenuContext) => GridMenuItem[];
}

export interface GridContextMenuOptions {
  enabled?: boolean;
  builtInActions?: GridBuiltInBodyMenuActionId[];
  getItems?: (context: GridContextMenuContext) => GridMenuItem[];
}

export type GridBuiltInToolPanelId = 'columns' | 'filters' | 'grouping' | 'pivot';
export type GridToolPanelId = GridBuiltInToolPanelId | string;

export interface GridToolPanelRenderState {
  columns: ColumnDef[];
  visibleColumns: ColumnDef[];
  filterModel: GridFilterModel;
  groupModel: GroupModelItem[];
  groupAggregations: GroupAggregationDef[];
  groupingMode: GroupingMode;
  pivotModel: PivotModelItem[];
  pivotValues: PivotValueDef[];
  pivotingMode: PivotingMode;
}

export interface GridToolPanelActions {
  closePanel(): void;
  setFilterModel(filterModel: GridFilterModel): Promise<void> | void;
  clearFilterModel(): Promise<void> | void;
  setAdvancedFilterModel(advancedFilterModel: AdvancedFilterModel | null): Promise<void> | void;
  setColumnLayout(layout: GridColumnLayout): void;
}

export interface GridCustomToolPanelRenderContext {
  container: HTMLElement;
  state: GridToolPanelRenderState;
  actions: GridToolPanelActions;
}

export interface GridCustomToolPanelDefinition {
  id: string;
  title: string;
  render(context: GridCustomToolPanelRenderContext): void;
}

export interface GridColumnLayout {
  columnOrder: string[];
  hiddenColumnIds: string[];
  pinnedColumns: Record<string, ColumnPinPosition>;
  columnWidths: Record<string, number>;
}

export interface GridColumnLayoutPreset {
  id: string;
  label: string;
  layout: GridColumnLayout;
}

export interface GridSideBarOptions {
  enabled?: boolean;
  panels?: GridToolPanelId[];
  defaultPanel?: GridToolPanelId | null;
  initialOpen?: boolean;
  width?: number;
  customPanels?: GridCustomToolPanelDefinition[];
  columnLayoutPresets?: GridColumnLayoutPreset[];
}

export type GridRangeHandleMode = 'fill' | 'copy';

export interface GridRangeHandleOptions {
  enabled?: boolean;
  mode?: GridRangeHandleMode;
}

export interface GridUndoRedoOptions {
  enabled?: boolean;
  limit?: number;
}

export interface GridDirtyTrackingOptions {
  enabled?: boolean;
}

export interface GridEditPolicyOptions {
  dirtyTracking?: GridDirtyTrackingOptions;
  actionBar?: GridEditActionBarOptions;
}

export type GridBuiltInStatusBarItemId = 'selection' | 'aggregates' | 'rows' | 'remote';
export type GridStatusBarItemId = GridBuiltInStatusBarItemId | string;

export type GridStatusBarItemTone = 'default' | 'active' | 'danger';
export type GridStatusBarItemAlign = 'main' | 'meta';

export interface GridStatusBarSelectionSummary {
  kind: 'none' | 'cells' | 'rows';
  selectedCellCount: number;
  selectedRowCount: number;
}

export interface GridStatusBarAggregateSummary {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  isComputing?: boolean;
  processedCellCount?: number;
  totalCellCount?: number;
}

export interface GridStatusBarRowsSummary {
  visibleRowCount: number;
  viewRowCount: number;
  sourceRowCount: number;
  isFiltered: boolean;
}

export interface GridStatusBarRemoteSummary {
  loadingCount: number;
  refreshingCount: number;
  errorCount: number;
  inFlightCount: number;
  pendingRowCount: number;
  pendingCellCount: number;
  isBusy: boolean;
  hasError: boolean;
  isPending: boolean;
}

export interface GridStatusBarCustomItemState {
  selection: GridStatusBarSelectionSummary;
  aggregates: GridStatusBarAggregateSummary | null;
  rows: GridStatusBarRowsSummary;
  remote: GridStatusBarRemoteSummary | null;
  filterModel: GridFilterModel;
  advancedFilterModel: AdvancedFilterModel | null;
  columnLayout: GridColumnLayout;
  visibleColumnCount: number;
  totalColumnCount: number;
}

export interface GridStatusBarCustomItemRenderContext {
  state: GridStatusBarCustomItemState;
}

export interface GridStatusBarCustomItemRenderResult {
  text: string;
  tone?: GridStatusBarItemTone;
  align?: GridStatusBarItemAlign;
}

export type GridStatusBarCustomItemRenderer = (
  context: GridStatusBarCustomItemRenderContext
) => string | GridStatusBarCustomItemRenderResult | null | undefined;

export interface GridStatusBarCustomItemDefinition {
  id: string;
  align?: GridStatusBarItemAlign;
  render: GridStatusBarCustomItemRenderer;
}

export interface GridStatusBarOptions {
  enabled?: boolean;
  items?: GridStatusBarItemId[];
  customItems?: GridStatusBarCustomItemDefinition[];
  aggregateAsyncThreshold?: number;
  aggregateChunkSize?: number;
}

export interface GridFilterRowOptions {
  enabled?: boolean;
}

export type GridSetFilterValueSource = 'sampled' | 'full';
export type GridSetFilterReason = 'panel' | 'builder' | 'filterRow';

export interface GridSetFilterValueOption {
  value: unknown;
  label?: string;
}

export interface GridSetFilterValuesContext {
  column: ColumnDef;
  dataProvider: DataProvider;
  locale: string;
  reason: GridSetFilterReason;
  sampledOptions: GridSetFilterValueOption[];
}

export type GridSetFilterValuesGetter = (
  context: GridSetFilterValuesContext
) => ReadonlyArray<GridSetFilterValueOption | unknown>;

export interface GridSetFilterOptions {
  valueSource?: GridSetFilterValueSource;
  maxScanRows?: number;
  maxDistinctValues?: number;
  getValues?: GridSetFilterValuesGetter;
}

export interface GridAdvancedFilterPreset {
  id: string;
  label: string;
  advancedFilterModel: AdvancedFilterModel;
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
  sideBar?: GridSideBarOptions;
  rangeHandle?: GridRangeHandleOptions;
  undoRedo?: GridUndoRedoOptions;
  editPolicy?: GridEditPolicyOptions;
  statusBar?: GridStatusBarOptions;
  filterRow?: GridFilterRowOptions;
  setFilter?: GridSetFilterOptions;
  advancedFilterPresets?: GridAdvancedFilterPreset[];
  grouping?: GroupingOptions;
  pivoting?: PivotingOptions;
  treeData?: TreeDataOptions;
  dataProvider: DataProvider;
  rowModel: RowModel;
  locale?: string;
  localeText?: Partial<GridLocaleText>;
  theme?: GridThemeOptions;
  htmlRendering?: GridHtmlRenderingOptions;
  styleNonce?: string;
  sanitizeHtml?: UnsafeHtmlSanitizer;
  onAuditLog?: EditCommitAuditLogger;
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

export interface GridThemeOptions {
  preset?: GridThemePreset;
  mode?: GridThemeMode;
  tokens?: GridTheme;
}

export interface GridResolvedThemeState {
  preset: GridThemePreset;
  mode: GridThemeMode;
  resolvedMode: GridResolvedThemeMode;
  tokens: GridTheme;
}
