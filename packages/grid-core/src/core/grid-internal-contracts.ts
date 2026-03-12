import type { EditCommitAuditLogger } from './edit-events';
import type { ColumnDef, ColumnPinPosition, GridOptions } from './grid-options';
import type { GridRowData, DataProvider, RowKey } from '../data/data-provider';
import type { RowModelState, ViewToDataMapping } from '../data/row-model';
import type { GridSelection, GridSelectionInput } from '../interaction/selection-model';

export interface GridRendererState {
  scrollTop: number;
}

export interface GridVisibleRowRange {
  startRow: number;
  endRow: number;
}

export interface GridRendererPort {
  setOptions(options: GridOptions): void;
  refreshDataView(): void;
  setColumns(columns: ColumnDef[]): void;
  setTheme(themeTokens: Record<string, string>): void;
  getState(): GridRendererState;
  setState(state: GridRendererState): void;
  getSelection(): GridSelection;
  setSelection(selection: GridSelectionInput): void;
  clearSelection(): void;
  getVisibleRowRange(): GridVisibleRowRange | null;
  resetRowHeights(rowIndexes?: number[]): void;
  destroy(): void;
}

export interface GridColumnStatePort {
  setColumnOrder(columnIds: string[]): void;
  getColumns(): ColumnDef[];
  setColumnVisibility(columnId: string, isVisible: boolean): void;
  setColumnPin(columnId: string, pinned?: ColumnPinPosition): void;
}

export interface GridDerivedViewRowModelPort {
  getState(): RowModelState;
  setRowCount(rowCount: number): void;
  setBaseViewToData(viewToData: ViewToDataMapping | null): void;
  setBaseViewToDataTrusted(viewToData: Int32Array | null): void;
  setBaseIdentityMapping(): void;
  setFilterViewToData(viewToData: ViewToDataMapping | null): void;
  setFilterViewToDataTrusted(viewToData: Int32Array | null): void;
}

export interface GridExportDataPort {
  rendererOrderedColumns: ColumnDef[];
  selection: GridSelection;
  visibleRowRange: GridVisibleRowRange | null;
  viewRowCount: number;
  getDataIndex: (rowIndex: number) => number;
  getRow: (dataIndex: number) => GridRowData | undefined;
  getValue: (dataIndex: number, columnId: string) => unknown;
  formatCell: (column: ColumnDef, row: GridRowData) => string;
  isSystemColumn: (columnId: string) => boolean;
  yieldControl?: () => Promise<void>;
}

export interface GridColumnMutationPort {
  hasColumn(columnId: string): boolean;
  setColumnWidth(columnId: string, width: number): void;
  setColumnOrder(columnOrder: string[]): void;
  setColumnVisibility(columnId: string, isVisible: boolean): void;
  setColumnPin(columnId: string, pinned?: ColumnPinPosition): void;
  syncColumnsToRenderer(): void;
}

export interface GridDerivedViewControllerPort {
  isTreeDataActive(): boolean;
  isClientGroupingActive(): boolean;
  isTreeToggleActive(): boolean;
  isGroupingToggleActive(): boolean;
  getDataProvider(): DataProvider;
  getTreeColumnId(): string;
  toggleGroupExpanded(groupKey: string): Promise<void> | void;
  toggleTreeExpanded(nodeKey: RowKey): Promise<void> | void;
  applyGroupingView(): Promise<void> | void;
  applyTreeView(): Promise<void> | void;
}

export interface GridWorkerProjectionCachePort {
  invalidateWorkerProjectionCache(): void;
}

export interface GridAuditLogPort {
  getAuditLogHook(): EditCommitAuditLogger | undefined;
}

export interface GridSortMutationPort {
  setSortModel(sortModel: Array<{ columnId: string; direction: 'asc' | 'desc' }>): Promise<void> | void;
  clearSortModel(): Promise<void> | void;
}
