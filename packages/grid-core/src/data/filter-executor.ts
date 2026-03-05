import type { ColumnDef } from '../core/grid-options';
import type { DataProvider, GridRowData } from './data-provider';
import {
  createWorkerCanceledResponse,
  createWorkerErrorResponse,
  createWorkerOkResponse,
  type WorkerResponseMessage
} from './worker-protocol';

const DEFAULT_YIELD_INTERVAL = 65_536;

export type TextFilterOperator = 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'notEquals';

export interface TextFilterCondition {
  kind: 'text';
  value: string;
  operator?: TextFilterOperator;
  caseSensitive?: boolean;
}

export type NumberFilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';

export interface NumberFilterCondition {
  kind: 'number';
  operator?: NumberFilterOperator;
  value?: number;
  min?: number;
  max?: number;
}

export type DateFilterOperator = 'on' | 'before' | 'after' | 'onOrBefore' | 'onOrAfter' | 'between' | 'notOn';

export interface DateFilterCondition {
  kind: 'date';
  operator?: DateFilterOperator;
  value?: string | number | Date;
  min?: string | number | Date;
  max?: string | number | Date;
}

export interface SetFilterCondition {
  kind: 'set';
  values: unknown[];
  caseSensitive?: boolean;
  includeNull?: boolean;
}

export type ColumnFilterCondition = TextFilterCondition | NumberFilterCondition | DateFilterCondition | SetFilterCondition;
export type ColumnFilterInput = ColumnFilterCondition | ColumnFilterCondition[];
export type GridFilterModel = Record<string, ColumnFilterInput | undefined>;

export interface FilterExecutionRequest {
  opId: string;
  rowCount: number;
  filterModel: GridFilterModel;
  columns: ColumnDef[];
  dataProvider: DataProvider;
  sourceOrder?: Int32Array | number[];
}

export interface FilterExecutionContext {
  isCanceled?: () => boolean;
  yieldInterval?: number;
}

export interface FilterExecutionResult {
  opId: string;
  mapping: Int32Array;
}

export interface FilterExecutor {
  execute(
    request: FilterExecutionRequest,
    context?: FilterExecutionContext
  ): Promise<WorkerResponseMessage<FilterExecutionResult>>;
}

interface PreparedFilterClause {
  column: ColumnDef;
  evaluate: (value: unknown) => boolean;
}

