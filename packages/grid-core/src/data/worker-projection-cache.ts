import type { ColumnDef } from '../core/grid-options';

const PROJECTION_KEY_SEPARATOR = '\u001f';
const PROJECTION_SECTION_SEPARATOR = '\u001e';
const MAX_PROJECTED_COLUMN_CACHE_ENTRIES = 16;
const MAX_COMPARATOR_RANK_CACHE_ENTRIES = 32;

export interface WorkerProjectionCacheDictionaryEncodedColumn {
  kind: 'dictionary';
  dictionary: unknown[];
  codes: Uint32Array;
}

export type WorkerProjectionCacheValuePayload =
  | unknown[]
  | Float64Array
  | Int32Array
  | WorkerProjectionCacheDictionaryEncodedColumn;

export type WorkerProjectionCacheValueMap = Record<string, WorkerProjectionCacheValuePayload>;

export interface WorkerProjectionCacheKeyParams {
  rowCount: number;
  allColumns: ColumnDef[];
  projectedColumns: ColumnDef[];
  extraFieldIds?: string[];
}

function buildColumnSignature(columns: ColumnDef[]): string {
  const parts = new Array<string>(columns.length);
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    parts[index] = [
      column.id,
      column.type,
      column.valueGetter ? 'getter' : 'raw',
      column.comparator ? 'comparator' : 'default'
    ].join(':');
  }
  return parts.join(PROJECTION_KEY_SEPARATOR);
}

function touchCacheEntry<TValue>(cache: Map<string, TValue>, key: string): TValue | undefined {
  const cachedValue = cache.get(key);
  if (cachedValue === undefined) {
    return undefined;
  }

  cache.delete(key);
  cache.set(key, cachedValue);
  return cachedValue;
}

function setCacheEntry<TValue>(cache: Map<string, TValue>, key: string, value: TValue, maxEntries: number): void {
  if (cache.has(key)) {
    cache.delete(key);
  }

  cache.set(key, value);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== 'string') {
      break;
    }
    cache.delete(oldestKey);
  }
}

export function createWorkerProjectionCacheKey(params: WorkerProjectionCacheKeyParams): string {
  const extraFieldIds = Array.isArray(params.extraFieldIds) ? params.extraFieldIds : [];
  const projectedColumnIds = new Array<string>(params.projectedColumns.length);
  for (let index = 0; index < params.projectedColumns.length; index += 1) {
    projectedColumnIds[index] = params.projectedColumns[index].id;
  }

  return [
    String(Math.max(0, Math.floor(params.rowCount))),
    buildColumnSignature(params.allColumns),
    projectedColumnIds.join(PROJECTION_KEY_SEPARATOR),
    extraFieldIds.join(PROJECTION_KEY_SEPARATOR)
  ].join(PROJECTION_SECTION_SEPARATOR);
}

export function createWorkerComparatorCacheKey(projectionKey: string, columnId: string): string {
  return [projectionKey, columnId].join(PROJECTION_SECTION_SEPARATOR);
}

export class WorkerProjectionCache {
  private readonly projectedColumnValuesByKey = new Map<string, WorkerProjectionCacheValueMap>();
  private readonly comparatorRanksByKey = new Map<string, number[]>();

  public clear(): void {
    this.projectedColumnValuesByKey.clear();
    this.comparatorRanksByKey.clear();
  }

  public getProjectedColumnValues(key: string): WorkerProjectionCacheValueMap | undefined {
    return touchCacheEntry(this.projectedColumnValuesByKey, key);
  }

  public setProjectedColumnValues(key: string, value: WorkerProjectionCacheValueMap): void {
    setCacheEntry(this.projectedColumnValuesByKey, key, value, MAX_PROJECTED_COLUMN_CACHE_ENTRIES);
  }

  public getComparatorRanks(key: string): number[] | undefined {
    return touchCacheEntry(this.comparatorRanksByKey, key);
  }

  public setComparatorRanks(key: string, value: number[]): void {
    setCacheEntry(this.comparatorRanksByKey, key, value, MAX_COMPARATOR_RANK_CACHE_ENTRIES);
  }
}
