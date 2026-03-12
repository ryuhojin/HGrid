import type { ColumnDef, GroupModelItem, PivotModelItem, PivotValueDef } from '../core/grid-options';
import type { DataProvider, GridRowData } from './data-provider';
import {
  createWorkerCanceledResponse,
  createWorkerErrorResponse,
  createWorkerOkResponse,
  type WorkerResponseMessage
} from './worker-protocol';

const DEFAULT_YIELD_INTERVAL = 16_384;
const MAX_PIVOT_COLUMN_KEYS = 512;

type PivotAggregateType = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'custom';

interface RowGroupDescriptor {
  columnId: string;
  column: ColumnDef;
}

interface PivotKeyDescriptor {
  columnId: string;
  column: ColumnDef;
}

interface PivotValueDescriptor {
  columnId: string;
  column: ColumnDef;
  type: PivotAggregateType;
  reducer?: PivotValueDef['reducer'];
}

interface PivotAggregateState {
  count: number;
  numberCount: number;
  sum: number;
  min: unknown;
  max: unknown;
  customValues: unknown[] | null;
}

interface PivotColumnInfo {
  token: string;
  label: string;
}

interface PivotRowAccumulator {
  rowGroupToken: string;
  rowGroupValues: GridRowData;
  aggregates: Map<string, PivotAggregateState>;
  customValueDataIndexes: Map<string, number[]> | null;
}

export interface PivotExecutionRequest {
  opId: string;
  rowCount: number;
  columns: ColumnDef[];
  dataProvider: DataProvider;
  sourceOrder?: Int32Array | number[];
  rowGroupModel: GroupModelItem[];
  pivotModel: PivotModelItem[];
  pivotValues: PivotValueDef[];
  customValueColumnIds?: string[];
}

export interface PivotExecutionContext {
  isCanceled?: () => boolean;
  yieldInterval?: number;
}

export interface PivotExecutionResult {
  opId: string;
  columns: ColumnDef[];
  rows: GridRowData[];
  rowGroupColumnIds: string[];
  pivotColumnCount: number;
  pivotKeyCount: number;
  sourceRowCount: number;
  customValueDataIndexesByCell?: Array<{
    rowKey: string;
    columnId: string;
    valueColumnId: string;
    pivotLabel: string;
    dataIndexes: number[];
  }>;
}

export interface PivotExecutor {
  execute(
    request: PivotExecutionRequest,
    context?: PivotExecutionContext
  ): Promise<WorkerResponseMessage<PivotExecutionResult>>;
}

function normalizeYieldInterval(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_YIELD_INTERVAL;
  }

  return Math.max(1_024, Math.floor(value));
}

function shouldCancel(context: PivotExecutionContext | undefined): boolean {
  return context?.isCanceled ? context.isCanceled() : false;
}

async function yieldControl(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function maybeYield(
  processedCounter: { value: number },
  yieldInterval: number,
  context: PivotExecutionContext | undefined
): Promise<boolean> {
  if (processedCounter.value < yieldInterval) {
    return false;
  }

  processedCounter.value = 0;
  await yieldControl();
  return shouldCancel(context);
}

function findColumnById(columns: ColumnDef[], columnId: string): ColumnDef | null {
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (column.id === columnId) {
      return column;
    }
  }

  return null;
}

function normalizeRowGroupModel(groupModel: GroupModelItem[], columns: ColumnDef[]): RowGroupDescriptor[] {
  if (!Array.isArray(groupModel) || groupModel.length === 0) {
    return [];
  }

  const descriptors: RowGroupDescriptor[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < groupModel.length; index += 1) {
    const item = groupModel[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0 || seen.has(columnId)) {
      continue;
    }

    const column = findColumnById(columns, columnId);
    if (!column) {
      continue;
    }

    seen.add(columnId);
    descriptors.push({ columnId, column });
  }

  return descriptors;
}

