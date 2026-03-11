import type { ColumnDef } from '../core/grid-options';

export interface CellRenderState {
  isVisible: boolean;
  columnId: string;
  role: string;
  contentMode: 'text' | 'html';
  textContent: string;
  htmlContent: string;
  left: number;
  width: number;
  isSelected: boolean;
  isActive: boolean;
  extraClassName: string;
  titleText: string;
  ariaLabel: string;
  ariaRowIndex: number;
  ariaColIndex: number;
  cellId: string;
}

export interface IndicatorCellElements {
  checkbox: HTMLInputElement;
}

export interface ZoneRowRenderState {
  isVisible: boolean;
  rowIndex: number;
  dataIndex: number;
  translateY: number;
  height: number;
  isSelected: boolean;
  isGroupRow: boolean;
  groupLevel: number;
  isTreeRow: boolean;
  treeLevel: number;
}

export interface ZoneRowItem {
  element: HTMLDivElement;
  cells: HTMLDivElement[];
  indicatorCells: Array<IndicatorCellElements | null>;
  visibleDisplay: '' | 'block';
  rowState: ZoneRowRenderState;
  cellStates: CellRenderState[];
}

export interface RowPoolItem {
  left: ZoneRowItem;
  center: ZoneRowItem;
  right: ZoneRowItem;
}

interface CreateZoneRowContext {
  zoneName: 'left' | 'center' | 'right';
  columns: ColumnDef[];
  width: number;
  cellCapacity?: number;
  baseRowHeight: number;
  isIndicatorCheckboxColumnId: (columnId: string) => boolean;
  createIndicatorCellElements: (cellElement: HTMLDivElement) => IndicatorCellElements;
}

interface RebuildRowPoolContext {
  desiredPoolSize: number;
  rowsLayerLeftElement: HTMLDivElement;
  rowsLayerCenterElement: HTMLDivElement;
  rowsLayerRightElement: HTMLDivElement;
  leftColumns: ColumnDef[];
  centerColumns: ColumnDef[];
  rightColumns: ColumnDef[];
  leftWidth: number;
  centerWidth: number;
  rightWidth: number;
  centerCellCapacity: number;
  baseRowHeight: number;
  isIndicatorCheckboxColumnId: (columnId: string) => boolean;
  createIndicatorCellElements: (cellElement: HTMLDivElement) => IndicatorCellElements;
}

export interface ZoneRowBindingState {
  rowIndex: number;
  dataIndex: number;
  translateY: number;
  height: number;
  isSelected: boolean;
  isGroupRow: boolean;
  groupLevel: number;
  isTreeRow: boolean;
  treeLevel: number;
  ariaRowIndex: number | null;
}

export function createCellRenderState(
  isVisible: boolean,
  columnId: string,
  width: number
): CellRenderState {
  return {
    isVisible,
    columnId,
    role: 'gridcell',
    contentMode: 'text',
    textContent: '',
    htmlContent: '',
    left: Number.NaN,
    width,
    isSelected: false,
    isActive: false,
    extraClassName: '',
    titleText: '',
    ariaLabel: '',
    ariaRowIndex: -1,
    ariaColIndex: -1,
    cellId: ''
  };
}

function createZoneRowRenderState(): ZoneRowRenderState {
  return {
    isVisible: true,
    rowIndex: -1,
    dataIndex: -1,
    translateY: Number.NaN,
    height: Number.NaN,
    isSelected: false,
    isGroupRow: false,
    groupLevel: 0,
    isTreeRow: false,
    treeLevel: 0
  };
}

export function createZoneRow(context: CreateZoneRowContext): ZoneRowItem {
  const { zoneName, columns, width, cellCapacity, baseRowHeight, isIndicatorCheckboxColumnId, createIndicatorCellElements } = context;
  const visibleDisplay = zoneName === 'center' ? 'block' : '';
  const rowElement = document.createElement('div');
  rowElement.className = `hgrid__row hgrid__row--${zoneName}`;
  rowElement.setAttribute('role', zoneName === 'center' ? 'row' : 'presentation');
  rowElement.style.height = `${baseRowHeight}px`;
  rowElement.style.width = `${width}px`;

  if (zoneName === 'center') {
    rowElement.style.display = visibleDisplay;
    rowElement.style.position = 'absolute';
  }

  const cells: HTMLDivElement[] = [];
  const indicatorCells: Array<IndicatorCellElements | null> = [];
  const cellStates: CellRenderState[] = [];
  const loopCount = zoneName === 'center' ? Math.max(0, cellCapacity ?? 0) : columns.length;
  for (let colIndex = 0; colIndex < loopCount; colIndex += 1) {
    const column = columns[colIndex];
    const cellElement = document.createElement('div');
    let indicatorCell: IndicatorCellElements | null = null;
    cellElement.className = zoneName === 'center' ? 'hgrid__cell hgrid__cell--center' : 'hgrid__cell';
    cellElement.setAttribute('role', 'gridcell');
    if (zoneName === 'center') {
      cellElement.style.position = 'absolute';
      cellElement.style.left = '0px';
      cellElement.style.display = 'none';
    } else {
      cellElement.style.width = `${column.width}px`;
      cellElement.dataset.columnId = column.id;
      if (isIndicatorCheckboxColumnId(column.id)) {
        cellElement.classList.add('hgrid__cell--indicator', 'hgrid__cell--indicator-checkbox');
        indicatorCell = createIndicatorCellElements(cellElement);
      }
    }
    rowElement.append(cellElement);
    cells.push(cellElement);
    indicatorCells.push(indicatorCell);
    cellStates.push(createCellRenderState(zoneName !== 'center', zoneName === 'center' ? '' : column.id, zoneName === 'center' ? Number.NaN : column.width));
  }

  return {
    element: rowElement,
    cells,
    indicatorCells,
    visibleDisplay,
    rowState: createZoneRowRenderState(),
    cellStates
  };
}

