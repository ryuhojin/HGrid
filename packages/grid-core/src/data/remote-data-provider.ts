import type { DataProvider, GridRowData, RowKey } from './data-provider';

export type SortDirection = 'asc' | 'desc';

export interface SortModelItem {
  columnId: string;
  direction: SortDirection;
}

export type FilterModel = Record<string, unknown>;

export interface RemoteQueryModel {
  sortModel: SortModelItem[];
  filterModel: FilterModel;
}

export interface RemoteBlockRequest {
  startIndex: number;
  endIndex: number;
  operationId: string;
  queryModel: RemoteQueryModel;
}

export interface RemoteBlockResponse {
  rows: GridRowData[];
  rowKeys?: RowKey[];
  totalRowCount?: number;
}

export interface RemoteDataSource {
  fetchBlock(request: RemoteBlockRequest): Promise<RemoteBlockResponse>;
}

export interface RemoteCacheConfig {
  blockSize: number;
  maxBlocks: number;
  prefetchBlocks?: number;
}

export interface RemoteDataProvider extends DataProvider {
  setQueryModel(queryModel: Partial<RemoteQueryModel>): void;
  setDataSource(dataSource: RemoteDataSource): void;
  invalidateCache(): void;
  cancelOperation(operationId: string): void;
  getCacheConfig(): RemoteCacheConfig;
}
