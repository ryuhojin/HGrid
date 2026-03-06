import { EventBus } from './event-bus';
import type { ColumnReorderEvent, ColumnResizeEvent, GridEventMap, GridEventName } from './event-bus';
import type {
  ColumnDef,
  ColumnGroupDef,
  GroupAggregationDef,
  GroupModelItem,
  GroupingMode,
  PivotModelItem,
  PivotValueDef,
  PivotingMode,
  PivotingOptions,
  TreeDataMode,
  TreeDataOptions,
  ColumnPinPosition,
  GridConfig,
  GridOptions,
  GridState,
  GridTheme,
  RowIndicatorOptions
} from './grid-options';
import { DomRenderer } from '../render/dom-renderer';
import { ColumnModel, formatColumnValue } from '../data/column-model';
import type { ColumnFilterCondition, GridFilterModel } from '../data/filter-executor';
import { CooperativeFilterExecutor, type FilterExecutor } from '../data/filter-executor';
import type { GridRowData, RowKey } from '../data/data-provider';
import { LocalDataProvider } from '../data/local-data-provider';
import type { RowModelOptions, RowModelState, SparseRowOverride, ViewToDataMapping } from '../data/row-model';
import { RowModel } from '../data/row-model';
import type { RemoteDataProvider as RemoteDataProviderContract, SortModelItem } from '../data/remote-data-provider';
import { CooperativeSortExecutor, type SortExecutor } from '../data/sort-executor';
import type { GridSelection, GridSelectionInput } from '../interaction/selection-model';
import { CooperativeGroupExecutor, type GroupExecutionResult, type GroupExecutor, type GroupViewRow } from '../data/group-executor';
import { CooperativePivotExecutor, type PivotExecutionResult, type PivotExecutor } from '../data/pivot-executor';
import { GroupedDataProvider } from '../data/grouped-data-provider';
import { CooperativeTreeExecutor, toTreeNodeKeyToken, type TreeExecutionResult, type TreeExecutor } from '../data/tree-executor';
import { TreeDataProvider } from '../data/tree-data-provider';

const DEFAULT_SCROLLBAR_POLICY = {
  vertical: 'auto',
  horizontal: 'auto'
} as const;
const LEGACY_INDICATOR_COLUMN_ID = '__indicator';
const INDICATOR_ROW_NUMBER_COLUMN_ID = '__indicatorRowNumber';
const INDICATOR_CHECKBOX_COLUMN_ID = '__indicatorCheckbox';
const INDICATOR_STATUS_COLUMN_ID = '__indicatorStatus';
const STATE_COLUMN_ID = '__state';
const DEFAULT_INDICATOR_CHECKBOX_WIDTH = 56;
const DEFAULT_INDICATOR_ROW_NUMBER_WIDTH = 64;
const DEFAULT_INDICATOR_STATUS_WIDTH = 96;
const MIN_INDICATOR_WIDTH = 44;
const MAX_INDICATOR_WIDTH = 180;
const DEFAULT_STATE_COLUMN_WIDTH = 108;
const DEFAULT_EXPORT_CHUNK_SIZE = 2000;
const DEFAULT_EXPORT_LINE_BREAK = '\n';

function isSystemUtilityColumn(columnId: string): boolean {
  return (
    columnId === LEGACY_INDICATOR_COLUMN_ID ||
    columnId === INDICATOR_ROW_NUMBER_COLUMN_ID ||
    columnId === INDICATOR_CHECKBOX_COLUMN_ID ||
    columnId === INDICATOR_STATUS_COLUMN_ID ||
    columnId === STATE_COLUMN_ID
  );
}

function mergeScrollbarPolicy(
  currentPolicy: GridOptions['scrollbarPolicy'],
  nextPolicy: GridConfig['scrollbarPolicy']
): GridOptions['scrollbarPolicy'] {
  if (!nextPolicy) {
    return currentPolicy;
  }

  return {
    vertical: nextPolicy.vertical ?? currentPolicy?.vertical ?? DEFAULT_SCROLLBAR_POLICY.vertical,
    horizontal: nextPolicy.horizontal ?? currentPolicy?.horizontal ?? DEFAULT_SCROLLBAR_POLICY.horizontal
  };
}

function mergeRowIndicatorOptions(
  currentOptions: GridOptions['rowIndicator'],
  nextOptions: GridConfig['rowIndicator']
): GridOptions['rowIndicator'] {
  if (!nextOptions) {
    return currentOptions;
  }

  return {
    ...currentOptions,
    ...nextOptions
  };
}

function mergeStateColumnOptions(
  currentOptions: GridOptions['stateColumn'],
  nextOptions: GridConfig['stateColumn']
): GridOptions['stateColumn'] {
  if (!nextOptions) {
    return currentOptions;
  }

  return {
    ...currentOptions,
    ...nextOptions
  };
}

function cloneGroupModel(groupModel?: GroupModelItem[]): GroupModelItem[] {
  if (!Array.isArray(groupModel) || groupModel.length === 0) {
    return [];
  }

  const cloned: GroupModelItem[] = [];
  for (let index = 0; index < groupModel.length; index += 1) {
    const item = groupModel[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0) {
      continue;
    }

    cloned.push({ columnId });
  }

  return cloned;
}

function cloneGroupAggregations(aggregations?: GroupAggregationDef[]): GroupAggregationDef[] {
  if (!Array.isArray(aggregations) || aggregations.length === 0) {
    return [];
  }

  const cloned: GroupAggregationDef[] = [];
  for (let index = 0; index < aggregations.length; index += 1) {
    const item = aggregations[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0) {
      continue;
    }

    cloned.push({
      columnId,
      type: item.type,
      reducer: typeof item.reducer === 'function' ? item.reducer : undefined
    });
  }

  return cloned;
}

function cloneGroupExpansionState(groupExpansionState?: Record<string, boolean>): Record<string, boolean> {
  if (!groupExpansionState || typeof groupExpansionState !== 'object') {
    return {};
  }

  const cloned: Record<string, boolean> = {};
  const keys = Object.keys(groupExpansionState);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const value = groupExpansionState[key];
    if (value === true || value === false) {
      cloned[key] = value;
    }
  }

  return cloned;
}

function cloneGroupingOptions(grouping?: GridOptions['grouping']): GridOptions['grouping'] {
  if (!grouping) {
    return undefined;
  }

  return {
    mode: grouping.mode === 'server' ? 'server' : 'client',
    groupModel: cloneGroupModel(grouping.groupModel),
    aggregations: cloneGroupAggregations(grouping.aggregations),
    defaultExpanded: grouping.defaultExpanded !== false
  };
}

function mergeGroupingOptions(
  currentOptions: GridOptions['grouping'],
  nextOptions: GridConfig['grouping']
): GridOptions['grouping'] {
  if (!nextOptions) {
    return currentOptions ? cloneGroupingOptions(currentOptions) : undefined;
  }

  const base = cloneGroupingOptions(currentOptions) ?? {
    mode: 'client' as GroupingMode,
    groupModel: [],
    aggregations: [],
    defaultExpanded: true
  };

  if (nextOptions.mode === 'client' || nextOptions.mode === 'server') {
    base.mode = nextOptions.mode;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'groupModel')) {
    base.groupModel = cloneGroupModel(nextOptions.groupModel);
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'aggregations')) {
    base.aggregations = cloneGroupAggregations(nextOptions.aggregations);
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'defaultExpanded')) {
    base.defaultExpanded = nextOptions.defaultExpanded !== false;
  }

  return base;
}

function clonePivotModel(pivotModel?: PivotModelItem[]): PivotModelItem[] {
  if (!Array.isArray(pivotModel) || pivotModel.length === 0) {
    return [];
  }

  const cloned: PivotModelItem[] = [];
  for (let index = 0; index < pivotModel.length; index += 1) {
    const item = pivotModel[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0) {
      continue;
    }

    cloned.push({ columnId });
  }

  return cloned;
}

function clonePivotValues(values?: PivotValueDef[]): PivotValueDef[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const cloned: PivotValueDef[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0) {
      continue;
    }

    cloned.push({
      columnId,
      type: item.type,
      reducer: typeof item.reducer === 'function' ? item.reducer : undefined
    });
  }

  return cloned;
}

function clonePivotingOptions(pivoting?: PivotingOptions): PivotingOptions | undefined {
  if (!pivoting) {
    return undefined;
  }

  return {
    mode: pivoting.mode === 'server' ? 'server' : 'client',
    pivotModel: clonePivotModel(pivoting.pivotModel),
    values: clonePivotValues(pivoting.values)
  };
}

function mergePivotingOptions(
  currentOptions: GridOptions['pivoting'],
  nextOptions: GridConfig['pivoting']
): GridOptions['pivoting'] {
  if (!nextOptions) {
    return currentOptions ? clonePivotingOptions(currentOptions) : undefined;
  }

  const base = clonePivotingOptions(currentOptions) ?? {
    mode: 'client' as PivotingMode,
    pivotModel: [],
    values: []
  };

  if (nextOptions.mode === 'client' || nextOptions.mode === 'server') {
    base.mode = nextOptions.mode;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'pivotModel')) {
    base.pivotModel = clonePivotModel(nextOptions.pivotModel);
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'values')) {
    base.values = clonePivotValues(nextOptions.values);
  }

  return base;
}

function getTreeFieldName(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function cloneTreeDataOptions(treeData?: TreeDataOptions): TreeDataOptions | undefined {
  if (!treeData) {
    return undefined;
  }

  return {
    enabled: treeData.enabled === true,
    mode: treeData.mode === 'server' ? 'server' : 'client',
    idField: getTreeFieldName(treeData.idField, 'id'),
    parentIdField: getTreeFieldName(treeData.parentIdField, 'parentId'),
    hasChildrenField: getTreeFieldName(treeData.hasChildrenField, 'hasChildren'),
    treeColumnId: getTreeFieldName(treeData.treeColumnId, ''),
    defaultExpanded: treeData.defaultExpanded === true,
    rootParentValue: treeData.rootParentValue === undefined ? null : treeData.rootParentValue,
    loadChildren: typeof treeData.loadChildren === 'function' ? treeData.loadChildren : undefined
  };
}

function mergeTreeDataOptions(currentOptions: TreeDataOptions | undefined, nextOptions: TreeDataOptions | undefined): TreeDataOptions {
  const base: TreeDataOptions = cloneTreeDataOptions(currentOptions) ?? {
    enabled: false,
    mode: 'client',
    idField: 'id',
    parentIdField: 'parentId',
    hasChildrenField: 'hasChildren',
    treeColumnId: '',
    defaultExpanded: false,
    rootParentValue: null,
    loadChildren: undefined
  };

  if (!nextOptions) {
    return base;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'enabled')) {
    base.enabled = nextOptions.enabled === true;
  }

  if (nextOptions.mode === 'client' || nextOptions.mode === 'server') {
    base.mode = nextOptions.mode;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'idField')) {
    base.idField = getTreeFieldName(nextOptions.idField, 'id');
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'parentIdField')) {
    base.parentIdField = getTreeFieldName(nextOptions.parentIdField, 'parentId');
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'hasChildrenField')) {
    base.hasChildrenField = getTreeFieldName(nextOptions.hasChildrenField, 'hasChildren');
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'treeColumnId')) {
    base.treeColumnId = getTreeFieldName(nextOptions.treeColumnId, '');
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'defaultExpanded')) {
    base.defaultExpanded = nextOptions.defaultExpanded === true;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'rootParentValue')) {
    base.rootParentValue = nextOptions.rootParentValue === undefined ? null : nextOptions.rootParentValue;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'loadChildren')) {
    base.loadChildren = typeof nextOptions.loadChildren === 'function' ? nextOptions.loadChildren : undefined;
  }

  return base;
}

