import { describe, expect, it } from 'vitest';
import {
  createAriaGridId,
  getAccessibleHeaderRowCount,
  getAriaCellId,
  getAriaRowIndexForDataRow,
  resolveAriaActiveDescendantUpdate,
  resolveAriaGridMetrics
} from '../src/render/dom-renderer-a11y-sync';

describe('dom-renderer-a11y-sync', () => {
  it('formats stable grid and cell ids from aria coordinates', () => {
    expect(createAriaGridId(7)).toBe('hgrid-grid-7');
    expect(getAccessibleHeaderRowCount(2)).toBe(3);
    expect(getAriaRowIndexForDataRow(2, 0)).toBe(4);
    expect(getAriaCellId('hgrid-grid-7', 2, 0, 3)).toBe('hgrid-grid-7-cell-r4-c4');
  });

  it('resolves row and column metrics including header rows', () => {
    expect(resolveAriaGridMetrics(120, 8, 1)).toEqual({
      rowCount: 122,
      colCount: 8
    });
    expect(resolveAriaGridMetrics(0, 0, 0)).toEqual({
      rowCount: 1,
      colCount: 0
    });
  });

  it('removes aria-activedescendant when there is no active cell or rendered cell', () => {
    expect(resolveAriaActiveDescendantUpdate('existing-cell', null, null)).toEqual({
      nextActiveDescendantCellId: '',
      nextAttributeValue: null,
      shouldMutate: true
    });
    expect(resolveAriaActiveDescendantUpdate('', { rowIndex: 1, colIndex: 2 }, null)).toEqual({
      nextActiveDescendantCellId: '',
      nextAttributeValue: null,
      shouldMutate: false
    });
  });

  it('updates aria-activedescendant only when the rendered cell id changes', () => {
    expect(resolveAriaActiveDescendantUpdate('', { rowIndex: 1, colIndex: 2 }, 'cell-r3-c3')).toEqual({
      nextActiveDescendantCellId: 'cell-r3-c3',
      nextAttributeValue: 'cell-r3-c3',
      shouldMutate: true
    });
    expect(resolveAriaActiveDescendantUpdate('cell-r3-c3', { rowIndex: 1, colIndex: 2 }, 'cell-r3-c3')).toEqual({
      nextActiveDescendantCellId: 'cell-r3-c3',
      nextAttributeValue: 'cell-r3-c3',
      shouldMutate: false
    });
  });
});
