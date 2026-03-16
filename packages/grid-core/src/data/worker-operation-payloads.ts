import type {
  ColumnDef,
  GroupAggregationDef,
  GroupModelItem,
  PivotModelItem,
  PivotValueDef,
  TreeDataOptions
} from '../core/grid-options';
import type { DataProvider, GridRowData, RowKey } from './data-provider';
import type { FilterExecutionRequest, GridFilterModel } from './filter-executor';
import type { AdvancedFilterModel } from './filter-model';
import { cloneAdvancedFilterModel, visitAdvancedFilterRules } from './filter-model';
import type { GroupExecutionRequest } from './group-executor';
import { LocalDataProvider } from './local-data-provider';
import type { PivotExecutionRequest } from './pivot-executor';
import type { SortExecutionRequest } from './sort-executor';
import { toTreeNodeKeyToken, type TreeExecutionRequest, type TreeLazyChildrenBatch } from './tree-executor';
import {
  createWorkerComparatorCacheKey,
  createWorkerProjectionCacheKey,
  type WorkerProjectionCache
} from './worker-projection-cache';

export const WORKER_TREE_LAZY_ROW_REF_FIELD = '__hgrid_internal_worker_tree_lazy_row_ref';

export type WorkerColumnSnapshot = Pick<ColumnDef, 'id' | 'type'>;
export type WorkerGroupAggregationSnapshot = Omit<GroupAggregationDef, 'reducer'>;
export type WorkerPivotValueSnapshot = Omit<PivotValueDef, 'reducer'>;
export type WorkerTreeDataSnapshot = Omit<TreeDataOptions, 'loadChildren'>;

export interface WorkerDictionaryEncodedColumn {
  kind: 'dictionary';
  dictionary: unknown[];
  codes: Uint32Array;
}

export type WorkerColumnValuesPayload = unknown[] | Float64Array | Int32Array | WorkerDictionaryEncodedColumn;
export type WorkerColumnValueMap = Record<string, WorkerColumnValuesPayload>;

export interface WorkerPayloadSerializationContext {
  projectionCache?: WorkerProjectionCache;
  isCanceled?: () => boolean;
  yieldControl?: () => Promise<void>;
  yieldInterval?: number;
}

interface WorkerSerializationProgressCounter {
  value: number;
}

const DEFAULT_WORKER_SERIALIZATION_YIELD_INTERVAL = 8_192;
const MIN_WORKER_SERIALIZATION_YIELD_INTERVAL = 1;

export interface SortWorkerRowsPayload {
  rows: GridRowData[];
  columns: WorkerColumnSnapshot[];
  sortModel: SortExecutionRequest['sortModel'];
}

export interface SortWorkerColumnarPayload {
  kind: 'columnar';
  rowCount: number;
  columns: WorkerColumnSnapshot[];
  sortModel: SortExecutionRequest['sortModel'];
  columnValuesById: WorkerColumnValueMap;
}

export type SortWorkerPayload = SortWorkerRowsPayload | SortWorkerColumnarPayload;

export interface FilterWorkerRowsPayload {
  rows: GridRowData[];
  columns: WorkerColumnSnapshot[];
  filterModel: GridFilterModel;
  advancedFilterModel?: AdvancedFilterModel | null;
  sourceOrder?: Int32Array | number[];
}

export interface FilterWorkerColumnarPayload {
  kind: 'columnar';
  rowCount: number;
  columns: WorkerColumnSnapshot[];
  filterModel: GridFilterModel;
  advancedFilterModel?: AdvancedFilterModel | null;
  sourceOrder?: Int32Array | number[];
  columnValuesById: WorkerColumnValueMap;
}

export type FilterWorkerPayload = FilterWorkerRowsPayload | FilterWorkerColumnarPayload;

export interface GroupWorkerRowsPayload {
  rows: GridRowData[];
  columns: WorkerColumnSnapshot[];
  groupModel: GroupModelItem[];
  aggregations: WorkerGroupAggregationSnapshot[];
  sourceOrder?: Int32Array | number[];
  groupExpansionState?: Record<string, boolean>;
  defaultExpanded?: boolean;
  includeLeafDataIndexes?: boolean;
}

export interface GroupWorkerColumnarPayload {
  kind: 'columnar';
  rowCount: number;
  columns: WorkerColumnSnapshot[];
  groupModel: GroupModelItem[];
  aggregations: WorkerGroupAggregationSnapshot[];
  sourceOrder?: Int32Array | number[];
  groupExpansionState?: Record<string, boolean>;
  defaultExpanded?: boolean;
  columnValuesById: WorkerColumnValueMap;
  includeLeafDataIndexes?: boolean;
}

export type GroupWorkerPayload = GroupWorkerRowsPayload | GroupWorkerColumnarPayload;

export interface PivotWorkerRowsPayload {
  rows: GridRowData[];
  columns: WorkerColumnSnapshot[];
  sourceOrder?: Int32Array | number[];
  rowGroupModel: GroupModelItem[];
  pivotModel: PivotModelItem[];
  pivotValues: WorkerPivotValueSnapshot[];
  customValueColumnIds?: string[];
}

export interface PivotWorkerColumnarPayload {
  kind: 'columnar';
  rowCount: number;
  columns: WorkerColumnSnapshot[];
  sourceOrder?: Int32Array | number[];
  rowGroupModel: GroupModelItem[];
  pivotModel: PivotModelItem[];
  pivotValues: WorkerPivotValueSnapshot[];
  columnValuesById: WorkerColumnValueMap;
  customValueColumnIds?: string[];
}

export type PivotWorkerPayload = PivotWorkerRowsPayload | PivotWorkerColumnarPayload;

export interface TreeWorkerRowsPayload {
  rows: GridRowData[];
  sourceOrder?: Int32Array | number[];
  treeData: WorkerTreeDataSnapshot;
  treeExpansionState?: Record<string, boolean>;
  lazyChildrenBatches?: TreeLazyChildrenBatch[];
}

export interface TreeWorkerCompactPayload {
  kind: 'compact';
  rowCount: number;
  sourceOrder?: Int32Array | number[];
  treeData: WorkerTreeDataSnapshot;
  treeExpansionState?: Record<string, boolean>;
  lazyChildrenBatches?: TreeLazyChildrenBatch[];
  columnValuesById: WorkerColumnValueMap;
}

export type TreeWorkerPayload = TreeWorkerRowsPayload | TreeWorkerCompactPayload;

function normalizeSerializationYieldInterval(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_WORKER_SERIALIZATION_YIELD_INTERVAL;
  }

  return Math.max(MIN_WORKER_SERIALIZATION_YIELD_INTERVAL, Math.floor(value));
}

function isSerializationCanceled(context: WorkerPayloadSerializationContext | undefined): boolean {
  return context?.isCanceled?.() === true;
}

function shouldYieldSerialization(
  processedCounter: WorkerSerializationProgressCounter,
  yieldInterval: number
): boolean {
  processedCounter.value += 1;
  if (processedCounter.value < yieldInterval) {
    return false;
  }

  processedCounter.value = 0;
  return true;
}

async function yieldSerialization(context: WorkerPayloadSerializationContext | undefined): Promise<boolean> {
  if (typeof context?.yieldControl === 'function') {
    await context.yieldControl();
  }

  return isSerializationCanceled(context);
}

function toWorkerColumns(
  columns: ColumnDef[],
  typeOverrides?: Record<string, WorkerColumnSnapshot['type'] | undefined>
): WorkerColumnSnapshot[] {
  const normalizedColumns = new Array<WorkerColumnSnapshot>(columns.length);
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    const overrideType =
      typeOverrides && Object.prototype.hasOwnProperty.call(typeOverrides, column.id) ? typeOverrides[column.id] : undefined;
    normalizedColumns[index] = {
      id: column.id,
      type: overrideType === undefined ? column.type : overrideType
    };
  }
  return normalizedColumns;
}

function toExecutorColumns(columns: WorkerColumnSnapshot[]): ColumnDef[] {
  const normalizedColumns: ColumnDef[] = new Array(columns.length);
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    normalizedColumns[index] = {
      id: column.id,
      header: column.id,
      width: 120,
      type: column.type
    };
  }
  return normalizedColumns;
}

function cloneRows(rows: GridRowData[]): GridRowData[] {
  const nextRows = new Array<GridRowData>(rows.length);
  for (let index = 0; index < rows.length; index += 1) {
    nextRows[index] = { ...rows[index] };
  }
  return nextRows;
}

class ColumnValueSnapshotDataProvider implements DataProvider {
  public constructor(
    private readonly rowCount: number,
    private readonly columnValuesById: WorkerColumnValueMap
  ) {}

  public getRowCount(): number {
    return this.rowCount;
  }

  public getRowKey(dataIndex: number): number {
    return dataIndex;
  }

  public getValue(dataIndex: number, columnId: string): unknown {
    return resolveWorkerColumnValue(this.columnValuesById[columnId], dataIndex);
  }

  public setValue(): void {}