function clampIndicatorWidth(width: number): number {
  return Math.max(MIN_INDICATOR_WIDTH, Math.min(MAX_INDICATOR_WIDTH, Math.round(width)));
}

function resolveIndicatorWidth(optionWidth: number | undefined, fallbackWidth: number): number {
  const width = Number(optionWidth);
  if (Number.isFinite(width)) {
    return clampIndicatorWidth(width);
  }

  return clampIndicatorWidth(fallbackWidth);
}

function normalizeSpecialColumns(columns: ColumnDef[], rowIndicatorOptions?: RowIndicatorOptions): ColumnDef[] {
  const normalizedColumns = new Array<ColumnDef>(columns.length);

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const column = columns[columnIndex];
    if (column.id === LEGACY_INDICATOR_COLUMN_ID || column.id === INDICATOR_CHECKBOX_COLUMN_ID) {
      const indicatorWidth = resolveIndicatorWidth(rowIndicatorOptions?.width, column.width ?? DEFAULT_INDICATOR_CHECKBOX_WIDTH);
      normalizedColumns[columnIndex] = {
        ...column,
        pinned: 'left',
        width: indicatorWidth,
        minWidth: indicatorWidth,
        maxWidth: indicatorWidth
      };
      continue;
    }

    if (column.id === INDICATOR_ROW_NUMBER_COLUMN_ID) {
      const indicatorWidth = resolveIndicatorWidth(undefined, column.width ?? DEFAULT_INDICATOR_ROW_NUMBER_WIDTH);
      normalizedColumns[columnIndex] = {
        ...column,
        pinned: 'left',
        width: indicatorWidth,
        minWidth: indicatorWidth,
        maxWidth: indicatorWidth
      };
      continue;
    }

    if (column.id === INDICATOR_STATUS_COLUMN_ID) {
      const indicatorWidth = resolveIndicatorWidth(undefined, column.width ?? DEFAULT_INDICATOR_STATUS_WIDTH);
      normalizedColumns[columnIndex] = {
        ...column,
        pinned: 'left',
        width: indicatorWidth
      };
      continue;
    }

    if (column.id === STATE_COLUMN_ID) {
      const stateWidth = Number.isFinite(column.width) ? Math.max(52, Math.round(column.width)) : DEFAULT_STATE_COLUMN_WIDTH;
      normalizedColumns[columnIndex] = {
        ...column,
        pinned: 'left',
        width: stateWidth
      };
      continue;
    }

    normalizedColumns[columnIndex] = {
      ...column
    };
  }

  return normalizedColumns;
}

function cloneColumnGroup(group: ColumnGroupDef): ColumnGroupDef {
  const children = Array.isArray(group.children) ? group.children : [];
  const clonedChildren: Array<string | ColumnGroupDef> = [];
  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex];
    if (typeof child === 'string') {
      clonedChildren.push(child);
      continue;
    }

    if (child && typeof child === 'object') {
      clonedChildren.push(cloneColumnGroup(child));
    }
  }

  return {
    groupId: String(group.groupId),
    header: String(group.header),
    children: clonedChildren,
    collapsed: group.collapsed === true
  };
}

function cloneColumns(columns: ColumnDef[]): ColumnDef[] {
  const clonedColumns: ColumnDef[] = new Array<ColumnDef>(columns.length);
  for (let index = 0; index < columns.length; index += 1) {
    clonedColumns[index] = { ...columns[index] };
  }

  return clonedColumns;
}

function cloneColumnGroups(columnGroups?: ColumnGroupDef[]): ColumnGroupDef[] | undefined {
  if (!Array.isArray(columnGroups)) {
    return undefined;
  }

  const clonedGroups: ColumnGroupDef[] = [];
  for (let groupIndex = 0; groupIndex < columnGroups.length; groupIndex += 1) {
    const group = columnGroups[groupIndex];
    if (!group || typeof group !== 'object') {
      continue;
    }

    clonedGroups.push(cloneColumnGroup(group));
  }

  return clonedGroups;
}

function normalizeOptions(config?: GridConfig): GridOptions {
  const dataProvider = config?.dataProvider ?? new LocalDataProvider(config?.rowData ?? []);
  const rowModel = new RowModel(dataProvider.getRowCount(), config?.rowModelOptions);
  const rowIndicator = mergeRowIndicatorOptions(undefined, config?.rowIndicator);

  return {
    columns: normalizeSpecialColumns(config?.columns ?? [], rowIndicator),
    columnGroups: cloneColumnGroups(config?.columnGroups),
    grouping: mergeGroupingOptions(undefined, config?.grouping),
    pivoting: mergePivotingOptions(undefined, config?.pivoting),
    treeData: mergeTreeDataOptions(undefined, config?.treeData),
    dataProvider,
    rowModel,
    height: config?.height,
    rowHeight: config?.rowHeight,
    rowHeightMode: config?.rowHeightMode,
    estimatedRowHeight: config?.estimatedRowHeight,
    getRowHeight: config?.getRowHeight,
    validateEdit: config?.validateEdit,
    overscan: config?.overscan,
    overscanCols: config?.overscanCols,
    scrollbarPolicy: mergeScrollbarPolicy(DEFAULT_SCROLLBAR_POLICY, config?.scrollbarPolicy),
    rowIndicator,
    stateColumn: mergeStateColumnOptions(undefined, config?.stateColumn)
  };
}

function createIdentityMapping(rowCount: number): Int32Array {
  const mapping = new Int32Array(Math.max(0, rowCount));
  for (let index = 0; index < mapping.length; index += 1) {
    mapping[index] = index;
  }
  return mapping;
}

function isRemoteDataProvider(dataProvider: GridOptions['dataProvider']): dataProvider is RemoteDataProviderContract {
  return typeof (dataProvider as RemoteDataProviderContract).setQueryModel === 'function';
}

export type GridExportScope = 'visible' | 'selection' | 'all';
export type GridExportFormat = 'csv' | 'tsv';
export type GridExportStatus = 'running' | 'completed' | 'canceled';

export interface GridExportOptions {
  scope?: GridExportScope;
  includeHeaders?: boolean;
  includeSystemColumns?: boolean;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (event: GridExportProgressEvent) => void;
}

export interface GridExportProgressEvent {
  operationId: string;
  format: GridExportFormat;
  scope: GridExportScope;
  status: GridExportStatus;
  processedRows: number;
  totalRows: number;
  progress: number;
}

export interface GridExportResult {
  operationId: string;
  format: GridExportFormat;
  scope: GridExportScope;
  content: string;
  rowCount: number;
  canceled: boolean;
}

interface ExportRowSegment {
  startRow: number;
  endRow: number;
}

export class Grid {
  private options: GridOptions;
  private sourceDataProvider: GridOptions['dataProvider'];
  private groupedDataProvider: GroupedDataProvider | null = null;
  private pivotDataProvider: LocalDataProvider | null = null;
  private treeDataProvider: TreeDataProvider | null = null;
  private readonly columnModel: ColumnModel;
  private readonly rowModel: RowModel;
  private readonly eventBus: EventBus;
  private readonly renderer: DomRenderer;
  private readonly sortExecutor: SortExecutor;
  private readonly filterExecutor: FilterExecutor;
  private readonly groupExecutor: GroupExecutor;
  private readonly pivotExecutor: PivotExecutor;
  private readonly treeExecutor: TreeExecutor;
  private sortModel: SortModelItem[] = [];
  private filterModel: GridFilterModel = {};
  private groupModel: GroupModelItem[] = [];
  private groupAggregations: GroupAggregationDef[] = [];
  private groupingMode: GroupingMode = 'client';
  private groupDefaultExpanded = true;
  private groupExpansionState: Record<string, boolean> = {};
  private groupRows: GroupViewRow[] = [];
  private groupKeys: string[] = [];
  private pivotModel: PivotModelItem[] = [];
  private pivotValues: PivotValueDef[] = [];
  private pivotingMode: PivotingMode = 'client';
  private pivotColumns: ColumnDef[] = [];
  private baseColumnsBeforeClientPivot: ColumnDef[] | null = null;
  private treeDataOptions: TreeDataOptions = mergeTreeDataOptions(undefined, undefined);
  private treeMode: TreeDataMode = 'client';
  private treeExpansionState: Record<string, boolean> = {};
  private treeRows: TreeExecutionResult['rows'] = [];
  private treeNodeKeys: RowKey[] = [];
  private treeNodeKeyTokens: string[] = [];
  private treeLazyChildrenByParent = new Map<string, { parentNodeKey: RowKey; rows: GridRowData[] }>();
  private treeLoadingParents = new Set<string>();
  private treeLoadOperationToken = 0;
  private exportOperationToken = 0;
  private sortOperationToken = 0;
  private filterOperationToken = 0;
  private groupOperationToken = 0;
  private pivotOperationToken = 0;
  private treeOperationToken = 0;
  private sortMapping: Int32Array | null = null;
  private filterMapping: Int32Array | null = null;
  private dataProviderUnsubscribe: (() => void) | null = null;

  public constructor(container: HTMLElement, config?: GridConfig) {
    const normalizedOptions = normalizeOptions(config);
    this.rowModel = normalizedOptions.rowModel;
    this.columnModel = new ColumnModel(normalizedOptions.columns);
    this.sourceDataProvider = normalizedOptions.dataProvider;
    this.options = {
      ...normalizedOptions,
      columns: this.columnModel.getColumns()
    };
    this.eventBus = new EventBus();
    this.eventBus.on('columnResize', this.handleColumnResize);
    this.eventBus.on('columnReorder', this.handleColumnReorder);
    this.eventBus.on('cellClick', this.handleCellClickForTree);
    this.eventBus.on('cellClick', this.handleCellClickForGrouping);
    this.eventBus.on('editCommit', this.handleEditCommitForGrouping);
    this.sortExecutor = new CooperativeSortExecutor();
    this.filterExecutor = new CooperativeFilterExecutor();
    this.groupExecutor = new CooperativeGroupExecutor();
    this.pivotExecutor = new CooperativePivotExecutor();
    this.treeExecutor = new CooperativeTreeExecutor();
    this.groupModel = this.normalizeGroupModel(this.options.grouping?.groupModel ?? []);
    this.groupAggregations = this.normalizeGroupAggregations(this.options.grouping?.aggregations ?? []);
    this.groupingMode = this.options.grouping?.mode === 'server' ? 'server' : 'client';
    this.groupDefaultExpanded = this.options.grouping?.defaultExpanded !== false;
    this.pivotModel = this.normalizePivotModel(this.options.pivoting?.pivotModel ?? []);
    this.pivotValues = this.normalizePivotValues(this.options.pivoting?.values ?? []);
    this.pivotingMode = this.options.pivoting?.mode === 'server' ? 'server' : 'client';
    this.treeDataOptions = this.normalizeTreeDataOptions(mergeTreeDataOptions(undefined, this.options.treeData));
    this.treeMode = this.treeDataOptions.mode === 'server' ? 'server' : 'client';
    this.renderer = new DomRenderer(container, this.getRendererOptions(), this.eventBus);
    this.bindDataProvider(this.sourceDataProvider);
    void this.rebuildDerivedView();
  }

