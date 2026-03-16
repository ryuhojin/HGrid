import type { EditCommitAuditLogger } from './edit-events';
import type {
  ColumnDef,
  GridColumnLayout,
  ColumnPinPosition,
  GridOptions,
  GroupAggregationDef,
  GroupModelItem,
  GroupingMode,
  PivotModelItem,
  PivotValueDef,
  PivotingMode
} from './grid-options';
import type { GridRowData, DataProvider, RowKey } from '../data/data-provider';
import type { RowModelState, ViewToDataMapping } from '../data/row-model';
import type { GridSelection, GridSelectionInput } from '../interaction/selection-model';
import type { AdvancedFilterModel, GridFilterModel } from '../data/filter-executor';
import type { GridAdvancedFilterPreset } from './grid-options';

export interface GridRendererState {
  scrollTop: number;
}

export interface GridVisibleRowRange {
  startRow: number;
  endRow: number;
}

export interface GridRendererPort {
  setOptions(options: GridOptions): void;
  setFilterModel(filterModel: GridFilterModel): void;
  setAdvancedFilterModel(advancedFilterModel: AdvancedFilterModel | null): void;
  refreshDataView(): void;
  setColumns(columns: ColumnDef[]): void;
  setColumnCatalog(columns: ColumnDef[]): void;
  setTheme(themeTokens: Record<string, string>): void;
  getState(): GridRendererState;
  setState(state: GridRendererState): void;
  getSelection(): GridSelection;
  setSelection(selection: GridSelectionInput): void;
  clearSelection(): void;
  undoLastEdit(): boolean;
  redoLastEdit(): boolean;
  canUndoEdit(): boolean;
  canRedoEdit(): boolean;
  getVisibleRowRange(): GridVisibleRowRange | null;
  resetRowHeights(rowIndexes?: number[]): void;
  destroy(): void;
}

export interface GridColumnStatePort {
  setColumnOrder(columnIds: string[]): void;
  getColumns(): ColumnDef[];
  setColumnVisibility(columnId: string, isVisible: boolean): void;
  setColumnWidth(columnId: string, width: number): void;
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

export interface GridColumnLayoutMutationPort {
  setColumnLayout(layout: GridColumnLayout): void;
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

export interface GridFilterMutationPort {
  getFilterModel(): GridFilterModel;
  setFilterModel(filterModel: GridFilterModel): Promise<void> | void;
  clearFilterModel(): Promise<void> | void;
  getAdvancedFilterModel(): AdvancedFilterModel | null;
  setAdvancedFilterModel(advancedFilterModel: AdvancedFilterModel | null): Promise<void> | void;
}

export interface GridCustomToolPanelActionPort extends GridFilterMutationPort, GridColumnLayoutMutationPort {}

export interface GridAdvancedFilterPresetMutationPort {
  getAdvancedFilterPresets(): GridAdvancedFilterPreset[];
  saveAdvancedFilterPreset(presetId: string, label?: string): boolean;
  applyAdvancedFilterPreset(presetId: string): Promise<boolean> | boolean;
  deleteAdvancedFilterPreset(presetId: string): boolean;
}

export interface GridGroupingMutationPort {
  applyGroupingPanelState(nextState: {
    mode: GroupingMode;
    groupModel: GroupModelItem[];
    aggregations: GroupAggregationDef[];
  }): Promise<void> | void;
}

export interface GridPivotMutationPort {
  applyPivotPanelState(nextState: {
    mode: PivotingMode;
    pivotModel: PivotModelItem[];
    values: PivotValueDef[];
  }): Promise<void> | void;
}