  public applyTransactions(): void {}

  public getDataIndexByRowKey(rowKey: RowKey, dataIndexHint?: number): number {
    if (
      Number.isInteger(dataIndexHint) &&
      dataIndexHint !== undefined &&
      dataIndexHint >= 0 &&
      dataIndexHint < this.rowCount &&
      dataIndexHint === rowKey
    ) {
      return dataIndexHint;
    }

    return typeof rowKey === 'number' && rowKey >= 0 && rowKey < this.rowCount ? rowKey : -1;
  }
}

function resolveWorkerColumnValue(values: WorkerColumnValuesPayload | undefined, dataIndex: number): unknown {
  if (!values) {
    return undefined;
  }

  if (Array.isArray(values)) {
    return values[dataIndex];
  }

  if (values instanceof Float64Array || values instanceof Int32Array) {
    return values[dataIndex];
  }

  if (values.kind === 'dictionary') {
    return values.dictionary[values.codes[dataIndex]];
  }

  return undefined;
}

function getWorkerColumnValuesLength(values: WorkerColumnValuesPayload | undefined): number {
  if (!values) {
    return 0;
  }

  if (Array.isArray(values) || values instanceof Float64Array || values instanceof Int32Array) {
    return values.length;
  }

  if (values.kind === 'dictionary') {
    return values.codes.length;
  }

  return 0;
}

function cloneWorkerColumnValuesPayload(values: WorkerColumnValuesPayload): WorkerColumnValuesPayload {
  if (Array.isArray(values)) {
    return values.slice();
  }

  if (values instanceof Float64Array) {
    return new Float64Array(values);
  }

  if (values instanceof Int32Array) {
    return new Int32Array(values);
  }

  if (values.kind === 'dictionary') {
    return {
      kind: 'dictionary',
      dictionary: values.dictionary.slice(),
      codes: new Uint32Array(values.codes)
    };
  }

  return values;
}

function cloneWorkerColumnValueMap(columnValuesById: WorkerColumnValueMap): WorkerColumnValueMap {
  const clonedValuesById: WorkerColumnValueMap = {};
  const columnIds = Object.keys(columnValuesById);
  for (let index = 0; index < columnIds.length; index += 1) {
    const columnId = columnIds[index];
    clonedValuesById[columnId] = cloneWorkerColumnValuesPayload(columnValuesById[columnId]);
  }
  return clonedValuesById;
}

function cloneSourceOrder(sourceOrder: Int32Array | number[] | undefined): Int32Array | number[] | undefined {
  if (!sourceOrder) {
    return undefined;
  }

  if (sourceOrder instanceof Int32Array) {
    return new Int32Array(sourceOrder);
  }

  return sourceOrder.slice();
}

function cloneTreeDataSnapshot(treeData: WorkerTreeDataSnapshot): WorkerTreeDataSnapshot {
  return {
    enabled: treeData.enabled === true,
    mode: treeData.mode === 'server' ? 'server' : 'client',
    idField: treeData.idField,
    parentIdField: treeData.parentIdField,
    hasChildrenField: treeData.hasChildrenField,
    treeColumnId: treeData.treeColumnId,
    defaultExpanded: treeData.defaultExpanded === true,
    rootParentValue: treeData.rootParentValue === undefined ? null : treeData.rootParentValue
  };
}

function getTreeFieldName(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function createWorkerTreeLazyRowRef(parentNodeKey: RowKey, rowIndex: number): string {
  return `${toTreeNodeKeyToken(parentNodeKey)}::${String(Math.max(0, Math.floor(rowIndex)))}`;
}

function compactTreeLazyRow(
  row: GridRowData,
  treeData: TreeDataOptions | undefined,
  parentNodeKey: RowKey,
  rowIndex: number
): GridRowData {
  const idField = getTreeFieldName(treeData?.idField, 'id');
  const parentIdField = getTreeFieldName(treeData?.parentIdField, 'parentId');
  const hasChildrenField = getTreeFieldName(treeData?.hasChildrenField, 'hasChildren');

  return {
    [idField]: row[idField],
    [parentIdField]: row[parentIdField] ?? parentNodeKey,
    [hasChildrenField]: row[hasChildrenField] === true,
    [WORKER_TREE_LAZY_ROW_REF_FIELD]: createWorkerTreeLazyRowRef(parentNodeKey, rowIndex)
  };
}

function createSnapshotDataProvider(rows: GridRowData[]): LocalDataProvider {
  return new LocalDataProvider(cloneRows(rows));
}

function createColumnValueSnapshotDataProvider(
  rowCount: number,
  columnValuesById: WorkerColumnValueMap
): ColumnValueSnapshotDataProvider {
  return new ColumnValueSnapshotDataProvider(rowCount, columnValuesById);
}

function isSortColumnarPayload(payload: SortWorkerPayload): payload is SortWorkerColumnarPayload {
  return 'kind' in payload && payload.kind === 'columnar';
}

function isFilterColumnarPayload(payload: FilterWorkerPayload): payload is FilterWorkerColumnarPayload {
  return 'kind' in payload && payload.kind === 'columnar';
}

function isGroupColumnarPayload(payload: GroupWorkerPayload): payload is GroupWorkerColumnarPayload {
  return 'kind' in payload && payload.kind === 'columnar';
}

function isPivotColumnarPayload(payload: PivotWorkerPayload): payload is PivotWorkerColumnarPayload {
  return 'kind' in payload && payload.kind === 'columnar';
}

function isTreeCompactPayload(payload: TreeWorkerPayload): payload is TreeWorkerCompactPayload {
  return 'kind' in payload && payload.kind === 'compact';
}

function buildFallbackRow(dataProvider: DataProvider, dataIndex: number, fieldIds: string[]): GridRowData {
  const row: GridRowData = {};
  for (let fieldIndex = 0; fieldIndex < fieldIds.length; fieldIndex += 1) {
    const fieldId = fieldIds[fieldIndex];
    row[fieldId] = dataProvider.getValue(dataIndex, fieldId);
  }
  return row;
}

function collectFieldIds(columns: ColumnDef[], extraFieldIds?: string[]): string[] {
  const uniqueFieldIds = new Set<string>();
  for (let index = 0; index < columns.length; index += 1) {
    uniqueFieldIds.add(columns[index].id);
  }

  if (Array.isArray(extraFieldIds)) {
    for (let index = 0; index < extraFieldIds.length; index += 1) {
      const fieldId = extraFieldIds[index];
      if (typeof fieldId === 'string' && fieldId.length > 0) {
        uniqueFieldIds.add(fieldId);
      }
    }
  }

  return Array.from(uniqueFieldIds);
}

function collectColumnsByIds(columns: ColumnDef[], columnIds: string[]): ColumnDef[] {
  if (columnIds.length === 0) {
    return [];
  }

  const wanted = new Set(columnIds);
  const selected: ColumnDef[] = [];
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (wanted.has(column.id)) {
      selected.push(column);
    }
  }
  return selected;
}

function isFiniteNumberValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInt32NumberValue(value: number): boolean {
  return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
}

function canDictionaryEncodeValue(value: unknown): boolean {
  return value === null || value === undefined || typeof value === 'string';
}

function encodeNumberColumnValues(values: unknown[]): WorkerColumnValuesPayload {
  const intValues = new Int32Array(values.length);
  let floatValues: Float64Array | null = null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!isFiniteNumberValue(value)) {
      return values;
    }

    if (floatValues) {
      floatValues[index] = value;
      continue;
    }

    if (isInt32NumberValue(value)) {
      intValues[index] = value;
      continue;
    }

    floatValues = new Float64Array(values.length);
    for (let copyIndex = 0; copyIndex < index; copyIndex += 1) {
      floatValues[copyIndex] = intValues[copyIndex];
    }
    floatValues[index] = value;
  }

  return floatValues ?? intValues;
}

function encodeWorkerColumnValuesAsync(column: ColumnDef, values: unknown[]): WorkerColumnValuesPayload {
  if (column.type === 'number') {
    return encodeNumberColumnValues(values);
  }

  if (column.type === 'text' || column.type === 'date') {
    const dictionary: unknown[] = [];
    const dictionaryIndexByKey = new Map<string, number>();
    const codes = new Uint32Array(values.length);
    let canUseDictionary = values.length > 0;
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      if (!canDictionaryEncodeValue(value)) {
        canUseDictionary = false;
        break;
      }

      const dictionaryKey = value === null ? '__null__' : value === undefined ? '__undefined__' : `s:${value}`;
      let code = dictionaryIndexByKey.get(dictionaryKey);
      if (code === undefined) {
        code = dictionary.length;
        dictionaryIndexByKey.set(dictionaryKey, code);
        dictionary.push(value);
      }
      codes[index] = code;
    }

    const maxUsefulDictionarySize = Math.max(4, Math.min(512, Math.floor(values.length / 8)));
    if (canUseDictionary && dictionary.length > 0 && dictionary.length <= maxUsefulDictionarySize) {
      return {
        kind: 'dictionary',
        dictionary,
        codes
      };
    }
  }

  return values;
}

