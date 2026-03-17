import { GroupedDataProvider } from '../data/grouped-data-provider';
import {
  GROUP_ROW_COLUMN_ID_FIELD,
  GROUP_ROW_KEY_FIELD,
  isGroupRowData
} from '../data/grouped-data-provider';
import { TreeDataProvider } from '../data/tree-data-provider';
import {
  TREE_ROW_HAS_CHILDREN_FIELD,
  TREE_ROW_KIND_FIELD,
  TREE_ROW_NODE_KEY_FIELD,
  isTreeRowData
} from '../data/tree-data-provider';
import type { ColumnMenuActionEvent, ColumnReorderEvent, ColumnResizeEvent, EventBus, GridEventMap } from './event-bus';
import { cloneAdvancedFilterModel as cloneAdvancedFilterModelValue } from '../data/filter-model';
import type {
  GridAdvancedFilterPresetMutationPort,
  GridAuditLogPort,
  GridColumnLayoutMutationPort,
  GridColumnMutationPort,
  GridDerivedViewControllerPort,
  GridFilterMutationPort,
  GridGroupingMutationPort,
  GridPivotMutationPort,
  GridSortMutationPort,
  GridWorkerProjectionCachePort
} from './grid-internal-contracts';
import type { AdvancedFilterModel, ColumnFilterInput } from '../data/filter-executor';
import type { GroupAggregationDef, GroupModelItem, PivotModelItem, PivotValueDef } from './grid-options';
import { EDIT_COMMIT_AUDIT_SCHEMA_VERSION } from './edit-events';

export interface GridCommandEventServiceParams
  extends GridColumnMutationPort,
    GridColumnLayoutMutationPort,
    GridDerivedViewControllerPort,
    GridFilterMutationPort,
    GridAdvancedFilterPresetMutationPort,
    GridGroupingMutationPort,
    GridPivotMutationPort,
    GridSortMutationPort,
    GridWorkerProjectionCachePort,
    GridAuditLogPort {
  eventBus: EventBus;
}

function cloneFilterInput(filterInput: ColumnFilterInput | null): ColumnFilterInput | null {
  if (!filterInput) {
    return null;
  }

  if (Array.isArray(filterInput)) {
    return filterInput.map((item) => ({ ...item }));
  }

  return { ...filterInput };
}

function cloneAdvancedFilterModel(advancedFilterModel: AdvancedFilterModel | null): AdvancedFilterModel | null {
  return cloneAdvancedFilterModelValue(advancedFilterModel);
}

function cloneGroupModel(groupModel: GroupModelItem[]): GroupModelItem[] {
  if (!Array.isArray(groupModel)) {
    return [];
  }

  return groupModel.map((item) => ({ ...item }));
}

function cloneGroupAggregations(aggregations: GroupAggregationDef[]): GroupAggregationDef[] {
  if (!Array.isArray(aggregations)) {
    return [];
  }

  return aggregations.map((item) => ({ ...item }));
}

function clonePivotModel(pivotModel: PivotModelItem[]): PivotModelItem[] {
  if (!Array.isArray(pivotModel)) {
    return [];
  }

  return pivotModel.map((item) => ({ ...item }));
}

function clonePivotValues(values: PivotValueDef[]): PivotValueDef[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((item) => ({ ...item }));
}

