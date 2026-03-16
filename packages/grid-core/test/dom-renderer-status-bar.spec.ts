import { describe, expect, it } from 'vitest';
import type { GridSelection } from '../src/interaction/selection-model';
import {
  computeSelectionAggregateSummaryChunked,
  computeSelectionAggregateSummary,
  resolveStatusBarRemoteSummary,
  resolveStatusBarRowsSummary,
  resolveStatusBarSelectionSummary
} from '../src/render/dom-renderer-status-bar';

function createSelection(selection?: Partial<GridSelection>): GridSelection {
  return {
    activeCell: null,
    cellRanges: [],
    rowRanges: [],
    ...selection
  };
}

describe('dom-renderer-status-bar', () => {
  it('summarizes cell selections and computes numeric aggregates', () => {
    const selectionSummary = resolveStatusBarSelectionSummary(
      {
        rowCount: 6,
        columnCount: 4
      },
      createSelection({
        activeCell: { rowIndex: 1, colIndex: 1 },
        cellRanges: [{ r1: 1, c1: 1, r2: 2, c2: 3 }]
      }),
      null
    );

    expect(selectionSummary.kind).toBe('cells');
    expect(selectionSummary.selectedCellCount).toBe(6);

    const aggregateSummary = computeSelectionAggregateSummary(selectionSummary.selectionRectangle, {
      isNumericColumn: (columnIndex) => columnIndex === 1 || columnIndex === 2,
      readNumericCell: (rowIndex, columnIndex) => rowIndex * 10 + columnIndex
    });

    expect(aggregateSummary).toEqual({
      count: 4,
      sum: 66,
      avg: 16.5,
      min: 11,
      max: 22
    });
  });

  it('prefers row selection summary when indicator selection is active', () => {
    const selectionSummary = resolveStatusBarSelectionSummary(
      {
        rowCount: 20,
        columnCount: 5
      },
      createSelection({
        activeCell: { rowIndex: 3, colIndex: 0 },
        rowRanges: [{ r1: 3, r2: 6, rowKeyStart: 'r3', rowKeyEnd: 'r6' }]
      }),
      null
    );

    expect(selectionSummary.kind).toBe('rows');
    expect(selectionSummary.selectedRowCount).toBe(4);
    expect(selectionSummary.selectedCellCount).toBe(0);
  });

  it('derives visible and filtered row counts', () => {
    expect(
      resolveStatusBarRowsSummary(24, 100, {
        startRow: 4,
        endRow: 15
      })
    ).toEqual({
      visibleRowCount: 12,
      viewRowCount: 24,
      sourceRowCount: 100,
      isFiltered: true
    });
  });

  it('derives remote sync summary from debug state', () => {
    expect(
      resolveStatusBarRemoteSummary({
        rowCount: 120,
        blockSize: 20,
        maxBlocks: 8,
        prefetchBlocks: 1,
        cachedBlockIndexes: [0, 1],
        loadingBlockIndexes: [2],
        refreshingBlockIndexes: [1],
        errorBlockIndexes: [4],
        blockStates: [],
        queryModel: {
          sortModel: [],
          filterModel: {}
        },
        lastQueryChange: {
          scope: 'filter',
          changedKeys: ['filter'],
          invalidationPolicy: 'full'
        },
        inFlightOperations: 2,
        pendingChangeSummary: {
          rowCount: 3,
          cellCount: 5,
          rowKeys: [101, 102, 103]
        },
        pivotResultColumnIds: []
      })
    ).toEqual({
      loadingCount: 1,
      refreshingCount: 1,
      errorCount: 1,
      inFlightCount: 2,
      pendingRowCount: 3,
      pendingCellCount: 5,
      isBusy: true,
      hasError: true,
      isPending: true
    });
  });

  it('computes aggregate summaries in chunks and reports progress', async () => {
    const progressSummaries: Array<{
      processedCellCount: number | undefined;
      totalCellCount: number | undefined;
      isComputing: boolean | undefined;
    }> = [];
    const result = await computeSelectionAggregateSummaryChunked(
      {
        startRow: 0,
        endRow: 2,
        startCol: 0,
        endCol: 1
      },
      {
        chunkSize: 2,
        isNumericColumn: () => true,
        readNumericCell: (rowIndex, columnIndex) => rowIndex * 10 + columnIndex,
        onProgress: (summary) => {
          progressSummaries.push({
            processedCellCount: summary.processedCellCount,
            totalCellCount: summary.totalCellCount,
            isComputing: summary.isComputing
          });
        },
        scheduler: async () => undefined
      }
    );

    expect(progressSummaries).toEqual([
      {
        processedCellCount: 2,
        totalCellCount: 6,
        isComputing: true
      },
      {
        processedCellCount: 4,
        totalCellCount: 6,
        isComputing: true
      }
    ]);
    expect(result).toEqual({
      count: 6,
      sum: 63,
      avg: 10.5,
      min: 0,
      max: 21,
      processedCellCount: 6,
      totalCellCount: 6
    });
  });

  it('cancels chunked aggregate computation when continuation stops', async () => {
    let shouldContinue = true;
    const result = await computeSelectionAggregateSummaryChunked(
      {
        startRow: 0,
        endRow: 4,
        startCol: 0,
        endCol: 0
      },
      {
        chunkSize: 2,
        isNumericColumn: () => true,
        readNumericCell: (rowIndex) => rowIndex + 1,
        onProgress: () => {
          shouldContinue = false;
        },
        shouldContinue: () => shouldContinue,
        scheduler: async () => undefined
      }
    );

    expect(result).toBeNull();
  });
});