function materializeDictionaryValues(
  dictionary: unknown[],
  codes: Uint32Array,
  count: number,
  values: unknown[]
): void {
  for (let index = 0; index < count; index += 1) {
    values[index] = dictionary[codes[index]];
  }
}

async function snapshotEncodedColumnValuesAsync(
  rowCount: number,
  dataProvider: DataProvider,
  columns: ColumnDef[],
  context?: WorkerPayloadSerializationContext
): Promise<WorkerColumnValueMap | null> {
  const normalizedRowCount = Math.max(0, Math.floor(rowCount));
  const columnValuesById: WorkerColumnValueMap = {};
  if (isSerializationCanceled(context)) {
    return null;
  }

  const processedCounter: WorkerSerializationProgressCounter = { value: 0 };
  const yieldInterval = normalizeSerializationYieldInterval(context?.yieldInterval);
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const column = columns[columnIndex];
    const columnId = column.id;
    if (column.type === 'number') {
      const intValues = new Int32Array(normalizedRowCount);
      let floatValues: Float64Array | null = null;
      let fallbackValues: unknown[] | null = null;
      for (let dataIndex = 0; dataIndex < normalizedRowCount; dataIndex += 1) {
        const value = dataProvider.getValue(dataIndex, columnId);
        if (fallbackValues) {
          fallbackValues[dataIndex] = value;
        } else if (floatValues) {
          if (isFiniteNumberValue(value)) {
            floatValues[dataIndex] = value;
          } else {
            fallbackValues = new Array<unknown>(normalizedRowCount);
            for (let copyIndex = 0; copyIndex < dataIndex; copyIndex += 1) {
              fallbackValues[copyIndex] = floatValues[copyIndex];
            }
            fallbackValues[dataIndex] = value;
          }
        } else if (isFiniteNumberValue(value)) {
          if (isInt32NumberValue(value)) {
            intValues[dataIndex] = value;
          } else {
            floatValues = new Float64Array(normalizedRowCount);
            for (let copyIndex = 0; copyIndex < dataIndex; copyIndex += 1) {
              floatValues[copyIndex] = intValues[copyIndex];
            }
            floatValues[dataIndex] = value;
          }
        } else {
          fallbackValues = new Array<unknown>(normalizedRowCount);
          for (let copyIndex = 0; copyIndex < dataIndex; copyIndex += 1) {
            fallbackValues[copyIndex] = floatValues ? floatValues[copyIndex] : intValues[copyIndex];
          }
          fallbackValues[dataIndex] = value;
        }

        if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
          return null;
        }
      }

      columnValuesById[columnId] = fallbackValues ?? floatValues ?? intValues;
      continue;
    }

    if (column.type === 'text' || column.type === 'date') {
      const dictionary: unknown[] = [];
      const dictionaryIndexByKey = new Map<string, number>();
      const codes = new Uint32Array(normalizedRowCount);
      const maxUsefulDictionarySize = Math.max(4, Math.min(512, Math.floor(normalizedRowCount / 8)));
      let fallbackValues: unknown[] | null = null;

      for (let dataIndex = 0; dataIndex < normalizedRowCount; dataIndex += 1) {
        const value = dataProvider.getValue(dataIndex, columnId);
        if (fallbackValues) {
          fallbackValues[dataIndex] = value;
        } else if (!canDictionaryEncodeValue(value)) {
          fallbackValues = new Array<unknown>(normalizedRowCount);
          materializeDictionaryValues(dictionary, codes, dataIndex, fallbackValues);
          fallbackValues[dataIndex] = value;
        } else {
          const dictionaryKey = value === null ? '__null__' : value === undefined ? '__undefined__' : `s:${value}`;
          let code = dictionaryIndexByKey.get(dictionaryKey);
          if (code === undefined) {
            if (dictionary.length >= maxUsefulDictionarySize) {
              fallbackValues = new Array<unknown>(normalizedRowCount);
              materializeDictionaryValues(dictionary, codes, dataIndex, fallbackValues);
              fallbackValues[dataIndex] = value;
            } else {
              code = dictionary.length;
              dictionaryIndexByKey.set(dictionaryKey, code);
              dictionary.push(value);
            }
          }

          if (!fallbackValues) {
            codes[dataIndex] = code as number;
          }
        }

        if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
          return null;
        }
      }

      columnValuesById[columnId] = fallbackValues
        ? fallbackValues
        : {
            kind: 'dictionary',
            dictionary,
            codes
          };
      continue;
    }

    const values = new Array<unknown>(normalizedRowCount);
    for (let dataIndex = 0; dataIndex < normalizedRowCount; dataIndex += 1) {
      values[dataIndex] = dataProvider.getValue(dataIndex, columnId);
      if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
        return null;
      }
    }
    columnValuesById[columnId] = values;
  }

  return columnValuesById;
}

function snapshotColumnValues(
  rowCount: number,
  dataProvider: DataProvider,
  columnIds: string[]
): WorkerColumnValueMap {
  const normalizedRowCount = Math.max(0, Math.floor(rowCount));
  const columnValuesById: Record<string, unknown[]> = {};
  for (let columnIndex = 0; columnIndex < columnIds.length; columnIndex += 1) {
    const columnId = columnIds[columnIndex];
    const values = new Array<unknown>(normalizedRowCount);
    for (let dataIndex = 0; dataIndex < normalizedRowCount; dataIndex += 1) {
      values[dataIndex] = dataProvider.getValue(dataIndex, columnId);
    }
    columnValuesById[columnId] = values;
  }
  return columnValuesById;
}

async function snapshotColumnValuesAsync(
  rowCount: number,
  dataProvider: DataProvider,
  columnIds: string[],
  context?: WorkerPayloadSerializationContext
): Promise<WorkerColumnValueMap | null> {
  const normalizedRowCount = Math.max(0, Math.floor(rowCount));
  const columnValuesById: Record<string, unknown[]> = {};
  if (isSerializationCanceled(context)) {
    return null;
  }

  const processedCounter: WorkerSerializationProgressCounter = { value: 0 };
  const yieldInterval = normalizeSerializationYieldInterval(context?.yieldInterval);
  for (let columnIndex = 0; columnIndex < columnIds.length; columnIndex += 1) {
    const columnId = columnIds[columnIndex];
    const values = new Array<unknown>(normalizedRowCount);
    for (let dataIndex = 0; dataIndex < normalizedRowCount; dataIndex += 1) {
      values[dataIndex] = dataProvider.getValue(dataIndex, columnId);
      if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
        return null;
      }
    }
    columnValuesById[columnId] = values;
  }
  return columnValuesById;
}

function snapshotProjectedColumnValues(
  rowCount: number,
  dataProvider: DataProvider,
  allColumns: ColumnDef[],
  projectedColumns: ColumnDef[],
  extraFieldIds?: string[],
  context?: WorkerPayloadSerializationContext
): WorkerColumnValueMap | null {
  const normalizedRowCount = Math.max(0, Math.floor(rowCount));
  const evaluationColumns = collectProjectedValueGetterEvaluationColumns(allColumns, projectedColumns);
  const projectionCacheSchemaColumns = collectProjectionCacheSchemaColumns(allColumns, projectedColumns, evaluationColumns);
  const projectionCacheKey = context?.projectionCache
    ? createWorkerProjectionCacheKey({
        rowCount: normalizedRowCount,
        allColumns: projectionCacheSchemaColumns,
        projectedColumns,
        extraFieldIds
      })
    : null;
  if (projectionCacheKey && context?.projectionCache) {
    const cachedProjection = context.projectionCache.getProjectedColumnValues(projectionCacheKey);
    if (cachedProjection) {
      return cloneWorkerColumnValueMap(cachedProjection);
    }
  }

  const hasGetRow = typeof dataProvider.getRow === 'function';
  if (!hasGetRow) {
    for (let columnIndex = 0; columnIndex < projectedColumns.length; columnIndex += 1) {
      if (typeof projectedColumns[columnIndex].valueGetter === 'function' && allColumns.length === 0) {
        return null;
      }
    }
  }

  const columnValuesById: Record<string, unknown[]> = {};
  for (let columnIndex = 0; columnIndex < projectedColumns.length; columnIndex += 1) {
    columnValuesById[projectedColumns[columnIndex].id] = new Array<unknown>(normalizedRowCount);
  }

  if (normalizedRowCount === 0) {
    return columnValuesById;
  }

  const fieldIds = collectFieldIds(allColumns, extraFieldIds);
  for (let dataIndex = 0; dataIndex < normalizedRowCount; dataIndex += 1) {
    const baseRow = hasGetRow
      ? { ...(dataProvider.getRow?.(dataIndex) ?? buildFallbackRow(dataProvider, dataIndex, fieldIds)) }
      : buildFallbackRow(dataProvider, dataIndex, fieldIds);

    for (let columnIndex = 0; columnIndex < evaluationColumns.length; columnIndex += 1) {
      const column = evaluationColumns[columnIndex];
      if (typeof column.valueGetter === 'function') {
        baseRow[column.id] = column.valueGetter(baseRow, column);
      }
    }

    for (let columnIndex = 0; columnIndex < projectedColumns.length; columnIndex += 1) {
      const column = projectedColumns[columnIndex];
      const value =
        Object.prototype.hasOwnProperty.call(baseRow, column.id)
          ? baseRow[column.id]
          : dataProvider.getValue(dataIndex, column.id);

      baseRow[column.id] = value;
      columnValuesById[column.id][dataIndex] = value;
    }
  }

  if (projectionCacheKey && context?.projectionCache) {
    context.projectionCache.setProjectedColumnValues(projectionCacheKey, cloneWorkerColumnValueMap(columnValuesById));
  }

  return columnValuesById;
}

