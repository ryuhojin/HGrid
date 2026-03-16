import type { RemoteDataProviderDebugState } from '../data/remote-data-provider';
import type { GridSelection, SelectionCellPosition } from '../interaction/selection-model';
import {
  resolvePrimarySelectionRectangle,
  type SelectionBounds,
  type SelectionRectangle
} from './dom-renderer-selection-clipboard';

export interface StatusBarSelectionSummary {
  kind: 'none' | 'cells' | 'rows';
  selectedCellCount: number;
  selectedRowCount: number;
  selectionRectangle: SelectionRectangle | null;
}

export interface StatusBarAggregateSummary {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  isComputing?: boolean;
  processedCellCount?: number;
  totalCellCount?: number;
}

export interface StatusBarAggregateComputationOptions {
  isNumericColumn: (columnIndex: number) => boolean;
  readNumericCell: (rowIndex: number, columnIndex: number) => unknown;
  chunkSize?: number;
  shouldContinue?: () => boolean;
  onProgress?: (summary: StatusBarAggregateSummary) => void;
  scheduler?: () => Promise<void>;
}

export interface StatusBarRowsSummary {
  visibleRowCount: number;
  viewRowCount: number;
  sourceRowCount: number;
  isFiltered: boolean;
}

export interface StatusBarRemoteSummary {
  loadingCount: number;
  refreshingCount: number;
  errorCount: number;
  inFlightCount: number;
  pendingRowCount: number;
  pendingCellCount: number;
  isBusy: boolean;
  hasError: boolean;
  isPending: boolean;
}

export function resolveStatusBarSelectionSummary(
  bounds: SelectionBounds,
  selection: GridSelection,
  fallbackActiveCell: SelectionCellPosition | null
): StatusBarSelectionSummary {
  let selectedRowCount = 0;

  for (let rangeIndex = 0; rangeIndex < selection.rowRanges.length; rangeIndex += 1) {
    const range = selection.rowRanges[rangeIndex];
    selectedRowCount += Math.max(0, range.r2 - range.r1 + 1);
  }

  if (selection.cellRanges.length === 0 && selection.rowRanges.length > 0 && selectedRowCount > 0) {
    return {
      kind: 'rows',
      selectedCellCount: 0,
      selectedRowCount,
      selectionRectangle: null
    };
  }

  const selectionRectangle = resolvePrimarySelectionRectangle(bounds, selection, fallbackActiveCell);
  const selectedCellCount = selectionRectangle
    ? (selectionRectangle.endRow - selectionRectangle.startRow + 1) * (selectionRectangle.endCol - selectionRectangle.startCol + 1)
    : 0;

  if (selection.cellRanges.length > 0 || selectedCellCount > 0) {
    return {
      kind: 'cells',
      selectedCellCount,
      selectedRowCount,
      selectionRectangle
    };
  }

  return {
    kind: 'none',
    selectedCellCount: 0,
    selectedRowCount: 0,
    selectionRectangle
  };
}