export function rebuildRowPool(context: RebuildRowPoolContext): RowPoolItem[] {
  const {
    desiredPoolSize,
    rowsLayerLeftElement,
    rowsLayerCenterElement,
    rowsLayerRightElement,
    leftColumns,
    centerColumns,
    rightColumns,
    leftWidth,
    centerWidth,
    rightWidth,
    centerCellCapacity,
    baseRowHeight,
    isIndicatorCheckboxColumnId,
    createIndicatorCellElements
  } = context;

  rowsLayerLeftElement.replaceChildren();
  rowsLayerCenterElement.replaceChildren();
  rowsLayerRightElement.replaceChildren();

  const rowPool: RowPoolItem[] = [];
  for (let poolIndex = 0; poolIndex < desiredPoolSize; poolIndex += 1) {
    const leftRow = createZoneRow({
      zoneName: 'left',
      columns: leftColumns,
      width: leftWidth,
      baseRowHeight,
      isIndicatorCheckboxColumnId,
      createIndicatorCellElements
    });
    const centerRow = createZoneRow({
      zoneName: 'center',
      columns: centerColumns,
      width: centerWidth,
      cellCapacity: centerCellCapacity,
      baseRowHeight,
      isIndicatorCheckboxColumnId,
      createIndicatorCellElements
    });
    const rightRow = createZoneRow({
      zoneName: 'right',
      columns: rightColumns,
      width: rightWidth,
      baseRowHeight,
      isIndicatorCheckboxColumnId,
      createIndicatorCellElements
    });

    rowsLayerLeftElement.append(leftRow.element);
    rowsLayerCenterElement.append(centerRow.element);
    rowsLayerRightElement.append(rightRow.element);

    rowPool.push({
      left: leftRow,
      center: centerRow,
      right: rightRow
    });
  }

  return rowPool;
}

export function hideZoneRow(zoneRow: ZoneRowItem): void {
  if (!zoneRow.rowState.isVisible) {
    return;
  }

  zoneRow.element.style.display = 'none';
  if (zoneRow.rowState.isSelected) {
    zoneRow.element.classList.remove('hgrid__row--selected');
    zoneRow.rowState.isSelected = false;
  }
  if (zoneRow.rowState.isGroupRow) {
    zoneRow.element.classList.remove('hgrid__row--group');
    zoneRow.rowState.isGroupRow = false;
    zoneRow.rowState.groupLevel = 0;
  }
  if (zoneRow.rowState.isTreeRow) {
    zoneRow.element.classList.remove('hgrid__row--tree');
    zoneRow.rowState.isTreeRow = false;
    zoneRow.rowState.treeLevel = 0;
  }
  zoneRow.rowState.isVisible = false;
  zoneRow.rowState.rowIndex = -1;
  zoneRow.rowState.dataIndex = -1;
  zoneRow.element.removeAttribute('aria-rowindex');
}

export function applyZoneRowBindingState(zoneRow: ZoneRowItem, nextState: ZoneRowBindingState): void {
  const rowState = zoneRow.rowState;

  if (!rowState.isVisible) {
    zoneRow.element.style.display = zoneRow.visibleDisplay;
    rowState.isVisible = true;
  }

  if (rowState.translateY !== nextState.translateY) {
    zoneRow.element.style.transform = `translate3d(0, ${nextState.translateY}px, 0)`;
    rowState.translateY = nextState.translateY;
  }

  if (rowState.height !== nextState.height) {
    zoneRow.element.style.height = `${nextState.height}px`;
    rowState.height = nextState.height;
  }

  if (rowState.rowIndex !== nextState.rowIndex) {
    zoneRow.element.dataset.rowIndex = String(nextState.rowIndex);
    rowState.rowIndex = nextState.rowIndex;
  }

  if (rowState.dataIndex !== nextState.dataIndex) {
    zoneRow.element.dataset.dataIndex = String(nextState.dataIndex);
    rowState.dataIndex = nextState.dataIndex;
  }

  if (rowState.isSelected !== nextState.isSelected) {
    zoneRow.element.classList.toggle('hgrid__row--selected', nextState.isSelected);
    rowState.isSelected = nextState.isSelected;
  }

  if (rowState.isGroupRow !== nextState.isGroupRow) {
    zoneRow.element.classList.toggle('hgrid__row--group', nextState.isGroupRow);
    rowState.isGroupRow = nextState.isGroupRow;
  }

  if (rowState.groupLevel !== nextState.groupLevel) {
    if (nextState.isGroupRow) {
      zoneRow.element.dataset.groupLevel = String(nextState.groupLevel);
    } else {
      delete zoneRow.element.dataset.groupLevel;
    }
    rowState.groupLevel = nextState.groupLevel;
  }

  if (rowState.isTreeRow !== nextState.isTreeRow) {
    zoneRow.element.classList.toggle('hgrid__row--tree', nextState.isTreeRow);
    rowState.isTreeRow = nextState.isTreeRow;
  }

  if (rowState.treeLevel !== nextState.treeLevel) {
    if (nextState.isTreeRow) {
      zoneRow.element.dataset.treeLevel = String(nextState.treeLevel);
    } else {
      delete zoneRow.element.dataset.treeLevel;
    }
    rowState.treeLevel = nextState.treeLevel;
  }

  if (nextState.ariaRowIndex !== null) {
    zoneRow.element.setAttribute('aria-rowindex', String(nextState.ariaRowIndex));
  } else {
    zoneRow.element.removeAttribute('aria-rowindex');
  }
}
