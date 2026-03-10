import type { DataProvider, RowKey } from '../data/data-provider';
import type { GroupExecutionResult, GroupViewRow } from '../data/group-executor';
import { GroupedDataProvider } from '../data/grouped-data-provider';
import { LocalDataProvider } from '../data/local-data-provider';
import type { PivotExecutionResult } from '../data/pivot-executor';
import type { RowModel, ViewToDataMapping } from '../data/row-model';
import { TreeDataProvider } from '../data/tree-data-provider';
import type { TreeExecutionResult } from '../data/tree-executor';

export interface GridDataPipelineState {
  groupRows: GroupViewRow[];
  groupKeys: string[];
  groupedDataProvider: GroupedDataProvider | null;
  pivotDataProvider: LocalDataProvider | null;
  treeRows: TreeExecutionResult['rows'];
  treeNodeKeys: RowKey[];
  treeNodeKeyTokens: string[];
  treeDataProvider: TreeDataProvider | null;
}

export interface GridDataPipelineApplyResult {
  dataProvider: DataProvider;
  nextState: GridDataPipelineState;
}

export interface GridDataPipelineFlatViewParams {
  sourceDataProvider: DataProvider;
  rowModel: RowModel;
  sortMapping: ViewToDataMapping | null;
  filterMapping: ViewToDataMapping | null;
}

export interface GridDataPipelinePivotParams {
  rowModel: RowModel;
  result: PivotExecutionResult;
}

export interface GridDataPipelineGroupingParams {
  state: GridDataPipelineState;
  sourceDataProvider: DataProvider;
  rowModel: RowModel;
  result: GroupExecutionResult;
}

export interface GridDataPipelineTreeParams {
  state: GridDataPipelineState;
  sourceDataProvider: DataProvider;
  rowModel: RowModel;
  result: TreeExecutionResult;
  treeColumnId: string;
}

export class GridDataPipelineService {
  public createEmptyState(): GridDataPipelineState {
    return {
      groupRows: [],
      groupKeys: [],
      groupedDataProvider: null,
      pivotDataProvider: null,
      treeRows: [],
      treeNodeKeys: [],
      treeNodeKeyTokens: [],
      treeDataProvider: null
    };
  }

  public clearState(): GridDataPipelineState {
    return this.createEmptyState();
  }

  public applyFlatView(params: GridDataPipelineFlatViewParams): GridDataPipelineApplyResult {
    const rowCount = params.sourceDataProvider.getRowCount();
    const nextState = this.clearState();

    if (params.rowModel.getState().rowCount !== rowCount) {
      params.rowModel.setRowCount(rowCount);
    }

    if (params.sortMapping) {
      params.rowModel.setBaseViewToData(params.sortMapping);
    } else {
      params.rowModel.setBaseIdentityMapping();
    }

    params.rowModel.setFilterViewToData(params.filterMapping);

    return {
      dataProvider: params.sourceDataProvider,
      nextState
    };
  }

  public applyPivotResult(params: GridDataPipelinePivotParams): GridDataPipelineApplyResult {
    const pivotDataProvider = new LocalDataProvider(params.result.rows, { keyField: '__pivot_row_key' });
    const nextState: GridDataPipelineState = {
      groupRows: [],
      groupKeys: [],
      groupedDataProvider: null,
      pivotDataProvider,
      treeRows: [],
      treeNodeKeys: [],
      treeNodeKeyTokens: [],
      treeDataProvider: null
    };

    params.rowModel.setRowCount(pivotDataProvider.getRowCount());
    params.rowModel.setBaseIdentityMapping();
    params.rowModel.setFilterViewToData(null);

    return {
      dataProvider: pivotDataProvider,
      nextState
    };
  }

  public applyGroupingResult(params: GridDataPipelineGroupingParams): GridDataPipelineApplyResult {
    let groupedDataProvider = params.state.groupedDataProvider;
    if (!groupedDataProvider) {
      groupedDataProvider = new GroupedDataProvider(params.sourceDataProvider);
    } else {
      groupedDataProvider.setSourceDataProvider(params.sourceDataProvider);
    }

    groupedDataProvider.applySnapshot({
      rows: params.result.rows,
      groupKeys: params.result.groupKeys
    });

    const nextState: GridDataPipelineState = {
      groupRows: params.result.rows.slice(),
      groupKeys: params.result.groupKeys.slice(),
      groupedDataProvider,
      pivotDataProvider: null,
      treeRows: [],
      treeNodeKeys: [],
      treeNodeKeyTokens: [],
      treeDataProvider: null
    };

    params.rowModel.setRowCount(groupedDataProvider.getRowCount());
    params.rowModel.setBaseIdentityMapping();
    params.rowModel.setFilterViewToData(null);

    return {
      dataProvider: groupedDataProvider,
      nextState
    };
  }

  public applyTreeResult(params: GridDataPipelineTreeParams): GridDataPipelineApplyResult {
    let treeDataProvider = params.state.treeDataProvider;
    if (!treeDataProvider) {
      treeDataProvider = new TreeDataProvider(params.sourceDataProvider);
    } else {
      treeDataProvider.setSourceDataProvider(params.sourceDataProvider);
    }

    treeDataProvider.setTreeColumnId(params.treeColumnId);
    treeDataProvider.applySnapshot({
      rows: params.result.rows,
      nodeKeys: params.result.nodeKeys,
      nodeKeyTokens: params.result.nodeKeyTokens
    });

    const nextState: GridDataPipelineState = {
      groupRows: [],
      groupKeys: [],
      groupedDataProvider: null,
      pivotDataProvider: null,
      treeRows: params.result.rows.slice(),
      treeNodeKeys: params.result.nodeKeys.slice(),
      treeNodeKeyTokens: params.result.nodeKeyTokens.slice(),
      treeDataProvider
    };

    params.rowModel.setRowCount(treeDataProvider.getRowCount());
    params.rowModel.setBaseIdentityMapping();
    params.rowModel.setFilterViewToData(null);

    return {
      dataProvider: treeDataProvider,
      nextState
    };
  }
}