function encodeAsyncWorkerColumnValueMap(columns: ColumnDef[], columnValuesById: WorkerColumnValueMap): WorkerColumnValueMap {
  const encodedValuesById: WorkerColumnValueMap = {};
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    const values = columnValuesById[column.id];
    encodedValuesById[column.id] = Array.isArray(values) ? encodeWorkerColumnValuesAsync(column, values) : values;
  }
  return encodedValuesById;
}

async function snapshotProjectedColumnValuesAsync(
  rowCount: number,
  dataProvider: DataProvider,
  allColumns: ColumnDef[],
  projectedColumns: ColumnDef[],
  extraFieldIds?: string[],
  context?: WorkerPayloadSerializationContext
): Promise<WorkerColumnValueMap | null> {
  const normalizedRowCount = Math.max(0, Math.floor(rowCount));
  const evaluationColumns = collectProjectedValueGetterEvaluationColumns(allColumns, projectedColumns);
  const projectionCacheSchemaColumns = collectProjectionCacheSchemaColumns(allColumns, projectedColumns, evaluationColumns);
  const projectionCacheKey = context?.projectionCache
    ? createWorkerProjectionCacheKey({
        rowCount: normalizedRowCount,
        allColumns: projectionCacheSchemaColumns,
        projectedColumns,
        extraFieldIds
      })
    : null;
  if (projectionCacheKey && context?.projectionCache) {
    const cachedProjection = context.projectionCache.getProjectedColumnValues(projectionCacheKey);
    if (cachedProjection) {
      return cloneWorkerColumnValueMap(cachedProjection);
    }
  }

  const hasGetRow = typeof dataProvider.getRow === 'function';
  if (!hasGetRow) {
    for (let columnIndex = 0; columnIndex < projectedColumns.length; columnIndex += 1) {
      if (typeof projectedColumns[columnIndex].valueGetter === 'function' && allColumns.length === 0) {
        return null;
      }
    }
  }

  const columnValuesById: Record<string, unknown[]> = {};
  for (let columnIndex = 0; columnIndex < projectedColumns.length; columnIndex += 1) {
    columnValuesById[projectedColumns[columnIndex].id] = new Array<unknown>(normalizedRowCount);
  }

  if (normalizedRowCount === 0) {
    return columnValuesById;
  }

  if (isSerializationCanceled(context)) {
    return null;
  }

  const processedCounter: WorkerSerializationProgressCounter = { value: 0 };
  const yieldInterval = normalizeSerializationYieldInterval(context?.yieldInterval);
  const fieldIds = collectFieldIds(allColumns, extraFieldIds);
  for (let dataIndex = 0; dataIndex < normalizedRowCount; dataIndex += 1) {
    const baseRow = hasGetRow
      ? { ...(dataProvider.getRow?.(dataIndex) ?? buildFallbackRow(dataProvider, dataIndex, fieldIds)) }
      : buildFallbackRow(dataProvider, dataIndex, fieldIds);

    for (let columnIndex = 0; columnIndex < evaluationColumns.length; columnIndex += 1) {
      const column = evaluationColumns[columnIndex];
      if (typeof column.valueGetter === 'function') {
        baseRow[column.id] = column.valueGetter(baseRow, column);
      }
    }

    for (let columnIndex = 0; columnIndex < projectedColumns.length; columnIndex += 1) {
      const column = projectedColumns[columnIndex];
      const value =
        Object.prototype.hasOwnProperty.call(baseRow, column.id)
          ? baseRow[column.id]
          : dataProvider.getValue(dataIndex, column.id);

      baseRow[column.id] = value;
      columnValuesById[column.id][dataIndex] = value;
    }

    if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
      return null;
    }
  }

  const encodedValuesById = encodeAsyncWorkerColumnValueMap(projectedColumns, columnValuesById);
  if (projectionCacheKey && context?.projectionCache) {
    context.projectionCache.setProjectedColumnValues(projectionCacheKey, cloneWorkerColumnValueMap(encodedValuesById));
  }

  return encodedValuesById;
}

function collectProjectedValueGetterEvaluationColumns(allColumns: ColumnDef[], projectedColumns: ColumnDef[]): ColumnDef[] {
  if (allColumns.length === 0 || projectedColumns.length === 0) {
    return [];
  }

  const allColumnIndexById = new Map<string, number>();
  for (let index = 0; index < allColumns.length; index += 1) {
    allColumnIndexById.set(allColumns[index].id, index);
  }

  let maxProjectedValueGetterIndex = -1;
  for (let index = 0; index < projectedColumns.length; index += 1) {
    const column = projectedColumns[index];
    if (typeof column.valueGetter !== 'function') {
      continue;
    }

    const columnIndex = allColumnIndexById.get(column.id);
    if (typeof columnIndex === 'number' && columnIndex > maxProjectedValueGetterIndex) {
      maxProjectedValueGetterIndex = columnIndex;
    }
  }

  if (maxProjectedValueGetterIndex < 0) {
    return [];
  }

  return allColumns.slice(0, maxProjectedValueGetterIndex + 1);
}

function collectProjectionCacheSchemaColumns(
  allColumns: ColumnDef[],
  projectedColumns: ColumnDef[],
  evaluationColumns: ColumnDef[]
): ColumnDef[] {
  if (evaluationColumns.length > 0) {
    return evaluationColumns;
  }

  return allColumns.length > 0 ? collectColumnsByIds(allColumns, projectedColumns.map((column) => column.id)) : projectedColumns;
}

function snapshotRows(
  rowCount: number,
  dataProvider: DataProvider,
  columns: ColumnDef[],
  extraFieldIds?: string[]
): GridRowData[] | null {
  const normalizedRowCount = Math.max(0, Math.floor(rowCount));
  if (normalizedRowCount === 0) {
    return [];
  }

  const hasGetRow = typeof dataProvider.getRow === 'function';
  if (!hasGetRow) {
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      if (typeof columns[columnIndex].valueGetter === 'function') {
        return null;
      }
    }
  }

  const fieldIds = collectFieldIds(columns, extraFieldIds);
  const rows = new Array<GridRowData>(normalizedRowCount);

  for (let dataIndex = 0; dataIndex < normalizedRowCount; dataIndex += 1) {
    const baseRow = hasGetRow
      ? { ...(dataProvider.getRow?.(dataIndex) ?? buildFallbackRow(dataProvider, dataIndex, fieldIds)) }
      : buildFallbackRow(dataProvider, dataIndex, fieldIds);

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      if (typeof column.valueGetter === 'function') {
        baseRow[column.id] = column.valueGetter(baseRow, column);
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(baseRow, column.id)) {
        baseRow[column.id] = dataProvider.getValue(dataIndex, column.id);
      }
    }

    rows[dataIndex] = baseRow;
  }

  return rows;
}

async function snapshotRowsAsync(
  rowCount: number,
  dataProvider: DataProvider,
  columns: ColumnDef[],
  extraFieldIds?: string[],
  context?: WorkerPayloadSerializationContext
): Promise<GridRowData[] | null> {
  const normalizedRowCount = Math.max(0, Math.floor(rowCount));
  if (normalizedRowCount === 0) {
    return [];
  }

  const hasGetRow = typeof dataProvider.getRow === 'function';
  if (!hasGetRow) {
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      if (typeof columns[columnIndex].valueGetter === 'function') {
        return null;
      }
    }
  }

  if (isSerializationCanceled(context)) {
    return null;
  }

  const processedCounter: WorkerSerializationProgressCounter = { value: 0 };
  const yieldInterval = normalizeSerializationYieldInterval(context?.yieldInterval);
  const fieldIds = collectFieldIds(columns, extraFieldIds);
  const rows = new Array<GridRowData>(normalizedRowCount);

  for (let dataIndex = 0; dataIndex < normalizedRowCount; dataIndex += 1) {
    const baseRow = hasGetRow
      ? { ...(dataProvider.getRow?.(dataIndex) ?? buildFallbackRow(dataProvider, dataIndex, fieldIds)) }
      : buildFallbackRow(dataProvider, dataIndex, fieldIds);

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      if (typeof column.valueGetter === 'function') {
        baseRow[column.id] = column.valueGetter(baseRow, column);
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(baseRow, column.id)) {
        baseRow[column.id] = dataProvider.getValue(dataIndex, column.id);
      }
    }

    rows[dataIndex] = baseRow;
    if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
      return null;
    }
  }

  return rows;
}

