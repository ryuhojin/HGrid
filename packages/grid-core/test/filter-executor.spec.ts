import { describe, expect, it } from 'vitest';
import { LocalDataProvider } from '../src/data/local-data-provider';
import { CooperativeFilterExecutor } from '../src/data/filter-executor';

describe('CooperativeFilterExecutor', () => {
  it('filters by text/number/date/set and keeps source order', async () => {
    const rows = [
      { id: 1, name: 'Alpha', score: 30, dueDate: '2026-03-01', region: 'KR' },
      { id: 2, name: 'Bravo', score: 10, dueDate: '2026-03-02', region: 'US' },
      { id: 3, name: 'alpha-beta', score: 20, dueDate: '2026-03-03', region: 'JP' },
      { id: 4, name: 'Delta', score: 30, dueDate: '2026-03-04', region: 'DE' }
    ];

    const provider = new LocalDataProvider(rows);
    const executor = new CooperativeFilterExecutor();
    const columns = [
      { id: 'id', header: 'ID', width: 80, type: 'number' as const },
      { id: 'name', header: 'Name', width: 220, type: 'text' as const },
      { id: 'score', header: 'Score', width: 140, type: 'number' as const },
      { id: 'dueDate', header: 'Due Date', width: 180, type: 'date' as const },
      { id: 'region', header: 'Region', width: 120, type: 'text' as const }
    ];

    const response = await executor.execute(
      {
        opId: 'filter-1',
        rowCount: rows.length,
        filterModel: {
          name: { kind: 'text', value: 'alpha', operator: 'contains' },
          score: { kind: 'number', operator: 'gte', value: 20 },
          dueDate: { kind: 'date', operator: 'between', min: '2026-03-01', max: '2026-03-03' },
          region: { kind: 'set', values: ['KR', 'JP'] }
        },
        columns,
        dataProvider: provider,
        sourceOrder: Int32Array.from([3, 2, 1, 0])
      },
      {
        yieldInterval: 1024
      }
    );

    expect(response.status).toBe('ok');
    if (response.status !== 'ok') {
      return;
    }

    expect(Array.from(response.result.mapping)).toEqual([2, 0]);
  });

  it('returns full source order when filter model is empty', async () => {
    const rows = [
      { id: 1, score: 30 },
      { id: 2, score: 20 },
      { id: 3, score: 10 }
    ];

    const executor = new CooperativeFilterExecutor();
    const response = await executor.execute({
      opId: 'filter-empty',
      rowCount: rows.length,
      filterModel: {},
      columns: [
        { id: 'id', header: 'ID', width: 80, type: 'number' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      dataProvider: new LocalDataProvider(rows),
      sourceOrder: Int32Array.from([2, 0, 1])
    });

    expect(response.status).toBe('ok');
    if (response.status !== 'ok') {
      return;
    }

    expect(Array.from(response.result.mapping)).toEqual([2, 0, 1]);
  });

  it('supports nested cross-column advanced filter groups with top-level OR semantics', async () => {
    const rows = [
      { id: 1, name: 'Alpha', region: 'KR', score: 30 },
      { id: 2, name: 'Beta', region: 'US', score: 10 },
      { id: 3, name: 'Gamma', region: 'JP', score: 20 },
      { id: 4, name: 'Delta', region: 'DE', score: 40 }
    ];

    const executor = new CooperativeFilterExecutor();
    const response = await executor.execute({
      opId: 'filter-advanced',
      rowCount: rows.length,
      filterModel: {
        score: { kind: 'number', operator: 'gte', value: 20 }
      },
      advancedFilterModel: {
        operator: 'or',
        rules: [
          {
            kind: 'group',
            operator: 'and',
            rules: [
              {
                columnId: 'name',
                condition: {
                  kind: 'text',
                  operator: 'contains',
                  value: 'mm'
                }
              },
              {
                columnId: 'region',
                condition: {
                  kind: 'text',
                  operator: 'equals',
                  value: 'JP'
                }
              }
            ]
          },
          {
            columnId: 'name',
            condition: {
              kind: 'text',
              operator: 'contains',
              value: 'ta'
            }
          }
        ]
      },
      columns: [
        { id: 'id', header: 'ID', width: 80, type: 'number' },
        { id: 'name', header: 'Name', width: 160, type: 'text' },
        { id: 'region', header: 'Region', width: 120, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      dataProvider: new LocalDataProvider(rows)
    });

    expect(response.status).toBe('ok');
    if (response.status !== 'ok') {
      return;
    }

    expect(Array.from(response.result.mapping)).toEqual([2, 3]);
  });

  it('supports cancellation through execution context', async () => {
    const rowCount = 20_000;
    const rows = Array.from({ length: rowCount }, (_value, index) => ({
      id: index + 1,
      score: index % 1_000,
      region: ['KR', 'US', 'JP', 'DE'][index % 4]
    }));

    const executor = new CooperativeFilterExecutor();
    const provider = new LocalDataProvider(rows);
    let canceled = false;

    setTimeout(() => {
      canceled = true;
    }, 0);

    const response = await executor.execute(
      {
        opId: 'filter-cancel',
        rowCount,
        filterModel: {
          score: { kind: 'number', operator: 'gte', value: 300 },
          region: { kind: 'set', values: ['KR', 'US'] }
        },
        columns: [
          { id: 'id', header: 'ID', width: 80, type: 'number' },
          { id: 'score', header: 'Score', width: 120, type: 'number' },
          { id: 'region', header: 'Region', width: 120, type: 'text' }
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
