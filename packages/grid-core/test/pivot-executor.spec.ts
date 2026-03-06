import { describe, expect, it } from 'vitest';
import { LocalDataProvider } from '../src/data/local-data-provider';
import { CooperativePivotExecutor } from '../src/data/pivot-executor';

describe('CooperativePivotExecutor', () => {
  it('builds pivot columns and aggregated rows', async () => {
    const rows = [
      { id: 1, region: 'KR', month: 'Jan', sales: 100 },
      { id: 2, region: 'KR', month: 'Feb', sales: 40 },
      { id: 3, region: 'KR', month: 'Jan', sales: 60 },
      { id: 4, region: 'US', month: 'Jan', sales: 30 },
      { id: 5, region: 'US', month: 'Feb', sales: 70 }
    ];

    const provider = new LocalDataProvider(rows);
    const executor = new CooperativePivotExecutor();
    const response = await executor.execute({
      opId: 'pivot-basic',
      rowCount: rows.length,
      columns: [
        { id: 'id', header: 'ID', width: 90, type: 'number' },
        { id: 'region', header: 'Region', width: 120, type: 'text' },
        { id: 'month', header: 'Month', width: 120, type: 'text' },
        { id: 'sales', header: 'Sales', width: 120, type: 'number' }
      ],
      dataProvider: provider,
      rowGroupModel: [{ columnId: 'region' }],
      pivotModel: [{ columnId: 'month' }],
      pivotValues: [{ columnId: 'sales', type: 'sum' }]
    });

    expect(response.status).toBe('ok');
    if (response.status !== 'ok') {
      return;
    }

    expect(response.result.columns.length).toBe(3);
    expect(response.result.columns[0].id).toBe('region');
    expect(response.result.columns[1].header).toBe('Jan (sum)');
    expect(response.result.columns[2].header).toBe('Feb (sum)');

    expect(response.result.rows.length).toBe(2);
    const krRow = response.result.rows.find((row) => row.region === 'KR');
    const usRow = response.result.rows.find((row) => row.region === 'US');
    expect(krRow).toBeTruthy();
    expect(usRow).toBeTruthy();
    if (!krRow || !usRow) {
      return;
    }

    const janColumnId = response.result.columns[1].id;
    const febColumnId = response.result.columns[2].id;
    expect(krRow[janColumnId]).toBe(160);
    expect(krRow[febColumnId]).toBe(40);
    expect(usRow[janColumnId]).toBe(30);
    expect(usRow[febColumnId]).toBe(70);
  });

  it('supports cancellation', async () => {
    const rows = Array.from({ length: 20_000 }, (_, index) => ({
      id: index + 1,
      region: index % 2 === 0 ? 'KR' : 'US',
      month: index % 3 === 0 ? 'Jan' : 'Feb',
      sales: index
    }));

    const provider = new LocalDataProvider(rows);
    const executor = new CooperativePivotExecutor();
    let canceled = false;
    setTimeout(() => {
      canceled = true;
    }, 0);

    const response = await executor.execute(
      {
        opId: 'pivot-cancel',
        rowCount: rows.length,
        columns: [
          { id: 'id', header: 'ID', width: 90, type: 'number' },
          { id: 'region', header: 'Region', width: 120, type: 'text' },
          { id: 'month', header: 'Month', width: 120, type: 'text' },
          { id: 'sales', header: 'Sales', width: 120, type: 'number' }
        ],
        dataProvider: provider,
        rowGroupModel: [{ columnId: 'region' }],
        pivotModel: [{ columnId: 'month' }],
        pivotValues: [{ columnId: 'sales', type: 'sum' }]
      },
      {
        yieldInterval: 1024,
        isCanceled: () => canceled
      }
    );

    expect(response.status).toBe('canceled');
  });
});