function usesValueGetter(columns: ColumnDef[]): boolean {
  for (let index = 0; index < columns.length; index += 1) {
    if (typeof columns[index].valueGetter === 'function') {
      return true;
    }
  }
  return false;
}

function normalizeComparisonResult(value: number): number {
  if (!Number.isFinite(value) || value === 0) {
    return 0;
  }

  return value < 0 ? -1 : 1;
}

function createComparatorRankProjection(
  values: WorkerColumnValuesPayload,
  comparator: NonNullable<ColumnDef['comparator']>
): number[] {
  const rowCount = getWorkerColumnValuesLength(values);
  if (rowCount === 0) {
    return [];
  }

  const sortedIndexes = new Array<number>(rowCount);
  for (let index = 0; index < rowCount; index += 1) {
    sortedIndexes[index] = index;
  }

  sortedIndexes.sort((leftIndex, rightIndex) => {
    const compared = normalizeComparisonResult(
      comparator(resolveWorkerColumnValue(values, leftIndex), resolveWorkerColumnValue(values, rightIndex))
    );
    if (compared !== 0) {
      return compared;
    }

    return leftIndex < rightIndex ? -1 : leftIndex > rightIndex ? 1 : 0;
  });

  const ranks = new Array<number>(rowCount);
  let currentRank = 0;
  ranks[sortedIndexes[0]] = currentRank;

  for (let index = 1; index < sortedIndexes.length; index += 1) {
    const previousIndex = sortedIndexes[index - 1];
    const currentIndex = sortedIndexes[index];
    if (
      normalizeComparisonResult(
        comparator(resolveWorkerColumnValue(values, previousIndex), resolveWorkerColumnValue(values, currentIndex))
      ) !== 0
    ) {
      currentRank += 1;
    }
    ranks[currentIndex] = currentRank;
  }

  return ranks;
}

async function createComparatorRankProjectionAsync(
  values: WorkerColumnValuesPayload,
  comparator: NonNullable<ColumnDef['comparator']>,
  context?: WorkerPayloadSerializationContext
): Promise<number[] | null> {
  const rowCount = getWorkerColumnValuesLength(values);
  if (rowCount === 0) {
    return [];
  }

  if (isSerializationCanceled(context)) {
    return null;
  }

  let sortedIndexes = new Array<number>(rowCount);
  let scratch = new Array<number>(rowCount);
  const processedCounter: WorkerSerializationProgressCounter = { value: 0 };
  const yieldInterval = normalizeSerializationYieldInterval(context?.yieldInterval);

  for (let index = 0; index < rowCount; index += 1) {
    sortedIndexes[index] = index;
    if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
      return null;
    }
  }

  for (let width = 1; width < rowCount; width *= 2) {
    for (let left = 0; left < rowCount; left += width * 2) {
      const middle = Math.min(left + width, rowCount);
      const right = Math.min(left + width * 2, rowCount);
      let leftIndex = left;
      let rightIndex = middle;
      let targetIndex = left;

      while (leftIndex < middle && rightIndex < right) {
        const leftRowIndex = sortedIndexes[leftIndex];
        const rightRowIndex = sortedIndexes[rightIndex];
        const compared = normalizeComparisonResult(
          comparator(resolveWorkerColumnValue(values, leftRowIndex), resolveWorkerColumnValue(values, rightRowIndex))
        );
        const shouldUseLeft =
          compared < 0 || (compared === 0 && (leftRowIndex < rightRowIndex || leftRowIndex === rightRowIndex));

        scratch[targetIndex] = shouldUseLeft ? leftRowIndex : rightRowIndex;
        if (shouldUseLeft) {
          leftIndex += 1;
        } else {
          rightIndex += 1;
        }
        targetIndex += 1;

        if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
          return null;
        }
      }

      while (leftIndex < middle) {
        scratch[targetIndex] = sortedIndexes[leftIndex];
        leftIndex += 1;
        targetIndex += 1;

        if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
          return null;
        }
      }

      while (rightIndex < right) {
        scratch[targetIndex] = sortedIndexes[rightIndex];
        rightIndex += 1;
        targetIndex += 1;

        if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
          return null;
        }
      }
    }

    const nextSortedIndexes = scratch;
    scratch = sortedIndexes;
    sortedIndexes = nextSortedIndexes;
  }

  const ranks = new Array<number>(rowCount);
  let currentRank = 0;
  ranks[sortedIndexes[0]] = currentRank;

  for (let index = 1; index < sortedIndexes.length; index += 1) {
    const previousIndex = sortedIndexes[index - 1];
    const currentIndex = sortedIndexes[index];
    if (
      normalizeComparisonResult(
        comparator(resolveWorkerColumnValue(values, previousIndex), resolveWorkerColumnValue(values, currentIndex))
      ) !== 0
    ) {
      currentRank += 1;
    }
    ranks[currentIndex] = currentRank;

    if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
      return null;
    }
  }

  return ranks;
}

function collectSortColumnIds(request: SortExecutionRequest): string[] {
  const columnIds: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < request.sortModel.length; index += 1) {
    const columnId = request.sortModel[index]?.columnId;
    if (typeof columnId !== 'string' || columnId.length === 0 || seen.has(columnId)) {
      continue;
    }
    seen.add(columnId);
    columnIds.push(columnId);
  }
  return columnIds;
}

function collectFilterColumnIds(
  filterModel: GridFilterModel,
  advancedFilterModel: AdvancedFilterModel | null | undefined,
  columns: ColumnDef[]
): string[] {
  const knownColumnIds = new Set<string>();
  for (let index = 0; index < columns.length; index += 1) {
    knownColumnIds.add(columns[index].id);
  }

  const columnIds: string[] = [];
  const seen = new Set<string>();
  const rawKeys = Object.keys(filterModel);
  for (let index = 0; index < rawKeys.length; index += 1) {
    const columnId = rawKeys[index];
    if (!knownColumnIds.has(columnId) || filterModel[columnId] === undefined || seen.has(columnId)) {
      continue;
    }
    seen.add(columnId);
    columnIds.push(columnId);
  }

  visitAdvancedFilterRules(advancedFilterModel?.rules, (rule) => {
    const columnId = rule.columnId;
    if (typeof columnId !== 'string' || columnId.length === 0 || !knownColumnIds.has(columnId) || seen.has(columnId)) {
      return;
    }
    seen.add(columnId);
    columnIds.push(columnId);
  });

  return columnIds;
}

function collectGroupColumnIds(
  request: GroupExecutionRequest,
  aggregations: GroupAggregationDef[] = request.aggregations
): string[] {
  const columnIds: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < request.groupModel.length; index += 1) {
    const columnId = request.groupModel[index]?.columnId;
    if (typeof columnId !== 'string' || columnId.length === 0 || seen.has(columnId)) {
      continue;
    }
    seen.add(columnId);
    columnIds.push(columnId);
  }

  for (let index = 0; index < aggregations.length; index += 1) {
    const columnId = aggregations[index]?.columnId;
    if (typeof columnId !== 'string' || columnId.length === 0 || seen.has(columnId)) {
      continue;
    }
    seen.add(columnId);
    columnIds.push(columnId);
  }

  return columnIds;
}

function collectPivotColumnIds(
  request: PivotExecutionRequest,
  pivotValues: Array<Pick<PivotValueDef, 'columnId'>> = request.pivotValues
): string[] {
  const columnIds: string[] = [];
  const seen = new Set<string>();
  const collect = (columnId: string | undefined): void => {
    if (typeof columnId !== 'string' || columnId.length === 0 || seen.has(columnId)) {
      return;
    }
    seen.add(columnId);
    columnIds.push(columnId);
  };

  for (let index = 0; index < request.rowGroupModel.length; index += 1) {
    collect(request.rowGroupModel[index]?.columnId);
  }
  for (let index = 0; index < request.pivotModel.length; index += 1) {
    collect(request.pivotModel[index]?.columnId);
  }
  for (let index = 0; index < pivotValues.length; index += 1) {
    collect(pivotValues[index]?.columnId);
  }

  return columnIds;
}

function collectTreeColumnIds(treeData: TreeDataOptions | undefined): string[] {
  const columnIds: string[] = [];
  const seen = new Set<string>();
  const collect = (columnId: string | undefined, fallback: string): void => {
    const resolved = typeof columnId === 'string' && columnId.trim().length > 0 ? columnId.trim() : fallback;
    if (seen.has(resolved)) {
      return;
    }
    seen.add(resolved);
    columnIds.push(resolved);
  };

  collect(treeData?.idField, 'id');
  collect(treeData?.parentIdField, 'parentId');
  collect(treeData?.hasChildrenField, 'hasChildren');
  return columnIds;
}