  public setColumns(columns: ColumnDef[]): void {
    const normalizedColumns = normalizeSpecialColumns(columns, this.options.rowIndicator);
    if (this.hasActiveClientPivot()) {
      this.baseColumnsBeforeClientPivot = cloneColumns(normalizedColumns);
    } else {
      this.columnModel.setColumns(normalizedColumns);
      this.syncColumnsToRenderer();
      this.baseColumnsBeforeClientPivot = null;
      this.pivotColumns = [];
    }

    this.groupModel = this.normalizeGroupModel(this.groupModel);
    this.groupAggregations = this.normalizeGroupAggregations(this.groupAggregations);
    this.pivotModel = this.normalizePivotModel(this.pivotModel);
    this.pivotValues = this.normalizePivotValues(this.pivotValues);
    this.treeDataOptions = this.normalizeTreeDataOptions(this.treeDataOptions);
    this.options = {
      ...this.options,
      pivoting: {
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      },
      treeData: this.treeDataOptions
    };
    void this.rebuildDerivedView();
  }

  public setOptions(options: GridConfig): void {
    const nextRowIndicator = mergeRowIndicatorOptions(this.options.rowIndicator, options.rowIndicator);
    const nextStateColumn = mergeStateColumnOptions(this.options.stateColumn, options.stateColumn);
    const nextGrouping = mergeGroupingOptions(this.options.grouping, options.grouping);
    const nextPivoting = mergePivotingOptions(this.options.pivoting, options.pivoting);
    const mergedTreeData = mergeTreeDataOptions(this.treeDataOptions, options.treeData);

    if (options.columns || options.rowIndicator) {
      const sourceColumns = options.columns ?? (this.baseColumnsBeforeClientPivot ?? this.columnModel.getColumns());
      const normalizedColumns = normalizeSpecialColumns(sourceColumns, nextRowIndicator);
      if (this.hasActiveClientPivot()) {
        this.baseColumnsBeforeClientPivot = cloneColumns(normalizedColumns);
      } else {
        this.columnModel.setColumns(normalizedColumns);
      }
    }

    const hasProviderOption = Boolean(options.dataProvider || options.rowData);
    const previousSourceDataProvider = this.sourceDataProvider;
    const nextDataProvider = hasProviderOption
      ? options.dataProvider ?? new LocalDataProvider(options.rowData ?? [])
      : this.sourceDataProvider;

    if (hasProviderOption) {
      this.sortOperationToken += 1;
      this.filterOperationToken += 1;
      this.groupOperationToken += 1;
      this.pivotOperationToken += 1;
      this.treeOperationToken += 1;
      this.sortMapping = null;
      this.filterMapping = null;
      this.groupRows = [];
      this.groupKeys = [];
      this.groupedDataProvider = null;
      this.pivotDataProvider = null;
      this.pivotColumns = [];
      this.groupExpansionState = {};
      this.treeRows = [];
      this.treeNodeKeys = [];
      this.treeNodeKeyTokens = [];
      this.treeDataProvider = null;
      this.treeExpansionState = {};
      this.treeLazyChildrenByParent.clear();
      this.treeLoadingParents.clear();
      this.sourceDataProvider = nextDataProvider;
      this.rowModel.setRowCount(this.sourceDataProvider.getRowCount());
    }

    if (options.rowModelOptions) {
      this.rowModel.setOptions(options.rowModelOptions);
    }

    this.groupingMode = nextGrouping?.mode === 'server' ? 'server' : 'client';
    this.groupDefaultExpanded = nextGrouping?.defaultExpanded !== false;
    this.groupModel = this.normalizeGroupModel(nextGrouping?.groupModel ?? this.groupModel);
    this.groupAggregations = this.normalizeGroupAggregations(nextGrouping?.aggregations ?? this.groupAggregations);
    this.pivotingMode = nextPivoting?.mode === 'server' ? 'server' : 'client';
    this.pivotModel = this.normalizePivotModel(nextPivoting?.pivotModel ?? this.pivotModel);
    this.pivotValues = this.normalizePivotValues(nextPivoting?.values ?? this.pivotValues);
    this.treeDataOptions = this.normalizeTreeDataOptions(mergedTreeData);
    this.treeMode = this.treeDataOptions.mode === 'server' ? 'server' : 'client';

    this.options = {
      ...this.options,
      height: options.height ?? this.options.height,
      rowHeight: options.rowHeight ?? this.options.rowHeight,
      rowHeightMode: options.rowHeightMode ?? this.options.rowHeightMode,
      estimatedRowHeight: options.estimatedRowHeight ?? this.options.estimatedRowHeight,
      getRowHeight: options.getRowHeight ?? this.options.getRowHeight,
      validateEdit: options.validateEdit ?? this.options.validateEdit,
      overscan: options.overscan ?? this.options.overscan,
      overscanCols: options.overscanCols ?? this.options.overscanCols,
      scrollbarPolicy: mergeScrollbarPolicy(this.options.scrollbarPolicy, options.scrollbarPolicy),
      rowIndicator: nextRowIndicator,
      stateColumn: nextStateColumn,
      columnGroups: options.columnGroups ? cloneColumnGroups(options.columnGroups) : this.options.columnGroups,
      grouping: nextGrouping,
      pivoting: {
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      },
      treeData: this.treeDataOptions,
      dataProvider: this.sourceDataProvider,
      rowModel: this.rowModel,
      columns: this.columnModel.getColumns()
    };

    if (previousSourceDataProvider !== this.sourceDataProvider) {
      this.bindDataProvider(this.sourceDataProvider);
    }

    void this.rebuildDerivedView();
  }

  public setRowOrder(viewToData: ViewToDataMapping): void {
    this.rowModel.setBaseViewToData(viewToData);
    this.renderer.setOptions(this.getRendererOptions());
  }

  public setFilteredRowOrder(viewToData: ViewToDataMapping | null): void {
    this.rowModel.setFilterViewToData(viewToData);
    this.renderer.setOptions(this.getRendererOptions());
  }

  public resetRowOrder(): void {
    this.rowModel.resetToIdentity(this.sourceDataProvider.getRowCount());
    this.renderer.setOptions(this.getRendererOptions());
  }

  public setSparseRowOverrides(overrides: SparseRowOverride[]): void {
    this.rowModel.setBaseSparseOverrides(overrides);
    this.renderer.setOptions(this.getRendererOptions());
  }

  public clearSparseRowOverrides(): void {
    this.rowModel.clearBaseSparseOverrides();
    this.renderer.setOptions(this.getRendererOptions());
  }

  public setRowModelOptions(options: RowModelOptions): void {
    this.rowModel.setOptions(options);
  }

  public getRowModelState(): RowModelState {
    return this.rowModel.getState();
  }

  public getSortModel(): SortModelItem[] {
    return this.sortModel.map((item) => ({
      columnId: item.columnId,
      direction: item.direction
    }));
  }

