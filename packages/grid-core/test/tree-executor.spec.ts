import { describe, expect, it } from 'vitest';
import { LocalDataProvider } from '../src/data/local-data-provider';
import { CooperativeTreeExecutor, toTreeNodeKeyToken } from '../src/data/tree-executor';

describe('CooperativeTreeExecutor', () => {
  it('builds rows from parentId model with expansion state', async () => {
    const rows = [
      { id: 1, parentId: null, name: 'Root-1', hasChildren: true },
      { id: 2, parentId: 1, name: 'Child-1-1', hasChildren: false },
      { id: 3, parentId: 1, name: 'Child-1-2', hasChildren: false },
      { id: 4, parentId: null, name: 'Root-2', hasChildren: false }
    ];

    const executor = new CooperativeTreeExecutor();
    const provider = new LocalDataProvider(rows);

    const expandedResponse = await executor.execute({
      opId: 'tree-expanded',
      rowCount: rows.length,
      dataProvider: provider,
      treeData: {
        enabled: true,
        idField: 'id',
        parentIdField: 'parentId',
        hasChildrenField: 'hasChildren',
        defaultExpanded: true
      }
    });

    expect(expandedResponse.status).toBe('ok');
    if (expandedResponse.status !== 'ok') {
      return;
    }

    const expandedRows = expandedResponse.result.rows;
    expect(expandedRows.length).toBe(4);
    expect(expandedRows[0].nodeKey).toBe(1);
    expect(expandedRows[0].depth).toBe(0);
    expect(expandedRows[1].nodeKey).toBe(2);
    expect(expandedRows[1].depth).toBe(1);

    const collapsedResponse = await executor.execute({
      opId: 'tree-collapsed',
      rowCount: rows.length,
      dataProvider: provider,
      treeData: {
        enabled: true,
        idField: 'id',
        parentIdField: 'parentId',
        hasChildrenField: 'hasChildren',
        defaultExpanded: true
      },
      treeExpansionState: {
        [toTreeNodeKeyToken(1)]: false
      }
    });

    expect(collapsedResponse.status).toBe('ok');
    if (collapsedResponse.status !== 'ok') {
      return;
    }

    const collapsedRows = collapsedResponse.result.rows;
    expect(collapsedRows.length).toBe(2);
    expect(collapsedRows[0].nodeKey).toBe(1);
    expect(collapsedRows[1].nodeKey).toBe(4);
  });

  it('merges lazy children batches and supports cancellation', async () => {
    const rows = [{ id: 10, parentId: null, name: 'Root-10', hasChildren: true }];
    const provider = new LocalDataProvider(rows);
    const executor = new CooperativeTreeExecutor();

    const response = await executor.execute({
      opId: 'tree-lazy',
      rowCount: rows.length,
      dataProvider: provider,
      treeData: {
        enabled: true,
        idField: 'id',
        parentIdField: 'parentId',
        hasChildrenField: 'hasChildren',
        defaultExpanded: true
      },
      lazyChildrenBatches: [
        {
          parentNodeKey: 10,
          rows: [{ id: 11, parentId: 10, name: 'Child-10-1', hasChildren: false }]
        }
      ]
    });

    expect(response.status).toBe('ok');
    if (response.status !== 'ok') {
      return;
    }

    expect(response.result.rows.length).toBe(2);
    expect(response.result.rows[1].nodeKey).toBe(11);

    const largeRows = Array.from({ length: 15_000 }, (_, index) => ({
      id: index + 1,
      parentId: null,
      name: `Root-${index + 1}`,
      hasChildren: false
    }));

    let canceled = false;
    setTimeout(() => {
      canceled = true;
    }, 0);

    const canceledResponse = await executor.execute(
      {
        opId: 'tree-canceled',
        rowCount: largeRows.length,
        dataProvider: new LocalDataProvider(largeRows),
        treeData: {
          enabled: true,
          idField: 'id',
          parentIdField: 'parentId',
          hasChildrenField: 'hasChildren',
          defaultExpanded: true
        }
      },
      {
        yieldInterval: 1024,
        isCanceled: () => canceled
      }
    );

    expect(canceledResponse.status).toBe('canceled');
  });
});
