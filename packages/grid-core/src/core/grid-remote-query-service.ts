import type { DataProvider, RowKey } from '../data/data-provider';
import type { GridFilterModel } from '../data/filter-executor';
import type { RemoteDataProvider as RemoteDataProviderContract, RemoteQueryModel, SortModelItem } from '../data/remote-data-provider';
import { cloneRemoteServerSideQueryModel } from '../data/remote-server-side-contracts';
import type { RemoteServerSideQueryModel } from '../data/remote-server-side-contracts';
import type { GroupAggregationDef, GroupModelItem, PivotModelItem, PivotValueDef, TreeDataOptions } from './grid-options';
import type { GridDerivedViewRowModelPort } from './grid-internal-contracts';
import { cloneGroupModel, clonePivotModel, clonePivotValues } from './grid-model-utils';

function cloneSortModel(sortModel: SortModelItem[]): SortModelItem[] {
  if (!Array.isArray(sortModel) || sortModel.length === 0) {
    return [];
  }

  const cloned: SortModelItem[] = [];
  for (let index = 0; index < sortModel.length; index += 1) {
    const item = sortModel[index];
    if (!item || typeof item.columnId !== 'string' || item.columnId.length === 0) {
      continue;
    }

    cloned.push({
      columnId: item.columnId,
      direction: item.direction === 'desc' ? 'desc' : 'asc'
    });
  }

  return cloned;
}

function cloneFilterModel(filterModel: GridFilterModel): GridFilterModel {
  if (!filterModel || typeof filterModel !== 'object') {
    return {};
  }

  const cloned: GridFilterModel = {};
  const keys = Object.keys(filterModel);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    cloned[key] = filterModel[key];
  }
  return cloned;
}

function cloneExpansionState(expansionState: Record<string, boolean>): Record<string, boolean> {
  const cloned: Record<string, boolean> = {};
  const keys = Object.keys(expansionState);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    cloned[key] = expansionState[key] === true;
  }

  return cloned;
}

function getExpandedGroupKeys(expansionState: Record<string, boolean>): string[] {
  return Object.keys(expansionState)
    .filter((groupKey) => expansionState[groupKey] === true)
    .sort();
}

function getExpandedNodeKeys(expansionState: Record<string, boolean>): RowKey[] {
  return Object.keys(expansionState)
    .filter((nodeKey) => expansionState[nodeKey] === true)
    .sort()
    .map((nodeKeyToken) => {
      if (nodeKeyToken.indexOf('number:') === 0) {
        return Number(nodeKeyToken.slice('number:'.length));
      }

      if (nodeKeyToken.indexOf('string:') === 0) {
        return nodeKeyToken.slice('string:'.length);
      }

      return nodeKeyToken;
    })
    .filter((nodeKey) => (typeof nodeKey === 'number' ? Number.isFinite(nodeKey) : typeof nodeKey === 'string'));
}

function cloneGroupingAggregations(aggregations: GroupAggregationDef[]): Array<{ columnId: string; type?: GroupAggregationDef['type'] }> {
  const cloned: Array<{ columnId: string; type?: GroupAggregationDef['type'] }> = [];
  for (let index = 0; index < aggregations.length; index += 1) {
    const aggregation = aggregations[index];
    if (!aggregation || typeof aggregation.columnId !== 'string' || aggregation.columnId.length === 0) {
      continue;
    }

    cloned.push({
      columnId: aggregation.columnId,
      type: aggregation.type
    });
  }

  return cloned;
}

export interface CreateRemoteQueryModelParams {
  sortModel: SortModelItem[];
  filterModel: GridFilterModel;
  groupModel: GroupModelItem[];
  pivotModel: PivotModelItem[];
  pivotValues: PivotValueDef[];
  groupAggregations: GroupAggregationDef[];
  groupExpansionState: Record<string, boolean>;
  groupDefaultExpanded: boolean;
  treeDataOptions: TreeDataOptions;
  treeExpansionState: Record<string, boolean>;
  useServerGrouping: boolean;
  useServerPivot: boolean;
  useServerTree: boolean;
  serverSide?: RemoteServerSideQueryModel;
}

