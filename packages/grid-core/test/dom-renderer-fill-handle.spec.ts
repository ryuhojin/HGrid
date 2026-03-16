import { describe, expect, it } from 'vitest';
import {
  getSelectionRectangleColumnCount,
  getSelectionRectangleRowCount,
  isCellInsideSelectionRectangle,
  resolveFillHandleAutoScrollDelta,
  resolveMatrixSeriesFillModel,
  resolveMatrixSeriesFillValue,
  resolveFillPreviewRectangle,
  resolveRepeatingFillOffset,
  selectionRectanglesEqual,
  shouldUseMatrixSeriesFill,
  shouldUseHorizontalSeriesFill,
  shouldUseVerticalSeriesFill
} from '../src/render/dom-renderer-fill-handle';

describe('dom-renderer-fill-handle', () => {
  it('expands the preview rectangle to include the dragged focus cell', () => {
    const preview = resolveFillPreviewRectangle(
      {
        startRow: 2,
        endRow: 3,
        startCol: 1,
        endCol: 2
      },
      {
        rowIndex: 5,
        colIndex: 0
      }
    );

    expect(preview).toEqual({
      startRow: 2,
      endRow: 5,
      startCol: 0,
      endCol: 2
    });
    expect(getSelectionRectangleRowCount(preview)).toBe(4);
    expect(getSelectionRectangleColumnCount(preview)).toBe(3);
  });

  it('wraps repeating fill offsets for forward and backward drag copies', () => {
    expect(resolveRepeatingFillOffset(5, 2, 2)).toBe(1);
    expect(resolveRepeatingFillOffset(0, 2, 2)).toBe(0);
    expect(resolveRepeatingFillOffset(1, 2, 2)).toBe(1);
  });

  it('detects vertical and horizontal numeric series expansion rules', () => {
    const sourceRectangle = {
      startRow: 1,
      endRow: 2,
      startCol: 3,
      endCol: 3
    };

    expect(
      shouldUseVerticalSeriesFill('fill', sourceRectangle, {
        startRow: 1,
        endRow: 5,
        startCol: 3,
        endCol: 3
      })
    ).toBe(true);
    expect(
      shouldUseHorizontalSeriesFill('fill', sourceRectangle, {
        startRow: 1,
        endRow: 2,
        startCol: 2,
        endCol: 5
      })
    ).toBe(false);
    expect(
      shouldUseHorizontalSeriesFill('copy', {
        startRow: 1,
        endRow: 1,
        startCol: 3,
        endCol: 4
      }, {
        startRow: 1,
        endRow: 1,
        startCol: 3,
        endCol: 7
      })
    ).toBe(false);
    expect(
      shouldUseMatrixSeriesFill(
        'fill',
        {
          startRow: 1,
          endRow: 2,
          startCol: 3,
          endCol: 4
        },
        {
          startRow: 1,
          endRow: 4,
          startCol: 3,
          endCol: 6
        }
      )
    ).toBe(true);
  });

  it('compares rectangles and cell inclusion reliably', () => {
    const rectangle = {
      startRow: 0,
      endRow: 2,
      startCol: 1,
      endCol: 3
    };

    expect(
      selectionRectanglesEqual(rectangle, {
        startRow: 0,
        endRow: 2,
        startCol: 1,
        endCol: 3
      })
    ).toBe(true);
    expect(isCellInsideSelectionRectangle(rectangle, { rowIndex: 1, colIndex: 2 })).toBe(true);
    expect(isCellInsideSelectionRectangle(rectangle, { rowIndex: 3, colIndex: 2 })).toBe(false);
  });

  it('resolves auto-scroll deltas near viewport edges', () => {
    expect(
      resolveFillHandleAutoScrollDelta(
        110,
        190,
        {
          top: 40,
          right: 180,
          bottom: 200,
          left: 20
        },
        24,
        30
      )
    ).toEqual({
      vertical: 18,
      horizontal: 0
    });

    expect(
      resolveFillHandleAutoScrollDelta(
        10,
        34,
        {
          top: 40,
          right: 180,
          bottom: 200,
          left: 20
        },
        24,
        30
      )
    ).toEqual({
      vertical: -30,
      horizontal: -30
    });
  });

  it('infers affine matrix trends and resolves filled values', () => {
    const model = resolveMatrixSeriesFillModel([
      [10, 20],
      [20, 30]
    ]);

    expect(model).toEqual({
      baseValue: 10,
      rowStep: 10,
      columnStep: 10
    });
    expect(
      resolveMatrixSeriesFillValue(
        {
          startRow: 2,
          endRow: 3,
          startCol: 1,
          endCol: 2
        },
        5,
        4,
        model!
      )
    ).toBe(70);
    expect(
      resolveMatrixSeriesFillModel([
        [1, 2],
        [5, 7]
      ])
    ).toBeNull();
  });
});
