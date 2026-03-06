import type { TreeDataOptions } from '../core/grid-options';
import type { DataProvider, GridRowData, RowKey } from './data-provider';
import {
  createWorkerCanceledResponse,
  createWorkerErrorResponse,
  createWorkerOkResponse,
  type WorkerResponseMessage
} from './worker-protocol';

const DEFAULT_YIELD_INTERVAL = 32_768;

type TreeKeyToken = string;

interface TreeNode {
  nodeKey: RowKey;
  nodeKeyToken: TreeKeyToken;
  parentNodeKey: RowKey | null;
  parentNodeKeyToken: TreeKeyToken | null;
  sourceDataIndex: number | null;
  localRow: GridRowData | null;
  hasChildrenHint: boolean;
  childNodeKeyTokens: TreeKeyToken[];
}

export interface TreeLazyChildrenBatch {
  parentNodeKey: RowKey;
  rows: GridRowData[];
}

export interface TreeViewRow {
  kind: 'tree';
  nodeKey: RowKey;
  parentNodeKey: RowKey | null;
  sourceDataIndex: number | null;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  localRow: GridRowData | null;
}

export interface TreeExecutionRequest {
  opId: string;
  rowCount: number;
  sourceOrder?: Int32Array | number[];
  dataProvider: DataProvider;
  treeData: TreeDataOptions;
  treeExpansionState?: Record<string, boolean>;
  lazyChildrenBatches?: TreeLazyChildrenBatch[];
}

export interface TreeExecutionContext {
  isCanceled?: () => boolean;
  yieldInterval?: number;
}

export interface TreeExecutionResult {
  opId: string;
  rows: TreeViewRow[];
  nodeKeys: RowKey[];
  nodeKeyTokens: string[];
}

export interface TreeExecutor {
  execute(
    request: TreeExecutionRequest,
    context?: TreeExecutionContext
  ): Promise<WorkerResponseMessage<TreeExecutionResult>>;
}

function normalizeYieldInterval(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_YIELD_INTERVAL;
  }

  return Math.max(1_024, Math.floor(value));
}

function shouldCancel(context: TreeExecutionContext | undefined): boolean {
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
  context: TreeExecutionContext | undefined
): Promise<boolean> {
  if (processedCounter.value < yieldInterval) {
    return false;
  }

  processedCounter.value = 0;
  await yieldControl();
  return shouldCancel(context);
}

function asTreeNodeKey(value: unknown): RowKey | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

export function toTreeNodeKeyToken(value: RowKey | null | undefined): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'number') {
    return `number:${String(value)}`;
  }

  return `string:${value}`;
}

function resolveSourceOrder(request: TreeExecutionRequest): Int32Array | number[] {
  if (request.sourceOrder) {
    return request.sourceOrder;
  }

  const sourceOrder = new Int32Array(Math.max(0, request.rowCount));
  for (let index = 0; index < sourceOrder.length; index += 1) {
    sourceOrder[index] = index;
  }

  return sourceOrder;
}

function buildFallbackRow(
  dataProvider: DataProvider,
  dataIndex: number,
  idField: string,
  parentIdField: string,
  hasChildrenField: string
): GridRowData {
  return {
    [idField]: dataProvider.getValue(dataIndex, idField),
    [parentIdField]: dataProvider.getValue(dataIndex, parentIdField),
    [hasChildrenField]: dataProvider.getValue(dataIndex, hasChildrenField)
  };
}

function createUniqueNodeKey(candidate: RowKey, seenTokens: Set<TreeKeyToken>, seedPrefix: string): RowKey {
  let nodeKey: RowKey = candidate;
  let token = toTreeNodeKeyToken(nodeKey);
  if (!seenTokens.has(token)) {
    seenTokens.add(token);
    return nodeKey;
  }

  let suffix = 1;
  while (true) {
    nodeKey = `${seedPrefix}-${String(candidate)}-${String(suffix)}`;
    token = toTreeNodeKeyToken(nodeKey);
    if (!seenTokens.has(token)) {
      seenTokens.add(token);
      return nodeKey;
    }
    suffix += 1;
  }
}

function resolveExpandedState(
  nodeKeyToken: string,
  expansionState: Record<string, boolean> | undefined,
  defaultExpanded: boolean
): boolean {
  if (!expansionState || typeof expansionState !== 'object') {
    return defaultExpanded;
  }

  const explicit = expansionState[nodeKeyToken];
  if (explicit === true || explicit === false) {
    return explicit;
  }

  return defaultExpanded;
}

