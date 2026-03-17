import { describe, expect, it } from 'vitest';
import type { GridSelection } from '../src/interaction/selection-model';
import {
  buildSelectionTsv,
  clampSelectionCellToBounds,
  parseClipboardTsv,
  resolveClipboardMatrixMetrics,
  resolveClipboardSourceOffsets,
  resolveInitialActiveCell,
  resolvePrimarySelectionRectangle,
  sanitizeClipboardText,
  type SelectionBounds
} from '../src/render/dom-renderer-selection-clipboard';

function createEmptySelection(): GridSelection {
  return {
    activeCell: null,
    cellRanges: [],
    rowRanges: []
  };
}

describe('dom-renderer-selection-clipboard', () => {
  it('clamps selection cells into current bounds', () => {
    const bounds: SelectionBounds = {
      rowCount: 10,
      columnCount: 4
    };

    expect(clampSelectionCellToBounds(bounds, { rowIndex: -5, colIndex: 99 })).toEqual({
      rowIndex: 0,
      colIndex: 3
    });
  });

  it('resolves the initial active cell from rendered start row', () => {
    expect(resolveInitialActiveCell({ rowCount: 0, columnCount: 3 }, 4)).toBeNull();
    expect(resolveInitialActiveCell({ rowCount: 12, columnCount: 3 }, 20)).toEqual({
      rowIndex: 11,
      colIndex: 0
    });
  });

  it('prefers the primary cell range when resolving the selection rectangle', () => {
    const selection: GridSelection = {
      activeCell: { rowIndex: 8, colIndex: 1 },
      cellRanges: [{ r1: 4, c1: 3, r2: 1, c2: 0 }],
      rowRanges: []
    };

    expect(
      resolvePrimarySelectionRectangle(
        {
          rowCount: 10,
          columnCount: 6
        },
        selection,
        { rowIndex: 0, colIndex: 0 }
      )
    ).toEqual({
      startRow: 1,
      endRow: 4,
      startCol: 0,
      endCol: 3
    });
  });

  it('falls back to the active cell when there is no explicit range', () => {
    expect(
      resolvePrimarySelectionRectangle(
        {
          rowCount: 8,
          columnCount: 5
        },
        createEmptySelection(),
        { rowIndex: 99, colIndex: -4 }
      )
    ).toEqual({
      startRow: 7,
      endRow: 7,
      startCol: 0,
      endCol: 0
    });
  });

  it('sanitizes and parses clipboard TSV text', () => {
    expect(sanitizeClipboardText('A\u0000\tB\r\nC\tD\r\n')).toBe('A\tB\nC\tD\n');
    expect(parseClipboardTsv('A\tB\r\nC\tD\r\n')).toEqual([
      ['A', 'B'],
      ['C', 'D']
    ]);
    expect(parseClipboardTsv('')).toEqual([]);
  });

  it('keeps malicious-looking clipboard payloads as inert text while normalizing separators', () => {
    const payloads = [
      '<img src=x onerror=alert(1)>\tactive\r\n<script>alert(1)</script>\tidle',
      'A\u0000\tB\r\njavascript:alert(1)\t<svg onload=alert(1)>',
      '<b>unsafe</b>\tactive\nLiteral\tidle\n'
    ];

    for (let index = 0; index < payloads.length; index += 1) {
      const sanitized = sanitizeClipboardText(payloads[index]);
      const matrix = parseClipboardTsv(payloads[index]);
      expect(sanitized.includes('\u0000')).toBe(false);
      expect(Array.isArray(matrix)).toBe(true);
      expect(matrix.length).toBeGreaterThan(0);
      expect(matrix[0].length).toBeGreaterThan(0);
    }
  });

  it('builds TSV output from a selection rectangle through a cell reader callback', () => {
    expect(
      buildSelectionTsv(
        {
          startRow: 1,
          endRow: 2,
          startCol: 0,
          endCol: 1
        },
        (rowIndex, colIndex) => `${rowIndex}:${colIndex}`
      )
    ).toBe('1:0\t1:1\n2:0\t2:1');
  });

  it('resolves clipboard paste metrics for matrix paste and fill-selection paste', () => {
    expect(
      resolveClipboardMatrixMetrics(
        [
          ['A', 'B'],
          ['C', 'D']
        ],
        {
          startRow: 0,
          endRow: 3,
          startCol: 0,
          endCol: 2
        }
      )
    ).toEqual({
      sourceColumnCount: 2,
      destinationRowCount: 2,
      destinationColCount: 2,
      shouldFillSelection: false
    });

    expect(
      resolveClipboardMatrixMetrics(
        [['Seed']],
        {
          startRow: 2,
          endRow: 5,
          startCol: 1,
          endCol: 3
        }
      )
    ).toEqual({
      sourceColumnCount: 1,
      destinationRowCount: 4,
      destinationColCount: 3,
      shouldFillSelection: true
    });
  });

  it('maps paste offsets back to the source matrix correctly', () => {
    expect(resolveClipboardSourceOffsets(3, 2, true)).toEqual({
      sourceRow: 0,
      sourceCol: 0
    });
    expect(resolveClipboardSourceOffsets(3, 2, false)).toEqual({
      sourceRow: 3,
      sourceCol: 2
    });
  });
});
