import type { DataProvider, RowKey } from '../data/data-provider';
import { GroupedDataProvider } from '../data/grouped-data-provider';
import { TreeDataProvider } from '../data/tree-data-provider';
import type { EditCommitAuditLogger } from './edit-events';
import type { ColumnReorderEvent, ColumnResizeEvent, EventBus, GridEventMap } from './event-bus';

export interface GridCommandEventServiceParams {
  eventBus: EventBus;
  hasColumn: (columnId: string) => boolean;
  setColumnWidth: (columnId: string, width: number) => void;
  setColumnOrder: (columnOrder: string[]) => void;
  syncColumnsToRenderer: () => void;
  isTreeDataActive: () => boolean;
  isClientGroupingActive: () => boolean;
  getDataProvider: () => DataProvider;
  getTreeColumnId: () => string;
  toggleGroupExpanded: (groupKey: string) => Promise<void> | void;
  toggleTreeExpanded: (nodeKey: RowKey) => Promise<void> | void;
  applyGroupingView: () => Promise<void> | void;
  applyTreeView: () => Promise<void> | void;
  getAuditLogHook: () => EditCommitAuditLogger | undefined;
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

    if (params.isTreeDataActive()) {
      if (!(dataProvider instanceof TreeDataProvider)) {
        return;
      }

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

    if (!params.isClientGroupingActive()) {
      return;
    }

    if (!(dataProvider instanceof GroupedDataProvider)) {
      return;
    }

    const groupRow = dataProvider.getGroupRow(event.dataIndex);
    if (!groupRow) {
      return;
    }

    if (event.columnId !== groupRow.columnId) {
      return;
    }

    void params.toggleGroupExpanded(groupRow.groupKey);
  }

  public handleEditCommit(params: GridCommandEventServiceParams, event: GridEventMap['editCommit']): void {
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
