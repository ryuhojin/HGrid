import type {
  ColumnDef,
  GroupAggregationContext,
  GroupAggregationDef,
  GroupAggregationType,
  GroupModelItem
} from '../core/grid-options';
import { getColumnValue } from './column-model';
import type { DataProvider, GridRowData } from './data-provider';
import {
  createWorkerCanceledResponse,
  createWorkerErrorResponse,
  createWorkerOkResponse,
  type WorkerResponseMessage
} from './worker-protocol';

const DEFAULT_YIELD_INTERVAL = 32_768;

interface NormalizedGroupModelItem {
  columnId: string;
  column: ColumnDef;
}

interface NormalizedAggregationDef {
  columnId: string;
  column: ColumnDef;
  type: GroupAggregationType;
  reducer: GroupAggregationDef['reducer'] | null;
}

interface AggregationWorkingState {
  rowCount: number;
  numericCount: number;
  sum: number;
  hasMinMaxValue: boolean;
  minValue: unknown;
  maxValue: unknown;
  customValues: unknown[] | null;
}

interface GroupRootNode {
  childOrder: string[];
  childrenByToken: Map<string, GroupNode>;
}

interface GroupNode {
  key: string;
  level: number;
  columnId: string;
  column: ColumnDef;
  value: unknown;
  leafCount: number;
  childOrder: string[];
  childrenByToken: Map<string, GroupNode>;
  dataIndexes: number[];
  aggregationStates: AggregationWorkingState[];
}

export interface GroupViewDataRow {
  kind: 'data';
  dataIndex: number;
}

export interface GroupViewGroupRow {
  kind: 'group';
  groupKey: string;
  level: number;
  columnId: string;
  value: unknown;
  leafCount: number;
  isExpanded: boolean;
  values: Record<string, unknown>;
}

export type GroupViewRow = GroupViewDataRow | GroupViewGroupRow;

export interface GroupExecutionRequest {
  opId: string;
  rowCount: number;
  groupModel: GroupModelItem[];
  aggregations: GroupAggregationDef[];
  columns: ColumnDef[];
  dataProvider: DataProvider;
  sourceOrder?: Int32Array | number[];
  groupExpansionState?: Record<string, boolean>;
  defaultExpanded?: boolean;
  includeLeafDataIndexes?: boolean;
}

export interface GroupExecutionContext {
  isCanceled?: () => boolean;
  yieldInterval?: number;
}

export interface GroupExecutionResult {
  opId: string;
  rows: GroupViewRow[];
  groupKeys: string[];
  groupLeafDataIndexesByKey?: Record<string, number[]>;
}

export interface GroupExecutor {
  execute(
    request: GroupExecutionRequest,
    context?: GroupExecutionContext
  ): Promise<WorkerResponseMessage<GroupExecutionResult>>;
}

function normalizeYieldInterval(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_YIELD_INTERVAL;
  }

  return Math.max(1_024, Math.floor(value));
}

function shouldCancel(context: GroupExecutionContext | undefined): boolean {
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
  context: GroupExecutionContext | undefined
): Promise<boolean> {
  if (processedCounter.value < yieldInterval) {
    return false;
  }

  processedCounter.value = 0;
  await yieldControl();
  return shouldCancel(context);
}

function isNil(value: unknown): boolean {
  return value === null || value === undefined;
}

function normalizeNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
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

