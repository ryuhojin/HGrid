import { describe, expect, it } from 'vitest';
import { LocalDataProvider } from '../src/data/local-data-provider';
import { CooperativeSortExecutor } from '../src/data/sort-executor';

describe('CooperativeSortExecutor', () => {
  it('sorts with single and multi-column models using default comparator rules', async () => {
    const rows = [
      { id: 1, name: 'Bravo', score: 20, dueDate: '2026-03-03', active: true },
      { id: 2, name: 'alpha', score: 15, dueDate: '2026-03-02', active: false },
      { id: 3, name: 'Charlie', score: 20, dueDate: '2026-03-01', active: false },
      { id: 4, name: 'delta', score: 8, dueDate: '2026-03-04', active: true }
    ];

    const provider = new LocalDataProvider(rows);
    const executor = new CooperativeSortExecutor();
    const columns = [
      { id: 'id', header: 'ID', width: 80, type: 'number' as const },
      { id: 'name', header: 'Name', width: 180, type: 'text' as const },
      { id: 'score', header: 'Score', width: 120, type: 'number' as const },
      { id: 'dueDate', header: 'Due Date', width: 160, type: 'date' as const },
      { id: 'active', header: 'Active', width: 100, type: 'boolean' as const }
    ];

    const single = await executor.execute(
      {
        opId: 'sort-1',
        rowCount: rows.length,
        sortModel: [{ columnId: 'score', direction: 'asc' }],
        columns,
        dataProvider: provider
      },
      { yieldInterval: 2048 }
    );

    expect(single.status).toBe('ok');
    if (single.status !== 'ok') {
      return;
    }
    expect(Array.from(single.result.mapping)).toEqual([3, 1, 0, 2]);

    const multi = await executor.execute(
      {
        opId: 'sort-2',
        rowCount: rows.length,
        sortModel: [
          { columnId: 'score', direction: 'desc' },
          { columnId: 'dueDate', direction: 'asc' }
        ],
        columns,
        dataProvider: provider
      },
      { yieldInterval: 2048 }
    );

    expect(multi.status).toBe('ok');
    if (multi.status !== 'ok') {
      return;
    }
    expect(Array.from(multi.result.mapping)).toEqual([2, 0, 1, 3]);
  });

  it('uses column comparator when provided', async () => {
    const rows = [
      { id: 1, label: 'bbb' },
      { id: 2, label: 'a' },
      { id: 3, label: 'cccc' }
    ];

    const executor = new CooperativeSortExecutor();
    const provider = new LocalDataProvider(rows);
    const response = await executor.execute(
      {
        opId: 'sort-custom',
        rowCount: rows.length,
        sortModel: [{ columnId: 'label', direction: 'asc' }],
        columns: [
          { id: 'id', header: 'ID', width: 80, type: 'number' },
          {
            id: 'label',
            header: 'Label',
            width: 200,
            type: 'text',
            comparator: (left, right) => String(left).length - String(right).length
          }
        ],
        dataProvider: provider
      },
      { yieldInterval: 2048 }
    );

    expect(response.status).toBe('ok');
    if (response.status !== 'ok') {
      return;
    }

    expect(Array.from(response.result.mapping)).toEqual([1, 0, 2]);
  });

  it('supports cancellation through execution context', async () => {
    const rowCount = 10_000;
    const rows = Array.from({ length: rowCount }, (_value, index) => ({
      id: index + 1,
      score: (rowCount - index) * 17
    }));

    const executor = new CooperativeSortExecutor();
    const provider = new LocalDataProvider(rows);

    let canceled = false;
    setTimeout(() => {
      canceled = true;
    }, 0);

    const response = await executor.execute(
      {
        opId: 'sort-cancel',
        rowCount,
        sortModel: [{ columnId: 'score', direction: 'asc' }],
        columns: [
          { id: 'id', header: 'ID', width: 80, type: 'number' },
          { id: 'score', header: 'Score', width: 140, type: 'number' }
        ],
        dataProvider: provider
      },
      {
        yieldInterval: 1024,
        isCanceled: () => canceled
      }
    );

    expect(response.status).toBe('canceled');
  });
});