export class GridCommandEventService {
  public register(params: GridCommandEventServiceParams): () => void {
    const handleColumnResize = (event: ColumnResizeEvent): void => {
      this.handleColumnResize(params, event);
    };
    const handleColumnReorder = (event: ColumnReorderEvent): void => {
      this.handleColumnReorder(params, event);
    };
    const handleCellClick = (event: GridEventMap['cellClick']): void => {
      this.handleCellClick(params, event);
    };
    const handleEditCommit = (event: GridEventMap['editCommit']): void => {
      this.handleEditCommit(params, event);
    };
    const handleColumnMenuAction = (event: ColumnMenuActionEvent): void => {
      this.handleColumnMenuAction(params, event);
    };
    const handleFilterUiApply = (event: GridEventMap['filterUiApply']): void => {
      this.handleFilterUiApply(params, event);
    };
    const handleAdvancedFilterUiApply = (event: GridEventMap['advancedFilterUiApply']): void => {
      this.handleAdvancedFilterUiApply(params, event);
    };
    const handleAdvancedFilterPresetUiAction = (event: GridEventMap['advancedFilterPresetUiAction']): void => {
      this.handleAdvancedFilterPresetUiAction(params, event);
    };
    const handleColumnLayoutPresetUiApply = (event: GridEventMap['columnLayoutPresetUiApply']): void => {
      this.handleColumnLayoutPresetUiApply(params, event);
    };
    const handleColumnVisibilityChange = (event: GridEventMap['columnVisibilityChange']): void => {
      this.handleColumnVisibilityChange(params, event);
    };
    const handleColumnPinChange = (event: GridEventMap['columnPinChange']): void => {
      this.handleColumnPinChange(params, event);
    };
    const handleGroupingUiApply = (event: GridEventMap['groupingUiApply']): void => {
      this.handleGroupingUiApply(params, event);
    };
    const handlePivotUiApply = (event: GridEventMap['pivotUiApply']): void => {
      this.handlePivotUiApply(params, event);
    };

    params.eventBus.on('columnResize', handleColumnResize);
    params.eventBus.on('columnReorder', handleColumnReorder);
    params.eventBus.on('cellClick', handleCellClick);
    params.eventBus.on('editCommit', handleEditCommit);
    params.eventBus.on('columnMenuAction', handleColumnMenuAction);
    params.eventBus.on('filterUiApply', handleFilterUiApply);
    params.eventBus.on('advancedFilterUiApply', handleAdvancedFilterUiApply);
    params.eventBus.on('advancedFilterPresetUiAction', handleAdvancedFilterPresetUiAction);
    params.eventBus.on('columnLayoutPresetUiApply', handleColumnLayoutPresetUiApply);
    params.eventBus.on('columnVisibilityChange', handleColumnVisibilityChange);
    params.eventBus.on('columnPinChange', handleColumnPinChange);
    params.eventBus.on('groupingUiApply', handleGroupingUiApply);
    params.eventBus.on('pivotUiApply', handlePivotUiApply);

    return () => {
      params.eventBus.off('columnResize', handleColumnResize);
      params.eventBus.off('columnReorder', handleColumnReorder);
      params.eventBus.off('cellClick', handleCellClick);
      params.eventBus.off('editCommit', handleEditCommit);
      params.eventBus.off('columnMenuAction', handleColumnMenuAction);
      params.eventBus.off('filterUiApply', handleFilterUiApply);
      params.eventBus.off('advancedFilterUiApply', handleAdvancedFilterUiApply);
      params.eventBus.off('advancedFilterPresetUiAction', handleAdvancedFilterPresetUiAction);
      params.eventBus.off('columnLayoutPresetUiApply', handleColumnLayoutPresetUiApply);
      params.eventBus.off('columnVisibilityChange', handleColumnVisibilityChange);
      params.eventBus.off('columnPinChange', handleColumnPinChange);
      params.eventBus.off('groupingUiApply', handleGroupingUiApply);
      params.eventBus.off('pivotUiApply', handlePivotUiApply);
    };
  }

  public handleColumnResize(params: GridCommandEventServiceParams, event: ColumnResizeEvent): void {
    if (event.phase === 'start') {
      return;
    }

    if (!params.hasColumn(event.columnId)) {
      return;
    }

    params.setColumnWidth(event.columnId, event.width);
    params.syncColumnsToRenderer();
  }

  public handleColumnReorder(params: GridCommandEventServiceParams, event: ColumnReorderEvent): void {
    if (!Array.isArray(event.columnOrder) || event.columnOrder.length === 0) {
      return;
    }

    params.setColumnOrder(event.columnOrder);
    params.syncColumnsToRenderer();
  }