function compareColumnValues(column: ColumnDef, left: unknown, right: unknown): number {
  if (column.type === 'number') {
    const leftNumber = normalizeNumber(left);
    const rightNumber = normalizeNumber(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
      if (!Number.isFinite(leftNumber) && !Number.isFinite(rightNumber)) {
        return 0;
      }

      return Number.isFinite(leftNumber) ? -1 : 1;
    }

    if (leftNumber === rightNumber) {
      return 0;
    }

    return leftNumber < rightNumber ? -1 : 1;
  }

  if (column.type === 'date') {
    const leftDate = normalizeDateValue(left);
    const rightDate = normalizeDateValue(right);
    if (!Number.isFinite(leftDate) || !Number.isFinite(rightDate)) {
      if (!Number.isFinite(leftDate) && !Number.isFinite(rightDate)) {
        return 0;
      }

      return Number.isFinite(leftDate) ? -1 : 1;
    }

    if (leftDate === rightDate) {
      return 0;
    }

    return leftDate < rightDate ? -1 : 1;
  }

  if (column.type === 'boolean') {
    const leftBoolean = Boolean(left);
    const rightBoolean = Boolean(right);
    if (leftBoolean === rightBoolean) {
      return 0;
    }

    return leftBoolean ? 1 : -1;
  }

  const leftText = String(left);
  const rightText = String(right);
  if (leftText === rightText) {
    return 0;
  }

  return leftText < rightText ? -1 : 1;
}

function encodeGroupValueToken(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'number:nan';
    }

    return `number:${String(value)}`;
  }

  if (typeof value === 'string') {
    return `string:${encodeURIComponent(value)}`;
  }

  if (typeof value === 'boolean') {
    return `boolean:${value ? '1' : '0'}`;
  }

  if (value instanceof Date) {
    return `date:${String(value.getTime())}`;
  }

  return `json:${encodeURIComponent(JSON.stringify(value))}`;
}

function createAggregationWorkingStates(length: number): AggregationWorkingState[] {
  const states = new Array<AggregationWorkingState>(length);
  for (let index = 0; index < length; index += 1) {
    states[index] = {
      rowCount: 0,
      numericCount: 0,
      sum: 0,
      hasMinMaxValue: false,
      minValue: null,
      maxValue: null,
      customValues: null
    };
  }

  return states;
}

function buildRowFromProvider(dataProvider: DataProvider, columns: ColumnDef[], dataIndex: number): GridRowData {
  const row: GridRowData = {};
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const column = columns[columnIndex];
    row[column.id] = dataProvider.getValue(dataIndex, column.id);
  }

  return row;
}

function getColumnValueForGrouping(
  dataProvider: DataProvider,
  columns: ColumnDef[],
  column: ColumnDef,
  dataIndex: number,
  rowCacheRef: { row: GridRowData | null }
): unknown {
  if (!column.valueGetter) {
    return dataProvider.getValue(dataIndex, column.id);
  }

  if (!rowCacheRef.row) {
    rowCacheRef.row = dataProvider.getRow
      ? dataProvider.getRow(dataIndex) ?? buildRowFromProvider(dataProvider, columns, dataIndex)
      : buildRowFromProvider(dataProvider, columns, dataIndex);
  }

  return getColumnValue(column, rowCacheRef.row);
}

function normalizeGroupModel(groupModel: GroupModelItem[], columns: ColumnDef[]): NormalizedGroupModelItem[] {
  if (!Array.isArray(groupModel) || groupModel.length === 0) {
    return [];
  }

  const columnById = new Map<string, ColumnDef>();
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    columnById.set(columns[columnIndex].id, columns[columnIndex]);
  }

  const normalized: NormalizedGroupModelItem[] = [];
  const seen = new Set<string>();
  for (let modelIndex = 0; modelIndex < groupModel.length; modelIndex += 1) {
    const model = groupModel[modelIndex];
    if (!model || typeof model.columnId !== 'string' || model.columnId.length === 0) {
      continue;
    }

    if (seen.has(model.columnId)) {
      continue;
    }

    const column = columnById.get(model.columnId);
    if (!column) {
      continue;
    }

    seen.add(model.columnId);
    normalized.push({
      columnId: model.columnId,
      column
    });
  }

  return normalized;
}

