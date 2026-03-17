import { Grid } from '@hgrid/grid-core';
import type {
  AdvancedFilterModel,
  ColumnDef,
  GridAdvancedFilterPreset,
  GridColumnLayout,
  GridDirtyChangeOptions,
  GridDirtyChangeSummary,
  GridDirtyRowChange,
  ColumnPinPosition,
  GroupAggregationDef,
  GroupModelItem,
  GroupingMode,
  PivotModelItem,
  PivotValueDef,
  PivotingMode,
  TreeDataOptions,
  TreeViewRow,
  RowKey,
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
  AdvancedFilterModel,
  ColumnDef,
  GridAdvancedFilterPreset,
  GridColumnLayout,
  GridDirtyChangeOptions,
  GridDirtyChangeSummary,
  GridDirtyRowChange,
  ColumnPinPosition,
  GroupAggregationDef,
  GroupModelItem,
  GroupingMode,
  PivotModelItem,
  PivotValueDef,
  PivotingMode,
  TreeDataOptions,
  TreeViewRow,
  RowKey,
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

export class ReactGridAdapter {
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

  public getColumnLayout(): GridColumnLayout {
    return this.grid.getColumnLayout();
  }

  public setColumnLayout(layout: GridColumnLayout): void {
    this.grid.setColumnLayout(layout);
  }

  public getAdvancedFilterModel(): AdvancedFilterModel | null {
    return this.grid.getAdvancedFilterModel();
  }

  public setAdvancedFilterModel(advancedFilterModel: AdvancedFilterModel | null): Promise<void> {
    return this.grid.setAdvancedFilterModel(advancedFilterModel);
  }

  public clearAdvancedFilterModel(): Promise<void> {
    return this.grid.clearAdvancedFilterModel();
  }

  public getAdvancedFilterPresets(): GridAdvancedFilterPreset[] {
    return this.grid.getAdvancedFilterPresets();
  }

  public setAdvancedFilterPresets(presets: GridAdvancedFilterPreset[]): void {
    this.grid.setAdvancedFilterPresets(presets);
  }

  public saveAdvancedFilterPreset(presetId: string, label?: string): boolean {
    return this.grid.saveAdvancedFilterPreset(presetId, label);
  }

  public applyAdvancedFilterPreset(presetId: string): Promise<boolean> {
    return this.grid.applyAdvancedFilterPreset(presetId);
  }

  public deleteAdvancedFilterPreset(presetId: string): boolean {
    return this.grid.deleteAdvancedFilterPreset(presetId);
  }

  public getGroupModel(): GroupModelItem[] {
    return this.grid.getGroupModel();
  }

  public setGroupModel(groupModel: GroupModelItem[]): Promise<void> {
    return this.grid.setGroupModel(groupModel);
  }

  public clearGroupModel(): Promise<void> {
    return this.grid.clearGroupModel();
  }

  public getGroupAggregations(): GroupAggregationDef[] {
    return this.grid.getGroupAggregations();
  }

  public setGroupAggregations(aggregations: GroupAggregationDef[]): Promise<void> {
    return this.grid.setGroupAggregations(aggregations);
  }

  public getGroupExpansionState(): Record<string, boolean> {
    return this.grid.getGroupExpansionState();
  }

  public setGroupExpanded(groupKey: string, expanded: boolean): Promise<void> {
    return this.grid.setGroupExpanded(groupKey, expanded);
  }

  public toggleGroupExpanded(groupKey: string): Promise<void> {
    return this.grid.toggleGroupExpanded(groupKey);
  }

  public expandAllGroups(): Promise<void> {
    return this.grid.expandAllGroups();
  }

  public collapseAllGroups(): Promise<void> {
    return this.grid.collapseAllGroups();
  }

  public getGroupingMode(): GroupingMode {
    return this.grid.getGroupingMode();
  }

  public setGroupingMode(mode: GroupingMode): Promise<void> {
    return this.grid.setGroupingMode(mode);
  }

  public getPivotModel(): PivotModelItem[] {
    return this.grid.getPivotModel();
  }

  public setPivotModel(pivotModel: PivotModelItem[]): Promise<void> {
    return this.grid.setPivotModel(pivotModel);
  }

  public clearPivotModel(): Promise<void> {
    return this.grid.clearPivotModel();
  }

  public getPivotValues(): PivotValueDef[] {
    return this.grid.getPivotValues();
  }

  public setPivotValues(values: PivotValueDef[]): Promise<void> {
    return this.grid.setPivotValues(values);
  }

  public getPivotingMode(): PivotingMode {
    return this.grid.getPivotingMode();
  }

  public setPivotingMode(mode: PivotingMode): Promise<void> {
    return this.grid.setPivotingMode(mode);
  }

  public getTreeDataOptions(): TreeDataOptions {
    return this.grid.getTreeDataOptions();
  }

  public setTreeDataOptions(treeData: TreeDataOptions): Promise<void> {
    return this.grid.setTreeDataOptions(treeData);
  }

  public getTreeExpansionState(): Record<string, boolean> {
    return this.grid.getTreeExpansionState();
  }

  public setTreeExpanded(nodeKey: RowKey, expanded: boolean): Promise<void> {
    return this.grid.setTreeExpanded(nodeKey, expanded);
  }

  public toggleTreeExpanded(nodeKey: RowKey): Promise<void> {
    return this.grid.toggleTreeExpanded(nodeKey);
  }

  public expandAllTreeNodes(): Promise<void> {
    return this.grid.expandAllTreeNodes();
  }

  public collapseAllTreeNodes(): Promise<void> {
    return this.grid.collapseAllTreeNodes();
  }

  public getTreeRowsSnapshot(): TreeViewRow[] {
    return this.grid.getTreeRowsSnapshot();
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

  public clearTheme(): void {
    this.grid.clearTheme();
  }

  public setThemePreset(preset: 'default' | 'enterprise'): void {
    this.grid.setThemePreset(preset);
  }

  public setThemeMode(mode: 'light' | 'dark' | 'system'): void {
    this.grid.setThemeMode(mode);
  }

  public getThemeState(): ReturnType<Grid['getThemeState']> {
    return this.grid.getThemeState();
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

  public undo(): boolean {
    return this.grid.undo();
  }

  public redo(): boolean {
    return this.grid.redo();
  }

  public canUndo(): boolean {
    return this.grid.canUndo();
  }

  public canRedo(): boolean {
    return this.grid.canRedo();
  }

  public hasDirtyChanges(): boolean {
    return this.grid.hasDirtyChanges();
  }

  public getDirtyChanges(): GridDirtyRowChange[] {
    return this.grid.getDirtyChanges();
  }

  public getDirtyChangeSummary(): GridDirtyChangeSummary {
    return this.grid.getDirtyChangeSummary();
  }

  public acceptDirtyChanges(options?: GridDirtyChangeOptions): void {
    this.grid.acceptDirtyChanges(options);
  }

  public discardDirtyChanges(options?: GridDirtyChangeOptions): void {
    this.grid.discardDirtyChanges(options);
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

export function createReactGridAdapter(container: HTMLElement, config?: GridConfig): ReactGridAdapter {
  return new ReactGridAdapter(container, config);
}
