import type { RowKey } from '../data/data-provider';

export interface SelectionCellPosition {
  rowIndex: number;
  colIndex: number;
}

export interface SelectionCellRange {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface SelectionRowRangeInput {
  r1: number;
  r2: number;
}

export interface SelectionRowRange {
  r1: number;
  r2: number;
  rowKeyStart: RowKey;
  rowKeyEnd: RowKey;
}

export interface GridSelection {
  activeCell: SelectionCellPosition | null;
  cellRanges: SelectionCellRange[];
  rowRanges: SelectionRowRange[];
}

export interface GridSelectionInput {
  activeCell?: SelectionCellPosition | null;
  cellRanges?: SelectionCellRange[];
  rowRanges?: SelectionRowRangeInput[];
}

export type SelectionChangeSource = 'pointer' | 'keyboard' | 'api' | 'clear' | 'reconcile';

export interface SelectionChangeEvent extends GridSelection {
  source: SelectionChangeSource;
}

interface SelectionBounds {
  rowCount: number;
  columnCount: number;
}

type RowKeyResolver = (rowIndex: number) => RowKey | null;

function clampIndex(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function normalizeFiniteInteger(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.floor(value);
}

function createEmptySelection(): GridSelection {
  return {
    activeCell: null,
    cellRanges: [],
    rowRanges: []
  };
}

function cloneSelection(selection: GridSelection): GridSelection {
  return {
    activeCell: selection.activeCell ? { ...selection.activeCell } : null,
    cellRanges: selection.cellRanges.map((range) => ({ ...range })),
    rowRanges: selection.rowRanges.map((range) => ({ ...range }))
  };
}

function normalizeActiveCell(
  activeCell: SelectionCellPosition | null,
  bounds: SelectionBounds
): SelectionCellPosition | null {
  if (!activeCell) {
    return null;
  }

  if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
    return null;
  }

  const rowIndex = normalizeFiniteInteger(activeCell.rowIndex);
  const colIndex = normalizeFiniteInteger(activeCell.colIndex);
  if (rowIndex === null || colIndex === null) {
    return null;
  }

  return {
    rowIndex: clampIndex(rowIndex, 0, bounds.rowCount - 1),
    colIndex: clampIndex(colIndex, 0, bounds.columnCount - 1)
  };
}

function normalizeCellRange(range: SelectionCellRange, bounds: SelectionBounds): SelectionCellRange | null {
  if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
    return null;
  }

  const r1 = normalizeFiniteInteger(range.r1);
  const r2 = normalizeFiniteInteger(range.r2);
  const c1 = normalizeFiniteInteger(range.c1);
  const c2 = normalizeFiniteInteger(range.c2);
  if (r1 === null || r2 === null || c1 === null || c2 === null) {
    return null;
  }

  return {
    r1: clampIndex(r1, 0, bounds.rowCount - 1),
    r2: clampIndex(r2, 0, bounds.rowCount - 1),
    c1: clampIndex(c1, 0, bounds.columnCount - 1),
    c2: clampIndex(c2, 0, bounds.columnCount - 1)
  };
}

function normalizeCellRanges(ranges: SelectionCellRange[], bounds: SelectionBounds): SelectionCellRange[] {
  const normalizedRanges: SelectionCellRange[] = [];
  for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
    const normalizedRange = normalizeCellRange(ranges[rangeIndex], bounds);
    if (normalizedRange) {
      normalizedRanges.push(normalizedRange);
    }
  }

  return normalizedRanges;
}

function normalizeRowRangeInput(range: SelectionRowRangeInput, bounds: SelectionBounds): SelectionRowRangeInput | null {
  if (bounds.rowCount <= 0) {
    return null;
  }

  const r1 = normalizeFiniteInteger(range.r1);
  const r2 = normalizeFiniteInteger(range.r2);
  if (r1 === null || r2 === null) {
    return null;
  }

  return {
    r1: clampIndex(r1, 0, bounds.rowCount - 1),
    r2: clampIndex(r2, 0, bounds.rowCount - 1)
  };
}

