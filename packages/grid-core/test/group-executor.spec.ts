import { describe, expect, it } from 'vitest';
import { LocalDataProvider } from '../src/data/local-data-provider';
import { CooperativeGroupExecutor } from '../src/data/group-executor';

describe('CooperativeGroupExecutor', () => {
  it('builds grouped rows with aggregations and expansion state', async () => {
    const rows = [
      { id: 1, region: 'KR', locale: 'ko-KR', score: 10 },
      { id: 2, region: 'KR', locale: 'ko-KR', score: 15 },
      { id: 3, region: 'US', locale: 'en-US', score: 7 },
      { id: 4, region: 'US', locale: 'en-US', score: 5 },
      { id: 5, region: 'US', locale: 'es-US', score: 3 }
    ];

    const columns = [
      { id: 'id', header: 'ID', width: 80, type: 'number' as const },
      { id: 'region', header: 'Region', width: 120, type: 'text' as const },
      { id: 'locale', header: 'Locale', width: 160, type: 'text' as const },
      { id: 'score', header: 'Score', width: 120, type: 'number' as const }
    ];

    const executor = new CooperativeGroupExecutor();
    const provider = new LocalDataProvider(rows);

    const expandedResponse = await executor.execute(
      {
        opId: 'group-expanded',
        rowCount: rows.length,
        groupModel: [{ columnId: 'region' }, { columnId: 'locale' }],
        aggregations: [
          { columnId: 'score', type: 'sum' },
          { columnId: 'id', type: 'count' }
        ],
        columns,
        dataProvider: provider,
        defaultExpanded: true
      },
      {
        yieldInterval: 1024
      }
    );

    expect(expandedResponse.status).toBe('ok');
    if (expandedResponse.status !== 'ok') {
      return;
    }

    const expandedRows = expandedResponse.result.rows;
    const groupRows = expandedRows.filter((row) => row.kind === 'group');
    const dataRows = expandedRows.filter((row) => row.kind === 'data');
    expect(groupRows.length).toBeGreaterThan(0);
    expect(dataRows.length).toBe(rows.length);

    const firstGroupRow = groupRows[0];
    if (firstGroupRow.kind !== 'group') {
      return;
    }

    expect(firstGroupRow.columnId).toBe('region');
    expect(firstGroupRow.values.score).toBe(25);
    expect(firstGroupRow.values.id).toBe(2);

    const collapseKey = firstGroupRow.groupKey;
    const collapsedResponse = await executor.execute(
      {
        opId: 'group-collapsed',
        rowCount: rows.length,
        groupModel: [{ columnId: 'region' }, { columnId: 'locale' }],
        aggregations: [{ columnId: 'score', type: 'sum' }],
        columns,
        dataProvider: provider,
        groupExpansionState: {
          [collapseKey]: false
        },
        defaultExpanded: true
      },
      {
        yieldInterval: 1024
      }
    );

    expect(collapsedResponse.status).toBe('ok');
    if (collapsedResponse.status !== 'ok') {
      return;
    }

    const collapsedRows = collapsedResponse.result.rows;
    const collapsedGroupRowIndex = collapsedRows.findIndex(
      (row) => row.kind === 'group' && row.groupKey === collapseKey
    );
    expect(collapsedGroupRowIndex).toBeGreaterThanOrEqual(0);

    const nextRow = collapsedRows[collapsedGroupRowIndex + 1];
    if (!nextRow) {
      throw new Error('Expected row after collapsed group row');
    }

    expect(nextRow.kind).toBe('group');
  });

  it('supports custom reducer and cancellation', async () => {
    const rowCount = 20_000;
    const rows = Array.from({ length: rowCount }, (_value, index) => ({
      id: index + 1,
      region: index % 2 === 0 ? 'KR' : 'US',
      score: index % 100
    }));

    const columns = [
      { id: 'id', header: 'ID', width: 80, type: 'number' as const },
      { id: 'region', header: 'Region', width: 120, type: 'text' as const },
      { id: 'score', header: 'Score', width: 120, type: 'number' as const }
    ];

    const provider = new LocalDataProvider(rows);
    const executor = new CooperativeGroupExecutor();

    const customResponse = await executor.execute({
      opId: 'group-custom',
      rowCount,
      groupModel: [{ columnId: 'region' }],
      aggregations: [
        {
          columnId: 'score',
          reducer: (values) => values.reduce<number>((accumulator, value) => accumulator + Number(value ?? 0), 0)
        }
      ],
      columns,
      dataProvider: provider
    });

    expect(customResponse.status).toBe('ok');

    let canceled = false;
    setTimeout(() => {
      canceled = true;
    }, 0);

    const canceledResponse = await executor.execute(
      {
        opId: 'group-canceled',
        rowCount,
        groupModel: [{ columnId: 'region' }, { columnId: 'score' }],
        aggregations: [{ columnId: 'id', type: 'count' }],
        columns,
        dataProvider: provider
      },
      {
        yieldInterval: 1024,
        isCanceled: () => canceled
      }
    );

    expect(canceledResponse.status).toBe('canceled');
  });
});
