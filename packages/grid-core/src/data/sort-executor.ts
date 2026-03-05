import type { ColumnDef } from '../core/grid-options';
import type { DataProvider, GridRowData } from './data-provider';
import type { SortModelItem } from './remote-data-provider';
import {
  createWorkerCanceledResponse,
  createWorkerErrorResponse,
  createWorkerOkResponse,
  type WorkerResponseMessage
} from './worker-protocol';

const DEFAULT_YIELD_INTERVAL = 65_536;

type SortDirectionSign = 1 | -1;

interface SortColumnDescriptor {
  model: SortModelItem;
  column: ColumnDef;
  directionSign: SortDirectionSign;
}

interface PreparedSortColumn {
  descriptor: SortColumnDescriptor;
  values: unknown[];
}

export interface SortExecutionRequest {
  opId: string;
  rowCount: number;
  sortModel: SortModelItem[];
  columns: ColumnDef[];
  dataProvider: DataProvider;
}

export interface SortExecutionContext {
  isCanceled?: () => boolean;
  yieldInterval?: number;
}

export interface SortExecutionResult {
  opId: string;
  mapping: Int32Array;
}

export interface SortExecutor {
  execute(
    request: SortExecutionRequest,
    context?: SortExecutionContext
  ): Promise<WorkerResponseMessage<SortExecutionResult>>;
}

function normalizeYieldInterval(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_YIELD_INTERVAL;
  }

  return Math.max(1_024, Math.floor(value));
}

function toDirectionSign(direction: SortModelItem['direction']): SortDirectionSign {
  return direction === 'desc' ? -1 : 1;
}

function isNil(value: unknown): boolean {
  return value === null || value === undefined;
}

function normalizeDateValue(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }

  return Number.NaN;
}

function defaultValueCompare(columnType: ColumnDef['type'], left: unknown, right: unknown): number {
  const leftNil = isNil(left);
  const rightNil = isNil(right);
  if (leftNil || rightNil) {
    if (leftNil && rightNil) {
      return 0;
    }

    // Nullish values are pushed to the end in ascending order.
    return leftNil ? 1 : -1;
  }

  if (columnType === 'number') {
    const leftNumber = typeof left === 'number' ? left : Number(left);
    const rightNumber = typeof right === 'number' ? right : Number(right);
    const leftFinite = Number.isFinite(leftNumber);
    const rightFinite = Number.isFinite(rightNumber);
    if (!leftFinite || !rightFinite) {
      if (!leftFinite && !rightFinite) {
        return 0;
      }
      return leftFinite ? -1 : 1;
    }

    if (leftNumber === rightNumber) {
      return 0;
    }

    return leftNumber < rightNumber ? -1 : 1;
  }

  if (columnType === 'date') {
    const leftDate = normalizeDateValue(left);
    const rightDate = normalizeDateValue(right);
    const leftFinite = Number.isFinite(leftDate);
    const rightFinite = Number.isFinite(rightDate);
    if (!leftFinite || !rightFinite) {
      if (!leftFinite && !rightFinite) {
        return 0;
      }
      return leftFinite ? -1 : 1;
    }

    if (leftDate === rightDate) {
      return 0;
    }

    return leftDate < rightDate ? -1 : 1;
  }

  if (columnType === 'boolean') {
    const leftBool = Boolean(left);
    const rightBool = Boolean(right);
    if (leftBool === rightBool) {
      return 0;
    }

    return leftBool ? 1 : -1;
  }

  const leftText = String(left);
  const rightText = String(right);
  if (leftText === rightText) {
    return 0;
  }

  return leftText < rightText ? -1 : 1;
}

function buildRowFromProvider(dataProvider: DataProvider, columns: ColumnDef[], dataIndex: number): GridRowData {
  const row: GridRowData = {};
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const column = columns[columnIndex];
    row[column.id] = dataProvider.getValue(dataIndex, column.id);
  }
  return row;
}

function normalizeSortColumns(sortModel: SortModelItem[], columns: ColumnDef[]): SortColumnDescriptor[] {
  if (sortModel.length === 0 || columns.length === 0) {
    return [];
  }

  const byId = new Map<string, ColumnDef>();
  for (let index = 0; index < columns.length; index += 1) {
    byId.set(columns[index].id, columns[index]);
  }

  const result: SortColumnDescriptor[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < sortModel.length; index += 1) {
    const modelItem = sortModel[index];
    if (!modelItem || typeof modelItem.columnId !== 'string' || modelItem.columnId.length === 0) {
      continue;
    }

    if (seen.has(modelItem.columnId)) {
      continue;
    }

    const column = byId.get(modelItem.columnId);
    if (!column) {
      continue;
    }

    seen.add(modelItem.columnId);
    result.push({
      model: {
        columnId: modelItem.columnId,
        direction: modelItem.direction === 'desc' ? 'desc' : 'asc'
      },
      column,
      directionSign: toDirectionSign(modelItem.direction)
    });
  }

  return result;
}

