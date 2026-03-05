import { Grid } from '@hgrid/grid-core';
import type {
  ColumnDef,
  ColumnPinPosition,
  GridConfig,
  GridSelection,
  GridSelectionInput,
  GridEventMap,
  GridEventName,
  RowModelOptions,
  RowModelState,
  GridState,
  GridTheme,
  ViewToDataMapping
} from '@hgrid/grid-core';

export type {
  ColumnDef,
  ColumnPinPosition,
  GridConfig,
  GridEventMap,
  GridEventName,
  GridSelection,
  GridSelectionInput,
  GridState,
  GridTheme,
  RowModelOptions,
  RowModelState,
  ViewToDataMapping
};

export class VueGridAdapter {
  private readonly grid: Grid;

  public constructor(container: HTMLElement, config?: GridConfig) {
    this.grid = new Grid(container, config);
  }

  public setColumns(columns: ColumnDef[]): void {
    this.grid.setColumns(columns);
  }

  public setOptions(options: GridConfig): void {
    this.grid.setOptions(options);
  }

  public setColumnOrder(columnIds: string[]): void {
    this.grid.setColumnOrder(columnIds);
  }

  public setColumnVisibility(columnId: string, isVisible: boolean): void {
    this.grid.setColumnVisibility(columnId, isVisible);
  }

  public setColumnWidth(columnId: string, width: number): void {
    this.grid.setColumnWidth(columnId, width);
  }

  public setColumnPin(columnId: string, pinned?: ColumnPinPosition): void {
    this.grid.setColumnPin(columnId, pinned);
  }

  public setRowOrder(viewToData: ViewToDataMapping): void {
    this.grid.setRowOrder(viewToData);
  }

  public setFilteredRowOrder(viewToData: ViewToDataMapping | null): void {
    this.grid.setFilteredRowOrder(viewToData);
  }

  public resetRowOrder(): void {
    this.grid.resetRowOrder();
  }

  public setRowModelOptions(options: RowModelOptions): void {
    this.grid.setRowModelOptions(options);
  }

  public getRowModelState(): RowModelState {
    return this.grid.getRowModelState();
  }

  public setTheme(themeTokens: GridTheme): void {
    this.grid.setTheme(themeTokens);
  }

  public getState(): GridState {
    return this.grid.getState();
  }

  public setState(state: GridState): void {
    this.grid.setState(state);
  }

  public getSelection(): GridSelection {
    return this.grid.getSelection();
  }

  public setSelection(selection: GridSelectionInput): void {
    this.grid.setSelection(selection);
  }

  public clearSelection(): void {
    this.grid.clearSelection();
  }

  public on<K extends GridEventName>(eventName: K, handler: (payload: GridEventMap[K]) => void): void {
    this.grid.on(eventName, handler);
  }

  public off<K extends GridEventName>(eventName: K, handler: (payload: GridEventMap[K]) => void): void {
    this.grid.off(eventName, handler);
  }

  public destroy(): void {
    this.grid.destroy();
  }
}

export function createVueGridAdapter(container: HTMLElement, config?: GridConfig): VueGridAdapter {
  return new VueGridAdapter(container, config);
}
