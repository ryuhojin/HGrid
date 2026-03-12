import { describe, expect, it } from 'vitest';
import { RowModel } from '../src/data/row-model';

function createReverseMapping(rowCount: number): Int32Array {
  const mapping = new Int32Array(rowCount);
  for (let viewIndex = 0; viewIndex < rowCount; viewIndex += 1) {
    mapping[viewIndex] = rowCount - 1 - viewIndex;
  }
  return mapping;
}

describe('RowModel', () => {
  it('uses identity mapping by default', () => {
    const rowModel = new RowModel(5);
    const state = rowModel.getState();

    expect(rowModel.getViewRowCount()).toBe(5);
    expect(rowModel.getDataIndex(0)).toBe(0);
    expect(rowModel.getDataIndex(4)).toBe(4);
    expect(rowModel.getViewIndex(3)).toBe(3);
    expect(state.hasDataToViewIndex).toBe(false);
    expect(state.baseMappingMode).toBe('identity');
    expect(state.estimatedMappingBytes).toBe(0);
  });

  it('supports base order replacement and filter mapping separation', () => {
    const rowModel = new RowModel(6);

    rowModel.setBaseViewToData(Int32Array.from([2, 3, 4, 5, 0, 1]));
    expect(rowModel.getDataIndex(0)).toBe(2);
    expect(rowModel.getDataIndex(5)).toBe(1);
    expect(rowModel.getState().baseMappingMode).toBe('materialized');

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

  it('can adopt trusted Int32Array mappings without cloning them', () => {
    const rowModel = new RowModel(6);
    const baseMapping = Int32Array.from([2, 3, 4, 5, 0, 1]);
    const filterMapping = Int32Array.from([4, 0, 1]);

    rowModel.setBaseViewToDataTrusted(baseMapping);
    rowModel.setFilterViewToDataTrusted(filterMapping);

    expect(rowModel.getActiveViewToData()).toBe(filterMapping);
    rowModel.setFilterViewToDataTrusted(null);
    expect(rowModel.getActiveViewToData()).toBe(baseMapping);
    expect(rowModel.getDataIndex(0)).toBe(2);
    expect(rowModel.getDataIndex(5)).toBe(1);
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
    expect(state.baseMappingMode).toBe('identity');
    expect(state.estimatedMappingBytes).toBe(0);
    expect(rowModel.getDataIndex(9_999_999)).toBe(9_999_999);
  });

  it('keeps 100M identity mapping lazy without materializing full Int32Array', () => {
    const rowModel = new RowModel(100_000_000);
    const state = rowModel.getState();

    expect(state.rowCount).toBe(100_000_000);
    expect(state.baseMappingMode).toBe('identity');
    expect(state.isBaseIdentityMapping).toBe(true);
    expect(state.hasFilterMapping).toBe(false);
    expect(state.estimatedMappingBytes).toBe(0);
    expect(rowModel.getDataIndex(0)).toBe(0);
    expect(rowModel.getDataIndex(99_999_999)).toBe(99_999_999);
    expect(rowModel.getViewIndex(99_999_999)).toBe(99_999_999);

    rowModel.setOptions({ enableDataToViewIndex: true });
    const indexedState = rowModel.getState();
    expect(indexedState.hasDataToViewIndex).toBe(true);
    expect(indexedState.isDataToViewIdentity).toBe(true);
    expect(indexedState.materializedDataToViewBytes).toBe(0);
    expect(rowModel.getViewIndex(42_424_242)).toBe(42_424_242);
  });

  it('supports sparse overrides on top of identity for 100M rows', () => {
    const rowCount = 100_000_000;
    const rowModel = new RowModel(rowCount);
    rowModel.setBaseSparseOverrides([
      { viewIndex: 0, dataIndex: rowCount - 1 },
      { viewIndex: rowCount - 1, dataIndex: 0 }
    ]);

    const state = rowModel.getState();
    expect(state.baseMappingMode).toBe('sparse');
    expect(state.sparseOverrideCount).toBe(2);
    expect(state.materializedBaseBytes).toBe(0);
    expect(rowModel.getDataIndex(0)).toBe(rowCount - 1);
    expect(rowModel.getDataIndex(rowCount - 1)).toBe(0);
    expect(rowModel.getViewIndex(rowCount - 1)).toBe(0);
    expect(rowModel.getViewIndex(0)).toBe(rowCount - 1);
    expect(rowModel.getDataIndex(12_345_678)).toBe(12_345_678);

    rowModel.clearBaseSparseOverrides();
    expect(rowModel.getState().baseMappingMode).toBe('identity');
    expect(rowModel.getState().sparseOverrideCount).toBe(0);
    expect(rowModel.getDataIndex(0)).toBe(0);
  });

  it('materializes mappings only when sort or filter is applied and releases on reset', () => {
    const rowCount = 200_000;
    const rowModel = new RowModel(rowCount);
    const reverseMapping = createReverseMapping(rowCount);
    const filterMapping = Int32Array.from({ length: 1_000 }, (_value, index) => reverseMapping[index]);

    for (let iteration = 0; iteration < 5; iteration += 1) {
      rowModel.setBaseViewToData(reverseMapping);
      const sortedState = rowModel.getState();
      expect(sortedState.baseMappingMode).toBe('materialized');
      expect(sortedState.materializedBaseBytes).toBe(rowCount * 4);
      expect(sortedState.estimatedMappingBytes).toBeGreaterThan(rowCount * 4 - 1);

      rowModel.setFilterViewToData(filterMapping);
      const filteredState = rowModel.getState();
      expect(filteredState.hasFilterMapping).toBe(true);
      expect(filteredState.materializedFilterBytes).toBe(filterMapping.length * 4);

      rowModel.setFilterViewToData(null);
      rowModel.resetToIdentity();
      const resetState = rowModel.getState();
      expect(resetState.baseMappingMode).toBe('identity');
      expect(resetState.hasFilterMapping).toBe(false);
      expect(resetState.materializedBaseBytes).toBe(0);
      expect(resetState.materializedFilterBytes).toBe(0);
      expect(resetState.materializedDataToViewBytes).toBe(0);
      expect(resetState.estimatedMappingBytes).toBe(0);
    }
  });

  it('resets materialized mappings to lazy identity when rowCount is switched to 100M', () => {
    const rowModel = new RowModel(200_000, { enableDataToViewIndex: true });
    const reverseMapping = createReverseMapping(200_000);
    const filterMapping = Int32Array.from({ length: 1_000 }, (_value, index) => reverseMapping[index]);

    rowModel.setBaseViewToData(reverseMapping);
    rowModel.setFilterViewToData(filterMapping);
    expect(rowModel.getState().estimatedMappingBytes).toBeGreaterThan(0);

    rowModel.setRowCount(100_000_000);
    const state = rowModel.getState();
    expect(state.rowCount).toBe(100_000_000);
    expect(state.viewRowCount).toBe(100_000_000);
    expect(state.baseMappingMode).toBe('identity');
    expect(state.hasFilterMapping).toBe(false);
    expect(state.hasDataToViewIndex).toBe(true);
    expect(state.isDataToViewIdentity).toBe(true);
    expect(state.materializedBaseBytes).toBe(0);
    expect(state.materializedFilterBytes).toBe(0);
    expect(state.materializedDataToViewBytes).toBe(0);
    expect(state.estimatedMappingBytes).toBe(0);
    expect(rowModel.getDataIndex(99_999_999)).toBe(99_999_999);
    expect(rowModel.getViewIndex(99_999_999)).toBe(99_999_999);
  });

  it('rejects invalid sparse overrides that break permutation invariants', () => {
    const rowModel = new RowModel(10);

    expect(() =>
      rowModel.setBaseSparseOverrides([
        { viewIndex: 0, dataIndex: 9 },
        { viewIndex: 1, dataIndex: 8 }
      ])
    ).toThrow('Sparse overrides must preserve permutation');
  });
});
