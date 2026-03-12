import { describe, expect, it } from 'vitest';
import { registerFilterWorker } from '../src/data/filter.worker';
import { registerGroupWorker } from '../src/data/group.worker';
import { registerPivotWorker } from '../src/data/pivot.worker';
import { registerSortWorker } from '../src/data/sort.worker';
import { registerTreeWorker } from '../src/data/tree.worker';
import type { WorkerEntrypointScope } from '../src/data/worker-entry';
import { createWorkerRequest, type WorkerRequestMessage, type WorkerResponseMessage } from '../src/data/worker-protocol';
import { WORKER_TREE_LAZY_ROW_REF_FIELD, createWorkerTreeLazyRowRef } from '../src/data/worker-operation-payloads';

class MockWorkerScope implements WorkerEntrypointScope {
  public readonly messages: WorkerResponseMessage[] = [];
  private readonly listeners: Array<(event: { data: unknown }) => void | Promise<void>> = [];

  public addEventListener(type: 'message', listener: (event: { data: unknown }) => void | Promise<void>): void {
    if (type === 'message') {
      this.listeners.push(listener);
    }
  }

  public removeEventListener(type: 'message', listener: (event: { data: unknown }) => void | Promise<void>): void {
    if (type !== 'message') {
      return;
    }

    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  public postMessage(message: unknown): void {
    this.messages.push(message as WorkerResponseMessage);
  }

  public async emit(message: WorkerRequestMessage): Promise<void> {
    for (let index = 0; index < this.listeners.length; index += 1) {
      await this.listeners[index]({ data: message });
    }
  }
}

function getOkResult<TResult>(message: WorkerResponseMessage): TResult {
  if (message.status !== 'ok') {
    throw new Error('Expected ok response');
  }

  return message.result as TResult;
}

const baseRows = [
  { id: 1, name: 'Alpha', status: 'active', region: 'KR', score: 30, parentId: null, hasChildren: true },
  { id: 2, name: 'Bravo', status: 'hold', region: 'US', score: 10, parentId: 1, hasChildren: false },
  { id: 3, name: 'Charlie', status: 'active', region: 'KR', score: 20, parentId: 1, hasChildren: false }
];

const baseColumns = [
  { id: 'id', type: 'number' as const },
  { id: 'name', type: 'text' as const },
  { id: 'status', type: 'text' as const },
  { id: 'region', type: 'text' as const },
  { id: 'score', type: 'number' as const }
];

describe('Worker entrypoints', () => {
  it('sort.worker returns a sorted mapping', async () => {
    const scope = new MockWorkerScope();
    registerSortWorker(scope);

    await scope.emit(
      createWorkerRequest('sort-1', 'sort', {
        rows: baseRows,
        columns: baseColumns,
        sortModel: [{ columnId: 'score', direction: 'asc' }]
      })
    );

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('ok');
    const result = getOkResult<{ opId: string; mapping: Int32Array }>(scope.messages[0]);
    expect(Array.from(result.mapping)).toEqual([1, 2, 0]);
  });

  it('filter.worker returns a filtered mapping', async () => {
    const scope = new MockWorkerScope();
    registerFilterWorker(scope);

    await scope.emit(
      createWorkerRequest('filter-1', 'filter', {
        rows: baseRows,
        columns: baseColumns,
        filterModel: {
          status: {
            kind: 'text',
            operator: 'equals',
            value: 'active'
          }
        }
      })
    );

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('ok');
    const result = getOkResult<{ opId: string; mapping: Int32Array }>(scope.messages[0]);
    expect(Array.from(result.mapping)).toEqual([0, 2]);
  });

  it('sort.worker accepts columnar payloads', async () => {
    const scope = new MockWorkerScope();
    registerSortWorker(scope);

    await scope.emit(
      createWorkerRequest('sort-columnar', 'sort', {
        kind: 'columnar',
        rowCount: 3,
        columns: [{ id: 'score', type: 'number' as const }],
        sortModel: [{ columnId: 'score', direction: 'asc' }],
        columnValuesById: {
          score: [30, 10, 20]
        }
      })
    );

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('ok');
    const result = getOkResult<{ opId: string; mapping: Int32Array }>(scope.messages[0]);
    expect(Array.from(result.mapping)).toEqual([1, 2, 0]);
  });

  it('group.worker returns grouped view rows', async () => {
    const scope = new MockWorkerScope();
    registerGroupWorker(scope);

    await scope.emit(
      createWorkerRequest('group-1', 'group', {
        rows: baseRows,
        columns: baseColumns,
        groupModel: [{ columnId: 'region' }],
        aggregations: [{ columnId: 'score', type: 'sum' }],
        defaultExpanded: true,
        includeLeafDataIndexes: true
      })
    );

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('ok');
    const result = getOkResult<{
      groupKeys: string[];
      rows: Array<{ kind: string }>;
      groupLeafDataIndexesByKey?: Record<string, number[]>;
    }>(scope.messages[0]);
    expect(result.groupKeys).toEqual(['region=string:KR', 'region=string:US']);
    expect(result.rows[0].kind).toBe('group');
    expect(result.groupLeafDataIndexesByKey?.['region=string:KR']).toEqual([0, 2]);
  });

  it('pivot.worker returns pivot columns and rows', async () => {
    const scope = new MockWorkerScope();
    registerPivotWorker(scope);

    await scope.emit(
      createWorkerRequest('pivot-1', 'pivot', {
        rows: baseRows,
        columns: baseColumns,
        rowGroupModel: [{ columnId: 'region' }],
        pivotModel: [{ columnId: 'status' }],
        pivotValues: [{ columnId: 'score', type: 'sum' }]
      })
    );

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('ok');
    const result = getOkResult<{ columns: unknown[]; rows: unknown[] }>(scope.messages[0]);
    expect(result.columns.length).toBeGreaterThan(1);
    expect(result.rows.length).toBe(2);
  });

  it('pivot.worker returns custom reducer hydration metadata', async () => {
    const scope = new MockWorkerScope();
    registerPivotWorker(scope);

    await scope.emit(
      createWorkerRequest('pivot-custom', 'pivot', {
        kind: 'columnar',
        rowCount: 3,
        columns: [
          { id: 'region', type: 'text' as const },
          { id: 'month', type: 'text' as const },
          { id: 'sales', type: 'number' as const }
        ],
        rowGroupModel: [{ columnId: 'region' }],
        pivotModel: [{ columnId: 'month' }],
        pivotValues: [{ columnId: 'sales' }],
        customValueColumnIds: ['sales'],
        columnValuesById: {
          region: ['KR', 'KR', 'US'],
          month: ['Jan', 'Jan', 'Feb'],
          sales: [100, 40, 30]
        }
      })
    );

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('ok');
    const result = getOkResult<{
      columns: Array<{ id: string }>;
      customValueDataIndexesByCell?: Array<{
        rowKey: string;
        columnId: string;
        valueColumnId: string;
        pivotLabel: string;
        dataIndexes: number[];
      }>;
    }>(scope.messages[0]);
    expect(result.columns).toHaveLength(3);
    const resultColumnIds = result.columns.map((column) => column.id);
    expect(result.customValueDataIndexesByCell).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowKey: 'region=string:KR',
          valueColumnId: 'sales',
          pivotLabel: 'Jan',
          dataIndexes: [0, 1]
        }),
        expect.objectContaining({
          rowKey: 'region=string:US',
          valueColumnId: 'sales',
          pivotLabel: 'Feb',
          dataIndexes: [2]
        })
      ])
    );
    expect(
      result.customValueDataIndexesByCell?.every((cell) => resultColumnIds.indexOf(cell.columnId) >= 0)
    ).toBe(true);
  });

  it('tree.worker returns flattened tree rows', async () => {
    const scope = new MockWorkerScope();
    registerTreeWorker(scope);

    await scope.emit(
      createWorkerRequest('tree-1', 'tree', {
        rows: baseRows,
        treeData: {
          enabled: true,
          idField: 'id',
          parentIdField: 'parentId',
          hasChildrenField: 'hasChildren',
          defaultExpanded: true
        }
      })
    );

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('ok');
    const result = getOkResult<{ rows: Array<{ depth: number }> }>(scope.messages[0]);
    expect(result.rows.length).toBe(3);
    expect(result.rows[0].depth).toBe(0);
    expect(result.rows[1].depth).toBe(1);
  });

  it('tree.worker accepts compact payloads', async () => {
    const scope = new MockWorkerScope();
    registerTreeWorker(scope);

    await scope.emit(
      createWorkerRequest('tree-compact', 'tree', {
        kind: 'compact',
        rowCount: 3,
        columnValuesById: {
          id: [1, 2, 3],
          parentId: [null, 1, 1],
          hasChildren: [true, false, false]
        },
        treeData: {
          enabled: true,
          idField: 'id',
          parentIdField: 'parentId',
          hasChildrenField: 'hasChildren',
          defaultExpanded: true
        },
        lazyChildrenBatches: [
          {
            parentNodeKey: 1,
            rows: [
              {
                id: 4,
                parentId: 1,
                hasChildren: false,
                [WORKER_TREE_LAZY_ROW_REF_FIELD]: createWorkerTreeLazyRowRef(1, 0)
              }
            ]
          }
        ]
      })
    );

    expect(scope.messages).toHaveLength(1);
    expect(scope.messages[0].status).toBe('ok');
    const result = getOkResult<{ rows: Array<{ depth: number; localRow?: Record<string, unknown> | null }> }>(scope.messages[0]);
    expect(result.rows.length).toBe(4);
    expect(result.rows[1].depth).toBe(1);
    expect(result.rows[3].localRow?.[WORKER_TREE_LAZY_ROW_REF_FIELD]).toBe(createWorkerTreeLazyRowRef(1, 0));
  });
});
