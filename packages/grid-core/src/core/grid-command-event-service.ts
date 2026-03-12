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
import type { ColumnReorderEvent, ColumnResizeEvent, EventBus, GridEventMap } from './event-bus';
import type {
  GridAuditLogPort,
  GridColumnMutationPort,
  GridDerivedViewControllerPort,
  GridWorkerProjectionCachePort
} from './grid-internal-contracts';

export interface GridCommandEventServiceParams
  extends GridColumnMutationPort,
    GridDerivedViewControllerPort,
    GridWorkerProjectionCachePort,
    GridAuditLogPort {
  eventBus: EventBus;
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

    params.eventBus.on('columnResize', handleColumnResize);
    params.eventBus.on('columnReorder', handleColumnReorder);
    params.eventBus.on('cellClick', handleCellClick);
    params.eventBus.on('editCommit', handleEditCommit);

    return () => {
      params.eventBus.off('columnResize', handleColumnResize);
      params.eventBus.off('columnReorder', handleColumnReorder);
      params.eventBus.off('cellClick', handleCellClick);
      params.eventBus.off('editCommit', handleEditCommit);
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

    onAuditLog({
      eventName: 'editCommit',
      rowIndex: event.rowIndex,
      dataIndex: event.dataIndex,
      rowKey: event.rowKey,
      columnId: event.columnId,
      previousValue: event.previousValue,
      value: event.value,
      source: event.source,
      commitId: event.commitId,
      timestampMs: event.timestampMs,
      timestamp: event.timestamp
    });
  }
}