  public handleColumnMenuAction(params: GridCommandEventServiceParams, event: ColumnMenuActionEvent): void {
    if (!params.hasColumn(event.columnId)) {
      return;
    }

    if (event.actionId === 'sortAsc') {
      void params.setSortModel([{ columnId: event.columnId, direction: 'asc' }]);
      return;
    }

    if (event.actionId === 'sortDesc') {
      void params.setSortModel([{ columnId: event.columnId, direction: 'desc' }]);
      return;
    }

    if (event.actionId === 'clearSort') {
      void params.clearSortModel();
      return;
    }

    if (event.actionId === 'pinLeft') {
      params.setColumnPin(event.columnId, 'left');
      params.syncColumnsToRenderer();
      return;
    }

    if (event.actionId === 'pinRight') {
      params.setColumnPin(event.columnId, 'right');
      params.syncColumnsToRenderer();
      return;
    }

    if (event.actionId === 'unpin') {
      params.setColumnPin(event.columnId, undefined);
      params.syncColumnsToRenderer();
      return;
    }

    if (event.actionId === 'hideColumn') {
      params.setColumnVisibility(event.columnId, false);
      params.syncColumnsToRenderer();
    }
  }

  public handleCellClick(params: GridCommandEventServiceParams, event: GridEventMap['cellClick']): void {
    const dataProvider = params.getDataProvider();

    if (params.isTreeToggleActive()) {
      if (dataProvider instanceof TreeDataProvider) {
        const treeRow = dataProvider.getTreeRow(event.dataIndex);
        if (!treeRow || !treeRow.hasChildren) {
          return;
        }

        const treeColumnId = params.getTreeColumnId();
        if (treeColumnId.length > 0 && event.columnId !== treeColumnId) {
          return;
        }

        void params.toggleTreeExpanded(treeRow.nodeKey);
        return;
      }

      const treeRow = dataProvider.getRow?.(event.dataIndex) ?? null;
      if (!treeRow || !isTreeRowData(treeRow)) {
        return;
      }

      const treeRowData = treeRow;
      if (treeRowData[TREE_ROW_HAS_CHILDREN_FIELD] !== true) {
        return;
      }

      const treeColumnId = params.getTreeColumnId();
      if (treeColumnId.length > 0 && event.columnId !== treeColumnId) {
        return;
      }

      const nodeKey = treeRowData[TREE_ROW_NODE_KEY_FIELD];
      if (typeof nodeKey !== 'string' && typeof nodeKey !== 'number') {
        return;
      }

      void params.toggleTreeExpanded(nodeKey);
      return;
    }

    if (!params.isGroupingToggleActive()) {
      return;
    }

    if (dataProvider instanceof GroupedDataProvider) {
      const groupRow = dataProvider.getGroupRow(event.dataIndex);
      if (!groupRow) {
        return;
      }

      if (event.columnId !== groupRow.columnId) {
        return;
      }

      void params.toggleGroupExpanded(groupRow.groupKey);
      return;
    }

    const groupRow = dataProvider.getRow?.(event.dataIndex) ?? null;
    if (!groupRow || !isGroupRowData(groupRow)) {
      return;
    }

    const groupRowData = groupRow;

    if (event.columnId !== groupRowData[GROUP_ROW_COLUMN_ID_FIELD]) {
      return;
    }

    const groupKey = groupRowData[GROUP_ROW_KEY_FIELD];
    if (typeof groupKey !== 'string' || groupKey.length === 0) {
      return;
    }

    void params.toggleGroupExpanded(groupKey);
  }

  public handleFilterUiApply(params: GridCommandEventServiceParams, event: GridEventMap['filterUiApply']): void {
    if (!params.hasColumn(event.columnId)) {
      return;
    }

    const nextFilterModel = params.getFilterModel();
    if (!event.filterInput) {
      delete nextFilterModel[event.columnId];
    } else {
      const clonedFilterInput = cloneFilterInput(event.filterInput);
      if (!clonedFilterInput) {
        delete nextFilterModel[event.columnId];
      } else {
        nextFilterModel[event.columnId] = clonedFilterInput;
      }
    }

    void params.setFilterModel(nextFilterModel);
  }

