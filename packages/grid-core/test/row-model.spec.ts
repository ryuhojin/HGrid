import { describe, expect, it } from 'vitest';
import { RowModel } from '../src/data/row-model';

describe('RowModel', () => {
  it('uses identity mapping by default', () => {
    const rowModel = new RowModel(5);

    expect(rowModel.getViewRowCount()).toBe(5);
    expect(rowModel.getDataIndex(0)).toBe(0);
    expect(rowModel.getDataIndex(4)).toBe(4);
    expect(rowModel.getViewIndex(3)).toBe(3);
    expect(rowModel.getState().hasDataToViewIndex).toBe(false);
  });

  it('supports base order replacement and filter mapping separation', () => {
    const rowModel = new RowModel(6);

    rowModel.setBaseViewToData(Int32Array.from([2, 3, 4, 5, 0, 1]));
    expect(rowModel.getDataIndex(0)).toBe(2);
    expect(rowModel.getDataIndex(5)).toBe(1);

    rowModel.setFilterViewToData([4, 0, 1]);
    expect(rowModel.getViewRowCount()).toBe(3);
    expect(rowModel.getDataIndex(0)).toBe(4);
    expect(rowModel.getDataIndex(2)).toBe(1);
    expect(rowModel.getState().hasFilterMapping).toBe(true);

    rowModel.setFilterViewToData(null);
    expect(rowModel.getViewRowCount()).toBe(6);
    expect(rowModel.getDataIndex(0)).toBe(2);
    expect(rowModel.getState().hasFilterMapping).toBe(false);
  });

  it('can toggle dataToView index on and off', () => {
    const rowModel = new RowModel(8);
    rowModel.setBaseViewToData([7, 6, 5, 4, 3, 2, 1, 0]);

    expect(rowModel.getState().hasDataToViewIndex).toBe(false);
    expect(rowModel.getViewIndex(7)).toBe(0);

    rowModel.setOptions({ enableDataToViewIndex: true });
    expect(rowModel.getState().hasDataToViewIndex).toBe(true);
    expect(rowModel.getViewIndex(7)).toBe(0);
    expect(rowModel.getViewIndex(0)).toBe(7);

    rowModel.setOptions({ enableDataToViewIndex: false });
    expect(rowModel.getState().hasDataToViewIndex).toBe(false);
    expect(rowModel.getViewIndex(0)).toBe(7);
  });

  it('handles large row count without dataToView by default', () => {
    const rowModel = new RowModel(10_000_000);
    const state = rowModel.getState();

    expect(state.rowCount).toBe(10_000_000);
    expect(state.hasDataToViewIndex).toBe(false);
    expect(rowModel.getDataIndex(9_999_999)).toBe(9_999_999);
  });
});