interface PreparedFilterColumn {
  column: ColumnDef;
  clauses: PreparedFilterClause[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNil(value: unknown): boolean {
  return value === null || value === undefined;
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeYieldInterval(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_YIELD_INTERVAL;
  }

  return Math.max(1_024, Math.floor(value));
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

function toComparableText(value: unknown, caseSensitive: boolean): string {
  const text = String(value);
  return caseSensitive ? text : text.toLowerCase();
}

function normalizeTextCondition(condition: TextFilterCondition): PreparedFilterClause['evaluate'] {
  const caseSensitive = condition.caseSensitive === true;
  const operator = condition.operator ?? 'contains';
  const expected = toComparableText(condition.value, caseSensitive);

  return (value: unknown): boolean => {
    if (isNil(value)) {
      return false;
    }

    const source = toComparableText(value, caseSensitive);
    if (operator === 'startsWith') {
      return source.indexOf(expected) === 0;
    }

    if (operator === 'endsWith') {
      return source.endsWith(expected);
    }

    if (operator === 'equals') {
      return source === expected;
    }

    if (operator === 'notEquals') {
      return source !== expected;
    }

    return source.indexOf(expected) !== -1;
  };
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
}

function normalizeNumberCondition(condition: NumberFilterCondition): PreparedFilterClause['evaluate'] {
  const operator = condition.operator ?? 'eq';
  const expected = toFiniteNumber(condition.value);
  const min = toFiniteNumber(condition.min);
  const max = toFiniteNumber(condition.max);

  return (value: unknown): boolean => {
    const actual = toFiniteNumber(value);
    if (!Number.isFinite(actual)) {
      return false;
    }

    if (operator === 'between') {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return false;
      }
      return actual >= min && actual <= max;
    }

    if (!Number.isFinite(expected)) {
      return false;
    }

    if (operator === 'ne') {
      return actual !== expected;
    }

    if (operator === 'gt') {
      return actual > expected;
    }

    if (operator === 'gte') {
      return actual >= expected;
    }

    if (operator === 'lt') {
      return actual < expected;
    }

    if (operator === 'lte') {
      return actual <= expected;
    }

    return actual === expected;
  };
}

function normalizeDateCondition(condition: DateFilterCondition): PreparedFilterClause['evaluate'] {
  const operator = condition.operator ?? 'on';
  const expected = normalizeDateValue(condition.value);
  const min = normalizeDateValue(condition.min);
  const max = normalizeDateValue(condition.max);

  return (value: unknown): boolean => {
    const actual = normalizeDateValue(value);
    if (!Number.isFinite(actual)) {
      return false;
    }

    if (operator === 'between') {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return false;
      }

      return actual >= min && actual <= max;
    }

    if (!Number.isFinite(expected)) {
      return false;
    }

    if (operator === 'before') {
      return actual < expected;
    }

    if (operator === 'after') {
      return actual > expected;
    }

    if (operator === 'onOrBefore') {
      return actual <= expected;
    }

    if (operator === 'onOrAfter') {
      return actual >= expected;
    }

    if (operator === 'notOn') {
      return actual !== expected;
    }

    return actual === expected;
  };
}

function normalizeSetCondition(condition: SetFilterCondition): PreparedFilterClause['evaluate'] {
  const rawValues = Array.isArray(condition.values) ? condition.values : [];
  const includeNull = condition.includeNull === true;
  const caseSensitive = condition.caseSensitive === true;

  const primitiveValues = new Set<unknown>();
  const textValues = new Set<string>();
  for (let index = 0; index < rawValues.length; index += 1) {
    const entry = rawValues[index];
    if (typeof entry === 'string') {
      textValues.add(caseSensitive ? entry : entry.toLowerCase());
      continue;
    }

    primitiveValues.add(entry);
  }

  return (value: unknown): boolean => {
    if (isNil(value)) {
      return includeNull || primitiveValues.has(null) || primitiveValues.has(undefined);
    }

    if (typeof value === 'string') {
      const key = caseSensitive ? value : value.toLowerCase();
      return textValues.has(key);
    }

    return primitiveValues.has(value);
  };
}

function toConditionArray(input: ColumnFilterInput): ColumnFilterCondition[] {
  if (Array.isArray(input)) {
    return input;
  }

  return [input];
}

function normalizeFilterClause(input: unknown): ((value: unknown) => boolean) | null {
  if (!isObjectRecord(input) || !hasNonEmptyString(input.kind)) {
    return null;
  }

  if (input.kind === 'text') {
    if (!hasNonEmptyString(input.value)) {
      return null;
    }

    return normalizeTextCondition({
      kind: 'text',
      value: input.value,
      operator: input.operator as TextFilterOperator | undefined,
      caseSensitive: input.caseSensitive === true
    });
  }

  if (input.kind === 'number') {
    return normalizeNumberCondition({
      kind: 'number',
      operator: input.operator as NumberFilterOperator | undefined,
      value: input.value as number | undefined,
      min: input.min as number | undefined,
      max: input.max as number | undefined
    });
  }

  if (input.kind === 'date') {
    return normalizeDateCondition({
      kind: 'date',
      operator: input.operator as DateFilterOperator | undefined,
      value: input.value as string | number | Date | undefined,
      min: input.min as string | number | Date | undefined,
      max: input.max as string | number | Date | undefined
    });
  }

  if (input.kind === 'set') {
    return normalizeSetCondition({
      kind: 'set',
      values: Array.isArray(input.values) ? input.values : [],
      includeNull: input.includeNull === true,
      caseSensitive: input.caseSensitive === true
    });
  }

  return null;
}

function normalizeFilterModel(filterModel: GridFilterModel, columns: ColumnDef[]): PreparedFilterColumn[] {
  if (!filterModel || !isObjectRecord(filterModel)) {
    return [];
  }

  const byId = new Map<string, ColumnDef>();
  for (let index = 0; index < columns.length; index += 1) {
    byId.set(columns[index].id, columns[index]);
  }

  const keys = Object.keys(filterModel);
  const prepared: PreparedFilterColumn[] = [];

  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const columnId = keys[keyIndex];
    const column = byId.get(columnId);
    if (!column) {
      continue;
    }

    const input = filterModel[columnId];
    if (!input) {
      continue;
    }

    const clauses: PreparedFilterClause[] = [];
    const conditions = toConditionArray(input);
    for (let conditionIndex = 0; conditionIndex < conditions.length; conditionIndex += 1) {
      const evaluate = normalizeFilterClause(conditions[conditionIndex]);
      if (!evaluate) {
        continue;
      }

      clauses.push({
        column,
        evaluate
      });
    }

    if (clauses.length === 0) {
      continue;
    }

    prepared.push({
      column,
      clauses
    });
  }

