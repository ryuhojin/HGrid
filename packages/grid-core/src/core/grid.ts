import { EventBus } from './event-bus';
import type { ColumnReorderEvent, ColumnResizeEvent, GridEventMap, GridEventName } from './event-bus';
import type {
  ColumnDef,
  ColumnGroupDef,
  GroupAggregationDef,
  GroupModelItem,
  GroupingMode,
  ColumnPinPosition,
  GridConfig,
  GridOptions,
  GridState,
  GridTheme,
  RowIndicatorOptions
} from './grid-options';
import { DomRenderer } from '../render/dom-renderer';
import { ColumnModel } from '../data/column-model';
import type { ColumnFilterCondition, GridFilterModel } from '../data/filter-executor';
import { CooperativeFilterExecutor, type FilterExecutor } from '../data/filter-executor';
import { LocalDataProvider } from '../data/local-data-provider';
import type { RowModelOptions, RowModelState, SparseRowOverride, ViewToDataMapping } from '../data/row-model';
import { RowModel } from '../data/row-model';
import type { RemoteDataProvider as RemoteDataProviderContract, SortModelItem } from '../data/remote-data-provider';
import { CooperativeSortExecutor, type SortExecutor } from '../data/sort-executor';
import type { GridSelection, GridSelectionInput } from '../interaction/selection-model';
import { CooperativeGroupExecutor, type GroupExecutionResult, type GroupExecutor, type GroupViewRow } from '../data/group-executor';
import { GroupedDataProvider } from '../data/grouped-data-provider';

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

