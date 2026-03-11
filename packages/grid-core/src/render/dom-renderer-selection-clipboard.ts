import type { GridSelection, SelectionCellPosition } from '../interaction/selection-model';

export interface SelectionBounds {
  rowCount: number;
  columnCount: number;
}

export interface SelectionRectangle {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface ClipboardMatrixMetrics {
  sourceColumnCount: number;
  destinationRowCount: number;
  destinationColCount: number;
  shouldFillSelection: boolean;
}

export interface ClipboardSourceOffsets {
  sourceRow: number;
  sourceCol: number;
}

export function clampSelectionCellToBounds(
  bounds: SelectionBounds,
  cell: SelectionCellPosition
): SelectionCellPosition {
  if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
    return {
      rowIndex: 0,
      colIndex: 0
    };
  }

  return {
    rowIndex: Math.max(0, Math.min(bounds.rowCount - 1, cell.rowIndex)),
    colIndex: Math.max(0, Math.min(bounds.columnCount - 1, cell.colIndex))
  };
}

export function resolveInitialActiveCell(
  bounds: SelectionBounds,
  renderedStartRow: number
): SelectionCellPosition | null {
  if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
    return null;
  }

  return {
    rowIndex: Math.max(0, Math.min(bounds.rowCount - 1, renderedStartRow)),
    colIndex: 0
  };
}

export function resolvePrimarySelectionRectangle(
  bounds: SelectionBounds,
  selection: GridSelection,
  fallbackActiveCell: SelectionCellPosition | null
): SelectionRectangle | null {
  if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
    return null;
  }

  const primaryRange = selection.cellRanges[0];
  if (primaryRange) {
    return {
      startRow: Math.max(0, Math.min(primaryRange.r1, primaryRange.r2)),
      endRow: Math.min(bounds.rowCount - 1, Math.max(primaryRange.r1, primaryRange.r2)),
      startCol: Math.max(0, Math.min(primaryRange.c1, primaryRange.c2)),
      endCol: Math.min(bounds.columnCount - 1, Math.max(primaryRange.c1, primaryRange.c2))
    };
  }

  const activeCell = selection.activeCell ?? fallbackActiveCell;
  if (!activeCell) {
    return null;
  }

  const clampedCell = clampSelectionCellToBounds(bounds, activeCell);
  return {
    startRow: clampedCell.rowIndex,
    endRow: clampedCell.rowIndex,
    startCol: clampedCell.colIndex,
    endCol: clampedCell.colIndex
  };
}

export function sanitizeClipboardText(rawText: string): string {
  return rawText.replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
}

export function parseClipboardTsv(rawText: string): string[][] {
  const normalizedText = sanitizeClipboardText(rawText);
  if (normalizedText.length === 0) {
    return [];
  }

  const lines = normalizedText.split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const matrix: string[][] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    matrix.push(lines[lineIndex].split('\t'));
  }

  return matrix;
}

export function buildSelectionTsv(
  selectionRectangle: SelectionRectangle,
  readCellText: (rowIndex: number, colIndex: number) => string
): string {
  const lines: string[] = [];
  for (let rowIndex = selectionRectangle.startRow; rowIndex <= selectionRectangle.endRow; rowIndex += 1) {
    const cells: string[] = [];
    for (let colIndex = selectionRectangle.startCol; colIndex <= selectionRectangle.endCol; colIndex += 1) {
      cells.push(readCellText(rowIndex, colIndex));
    }
    lines.push(cells.join('\t'));
  }

  return lines.join('\n');
}

export function resolveClipboardMatrixMetrics(
  matrix: string[][],
  selectionRectangle: SelectionRectangle
): ClipboardMatrixMetrics | null {
  if (matrix.length === 0) {
    return null;
  }

  let sourceColumnCount = 0;
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    sourceColumnCount = Math.max(sourceColumnCount, matrix[rowIndex].length);
  }
  if (sourceColumnCount <= 0) {
    return null;
  }

  const selectedRowCount = selectionRectangle.endRow - selectionRectangle.startRow + 1;
  const selectedColCount = selectionRectangle.endCol - selectionRectangle.startCol + 1;
  const shouldFillSelection = matrix.length === 1 && sourceColumnCount === 1 && (selectedRowCount > 1 || selectedColCount > 1);

  return {
    sourceColumnCount,
    destinationRowCount: shouldFillSelection ? selectedRowCount : matrix.length,
    destinationColCount: shouldFillSelection ? selectedColCount : sourceColumnCount,
    shouldFillSelection
  };
}

export function resolveClipboardSourceOffsets(
  rowOffset: number,
  colOffset: number,
  shouldFillSelection: boolean
): ClipboardSourceOffsets {
  if (shouldFillSelection) {
    return {
      sourceRow: 0,
      sourceCol: 0
    };
  }

  return {
    sourceRow: rowOffset,
    sourceCol: colOffset
  };
}
