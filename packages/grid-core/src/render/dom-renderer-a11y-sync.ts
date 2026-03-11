import type { SelectionCellPosition } from '../interaction/selection-model';

export interface AriaGridMetrics {
  rowCount: number;
  colCount: number;
}

export interface AriaActiveDescendantUpdate {
  nextActiveDescendantCellId: string;
  nextAttributeValue: string | null;
  shouldMutate: boolean;
}

export function createAriaGridId(instanceSequence: number): string {
  return `hgrid-grid-${instanceSequence}`;
}

export function getAccessibleHeaderRowCount(headerGroupRowCount: number): number {
  return Math.max(0, headerGroupRowCount) + 1;
}

export function getAriaRowIndexForDataRow(headerGroupRowCount: number, rowIndex: number): number {
  return getAccessibleHeaderRowCount(headerGroupRowCount) + rowIndex + 1;
}

export function getAriaCellId(
  ariaGridId: string,
  headerGroupRowCount: number,
  rowIndex: number,
  colIndex: number
): string {
  return `${ariaGridId}-cell-r${getAriaRowIndexForDataRow(headerGroupRowCount, rowIndex)}-c${colIndex + 1}`;
}

export function resolveAriaGridMetrics(
  viewRowCount: number,
  visibleColumnCount: number,
  headerGroupRowCount: number
): AriaGridMetrics {
  return {
    rowCount: Math.max(0, viewRowCount) + getAccessibleHeaderRowCount(headerGroupRowCount),
    colCount: Math.max(0, visibleColumnCount)
  };
}

export function resolveAriaActiveDescendantUpdate(
  currentActiveDescendantCellId: string,
  activeCell: SelectionCellPosition | null,
  renderedCellId: string | null
): AriaActiveDescendantUpdate {
  if (!activeCell || !renderedCellId) {
    return {
      nextActiveDescendantCellId: '',
      nextAttributeValue: null,
      shouldMutate: currentActiveDescendantCellId.length > 0
    };
  }

  return {
    nextActiveDescendantCellId: renderedCellId,
    nextAttributeValue: renderedCellId,
    shouldMutate: currentActiveDescendantCellId !== renderedCellId
  };
}
