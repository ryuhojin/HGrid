import type { DataProvider } from '../data/data-provider';
import type { GridFilterModel } from '../data/filter-executor';
import type { RemoteDataProvider as RemoteDataProviderContract, RemoteQueryModel, SortModelItem } from '../data/remote-data-provider';
import type { RemoteServerSideQueryModel } from '../data/remote-server-side-contracts';
import type { GroupModelItem, PivotModelItem, PivotValueDef } from './grid-options';
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

export interface CreateRemoteQueryModelParams {
  sortModel: SortModelItem[];
  filterModel: GridFilterModel;
  groupModel: GroupModelItem[];
  pivotModel: PivotModelItem[];
  pivotValues: PivotValueDef[];
  useServerGrouping: boolean;
  useServerPivot: boolean;
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

  public createQueryModel(params: CreateRemoteQueryModelParams): RemoteQueryModel {
    return {
      sortModel: cloneSortModel(params.sortModel),
      filterModel: cloneFilterModel(params.filterModel),
      groupModel: params.useServerGrouping ? cloneGroupModel(params.groupModel) : undefined,
      pivotModel: params.useServerPivot ? clonePivotModel(params.pivotModel) : undefined,
      pivotValues: params.useServerPivot ? clonePivotValues(params.pivotValues) : undefined,
      serverSide: params.serverSide
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