  return prepared;
}

function buildIdentityOrder(rowCount: number): Int32Array {
  const mapping = new Int32Array(Math.max(0, rowCount));
  for (let index = 0; index < mapping.length; index += 1) {
    mapping[index] = index;
  }
  return mapping;
}

function resolveSourceOrder(rowCount: number, sourceOrder?: Int32Array | number[]): Int32Array {
  if (!sourceOrder) {
    return buildIdentityOrder(rowCount);
  }

  if (sourceOrder.length !== rowCount) {
    throw new Error(`Filter source order length must equal rowCount (${rowCount})`);
  }

  const normalized = sourceOrder instanceof Int32Array ? sourceOrder : Int32Array.from(sourceOrder);
  return new Int32Array(normalized);
}

function shouldCancel(context: FilterExecutionContext | undefined): boolean {
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
  context: FilterExecutionContext | undefined
): Promise<boolean> {
  if (processedCounter.value < yieldInterval) {
    return false;
  }

  processedCounter.value = 0;
  await yieldControl();
  return shouldCancel(context);
}

function buildRowFromProvider(dataProvider: DataProvider, columns: ColumnDef[], dataIndex: number): GridRowData {
  const row: GridRowData = {};
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const column = columns[columnIndex];
    row[column.id] = dataProvider.getValue(dataIndex, column.id);
  }
  return row;
}

function resolveColumnValue(
  rowCache: { row?: GridRowData },
  request: FilterExecutionRequest,
  preparedColumn: PreparedFilterColumn,
  dataIndex: number
): unknown {
  const column = preparedColumn.column;

  if (!column.valueGetter) {
    return request.dataProvider.getValue(dataIndex, column.id);
  }

  if (!rowCache.row) {
    rowCache.row = request.dataProvider.getRow
      ? request.dataProvider.getRow(dataIndex) ?? buildRowFromProvider(request.dataProvider, request.columns, dataIndex)
      : buildRowFromProvider(request.dataProvider, request.columns, dataIndex);
  }

  return column.valueGetter(rowCache.row, column);
}

export class CooperativeFilterExecutor implements FilterExecutor {
  public async execute(
    request: FilterExecutionRequest,
    context?: FilterExecutionContext
  ): Promise<WorkerResponseMessage<FilterExecutionResult>> {
    try {
      if (shouldCancel(context)) {
        return createWorkerCanceledResponse(request.opId);
      }

      const normalizedFilters = normalizeFilterModel(request.filterModel, request.columns);
      const sourceOrder = resolveSourceOrder(request.rowCount, request.sourceOrder);
      if (normalizedFilters.length === 0 || request.rowCount <= 0) {
        return createWorkerOkResponse(request.opId, {
          opId: request.opId,
          mapping: sourceOrder
        });
      }

      const yieldInterval = normalizeYieldInterval(context?.yieldInterval);
      const resultBuffer = new Int32Array(request.rowCount);
      let acceptedCount = 0;
      const processedCounter = { value: 0 };

      for (let viewIndex = 0; viewIndex < sourceOrder.length; viewIndex += 1) {
        const dataIndex = sourceOrder[viewIndex];
        let rowAccepted = true;
        const rowCache: { row?: GridRowData } = {};

        for (let filterIndex = 0; filterIndex < normalizedFilters.length && rowAccepted; filterIndex += 1) {
          const preparedColumn = normalizedFilters[filterIndex];
          const value = resolveColumnValue(rowCache, request, preparedColumn, dataIndex);

          for (let clauseIndex = 0; clauseIndex < preparedColumn.clauses.length; clauseIndex += 1) {
            const clause = preparedColumn.clauses[clauseIndex];
            if (!clause.evaluate(value)) {
              rowAccepted = false;
              break;
            }
          }
        }

        if (rowAccepted) {
          resultBuffer[acceptedCount] = dataIndex;
          acceptedCount += 1;
        }

        processedCounter.value += 1;
        if (await maybeYield(processedCounter, yieldInterval, context)) {
          return createWorkerCanceledResponse(request.opId);
        }
      }

      return createWorkerOkResponse(request.opId, {
        opId: request.opId,
        mapping: resultBuffer.slice(0, acceptedCount)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown filter execution error';
      return createWorkerErrorResponse(request.opId, {
        message,
        code: 'FILTER_EXECUTION_ERROR'
      });
    }
  }
}
