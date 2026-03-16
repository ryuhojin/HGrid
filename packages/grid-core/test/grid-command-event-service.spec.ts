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
    setColumnVisibility: () => undefined,
    setColumnPin: () => undefined,
    setColumnLayout: () => undefined,
    syncColumnsToRenderer: () => undefined,
    getFilterModel: () => ({}),
    setFilterModel: async () => undefined,
    clearFilterModel: async () => undefined,
    getAdvancedFilterModel: () => null,
    setAdvancedFilterModel: async () => undefined,
    getAdvancedFilterPresets: () => [],
    saveAdvancedFilterPreset: () => false,
    applyAdvancedFilterPreset: async () => false,
    deleteAdvancedFilterPreset: () => false,
    applyGroupingPanelState: async () => undefined,
    applyPivotPanelState: async () => undefined,
    setSortModel: async () => undefined,
    clearSortModel: async () => undefined,
    isTreeDataActive: () => false,
    isClientGroupingActive: () => false,
    isTreeToggleActive: () => false,
    isGroupingToggleActive: () => false,
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

  it('applies built-in column menu actions through shared mutation ports', async () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const setColumnVisibility = vi.fn();
    const setColumnPin = vi.fn();
    const setSortModel = vi.fn(async () => undefined);
    const clearSortModel = vi.fn(async () => undefined);
    const syncColumnsToRenderer = vi.fn();

    service.register(
      createBaseParams(eventBus, {
        hasColumn: (columnId) => columnId === 'score',
        setColumnVisibility,
        setColumnPin,
        setSortModel,
        clearSortModel,
        syncColumnsToRenderer
      })
    );

    eventBus.emit('columnMenuAction', {
      columnId: 'score',
      actionId: 'sortAsc',
      source: 'button'
    });
    eventBus.emit('columnMenuAction', {
      columnId: 'score',
      actionId: 'pinRight',
      source: 'contextmenu'
    });
    eventBus.emit('columnMenuAction', {
      columnId: 'score',
      actionId: 'hideColumn',
      source: 'keyboard'
    });
    eventBus.emit('columnMenuAction', {
      columnId: 'score',
      actionId: 'clearSort',
      source: 'button'
    });

    expect(setSortModel).toHaveBeenCalledWith([{ columnId: 'score', direction: 'asc' }]);
    expect(setColumnPin).toHaveBeenCalledWith('score', 'right');
    expect(setColumnVisibility).toHaveBeenCalledWith('score', false);
    expect(clearSortModel).toHaveBeenCalledTimes(1);
    expect(syncColumnsToRenderer).toHaveBeenCalledTimes(2);
  });

  it('merges filter panel input into the current filter model', async () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const setFilterModel = vi.fn(async () => undefined);

    service.register(
      createBaseParams(eventBus, {
        hasColumn: (columnId) => columnId === 'score' || columnId === 'region',
        getFilterModel: () => ({
          region: {
            kind: 'set',
            values: ['APAC']
          }
        }),
        setFilterModel
      })
    );

    eventBus.emit('filterUiApply', {
      columnId: 'score',
      filterInput: {
        kind: 'number',
        operator: 'gte',
        value: 100
      }
    });

    expect(setFilterModel).toHaveBeenCalledWith({
      region: {
        kind: 'set',
        values: ['APAC']
      },
      score: {
        kind: 'number',
        operator: 'gte',
        value: 100
      }
    });
  });

  it('applies tool panel column visibility and pin changes through shared mutation ports', () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const setColumnVisibility = vi.fn();
    const setColumnPin = vi.fn();
    const syncColumnsToRenderer = vi.fn();

    service.register(
      createBaseParams(eventBus, {
        hasColumn: (columnId) => columnId === 'status',
        setColumnVisibility,
        setColumnPin,
        syncColumnsToRenderer
      })
    );

    eventBus.emit('columnVisibilityChange', {
      columnId: 'status',
      isVisible: false
    });
    eventBus.emit('columnPinChange', {
      columnId: 'status',
      pinned: 'left'
    });

    expect(setColumnVisibility).toHaveBeenCalledWith('status', false);
    expect(setColumnPin).toHaveBeenCalledWith('status', 'left');
    expect(syncColumnsToRenderer).toHaveBeenCalledTimes(2);
  });

  it('applies column layout preset ui actions through the shared layout mutation port', () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const setColumnLayout = vi.fn();

    service.register(
      createBaseParams(eventBus, {
        setColumnLayout
      })
    );

    eventBus.emit('columnLayoutPresetUiApply', {
      presetId: 'compact',
      layout: {
        columnOrder: ['id', 'name'],
        hiddenColumnIds: ['status'],
        pinnedColumns: { id: 'left' },
        columnWidths: { id: 92, name: 180 }
      }
    });

    expect(setColumnLayout).toHaveBeenCalledWith({
      columnOrder: ['id', 'name'],
      hiddenColumnIds: ['status'],
      pinnedColumns: { id: 'left' },
      columnWidths: { id: 92, name: 180 }
    });
  });

  it('applies grouping and pivot tool panel state through shared mutation ports', () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const applyGroupingPanelState = vi.fn(async () => undefined);
    const applyPivotPanelState = vi.fn(async () => undefined);

    service.register(
      createBaseParams(eventBus, {
        applyGroupingPanelState,
        applyPivotPanelState
      })
    );

    eventBus.emit('groupingUiApply', {
      mode: 'client',
      groupModel: [{ columnId: 'region' }],
      aggregations: [{ columnId: 'sales', type: 'sum' }]
    });
    eventBus.emit('pivotUiApply', {
      mode: 'server',
      pivotModel: [{ columnId: 'month' }],
      values: [{ columnId: 'sales', type: 'avg' }]
    });

    expect(applyGroupingPanelState).toHaveBeenCalledWith({
      mode: 'client',
      groupModel: [{ columnId: 'region' }],
      aggregations: [{ columnId: 'sales', type: 'sum' }]
    });
    expect(applyPivotPanelState).toHaveBeenCalledWith({
      mode: 'server',
      pivotModel: [{ columnId: 'month' }],
      values: [{ columnId: 'sales', type: 'avg' }]
    });
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
        isGroupingToggleActive: () => true,
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
      timestamp: '2026-03-10T08:00:00.000Z',
      rowCount: 1,
      cellCount: 1,
      changes: [
        {
          rowIndex: 1,
          dataIndex: 0,
          rowKey: 1,
          columnId: 'sales',
          previousValue: 10,
          value: 20
        }
      ]
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
      timestamp: '2026-03-10T08:00:00.000Z',
      rowCount: 1,
      cellCount: 1,
      changes: [
        {
          rowIndex: 1,
          dataIndex: 0,
          rowKey: 1,
          columnId: 'sales',
          previousValue: 10,
          value: 20
        }
      ],
      changeIndex: 0
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
        isTreeToggleActive: () => true,
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
      timestamp: '2026-03-10T09:00:00.000Z',
      rowCount: 1,
      cellCount: 1,
      changes: [
        {
          rowIndex: 0,
          dataIndex: 0,
          rowKey: 1,
          columnId: 'name',
          previousValue: 'Root',
          value: 'Root 2'
        }
      ]
    });

    expect(toggleTreeExpanded).toHaveBeenCalledTimes(1);
    expect(toggleTreeExpanded).toHaveBeenCalledWith(1);
    expect(applyTreeView).toHaveBeenCalledTimes(1);
  });

  it('fans out audit log entries for batch edit commits', () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const onAuditLog = vi.fn();

    service.register(
      createBaseParams(eventBus, {
        getAuditLogHook: () => onAuditLog
      })
    );

    eventBus.emit('editCommit', {
      rowIndex: 0,
      dataIndex: 0,
      rowKey: 1,
      columnId: 'name',
      previousValue: 'A',
      value: 'B',
      source: 'clipboard',
      commitId: 'commit-batch',
      timestampMs: 789,
      timestamp: '2026-03-10T10:00:00.000Z',
      rowCount: 2,
      cellCount: 2,
      changes: [
        {
          rowIndex: 0,
          dataIndex: 0,
          rowKey: 1,
          columnId: 'name',
          previousValue: 'A',
          value: 'B'
        },
        {
          rowIndex: 1,
          dataIndex: 1,
          rowKey: 2,
          columnId: 'status',
          previousValue: 'idle',
          value: 'active'
        }
      ]
    });

    expect(onAuditLog).toHaveBeenCalledTimes(2);
    expect(onAuditLog).toHaveBeenNthCalledWith(1, {
      eventName: 'editCommit',
      rowIndex: 0,
      dataIndex: 0,
      rowKey: 1,
      columnId: 'name',
      previousValue: 'A',
      value: 'B',
      source: 'clipboard',
      commitId: 'commit-batch',
      timestampMs: 789,
      timestamp: '2026-03-10T10:00:00.000Z',
      rowCount: 2,
      cellCount: 2,
      changes: [
        {
          rowIndex: 0,
          dataIndex: 0,
          rowKey: 1,
          columnId: 'name',
          previousValue: 'A',
          value: 'B'
        },
        {
          rowIndex: 1,
          dataIndex: 1,
          rowKey: 2,
          columnId: 'status',
          previousValue: 'idle',
          value: 'active'
        }
      ],
      changeIndex: 0
    });
    expect(onAuditLog).toHaveBeenNthCalledWith(2, {
      eventName: 'editCommit',
      rowIndex: 1,
      dataIndex: 1,
      rowKey: 2,
      columnId: 'status',
      previousValue: 'idle',
      value: 'active',
      source: 'clipboard',
      commitId: 'commit-batch',
      timestampMs: 789,
      timestamp: '2026-03-10T10:00:00.000Z',
      rowCount: 2,
      cellCount: 2,
      changes: [
        {
          rowIndex: 0,
          dataIndex: 0,
          rowKey: 1,
          columnId: 'name',
          previousValue: 'A',
          value: 'B'
        },
        {
          rowIndex: 1,
          dataIndex: 1,
          rowKey: 2,
          columnId: 'status',
          previousValue: 'idle',
          value: 'active'
        }
      ],
      changeIndex: 1
    });
  });

  it('toggles decorated remote grouping rows without GroupedDataProvider', () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const toggleGroupExpanded = vi.fn();
    const remoteGroupingProvider = new LocalDataProvider([
      {
        region: 'APAC',
        __hgrid_internal_row_kind: 'group',
        __hgrid_internal_group_key: 'APAC',
        __hgrid_internal_group_column_id: 'region'
      }
    ]);

    service.register(
      createBaseParams(eventBus, {
        isGroupingToggleActive: () => true,
        getDataProvider: () => remoteGroupingProvider,
        toggleGroupExpanded
      })
    );

    eventBus.emit('cellClick', {
      rowIndex: 0,
      dataIndex: 0,
      columnId: 'region',
      value: 'APAC'
    });

    expect(toggleGroupExpanded).toHaveBeenCalledTimes(1);
    expect(toggleGroupExpanded).toHaveBeenCalledWith('APAC');
  });

  it('toggles decorated remote tree rows without TreeDataProvider', () => {
    const service = new GridCommandEventService();
    const eventBus = new EventBus();
    const toggleTreeExpanded = vi.fn();
    const remoteTreeProvider = new LocalDataProvider([
      {
        name: 'Root',
        __hgrid_internal_row_kind_tree: 'tree',
        __hgrid_internal_tree_node_key: 'root-1',
        __hgrid_internal_tree_has_children: true,
        __hgrid_internal_tree_column_id: 'name'
      }
    ]);

    service.register(
      createBaseParams(eventBus, {
        isTreeToggleActive: () => true,
        getDataProvider: () => remoteTreeProvider,
        getTreeColumnId: () => 'name',
        toggleTreeExpanded
      })
    );

    eventBus.emit('cellClick', {
      rowIndex: 0,
      dataIndex: 0,
      columnId: 'name',
      value: 'Root'
    });

    expect(toggleTreeExpanded).toHaveBeenCalledTimes(1);
    expect(toggleTreeExpanded).toHaveBeenCalledWith('root-1');
  });
});
