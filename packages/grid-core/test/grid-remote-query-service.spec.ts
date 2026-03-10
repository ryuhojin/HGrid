import { describe, expect, it, vi } from 'vitest';
import type { GridFilterModel } from '../src/data/filter-executor';
import { RowModel } from '../src/data/row-model';
import { GridRemoteQueryService } from '../src/core/grid-remote-query-service';

interface RemoteProviderMock {
  setQueryModel: ReturnType<typeof vi.fn>;
  getRowCount: () => number;
}

describe('GridRemoteQueryService', () => {
  it('creates a query model with server-side flags applied and cloned inputs', () => {
    const service = new GridRemoteQueryService();
    const sortModel = [{ columnId: 'score', direction: 'desc' as const }];
    const filterModel: GridFilterModel = {
      score: {
        kind: 'number',
        operator: 'gte',
        value: 80
      }
    };

    const queryModel = service.createQueryModel({
      sortModel,
      filterModel,
      groupModel: [{ columnId: 'region' }],
      pivotModel: [{ columnId: 'quarter' }],
      pivotValues: [{ columnId: 'sales', type: 'sum' }],
      useServerGrouping: true,
      useServerPivot: false
    });

    expect(queryModel).toEqual({
      sortModel: [{ columnId: 'score', direction: 'desc' }],
      filterModel: {
        score: {
          kind: 'number',
          operator: 'gte',
          value: 80
        }
      },
      groupModel: [{ columnId: 'region' }],
      pivotModel: undefined,
      pivotValues: undefined
    });
    expect(queryModel.sortModel).not.toBe(sortModel);
    expect(queryModel.filterModel).not.toBe(filterModel);
  });

  it('syncs query model to the remote provider and resets row model mappings', () => {
    const service = new GridRemoteQueryService();
    const rowModel = new RowModel(5);
    rowModel.setBaseViewToData(Int32Array.from([4, 3, 2, 1, 0]));
    rowModel.setFilterViewToData(Int32Array.from([4, 2]));

    const dataProvider: RemoteProviderMock = {
      setQueryModel: vi.fn(),
      getRowCount: () => 5
    };

    service.syncProviderState({
      dataProvider: dataProvider as never,
      rowModel,
      sortModel: [{ columnId: 'score', direction: 'asc' }],
      filterModel: {},
      groupModel: [],
      pivotModel: [],
      pivotValues: [],
      useServerGrouping: false,
      useServerPivot: false
    });

    expect(dataProvider.setQueryModel).toHaveBeenCalledWith({
      sortModel: [{ columnId: 'score', direction: 'asc' }],
      filterModel: {},
      groupModel: undefined,
      pivotModel: undefined,
      pivotValues: undefined
    });
    expect(rowModel.getState().rowCount).toBe(5);
    expect(rowModel.getDataIndex(0)).toBe(0);
    expect(rowModel.getViewRowCount()).toBe(5);
  });

  it('updates row count when the remote provider row count changes', () => {
    const service = new GridRemoteQueryService();
    const rowModel = new RowModel(3);

    service.syncRowModel(
      rowModel,
      {
        getRowCount: () => 7
      } as never
    );

    expect(rowModel.getState().rowCount).toBe(7);
    expect(rowModel.getViewRowCount()).toBe(7);
  });
});
