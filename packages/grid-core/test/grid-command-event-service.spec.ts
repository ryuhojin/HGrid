import { describe, expect, it, vi } from 'vitest';
import {
  GridCommandEventService,
  type GridCommandEventServiceParams
} from '../src/core/grid-command-event-service';
import { EventBus } from '../src/core/event-bus';
import { GroupedDataProvider } from '../src/data/grouped-data-provider';
import { LocalDataProvider } from '../src/data/local-data-provider';
import { TreeDataProvider } from '../src/data/tree-data-provider';

function createBaseParams(
  eventBus: EventBus,
  overrides: Partial<GridCommandEventServiceParams> = {}
): GridCommandEventServiceParams {
  const defaultDataProvider = new LocalDataProvider([{ id: 1, name: 'Root' }]);

  return {
    eventBus,
    hasColumn: () => true,
    setColumnWidth: () => undefined,
    setColumnOrder: () => undefined,
    syncColumnsToRenderer: () => undefined,
    isTreeDataActive: () => false,
    isClientGroupingActive: () => false,
    getDataProvider: () => defaultDataProvider,
    getTreeColumnId: () => '',
    toggleGroupExpanded: () => undefined,
    toggleTreeExpanded: () => undefined,
    applyGroupingView: () => undefined,
    applyTreeView: () => undefined,
    invalidateWorkerProjectionCache: () => undefined,
    getAuditLogHook: () => undefined,
    ...overrides
  };
}

describe('GridCommandEventService', () => {
  it('registers column handlers and unsubscribes cleanly', () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const setColumnWidth = vi.fn();
    const setColumnOrder = vi.fn();
    const syncColumnsToRenderer = vi.fn();
    const unsubscribe = service.register(
      createBaseParams(eventBus, {
        hasColumn: (columnId) => columnId === 'name',
        setColumnWidth,
        setColumnOrder,
        syncColumnsToRenderer
      })
    );

    eventBus.emit('columnResize', {
      columnId: 'name',
      width: 180,
      phase: 'start'
    });
    eventBus.emit('columnResize', {
      columnId: 'missing',
      width: 180,
      phase: 'move'
    });
    eventBus.emit('columnResize', {
      columnId: 'name',
      width: 220,
      phase: 'end'
    });
    eventBus.emit('columnReorder', {
      sourceColumnId: 'name',
      targetColumnId: null,
      fromIndex: 0,
      toIndex: 1,
      columnOrder: []
    });
    eventBus.emit('columnReorder', {
      sourceColumnId: 'name',
      targetColumnId: 'score',
      fromIndex: 0,
      toIndex: 1,
      columnOrder: ['score', 'name']
    });

    expect(setColumnWidth).toHaveBeenCalledTimes(1);
    expect(setColumnWidth).toHaveBeenCalledWith('name', 220);
    expect(setColumnOrder).toHaveBeenCalledTimes(1);
    expect(setColumnOrder).toHaveBeenCalledWith(['score', 'name']);
    expect(syncColumnsToRenderer).toHaveBeenCalledTimes(2);

    unsubscribe();
    eventBus.emit('columnResize', {
      columnId: 'name',
      width: 260,
      phase: 'move'
    });

    expect(setColumnWidth).toHaveBeenCalledTimes(1);
  });

  it('toggles grouped rows and emits audit log on edit commit', () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const sourceDataProvider = new LocalDataProvider([{ id: 1, region: 'APAC', sales: 10 }]);
    const groupedDataProvider = new GroupedDataProvider(sourceDataProvider);
    const toggleGroupExpanded = vi.fn();
    const applyGroupingView = vi.fn();
    const invalidateWorkerProjectionCache = vi.fn();
    const onAuditLog = vi.fn();

    groupedDataProvider.applySnapshot({
      rows: [
        {
          kind: 'group',
          groupKey: 'region:APAC',
          level: 0,
          columnId: 'region',
          value: 'APAC',
          leafCount: 1,
          isExpanded: true,
          values: { region: 'APAC', sales: 10 }
        },
        { kind: 'data', dataIndex: 0 }
      ],
      groupKeys: ['region:APAC']
    });

    service.register(
      createBaseParams(eventBus, {
        isClientGroupingActive: () => true,
        getDataProvider: () => groupedDataProvider,
        toggleGroupExpanded,
        applyGroupingView,
        invalidateWorkerProjectionCache,
        getAuditLogHook: () => onAuditLog
      })
    );

    eventBus.emit('cellClick', {
      rowIndex: 0,
      dataIndex: 0,
      columnId: 'sales',
      value: 10
    });
    eventBus.emit('cellClick', {
      rowIndex: 0,
      dataIndex: 0,
      columnId: 'region',
      value: 'APAC'
    });
    eventBus.emit('editCommit', {
      rowIndex: 1,
      dataIndex: 0,
      rowKey: 1,
      columnId: 'sales',
      previousValue: 10,
      value: 20,
      source: 'editor',
      commitId: 'commit-1',
      timestampMs: 123,
      timestamp: '2026-03-10T08:00:00.000Z'
    });

    expect(toggleGroupExpanded).toHaveBeenCalledTimes(1);
    expect(toggleGroupExpanded).toHaveBeenCalledWith('region:APAC');
    expect(applyGroupingView).toHaveBeenCalledTimes(1);
    expect(invalidateWorkerProjectionCache).toHaveBeenCalledTimes(1);
    expect(onAuditLog).toHaveBeenCalledWith({
      eventName: 'editCommit',
      rowIndex: 1,
      dataIndex: 0,
      rowKey: 1,
      columnId: 'sales',
      previousValue: 10,
      value: 20,
      source: 'editor',
      commitId: 'commit-1',
      timestampMs: 123,
      timestamp: '2026-03-10T08:00:00.000Z'
    });
  });

  it('toggles tree rows only on the tree column and refreshes tree view on edit commit', () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const sourceDataProvider = new LocalDataProvider([{ id: 1, name: 'Root' }]);
    const treeDataProvider = new TreeDataProvider(sourceDataProvider);
    const toggleTreeExpanded = vi.fn();
    const applyTreeView = vi.fn();

    treeDataProvider.setTreeColumnId('name');
    treeDataProvider.applySnapshot({
      rows: [
        {
          kind: 'tree',
          nodeKey: 1,
          parentNodeKey: null,
          sourceDataIndex: 0,
          depth: 0,
          hasChildren: true,
          isExpanded: false,
          localRow: null
        }
      ],
      nodeKeys: [1],
      nodeKeyTokens: ['number:1']
    });

    service.register(
      createBaseParams(eventBus, {
        isTreeDataActive: () => true,
        getDataProvider: () => treeDataProvider,
        getTreeColumnId: () => 'name',
        toggleTreeExpanded,
        applyTreeView
      })
    );

    eventBus.emit('cellClick', {
      rowIndex: 0,
      dataIndex: 0,
      columnId: 'id',
      value: 1
    });
    eventBus.emit('cellClick', {
      rowIndex: 0,
      dataIndex: 0,
      columnId: 'name',
      value: 'Root'
    });
    eventBus.emit('editCommit', {
      rowIndex: 0,
      dataIndex: 0,
      rowKey: 1,
      columnId: 'name',
      previousValue: 'Root',
      value: 'Root 2',
      source: 'editor',
      commitId: 'commit-2',
      timestampMs: 456,
      timestamp: '2026-03-10T09:00:00.000Z'
    });

    expect(toggleTreeExpanded).toHaveBeenCalledTimes(1);
    expect(toggleTreeExpanded).toHaveBeenCalledWith(1);
    expect(applyTreeView).toHaveBeenCalledTimes(1);
  });
});