export function computeSelectionAggregateSummary(
  selectionRectangle: SelectionRectangle | null,
  options: {
    isNumericColumn: (columnIndex: number) => boolean;
    readNumericCell: (rowIndex: number, columnIndex: number) => unknown;
  }
): StatusBarAggregateSummary | null {
  if (!selectionRectangle) {
    return null;
  }

  let count = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let rowIndex = selectionRectangle.startRow; rowIndex <= selectionRectangle.endRow; rowIndex += 1) {
    for (let columnIndex = selectionRectangle.startCol; columnIndex <= selectionRectangle.endCol; columnIndex += 1) {
      if (!options.isNumericColumn(columnIndex)) {
        continue;
      }

      const rawValue = options.readNumericCell(rowIndex, columnIndex);
      const value =
        typeof rawValue === 'number'
          ? rawValue
          : typeof rawValue === 'bigint'
            ? Number(rawValue)
            : rawValue === null || rawValue === undefined || rawValue === ''
              ? Number.NaN
              : Number(rawValue);

      if (!Number.isFinite(value)) {
        continue;
      }

      count += 1;
      sum += value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  if (count === 0) {
    return null;
  }

  return {
    count,
    sum,
    avg: sum / count,
    min,
    max
  };
}

function createResolvedScheduler(scheduler?: () => Promise<void>): () => Promise<void> {
  if (typeof scheduler === 'function') {
    return scheduler;
  }

  return () => new Promise((resolve) => setTimeout(resolve, 0));
}

export async function computeSelectionAggregateSummaryChunked(
  selectionRectangle: SelectionRectangle | null,
  options: StatusBarAggregateComputationOptions
): Promise<StatusBarAggregateSummary | null> {
  if (!selectionRectangle) {
    return null;
  }

  const totalCellCount =
    (selectionRectangle.endRow - selectionRectangle.startRow + 1) * (selectionRectangle.endCol - selectionRectangle.startCol + 1);
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? totalCellCount));
  const shouldContinue = typeof options.shouldContinue === 'function' ? options.shouldContinue : () => true;
  const scheduler = createResolvedScheduler(options.scheduler);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  let count = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let processedCellCount = 0;

  for (let rowIndex = selectionRectangle.startRow; rowIndex <= selectionRectangle.endRow; rowIndex += 1) {
    for (let columnIndex = selectionRectangle.startCol; columnIndex <= selectionRectangle.endCol; columnIndex += 1) {
      if (!shouldContinue()) {
        return null;
      }

      processedCellCount += 1;
      if (options.isNumericColumn(columnIndex)) {
        const rawValue = options.readNumericCell(rowIndex, columnIndex);
        const value =
          typeof rawValue === 'number'
            ? rawValue
            : typeof rawValue === 'bigint'
              ? Number(rawValue)
              : rawValue === null || rawValue === undefined || rawValue === ''
                ? Number.NaN
                : Number(rawValue);

        if (Number.isFinite(value)) {
          count += 1;
          sum += value;
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      }

      if (processedCellCount < totalCellCount && processedCellCount % chunkSize === 0) {
        if (onProgress) {
          onProgress({
            count,
            sum,
            avg: count > 0 ? sum / count : 0,
            min: count > 0 ? min : 0,
            max: count > 0 ? max : 0,
            isComputing: true,
            processedCellCount,
            totalCellCount
          });
        }
        await scheduler();
      }
    }
  }

  if (count === 0) {
    return null;
  }

  return {
    count,
    sum,
    avg: sum / count,
    min,
    max,
    processedCellCount: totalCellCount,
    totalCellCount
  };
}

export function resolveStatusBarRowsSummary(
  viewRowCount: number,
  sourceRowCount: number,
  visibleRowRange: { startRow: number; endRow: number } | null
): StatusBarRowsSummary {
  const visibleRowCount = visibleRowRange ? Math.max(0, visibleRowRange.endRow - visibleRowRange.startRow + 1) : 0;
  return {
    visibleRowCount,
    viewRowCount: Math.max(0, viewRowCount),
    sourceRowCount: Math.max(0, sourceRowCount),
    isFiltered: Math.max(0, viewRowCount) !== Math.max(0, sourceRowCount)
  };
}

export function resolveStatusBarRemoteSummary(
  debugState: RemoteDataProviderDebugState | null | undefined
): StatusBarRemoteSummary | null {
  if (!debugState) {
    return null;
  }

  const loadingCount = debugState.loadingBlockIndexes.length;
  const refreshingCount = debugState.refreshingBlockIndexes.length;
  const errorCount = debugState.errorBlockIndexes.length;
  const pendingRowCount = debugState.pendingChangeSummary.rowCount;
  const pendingCellCount = debugState.pendingChangeSummary.cellCount;

  return {
    loadingCount,
    refreshingCount,
    errorCount,
    inFlightCount: debugState.inFlightOperations,
    pendingRowCount,
    pendingCellCount,
    isBusy: loadingCount > 0 || refreshingCount > 0 || debugState.inFlightOperations > 0,
    hasError: errorCount > 0,
    isPending: pendingRowCount > 0 || pendingCellCount > 0
  };
}