export function serializeSortExecutionRequest(
  request: SortExecutionRequest,
  context?: WorkerPayloadSerializationContext
): SortWorkerPayload | null {
  const sortedColumnIds = new Set<string>();
  for (let index = 0; index < request.sortModel.length; index += 1) {
    sortedColumnIds.add(request.sortModel[index].columnId);
  }

  const sortColumnIds = collectSortColumnIds(request);
  const sortColumns = collectColumnsByIds(request.columns, sortColumnIds);
  const projectionCacheSchemaColumns = collectProjectionCacheSchemaColumns(
    request.columns,
    sortColumns,
    collectProjectedValueGetterEvaluationColumns(request.columns, sortColumns)
  );
  const projectionCacheKey =
    context?.projectionCache && (usesValueGetter(sortColumns) || sortColumns.some((column) => typeof column.comparator === 'function'))
      ? createWorkerProjectionCacheKey({
          rowCount: request.rowCount,
          allColumns: projectionCacheSchemaColumns,
          projectedColumns: sortColumns
        })
      : null;
  const hasComparatorProjection = sortColumns.some((column) => typeof column.comparator === 'function');
  const columnValuesById = usesValueGetter(sortColumns) || hasComparatorProjection
    ? snapshotProjectedColumnValues(request.rowCount, request.dataProvider, request.columns, sortColumns, undefined, context)
    : snapshotColumnValues(request.rowCount, request.dataProvider, sortColumnIds);
  if (columnValuesById) {
    const nextColumnValuesById: WorkerColumnValueMap = hasComparatorProjection ? { ...columnValuesById } : columnValuesById;
    const typeOverrides: Record<string, WorkerColumnSnapshot['type'] | undefined> = {};
    for (let index = 0; index < sortColumns.length; index += 1) {
      const column = sortColumns[index];
      if (typeof column.comparator !== 'function') {
        continue;
      }

      const values = columnValuesById[column.id];
      if (!values || getWorkerColumnValuesLength(values) !== request.rowCount) {
        return null;
      }

      const comparatorCacheKey =
        projectionCacheKey && context?.projectionCache
          ? createWorkerComparatorCacheKey(projectionCacheKey, column.id)
          : null;
      const cachedRanks =
        comparatorCacheKey && context?.projectionCache ? context.projectionCache.getComparatorRanks(comparatorCacheKey) : undefined;
      const ranks = cachedRanks ?? createComparatorRankProjection(values, column.comparator);
      if (!cachedRanks && comparatorCacheKey && context?.projectionCache) {
        context.projectionCache.setComparatorRanks(comparatorCacheKey, ranks);
      }

      nextColumnValuesById[column.id] = ranks;
      typeOverrides[column.id] = 'number';
    }

    return {
      kind: 'columnar',
      rowCount: request.rowCount,
      columns: toWorkerColumns(sortColumns, typeOverrides),
      sortModel: request.sortModel.map((item) => ({
        columnId: item.columnId,
        direction: item.direction === 'desc' ? 'desc' : 'asc'
      })),
      columnValuesById: nextColumnValuesById
    };
  }

  const rows = snapshotRows(request.rowCount, request.dataProvider, request.columns);
  if (!rows) {
    return null;
  }

  return {
    rows,
    columns: toWorkerColumns(request.columns),
    sortModel: request.sortModel.map((item) => ({
      columnId: item.columnId,
      direction: item.direction === 'desc' ? 'desc' : 'asc'
    }))
  };
}

export function serializeFilterExecutionRequest(
  request: FilterExecutionRequest,
  context?: WorkerPayloadSerializationContext
): FilterWorkerPayload | null {
  const filterColumnIds = collectFilterColumnIds(request.filterModel, request.advancedFilterModel, request.columns);
  const filterColumns = collectColumnsByIds(request.columns, filterColumnIds);
  const columnValuesById = usesValueGetter(filterColumns)
    ? snapshotProjectedColumnValues(request.rowCount, request.dataProvider, request.columns, filterColumns, undefined, context)
    : snapshotColumnValues(request.rowCount, request.dataProvider, filterColumnIds);
  if (columnValuesById) {
    return {
      kind: 'columnar',
      rowCount: request.rowCount,
      columns: toWorkerColumns(filterColumns),
      filterModel: { ...request.filterModel },
      advancedFilterModel: cloneAdvancedFilterModel(request.advancedFilterModel),
      sourceOrder: cloneSourceOrder(request.sourceOrder),
      columnValuesById
    };
  }

  const rows = snapshotRows(request.rowCount, request.dataProvider, request.columns);
  if (!rows) {
    return null;
  }

  return {
    rows,
    columns: toWorkerColumns(request.columns),
    filterModel: { ...request.filterModel },
    advancedFilterModel: cloneAdvancedFilterModel(request.advancedFilterModel),
    sourceOrder: cloneSourceOrder(request.sourceOrder)
  };
}

export function serializeGroupExecutionRequest(
  request: GroupExecutionRequest,
  context?: WorkerPayloadSerializationContext
): GroupWorkerPayload | null {
  const builtinAggregations = request.aggregations.filter((item) => typeof item.reducer !== 'function');
  const includeLeafDataIndexes = builtinAggregations.length !== request.aggregations.length;

  const groupColumnIds = collectGroupColumnIds(request, builtinAggregations);
  const groupColumns = collectColumnsByIds(request.columns, groupColumnIds);
  const columnValuesById = usesValueGetter(groupColumns)
    ? snapshotProjectedColumnValues(request.rowCount, request.dataProvider, request.columns, groupColumns, undefined, context)
    : snapshotColumnValues(request.rowCount, request.dataProvider, groupColumnIds);
  if (columnValuesById) {
    return {
      kind: 'columnar',
      rowCount: request.rowCount,
      columns: toWorkerColumns(groupColumns),
      groupModel: request.groupModel.map((item) => ({ columnId: item.columnId })),
      aggregations: builtinAggregations.map((item) => ({
        columnId: item.columnId,
        type: item.type
      })),
      sourceOrder: cloneSourceOrder(request.sourceOrder),
      groupExpansionState: request.groupExpansionState ? { ...request.groupExpansionState } : undefined,
      defaultExpanded: request.defaultExpanded === true,
      columnValuesById,
      includeLeafDataIndexes
    };
  }

  const rows = snapshotRows(request.rowCount, request.dataProvider, request.columns);
  if (!rows) {
    return null;
  }

  return {
    rows,
    columns: toWorkerColumns(request.columns),
    groupModel: request.groupModel.map((item) => ({ columnId: item.columnId })),
    aggregations: builtinAggregations.map((item) => ({
      columnId: item.columnId,
      type: item.type
    })),
    sourceOrder: cloneSourceOrder(request.sourceOrder),
    groupExpansionState: request.groupExpansionState ? { ...request.groupExpansionState } : undefined,
    defaultExpanded: request.defaultExpanded === true,
    includeLeafDataIndexes
  };
}

export function serializePivotExecutionRequest(
  request: PivotExecutionRequest,
  context?: WorkerPayloadSerializationContext
): PivotWorkerPayload | null {
  const sanitizedPivotValues = request.pivotValues.map((item) => ({
    columnId: item.columnId,
    type: item.type
  }));
  const customValueColumnIds = request.pivotValues
    .filter((item) => typeof item.reducer === 'function')
    .map((item) => item.columnId);

  const pivotColumnIds = collectPivotColumnIds(request);
  const pivotColumns = collectColumnsByIds(request.columns, pivotColumnIds);
  const columnValuesById = usesValueGetter(pivotColumns)
    ? snapshotProjectedColumnValues(request.rowCount, request.dataProvider, request.columns, pivotColumns, undefined, context)
    : snapshotColumnValues(request.rowCount, request.dataProvider, pivotColumnIds);
  if (columnValuesById) {
    return {
      kind: 'columnar',
      rowCount: request.rowCount,
      columns: toWorkerColumns(pivotColumns),
      sourceOrder: cloneSourceOrder(request.sourceOrder),
      rowGroupModel: request.rowGroupModel.map((item) => ({ columnId: item.columnId })),
      pivotModel: request.pivotModel.map((item) => ({ columnId: item.columnId })),
      pivotValues: sanitizedPivotValues,
      columnValuesById,
      customValueColumnIds: customValueColumnIds.length > 0 ? customValueColumnIds.slice() : undefined
    };
  }

  const rows = snapshotRows(request.rowCount, request.dataProvider, pivotColumns);
  if (!rows) {
    return null;
  }

  return {
    rows,
    columns: toWorkerColumns(request.columns),
    sourceOrder: cloneSourceOrder(request.sourceOrder),
    rowGroupModel: request.rowGroupModel.map((item) => ({ columnId: item.columnId })),
    pivotModel: request.pivotModel.map((item) => ({ columnId: item.columnId })),
    pivotValues: sanitizedPivotValues,
    customValueColumnIds: customValueColumnIds.length > 0 ? customValueColumnIds.slice() : undefined
  };
}

