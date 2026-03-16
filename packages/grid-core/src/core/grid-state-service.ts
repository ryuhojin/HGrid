import type {
  ColumnDef,
  GridColumnLayout,
  ColumnPinPosition,
  GridOptions,
  GridState,
  GroupAggregationDef,
  GroupModelItem,
  GroupingMode,
  PivotModelItem,
  PivotValueDef,
  PivotingMode
} from './grid-options';
import {
  cloneGroupAggregations,
  cloneGroupExpansionState,
  cloneGroupModel,
  clonePivotModel,
  clonePivotValues
} from './grid-model-utils';
import type { GridColumnStatePort } from './grid-internal-contracts';

export interface GridStateSnapshotParams {
  columns: ColumnDef[];
  columnOrder: string[];
  scrollTop: number;
  groupModel: GroupModelItem[];
  pivotModel: PivotModelItem[];
  groupExpansionState: Record<string, boolean>;
  treeExpansionState: Record<string, boolean>;
}

export interface GridColumnLayoutSnapshotParams {
  columns: ColumnDef[];
  columnOrder: string[];
}

export interface GridColumnLayoutApplyParams {
  layout: GridColumnLayout;
  columnModel: GridColumnStatePort;
  syncColumnsToRenderer: () => void;
}

export interface GridStateApplyParams {
  state: GridState;
  columnModel: GridColumnStatePort;
  syncColumnsToRenderer: () => void;
  normalizeGroupModel: (groupModel: GroupModelItem[]) => GroupModelItem[];
  normalizePivotModel: (pivotModel: PivotModelItem[]) => PivotModelItem[];
  groupModel: GroupModelItem[];
  pivotModel: PivotModelItem[];
  groupAggregations: GroupAggregationDef[];
  pivotValues: PivotValueDef[];
  groupExpansionState: Record<string, boolean>;
  treeExpansionState: Record<string, boolean>;
  options: GridOptions;
  groupingMode: GroupingMode;
  pivotingMode: PivotingMode;
  groupDefaultExpanded: boolean;
}

export interface GridStateApplyResult {
  nextGroupModel: GroupModelItem[];
  nextPivotModel: PivotModelItem[];
  nextGroupExpansionState: Record<string, boolean>;
  nextTreeExpansionState: Record<string, boolean>;
  nextOptions: GridOptions;
  scrollTop: number;
  shouldRefreshDerivedView: boolean;
}

function hasSameColumnModel(left: Array<{ columnId: string }>, right: Array<{ columnId: string }>): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index].columnId !== right[index].columnId) {
      return false;
    }
  }

  return true;
}

function createColumnLayoutSnapshot(params: GridColumnLayoutSnapshotParams): GridColumnLayout {
  const hiddenColumnIds: string[] = [];
  const pinnedColumns: Record<string, ColumnPinPosition> = {};
  const columnWidths: Record<string, number> = {};

  for (let columnIndex = 0; columnIndex < params.columns.length; columnIndex += 1) {
    const column = params.columns[columnIndex];
    columnWidths[column.id] = column.width;
    if (column.visible === false) {
      hiddenColumnIds.push(column.id);
    }
    if (column.pinned) {
      pinnedColumns[column.id] = column.pinned;
    }
  }

  return {
    columnOrder: params.columnOrder.slice(),
    hiddenColumnIds,
    pinnedColumns,
    columnWidths
  };
}

export class GridStateService {
  public createState(params: GridStateSnapshotParams): GridState {
    const columnLayout = createColumnLayoutSnapshot({
      columns: params.columns,
      columnOrder: params.columnOrder
    });

    return {
      scrollTop: params.scrollTop,
      columnOrder: columnLayout.columnOrder,
      hiddenColumnIds: columnLayout.hiddenColumnIds,
      pinnedColumns: columnLayout.pinnedColumns,
      groupModel: cloneGroupModel(params.groupModel),
      pivotModel: clonePivotModel(params.pivotModel),
      groupExpansionState: cloneGroupExpansionState(params.groupExpansionState),
      treeExpansionState: cloneGroupExpansionState(params.treeExpansionState)
    };
  }

  public createColumnLayout(params: GridColumnLayoutSnapshotParams): GridColumnLayout {
    return createColumnLayoutSnapshot(params);
  }