async function yieldControl(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

function shouldCancel(context: SortExecutionContext | undefined): boolean {
  return context?.isCanceled ? context.isCanceled() : false;
}

async function maybeYield(
  processedCounter: { value: number },
  yieldInterval: number,
  context: SortExecutionContext | undefined
): Promise<boolean> {
  if (processedCounter.value < yieldInterval) {
    return false;
  }

  processedCounter.value = 0;
  await yieldControl();
  return shouldCancel(context);
}

async function prepareSortColumns(
  descriptors: SortColumnDescriptor[],
  request: SortExecutionRequest,
  context: SortExecutionContext | undefined,
  yieldInterval: number
): Promise<PreparedSortColumn[] | null> {
  const prepared: PreparedSortColumn[] = descriptors.map((descriptor) => ({
    descriptor,
    values: new Array<unknown>(request.rowCount)
  }));

  const processedCounter = { value: 0 };
  for (let dataIndex = 0; dataIndex < request.rowCount; dataIndex += 1) {
    let rowCache: GridRowData | undefined;

    for (let descriptorIndex = 0; descriptorIndex < prepared.length; descriptorIndex += 1) {
      const item = prepared[descriptorIndex];
      const column = item.descriptor.column;

      if (column.valueGetter) {
        if (!rowCache) {
          rowCache = request.dataProvider.getRow
            ? request.dataProvider.getRow(dataIndex) ?? buildRowFromProvider(request.dataProvider, request.columns, dataIndex)
            : buildRowFromProvider(request.dataProvider, request.columns, dataIndex);
        }

        item.values[dataIndex] = column.valueGetter(rowCache, column);
      } else {
        item.values[dataIndex] = request.dataProvider.getValue(dataIndex, column.id);
      }

      processedCounter.value += 1;
      if (await maybeYield(processedCounter, yieldInterval, context)) {
        return null;
      }
    }
  }

  return prepared;
}

function compareDataIndex(leftIndex: number, rightIndex: number, sortColumns: PreparedSortColumn[]): number {
  for (let index = 0; index < sortColumns.length; index += 1) {
    const sortColumn = sortColumns[index];
    const column = sortColumn.descriptor.column;
    const leftValue = sortColumn.values[leftIndex];
    const rightValue = sortColumn.values[rightIndex];

    const compared = column.comparator
      ? column.comparator(leftValue, rightValue)
      : defaultValueCompare(column.type, leftValue, rightValue);

    if (compared !== 0) {
      return compared * sortColumn.descriptor.directionSign;
    }
  }

  if (leftIndex === rightIndex) {
    return 0;
  }

  return leftIndex < rightIndex ? -1 : 1;
}

async function mergeSortIndices(
  rowCount: number,
  sortColumns: PreparedSortColumn[],
  context: SortExecutionContext | undefined,
  yieldInterval: number
): Promise<Int32Array | null> {
  let source = new Int32Array(rowCount);
  let target = new Int32Array(rowCount);

  for (let index = 0; index < rowCount; index += 1) {
    source[index] = index;
  }

  if (rowCount <= 1 || sortColumns.length === 0) {
    return source;
  }

  const processedCounter = { value: 0 };
  for (let width = 1; width < rowCount; width *= 2) {
    for (let leftStart = 0; leftStart < rowCount; leftStart += width * 2) {
      const mid = Math.min(leftStart + width, rowCount);
      const rightEnd = Math.min(mid + width, rowCount);

      let left = leftStart;
      let right = mid;
      let output = leftStart;

      while (left < mid && right < rightEnd) {
        if (compareDataIndex(source[left], source[right], sortColumns) <= 0) {
          target[output] = source[left];
          left += 1;
        } else {
          target[output] = source[right];
          right += 1;
        }

        output += 1;
        processedCounter.value += 1;
        if (await maybeYield(processedCounter, yieldInterval, context)) {
          return null;
        }
      }

      while (left < mid) {
        target[output] = source[left];
        left += 1;
        output += 1;
        processedCounter.value += 1;
        if (await maybeYield(processedCounter, yieldInterval, context)) {
          return null;
        }
      }

      while (right < rightEnd) {
        target[output] = source[right];
        right += 1;
        output += 1;
        processedCounter.value += 1;
        if (await maybeYield(processedCounter, yieldInterval, context)) {
          return null;
        }
      }
    }

    const previousSource = source;
    source = target;
    target = previousSource;

    if (shouldCancel(context)) {
      return null;
    }

    await yieldControl();
    if (shouldCancel(context)) {
      return null;
    }
  }

  return source;
}

export class CooperativeSortExecutor implements SortExecutor {
  public async execute(
    request: SortExecutionRequest,
    context?: SortExecutionContext
  ): Promise<WorkerResponseMessage<SortExecutionResult>> {
    try {
      if (shouldCancel(context)) {
        return createWorkerCanceledResponse(request.opId);
      }

      const normalizedColumns = normalizeSortColumns(request.sortModel, request.columns);
      if (normalizedColumns.length === 0 || request.rowCount <= 0) {
        const identity = new Int32Array(Math.max(0, request.rowCount));
        for (let index = 0; index < identity.length; index += 1) {
          identity[index] = index;
        }

        return createWorkerOkResponse(request.opId, {
          opId: request.opId,
          mapping: identity
        });
      }

      const yieldInterval = normalizeYieldInterval(context?.yieldInterval);
      const sortColumns = await prepareSortColumns(normalizedColumns, request, context, yieldInterval);
      if (!sortColumns) {
        return createWorkerCanceledResponse(request.opId);
      }

      const mapping = await mergeSortIndices(request.rowCount, sortColumns, context, yieldInterval);
      if (!mapping) {
        return createWorkerCanceledResponse(request.opId);
      }

      return createWorkerOkResponse(request.opId, {
        opId: request.opId,
        mapping
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown sort execution error';
      return createWorkerErrorResponse(request.opId, {
        message,
        code: 'SORT_EXECUTION_ERROR'
      });
    }
  }
}
