import { EventBus } from './event-bus';
import type { GridEventMap, GridEventName } from './event-bus';
import type { ColumnDef, GridConfig, GridOptions, GridState, GridTheme } from './grid-options';
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

function normalizeOptions(config?: GridConfig): GridOptions {
  const dataProvider = config?.dataProvider ?? new LocalDataProvider(config?.rowData ?? []);
  const rowModel = new RowModel(dataProvider.getRowCount(), config?.rowModelOptions);

  return {
    columns: config?.columns ?? [],
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
    scrollbarPolicy: mergeScrollbarPolicy(DEFAULT_SCROLLBAR_POLICY, config?.scrollbarPolicy)
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
    this.sortExecutor = new CooperativeSortExecutor();
    this.filterExecutor = new CooperativeFilterExecutor();
    this.renderer = new DomRenderer(container, this.getRendererOptions(), this.eventBus);
  }

  public setColumns(columns: ColumnDef[]): void {
    this.columnModel.setColumns(columns);
    this.syncColumnsToRenderer();
    if (this.sortModel.length > 0) {
      void this.setSortModel(this.sortModel);
    } else if (this.hasActiveFilterModel()) {
      void this.setFilterModel(this.filterModel);
    }
  }

  public setOptions(options: GridConfig): void {
    if (options.columns) {
      this.columnModel.setColumns(options.columns);
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

  public setTheme(themeTokens: GridTheme): void {
    this.renderer.setTheme(themeTokens);
  }

  public getState(): GridState {
    return this.renderer.getState();
  }

  public setState(state: GridState): void {
    this.renderer.setState(state);
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
    this.renderer.destroy();
  }

  private syncColumnsToRenderer(): void {
    this.options = {
      ...this.options,
      columns: this.columnModel.getColumns()
    };
    this.renderer.setColumns(this.columnModel.getVisibleColumns());
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