function normalizeLazyBatches(lazyChildrenBatches: TreeLazyChildrenBatch[] | undefined): TreeLazyChildrenBatch[] {
  if (!Array.isArray(lazyChildrenBatches) || lazyChildrenBatches.length === 0) {
    return [];
  }

  const normalized: TreeLazyChildrenBatch[] = [];
  for (let index = 0; index < lazyChildrenBatches.length; index += 1) {
    const batch = lazyChildrenBatches[index];
    const parentNodeKey = asTreeNodeKey(batch?.parentNodeKey);
    if (!parentNodeKey || !Array.isArray(batch.rows) || batch.rows.length === 0) {
      continue;
    }

    normalized.push({
      parentNodeKey,
      rows: batch.rows.map((row) => ({ ...row }))
    });
  }

  return normalized;
}

function getTreeFieldName(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export class CooperativeTreeExecutor implements TreeExecutor {
  public async execute(
    request: TreeExecutionRequest,
    context?: TreeExecutionContext
  ): Promise<WorkerResponseMessage<TreeExecutionResult>> {
    try {
      const treeData = request.treeData ?? {};
      const idField = getTreeFieldName(treeData.idField, 'id');
      const parentIdField = getTreeFieldName(treeData.parentIdField, 'parentId');
      const hasChildrenField = getTreeFieldName(treeData.hasChildrenField, 'hasChildren');
      const defaultExpanded = treeData.defaultExpanded === true;
      const rootParentValue = treeData.rootParentValue === undefined ? null : treeData.rootParentValue;
      const rootParentToken = toTreeNodeKeyToken(rootParentValue);
      const sourceOrder = resolveSourceOrder(request);
      const lazyChildrenBatches = normalizeLazyBatches(request.lazyChildrenBatches);
      const nodeByToken = new Map<TreeKeyToken, TreeNode>();
      const insertionOrderTokens: TreeKeyToken[] = [];
      const seenTokens = new Set<TreeKeyToken>();
      const processedCounter = { value: 0 };
      const yieldInterval = normalizeYieldInterval(context?.yieldInterval);
      const maxRowCount = Math.max(0, Math.floor(request.rowCount));

      for (let sourceIndex = 0; sourceIndex < sourceOrder.length; sourceIndex += 1) {
        const dataIndex = sourceOrder[sourceIndex];
        if (!Number.isInteger(dataIndex) || dataIndex < 0 || dataIndex >= maxRowCount) {
          continue;
        }

        const row = request.dataProvider.getRow?.(dataIndex) ??
          buildFallbackRow(request.dataProvider, dataIndex, idField, parentIdField, hasChildrenField);
        const rawNodeKey = asTreeNodeKey(row[idField]) ?? `auto-source-${String(dataIndex)}`;
        const nodeKey = createUniqueNodeKey(rawNodeKey, seenTokens, 'node-source');
        const nodeKeyToken = toTreeNodeKeyToken(nodeKey);
        const rawParentNodeKey = asTreeNodeKey(row[parentIdField]);
        const parentNodeKey = rawParentNodeKey ?? null;
        const parentNodeKeyToken = parentNodeKey ? toTreeNodeKeyToken(parentNodeKey) : null;
        const hasChildrenHint = row[hasChildrenField] === true;

        nodeByToken.set(nodeKeyToken, {
          nodeKey,
          nodeKeyToken,
          parentNodeKey,
          parentNodeKeyToken,
          sourceDataIndex: dataIndex,
          localRow: null,
          hasChildrenHint,
          childNodeKeyTokens: []
        });
        insertionOrderTokens.push(nodeKeyToken);

        processedCounter.value += 1;
        if (await maybeYield(processedCounter, yieldInterval, context)) {
          return createWorkerCanceledResponse(request.opId);
        }
      }

      for (let batchIndex = 0; batchIndex < lazyChildrenBatches.length; batchIndex += 1) {
        const batch = lazyChildrenBatches[batchIndex];
        const parentNodeKeyToken = toTreeNodeKeyToken(batch.parentNodeKey);
        for (let rowIndex = 0; rowIndex < batch.rows.length; rowIndex += 1) {
          const row = batch.rows[rowIndex];
          const rawNodeKey = asTreeNodeKey(row[idField]) ?? `auto-lazy-${parentNodeKeyToken}-${String(rowIndex)}`;
          const nodeKey = createUniqueNodeKey(rawNodeKey, seenTokens, 'node-lazy');
          const nodeKeyToken = toTreeNodeKeyToken(nodeKey);
          const rowParentNodeKey = asTreeNodeKey(row[parentIdField]) ?? batch.parentNodeKey;
          const rowParentNodeKeyToken = toTreeNodeKeyToken(rowParentNodeKey);
          const hasChildrenHint = row[hasChildrenField] === true;

          nodeByToken.set(nodeKeyToken, {
            nodeKey,
            nodeKeyToken,
            parentNodeKey: rowParentNodeKey,
            parentNodeKeyToken: rowParentNodeKeyToken,
            sourceDataIndex: null,
            localRow: { ...row },
            hasChildrenHint,
            childNodeKeyTokens: []
          });
          insertionOrderTokens.push(nodeKeyToken);

          processedCounter.value += 1;
          if (await maybeYield(processedCounter, yieldInterval, context)) {
            return createWorkerCanceledResponse(request.opId);
          }
        }
      }

      const hasParentInTree = new Set<TreeKeyToken>();
      const rootNodeTokens: TreeKeyToken[] = [];

      for (let index = 0; index < insertionOrderTokens.length; index += 1) {
        const nodeKeyToken = insertionOrderTokens[index];
        const node = nodeByToken.get(nodeKeyToken);
        if (!node) {
          continue;
        }

        if (!node.parentNodeKeyToken || node.parentNodeKeyToken === rootParentToken) {
          rootNodeTokens.push(node.nodeKeyToken);
          continue;
        }

        const parentNode = nodeByToken.get(node.parentNodeKeyToken);
        if (!parentNode) {
          rootNodeTokens.push(node.nodeKeyToken);
          continue;
        }

        parentNode.childNodeKeyTokens.push(node.nodeKeyToken);
        hasParentInTree.add(node.nodeKeyToken);
      }

      if (rootNodeTokens.length === 0) {
        for (let index = 0; index < insertionOrderTokens.length; index += 1) {
          const token = insertionOrderTokens[index];
          if (!hasParentInTree.has(token)) {
            rootNodeTokens.push(token);
          }
        }
      }

      const rows: TreeViewRow[] = [];
      const nodeKeys: RowKey[] = [];
      const nodeKeyTokens: string[] = [];
      const visited = new Set<TreeKeyToken>();

      const appendNode = async (nodeToken: TreeKeyToken, depth: number): Promise<boolean> => {
        if (visited.has(nodeToken)) {
          return true;
        }

        visited.add(nodeToken);
        const node = nodeByToken.get(nodeToken);
        if (!node) {
          return true;
        }

        const hasChildren = node.childNodeKeyTokens.length > 0 || node.hasChildrenHint;
        const isExpanded = hasChildren
          ? resolveExpandedState(node.nodeKeyToken, request.treeExpansionState, defaultExpanded)
          : false;

        rows.push({
          kind: 'tree',
          nodeKey: node.nodeKey,
          parentNodeKey: node.parentNodeKey,
          sourceDataIndex: node.sourceDataIndex,
          depth,
          hasChildren,
          isExpanded,
          localRow: node.localRow
        });
        nodeKeys.push(node.nodeKey);
        nodeKeyTokens.push(node.nodeKeyToken);

        processedCounter.value += 1;
        if (await maybeYield(processedCounter, yieldInterval, context)) {
          return false;
        }

        if (!hasChildren || !isExpanded) {
          return true;
        }

        for (let childIndex = 0; childIndex < node.childNodeKeyTokens.length; childIndex += 1) {
          const childToken = node.childNodeKeyTokens[childIndex];
          const shouldContinue = await appendNode(childToken, depth + 1);
          if (!shouldContinue) {
            return false;
          }
        }

        return true;
      };

      for (let rootIndex = 0; rootIndex < rootNodeTokens.length; rootIndex += 1) {
        const rootNodeToken = rootNodeTokens[rootIndex];
        const shouldContinue = await appendNode(rootNodeToken, 0);
        if (!shouldContinue) {
          return createWorkerCanceledResponse(request.opId);
        }
      }

      for (let index = 0; index < insertionOrderTokens.length; index += 1) {
        const token = insertionOrderTokens[index];
        if (visited.has(token)) {
          continue;
        }

        const node = nodeByToken.get(token);
        if (!node) {
          continue;
        }

        if (node.parentNodeKeyToken) {
          const parentNode = nodeByToken.get(node.parentNodeKeyToken);
          // Parent branch is already processed. Hidden descendants from collapsed parents
          // must stay hidden and should not be appended as standalone roots.
          if (parentNode && visited.has(parentNode.nodeKeyToken)) {
            continue;
          }
        }

        const shouldContinue = await appendNode(token, 0);
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
        nodeKeys,
        nodeKeyTokens
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to execute tree model';
      return createWorkerErrorResponse(request.opId, { message });
    }
  }
}