function normalizePivotModel(pivotModel: PivotModelItem[], columns: ColumnDef[]): PivotKeyDescriptor[] {
  if (!Array.isArray(pivotModel) || pivotModel.length === 0) {
    return [];
  }

  const descriptors: PivotKeyDescriptor[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < pivotModel.length; index += 1) {
    const item = pivotModel[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0 || seen.has(columnId)) {
      continue;
    }

    const column = findColumnById(columns, columnId);
    if (!column) {
      continue;
    }

    seen.add(columnId);
    descriptors.push({ columnId, column });
  }

  return descriptors;
}

function normalizePivotValues(
  pivotValues: PivotValueDef[],
  columns: ColumnDef[],
  customValueColumnIds?: string[]
): PivotValueDescriptor[] {
  if (!Array.isArray(pivotValues) || pivotValues.length === 0) {
    return [];
  }

  const customValueColumnIdSet = new Set<string>(Array.isArray(customValueColumnIds) ? customValueColumnIds : []);
  const descriptors: PivotValueDescriptor[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < pivotValues.length; index += 1) {
    const item = pivotValues[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0 || seen.has(columnId)) {
      continue;
    }

    const column = findColumnById(columns, columnId);
    if (!column) {
      continue;
    }

    seen.add(columnId);
    descriptors.push({
      columnId,
      column,
      type: customValueColumnIdSet.has(columnId) ? 'custom' : item.type ?? (typeof item.reducer === 'function' ? 'custom' : 'sum'),
      reducer: typeof item.reducer === 'function' ? item.reducer : undefined
    });
  }

  return descriptors;
}

function toToken(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  const valueType = typeof value;
  if (valueType === 'number') {
    if (Number.isNaN(value)) {
      return 'number:NaN';
    }
    return `number:${String(value)}`;
  }

  if (valueType === 'string') {
    return `string:${value}`;
  }

  if (valueType === 'boolean') {
    return `boolean:${value ? '1' : '0'}`;
  }

  if (valueType === 'bigint') {
    return `bigint:${String(value)}`;
  }

  return `other:${String(value)}`;
}

function toLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return '∅';
  }

  if (typeof value === 'string' && value.length === 0) {
    return '(empty)';
  }

  return String(value);
}

function createIdentitySourceOrder(rowCount: number): Int32Array {
  const size = Math.max(0, Math.floor(rowCount));
  const order = new Int32Array(size);
  for (let index = 0; index < size; index += 1) {
    order[index] = index;
  }

  return order;
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) {
    return 0;
  }

  if (left === undefined || left === null) {
    return -1;
  }

  if (right === undefined || right === null) {
    return 1;
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

function createAggregateState(type: PivotAggregateType): PivotAggregateState {
  return {
    count: 0,
    numberCount: 0,
    sum: 0,
    min: undefined,
    max: undefined,
    customValues: type === 'custom' ? [] : null
  };
}

function updateAggregateState(state: PivotAggregateState, type: PivotAggregateType, value: unknown): void {
  state.count += 1;

  if (type === 'count') {
    return;
  }

  if (type === 'custom') {
    if (state.customValues) {
      state.customValues.push(value);
    }
    return;
  }

  if (type === 'sum' || type === 'avg') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      state.sum += value;
      state.numberCount += 1;
    }
    return;
  }

  if (type === 'min') {
    if (state.min === undefined || compareValues(value, state.min) < 0) {
      state.min = value;
    }
    return;
  }

  if (type === 'max') {
    if (state.max === undefined || compareValues(value, state.max) > 0) {
      state.max = value;
    }
  }
}

function finalizeAggregateValue(
  state: PivotAggregateState | undefined,
  valueDescriptor: PivotValueDescriptor,
  rowGroupToken: string,
  pivotLabel: string
): unknown {
  if (!state) {
    return undefined;
  }

  switch (valueDescriptor.type) {
    case 'count':
      return state.count;
    case 'sum':
      return state.numberCount > 0 ? state.sum : undefined;
    case 'avg':
      return state.numberCount > 0 ? state.sum / state.numberCount : undefined;
    case 'min':
      return state.min;
    case 'max':
      return state.max;
    case 'custom': {
      if (!valueDescriptor.reducer) {
        return undefined;
      }

      return valueDescriptor.reducer(state.customValues ?? [], {
        groupKey: rowGroupToken,
        level: 0,
        columnId: valueDescriptor.columnId,
        groupValue: pivotLabel,
        rowCount: state.count
      });
    }
    default:
      return undefined;
  }
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
}