function normalizeAggregations(aggregations: GroupAggregationDef[], columns: ColumnDef[]): NormalizedAggregationDef[] {
  if (!Array.isArray(aggregations) || aggregations.length === 0) {
    return [];
  }

  const columnById = new Map<string, ColumnDef>();
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    columnById.set(columns[columnIndex].id, columns[columnIndex]);
  }

  const normalized: NormalizedAggregationDef[] = [];
  for (let aggregationIndex = 0; aggregationIndex < aggregations.length; aggregationIndex += 1) {
    const aggregation = aggregations[aggregationIndex];
    if (!aggregation || typeof aggregation.columnId !== 'string' || aggregation.columnId.length === 0) {
      continue;
    }

    const column = columnById.get(aggregation.columnId);
    if (!column) {
      continue;
    }

    const reducer = typeof aggregation.reducer === 'function' ? aggregation.reducer : null;
    const type: GroupAggregationType = aggregation.type ?? 'count';
    normalized.push({
      columnId: aggregation.columnId,
      column,
      type,
      reducer
    });
  }

  return normalized;
}

function resolveSourceOrder(request: GroupExecutionRequest): Int32Array | number[] {
  if (request.sourceOrder) {
    return request.sourceOrder;
  }

  const sourceOrder = new Int32Array(Math.max(0, request.rowCount));
  for (let index = 0; index < sourceOrder.length; index += 1) {
    sourceOrder[index] = index;
  }

  return sourceOrder;
}

function createRootNode(): GroupRootNode {
  return {
    childOrder: [],
    childrenByToken: new Map<string, GroupNode>()
  };
}

function createGroupNode(
  key: string,
  level: number,
  columnId: string,
  column: ColumnDef,
  value: unknown,
  aggregationDefCount: number
): GroupNode {
  return {
    key,
    level,
    columnId,
    column,
    value,
    leafCount: 0,
    childOrder: [],
    childrenByToken: new Map<string, GroupNode>(),
    dataIndexes: [],
    aggregationStates: createAggregationWorkingStates(aggregationDefCount)
  };
}

function applyAggregationsToNode(
  node: GroupNode,
  definitions: NormalizedAggregationDef[],
  rowValues: unknown[]
): void {
  for (let definitionIndex = 0; definitionIndex < definitions.length; definitionIndex += 1) {
    const definition = definitions[definitionIndex];
    const state = node.aggregationStates[definitionIndex];
    const value = rowValues[definitionIndex];
    state.rowCount += 1;

    if (definition.reducer) {
      if (!state.customValues) {
        state.customValues = [];
      }
      state.customValues.push(value);
      continue;
    }

    if (definition.type === 'count') {
      continue;
    }

    if (definition.type === 'sum' || definition.type === 'avg') {
      const numericValue = normalizeNumber(value);
      if (Number.isFinite(numericValue)) {
        state.sum += numericValue;
        state.numericCount += 1;
      }
      continue;
    }

    if (isNil(value)) {
      continue;
    }

    if (!state.hasMinMaxValue) {
      state.minValue = value;
      state.maxValue = value;
      state.hasMinMaxValue = true;
      continue;
    }

    if (compareColumnValues(definition.column, value, state.minValue) < 0) {
      state.minValue = value;
    }

    if (compareColumnValues(definition.column, value, state.maxValue) > 0) {
      state.maxValue = value;
    }
  }
}

function resolveGroupExpandedState(
  groupKey: string,
  groupExpansionState: Record<string, boolean> | undefined,
  defaultExpanded: boolean
): boolean {
  if (!groupExpansionState || typeof groupExpansionState !== 'object') {
    return defaultExpanded;
  }

  const value = groupExpansionState[groupKey];
  if (value === true || value === false) {
    return value;
  }

  return defaultExpanded;
}

function finalizeAggregationValue(
  definition: NormalizedAggregationDef,
  state: AggregationWorkingState,
  context: GroupAggregationContext
): unknown {
  if (definition.reducer) {
    return definition.reducer(state.customValues ?? [], context);
  }

  if (definition.type === 'count') {
    return state.rowCount;
  }

  if (definition.type === 'sum') {
    return state.numericCount > 0 ? state.sum : 0;
  }

  if (definition.type === 'avg') {
    return state.numericCount > 0 ? state.sum / state.numericCount : null;
  }

  if (definition.type === 'min') {
    return state.hasMinMaxValue ? state.minValue : null;
  }

  if (definition.type === 'max') {
    return state.hasMinMaxValue ? state.maxValue : null;
  }

  return null;
}