  public async setSortModel(sortModel: SortModelItem[]): Promise<void> {
    const normalizedSortModel = this.normalizeSortModel(sortModel);
    this.sortModel = normalizedSortModel;
    if (isRemoteDataProvider(this.sourceDataProvider)) {
      this.sortOperationToken += 1;
      this.filterOperationToken += 1;
      this.groupOperationToken += 1;
      this.pivotOperationToken += 1;
      this.sortMapping = null;
      this.filterMapping = null;
      this.sourceDataProvider.setQueryModel({
        sortModel: normalizedSortModel,
        filterModel: this.filterModel,
        groupModel: this.shouldUseServerGrouping() ? this.groupModel : undefined,
        pivotModel: this.shouldUseServerPivot() ? this.pivotModel : undefined,
        pivotValues: this.shouldUseServerPivot() ? this.pivotValues : undefined
      });
      const rowCount = this.sourceDataProvider.getRowCount();
      if (this.rowModel.getState().rowCount !== rowCount) {
        this.rowModel.setRowCount(rowCount);
      } else {
        this.rowModel.setBaseIdentityMapping();
        this.rowModel.setFilterViewToData(null);
      }
      this.options = {
        ...this.options,
        dataProvider: this.sourceDataProvider
      };
      this.groupRows = [];
      this.groupKeys = [];
      this.groupedDataProvider = null;
      this.pivotDataProvider = null;
      this.pivotColumns = [];
      this.treeRows = [];
      this.treeNodeKeys = [];
      this.treeNodeKeyTokens = [];
      this.treeDataProvider = null;
      this.renderer.setOptions(this.getRendererOptions());
      return;
    }

    const rowCount = this.sourceDataProvider.getRowCount();
    this.filterOperationToken += 1;
    this.groupOperationToken += 1;
    this.pivotOperationToken += 1;
    const operationToken = ++this.sortOperationToken;
    const opId = `sort-${operationToken}`;

    if (normalizedSortModel.length === 0 || rowCount <= 0) {
      this.sortMapping = null;
      if (this.hasActiveFilterModel() && rowCount > 0) {
        await this.applyFilterModelInternal();
      } else {
        this.filterMapping = null;
        await this.applyDerivedViewToRenderer();
      }
      return;
    }

    const response = await this.sortExecutor.execute(
      {
        opId,
        rowCount,
        sortModel: normalizedSortModel,
        columns: this.getSchemaColumnsForModelNormalization(),
        dataProvider: this.sourceDataProvider
      },
      {
        isCanceled: () => operationToken !== this.sortOperationToken
      }
    );

    if (operationToken !== this.sortOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.sortMapping = new Int32Array(response.result.mapping);
    if (this.hasActiveFilterModel()) {
      await this.applyFilterModelInternal();
    } else {
      this.filterMapping = null;
      await this.applyDerivedViewToRenderer();
    }
  }

  public async clearSortModel(): Promise<void> {
    await this.setSortModel([]);
  }

  public getFilterModel(): GridFilterModel {
    return this.cloneFilterModel(this.filterModel);
  }

  public async setFilterModel(filterModel: GridFilterModel): Promise<void> {
    this.filterModel = this.normalizeFilterModel(filterModel);
    if (isRemoteDataProvider(this.sourceDataProvider)) {
      this.sortMapping = null;
      this.filterMapping = null;
      this.sortOperationToken += 1;
      this.filterOperationToken += 1;
      this.groupOperationToken += 1;
      this.pivotOperationToken += 1;
      this.sourceDataProvider.setQueryModel({
        sortModel: this.sortModel,
        filterModel: this.filterModel,
        groupModel: this.shouldUseServerGrouping() ? this.groupModel : undefined,
        pivotModel: this.shouldUseServerPivot() ? this.pivotModel : undefined,
        pivotValues: this.shouldUseServerPivot() ? this.pivotValues : undefined
      });
      const rowCount = this.sourceDataProvider.getRowCount();
      if (this.rowModel.getState().rowCount !== rowCount) {
        this.rowModel.setRowCount(rowCount);
      } else {
        this.rowModel.setBaseIdentityMapping();
        this.rowModel.setFilterViewToData(null);
      }
      this.options = {
        ...this.options,
        dataProvider: this.sourceDataProvider
      };
      this.groupRows = [];
      this.groupKeys = [];
      this.groupedDataProvider = null;
      this.pivotDataProvider = null;
      this.pivotColumns = [];
      this.treeRows = [];
      this.treeNodeKeys = [];
      this.treeNodeKeyTokens = [];
      this.treeDataProvider = null;
      this.renderer.setOptions(this.getRendererOptions());
      return;
    }

    await this.applyFilterModelInternal();
  }

  public async clearFilterModel(): Promise<void> {
    await this.setFilterModel({});
  }

  public getGroupModel(): GroupModelItem[] {
    return cloneGroupModel(this.groupModel);
  }

  public async setGroupModel(groupModel: GroupModelItem[]): Promise<void> {
    this.groupModel = this.normalizeGroupModel(groupModel);
    this.groupExpansionState = {};
    this.options = {
      ...this.options,
      grouping: {
        ...(this.options.grouping ?? {}),
        mode: this.groupingMode,
        groupModel: cloneGroupModel(this.groupModel),
        aggregations: cloneGroupAggregations(this.groupAggregations),
        defaultExpanded: this.groupDefaultExpanded
      }
    };
    await this.rebuildDerivedView();
  }

  public async clearGroupModel(): Promise<void> {
    await this.setGroupModel([]);
  }

  public getGroupAggregations(): GroupAggregationDef[] {
    return cloneGroupAggregations(this.groupAggregations);
  }

  public async setGroupAggregations(aggregations: GroupAggregationDef[]): Promise<void> {
    this.groupAggregations = this.normalizeGroupAggregations(aggregations);
    this.options = {
      ...this.options,
      grouping: {
        ...(this.options.grouping ?? {}),
        mode: this.groupingMode,
        groupModel: cloneGroupModel(this.groupModel),
        aggregations: cloneGroupAggregations(this.groupAggregations),
        defaultExpanded: this.groupDefaultExpanded
      }
    };
    await this.rebuildDerivedView();
  }

  public getGroupExpansionState(): Record<string, boolean> {
    return cloneGroupExpansionState(this.groupExpansionState);
  }

  public async setGroupExpanded(groupKey: string, expanded: boolean): Promise<void> {
    if (typeof groupKey !== 'string' || groupKey.length === 0) {
      return;
    }

    const nextExpanded = expanded === true;
    const currentExpanded = this.groupExpansionState[groupKey];
    if (currentExpanded === nextExpanded) {
      return;
    }

    this.groupExpansionState[groupKey] = nextExpanded;
    await this.applyGroupingViewInternal();
  }

  public async toggleGroupExpanded(groupKey: string): Promise<void> {
    if (typeof groupKey !== 'string' || groupKey.length === 0) {
      return;
    }

    const currentExpanded = this.groupExpansionState[groupKey];
    const defaultExpanded = this.groupDefaultExpanded;
    await this.setGroupExpanded(groupKey, currentExpanded === undefined ? !defaultExpanded : !currentExpanded);
  }

  public async expandAllGroups(): Promise<void> {
    const nextState: Record<string, boolean> = {};
    for (let index = 0; index < this.groupKeys.length; index += 1) {
      nextState[this.groupKeys[index]] = true;
    }
    this.groupExpansionState = nextState;
    await this.applyGroupingViewInternal();
  }

  public async collapseAllGroups(): Promise<void> {
    const nextState: Record<string, boolean> = {};
    for (let index = 0; index < this.groupKeys.length; index += 1) {
      nextState[this.groupKeys[index]] = false;
    }
    this.groupExpansionState = nextState;
    await this.applyGroupingViewInternal();
  }

  public getGroupingMode(): GroupingMode {
    return this.groupingMode;
  }

  public async setGroupingMode(mode: GroupingMode): Promise<void> {
    const nextMode: GroupingMode = mode === 'server' ? 'server' : 'client';
    if (nextMode === this.groupingMode) {
      return;
    }

    this.groupingMode = nextMode;
    this.options = {
      ...this.options,
      grouping: {
        ...(this.options.grouping ?? {}),
        mode: this.groupingMode,
        groupModel: cloneGroupModel(this.groupModel),
        aggregations: cloneGroupAggregations(this.groupAggregations),
        defaultExpanded: this.groupDefaultExpanded
      }
    };
    await this.rebuildDerivedView();
  }

  public getPivotModel(): PivotModelItem[] {
    return clonePivotModel(this.pivotModel);
  }

  public async setPivotModel(pivotModel: PivotModelItem[]): Promise<void> {
    this.pivotModel = this.normalizePivotModel(pivotModel);
    this.options = {
      ...this.options,
      pivoting: {
        ...(this.options.pivoting ?? {}),
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      }
    };
    await this.rebuildDerivedView();
  }

  public async clearPivotModel(): Promise<void> {
    await this.setPivotModel([]);
  }

  public getPivotValues(): PivotValueDef[] {
    return clonePivotValues(this.pivotValues);
  }

  public async setPivotValues(values: PivotValueDef[]): Promise<void> {
    this.pivotValues = this.normalizePivotValues(values);
    this.options = {
      ...this.options,
      pivoting: {
        ...(this.options.pivoting ?? {}),
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      }
    };
    await this.rebuildDerivedView();
  }

  public getPivotingMode(): PivotingMode {
    return this.pivotingMode;
  }

  public async setPivotingMode(mode: PivotingMode): Promise<void> {
    const nextMode: PivotingMode = mode === 'server' ? 'server' : 'client';
    if (nextMode === this.pivotingMode) {
      return;
    }

    this.pivotingMode = nextMode;
    this.options = {
      ...this.options,
      pivoting: {
        ...(this.options.pivoting ?? {}),
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      }
    };
    await this.rebuildDerivedView();
  }

  public getGroupedRowsSnapshot(): GroupViewRow[] {
    const snapshot = new Array<GroupViewRow>(this.groupRows.length);
    for (let index = 0; index < this.groupRows.length; index += 1) {
      const row = this.groupRows[index];
      if (row.kind === 'data') {
        snapshot[index] = {
          kind: 'data',
          dataIndex: row.dataIndex
        };
        continue;
      }

      snapshot[index] = {
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
    return snapshot;
  }

  public getTreeDataOptions(): TreeDataOptions {
    return mergeTreeDataOptions(undefined, this.treeDataOptions);
  }

  public async setTreeDataOptions(treeData: TreeDataOptions): Promise<void> {
    this.treeDataOptions = this.normalizeTreeDataOptions(mergeTreeDataOptions(this.treeDataOptions, treeData));
    this.treeMode = this.treeDataOptions.mode === 'server' ? 'server' : 'client';
    this.treeExpansionState = {};
    this.treeLazyChildrenByParent.clear();
    this.treeLoadingParents.clear();
    this.treeDataProvider = null;
    this.options = {
      ...this.options,
      treeData: this.treeDataOptions
    };
    await this.rebuildDerivedView();
  }

  public getTreeExpansionState(): Record<string, boolean> {
    return cloneGroupExpansionState(this.treeExpansionState);
  }

  public async setTreeExpanded(nodeKey: RowKey, expanded: boolean): Promise<void> {
    const nodeToken = toTreeNodeKeyToken(nodeKey);
    const currentExpanded = this.treeExpansionState[nodeToken];
    const nextExpanded = expanded === true;
    if (currentExpanded === nextExpanded) {
      return;
    }

    this.treeExpansionState[nodeToken] = nextExpanded;
    await this.applyTreeViewInternal(nodeKey, nextExpanded);
  }

  public async toggleTreeExpanded(nodeKey: RowKey): Promise<void> {
    const nodeToken = toTreeNodeKeyToken(nodeKey);
    const currentExpanded = this.treeExpansionState[nodeToken];
    const defaultExpanded = this.treeDataOptions.defaultExpanded === true;
    await this.setTreeExpanded(nodeKey, currentExpanded === undefined ? !defaultExpanded : !currentExpanded);
  }

  public async expandAllTreeNodes(): Promise<void> {
    const nextState: Record<string, boolean> = {};
    for (let index = 0; index < this.treeNodeKeyTokens.length; index += 1) {
      nextState[this.treeNodeKeyTokens[index]] = true;
    }
    this.treeExpansionState = nextState;
    await this.applyTreeViewInternal();
  }

  public async collapseAllTreeNodes(): Promise<void> {
    const nextState: Record<string, boolean> = {};
    for (let index = 0; index < this.treeNodeKeyTokens.length; index += 1) {
      nextState[this.treeNodeKeyTokens[index]] = false;
    }
    this.treeExpansionState = nextState;
    await this.applyTreeViewInternal();
  }

  public getTreeRowsSnapshot(): TreeExecutionResult['rows'] {
    return this.treeRows.map((row) => ({
      kind: 'tree',
      nodeKey: row.nodeKey,
      parentNodeKey: row.parentNodeKey,
      sourceDataIndex: row.sourceDataIndex,
      depth: row.depth,
      hasChildren: row.hasChildren,
      isExpanded: row.isExpanded,
      localRow: row.localRow ? { ...row.localRow } : null
    }));
  }

  public setColumnOrder(columnIds: string[]): void {
    this.columnModel.setColumnOrder(columnIds);
    this.syncColumnsToRenderer();
  }

  public setColumnVisibility(columnId: string, isVisible: boolean): void {
    this.columnModel.setColumnVisibility(columnId, isVisible);
    this.syncColumnsToRenderer();
  }

  public setColumnWidth(columnId: string, width: number): void {
    this.columnModel.setColumnWidth(columnId, width);
    this.syncColumnsToRenderer();
  }

  public setColumnPin(columnId: string, pinned?: ColumnPinPosition): void {
    this.columnModel.setColumnPin(columnId, pinned);
    this.syncColumnsToRenderer();
  }

  public setTheme(themeTokens: GridTheme): void {
    this.renderer.setTheme(themeTokens);
  }

  public getState(): GridState {
    const columns = this.getSchemaColumnsForModelNormalization();
    const hiddenColumnIds: string[] = [];
    const pinnedColumns: Record<string, ColumnPinPosition> = {};
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      if (column.visible === false) {
        hiddenColumnIds.push(column.id);
      }
      if (column.pinned) {
        pinnedColumns[column.id] = column.pinned;
      }
    }

    const rendererState = this.renderer.getState();
    return {
      ...rendererState,
      columnOrder: this.getColumnOrder(),
      hiddenColumnIds,
      pinnedColumns,
      groupModel: cloneGroupModel(this.groupModel),
      pivotModel: clonePivotModel(this.pivotModel),
      groupExpansionState: cloneGroupExpansionState(this.groupExpansionState),
      treeExpansionState: cloneGroupExpansionState(this.treeExpansionState)
    };
  }

  public setState(state: GridState): void {
    let shouldSyncColumns = false;
    let shouldRefreshGrouping = false;

    if (Array.isArray(state.columnOrder) && state.columnOrder.length > 0) {
      this.columnModel.setColumnOrder(state.columnOrder);
      shouldSyncColumns = true;
    }

    if (Array.isArray(state.hiddenColumnIds)) {
      const hiddenColumnIdSet = new Set<string>(state.hiddenColumnIds);
      const columns = this.columnModel.getColumns();
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        this.columnModel.setColumnVisibility(column.id, !hiddenColumnIdSet.has(column.id));
      }
      shouldSyncColumns = true;
    }

    if (state.pinnedColumns && typeof state.pinnedColumns === 'object') {
      const columns = this.columnModel.getColumns();
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        const pinned = state.pinnedColumns[column.id];
        this.columnModel.setColumnPin(column.id, pinned === 'left' || pinned === 'right' ? pinned : undefined);
      }
      shouldSyncColumns = true;
    }

    if (shouldSyncColumns) {
      this.syncColumnsToRenderer();
    }

    if (Array.isArray(state.groupModel)) {
      const nextGroupModel = this.normalizeGroupModel(state.groupModel);
      const isSameGroupModel = JSON.stringify(nextGroupModel) === JSON.stringify(this.groupModel);
      if (!isSameGroupModel) {
        this.groupModel = nextGroupModel;
        this.options = {
          ...this.options,
          grouping: {
            ...(this.options.grouping ?? {}),
            mode: this.groupingMode,
            groupModel: cloneGroupModel(this.groupModel),
            aggregations: cloneGroupAggregations(this.groupAggregations),
            defaultExpanded: this.groupDefaultExpanded
          }
        };
        shouldRefreshGrouping = true;
      }
    }

    if (Array.isArray(state.pivotModel)) {
      const nextPivotModel = this.normalizePivotModel(state.pivotModel);
      const isSamePivotModel = JSON.stringify(nextPivotModel) === JSON.stringify(this.pivotModel);
      if (!isSamePivotModel) {
        this.pivotModel = nextPivotModel;
        this.options = {
          ...this.options,
          pivoting: {
            ...(this.options.pivoting ?? {}),
            mode: this.pivotingMode,
            pivotModel: clonePivotModel(this.pivotModel),
            values: clonePivotValues(this.pivotValues)
          }
        };
        shouldRefreshGrouping = true;
      }
    }

    if (state.groupExpansionState && typeof state.groupExpansionState === 'object') {
      this.groupExpansionState = cloneGroupExpansionState(state.groupExpansionState);
      shouldRefreshGrouping = true;
    }

    if (state.treeExpansionState && typeof state.treeExpansionState === 'object') {
      this.treeExpansionState = cloneGroupExpansionState(state.treeExpansionState);
      shouldRefreshGrouping = true;
    }

    this.renderer.setState({
      scrollTop: state.scrollTop
    });

    if (shouldRefreshGrouping) {
      if (this.hasActiveTreeData()) {
        void this.applyTreeViewInternal();
      } else {
        void this.applyGroupingViewInternal();
      }
    }
  }