function normalizeRowRangeInputs(ranges: SelectionRowRangeInput[], bounds: SelectionBounds): SelectionRowRangeInput[] {
  const normalizedRanges: SelectionRowRangeInput[] = [];
  for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
    const normalizedRange = normalizeRowRangeInput(ranges[rangeIndex], bounds);
    if (normalizedRange) {
      normalizedRanges.push(normalizedRange);
    }
  }

  return normalizedRanges;
}

function toRowRangeInputsFromCellRanges(cellRanges: SelectionCellRange[]): SelectionRowRangeInput[] {
  const rowRanges: SelectionRowRangeInput[] = [];
  for (let rangeIndex = 0; rangeIndex < cellRanges.length; rangeIndex += 1) {
    const range = cellRanges[rangeIndex];
    rowRanges.push({
      r1: Math.min(range.r1, range.r2),
      r2: Math.max(range.r1, range.r2)
    });
  }

  return rowRanges;
}

function mergeRowRangeInputs(ranges: SelectionRowRangeInput[]): SelectionRowRangeInput[] {
  if (ranges.length <= 1) {
    return ranges.map((range) => ({
      r1: Math.min(range.r1, range.r2),
      r2: Math.max(range.r1, range.r2)
    }));
  }

  const sortedRanges = ranges
    .map((range) => ({
      r1: Math.min(range.r1, range.r2),
      r2: Math.max(range.r1, range.r2)
    }))
    .sort((left, right) => {
      if (left.r1 !== right.r1) {
        return left.r1 - right.r1;
      }

      return left.r2 - right.r2;
    });

  const merged: SelectionRowRangeInput[] = [];
  for (let rangeIndex = 0; rangeIndex < sortedRanges.length; rangeIndex += 1) {
    const currentRange = sortedRanges[rangeIndex];
    const previousRange = merged[merged.length - 1];
    if (!previousRange) {
      merged.push({ ...currentRange });
      continue;
    }

    if (currentRange.r1 <= previousRange.r2 + 1) {
      previousRange.r2 = Math.max(previousRange.r2, currentRange.r2);
      continue;
    }

    merged.push({ ...currentRange });
  }

  return merged;
}

function hydrateRowRanges(
  rangeInputs: SelectionRowRangeInput[],
  resolveRowKey: RowKeyResolver
): SelectionRowRange[] {
  const hydrated: SelectionRowRange[] = [];

  for (let rangeIndex = 0; rangeIndex < rangeInputs.length; rangeIndex += 1) {
    const range = rangeInputs[rangeIndex];
    const startRowIndex = Math.min(range.r1, range.r2);
    const endRowIndex = Math.max(range.r1, range.r2);
    const startRowKey = resolveRowKey(startRowIndex) ?? startRowIndex;
    const endRowKey = resolveRowKey(endRowIndex) ?? endRowIndex;
    hydrated.push({
      r1: startRowIndex,
      r2: endRowIndex,
      rowKeyStart: startRowKey,
      rowKeyEnd: endRowKey
    });
  }

  return hydrated;
}

function selectionEquals(left: GridSelection, right: GridSelection): boolean {
  if (left.activeCell === null && right.activeCell !== null) {
    return false;
  }

  if (left.activeCell !== null && right.activeCell === null) {
    return false;
  }

  if (left.activeCell && right.activeCell) {
    if (left.activeCell.rowIndex !== right.activeCell.rowIndex || left.activeCell.colIndex !== right.activeCell.colIndex) {
      return false;
    }
  }

  if (left.cellRanges.length !== right.cellRanges.length) {
    return false;
  }

  for (let rangeIndex = 0; rangeIndex < left.cellRanges.length; rangeIndex += 1) {
    const leftRange = left.cellRanges[rangeIndex];
    const rightRange = right.cellRanges[rangeIndex];
    if (leftRange.r1 !== rightRange.r1 || leftRange.c1 !== rightRange.c1 || leftRange.r2 !== rightRange.r2 || leftRange.c2 !== rightRange.c2) {
      return false;
    }
  }

  if (left.rowRanges.length !== right.rowRanges.length) {
    return false;
  }

  for (let rangeIndex = 0; rangeIndex < left.rowRanges.length; rangeIndex += 1) {
    const leftRange = left.rowRanges[rangeIndex];
    const rightRange = right.rowRanges[rangeIndex];
    if (
      leftRange.r1 !== rightRange.r1 ||
      leftRange.r2 !== rightRange.r2 ||
      leftRange.rowKeyStart !== rightRange.rowKeyStart ||
      leftRange.rowKeyEnd !== rightRange.rowKeyEnd
    ) {
      return false;
    }
  }

  return true;
}