function buildGroupLabel(column: ColumnDef, value: unknown, leafCount: number): string {
  const valueText = isNil(value) ? '(empty)' : String(value);
  return `${column.header}: ${valueText} (${leafCount})`;
}

async function appendNodeRows(
  node: GroupNode,
  definitions: NormalizedAggregationDef[],
  rows: GroupViewRow[],
  groupKeys: string[],
  groupLeafDataIndexesByKey: Record<string, number[]> | undefined,
  groupExpansionState: Record<string, boolean> | undefined,
  defaultExpanded: boolean,
  context: GroupExecutionContext | undefined,
  processedCounter: { value: number },
  yieldInterval: number
): Promise<boolean> {
  const isExpanded = resolveGroupExpandedState(node.key, groupExpansionState, defaultExpanded);
  groupKeys.push(node.key);
  if (groupLeafDataIndexesByKey) {
    groupLeafDataIndexesByKey[node.key] = node.dataIndexes.slice();
  }

  const values: Record<string, unknown> = {};
  values[node.columnId] = buildGroupLabel(node.column, node.value, node.leafCount);

  for (let definitionIndex = 0; definitionIndex < definitions.length; definitionIndex += 1) {
    const definition = definitions[definitionIndex];
    if (Object.prototype.hasOwnProperty.call(values, definition.columnId)) {
      continue;
    }

    values[definition.columnId] = finalizeAggregationValue(definition, node.aggregationStates[definitionIndex], {
      groupKey: node.key,
      level: node.level,
      columnId: node.columnId,
      groupValue: node.value,
      rowCount: node.leafCount
    });
  }

  rows.push({
    kind: 'group',
    groupKey: node.key,
    level: node.level,
    columnId: node.columnId,
    value: node.value,
    leafCount: node.leafCount,
    isExpanded,
    values
  });

  processedCounter.value += 1;
  if (await maybeYield(processedCounter, yieldInterval, context)) {
    return false;
  }

  if (!isExpanded) {
    return true;
  }

  if (node.childOrder.length > 0) {
    for (let childIndex = 0; childIndex < node.childOrder.length; childIndex += 1) {
      const childToken = node.childOrder[childIndex];
      const childNode = node.childrenByToken.get(childToken);
      if (!childNode) {
        continue;
      }

      const shouldContinue = await appendNodeRows(
        childNode,
        definitions,
        rows,
        groupKeys,
        groupLeafDataIndexesByKey,
        groupExpansionState,
        defaultExpanded,
        context,
        processedCounter,
        yieldInterval
      );
      if (!shouldContinue) {
        return false;
      }
    }

    return true;
  }

  for (let dataIndexPosition = 0; dataIndexPosition < node.dataIndexes.length; dataIndexPosition += 1) {
    rows.push({
      kind: 'data',
      dataIndex: node.dataIndexes[dataIndexPosition]
    });
    processedCounter.value += 1;
    if (await maybeYield(processedCounter, yieldInterval, context)) {
      return false;
    }
  }

  return true;
}