  public getSelection(): GridSelection {
    return this.renderer.getSelection();
  }

  public setSelection(selection: GridSelectionInput): void {
    this.renderer.setSelection(selection);
  }

  public clearSelection(): void {
    this.renderer.clearSelection();
  }

  public async exportCsv(options: GridExportOptions = {}): Promise<GridExportResult> {
    return this.exportDelimited('csv', ',', options);
  }

  public async exportTsv(options: GridExportOptions = {}): Promise<GridExportResult> {
    return this.exportDelimited('tsv', '\t', options);
  }

  public resetRowHeights(rowIndexes?: number[]): void {
    this.renderer.resetRowHeights(rowIndexes);
  }

  public on<K extends GridEventName>(eventName: K, handler: (payload: GridEventMap[K]) => void): void {
    this.eventBus.on(eventName, handler);
  }

  public off<K extends GridEventName>(eventName: K, handler: (payload: GridEventMap[K]) => void): void {
    this.eventBus.off(eventName, handler);
  }

  public destroy(): void {
    this.unbindDataProvider();
    this.eventBus.off('columnResize', this.handleColumnResize);
    this.eventBus.off('columnReorder', this.handleColumnReorder);
    this.eventBus.off('cellClick', this.handleCellClickForTree);
    this.eventBus.off('cellClick', this.handleCellClickForGrouping);
    this.eventBus.off('editCommit', this.handleEditCommitForGrouping);
    this.renderer.destroy();
  }

  private bindDataProvider(dataProvider: GridOptions['dataProvider']): void {
    this.unbindDataProvider();
    if (typeof dataProvider.onRowsChanged !== 'function') {
      return;
    }

    this.dataProviderUnsubscribe = dataProvider.onRowsChanged(this.handleDataProviderRowsChanged);
  }

  private unbindDataProvider(): void {
    if (!this.dataProviderUnsubscribe) {
      return;
    }

    this.dataProviderUnsubscribe();
    this.dataProviderUnsubscribe = null;
  }

  private syncColumnsToRenderer(): void {
    this.options = {
      ...this.options,
      columns: this.columnModel.getColumns()
    };
    this.renderer.setColumns(this.columnModel.getVisibleColumns());
  }

  private async exportDelimited(
    format: GridExportFormat,
    delimiter: ',' | '\t',
    options: GridExportOptions
  ): Promise<GridExportResult> {
    const scope: GridExportScope = options.scope === 'visible' || options.scope === 'selection' ? options.scope : 'all';
    const includeHeaders = options.includeHeaders !== false;
    const includeSystemColumns = options.includeSystemColumns === true;
    const rawChunkSize = Number(options.chunkSize);
    const chunkSize = Number.isFinite(rawChunkSize) ? Math.max(1, Math.floor(rawChunkSize)) : DEFAULT_EXPORT_CHUNK_SIZE;
    const operationId = `export-${++this.exportOperationToken}`;

    const columns = this.resolveExportColumns(scope, includeSystemColumns);
    const rowSegments = this.resolveExportRowSegments(scope);
    const totalRows = this.countExportRows(rowSegments);

    if (columns.length === 0) {
      this.emitExportProgress(options.onProgress, {
        operationId,
        format,
        scope,
        status: 'completed',
        processedRows: 0,
        totalRows,
        progress: 1
      });
      return {
        operationId,
        format,
        scope,
        content: '',
        rowCount: 0,
        canceled: false
      };
    }

    const lines: string[] = [];
    if (includeHeaders) {
      lines.push(this.serializeExportHeader(columns, delimiter));
    }

    let processedRows = 0;
    let canceled = options.signal?.aborted === true;
    if (!canceled && totalRows > 0) {
      this.emitExportProgress(options.onProgress, {
        operationId,
        format,
        scope,
        status: 'running',
        processedRows: 0,
        totalRows,
        progress: 0
      });
    }

    outer: for (let segmentIndex = 0; segmentIndex < rowSegments.length; segmentIndex += 1) {
      const segment = rowSegments[segmentIndex];
      for (let rowIndex = segment.startRow; rowIndex <= segment.endRow; rowIndex += 1) {
        if (options.signal?.aborted) {
          canceled = true;
          break outer;
        }

        lines.push(this.serializeExportRow(rowIndex, columns, delimiter));
        processedRows += 1;

        if (processedRows % chunkSize === 0) {
          this.emitExportProgress(options.onProgress, {
            operationId,
            format,
            scope,
            status: 'running',
            processedRows,
            totalRows,
            progress: totalRows > 0 ? Math.min(1, processedRows / totalRows) : 1
          });
          await this.yieldExportFrame();
          if (options.signal?.aborted) {
            canceled = true;
            break outer;
          }
        }
      }
    }

    const completedStatus: GridExportStatus = canceled ? 'canceled' : 'completed';
    this.emitExportProgress(options.onProgress, {
      operationId,
      format,
      scope,
      status: completedStatus,
      processedRows,
      totalRows,
      progress: totalRows > 0 ? Math.min(1, processedRows / totalRows) : 1
    });

    return {
      operationId,
      format,
      scope,
      content: lines.join(DEFAULT_EXPORT_LINE_BREAK),
      rowCount: processedRows,
      canceled
    };
  }

  private emitExportProgress(
    onProgress: GridExportOptions['onProgress'],
    event: GridExportProgressEvent
  ): void {
    if (typeof onProgress !== 'function') {
      return;
    }

    onProgress(event);
  }

  private async yieldExportFrame(): Promise<void> {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  private getVisibleColumnsInRendererOrder(): ColumnDef[] {
    const visibleColumns = this.columnModel.getVisibleColumns();
    const leftColumns: ColumnDef[] = [];
    const centerColumns: ColumnDef[] = [];
    const rightColumns: ColumnDef[] = [];

    for (let index = 0; index < visibleColumns.length; index += 1) {
      const column = visibleColumns[index];
      if (column.pinned === 'left') {
        leftColumns.push(column);
      } else if (column.pinned === 'right') {
        rightColumns.push(column);
      } else {
        centerColumns.push(column);
      }
    }

    return [...leftColumns, ...centerColumns, ...rightColumns];
  }

  private resolveSelectionColumnIndexes(totalColumnCount: number): number[] | null {
    if (totalColumnCount <= 0) {
      return null;
    }

    const selection = this.renderer.getSelection();
    const primaryRange = selection.cellRanges[0];
    if (primaryRange) {
      const startCol = Math.max(0, Math.min(totalColumnCount - 1, Math.min(primaryRange.c1, primaryRange.c2)));
      const endCol = Math.max(0, Math.min(totalColumnCount - 1, Math.max(primaryRange.c1, primaryRange.c2)));
      const indexes: number[] = [];
      for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
        indexes.push(colIndex);
      }
      return indexes;
    }

    if (selection.activeCell) {
      const clampedCol = Math.max(0, Math.min(totalColumnCount - 1, selection.activeCell.colIndex));
      return [clampedCol];
    }

    return null;
  }

  private resolveExportColumns(scope: GridExportScope, includeSystemColumns: boolean): ColumnDef[] {
    const rendererOrderedColumns = this.getVisibleColumnsInRendererOrder();
    const baseColumns = includeSystemColumns
      ? rendererOrderedColumns
      : rendererOrderedColumns.filter((column) => !isSystemUtilityColumn(column.id));

    if (scope !== 'selection') {
      return baseColumns;
    }

    const selectedColumnIndexes = this.resolveSelectionColumnIndexes(rendererOrderedColumns.length);
    if (!selectedColumnIndexes || selectedColumnIndexes.length === 0) {
      return baseColumns;
    }

    const selectedColumns: ColumnDef[] = [];
    for (let index = 0; index < selectedColumnIndexes.length; index += 1) {
      const selectedColumnIndex = selectedColumnIndexes[index];
      const column = rendererOrderedColumns[selectedColumnIndex];
      if (!column) {
        continue;
      }

      if (!includeSystemColumns && isSystemUtilityColumn(column.id)) {
        continue;
      }

      selectedColumns.push(column);
    }

    return selectedColumns.length > 0 ? selectedColumns : baseColumns;
  }