export interface SyncRemoteProviderStateParams extends CreateRemoteQueryModelParams {
  dataProvider: RemoteDataProviderContract;
  rowModel: GridDerivedViewRowModelPort;
}

export class GridRemoteQueryService {
  public isRemoteDataProvider(dataProvider: DataProvider): dataProvider is RemoteDataProviderContract {
    return typeof (dataProvider as RemoteDataProviderContract).setQueryModel === 'function';
  }

  private getServerSideQueryModel(dataProvider: RemoteDataProviderContract): RemoteServerSideQueryModel | undefined {
    if (typeof dataProvider.getServerSideQueryModel !== 'function') {
      return undefined;
    }

    return dataProvider.getServerSideQueryModel();
  }

  private createServerSideQueryModel(params: CreateRemoteQueryModelParams): RemoteServerSideQueryModel | undefined {
    const baseQuery = cloneRemoteServerSideQueryModel(params.serverSide);
    if (!baseQuery && !params.useServerGrouping && !params.useServerPivot && !params.useServerTree) {
      return undefined;
    }

    const nextQuery = cloneRemoteServerSideQueryModel(baseQuery) ?? {
      schemaVersion: 'v1',
      requestKind: 'root',
      route: [],
      rootStoreStrategy: 'partial',
      childStoreStrategy: 'partial'
    };

    nextQuery.grouping = params.useServerGrouping
      ? {
          expandedGroupKeys: getExpandedGroupKeys(cloneExpansionState(params.groupExpansionState)),
          defaultExpanded: params.groupDefaultExpanded,
          aggregations: cloneGroupingAggregations(params.groupAggregations)
        }
      : undefined;

    nextQuery.tree = params.useServerTree
      ? {
          idField: params.treeDataOptions.idField,
          parentIdField: params.treeDataOptions.parentIdField,
          hasChildrenField: params.treeDataOptions.hasChildrenField,
          treeColumnId: params.treeDataOptions.treeColumnId,
          expandedNodeKeys: getExpandedNodeKeys(cloneExpansionState(params.treeExpansionState))
        }
      : undefined;

    if (params.useServerTree) {
      nextQuery.requestKind = 'tree';
    } else if (params.useServerPivot) {
      nextQuery.requestKind = 'pivot';
    } else if (nextQuery.requestKind === 'tree' || nextQuery.requestKind === 'pivot') {
      nextQuery.requestKind = 'root';
    }

    return nextQuery;
  }

  public createQueryModel(params: CreateRemoteQueryModelParams): RemoteQueryModel {
    return {
      sortModel: cloneSortModel(params.sortModel),
      filterModel: cloneFilterModel(params.filterModel),
      groupModel: params.useServerGrouping ? cloneGroupModel(params.groupModel) : undefined,
      pivotModel: params.useServerPivot ? clonePivotModel(params.pivotModel) : undefined,
      pivotValues: params.useServerPivot ? clonePivotValues(params.pivotValues) : undefined,
      serverSide: this.createServerSideQueryModel(params)
    };
  }

  public syncProviderState(params: SyncRemoteProviderStateParams): void {
    params.dataProvider.setQueryModel(
      this.createQueryModel({
        ...params,
        serverSide: this.getServerSideQueryModel(params.dataProvider)
      })
    );
    this.syncRowModel(params.rowModel, params.dataProvider);
  }

  public syncRowModel(rowModel: GridDerivedViewRowModelPort, dataProvider: RemoteDataProviderContract): void {
    const rowCount = dataProvider.getRowCount();
    if (rowModel.getState().rowCount !== rowCount) {
      rowModel.setRowCount(rowCount);
      return;
    }

    rowModel.setBaseIdentityMapping();
    rowModel.setFilterViewToData(null);
  }
}