export function serializeTreeExecutionRequest(request: TreeExecutionRequest): TreeWorkerPayload | null {
  const treeData = request.treeData ?? {};
  const treeColumnIds = collectTreeColumnIds(treeData);

  return {
    kind: 'compact',
    rowCount: request.rowCount,
    sourceOrder: cloneSourceOrder(request.sourceOrder),
    treeData: cloneTreeDataSnapshot({
      enabled: treeData.enabled === true,
      mode: treeData.mode === 'server' ? 'server' : 'client',
      idField: treeData.idField,
      parentIdField: treeData.parentIdField,
      hasChildrenField: treeData.hasChildrenField,
      treeColumnId: treeData.treeColumnId,
      defaultExpanded: treeData.defaultExpanded === true,
      rootParentValue: treeData.rootParentValue === undefined ? null : treeData.rootParentValue
    }),
    treeExpansionState: request.treeExpansionState ? { ...request.treeExpansionState } : undefined,
    columnValuesById: snapshotColumnValues(request.rowCount, request.dataProvider, treeColumnIds),
    lazyChildrenBatches: request.lazyChildrenBatches
      ? request.lazyChildrenBatches.map((batch) => ({
          parentNodeKey: batch.parentNodeKey,
          rows: batch.rows.map((row, rowIndex) => compactTreeLazyRow(row, treeData, batch.parentNodeKey, rowIndex))
        }))
      : undefined
  };
}

export async function serializeSortExecutionRequestAsync(
  request: SortExecutionRequest,
  context?: WorkerPayloadSerializationContext
): Promise<SortWorkerPayload | null> {
  const sortColumnIds = collectSortColumnIds(request);
  const sortColumns = collectColumnsByIds(request.columns, sortColumnIds);
  const projectionCacheSchemaColumns = collectProjectionCacheSchemaColumns(
    request.columns,
    sortColumns,
    collectProjectedValueGetterEvaluationColumns(request.columns, sortColumns)
  );
  const projectionCacheKey =
    context?.projectionCache && (usesValueGetter(sortColumns) || sortColumns.some((column) => typeof column.comparator === 'function'))
      ? createWorkerProjectionCacheKey({
          rowCount: request.rowCount,
          allColumns: projectionCacheSchemaColumns,
          projectedColumns: sortColumns
        })
      : null;
  const hasComparatorProjection = sortColumns.some((column) => typeof column.comparator === 'function');
  const rawColumnValuesById = usesValueGetter(sortColumns) || hasComparatorProjection
    ? await snapshotProjectedColumnValuesAsync(request.rowCount, request.dataProvider, request.columns, sortColumns, undefined, context)
    : await snapshotEncodedColumnValuesAsync(request.rowCount, request.dataProvider, sortColumns, context);
  if (rawColumnValuesById) {
    const columnValuesById = rawColumnValuesById;
    const nextColumnValuesById: WorkerColumnValueMap = hasComparatorProjection ? { ...columnValuesById } : columnValuesById;
    const typeOverrides: Record<string, WorkerColumnSnapshot['type'] | undefined> = {};
    for (let index = 0; index < sortColumns.length; index += 1) {
      const column = sortColumns[index];
      if (typeof column.comparator !== 'function') {
        continue;
      }

      const values = columnValuesById[column.id];
      if (!values || getWorkerColumnValuesLength(values) !== request.rowCount) {
        return null;
      }

      const comparatorCacheKey =
        projectionCacheKey && context?.projectionCache
          ? createWorkerComparatorCacheKey(projectionCacheKey, column.id)
          : null;
      const cachedRanks =
        comparatorCacheKey && context?.projectionCache ? context.projectionCache.getComparatorRanks(comparatorCacheKey) : undefined;
      const ranks = cachedRanks ?? (await createComparatorRankProjectionAsync(values, column.comparator, context));
      if (!ranks) {
        return null;
      }

      if (!cachedRanks && comparatorCacheKey && context?.projectionCache) {
        context.projectionCache.setComparatorRanks(comparatorCacheKey, ranks);
      }

      nextColumnValuesById[column.id] = ranks;
      typeOverrides[column.id] = 'number';
    }

    return {
      kind: 'columnar',
      rowCount: request.rowCount,
      columns: toWorkerColumns(sortColumns, typeOverrides),
      sortModel: request.sortModel.map((item) => ({
        columnId: item.columnId,
        direction: item.direction === 'desc' ? 'desc' : 'asc'
      })),
      columnValuesById: nextColumnValuesById
    };
  }

  const rows = await snapshotRowsAsync(request.rowCount, request.dataProvider, request.columns, undefined, context);
  if (!rows) {
    return null;
  }

  return {
    rows,
    columns: toWorkerColumns(request.columns),
    sortModel: request.sortModel.map((item) => ({
      columnId: item.columnId,
      direction: item.direction === 'desc' ? 'desc' : 'asc'
    }))
  };
}

export async function serializeFilterExecutionRequestAsync(
  request: FilterExecutionRequest,
  context?: WorkerPayloadSerializationContext
): Promise<FilterWorkerPayload | null> {
  const filterColumnIds = collectFilterColumnIds(request.filterModel, request.advancedFilterModel, request.columns);
  const filterColumns = collectColumnsByIds(request.columns, filterColumnIds);
  const rawColumnValuesById = usesValueGetter(filterColumns)
    ? await snapshotProjectedColumnValuesAsync(request.rowCount, request.dataProvider, request.columns, filterColumns, undefined, context)
    : await snapshotEncodedColumnValuesAsync(request.rowCount, request.dataProvider, filterColumns, context);
  const columnValuesById = rawColumnValuesById;
  if (columnValuesById) {
    return {
      kind: 'columnar',
      rowCount: request.rowCount,
      columns: toWorkerColumns(filterColumns),
      filterModel: { ...request.filterModel },
      advancedFilterModel: cloneAdvancedFilterModel(request.advancedFilterModel),
      sourceOrder: cloneSourceOrder(request.sourceOrder),
      columnValuesById
    };
  }

  const rows = await snapshotRowsAsync(request.rowCount, request.dataProvider, request.columns, undefined, context);
  if (!rows) {
    return null;
  }

  return {
    rows,
    columns: toWorkerColumns(request.columns),
    filterModel: { ...request.filterModel },
    advancedFilterModel: cloneAdvancedFilterModel(request.advancedFilterModel),
    sourceOrder: cloneSourceOrder(request.sourceOrder)
  };
}

export async function serializeGroupExecutionRequestAsync(
  request: GroupExecutionRequest,
  context?: WorkerPayloadSerializationContext
): Promise<GroupWorkerPayload | null> {
  const builtinAggregations = request.aggregations.filter((item) => typeof item.reducer !== 'function');
  const includeLeafDataIndexes = builtinAggregations.length !== request.aggregations.length;
  const groupColumnIds = collectGroupColumnIds(request, builtinAggregations);
  const groupColumns = collectColumnsByIds(request.columns, groupColumnIds);
  const rawColumnValuesById = usesValueGetter(groupColumns)
    ? await snapshotProjectedColumnValuesAsync(request.rowCount, request.dataProvider, request.columns, groupColumns, undefined, context)
    : await snapshotEncodedColumnValuesAsync(request.rowCount, request.dataProvider, groupColumns, context);
  const columnValuesById = rawColumnValuesById;
  if (columnValuesById) {
    return {
      kind: 'columnar',
      rowCount: request.rowCount,
      columns: toWorkerColumns(groupColumns),
      groupModel: request.groupModel.map((item) => ({ columnId: item.columnId })),
      aggregations: builtinAggregations.map((item) => ({
        columnId: item.columnId,
        type: item.type
      })),
      sourceOrder: cloneSourceOrder(request.sourceOrder),
      groupExpansionState: request.groupExpansionState ? { ...request.groupExpansionState } : undefined,
      defaultExpanded: request.defaultExpanded === true,
      columnValuesById,
      includeLeafDataIndexes
    };
  }

  const rows = await snapshotRowsAsync(request.rowCount, request.dataProvider, request.columns, undefined, context);
  if (!rows) {
    return null;
  }

  return {
    rows,
    columns: toWorkerColumns(request.columns),
    groupModel: request.groupModel.map((item) => ({ columnId: item.columnId })),
    aggregations: builtinAggregations.map((item) => ({
      columnId: item.columnId,
      type: item.type
    })),
    sourceOrder: cloneSourceOrder(request.sourceOrder),
    groupExpansionState: request.groupExpansionState ? { ...request.groupExpansionState } : undefined,
    defaultExpanded: request.defaultExpanded === true,
    includeLeafDataIndexes
  };
}