  private resolveExportRowSegments(scope: GridExportScope): ExportRowSegment[] {
    const rowCount = this.rowModel.getViewRowCount();
    if (rowCount <= 0) {
      return [];
    }

    if (scope === 'all') {
      return [{ startRow: 0, endRow: rowCount - 1 }];
    }

    if (scope === 'visible') {
      const visibleRange = this.renderer.getVisibleRowRange();
      if (!visibleRange) {
        return [];
      }

      return this.mergeExportRowSegments(
        [
          {
            startRow: visibleRange.startRow,
            endRow: visibleRange.endRow
          }
        ],
        rowCount
      );
    }

    const selection = this.renderer.getSelection();
    const segments: ExportRowSegment[] = [];
    const primaryRange = selection.cellRanges[0];

    if (primaryRange) {
      segments.push({
        startRow: Math.min(primaryRange.r1, primaryRange.r2),
        endRow: Math.max(primaryRange.r1, primaryRange.r2)
      });
    } else if (selection.rowRanges.length > 0) {
      for (let rangeIndex = 0; rangeIndex < selection.rowRanges.length; rangeIndex += 1) {
        const range = selection.rowRanges[rangeIndex];
        segments.push({
          startRow: Math.min(range.r1, range.r2),
          endRow: Math.max(range.r1, range.r2)
        });
      }
    } else if (selection.activeCell) {
      segments.push({
        startRow: selection.activeCell.rowIndex,
        endRow: selection.activeCell.rowIndex
      });
    }

    return this.mergeExportRowSegments(segments, rowCount);
  }

  private mergeExportRowSegments(segments: ExportRowSegment[], rowCount: number): ExportRowSegment[] {
    if (segments.length === 0 || rowCount <= 0) {
      return [];
    }

    const normalized: ExportRowSegment[] = [];
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!segment) {
        continue;
      }

      const startRow = Math.max(0, Math.min(rowCount - 1, Math.min(segment.startRow, segment.endRow)));
      const endRow = Math.max(0, Math.min(rowCount - 1, Math.max(segment.startRow, segment.endRow)));
      if (endRow < startRow) {
        continue;
      }

