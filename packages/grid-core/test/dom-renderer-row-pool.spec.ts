import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '../src/core/grid-options';
import {
  applyZoneRowBindingState,
  createCellRenderState,
  createZoneRow,
  hideZoneRow,
  rebuildRowPool
} from '../src/render/dom-renderer-row-pool';

function createColumn(id: string, width: number): ColumnDef {
  return {
    id,
    header: id.toUpperCase(),
    width,
    type: 'text'
  };
}

function createIndicatorCellElements(cellElement: HTMLDivElement): { checkbox: HTMLInputElement } {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  cellElement.append(checkbox);
  return { checkbox };
}

describe('dom-renderer-row-pool', () => {
  it('creates reusable cell render state with default DOM diff values', () => {
    expect(createCellRenderState(false, 'name', 120)).toEqual({
      isVisible: false,
      columnId: 'name',
      role: 'gridcell',
      contentMode: 'text',
      textContent: '',
      htmlContent: '',
      left: Number.NaN,
      width: 120,
      isSelected: false,
      isActive: false,
      extraClassName: '',
      titleText: '',
      ariaLabel: '',
      ariaRowIndex: -1,
      ariaColIndex: -1,
      cellId: ''
    });
  });

  it('creates pinned and center zone rows with the expected pooled structure', () => {
    const columns = [createColumn('id', 100), createColumn('name', 180)];

    const pinnedRow = createZoneRow({
      zoneName: 'left',
      columns,
      width: 280,
      baseRowHeight: 28,
      isIndicatorCheckboxColumnId: (columnId) => columnId === 'id',
      createIndicatorCellElements
    });
    expect(pinnedRow.cells).toHaveLength(2);
    expect(pinnedRow.indicatorCells[0]?.checkbox).toBeInstanceOf(HTMLInputElement);
    expect(pinnedRow.cells[0].dataset.columnId).toBe('id');
    expect(pinnedRow.rowState.rowIndex).toBe(-1);

    const centerRow = createZoneRow({
      zoneName: 'center',
      columns,
      width: 640,
      cellCapacity: 3,
      baseRowHeight: 28,
      isIndicatorCheckboxColumnId: () => false,
      createIndicatorCellElements
    });
    expect(centerRow.cells).toHaveLength(3);
    expect(centerRow.cells[0].style.position).toBe('absolute');
    expect(centerRow.cells[0].style.display).toBe('none');
    expect(centerRow.cellStates[0].columnId).toBe('');
  });

  it('rebuilds row pool layers and appends the requested number of pooled rows', () => {
    const rowsLayerLeftElement = document.createElement('div');
    const rowsLayerCenterElement = document.createElement('div');
    const rowsLayerRightElement = document.createElement('div');

    const rowPool = rebuildRowPool({
      desiredPoolSize: 2,
      rowsLayerLeftElement,
      rowsLayerCenterElement,
      rowsLayerRightElement,
      leftColumns: [createColumn('id', 100)],
      centerColumns: [createColumn('name', 180), createColumn('status', 140)],
      rightColumns: [createColumn('score', 120)],
      leftWidth: 100,
      centerWidth: 320,
      rightWidth: 120,
      centerCellCapacity: 2,
      baseRowHeight: 28,
      isIndicatorCheckboxColumnId: () => false,
      createIndicatorCellElements
    });

    expect(rowPool).toHaveLength(2);
    expect(rowsLayerLeftElement.children).toHaveLength(2);
    expect(rowsLayerCenterElement.children).toHaveLength(2);
    expect(rowsLayerRightElement.children).toHaveLength(2);
  });

  it('applies row binding state and hides pooled rows without destroying them', () => {
    const row = createZoneRow({
      zoneName: 'center',
      columns: [createColumn('name', 180)],
      width: 180,
      cellCapacity: 1,
      baseRowHeight: 28,
      isIndicatorCheckboxColumnId: () => false,
      createIndicatorCellElements
    });

    applyZoneRowBindingState(row, {
      rowIndex: 5,
      dataIndex: 9,
      translateY: 140,
      height: 36,
      isSelected: true,
      isGroupRow: true,
      groupLevel: 2,
      isTreeRow: true,
      treeLevel: 1,
      ariaRowIndex: 8
    });

    expect(row.element.dataset.rowIndex).toBe('5');
    expect(row.element.dataset.dataIndex).toBe('9');
    expect(row.element.dataset.groupLevel).toBe('2');
    expect(row.element.dataset.treeLevel).toBe('1');
    expect(row.element.classList.contains('hgrid__row--selected')).toBe(true);
    expect(row.element.classList.contains('hgrid__row--group')).toBe(true);
    expect(row.element.classList.contains('hgrid__row--tree')).toBe(true);
    expect(row.element.getAttribute('aria-rowindex')).toBe('8');

    hideZoneRow(row);

    expect(row.rowState.isVisible).toBe(false);
    expect(row.rowState.rowIndex).toBe(-1);
    expect(row.rowState.dataIndex).toBe(-1);
    expect(row.element.style.display).toBe('none');
    expect(row.element.hasAttribute('aria-rowindex')).toBe(false);
    expect(row.element.classList.contains('hgrid__row--selected')).toBe(false);
  });
});