export class Grid {
  private options: GridOptions;
  private sourceDataProvider: GridOptions['dataProvider'];
  private groupedDataProvider: GroupedDataProvider | null = null;
  private readonly columnModel: ColumnModel;
  private readonly rowModel: RowModel;
  private readonly eventBus: EventBus;
  private readonly renderer: DomRenderer;
  private readonly sortExecutor: SortExecutor;
  private readonly filterExecutor: FilterExecutor;
  private readonly groupExecutor: GroupExecutor;
  private sortModel: SortModelItem[] = [];
  private filterModel: GridFilterModel = {};
  private groupModel: GroupModelItem[] = [];
  private groupAggregations: GroupAggregationDef[] = [];
  private groupingMode: GroupingMode = 'client';
  private groupDefaultExpanded = true;
  private groupExpansionState: Record<string, boolean> = {};
  private groupRows: GroupViewRow[] = [];
  private groupKeys: string[] = [];
  private sortOperationToken = 0;
  private filterOperationToken = 0;
  private groupOperationToken = 0;
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
    this.eventBus.on('cellClick', this.handleCellClickForGrouping);
    this.eventBus.on('editCommit', this.handleEditCommitForGrouping);
    this.sortExecutor = new CooperativeSortExecutor();
    this.filterExecutor = new CooperativeFilterExecutor();
    this.groupExecutor = new CooperativeGroupExecutor();
    this.groupModel = this.normalizeGroupModel(this.options.grouping?.groupModel ?? []);
    this.groupAggregations = this.normalizeGroupAggregations(this.options.grouping?.aggregations ?? []);
    this.groupingMode = this.options.grouping?.mode === 'server' ? 'server' : 'client';
    this.groupDefaultExpanded = this.options.grouping?.defaultExpanded !== false;
    this.renderer = new DomRenderer(container, this.getRendererOptions(), this.eventBus);
    this.bindDataProvider(this.sourceDataProvider);
    void this.rebuildDerivedView();
  }

  public setColumns(columns: ColumnDef[]): void {
    this.columnModel.setColumns(normalizeSpecialColumns(columns, this.options.rowIndicator));
    this.syncColumnsToRenderer();
    this.groupModel = this.normalizeGroupModel(this.groupModel);
    this.groupAggregations = this.normalizeGroupAggregations(this.groupAggregations);
    void this.rebuildDerivedView();
  }

  public setOptions(options: GridConfig): void {
    const nextRowIndicator = mergeRowIndicatorOptions(this.options.rowIndicator, options.rowIndicator);
    const nextStateColumn = mergeStateColumnOptions(this.options.stateColumn, options.stateColumn);
    const nextGrouping = mergeGroupingOptions(this.options.grouping, options.grouping);

    if (options.columns || options.rowIndicator) {
      const sourceColumns = options.columns ?? this.columnModel.getColumns();
      this.columnModel.setColumns(normalizeSpecialColumns(sourceColumns, nextRowIndicator));
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
      this.sortMapping = null;
      this.filterMapping = null;
      this.groupRows = [];
      this.groupKeys = [];
      this.groupedDataProvider = null;
      this.groupExpansionState = {};
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
      dataProvider: this.options.dataProvider,
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
      this.sortMapping = null;
      this.filterMapping = null;
      this.sourceDataProvider.setQueryModel({
        sortModel: normalizedSortModel,
        filterModel: this.filterModel,
        groupModel: this.shouldUseServerGrouping() ? this.groupModel : undefined
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
      this.renderer.setOptions(this.getRendererOptions());
      return;
    }

    const rowCount = this.sourceDataProvider.getRowCount();
    this.filterOperationToken += 1;
    this.groupOperationToken += 1;
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
        columns: this.columnModel.getColumns(),
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
      this.sourceDataProvider.setQueryModel({
        sortModel: this.sortModel,
        filterModel: this.filterModel,
        groupModel: this.shouldUseServerGrouping() ? this.groupModel : undefined
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
    const columns = this.columnModel.getColumns();
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
      groupExpansionState: cloneGroupExpansionState(this.groupExpansionState)
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

    if (state.groupExpansionState && typeof state.groupExpansionState === 'object') {
      this.groupExpansionState = cloneGroupExpansionState(state.groupExpansionState);
      shouldRefreshGrouping = true;
    }

    this.renderer.setState({
      scrollTop: state.scrollTop
    });

    if (shouldRefreshGrouping) {
      void this.applyGroupingViewInternal();
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

  private handleDataProviderRowsChanged = (): void => {
    const rowCount = this.sourceDataProvider.getRowCount();
    if (this.rowModel.getState().rowCount !== rowCount) {
      this.rowModel.setRowCount(rowCount);
      if (isRemoteDataProvider(this.sourceDataProvider)) {
        this.sortMapping = null;
        this.filterMapping = null;
      }
    }

    if (this.sortModel.length > 0 || this.hasActiveFilterModel() || this.hasActiveClientGrouping()) {
      void this.rebuildDerivedView();
      return;
    }

    if (this.shouldUseServerGrouping() && isRemoteDataProvider(this.sourceDataProvider)) {
      this.sourceDataProvider.setQueryModel({
        sortModel: this.sortModel,
        filterModel: this.filterModel,
        groupModel: this.groupModel
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

  private handleEditCommitForGrouping = (): void => {
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

  private hasActiveClientGrouping(): boolean {
    return this.hasActiveGroupModel() && !isRemoteDataProvider(this.sourceDataProvider);
  }

  private shouldUseServerGrouping(): boolean {
    return this.groupingMode === 'server' && isRemoteDataProvider(this.sourceDataProvider);
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

  private normalizeGroupModel(groupModel: GroupModelItem[]): GroupModelItem[] {
    if (!Array.isArray(groupModel) || groupModel.length === 0) {
      return [];
    }

    const knownColumnIds = new Set<string>();
    const columns = this.columnModel.getColumns();
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
    const columns = this.columnModel.getColumns();
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
        columns: this.columnModel.getColumns(),
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
      this.sortMapping = null;
      this.filterMapping = null;
      this.groupRows = [];
      this.groupKeys = [];
      this.groupedDataProvider = null;
      this.sourceDataProvider.setQueryModel({
        sortModel: this.sortModel,
        filterModel: this.filterModel,
        groupModel: this.shouldUseServerGrouping() ? this.groupModel : undefined
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
          columns: this.columnModel.getColumns(),
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
          columns: this.columnModel.getColumns(),
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
    if (this.hasActiveClientGrouping()) {
      await this.applyGroupingViewInternal();
      return;
    }

    const sourceRowCount = this.sourceDataProvider.getRowCount();
    this.groupRows = [];
    this.groupKeys = [];
    this.groupedDataProvider = null;
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
        columns: this.columnModel.getColumns(),
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