export class CooperativeGroupExecutor implements GroupExecutor {
  public async execute(
    request: GroupExecutionRequest,
    context?: GroupExecutionContext
  ): Promise<WorkerResponseMessage<GroupExecutionResult>> {
    try {
      const rowCount = Math.max(0, Math.floor(request.rowCount));
      const normalizedGroupModel = normalizeGroupModel(request.groupModel, request.columns);
      const sourceOrder = resolveSourceOrder(request);

      if (normalizedGroupModel.length === 0) {
        const rows = new Array<GroupViewRow>(sourceOrder.length);
        for (let index = 0; index < sourceOrder.length; index += 1) {
          rows[index] = {
            kind: 'data',
            dataIndex: sourceOrder[index]
          };
        }

        return createWorkerOkResponse(request.opId, {
          opId: request.opId,
          rows,
          groupKeys: []
        });
      }

      const normalizedAggregations = normalizeAggregations(request.aggregations, request.columns);
      const includeLeafDataIndexes = request.includeLeafDataIndexes === true;
      const rootNode = createRootNode();
      const yieldInterval = normalizeYieldInterval(context?.yieldInterval);
      const processedCounter = { value: 0 };

      for (let sourceIndex = 0; sourceIndex < sourceOrder.length; sourceIndex += 1) {
        const dataIndex = sourceOrder[sourceIndex];
        if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= rowCount) {
          continue;
        }

        const rowCacheRef: { row: GridRowData | null } = { row: null };
        const aggregationRowValues = new Array<unknown>(normalizedAggregations.length);
        for (let aggregationIndex = 0; aggregationIndex < normalizedAggregations.length; aggregationIndex += 1) {
          const definition = normalizedAggregations[aggregationIndex];
          aggregationRowValues[aggregationIndex] = getColumnValueForGrouping(
            request.dataProvider,
            request.columns,
            definition.column,
            dataIndex,
            rowCacheRef
          );
          processedCounter.value += 1;
        }

        let parentKey = '';
        let parentChildrenByToken = rootNode.childrenByToken;
        let parentChildOrder = rootNode.childOrder;
        for (let level = 0; level < normalizedGroupModel.length; level += 1) {
          const groupModelItem = normalizedGroupModel[level];
          const groupValue = getColumnValueForGrouping(
            request.dataProvider,
            request.columns,
            groupModelItem.column,
            dataIndex,
            rowCacheRef
          );
          const token = encodeGroupValueToken(groupValue);
          let node = parentChildrenByToken.get(token);
          if (!node) {
            const groupKey = parentKey.length > 0 ? `${parentKey}||${groupModelItem.columnId}=${token}` : `${groupModelItem.columnId}=${token}`;
            node = createGroupNode(
              groupKey,
              level,
              groupModelItem.columnId,
              groupModelItem.column,
              groupValue,
              normalizedAggregations.length
            );
            parentChildrenByToken.set(token, node);
            parentChildOrder.push(token);
          }

          node.leafCount += 1;
          applyAggregationsToNode(node, normalizedAggregations, aggregationRowValues);
          if (includeLeafDataIndexes || level === normalizedGroupModel.length - 1) {
            node.dataIndexes.push(dataIndex);
          }

          parentKey = node.key;
          parentChildrenByToken = node.childrenByToken;
          parentChildOrder = node.childOrder;
          processedCounter.value += 1;
        }

        if (await maybeYield(processedCounter, yieldInterval, context)) {
          return createWorkerCanceledResponse(request.opId);
        }
      }

      const rows: GroupViewRow[] = [];
      const groupKeys: string[] = [];
      const groupLeafDataIndexesByKey = includeLeafDataIndexes ? {} : undefined;
      const defaultExpanded = request.defaultExpanded !== false;
      for (let rootIndex = 0; rootIndex < rootNode.childOrder.length; rootIndex += 1) {
        const rootToken = rootNode.childOrder[rootIndex];
        const rootChild = rootNode.childrenByToken.get(rootToken);
        if (!rootChild) {
          continue;
        }

        const shouldContinue = await appendNodeRows(
          rootChild,
          normalizedAggregations,
          rows,
          groupKeys,
          groupLeafDataIndexesByKey,
          request.groupExpansionState,
          defaultExpanded,
          context,
          processedCounter,
          yieldInterval
        );
        if (!shouldContinue) {
          return createWorkerCanceledResponse(request.opId);
        }
      }

      if (shouldCancel(context)) {
        return createWorkerCanceledResponse(request.opId);
      }

      return createWorkerOkResponse(request.opId, {
        opId: request.opId,
        rows,
        groupKeys,
        groupLeafDataIndexesByKey
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute grouping';
      return createWorkerErrorResponse(request.opId, { message });
    }
  }
}
