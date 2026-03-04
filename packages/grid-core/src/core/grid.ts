import { EventBus } from './event-bus';
import type { GridEventMap, GridEventName } from './event-bus';
import type { ColumnDef, GridConfig, GridOptions, GridState, GridTheme } from './grid-options';
import { DomRenderer } from '../render/dom-renderer';
import { ColumnModel } from '../data/column-model';
import { LocalDataProvider } from '../data/local-data-provider';
import type { RowModelOptions, RowModelState, ViewToDataMapping } from '../data/row-model';
import { RowModel } from '../data/row-model';

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
    overscan: config?.overscan,
    overscanCols: config?.overscanCols,
    scrollbarPolicy: mergeScrollbarPolicy(DEFAULT_SCROLLBAR_POLICY, config?.scrollbarPolicy)
  };
}

export class Grid {
  private options: GridOptions;
  private readonly columnModel: ColumnModel;
  private readonly rowModel: RowModel;
  private readonly eventBus: EventBus;
  private readonly renderer: DomRenderer;

  public constructor(container: HTMLElement, config?: GridConfig) {
    const normalizedOptions = normalizeOptions(config);
    this.rowModel = normalizedOptions.rowModel;
    this.columnModel = new ColumnModel(normalizedOptions.columns);
    this.options = {
      ...normalizedOptions,
      columns: this.columnModel.getColumns()
    };
    this.eventBus = new EventBus();
    this.renderer = new DomRenderer(container, this.getRendererOptions(), this.eventBus);
  }

  public setColumns(columns: ColumnDef[]): void {
    this.columnModel.setColumns(columns);
    this.syncColumnsToRenderer();
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
      this.rowModel.setRowCount(nextDataProvider.getRowCount());
    }

    if (options.rowModelOptions) {
      this.rowModel.setOptions(options.rowModelOptions);
    }

    this.options = {
      ...this.options,
      height: options.height ?? this.options.height,
      rowHeight: options.rowHeight ?? this.options.rowHeight,
      overscan: options.overscan ?? this.options.overscan,
      overscanCols: options.overscanCols ?? this.options.overscanCols,
      scrollbarPolicy: mergeScrollbarPolicy(this.options.scrollbarPolicy, options.scrollbarPolicy),
      dataProvider: nextDataProvider,
      rowModel: this.rowModel,
      columns: this.columnModel.getColumns()
    };
    this.renderer.setOptions(this.getRendererOptions());
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

  public setRowModelOptions(options: RowModelOptions): void {
    this.rowModel.setOptions(options);
  }

  public getRowModelState(): RowModelState {
    return this.rowModel.getState();
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
}
