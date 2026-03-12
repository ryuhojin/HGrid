import { describe, expect, it } from 'vitest';
import { GridDataPipelineService, type GridDataPipelineState } from '../src/core/grid-data-pipeline-service';
import type { GridDerivedViewRowModelPort } from '../src/core/grid-internal-contracts';
import { GroupedDataProvider } from '../src/data/grouped-data-provider';
import { LocalDataProvider } from '../src/data/local-data-provider';
import { RowModel } from '../src/data/row-model';
import { TREE_ROW_TREE_COLUMN_ID_FIELD, TreeDataProvider } from '../src/data/tree-data-provider';

describe('GridDataPipelineService', () => {
  it('applies flat view mappings and clears derived artifacts', () => {
    const service = new GridDataPipelineService();
    const sourceDataProvider = new LocalDataProvider([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
      { id: 4, name: 'D' }
    ]);
    const rowModel = new RowModel(4);

    const result = service.applyFlatView({
      sourceDataProvider,
      rowModel,
      sortMapping: Int32Array.from([3, 2, 1, 0]),
      filterMapping: Int32Array.from([3, 1])
    });

    expect(result.dataProvider).toBe(sourceDataProvider);
    expect(result.nextState).toEqual(service.createEmptyState());
    expect(rowModel.getState().rowCount).toBe(4);
    expect(rowModel.getViewRowCount()).toBe(2);
    expect(rowModel.getDataIndex(0)).toBe(3);
    expect(rowModel.getDataIndex(1)).toBe(1);
  });

  it('uses trusted row-model mapping hooks for Int32Array flat mappings', () => {
    const service = new GridDataPipelineService();
    const sourceDataProvider = new LocalDataProvider([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const calls: string[] = [];
    const rowModel: GridDerivedViewRowModelPort = {
      getState: () => ({
        rowCount: 3,
        viewRowCount: 3,
        hasFilterMapping: false,
        hasDataToViewIndex: false,
        isBaseIdentityMapping: true,
        isDataToViewIdentity: true,
        isDataToViewSparse: false,
        baseMappingMode: 'identity',
        sparseOverrideCount: 0,
        materializedBaseBytes: 0,
        materializedFilterBytes: 0,
        materializedDataToViewBytes: 0,
        sparseBytes: 0,
        estimatedMappingBytes: 0
      }),
      setRowCount: () => {
        calls.push('setRowCount');
      },
      setBaseViewToData: () => {
        calls.push('setBaseViewToData');
      },
      setBaseViewToDataTrusted: () => {
        calls.push('setBaseViewToDataTrusted');
      },
      setBaseIdentityMapping: () => {
        calls.push('setBaseIdentityMapping');
      },
      setFilterViewToData: () => {
        calls.push('setFilterViewToData');
      },
      setFilterViewToDataTrusted: () => {
        calls.push('setFilterViewToDataTrusted');
      }
    };

    service.applyFlatView({
      sourceDataProvider,
      rowModel,
      sortMapping: Int32Array.from([2, 1, 0]),
      filterMapping: Int32Array.from([2, 0])
    });

    expect(calls).toContain('setBaseViewToDataTrusted');
    expect(calls).toContain('setFilterViewToDataTrusted');
    expect(calls).not.toContain('setBaseViewToData');
    expect(calls).not.toContain('setFilterViewToData');
  });

  it('applies grouping result and reuses grouped provider instances', () => {
    const service = new GridDataPipelineService();
    const sourceDataProvider = new LocalDataProvider([
      { id: 1, region: 'APAC', sales: 10 },
      { id: 2, region: 'APAC', sales: 20 }
    ]);
    const rowModel = new RowModel(2);
    const groupedDataProvider = new GroupedDataProvider(sourceDataProvider);
    const state: GridDataPipelineState = {
      ...service.createEmptyState(),
      groupedDataProvider
    };

    const result = service.applyGroupingResult({
      state,
      sourceDataProvider,
      rowModel,
      result: {
        opId: 'group-1',
        rows: [
          {
            kind: 'group',
            groupKey: 'region:APAC',
            level: 0,
            columnId: 'region',
            value: 'APAC',
            leafCount: 2,
            isExpanded: true,
            values: { region: 'APAC', sales: 30 }
          },
          { kind: 'data', dataIndex: 0 },
          { kind: 'data', dataIndex: 1 }
        ],
        groupKeys: ['region:APAC']
      }
    });

    expect(result.nextState.groupedDataProvider).toBe(groupedDataProvider);
    expect(result.dataProvider).toBe(groupedDataProvider);
    expect(result.nextState.groupKeys).toEqual(['region:APAC']);
    expect(result.nextState.treeRows).toEqual([]);
    expect(rowModel.getState().rowCount).toBe(3);
    expect(rowModel.getViewRowCount()).toBe(3);
    expect(result.dataProvider.getRowKey(0)).toBe('group:region:APAC');
    expect(result.dataProvider.getRowKey(1)).toBe(1);
  });

  it('applies pivot result with a local derived provider', () => {
    const service = new GridDataPipelineService();
    const rowModel = new RowModel(3);

    const result = service.applyPivotResult({
      rowModel,
      result: {
        opId: 'pivot-1',
        columns: [],
        rows: [
          {
            __pivot_row_key: 'region:APAC',
            region: 'APAC',
            sales_sum: 30
          }
        ],
        rowGroupColumnIds: ['region'],
        pivotColumnCount: 1,
        pivotKeyCount: 1,
        sourceRowCount: 3
      }
    });

    expect(result.nextState.pivotDataProvider).toBeInstanceOf(LocalDataProvider);
    expect(result.nextState.groupRows).toEqual([]);
    expect(result.nextState.treeRows).toEqual([]);
    expect(result.dataProvider.getRowCount()).toBe(1);
    expect(result.dataProvider.getRowKey(0)).toBe('region:APAC');
    expect(rowModel.getState().rowCount).toBe(1);
    expect(rowModel.getViewRowCount()).toBe(1);
    expect(rowModel.getDataIndex(0)).toBe(0);
  });

  it('applies tree result and reuses tree provider instances', () => {
    const service = new GridDataPipelineService();
    const sourceDataProvider = new LocalDataProvider([{ id: 1, name: 'Root' }]);
    const rowModel = new RowModel(1);
    const treeDataProvider = new TreeDataProvider(sourceDataProvider);
    const state: GridDataPipelineState = {
      ...service.createEmptyState(),
      treeDataProvider
    };

    const result = service.applyTreeResult({
      state,
      sourceDataProvider,
      rowModel,
      treeColumnId: 'name',
      result: {
        opId: 'tree-1',
        rows: [
          {
            kind: 'tree',
            nodeKey: 1,
            parentNodeKey: null,
            sourceDataIndex: 0,
            depth: 0,
            hasChildren: false,
            isExpanded: true,
            localRow: null
          }
        ],
        nodeKeys: [1],
        nodeKeyTokens: ['number:1']
      }
    });

    expect(result.nextState.treeDataProvider).toBe(treeDataProvider);
    expect(result.dataProvider).toBe(treeDataProvider);
    expect(result.nextState.treeNodeKeys).toEqual([1]);
    expect(result.nextState.groupRows).toEqual([]);
    expect(rowModel.getState().rowCount).toBe(1);
    expect(rowModel.getViewRowCount()).toBe(1);
    expect(result.dataProvider.getValue(0, TREE_ROW_TREE_COLUMN_ID_FIELD)).toBe('name');
  });
});