export class SelectionModel {
  private selection: GridSelection = createEmptySelection();

  public getSelection(): GridSelection {
    return cloneSelection(this.selection);
  }

  public clear(): boolean {
    if (
      this.selection.activeCell === null &&
      this.selection.cellRanges.length === 0 &&
      this.selection.rowRanges.length === 0
    ) {
      return false;
    }

    this.selection = createEmptySelection();
    return true;
  }

  public setSelection(input: GridSelectionInput, bounds: SelectionBounds, resolveRowKey: RowKeyResolver): boolean {
    const nextSelection: GridSelection = {
      activeCell:
        input.activeCell === undefined
          ? this.selection.activeCell
            ? { ...this.selection.activeCell }
            : null
          : normalizeActiveCell(input.activeCell, bounds),
      cellRanges:
        input.cellRanges === undefined
          ? this.selection.cellRanges.map((range) => ({ ...range }))
          : normalizeCellRanges(input.cellRanges, bounds),
      rowRanges: []
    };

    const rowRangeInputsFromCurrent = this.selection.rowRanges.map((range) => ({
      r1: range.r1,
      r2: range.r2
    }));
    const normalizedRowInputs =
      input.rowRanges === undefined
        ? rowRangeInputsFromCurrent
        : normalizeRowRangeInputs(input.rowRanges, bounds);
    const derivedRowInputs = toRowRangeInputsFromCellRanges(nextSelection.cellRanges);
    const mergedRowInputs = mergeRowRangeInputs(normalizedRowInputs.concat(derivedRowInputs));
    nextSelection.rowRanges = hydrateRowRanges(mergedRowInputs, resolveRowKey);

    if (selectionEquals(this.selection, nextSelection)) {
      return false;
    }

    this.selection = nextSelection;
    return true;
  }

  public setPointerRange(
    anchorCell: SelectionCellPosition,
    focusCell: SelectionCellPosition,
    bounds: SelectionBounds,
    resolveRowKey: RowKeyResolver
  ): boolean {
    return this.setSelection(
      {
        activeCell: focusCell,
        cellRanges: [
          {
            r1: anchorCell.rowIndex,
            c1: anchorCell.colIndex,
            r2: focusCell.rowIndex,
            c2: focusCell.colIndex
          }
        ],
        rowRanges: []
      },
      bounds,
      resolveRowKey
    );
  }

  public reconcile(bounds: SelectionBounds, resolveRowKey: RowKeyResolver): boolean {
    return this.setSelection(
      {
        activeCell: this.selection.activeCell,
        cellRanges: this.selection.cellRanges,
        rowRanges: this.selection.rowRanges.map((range) => ({
          r1: range.r1,
          r2: range.r2
        }))
      },
      bounds,
      resolveRowKey
    );
  }

  public isCellSelected(rowIndex: number, colIndex: number): boolean {
    for (let rangeIndex = 0; rangeIndex < this.selection.cellRanges.length; rangeIndex += 1) {
      const range = this.selection.cellRanges[rangeIndex];
      const rowStart = Math.min(range.r1, range.r2);
      const rowEnd = Math.max(range.r1, range.r2);
      const colStart = Math.min(range.c1, range.c2);
      const colEnd = Math.max(range.c1, range.c2);
      if (rowIndex >= rowStart && rowIndex <= rowEnd && colIndex >= colStart && colIndex <= colEnd) {
        return true;
      }
    }

    return false;
  }

  public isRowSelected(rowIndex: number): boolean {
    for (let rangeIndex = 0; rangeIndex < this.selection.rowRanges.length; rangeIndex += 1) {
      const range = this.selection.rowRanges[rangeIndex];
      if (rowIndex >= range.r1 && rowIndex <= range.r2) {
        return true;
      }
    }

    return false;
  }

  public isCellActive(rowIndex: number, colIndex: number): boolean {
    if (!this.selection.activeCell) {
      return false;
    }

    return this.selection.activeCell.rowIndex === rowIndex && this.selection.activeCell.colIndex === colIndex;
  }
}