function resolvePivotColumnType(valueDescriptor: PivotValueDescriptor): ColumnDef['type'] {
  if (
    valueDescriptor.type === 'count' ||
    valueDescriptor.type === 'sum' ||
    valueDescriptor.type === 'avg'
  ) {
    return 'number';
  }

  return valueDescriptor.column.type;
}

function resolvePivotHeaderLabel(baseLabel: string, valueDescriptor: PivotValueDescriptor, valueCount: number): string {
  const aggregateLabel = valueDescriptor.type === 'custom' ? 'custom' : valueDescriptor.type;
  if (valueCount <= 1) {
    return `${baseLabel} (${aggregateLabel})`;
  }

  return `${baseLabel} · ${valueDescriptor.column.header} (${aggregateLabel})`;
}

function buildCellAggregateKey(pivotToken: string, valueDescriptorIndex: number): string {
  return `${pivotToken}::${String(valueDescriptorIndex)}`;
}

export class CooperativePivotExecutor implements PivotExecutor {
  public async execute(
    request: PivotExecutionRequest,
    context?: PivotExecutionContext
  ): Promise<WorkerResponseMessage<PivotExecutionResult>> {
    try {
      const sourceOrder = request.sourceOrder ?? createIdentitySourceOrder(request.rowCount);
      const rowGroupDescriptors = normalizeRowGroupModel(request.rowGroupModel, request.columns);
      const pivotKeyDescriptors = normalizePivotModel(request.pivotModel, request.columns);
      const captureCustomValueIndexes = Array.isArray(request.customValueColumnIds) && request.customValueColumnIds.length > 0;
      const pivotValueDescriptors = normalizePivotValues(request.pivotValues, request.columns, request.customValueColumnIds);
      const yieldInterval = normalizeYieldInterval(context?.yieldInterval);
      const processedCounter = { value: 0 };
      const maxRowCount = Math.max(0, Math.floor(request.rowCount));

      if (pivotKeyDescriptors.length === 0 || pivotValueDescriptors.length === 0) {
        return createWorkerOkResponse(request.opId, {
          opId: request.opId,
          columns: rowGroupDescriptors.map((descriptor) => ({ ...descriptor.column })),
          rows: [],
          rowGroupColumnIds: rowGroupDescriptors.map((descriptor) => descriptor.columnId),
          pivotColumnCount: 0,
          pivotKeyCount: 0,
          sourceRowCount: maxRowCount
        });
      }

      const rowAccumulatorByToken = new Map<string, PivotRowAccumulator>();
      const rowAccumulatorOrder: PivotRowAccumulator[] = [];
      const pivotColumnByToken = new Map<string, PivotColumnInfo>();
      const pivotColumnOrder: PivotColumnInfo[] = [];

      for (let sourceIndex = 0; sourceIndex < sourceOrder.length; sourceIndex += 1) {
        const dataIndex = sourceOrder[sourceIndex];
        if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= maxRowCount) {
          continue;
        }

        const rowGroupTokenParts: string[] = [];
        const rowGroupValues: GridRowData = {};
        for (let descriptorIndex = 0; descriptorIndex < rowGroupDescriptors.length; descriptorIndex += 1) {
          const descriptor = rowGroupDescriptors[descriptorIndex];
          const value = request.dataProvider.getValue(dataIndex, descriptor.columnId);
          rowGroupTokenParts.push(`${descriptor.columnId}=${toToken(value)}`);
          rowGroupValues[descriptor.columnId] = value;
        }

        const rowGroupToken = rowGroupTokenParts.length > 0 ? rowGroupTokenParts.join('|') : '__all__';
        let rowAccumulator = rowAccumulatorByToken.get(rowGroupToken);
        if (!rowAccumulator) {
          rowAccumulator = {
            rowGroupToken,
            rowGroupValues,
            aggregates: new Map<string, PivotAggregateState>(),
            customValueDataIndexes: captureCustomValueIndexes ? new Map<string, number[]>() : null
          };
          rowAccumulatorByToken.set(rowGroupToken, rowAccumulator);
          rowAccumulatorOrder.push(rowAccumulator);
        }

        const pivotTokenParts: string[] = [];
        const pivotLabelParts: string[] = [];
        for (let descriptorIndex = 0; descriptorIndex < pivotKeyDescriptors.length; descriptorIndex += 1) {
          const descriptor = pivotKeyDescriptors[descriptorIndex];
          const value = request.dataProvider.getValue(dataIndex, descriptor.columnId);
          pivotTokenParts.push(`${descriptor.columnId}=${toToken(value)}`);
          pivotLabelParts.push(toLabel(value));
        }

        const pivotToken = pivotTokenParts.join('|');
        let pivotInfo = pivotColumnByToken.get(pivotToken);
        if (!pivotInfo) {
          if (pivotColumnOrder.length < MAX_PIVOT_COLUMN_KEYS) {
            pivotInfo = {
              token: pivotToken,
              label: pivotLabelParts.join(' / ')
            };
            pivotColumnByToken.set(pivotToken, pivotInfo);
            pivotColumnOrder.push(pivotInfo);
          }
        }

        if (!pivotInfo) {
          processedCounter.value += 1;
          if (await maybeYield(processedCounter, yieldInterval, context)) {
            return createWorkerCanceledResponse(request.opId);
          }
          continue;
        }

        for (let valueDescriptorIndex = 0; valueDescriptorIndex < pivotValueDescriptors.length; valueDescriptorIndex += 1) {
          const valueDescriptor = pivotValueDescriptors[valueDescriptorIndex];
          const aggregateKey = buildCellAggregateKey(pivotInfo.token, valueDescriptorIndex);
          let aggregateState = rowAccumulator.aggregates.get(aggregateKey);
          if (!aggregateState) {
            aggregateState = createAggregateState(valueDescriptor.type);
            rowAccumulator.aggregates.set(aggregateKey, aggregateState);
          }

          const cellValue = request.dataProvider.getValue(dataIndex, valueDescriptor.columnId);
          updateAggregateState(aggregateState, valueDescriptor.type, cellValue);
          if (captureCustomValueIndexes && valueDescriptor.type === 'custom' && rowAccumulator.customValueDataIndexes) {
            let cellIndexes = rowAccumulator.customValueDataIndexes.get(aggregateKey);
            if (!cellIndexes) {
              cellIndexes = [];
              rowAccumulator.customValueDataIndexes.set(aggregateKey, cellIndexes);
            }
            cellIndexes.push(dataIndex);
          }
        }

        processedCounter.value += 1;
        if (await maybeYield(processedCounter, yieldInterval, context)) {
          return createWorkerCanceledResponse(request.opId);
        }
      }

      const columns: ColumnDef[] = [];
      for (let descriptorIndex = 0; descriptorIndex < rowGroupDescriptors.length; descriptorIndex += 1) {
        columns.push({ ...rowGroupDescriptors[descriptorIndex].column });
      }

      const pivotValueColumnIdByCellKey = new Map<string, { columnId: string; pivotLabel: string }>();
      for (let pivotKeyIndex = 0; pivotKeyIndex < pivotColumnOrder.length; pivotKeyIndex += 1) {
        const pivotInfo = pivotColumnOrder[pivotKeyIndex];
        const pivotLabelPart = sanitizeIdPart(pivotInfo.label.length > 0 ? pivotInfo.label : `pivot-${String(pivotKeyIndex + 1)}`);
        for (let valueDescriptorIndex = 0; valueDescriptorIndex < pivotValueDescriptors.length; valueDescriptorIndex += 1) {
          const valueDescriptor = pivotValueDescriptors[valueDescriptorIndex];
          const aggregateLabel = valueDescriptor.type === 'custom' ? 'custom' : valueDescriptor.type;
          const valueIdPart = sanitizeIdPart(valueDescriptor.columnId);
          const columnId = `__pivot_${String(pivotKeyIndex + 1)}_${pivotLabelPart}_${valueIdPart}_${aggregateLabel}_${String(valueDescriptorIndex + 1)}`;
          columns.push({
            id: columnId,
            header: resolvePivotHeaderLabel(pivotInfo.label, valueDescriptor, pivotValueDescriptors.length),
            width: Math.max(120, Math.round(valueDescriptor.column.width || 120)),
            minWidth: valueDescriptor.column.minWidth,
            maxWidth: valueDescriptor.column.maxWidth,
            type: resolvePivotColumnType(valueDescriptor),
            editable: false,
            visible: true
          });

          const aggregateKey = buildCellAggregateKey(pivotInfo.token, valueDescriptorIndex);
          pivotValueColumnIdByCellKey.set(aggregateKey, {
            columnId,
            pivotLabel: pivotInfo.label
          });
        }
      }

      const rows: GridRowData[] = [];
      const customValueDataIndexesByCell: PivotExecutionResult['customValueDataIndexesByCell'] = [];
      for (let rowIndex = 0; rowIndex < rowAccumulatorOrder.length; rowIndex += 1) {
        const rowAccumulator = rowAccumulatorOrder[rowIndex];
        const rowKey = rowAccumulator.rowGroupToken.length > 0 ? rowAccumulator.rowGroupToken : `pivot-row-${String(rowIndex + 1)}`;
        const row: GridRowData = {
          __pivot_row_key: rowKey,
          ...rowAccumulator.rowGroupValues
        };
        const aggregateEntries = Array.from(rowAccumulator.aggregates.entries());
        for (let entryIndex = 0; entryIndex < aggregateEntries.length; entryIndex += 1) {
          const [aggregateKey, aggregateState] = aggregateEntries[entryIndex];
          const columnEntry = pivotValueColumnIdByCellKey.get(aggregateKey);
          if (!columnEntry) {
            continue;
          }

          const separatorIndex = aggregateKey.lastIndexOf('::');
          if (separatorIndex < 0) {
            continue;
          }

          const valueDescriptorIndex = Number(aggregateKey.slice(separatorIndex + 2));
          if (!Number.isInteger(valueDescriptorIndex) || valueDescriptorIndex < 0 || valueDescriptorIndex >= pivotValueDescriptors.length) {
            continue;
          }

          const valueDescriptor = pivotValueDescriptors[valueDescriptorIndex];
          if (captureCustomValueIndexes && valueDescriptor.type === 'custom') {
            const customDataIndexes = rowAccumulator.customValueDataIndexes?.get(aggregateKey);
            if (customDataIndexes && customDataIndexes.length > 0) {
              customValueDataIndexesByCell.push({
                rowKey,
                columnId: columnEntry.columnId,
                valueColumnId: valueDescriptor.columnId,
                pivotLabel: columnEntry.pivotLabel,
                dataIndexes: customDataIndexes.slice()
              });
            }
          } else {
            row[columnEntry.columnId] = finalizeAggregateValue(
              aggregateState,
              valueDescriptor,
              rowAccumulator.rowGroupToken,
              columnEntry.pivotLabel
            );
          }
        }

        rows.push(row);
      }

      if (shouldCancel(context)) {
        return createWorkerCanceledResponse(request.opId);
      }

      return createWorkerOkResponse(request.opId, {
        opId: request.opId,
        columns,
        rows,
        rowGroupColumnIds: rowGroupDescriptors.map((descriptor) => descriptor.columnId),
        pivotColumnCount: columns.length - rowGroupDescriptors.length,
        pivotKeyCount: pivotColumnOrder.length,
        sourceRowCount: maxRowCount,
        customValueDataIndexesByCell: customValueDataIndexesByCell.length > 0 ? customValueDataIndexesByCell : undefined
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute pivot model';
      return createWorkerErrorResponse(request.opId, { message });
    }
  }
}
