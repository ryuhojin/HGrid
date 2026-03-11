import type {
  ColumnDef,
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

export class GridStateService {
  public createState(params: GridStateSnapshotParams): GridState {
    const hiddenColumnIds: string[] = [];
    const pinnedColumns: Record<string, ColumnPinPosition> = {};

    for (let columnIndex = 0; columnIndex < params.columns.length; columnIndex += 1) {
      const column = params.columns[columnIndex];
      if (column.visible === false) {
        hiddenColumnIds.push(column.id);
      }
      if (column.pinned) {
        pinnedColumns[column.id] = column.pinned;
      }
    }

    return {
      scrollTop: params.scrollTop,
      columnOrder: params.columnOrder.slice(),
      hiddenColumnIds,
      pinnedColumns,
      groupModel: cloneGroupModel(params.groupModel),
      pivotModel: clonePivotModel(params.pivotModel),
      groupExpansionState: cloneGroupExpansionState(params.groupExpansionState),
      treeExpansionState: cloneGroupExpansionState(params.treeExpansionState)
    };
  }

  public applyState(params: GridStateApplyParams): GridStateApplyResult {
    let shouldSyncColumns = false;
    let shouldRefreshDerivedView = false;
    let nextOptions = params.options;
    let nextGroupModel = cloneGroupModel(params.groupModel);
    let nextPivotModel = clonePivotModel(params.pivotModel);
    let nextGroupExpansionState = cloneGroupExpansionState(params.groupExpansionState);
    let nextTreeExpansionState = cloneGroupExpansionState(params.treeExpansionState);

    if (Array.isArray(params.state.columnOrder) && params.state.columnOrder.length > 0) {
      params.columnModel.setColumnOrder(params.state.columnOrder);
      shouldSyncColumns = true;
    }

    if (Array.isArray(params.state.hiddenColumnIds)) {
      const hiddenColumnIdSet = new Set<string>(params.state.hiddenColumnIds);
      const columns = params.columnModel.getColumns();
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        params.columnModel.setColumnVisibility(column.id, !hiddenColumnIdSet.has(column.id));
      }
      shouldSyncColumns = true;
    }

    if (params.state.pinnedColumns && typeof params.state.pinnedColumns === 'object') {
      const columns = params.columnModel.getColumns();
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        const pinned = params.state.pinnedColumns[column.id];
        params.columnModel.setColumnPin(column.id, pinned === 'left' || pinned === 'right' ? pinned : undefined);
      }
      shouldSyncColumns = true;
    }

    if (shouldSyncColumns) {
      params.syncColumnsToRenderer();
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
