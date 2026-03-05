import { EventBus } from './event-bus';
import type { ColumnReorderEvent, ColumnResizeEvent, GridEventMap, GridEventName } from './event-bus';
import type {
  ColumnDef,
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
import type { SortModelItem } from '../data/remote-data-provider';
import { CooperativeSortExecutor, type SortExecutor } from '../data/sort-executor';
import type { GridSelection, GridSelectionInput } from '../interaction/selection-model';

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

function normalizeOptions(config?: GridConfig): GridOptions {
  const dataProvider = config?.dataProvider ?? new LocalDataProvider(config?.rowData ?? []);
  const rowModel = new RowModel(dataProvider.getRowCount(), config?.rowModelOptions);
  const rowIndicator = mergeRowIndicatorOptions(undefined, config?.rowIndicator);

  return {
    columns: normalizeSpecialColumns(config?.columns ?? [], rowIndicator),
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

export class Grid {
  private options: GridOptions;
  private readonly columnModel: ColumnModel;
  private readonly rowModel: RowModel;
  private readonly eventBus: EventBus;
  private readonly renderer: DomRenderer;
  private readonly sortExecutor: SortExecutor;
  private readonly filterExecutor: FilterExecutor;
  private sortModel: SortModelItem[] = [];
  private filterModel: GridFilterModel = {};
  private sortOperationToken = 0;
  private filterOperationToken = 0;
  private sortMapping: Int32Array | null = null;

  public constructor(container: HTMLElement, config?: GridConfig) {
    const normalizedOptions = normalizeOptions(config);
    this.rowModel = normalizedOptions.rowModel;
    this.columnModel = new ColumnModel(normalizedOptions.columns);
    this.options = {
      ...normalizedOptions,
      columns: this.columnModel.getColumns()
    };
    this.eventBus = new EventBus();
    this.eventBus.on('columnResize', this.handleColumnResize);
    this.eventBus.on('columnReorder', this.handleColumnReorder);
    this.sortExecutor = new CooperativeSortExecutor();
    this.filterExecutor = new CooperativeFilterExecutor();
    this.renderer = new DomRenderer(container, this.getRendererOptions(), this.eventBus);
  }

  public setColumns(columns: ColumnDef[]): void {
    this.columnModel.setColumns(normalizeSpecialColumns(columns, this.options.rowIndicator));
    this.syncColumnsToRenderer();
    if (this.sortModel.length > 0) {
      void this.setSortModel(this.sortModel);
    } else if (this.hasActiveFilterModel()) {
      void this.setFilterModel(this.filterModel);
    }
  }

  public setOptions(options: GridConfig): void {
    const nextRowIndicator = mergeRowIndicatorOptions(this.options.rowIndicator, options.rowIndicator);
    const nextStateColumn = mergeStateColumnOptions(this.options.stateColumn, options.stateColumn);

    if (options.columns || options.rowIndicator) {
      const sourceColumns = options.columns ?? this.columnModel.getColumns();
      this.columnModel.setColumns(normalizeSpecialColumns(sourceColumns, nextRowIndicator));
    }

    const hasProviderOption = Boolean(options.dataProvider || options.rowData);
    const nextDataProvider = hasProviderOption
      ? options.dataProvider ?? new LocalDataProvider(options.rowData ?? [])
      : this.options.dataProvider;

    if (hasProviderOption) {
      this.sortOperationToken += 1;
      this.filterOperationToken += 1;
      this.sortMapping = null;
      this.rowModel.setRowCount(nextDataProvider.getRowCount());
    }

    if (options.rowModelOptions) {
      this.rowModel.setOptions(options.rowModelOptions);
    }

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
      dataProvider: nextDataProvider,
      rowModel: this.rowModel,
      columns: this.columnModel.getColumns()
    };
    this.renderer.setOptions(this.getRendererOptions());

    if (hasProviderOption) {
      if (this.sortModel.length > 0) {
        void this.setSortModel(this.sortModel);
      } else if (this.hasActiveFilterModel()) {
        void this.setFilterModel(this.filterModel);
      }
    }
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
    this.rowModel.resetToIdentity(this.options.dataProvider.getRowCount());
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
    const rowCount = this.options.dataProvider.getRowCount();
    this.filterOperationToken += 1;
    const operationToken = ++this.sortOperationToken;
    const opId = `sort-${operationToken}`;

    if (normalizedSortModel.length === 0 || rowCount <= 0) {
      this.sortMapping = null;
      this.rowModel.setBaseIdentityMapping();
      if (this.hasActiveFilterModel() && rowCount > 0) {
        await this.applyFilterModelInternal();
      } else {
        this.rowModel.setFilterViewToData(null);
        this.renderer.setOptions(this.getRendererOptions());
      }
      return;
    }

    const response = await this.sortExecutor.execute(
      {
        opId,
        rowCount,
        sortModel: normalizedSortModel,
        columns: this.columnModel.getColumns(),
        dataProvider: this.options.dataProvider
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
    this.rowModel.setBaseViewToData(this.sortMapping);
    if (this.hasActiveFilterModel()) {
      await this.applyFilterModelInternal();
    } else {
      this.rowModel.setFilterViewToData(null);
      this.renderer.setOptions(this.getRendererOptions());
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
    await this.applyFilterModelInternal();
  }

  public async clearFilterModel(): Promise<void> {
    await this.setFilterModel({});
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
      pinnedColumns
    };
  }

  public setState(state: GridState): void {
    let shouldSyncColumns = false;

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

    this.renderer.setState({
      scrollTop: state.scrollTop
    });
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
    this.eventBus.off('columnResize', this.handleColumnResize);
    this.eventBus.off('columnReorder', this.handleColumnReorder);
    this.renderer.destroy();
  }

  private syncColumnsToRenderer(): void {
    this.options = {
      ...this.options,
      columns: this.columnModel.getColumns()
    };
    this.renderer.setColumns(this.columnModel.getVisibleColumns());
  }

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
    const rowCount = this.options.dataProvider.getRowCount();
    const operationToken = ++this.filterOperationToken;
    const opId = `filter-${operationToken}`;

    if (!this.hasActiveFilterModel() || rowCount <= 0) {
      this.rowModel.setFilterViewToData(null);
      this.renderer.setOptions(this.getRendererOptions());
      return;
    }

    const response = await this.filterExecutor.execute(
      {
        opId,
        rowCount,
        filterModel: this.filterModel,
        columns: this.columnModel.getColumns(),
        dataProvider: this.options.dataProvider,
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

    this.rowModel.setFilterViewToData(response.result.mapping);
    this.renderer.setOptions(this.getRendererOptions());
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