  public applyColumnLayout(params: GridColumnLayoutApplyParams): void {
    let shouldSyncColumns = false;

    if (Array.isArray(params.layout.columnOrder) && params.layout.columnOrder.length > 0) {
      params.columnModel.setColumnOrder(params.layout.columnOrder);
      shouldSyncColumns = true;
    }

    if (Array.isArray(params.layout.hiddenColumnIds)) {
      const hiddenColumnIdSet = new Set<string>(params.layout.hiddenColumnIds);
      const columns = params.columnModel.getColumns();
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        params.columnModel.setColumnVisibility(column.id, !hiddenColumnIdSet.has(column.id));
      }
      shouldSyncColumns = true;
    }

    if (params.layout.pinnedColumns && typeof params.layout.pinnedColumns === 'object') {
      const columns = params.columnModel.getColumns();
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        const pinned = params.layout.pinnedColumns[column.id];
        params.columnModel.setColumnPin(column.id, pinned === 'left' || pinned === 'right' ? pinned : undefined);
      }
      shouldSyncColumns = true;
    }

    if (params.layout.columnWidths && typeof params.layout.columnWidths === 'object') {
      const columns = params.columnModel.getColumns();
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        const width = params.layout.columnWidths[column.id];
        if (typeof width === 'number' && Number.isFinite(width)) {
          params.columnModel.setColumnWidth(column.id, width);
          shouldSyncColumns = true;
        }
      }
    }

    if (shouldSyncColumns) {
      params.syncColumnsToRenderer();
    }
  }

  public applyState(params: GridStateApplyParams): GridStateApplyResult {
    let shouldRefreshDerivedView = false;
    let nextOptions = params.options;
    let nextGroupModel = cloneGroupModel(params.groupModel);
    let nextPivotModel = clonePivotModel(params.pivotModel);
    let nextGroupExpansionState = cloneGroupExpansionState(params.groupExpansionState);
    let nextTreeExpansionState = cloneGroupExpansionState(params.treeExpansionState);

    if (
      Array.isArray(params.state.columnOrder) ||
      Array.isArray(params.state.hiddenColumnIds) ||
      (params.state.pinnedColumns && typeof params.state.pinnedColumns === 'object')
    ) {
      this.applyColumnLayout({
        layout: {
          columnOrder: Array.isArray(params.state.columnOrder) ? params.state.columnOrder : [],
          hiddenColumnIds: Array.isArray(params.state.hiddenColumnIds) ? params.state.hiddenColumnIds : [],
          pinnedColumns:
            params.state.pinnedColumns && typeof params.state.pinnedColumns === 'object' ? params.state.pinnedColumns : {},
          columnWidths: {}
        },
        columnModel: params.columnModel,
        syncColumnsToRenderer: params.syncColumnsToRenderer
      });
    }

    if (Array.isArray(params.state.groupModel)) {
      const normalizedGroupModel = params.normalizeGroupModel(params.state.groupModel);
      if (!hasSameColumnModel(normalizedGroupModel, nextGroupModel)) {
        nextGroupModel = normalizedGroupModel;
        nextOptions = {
          ...nextOptions,
          grouping: {
            ...(nextOptions.grouping ?? {}),
            mode: params.groupingMode,
            groupModel: cloneGroupModel(nextGroupModel),
            aggregations: cloneGroupAggregations(params.groupAggregations),
            defaultExpanded: params.groupDefaultExpanded
          }
        };
        shouldRefreshDerivedView = true;
      }
    }

    if (Array.isArray(params.state.pivotModel)) {
      const normalizedPivotModel = params.normalizePivotModel(params.state.pivotModel);
      if (!hasSameColumnModel(normalizedPivotModel, nextPivotModel)) {
        nextPivotModel = normalizedPivotModel;
        nextOptions = {
          ...nextOptions,
          pivoting: {
            ...(nextOptions.pivoting ?? {}),
            mode: params.pivotingMode,
            pivotModel: clonePivotModel(nextPivotModel),
            values: clonePivotValues(params.pivotValues)
          }
        };
        shouldRefreshDerivedView = true;
      }
    }

    if (params.state.groupExpansionState && typeof params.state.groupExpansionState === 'object') {
      nextGroupExpansionState = cloneGroupExpansionState(params.state.groupExpansionState);
      shouldRefreshDerivedView = true;
    }

    if (params.state.treeExpansionState && typeof params.state.treeExpansionState === 'object') {
      nextTreeExpansionState = cloneGroupExpansionState(params.state.treeExpansionState);
      shouldRefreshDerivedView = true;
    }

    return {
      nextGroupModel,
      nextPivotModel,
      nextGroupExpansionState,
      nextTreeExpansionState,
      nextOptions,
      scrollTop: params.state.scrollTop,
      shouldRefreshDerivedView
    };
  }
}