      normalized.push({
        startRow,
        endRow
      });
    }

    normalized.sort((left, right) => left.startRow - right.startRow || left.endRow - right.endRow);

    const merged: ExportRowSegment[] = [];
    for (let index = 0; index < normalized.length; index += 1) {
      const current = normalized[index];
      const previous = merged[merged.length - 1];
      if (!previous || current.startRow > previous.endRow + 1) {
        merged.push({ ...current });
        continue;
      }

      previous.endRow = Math.max(previous.endRow, current.endRow);
    }

    return merged;
  }

  private countExportRows(segments: ExportRowSegment[]): number {
    let rowCount = 0;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      rowCount += Math.max(0, segment.endRow - segment.startRow + 1);
    }
    return rowCount;
  }

  private serializeExportHeader(columns: ColumnDef[], delimiter: ',' | '\t'): string {
    const cells = new Array<string>(columns.length);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      cells[columnIndex] = this.escapeDelimitedValue(columns[columnIndex].header, delimiter);
    }

    return cells.join(delimiter);
  }

  private serializeExportRow(rowIndex: number, columns: ColumnDef[], delimiter: ',' | '\t'): string {
    const dataIndex = this.rowModel.getDataIndex(rowIndex);
    const row = this.buildExportRowData(dataIndex, columns);
    const cells = new Array<string>(columns.length);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const text = formatColumnValue(columns[columnIndex], row);
      cells[columnIndex] = this.escapeDelimitedValue(text, delimiter);
    }

    return cells.join(delimiter);
  }

  private buildExportRowData(dataIndex: number, columns: ColumnDef[]): GridRowData {
    if (dataIndex < 0) {
      return {};
    }

    const providerRow = this.options.dataProvider.getRow?.(dataIndex);
    if (providerRow) {
      return providerRow;
    }

    const fallbackRow: GridRowData = {};
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const columnId = columns[columnIndex].id;
      fallbackRow[columnId] = this.options.dataProvider.getValue(dataIndex, columnId);
    }

    return fallbackRow;
  }

  private escapeDelimitedValue(value: string, delimiter: ',' | '\t'): string {
    if (value.length === 0) {
      return '';
    }

    const shouldQuote =
      value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r');
    if (!shouldQuote) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }

  private captureBaseColumnsForClientPivot(): void {
    if (this.baseColumnsBeforeClientPivot) {
      return;
    }

    this.baseColumnsBeforeClientPivot = cloneColumns(this.columnModel.getColumns());
  }

  private buildPivotRenderColumns(pivotColumns: ColumnDef[]): ColumnDef[] {
    const baseColumns = this.baseColumnsBeforeClientPivot ?? this.columnModel.getColumns();
    const specialColumns = baseColumns.filter((column) => isSystemUtilityColumn(column.id)).map((column) => ({ ...column }));
    const seenColumnIds = new Set<string>();
    for (let index = 0; index < specialColumns.length; index += 1) {
      seenColumnIds.add(specialColumns[index].id);
    }

    const mergedColumns: ColumnDef[] = [...specialColumns];
    for (let index = 0; index < pivotColumns.length; index += 1) {
      const column = pivotColumns[index];
      if (seenColumnIds.has(column.id)) {
        continue;
      }

      seenColumnIds.add(column.id);
      mergedColumns.push({ ...column });
    }

    return normalizeSpecialColumns(mergedColumns, this.options.rowIndicator);
  }

  private applyClientPivotColumns(pivotColumns: ColumnDef[]): void {
    this.captureBaseColumnsForClientPivot();
    const columns = this.buildPivotRenderColumns(pivotColumns);
    this.columnModel.setColumns(columns);
    this.pivotColumns = cloneColumns(columns);
    this.syncColumnsToRenderer();
  }

  private restoreColumnsAfterClientPivot(): void {
    if (!this.baseColumnsBeforeClientPivot) {
      return;
    }

    const columns = normalizeSpecialColumns(cloneColumns(this.baseColumnsBeforeClientPivot), this.options.rowIndicator);
    this.columnModel.setColumns(columns);
    this.syncColumnsToRenderer();
    this.baseColumnsBeforeClientPivot = null;
    this.pivotColumns = [];
  }

  private handleDataProviderRowsChanged = (): void => {
    const rowCount = this.sourceDataProvider.getRowCount();
    if (this.rowModel.getState().rowCount !== rowCount) {
      this.rowModel.setRowCount(rowCount);
      if (isRemoteDataProvider(this.sourceDataProvider)) {
        this.sortMapping = null;
        this.filterMapping = null;
      }
    }

    if (
      this.sortModel.length > 0 ||
      this.hasActiveFilterModel() ||
      this.hasActiveClientGrouping() ||
      this.hasActiveTreeData() ||
      this.hasActivePivotModel()
    ) {
      void this.rebuildDerivedView();
      return;
    }

    if ((this.shouldUseServerGrouping() || this.shouldUseServerPivot()) && isRemoteDataProvider(this.sourceDataProvider)) {
      this.sourceDataProvider.setQueryModel({
        sortModel: this.sortModel,
        filterModel: this.filterModel,
        groupModel: this.shouldUseServerGrouping() ? this.groupModel : undefined,
        pivotModel: this.shouldUseServerPivot() ? this.pivotModel : undefined,
        pivotValues: this.shouldUseServerPivot() ? this.pivotValues : undefined
      });
    }

    this.options = {
      ...this.options,
      dataProvider: this.sourceDataProvider
    };
    this.renderer.setOptions(this.getRendererOptions());
  };

  private handleColumnResize = (event: ColumnResizeEvent): void => {
    if (event.phase === 'start') {
      return;
    }

    const hasColumn = this.columnModel.getColumns().some((column) => column.id === event.columnId);
    if (!hasColumn) {
      return;
    }

    this.columnModel.setColumnWidth(event.columnId, event.width);
    this.syncColumnsToRenderer();
  };

  private handleColumnReorder = (event: ColumnReorderEvent): void => {
    if (!Array.isArray(event.columnOrder) || event.columnOrder.length === 0) {
      return;
    }

    this.columnModel.setColumnOrder(event.columnOrder);
    this.syncColumnsToRenderer();
  };

  private handleCellClickForGrouping = (event: GridEventMap['cellClick']): void => {
    if (this.hasActiveTreeData()) {
      return;
    }

    if (!this.hasActiveClientGrouping()) {
      return;
    }

    if (!(this.options.dataProvider instanceof GroupedDataProvider)) {
      return;
    }

    const groupRow = this.options.dataProvider.getGroupRow(event.dataIndex);
    if (!groupRow) {
      return;
    }

    if (event.columnId !== groupRow.columnId) {
      return;
    }

    void this.toggleGroupExpanded(groupRow.groupKey);
  };

  private handleCellClickForTree = (event: GridEventMap['cellClick']): void => {
    if (!this.hasActiveTreeData()) {
      return;
    }

    if (!(this.options.dataProvider instanceof TreeDataProvider)) {
      return;
    }

    const treeRow = this.options.dataProvider.getTreeRow(event.dataIndex);
    if (!treeRow || !treeRow.hasChildren) {
      return;
    }

    const treeColumnId = this.treeDataOptions.treeColumnId ?? '';
    if (treeColumnId.length > 0 && event.columnId !== treeColumnId) {
      return;
    }

    void this.toggleTreeExpanded(treeRow.nodeKey);
  };

  private handleEditCommitForGrouping = (): void => {
    if (this.hasActiveTreeData()) {
      void this.applyTreeViewInternal();
      return;
    }

    if (!this.hasActiveClientGrouping()) {
      return;
    }

    void this.applyGroupingViewInternal();
  };

  private getColumnOrder(): string[] {
    return this.columnModel.getColumns().map((column) => column.id);
  }

  private getRendererOptions(): GridOptions {
    return {
      ...this.options,
      rowModel: this.rowModel,
      columns: this.columnModel.getVisibleColumns()
    };
  }

  private hasActiveFilterModel(): boolean {
    return Object.keys(this.filterModel).length > 0;
  }

  private hasActiveGroupModel(): boolean {
    return this.groupModel.length > 0;
  }

  private hasActivePivotModel(): boolean {
    return this.pivotModel.length > 0 && this.pivotValues.length > 0;
  }

  private hasActiveClientPivot(): boolean {
    return this.hasActivePivotModel() && !isRemoteDataProvider(this.sourceDataProvider) && !this.hasActiveTreeData();
  }

  private hasActiveTreeData(): boolean {
    return this.treeDataOptions.enabled === true && !isRemoteDataProvider(this.sourceDataProvider);
  }

  private hasActiveClientGrouping(): boolean {
    return (
      this.hasActiveGroupModel() &&
      !isRemoteDataProvider(this.sourceDataProvider) &&
      !this.hasActiveTreeData() &&
      !this.hasActivePivotModel()
    );
  }

  private shouldUseServerGrouping(): boolean {
    return this.groupingMode === 'server' && isRemoteDataProvider(this.sourceDataProvider);
  }

  private shouldUseServerPivot(): boolean {
    return this.pivotingMode === 'server' && this.hasActivePivotModel() && isRemoteDataProvider(this.sourceDataProvider);
  }

  private shouldUseServerTreeMode(): boolean {
    return this.treeMode === 'server' && typeof this.treeDataOptions.loadChildren === 'function';
  }

  private getCurrentSourceOrder(rowCount: number): Int32Array {
    if (this.filterMapping) {
      return this.filterMapping;
    }

    if (this.sortMapping) {
      return this.sortMapping;
    }

    return createIdentityMapping(rowCount);
  }

  private getSchemaColumnsForModelNormalization(): ColumnDef[] {
    if (this.baseColumnsBeforeClientPivot && this.baseColumnsBeforeClientPivot.length > 0) {
      return this.baseColumnsBeforeClientPivot;
    }

    return this.columnModel.getColumns();
  }

  private normalizeGroupModel(groupModel: GroupModelItem[]): GroupModelItem[] {
    if (!Array.isArray(groupModel) || groupModel.length === 0) {
      return [];
    }

    const knownColumnIds = new Set<string>();
    const columns = this.getSchemaColumnsForModelNormalization();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const seen = new Set<string>();
    const normalized: GroupModelItem[] = [];
    for (let index = 0; index < groupModel.length; index += 1) {
      const item = groupModel[index];
      if (!item || typeof item.columnId !== 'string') {
        continue;
      }

      const columnId = item.columnId.trim();
      if (columnId.length === 0 || !knownColumnIds.has(columnId) || seen.has(columnId)) {
        continue;
      }

      seen.add(columnId);
      normalized.push({ columnId });
    }

    return normalized;
  }

  private normalizeGroupAggregations(aggregations: GroupAggregationDef[]): GroupAggregationDef[] {
    if (!Array.isArray(aggregations) || aggregations.length === 0) {
      return [];
    }

    const knownColumnIds = new Set<string>();
    const columns = this.getSchemaColumnsForModelNormalization();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const seen = new Set<string>();
    const normalized: GroupAggregationDef[] = [];
    for (let index = 0; index < aggregations.length; index += 1) {
      const item = aggregations[index];
      if (!item || typeof item.columnId !== 'string') {
        continue;
      }

      const columnId = item.columnId.trim();
      if (columnId.length === 0 || !knownColumnIds.has(columnId) || seen.has(columnId)) {
        continue;
      }

      const hasReducer = typeof item.reducer === 'function';
      const type = item.type ?? (hasReducer ? undefined : 'count');
      normalized.push({
        columnId,
        type,
        reducer: hasReducer ? item.reducer : undefined
      });
      seen.add(columnId);
    }

    return normalized;
  }

  private normalizePivotModel(pivotModel: PivotModelItem[]): PivotModelItem[] {
    if (!Array.isArray(pivotModel) || pivotModel.length === 0) {
      return [];
    }

    const knownColumnIds = new Set<string>();
    const columns = this.getSchemaColumnsForModelNormalization();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const seen = new Set<string>();
    const normalized: PivotModelItem[] = [];
    for (let index = 0; index < pivotModel.length; index += 1) {
      const item = pivotModel[index];
      if (!item || typeof item.columnId !== 'string') {
        continue;
      }

      const columnId = item.columnId.trim();
      if (columnId.length === 0 || !knownColumnIds.has(columnId) || seen.has(columnId)) {
        continue;
      }

      seen.add(columnId);
      normalized.push({ columnId });
    }

    return normalized;
  }

  private normalizePivotValues(values: PivotValueDef[]): PivotValueDef[] {
    if (!Array.isArray(values) || values.length === 0) {
      return [];
    }

    const knownColumnIds = new Set<string>();
    const columns = this.getSchemaColumnsForModelNormalization();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const seen = new Set<string>();
    const normalized: PivotValueDef[] = [];
    for (let index = 0; index < values.length; index += 1) {
      const item = values[index];
      if (!item || typeof item.columnId !== 'string') {
        continue;
      }

      const columnId = item.columnId.trim();
      if (columnId.length === 0 || !knownColumnIds.has(columnId) || seen.has(columnId)) {
        continue;
      }

      seen.add(columnId);
      const hasReducer = typeof item.reducer === 'function';
      const type = item.type ?? (hasReducer ? undefined : 'count');
      normalized.push({
        columnId,
        type,
        reducer: hasReducer ? item.reducer : undefined
      });
    }

    return normalized;
  }

  private normalizeTreeDataOptions(treeDataOptions: TreeDataOptions): TreeDataOptions {
    const normalized = mergeTreeDataOptions(this.treeDataOptions, treeDataOptions);
    const columns = this.getSchemaColumnsForModelNormalization();
    const knownColumnIds = new Set<string>();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const treeColumnId = normalized.treeColumnId ?? '';
    const resolvedTreeColumnId =
      treeColumnId.length > 0 && knownColumnIds.has(treeColumnId)
        ? treeColumnId
        : columns.length > 0
          ? columns[0].id
          : '';

    return {
      ...normalized,
      mode: normalized.mode === 'server' ? 'server' : 'client',
      idField: getTreeFieldName(normalized.idField, 'id'),
      parentIdField: getTreeFieldName(normalized.parentIdField, 'parentId'),
      hasChildrenField: getTreeFieldName(normalized.hasChildrenField, 'hasChildren'),
      treeColumnId: resolvedTreeColumnId,
      enabled: normalized.enabled === true,
      defaultExpanded: normalized.defaultExpanded === true,
      rootParentValue: normalized.rootParentValue === undefined ? null : normalized.rootParentValue
    };
  }

  private normalizeFilterModel(filterModel: GridFilterModel): GridFilterModel {
    if (!filterModel || typeof filterModel !== 'object') {
      return {};
    }

    const normalized: GridFilterModel = {};
    const keys = Object.keys(filterModel);
    for (let index = 0; index < keys.length; index += 1) {
      const columnId = keys[index];
      if (!columnId) {
        continue;
      }

      const value = filterModel[columnId];
      if (!value) {
        continue;
      }

      if (Array.isArray(value)) {
        const copiedArray = value
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({ ...(item as ColumnFilterCondition) }));
        if (copiedArray.length > 0) {
          normalized[columnId] = copiedArray;
        }
        continue;
      }

      if (typeof value === 'object') {
        normalized[columnId] = { ...(value as ColumnFilterCondition) };
      }
    }

    return normalized;
  }

  private cloneFilterModel(filterModel: GridFilterModel): GridFilterModel {
    return this.normalizeFilterModel(filterModel);
  }

  private async applyFilterModelInternal(): Promise<void> {
    const rowCount = this.sourceDataProvider.getRowCount();
    const operationToken = ++this.filterOperationToken;
    const opId = `filter-${operationToken}`;

    if (!this.hasActiveFilterModel() || rowCount <= 0) {
      this.filterMapping = null;
      await this.applyDerivedViewToRenderer();
      return;
    }

    const response = await this.filterExecutor.execute(
      {
        opId,
        rowCount,
        filterModel: this.filterModel,
        columns: this.getSchemaColumnsForModelNormalization(),
        dataProvider: this.sourceDataProvider,
        sourceOrder: this.sortMapping ?? createIdentityMapping(rowCount)
      },
      {
        isCanceled: () => operationToken !== this.filterOperationToken
      }
    );

    if (operationToken !== this.filterOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.filterMapping = new Int32Array(response.result.mapping);
    await this.applyDerivedViewToRenderer();
  }

  private async rebuildDerivedView(): Promise<void> {
    if (isRemoteDataProvider(this.sourceDataProvider)) {
      this.sortOperationToken += 1;
      this.filterOperationToken += 1;
      this.groupOperationToken += 1;
      this.pivotOperationToken += 1;
      this.treeOperationToken += 1;
      this.sortMapping = null;
      this.filterMapping = null;
      this.groupRows = [];
      this.groupKeys = [];
      this.groupedDataProvider = null;
      this.pivotDataProvider = null;
      this.pivotColumns = [];
      this.treeRows = [];
      this.treeNodeKeys = [];
      this.treeNodeKeyTokens = [];
      this.treeDataProvider = null;
      this.restoreColumnsAfterClientPivot();
      this.sourceDataProvider.setQueryModel({
        sortModel: this.sortModel,
        filterModel: this.filterModel,
        groupModel: this.shouldUseServerGrouping() ? this.groupModel : undefined,
        pivotModel: this.shouldUseServerPivot() ? this.pivotModel : undefined,
        pivotValues: this.shouldUseServerPivot() ? this.pivotValues : undefined
      });

      const sourceRowCount = this.sourceDataProvider.getRowCount();
      this.rowModel.setRowCount(sourceRowCount);
      this.rowModel.setBaseIdentityMapping();
      this.rowModel.setFilterViewToData(null);
      this.options = {
        ...this.options,
        dataProvider: this.sourceDataProvider
      };
      this.renderer.setOptions(this.getRendererOptions());
      return;
    }

    const sourceRowCount = this.sourceDataProvider.getRowCount();
    if (this.sortModel.length > 0 && sourceRowCount > 0) {
      const operationToken = ++this.sortOperationToken;
      const response = await this.sortExecutor.execute(
        {
          opId: `sort-${operationToken}`,
          rowCount: sourceRowCount,
          sortModel: this.sortModel,
          columns: this.getSchemaColumnsForModelNormalization(),
          dataProvider: this.sourceDataProvider
        },
        {
          isCanceled: () => operationToken !== this.sortOperationToken
        }
      );

      if (operationToken !== this.sortOperationToken) {
        return;
      }

      if (response.status === 'error') {
        throw new Error(response.result.message);
      }

      if (response.status === 'ok') {
        this.sortMapping = new Int32Array(response.result.mapping);
      } else {
        this.sortMapping = null;
      }
    } else {
      this.sortMapping = null;
    }

    if (this.hasActiveFilterModel() && sourceRowCount > 0) {
      const operationToken = ++this.filterOperationToken;
      const response = await this.filterExecutor.execute(
        {
          opId: `filter-${operationToken}`,
          rowCount: sourceRowCount,
          filterModel: this.filterModel,
          columns: this.getSchemaColumnsForModelNormalization(),
          dataProvider: this.sourceDataProvider,
          sourceOrder: this.sortMapping ?? createIdentityMapping(sourceRowCount)
        },
        {
          isCanceled: () => operationToken !== this.filterOperationToken
        }
      );

      if (operationToken !== this.filterOperationToken) {
        return;
      }

      if (response.status === 'error') {
        throw new Error(response.result.message);
      }

      if (response.status === 'ok') {
        this.filterMapping = new Int32Array(response.result.mapping);
      } else {
        this.filterMapping = null;
      }
    } else {
      this.filterMapping = null;
    }

    await this.applyDerivedViewToRenderer();
  }

  private async applyDerivedViewToRenderer(): Promise<void> {
    if (this.hasActiveTreeData()) {
      this.restoreColumnsAfterClientPivot();
      await this.applyTreeViewInternal();
      return;
    }

    if (this.hasActiveClientPivot()) {
      await this.applyPivotViewInternal();
      return;
    }

    if (this.hasActiveClientGrouping()) {
      this.restoreColumnsAfterClientPivot();
      await this.applyGroupingViewInternal();
      return;
    }

    this.restoreColumnsAfterClientPivot();
    const sourceRowCount = this.sourceDataProvider.getRowCount();
    this.treeRows = [];
    this.treeNodeKeys = [];
    this.treeNodeKeyTokens = [];
    this.treeDataProvider = null;
    this.groupRows = [];
    this.groupKeys = [];
    this.groupedDataProvider = null;
    this.pivotDataProvider = null;
    this.pivotColumns = [];
    this.options = {
      ...this.options,
      dataProvider: this.sourceDataProvider
    };

    if (this.rowModel.getState().rowCount !== sourceRowCount) {
      this.rowModel.setRowCount(sourceRowCount);
    }

    if (this.sortMapping) {
      this.rowModel.setBaseViewToData(this.sortMapping);
    } else {
      this.rowModel.setBaseIdentityMapping();
    }

    this.rowModel.setFilterViewToData(this.filterMapping);
    this.renderer.setOptions(this.getRendererOptions());
  }

  private async applyPivotViewInternal(): Promise<void> {
    if (!this.hasActiveClientPivot()) {
      await this.applyDerivedViewToRenderer();
      return;
    }

    const sourceRowCount = this.sourceDataProvider.getRowCount();
    const operationToken = ++this.pivotOperationToken;
    const opId = `pivot-${operationToken}`;
    const response = await this.pivotExecutor.execute(
      {
        opId,
        rowCount: sourceRowCount,
        columns: this.getSchemaColumnsForModelNormalization(),
        dataProvider: this.sourceDataProvider,
        sourceOrder: this.getCurrentSourceOrder(sourceRowCount),
        rowGroupModel: this.groupModel,
        pivotModel: this.pivotModel,
        pivotValues: this.pivotValues
      },
      {
        isCanceled: () => operationToken !== this.pivotOperationToken
      }
    );

    if (operationToken !== this.pivotOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.applyPivotResult(response.result);
    this.renderer.setOptions(this.getRendererOptions());
  }

  private applyPivotResult(result: PivotExecutionResult): void {
    this.groupRows = [];
    this.groupKeys = [];
    this.groupedDataProvider = null;
    this.treeRows = [];
    this.treeNodeKeys = [];
    this.treeNodeKeyTokens = [];
    this.treeDataProvider = null;

    this.applyClientPivotColumns(result.columns);
    this.pivotDataProvider = new LocalDataProvider(result.rows, { keyField: '__pivot_row_key' });
    this.options = {
      ...this.options,
      dataProvider: this.pivotDataProvider
    };
    this.rowModel.setRowCount(this.pivotDataProvider.getRowCount());
    this.rowModel.setBaseIdentityMapping();
    this.rowModel.setFilterViewToData(null);
  }

  private async applyGroupingViewInternal(): Promise<void> {
    if (!this.hasActiveClientGrouping()) {
      await this.applyDerivedViewToRenderer();
      return;
    }

    const sourceRowCount = this.sourceDataProvider.getRowCount();
    const operationToken = ++this.groupOperationToken;
    const opId = `group-${operationToken}`;
    const response = await this.groupExecutor.execute(
      {
        opId,
        rowCount: sourceRowCount,
        groupModel: this.groupModel,
        aggregations: this.groupAggregations,
        columns: this.getSchemaColumnsForModelNormalization(),
        dataProvider: this.sourceDataProvider,
        sourceOrder: this.getCurrentSourceOrder(sourceRowCount),
        groupExpansionState: this.groupExpansionState,
        defaultExpanded: this.groupDefaultExpanded
      },
      {
        isCanceled: () => operationToken !== this.groupOperationToken
      }
    );

    if (operationToken !== this.groupOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.applyGroupingResult(response.result);
    this.renderer.setOptions(this.getRendererOptions());
  }

  private applyGroupingResult(result: GroupExecutionResult): void {
    this.treeRows = [];
    this.treeNodeKeys = [];
    this.treeNodeKeyTokens = [];
    this.treeDataProvider = null;
    this.pivotDataProvider = null;
    this.pivotColumns = [];

    this.groupRows = result.rows;
    this.groupKeys = result.groupKeys.slice();

    if (!this.groupedDataProvider) {
      this.groupedDataProvider = new GroupedDataProvider(this.sourceDataProvider);
    } else {
      this.groupedDataProvider.setSourceDataProvider(this.sourceDataProvider);
    }

    this.groupedDataProvider.applySnapshot({
      rows: result.rows,
      groupKeys: result.groupKeys
    });

    this.options = {
      ...this.options,
      dataProvider: this.groupedDataProvider
    };
    this.rowModel.setRowCount(this.groupedDataProvider.getRowCount());
    this.rowModel.setBaseIdentityMapping();
    this.rowModel.setFilterViewToData(null);
  }

  private async applyTreeViewInternal(expandNodeKey?: RowKey, nextExpanded?: boolean): Promise<void> {
    if (!this.hasActiveTreeData()) {
      await this.applyDerivedViewToRenderer();
      return;
    }

    if (nextExpanded === true && expandNodeKey !== undefined) {
      await this.ensureTreeLazyChildrenLoaded(expandNodeKey);
    }

    const sourceRowCount = this.sourceDataProvider.getRowCount();
    const operationToken = ++this.treeOperationToken;
    const opId = `tree-${operationToken}`;
    const response = await this.treeExecutor.execute(
      {
        opId,
        rowCount: sourceRowCount,
        sourceOrder: this.getCurrentSourceOrder(sourceRowCount),
        dataProvider: this.sourceDataProvider,
        treeData: this.treeDataOptions,
        treeExpansionState: this.treeExpansionState,
        lazyChildrenBatches: Array.from(this.treeLazyChildrenByParent.values())
      },
      {
        isCanceled: () => operationToken !== this.treeOperationToken
      }
    );

    if (operationToken !== this.treeOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.applyTreeResult(response.result);
    this.renderer.setOptions(this.getRendererOptions());
  }

  private applyTreeResult(result: TreeExecutionResult): void {
    this.groupRows = [];
    this.groupKeys = [];
    this.groupedDataProvider = null;
    this.pivotDataProvider = null;
    this.pivotColumns = [];

    this.treeRows = result.rows;
    this.treeNodeKeys = result.nodeKeys.slice();
    this.treeNodeKeyTokens = result.nodeKeyTokens.slice();

    if (!this.treeDataProvider) {
      this.treeDataProvider = new TreeDataProvider(this.sourceDataProvider);
    } else {
      this.treeDataProvider.setSourceDataProvider(this.sourceDataProvider);
    }

    this.treeDataProvider.setTreeColumnId(this.treeDataOptions.treeColumnId ?? '');
    this.treeDataProvider.applySnapshot({
      rows: result.rows,
      nodeKeys: result.nodeKeys,
      nodeKeyTokens: result.nodeKeyTokens
    });

    this.options = {
      ...this.options,
      dataProvider: this.treeDataProvider
    };
    this.rowModel.setRowCount(this.treeDataProvider.getRowCount());
    this.rowModel.setBaseIdentityMapping();
    this.rowModel.setFilterViewToData(null);
  }

  private async ensureTreeLazyChildrenLoaded(nodeKey: RowKey): Promise<void> {
    if (!this.shouldUseServerTreeMode()) {
      return;
    }

    const parentToken = toTreeNodeKeyToken(nodeKey);
    if (this.treeLazyChildrenByParent.has(parentToken) || this.treeLoadingParents.has(parentToken)) {
      return;
    }

    const treeRow = this.findTreeRowByNodeToken(parentToken);
    if (!treeRow || !treeRow.hasChildren) {
      return;
    }

    const loadChildren = this.treeDataOptions.loadChildren;
    if (typeof loadChildren !== 'function') {
      return;
    }

    const parentRow = this.resolveTreeParentRow(treeRow);
    if (!parentRow) {
      return;
    }

    this.treeLoadingParents.add(parentToken);
    const loadToken = ++this.treeLoadOperationToken;
    try {
      const loaded = await loadChildren({
        parentNodeKey: nodeKey,
        parentRow,
        depth: treeRow.depth
      });

      if (loadToken !== this.treeLoadOperationToken) {
        return;
      }

      const loadedRows = Array.isArray(loaded) ? loaded : loaded?.rows;
      if (!Array.isArray(loadedRows) || loadedRows.length === 0) {
        this.treeLazyChildrenByParent.set(parentToken, {
          parentNodeKey: nodeKey,
          rows: []
        });
        return;
      }

      this.treeLazyChildrenByParent.set(parentToken, {
        parentNodeKey: nodeKey,
        rows: loadedRows.map((row) => ({ ...row }))
      });
    } finally {
      this.treeLoadingParents.delete(parentToken);
    }
  }

  private findTreeRowByNodeToken(nodeToken: string): TreeExecutionResult['rows'][number] | null {
    for (let index = 0; index < this.treeRows.length; index += 1) {
      const treeRow = this.treeRows[index];
      if (toTreeNodeKeyToken(treeRow.nodeKey) === nodeToken) {
        return treeRow;
      }
    }

    return null;
  }

  private resolveTreeParentRow(treeRow: TreeExecutionResult['rows'][number]): GridRowData | null {
    if (treeRow.localRow) {
      return { ...treeRow.localRow };
    }

    if (treeRow.sourceDataIndex !== null) {
      const row = this.sourceDataProvider.getRow?.(treeRow.sourceDataIndex);
      if (row) {
        return { ...row };
      }
    }

    return null;
  }

  private normalizeSortModel(sortModel: SortModelItem[]): SortModelItem[] {
    if (!Array.isArray(sortModel) || sortModel.length === 0) {
      return [];
    }

    const columns = this.columnModel.getColumns();
    const knownColumnIds = new Set<string>();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const normalized: SortModelItem[] = [];
    const seenColumnIds = new Set<string>();
    for (let index = 0; index < sortModel.length; index += 1) {
      const item = sortModel[index];
      if (!item || typeof item.columnId !== 'string' || item.columnId.length === 0) {
        continue;
      }

      if (!knownColumnIds.has(item.columnId) || seenColumnIds.has(item.columnId)) {
        continue;
      }

      seenColumnIds.add(item.columnId);
      normalized.push({
        columnId: item.columnId,
        direction: item.direction === 'desc' ? 'desc' : 'asc'
      });
    }

    return normalized;
  }
}
