import type { SelectionCellPosition } from '../interaction/selection-model';
import type { GridRangeHandleMode } from '../core/grid-options';
import type { SelectionRectangle } from './dom-renderer-selection-clipboard';

export interface FillHandleAutoScrollBounds {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface FillHandleAutoScrollDelta {
  vertical: number;
  horizontal: number;
}

export interface MatrixSeriesFillModel {
  baseValue: number;
  rowStep: number;
  columnStep: number;
}

const MATRIX_SERIES_EPSILON = 1e-9;

export function selectionRectanglesEqual(left: SelectionRectangle, right: SelectionRectangle): boolean {
  return (
    left.startRow === right.startRow &&
    left.endRow === right.endRow &&
    left.startCol === right.startCol &&
    left.endCol === right.endCol
  );
}

export function getSelectionRectangleRowCount(rectangle: SelectionRectangle): number {
  return rectangle.endRow - rectangle.startRow + 1;
}

export function getSelectionRectangleColumnCount(rectangle: SelectionRectangle): number {
  return rectangle.endCol - rectangle.startCol + 1;
}

export function isCellInsideSelectionRectangle(
  rectangle: SelectionRectangle,
  cell: SelectionCellPosition
): boolean {
  return (
    cell.rowIndex >= rectangle.startRow &&
    cell.rowIndex <= rectangle.endRow &&
    cell.colIndex >= rectangle.startCol &&
    cell.colIndex <= rectangle.endCol
  );
}

export function resolveFillPreviewRectangle(
  sourceRectangle: SelectionRectangle,
  focusCell: SelectionCellPosition
): SelectionRectangle {
  return {
    startRow: Math.min(sourceRectangle.startRow, focusCell.rowIndex),
    endRow: Math.max(sourceRectangle.endRow, focusCell.rowIndex),
    startCol: Math.min(sourceRectangle.startCol, focusCell.colIndex),
    endCol: Math.max(sourceRectangle.endCol, focusCell.colIndex)
  };
}

export function resolveRepeatingFillOffset(targetIndex: number, sourceStart: number, sourceCount: number): number {
  if (sourceCount <= 0) {
    return 0;
  }

  const relativeIndex = targetIndex - sourceStart;
  const wrappedIndex = ((relativeIndex % sourceCount) + sourceCount) % sourceCount;
  return wrappedIndex;
}

export function shouldUseVerticalSeriesFill(
  mode: GridRangeHandleMode,
  sourceRectangle: SelectionRectangle,
  previewRectangle: SelectionRectangle
): boolean {
  return (
    mode === 'fill' &&
    getSelectionRectangleRowCount(sourceRectangle) > 1 &&
    previewRectangle.startCol === sourceRectangle.startCol &&
    previewRectangle.endCol === sourceRectangle.endCol &&
    getSelectionRectangleRowCount(previewRectangle) > getSelectionRectangleRowCount(sourceRectangle)
  );
}

export function shouldUseHorizontalSeriesFill(
  mode: GridRangeHandleMode,
  sourceRectangle: SelectionRectangle,
  previewRectangle: SelectionRectangle
): boolean {
  return (
    mode === 'fill' &&
    getSelectionRectangleColumnCount(sourceRectangle) > 1 &&
    previewRectangle.startRow === sourceRectangle.startRow &&
    previewRectangle.endRow === sourceRectangle.endRow &&
    getSelectionRectangleColumnCount(previewRectangle) > getSelectionRectangleColumnCount(sourceRectangle)
  );
}

export function shouldUseMatrixSeriesFill(
  mode: GridRangeHandleMode,
  sourceRectangle: SelectionRectangle,
  previewRectangle: SelectionRectangle
): boolean {
  return (
    mode === 'fill' &&
    getSelectionRectangleRowCount(sourceRectangle) > 1 &&
    getSelectionRectangleColumnCount(sourceRectangle) > 1 &&
    (getSelectionRectangleRowCount(previewRectangle) > getSelectionRectangleRowCount(sourceRectangle) ||
      getSelectionRectangleColumnCount(previewRectangle) > getSelectionRectangleColumnCount(sourceRectangle))
  );
}

export function resolveFillHandleAutoScrollDelta(
  clientX: number,
  clientY: number,
  bounds: FillHandleAutoScrollBounds,
  edgeThreshold = 28,
  maxStep = 32
): FillHandleAutoScrollDelta {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || edgeThreshold <= 0 || maxStep <= 0) {
    return {
      vertical: 0,
      horizontal: 0
    };
  }

  const topDistance = bounds.top + edgeThreshold - clientY;
  const bottomDistance = clientY - (bounds.bottom - edgeThreshold);
  const leftDistance = bounds.left + edgeThreshold - clientX;
  const rightDistance = clientX - (bounds.right - edgeThreshold);

  const resolveDelta = (negativeDistance: number, positiveDistance: number): number => {
    if (negativeDistance > 0) {
      return -Math.max(1, Math.round(maxStep * Math.min(1, negativeDistance / edgeThreshold)));
    }
    if (positiveDistance > 0) {
      return Math.max(1, Math.round(maxStep * Math.min(1, positiveDistance / edgeThreshold)));
    }
    return 0;
  };

  return {
    vertical: resolveDelta(topDistance, bottomDistance),
    horizontal: resolveDelta(leftDistance, rightDistance)
  };
}

export function resolveMatrixSeriesFillModel(sourceValues: number[][]): MatrixSeriesFillModel | null {
  const rowCount = sourceValues.length;
  const columnCount = sourceValues[0]?.length ?? 0;
  if (rowCount <= 1 || columnCount <= 1) {
    return null;
  }

  const baseValue = sourceValues[0]?.[0];
  const nextRowValue = sourceValues[1]?.[0];
  const nextColumnValue = sourceValues[0]?.[1];
  if (
    typeof baseValue !== 'number' ||
    !Number.isFinite(baseValue) ||
    typeof nextRowValue !== 'number' ||
    !Number.isFinite(nextRowValue) ||
    typeof nextColumnValue !== 'number' ||
    !Number.isFinite(nextColumnValue)
  ) {
    return null;
  }

  const rowStep = nextRowValue - baseValue;
  const columnStep = nextColumnValue - baseValue;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowValues = sourceValues[rowIndex];
    if (!rowValues || rowValues.length !== columnCount) {
      return null;
    }

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
      const value = rowValues[columnIndex];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
      }

      const expectedValue = baseValue + rowStep * rowIndex + columnStep * columnIndex;
      if (Math.abs(value - expectedValue) > MATRIX_SERIES_EPSILON) {
        return null;
      }
    }
  }

  return {
    baseValue,
    rowStep,
    columnStep
  };
}

export function resolveMatrixSeriesFillValue(
  sourceRectangle: SelectionRectangle,
  targetRowIndex: number,
  targetColumnIndex: number,
  model: MatrixSeriesFillModel
): number {
  return (
    model.baseValue +
    model.rowStep * (targetRowIndex - sourceRectangle.startRow) +
    model.columnStep * (targetColumnIndex - sourceRectangle.startCol)
  );
}
