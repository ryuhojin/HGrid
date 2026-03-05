import { describe, expect, it } from 'vitest';
import { SelectionModel } from '../src/interaction/selection-model';

const BOUNDS = {
  rowCount: 100,
  columnCount: 20
};

describe('SelectionModel', () => {
  it('stores cell ranges and derives row ranges with row keys', () => {
    const model = new SelectionModel();
    const hasChanged = model.setPointerRange(
      { rowIndex: 2, colIndex: 1 },
      { rowIndex: 5, colIndex: 4 },
      BOUNDS,
      (rowIndex) => `row-${rowIndex}`
    );

    expect(hasChanged).toBe(true);
    expect(model.isCellSelected(3, 2)).toBe(true);
    expect(model.isCellSelected(1, 2)).toBe(false);
    expect(model.isRowSelected(4)).toBe(true);
    expect(model.isRowSelected(8)).toBe(false);
    expect(model.isCellActive(5, 4)).toBe(true);

    expect(model.getSelection()).toEqual({
      activeCell: { rowIndex: 5, colIndex: 4 },
      cellRanges: [{ r1: 2, c1: 1, r2: 5, c2: 4 }],
      rowRanges: [{ r1: 2, r2: 5, rowKeyStart: 'row-2', rowKeyEnd: 'row-5' }]
    });
  });

  it('supports row-range selection input and merges overlaps', () => {
    const model = new SelectionModel();
    const hasChanged = model.setSelection(
      {
        rowRanges: [
          { r1: 10, r2: 20 },
          { r1: 18, r2: 24 },
          { r1: 1, r2: 3 }
        ]
      },
      BOUNDS,
      (rowIndex) => rowIndex + 10_000
    );

    expect(hasChanged).toBe(true);
    expect(model.getSelection().rowRanges).toEqual([
      { r1: 1, r2: 3, rowKeyStart: 10_001, rowKeyEnd: 10_003 },
      { r1: 10, r2: 24, rowKeyStart: 10_010, rowKeyEnd: 10_024 }
    ]);
    expect(model.isRowSelected(2)).toBe(true);
    expect(model.isRowSelected(21)).toBe(true);
    expect(model.isRowSelected(40)).toBe(false);
  });

  it('reconciles/clamps out-of-bound ranges and clears state', () => {
    const model = new SelectionModel();
    model.setSelection(
      {
        activeCell: { rowIndex: 140, colIndex: 50 },
        cellRanges: [{ r1: -10, c1: -5, r2: 999, c2: 999 }]
      },
      { rowCount: 50, columnCount: 8 },
      (rowIndex) => rowIndex
    );

    const hasReconciled = model.reconcile({ rowCount: 30, columnCount: 4 }, (rowIndex) => rowIndex);
    expect(hasReconciled).toBe(true);
    expect(model.getSelection()).toEqual({
      activeCell: { rowIndex: 29, colIndex: 3 },
      cellRanges: [{ r1: 0, c1: 0, r2: 29, c2: 3 }],
      rowRanges: [{ r1: 0, r2: 29, rowKeyStart: 0, rowKeyEnd: 29 }]
    });

    expect(model.clear()).toBe(true);
    expect(model.clear()).toBe(false);
  });
});