  public handleAdvancedFilterUiApply(
    params: GridCommandEventServiceParams,
    event: GridEventMap['advancedFilterUiApply']
  ): void {
    void params.setAdvancedFilterModel(cloneAdvancedFilterModel(event.advancedFilterModel));
  }

  public handleAdvancedFilterPresetUiAction(
    params: GridCommandEventServiceParams,
    event: GridEventMap['advancedFilterPresetUiAction']
  ): void {
    const presetId = typeof event.presetId === 'string' ? event.presetId.trim() : '';
    if (presetId.length === 0) {
      return;
    }

    if (event.action === 'save') {
      params.saveAdvancedFilterPreset(presetId, event.label);
      return;
    }

    if (event.action === 'apply') {
      void params.applyAdvancedFilterPreset(presetId);
      return;
    }

    if (event.action === 'delete') {
      params.deleteAdvancedFilterPreset(presetId);
    }
  }

  public handleColumnLayoutPresetUiApply(
    params: GridCommandEventServiceParams,
    event: GridEventMap['columnLayoutPresetUiApply']
  ): void {
    params.setColumnLayout(event.layout);
  }

  public handleColumnVisibilityChange(
    params: GridCommandEventServiceParams,
    event: GridEventMap['columnVisibilityChange']
  ): void {
    if (!params.hasColumn(event.columnId)) {
      return;
    }

    params.setColumnVisibility(event.columnId, event.isVisible);
    params.syncColumnsToRenderer();
  }

  public handleColumnPinChange(params: GridCommandEventServiceParams, event: GridEventMap['columnPinChange']): void {
    if (!params.hasColumn(event.columnId)) {
      return;
    }

    params.setColumnPin(event.columnId, event.pinned);
    params.syncColumnsToRenderer();
  }

  public handleGroupingUiApply(params: GridCommandEventServiceParams, event: GridEventMap['groupingUiApply']): void {
    void params.applyGroupingPanelState({
      mode: event.mode,
      groupModel: cloneGroupModel(event.groupModel),
      aggregations: cloneGroupAggregations(event.aggregations)
    });
  }

  public handlePivotUiApply(params: GridCommandEventServiceParams, event: GridEventMap['pivotUiApply']): void {
    void params.applyPivotPanelState({
      mode: event.mode,
      pivotModel: clonePivotModel(event.pivotModel),
      values: clonePivotValues(event.values)
    });
  }

  public handleEditCommit(params: GridCommandEventServiceParams, event: GridEventMap['editCommit']): void {
    params.invalidateWorkerProjectionCache();

    if (params.isTreeDataActive()) {
      void params.applyTreeView();
    } else if (params.isClientGroupingActive()) {
      void params.applyGroupingView();
    }

    const onAuditLog = params.getAuditLogHook();
    if (!onAuditLog) {
      return;
    }

    const changes = Array.isArray(event.changes) && event.changes.length > 0
      ? event.changes
      : [
          {
            rowIndex: event.rowIndex,
            dataIndex: event.dataIndex,
            rowKey: event.rowKey,
            columnId: event.columnId,
            previousValue: event.previousValue,
            value: event.value
          }
        ];

    for (let changeIndex = 0; changeIndex < changes.length; changeIndex += 1) {
      const change = changes[changeIndex];
      onAuditLog({
        schemaVersion: EDIT_COMMIT_AUDIT_SCHEMA_VERSION,
        eventName: 'editCommit',
        rowIndex: change.rowIndex,
        dataIndex: change.dataIndex,
        rowKey: change.rowKey,
        columnId: change.columnId,
        previousValue: change.previousValue,
        value: change.value,
        source: event.source,
        commitId: event.commitId,
        transactionId: event.transactionId,
        rootTransactionId: event.rootTransactionId,
        transactionKind: event.transactionKind,
        transactionStep: event.transactionStep,
        timestampMs: event.timestampMs,
        timestamp: event.timestamp,
        rowCount: event.rowCount,
        cellCount: event.cellCount,
        changes: event.changes,
        changeIndex
      });
    }
  }
}