export async function serializePivotExecutionRequestAsync(
  request: PivotExecutionRequest,
  context?: WorkerPayloadSerializationContext
): Promise<PivotWorkerPayload | null> {
  const sanitizedPivotValues = request.pivotValues.map((item) => ({
    columnId: item.columnId,
    type: item.type
  }));
  const customValueColumnIds = request.pivotValues
    .filter((item) => typeof item.reducer === 'function')
    .map((item) => item.columnId);
  const pivotColumnIds = collectPivotColumnIds(request);
  const pivotColumns = collectColumnsByIds(request.columns, pivotColumnIds);
  const rawColumnValuesById = usesValueGetter(pivotColumns)
    ? await snapshotProjectedColumnValuesAsync(request.rowCount, request.dataProvider, request.columns, pivotColumns, undefined, context)
    : await snapshotEncodedColumnValuesAsync(request.rowCount, request.dataProvider, pivotColumns, context);
  const columnValuesById = rawColumnValuesById;
  if (columnValuesById) {
    return {
      kind: 'columnar',
      rowCount: request.rowCount,
      columns: toWorkerColumns(pivotColumns),
      sourceOrder: cloneSourceOrder(request.sourceOrder),
      rowGroupModel: request.rowGroupModel.map((item) => ({ columnId: item.columnId })),
      pivotModel: request.pivotModel.map((item) => ({ columnId: item.columnId })),
      pivotValues: sanitizedPivotValues,
      columnValuesById,
      customValueColumnIds: customValueColumnIds.length > 0 ? customValueColumnIds.slice() : undefined
    };
  }

  const rows = await snapshotRowsAsync(request.rowCount, request.dataProvider, pivotColumns, undefined, context);
  if (!rows) {
    return null;
  }

  return {
    rows,
    columns: toWorkerColumns(request.columns),
    sourceOrder: cloneSourceOrder(request.sourceOrder),
    rowGroupModel: request.rowGroupModel.map((item) => ({ columnId: item.columnId })),
    pivotModel: request.pivotModel.map((item) => ({ columnId: item.columnId })),
    pivotValues: sanitizedPivotValues,
    customValueColumnIds: customValueColumnIds.length > 0 ? customValueColumnIds.slice() : undefined
  };
}

export async function serializeTreeExecutionRequestAsync(
  request: TreeExecutionRequest,
  context?: WorkerPayloadSerializationContext
): Promise<TreeWorkerPayload | null> {
  const treeData = request.treeData ?? {};
  const treeColumnIds = collectTreeColumnIds(treeData);
  const columnValuesById = await snapshotColumnValuesAsync(request.rowCount, request.dataProvider, treeColumnIds, context);
  if (!columnValuesById) {
    return null;
  }

  let lazyChildrenBatches: TreeLazyChildrenBatch[] | undefined;
  if (request.lazyChildrenBatches) {
    lazyChildrenBatches = new Array<TreeLazyChildrenBatch>(request.lazyChildrenBatches.length);
    const processedCounter: WorkerSerializationProgressCounter = { value: 0 };
    const yieldInterval = normalizeSerializationYieldInterval(context?.yieldInterval);
    for (let batchIndex = 0; batchIndex < request.lazyChildrenBatches.length; batchIndex += 1) {
      const batch = request.lazyChildrenBatches[batchIndex];
      const rows = new Array<GridRowData>(batch.rows.length);
      for (let rowIndex = 0; rowIndex < batch.rows.length; rowIndex += 1) {
        rows[rowIndex] = compactTreeLazyRow(batch.rows[rowIndex], treeData, batch.parentNodeKey, rowIndex);
        if (shouldYieldSerialization(processedCounter, yieldInterval) && (await yieldSerialization(context))) {
          return null;
        }
      }

      lazyChildrenBatches[batchIndex] = {
        parentNodeKey: batch.parentNodeKey,
        rows
      };
    }
  }

  return {
    kind: 'compact',
    rowCount: request.rowCount,
    sourceOrder: cloneSourceOrder(request.sourceOrder),
    treeData: cloneTreeDataSnapshot({
      enabled: treeData.enabled === true,
      mode: treeData.mode === 'server' ? 'server' : 'client',
      idField: treeData.idField,
      parentIdField: treeData.parentIdField,
      hasChildrenField: treeData.hasChildrenField,
      treeColumnId: treeData.treeColumnId,
      defaultExpanded: treeData.defaultExpanded === true,
      rootParentValue: treeData.rootParentValue === undefined ? null : treeData.rootParentValue
    }),
    treeExpansionState: request.treeExpansionState ? { ...request.treeExpansionState } : undefined,
    columnValuesById,
    lazyChildrenBatches
  };
}

export function createSortExecutionRequest(opId: string, payload: SortWorkerPayload): SortExecutionRequest {
  if (isSortColumnarPayload(payload)) {
    return {
      opId,
      rowCount: payload.rowCount,
      sortModel: payload.sortModel,
      columns: toExecutorColumns(payload.columns),
      dataProvider: createColumnValueSnapshotDataProvider(payload.rowCount, payload.columnValuesById)
    };
  }

  return {
    opId,
    rowCount: payload.rows.length,
    sortModel: payload.sortModel,
    columns: toExecutorColumns(payload.columns),
    dataProvider: createSnapshotDataProvider(payload.rows)
  };
}

export function createFilterExecutionRequest(opId: string, payload: FilterWorkerPayload): FilterExecutionRequest {
  if (isFilterColumnarPayload(payload)) {
    return {
      opId,
      rowCount: payload.rowCount,
      filterModel: payload.filterModel,
      advancedFilterModel: payload.advancedFilterModel ?? null,
      columns: toExecutorColumns(payload.columns),
      dataProvider: createColumnValueSnapshotDataProvider(payload.rowCount, payload.columnValuesById),
      sourceOrder: payload.sourceOrder
    };
  }

  return {
    opId,
    rowCount: payload.rows.length,
    filterModel: payload.filterModel,
    advancedFilterModel: payload.advancedFilterModel ?? null,
    columns: toExecutorColumns(payload.columns),
    dataProvider: createSnapshotDataProvider(payload.rows),
    sourceOrder: payload.sourceOrder
  };
}

export function createGroupExecutionRequest(opId: string, payload: GroupWorkerPayload): GroupExecutionRequest {
  if (isGroupColumnarPayload(payload)) {
    return {
      opId,
      rowCount: payload.rowCount,
      groupModel: payload.groupModel,
      aggregations: payload.aggregations,
      columns: toExecutorColumns(payload.columns),
      dataProvider: createColumnValueSnapshotDataProvider(payload.rowCount, payload.columnValuesById),
      sourceOrder: payload.sourceOrder,
      groupExpansionState: payload.groupExpansionState,
      defaultExpanded: payload.defaultExpanded,
      includeLeafDataIndexes: payload.includeLeafDataIndexes
    };
  }

  return {
    opId,
    rowCount: payload.rows.length,
    groupModel: payload.groupModel,
    aggregations: payload.aggregations,
    columns: toExecutorColumns(payload.columns),
    dataProvider: createSnapshotDataProvider(payload.rows),
    sourceOrder: payload.sourceOrder,
    groupExpansionState: payload.groupExpansionState,
    defaultExpanded: payload.defaultExpanded,
    includeLeafDataIndexes: payload.includeLeafDataIndexes
  };
}

export function createPivotExecutionRequest(opId: string, payload: PivotWorkerPayload): PivotExecutionRequest {
  if (isPivotColumnarPayload(payload)) {
    return {
      opId,
      rowCount: payload.rowCount,
      columns: toExecutorColumns(payload.columns),
      dataProvider: createColumnValueSnapshotDataProvider(payload.rowCount, payload.columnValuesById),
      sourceOrder: payload.sourceOrder,
      rowGroupModel: payload.rowGroupModel,
      pivotModel: payload.pivotModel,
      pivotValues: payload.pivotValues,
      customValueColumnIds: payload.customValueColumnIds
    };
  }

  return {
    opId,
    rowCount: payload.rows.length,
    columns: toExecutorColumns(payload.columns),
    dataProvider: createSnapshotDataProvider(payload.rows),
    sourceOrder: payload.sourceOrder,
    rowGroupModel: payload.rowGroupModel,
    pivotModel: payload.pivotModel,
    pivotValues: payload.pivotValues,
    customValueColumnIds: payload.customValueColumnIds
  };
}

export function createTreeExecutionRequest(opId: string, payload: TreeWorkerPayload): TreeExecutionRequest {
  if (isTreeCompactPayload(payload)) {
    return {
      opId,
      rowCount: payload.rowCount,
      sourceOrder: payload.sourceOrder,
      dataProvider: createColumnValueSnapshotDataProvider(payload.rowCount, payload.columnValuesById),
      treeData: payload.treeData,
      treeExpansionState: payload.treeExpansionState,
      lazyChildrenBatches: payload.lazyChildrenBatches
    };
  }

  return {
    opId,
    rowCount: payload.rows.length,
    sourceOrder: payload.sourceOrder,
    dataProvider: createSnapshotDataProvider(payload.rows),
    treeData: payload.treeData,
    treeExpansionState: payload.treeExpansionState,
    lazyChildrenBatches: payload.lazyChildrenBatches
  };
}
