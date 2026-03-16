import { describe, expect, it, vi } from 'vitest';
import type { GridOptions } from '../src/core/grid-options';
import { GridStateService } from '../src/core/grid-state-service';
import { ColumnModel } from '../src/data/column-model';

function createGridOptions(columnModel: ColumnModel): GridOptions {
  return {
    columns: columnModel.getColumns(),
    dataProvider: {} as GridOptions['dataProvider'],
    rowModel: {} as GridOptions['rowModel'],
    height: 320,
    rowHeight: 28,
    overscan: 8,
    overscanCols: 2,
    scrollbarPolicy: {
      vertical: 'auto',
      horizontal: 'auto'
    },
    rowIndicator: undefined,
    stateColumn: undefined,
    validateEdit: undefined,
    grouping: undefined,
    pivoting: undefined,
    treeData: undefined,
    locale: 'en-US',
    localeText: undefined,
    styleNonce: undefined,
    sanitizeHtml: undefined,
    onAuditLog: undefined,
    rtl: false,
    numberFormatOptions: undefined,
    dateTimeFormatOptions: undefined,
    columnGroups: undefined,
    rowHeightMode: 'fixed',
    estimatedRowHeight: 28,
    getRowHeight: undefined
  };
}

describe('GridStateService', () => {
  it('creates a snapshot with column visibility, pinning, and expansion state', () => {
    const service = new GridStateService();
    const state = service.createState({
      columns: [
        { id: 'name', header: 'Name', width: 140, type: 'text', pinned: 'left' },
        { id: 'score', header: 'Score', width: 120, type: 'number', visible: false }
      ],
      columnOrder: ['name', 'score'],
      scrollTop: 240,
      groupModel: [{ columnId: 'region' }],
      pivotModel: [{ columnId: 'quarter' }],
      groupExpansionState: { 'region:apac': true },
      treeExpansionState: { 'node:1': false }
    });

    expect(state).toEqual({
      scrollTop: 240,
      columnOrder: ['name', 'score'],
      hiddenColumnIds: ['score'],
      pinnedColumns: { name: 'left' },
      groupModel: [{ columnId: 'region' }],
      pivotModel: [{ columnId: 'quarter' }],
      groupExpansionState: { 'region:apac': true },
      treeExpansionState: { 'node:1': false }
    });
  });

  it('applies state through the column model and prepares updated grouping options', () => {
    const service = new GridStateService();
    const columnModel = new ColumnModel([
      { id: 'id', header: 'ID', width: 80, type: 'number' },
      { id: 'name', header: 'Name', width: 140, type: 'text' }
    ]);
    const syncColumnsToRenderer = vi.fn();

    const result = service.applyState({
      state: {
        scrollTop: 420,
        columnOrder: ['name', 'id'],
        hiddenColumnIds: ['id'],
        pinnedColumns: { name: 'left' },
        groupModel: [{ columnId: 'region' }],
        pivotModel: [{ columnId: 'quarter' }],
        groupExpansionState: { g1: true },
        treeExpansionState: { t1: false }
      },
      columnModel,
      syncColumnsToRenderer,
      normalizeGroupModel: (groupModel) => groupModel.filter((item) => item.columnId.length > 0),
      normalizePivotModel: (pivotModel) => pivotModel.filter((item) => item.columnId.length > 0),
      groupModel: [],
      pivotModel: [],
      groupAggregations: [{ columnId: 'sales', type: 'sum' }],
      pivotValues: [{ columnId: 'sales', type: 'sum' }],
      groupExpansionState: {},
      treeExpansionState: {},
      options: createGridOptions(columnModel),
      groupingMode: 'client',
      pivotingMode: 'server',
      groupDefaultExpanded: true
    });

    expect(syncColumnsToRenderer).toHaveBeenCalledTimes(1);
    expect(columnModel.getColumns().map((column) => column.id)).toEqual(['name', 'id']);
    expect(columnModel.getColumns().find((column) => column.id === 'id')?.visible).toBe(false);
    expect(columnModel.getColumns().find((column) => column.id === 'name')?.pinned).toBe('left');
    expect(result.nextGroupModel).toEqual([{ columnId: 'region' }]);
    expect(result.nextPivotModel).toEqual([{ columnId: 'quarter' }]);
    expect(result.nextGroupExpansionState).toEqual({ g1: true });
    expect(result.nextTreeExpansionState).toEqual({ t1: false });
    expect(result.nextOptions.grouping).toEqual({
      mode: 'client',
      groupModel: [{ columnId: 'region' }],
      aggregations: [{ columnId: 'sales', type: 'sum', reducer: undefined }],
      defaultExpanded: true
    });
    expect(result.nextOptions.pivoting).toEqual({
      mode: 'server',
      pivotModel: [{ columnId: 'quarter' }],
      values: [{ columnId: 'sales', type: 'sum', reducer: undefined }]
    });
    expect(result.shouldRefreshDerivedView).toBe(true);
    expect(result.scrollTop).toBe(420);
  });

  it('creates and applies a column layout with width, visibility, order, and pin state', () => {
    const service = new GridStateService();
    const columnModel = new ColumnModel([
      { id: 'id', header: 'ID', width: 80, type: 'number' },
      { id: 'name', header: 'Name', width: 140, type: 'text', pinned: 'left' },
      { id: 'region', header: 'Region', width: 160, type: 'text', visible: false }
    ]);
    const syncColumnsToRenderer = vi.fn();

    const layout = service.createColumnLayout({
      columns: columnModel.getColumns(),
      columnOrder: ['id', 'name', 'region']
    });

    expect(layout).toEqual({
      columnOrder: ['id', 'name', 'region'],
      hiddenColumnIds: ['region'],
      pinnedColumns: { name: 'left' },
      columnWidths: {
        id: 80,
        name: 140,
        region: 160
      }
    });

    service.applyColumnLayout({
      layout: {
        columnOrder: ['region', 'name', 'id'],
        hiddenColumnIds: ['id'],
        pinnedColumns: { region: 'right' },
        columnWidths: { region: 220, name: 180 }
      },
      columnModel,
      syncColumnsToRenderer
    });

    expect(syncColumnsToRenderer).toHaveBeenCalledTimes(1);
    expect(columnModel.getColumns().map((column) => column.id)).toEqual(['region', 'name', 'id']);
    expect(columnModel.getColumns().find((column) => column.id === 'id')?.visible).toBe(false);
    expect(columnModel.getColumns().find((column) => column.id === 'region')?.pinned).toBe('right');
    expect(columnModel.getColumns().find((column) => column.id === 'region')?.width).toBe(220);
    expect(columnModel.getColumns().find((column) => column.id === 'name')?.width).toBe(180);
  });
});
