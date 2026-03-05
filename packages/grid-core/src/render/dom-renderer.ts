import { EventBus } from '../core/event-bus';
import type { ColumnDef, GridOptions, GridState, RowHeightMode, ScrollbarPolicy, ScrollbarVisibility } from '../core/grid-options';
import { formatColumnValue, getColumnValue } from '../data/column-model';
import type { GridRowData, RowKey } from '../data/data-provider';
import {
  SelectionModel,
  type GridSelection,
  type GridSelectionInput,
  type SelectionCellPosition,
  type SelectionChangeSource
} from '../interaction/selection-model';
import {
  MAX_SCROLL_PX,
  createScrollScaleMetrics,
  mapPhysicalToVirtualScrollTop,
  mapVirtualToPhysicalScrollTop
} from '../virtualization/scroll-scaling';
import { RowHeightMap } from '../virtualization/row-height-map';

type ColumnZoneName = 'left' | 'center' | 'right';

interface ColumnsByZone {
  left: ColumnDef[];
  center: ColumnDef[];
  right: ColumnDef[];
}

interface CellRenderState {
  isVisible: boolean;
  columnId: string;
  textContent: string;
  left: number;
  width: number;
  isSelected: boolean;
  isActive: boolean;
}

interface ZoneRowRenderState {
  isVisible: boolean;
  rowIndex: number;
  dataIndex: number;
  translateY: number;
  height: number;
  isSelected: boolean;
}

interface ZoneRowItem {
  element: HTMLDivElement;
  cells: HTMLDivElement[];
  visibleDisplay: '' | 'block';
  rowState: ZoneRowRenderState;
  cellStates: CellRenderState[];
}

interface RowPoolItem {
  left: ZoneRowItem;
  center: ZoneRowItem;
  right: ZoneRowItem;
}

interface ScrollbarSize {
  vertical: number;
  horizontal: number;
}

interface HorizontalWindow {
  start: number;
  end: number;
}

interface CellHitTestResult {
  zone: ColumnZoneName;
  rowIndex: number;
  dataIndex: number;
  columnIndex: number;
  column: ColumnDef;
}

interface PointerSelectionSession {
  pointerId: number;
  anchorCell: SelectionCellPosition;
  lastCell: SelectionCellPosition;
}

interface EditSession {
  rowIndex: number;
  dataIndex: number;
  colIndex: number;
  column: ColumnDef;
  originalValue: unknown;
}

const DEFAULT_HEIGHT = 360;
const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_ESTIMATED_ROW_HEIGHT = 28;
const DEFAULT_OVERSCAN = 6;
const DEFAULT_COLUMN_OVERSCAN = 2;
const VARIABLE_POOL_EXTRA_ROWS = 12;
const MIN_SCROLLBAR_SIZE = 0;
const INVISIBLE_SCROLLBAR_FALLBACK_SIZE = 16;
const DEFAULT_SCROLLBAR_VISIBILITY: Required<ScrollbarPolicy> = {
  vertical: 'auto',
  horizontal: 'auto'
};

export class DomRenderer {
  private readonly container: HTMLElement;
  private readonly eventBus: EventBus;

  private rootElement: HTMLDivElement;

  private headerElement: HTMLDivElement;
  private headerLeftElement: HTMLDivElement;
  private headerCenterElement: HTMLDivElement;
  private headerCenterViewportElement: HTMLDivElement;
  private headerRowLeftElement: HTMLDivElement;
  private headerRowCenterElement: HTMLDivElement;
  private headerRightElement: HTMLDivElement;
  private headerRowRightElement: HTMLDivElement;

  private bodyElement: HTMLDivElement;
  private bodyLeftElement: HTMLDivElement;
  private bodyCenterElement: HTMLDivElement;
  private bodyRightElement: HTMLDivElement;

  private viewportElement: HTMLDivElement;
  private spacerElement: HTMLDivElement;
  private verticalScrollElement: HTMLDivElement;
  private verticalSpacerElement: HTMLDivElement;
  private horizontalScrollElement: HTMLDivElement;
  private horizontalSpacerElement: HTMLDivElement;

  private rowsViewportLeftElement: HTMLDivElement;
  private rowsViewportCenterElement: HTMLDivElement;
  private rowsViewportRightElement: HTMLDivElement;

  private rowsLayerLeftElement: HTMLDivElement;
  private rowsLayerCenterElement: HTMLDivElement;
  private rowsLayerRightElement: HTMLDivElement;

  private overlayElement: HTMLDivElement;
  private editorHostElement: HTMLDivElement;
  private editorInputElement: HTMLInputElement;
  private editorMessageElement: HTMLDivElement;

  private options: GridOptions;
  private columnsByZone: ColumnsByZone;
  private rowPool: RowPoolItem[] = [];
  private readonly scrollbarSize: ScrollbarSize;
  private canUseHorizontalScroll = true;
  private canUseVerticalScroll = true;

  private scheduledFrameId: number | null = null;
  private layoutDirty = false;
  private dataDirty = false;
  private selectionDirty = false;
  private themeDirty = false;
  private scrollDirty = false;
  private shouldForcePoolRebuild = false;
  private pendingThemeTokens: Record<string, string> = {};
  private isSyncingScroll = false;
  private pendingScrollTop = 0;
  private pendingVirtualScrollTop = 0;
  private pendingScrollLeft = 0;
  private renderedScrollTop = 0;
  private renderedStartRow = 0;
  private renderedViewportOffsetY = 0;
  private virtualScrollHeight = 0;
  private physicalScrollHeight = 0;
  private virtualMaxScrollTop = 0;
  private physicalMaxScrollTop = 0;
  private scrollScale = 1;
  private renderedHorizontalWindow: HorizontalWindow = { start: 0, end: 0 };
  private leftColumnLeft: number[] = [];
  private leftColumnWidth: number[] = [];
  private centerColumnLeft: number[] = [];
  private centerColumnWidth: number[] = [];
  private rightColumnLeft: number[] = [];
  private rightColumnWidth: number[] = [];
  private leftPinnedWidth = 0;
  private rightPinnedWidth = 0;
  private centerColumnsWidth = 0;
  private centerVisibleWidth = 0;
  private centerCellCapacity = 0;
  private centerHeaderCellPool: HTMLDivElement[] = [];
  private centerHeaderCellStates: CellRenderState[] = [];
  private readonly rowHeightMap: RowHeightMap;
  private readonly selectionModel: SelectionModel;
  private pointerSelectionSession: PointerSelectionSession | null = null;
  private keyboardRangeAnchor: SelectionCellPosition | null = null;
  private editSession: EditSession | null = null;
  private editValidationTicket = 0;
  private isEditValidationPending = false;
  private measurementFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  public constructor(container: HTMLElement, options: GridOptions, eventBus: EventBus) {
    this.container = container;
    this.options = options;
    this.eventBus = eventBus;

    this.rootElement = document.createElement('div');

    this.headerElement = document.createElement('div');
    this.headerLeftElement = document.createElement('div');
    this.headerCenterElement = document.createElement('div');
    this.headerCenterViewportElement = document.createElement('div');
    this.headerRowLeftElement = document.createElement('div');
    this.headerRowCenterElement = document.createElement('div');
    this.headerRightElement = document.createElement('div');
    this.headerRowRightElement = document.createElement('div');

    this.bodyElement = document.createElement('div');
    this.bodyLeftElement = document.createElement('div');
    this.bodyCenterElement = document.createElement('div');
    this.bodyRightElement = document.createElement('div');

    this.viewportElement = document.createElement('div');
    this.spacerElement = document.createElement('div');
    this.verticalScrollElement = document.createElement('div');
    this.verticalSpacerElement = document.createElement('div');
    this.horizontalScrollElement = document.createElement('div');
    this.horizontalSpacerElement = document.createElement('div');

    this.rowsViewportLeftElement = document.createElement('div');
    this.rowsViewportCenterElement = document.createElement('div');
    this.rowsViewportRightElement = document.createElement('div');

    this.rowsLayerLeftElement = document.createElement('div');
    this.rowsLayerCenterElement = document.createElement('div');
    this.rowsLayerRightElement = document.createElement('div');

    this.overlayElement = document.createElement('div');
    this.editorHostElement = document.createElement('div');
    this.editorInputElement = document.createElement('input');
    this.editorMessageElement = document.createElement('div');

    this.columnsByZone = this.splitColumns(this.options.columns);
    this.scrollbarSize = this.measureScrollbarSize();
    this.rowHeightMap = new RowHeightMap(this.options.rowModel.getViewRowCount(), this.getBaseRowHeight());
    this.selectionModel = new SelectionModel();

    this.initializeDom();
    this.markLayoutDirty(true);
    this.flushRender();
  }

  public setOptions(nextOptions: GridOptions): void {
    this.teardownPointerSelectionSession();
    this.stopEditing('reconcile');
    this.options = nextOptions;
    this.columnsByZone = this.splitColumns(this.options.columns);
    this.reconcileSelection('reconcile');
    this.markLayoutDirty(true);
    this.flushRender();
  }

  public setColumns(columns: ColumnDef[]): void {
    this.setOptions({
      ...this.options,
      columns
    });
  }

  public setState(state: GridState): void {
    const nextVirtualScrollTop = Math.max(0, state.scrollTop);
    this.setVirtualScrollTop(nextVirtualScrollTop);
    this.markScrollDirty();
    this.flushRender();
  }

  public getState(): GridState {
    return {
      scrollTop: this.pendingVirtualScrollTop
    };
  }

  public getSelection(): GridSelection {
    return this.selectionModel.getSelection();
  }

  public setSelection(selection: GridSelectionInput): void {
    const hasChanged = this.selectionModel.setSelection(selection, this.getSelectionBounds(), this.resolveRowKeyByRowIndex);
    if (!hasChanged) {
      return;
    }

    const nextSelection = this.selectionModel.getSelection();
    this.keyboardRangeAnchor = nextSelection.activeCell ? { ...nextSelection.activeCell } : null;
    this.commitSelectionChange('api');
  }

  public clearSelection(): void {
    const hasChanged = this.selectionModel.clear();
    if (!hasChanged) {
      return;
    }

    this.keyboardRangeAnchor = null;
    this.commitSelectionChange('clear');
  }

  public resetRowHeights(rowIndexes?: number[]): void {
    if (!this.isVariableRowHeightMode()) {
      return;
    }

    const hasChanged = this.rowHeightMap.clearRows(rowIndexes);
    if (!hasChanged) {
      return;
    }

    this.markLayoutDirty(false);
    this.scheduleRender();
  }

  public setTheme(themeTokens: Record<string, string>): void {
    for (const tokenName in themeTokens) {
      if (Object.prototype.hasOwnProperty.call(themeTokens, tokenName)) {
        this.pendingThemeTokens[tokenName] = themeTokens[tokenName];
      }
    }

    this.markThemeDirty();
    this.flushRender();
  }

  public destroy(): void {
    this.teardownPointerSelectionSession();
    this.stopEditing('reconcile');
    this.viewportElement.removeEventListener('scroll', this.handleViewportScroll);
    this.verticalScrollElement.removeEventListener('scroll', this.handleVerticalScroll);
    this.horizontalScrollElement.removeEventListener('scroll', this.handleHorizontalScroll);
    this.horizontalScrollElement.removeEventListener('wheel', this.handleAuxiliaryWheel);
    this.headerElement.removeEventListener('wheel', this.handleAuxiliaryWheel);
    this.bodyElement.removeEventListener('wheel', this.handleBodyWheel);
    this.rootElement.removeEventListener('keydown', this.handleRootKeyDown);
    this.rootElement.removeEventListener('pointerdown', this.handleRootPointerDown);
    this.rootElement.removeEventListener('dblclick', this.handleRootDoubleClick);
    this.editorInputElement.removeEventListener('keydown', this.handleEditorInputKeyDown);
    this.editorInputElement.removeEventListener('blur', this.handleEditorInputBlur);
    this.editorInputElement.removeEventListener('input', this.handleEditorInput);
    this.teardownResizeObserver();

    if (this.scheduledFrameId !== null) {
      cancelAnimationFrame(this.scheduledFrameId);
      this.scheduledFrameId = null;
    }

    if (this.measurementFrameId !== null) {
      cancelAnimationFrame(this.measurementFrameId);
      this.measurementFrameId = null;
    }

    this.rowPool = [];
    this.container.replaceChildren();
  }

  private initializeDom(): void {
    this.rootElement.className = 'hgrid';
    this.rootElement.setAttribute('role', 'grid');
    this.rootElement.tabIndex = 0;

    this.headerElement.className = 'hgrid__header';
    this.headerLeftElement.className = 'hgrid__header-left';
    this.headerCenterElement.className = 'hgrid__header-center';
    this.headerCenterViewportElement.className = 'hgrid__header-viewport';
    this.headerRightElement.className = 'hgrid__header-right';

    this.headerRowLeftElement.className = 'hgrid__header-row hgrid__header-row--left';
    this.headerRowCenterElement.className = 'hgrid__header-row hgrid__header-row--center';
    this.headerRowRightElement.className = 'hgrid__header-row hgrid__header-row--right';

    this.headerLeftElement.append(this.headerRowLeftElement);
    this.headerCenterViewportElement.append(this.headerRowCenterElement);
    this.headerCenterElement.append(this.headerCenterViewportElement);
    this.headerRightElement.append(this.headerRowRightElement);
    this.headerElement.append(this.headerLeftElement, this.headerCenterElement, this.headerRightElement);

    this.bodyElement.className = 'hgrid__body';
    this.bodyLeftElement.className = 'hgrid__body-left';
    this.bodyCenterElement.className = 'hgrid__body-center';
    this.bodyRightElement.className = 'hgrid__body-right';

    this.viewportElement.className = 'hgrid__viewport';
    this.spacerElement.className = 'hgrid__spacer';
    this.verticalScrollElement.className = 'hgrid__v-scroll';
    this.verticalSpacerElement.className = 'hgrid__v-spacer';
    this.horizontalScrollElement.className = 'hgrid__h-scroll';
    this.horizontalSpacerElement.className = 'hgrid__h-spacer';

    this.rowsViewportLeftElement.className = 'hgrid__rows-viewport hgrid__rows-viewport--left';
    this.rowsViewportCenterElement.className = 'hgrid__rows-viewport hgrid__rows-viewport--center';
    this.rowsViewportRightElement.className = 'hgrid__rows-viewport hgrid__rows-viewport--right';

    this.rowsLayerLeftElement.className = 'hgrid__rows-layer hgrid__rows-layer--left';
    this.rowsLayerCenterElement.className = 'hgrid__rows-layer hgrid__rows-layer--center';
    this.rowsLayerRightElement.className = 'hgrid__rows-layer hgrid__rows-layer--right';

    this.rowsViewportLeftElement.append(this.rowsLayerLeftElement);
    this.rowsViewportCenterElement.append(this.rowsLayerCenterElement);
    this.rowsViewportRightElement.append(this.rowsLayerRightElement);

    this.viewportElement.append(this.spacerElement, this.rowsViewportCenterElement);
    this.verticalScrollElement.append(this.verticalSpacerElement);
    this.horizontalScrollElement.append(this.horizontalSpacerElement);

    this.bodyLeftElement.append(this.rowsViewportLeftElement);
    this.bodyCenterElement.append(this.viewportElement);
    this.bodyRightElement.append(this.rowsViewportRightElement);

    this.bodyElement.append(
      this.bodyCenterElement,
      this.bodyLeftElement,
      this.bodyRightElement,
      this.verticalScrollElement,
      this.horizontalScrollElement
    );

    this.overlayElement.className = 'hgrid__overlay';
    this.editorHostElement.className = 'hgrid__editor-host';
    this.editorInputElement.className = 'hgrid__editor-input';
    this.editorInputElement.type = 'text';
    this.editorInputElement.spellcheck = false;
    this.editorMessageElement.className = 'hgrid__editor-message';
    this.editorHostElement.append(this.editorInputElement, this.editorMessageElement);
    this.overlayElement.append(this.editorHostElement);

    this.rootElement.append(this.headerElement, this.bodyElement, this.overlayElement);

    this.updateViewportHeights();
    this.updateSpacerSize();

    this.viewportElement.addEventListener('scroll', this.handleViewportScroll, { passive: true });
    this.verticalScrollElement.addEventListener('scroll', this.handleVerticalScroll, { passive: true });
    this.horizontalScrollElement.addEventListener('scroll', this.handleHorizontalScroll, { passive: true });
    this.horizontalScrollElement.addEventListener('wheel', this.handleAuxiliaryWheel, { passive: false });
    this.headerElement.addEventListener('wheel', this.handleAuxiliaryWheel, { passive: false });
    this.bodyElement.addEventListener('wheel', this.handleBodyWheel, { passive: false });
    this.rootElement.addEventListener('keydown', this.handleRootKeyDown);
    this.rootElement.addEventListener('pointerdown', this.handleRootPointerDown);
    this.rootElement.addEventListener('dblclick', this.handleRootDoubleClick);
    this.editorInputElement.addEventListener('keydown', this.handleEditorInputKeyDown);
    this.editorInputElement.addEventListener('blur', this.handleEditorInputBlur);
    this.editorInputElement.addEventListener('input', this.handleEditorInput);

    this.container.replaceChildren(this.rootElement);
    this.setupResizeObserver();
  }

  private refreshLayout(forcePoolRebuild: boolean): void {
    const previousScrollLeft = this.pendingScrollLeft;
    const previousCenterCellCapacity = this.centerCellCapacity;
    const previousVirtualScrollTop = this.pendingVirtualScrollTop;
    const previousCenterVisibleWidth = this.centerVisibleWidth;

    this.updateViewportHeights();
    this.applyRowHeightModeClass();
    this.applyZoneLayout();
    const didResetRowHeightCache = this.syncRowHeightCache(forcePoolRebuild, previousCenterVisibleWidth);
    if (didResetRowHeightCache) {
      this.applyZoneLayout();
    }
    this.buildCenterColumnMetrics();
    this.rebuildHeader();
    this.updateSpacerSize();

    const shouldRebuildPool =
      forcePoolRebuild || this.rowPool.length !== this.getPoolSize() || previousCenterCellCapacity !== this.centerCellCapacity;
    if (shouldRebuildPool) {
      this.rebuildPool();
    }

    this.setVirtualScrollTop(previousVirtualScrollTop);
    this.setHorizontalScrollLeft(previousScrollLeft);
    this.renderRows(this.pendingScrollTop, this.pendingScrollLeft);
  }

  private rebuildHeader(): void {
    this.buildHeaderRow(this.headerRowLeftElement, this.columnsByZone.left, 'left');
    this.buildHeaderRow(this.headerRowCenterElement, this.columnsByZone.center, 'center');
    this.buildHeaderRow(this.headerRowRightElement, this.columnsByZone.right, 'right');
  }

  private buildHeaderRow(rowElement: HTMLDivElement, columns: ColumnDef[], zoneName: ColumnZoneName): void {
    if (zoneName === 'center') {
      this.buildCenterHeaderRow(rowElement);
      return;
    }

    rowElement.replaceChildren();

    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      const column = columns[colIndex];
      const headerCellElement = document.createElement('div');
      headerCellElement.className = 'hgrid__header-cell';
      headerCellElement.dataset.columnId = column.id;
      headerCellElement.style.width = `${column.width}px`;
      headerCellElement.textContent = column.header;
      rowElement.append(headerCellElement);
    }
  }

  private buildCenterHeaderRow(rowElement: HTMLDivElement): void {
    rowElement.replaceChildren();
    rowElement.style.display = 'block';
    rowElement.style.position = 'relative';
    rowElement.style.width = `${Math.max(1, this.centerColumnsWidth)}px`;
    this.centerHeaderCellPool = [];
    this.centerHeaderCellStates = [];

    for (let slotIndex = 0; slotIndex < this.centerCellCapacity; slotIndex += 1) {
      const headerCellElement = document.createElement('div');
      headerCellElement.className = 'hgrid__header-cell hgrid__header-cell--center';
      headerCellElement.style.position = 'absolute';
      headerCellElement.style.left = '0px';
      headerCellElement.style.display = 'none';
      rowElement.append(headerCellElement);
      this.centerHeaderCellPool.push(headerCellElement);
      this.centerHeaderCellStates.push({
        isVisible: false,
        columnId: '',
        textContent: '',
        left: 0,
        width: 0,
        isSelected: false,
        isActive: false
      });
    }
  }

  private rebuildPool(): void {
    const desiredPoolSize = this.getPoolSize();
    const leftWidth = this.getColumnsWidth(this.columnsByZone.left);
    const centerWidth = this.centerColumnsWidth;
    const rightWidth = this.getColumnsWidth(this.columnsByZone.right);

    this.rowsLayerLeftElement.replaceChildren();
    this.rowsLayerCenterElement.replaceChildren();
    this.rowsLayerRightElement.replaceChildren();
    this.rowPool = [];

    for (let poolIndex = 0; poolIndex < desiredPoolSize; poolIndex += 1) {
      const leftRow = this.createZoneRow('left', this.columnsByZone.left, leftWidth);
      const centerRow = this.createZoneRow('center', this.columnsByZone.center, centerWidth, this.centerCellCapacity);
      const rightRow = this.createZoneRow('right', this.columnsByZone.right, rightWidth);

      this.rowsLayerLeftElement.append(leftRow.element);
      this.rowsLayerCenterElement.append(centerRow.element);
      this.rowsLayerRightElement.append(rightRow.element);

      this.rowPool.push({
        left: leftRow,
        center: centerRow,
        right: rightRow
      });
    }
  }

  private createZoneRow(
    zoneName: ColumnZoneName,
    columns: ColumnDef[],
    width: number,
    cellCapacity?: number
  ): ZoneRowItem {
    const visibleDisplay = zoneName === 'center' ? 'block' : '';
    const rowElement = document.createElement('div');
    rowElement.className = `hgrid__row hgrid__row--${zoneName}`;
    rowElement.style.height = `${this.getBaseRowHeight()}px`;
    rowElement.style.width = `${width}px`;

    if (zoneName === 'center') {
      rowElement.style.display = visibleDisplay;
      rowElement.style.position = 'absolute';
    }

    const cells: HTMLDivElement[] = [];
    const cellStates: CellRenderState[] = [];
    const loopCount = zoneName === 'center' ? Math.max(0, cellCapacity ?? 0) : columns.length;
    for (let colIndex = 0; colIndex < loopCount; colIndex += 1) {
      const column = columns[colIndex];
      const cellElement = document.createElement('div');
      cellElement.className = zoneName === 'center' ? 'hgrid__cell hgrid__cell--center' : 'hgrid__cell';
      if (zoneName === 'center') {
        cellElement.style.position = 'absolute';
        cellElement.style.left = '0px';
        cellElement.style.display = 'none';
      } else {
        cellElement.style.width = `${column.width}px`;
        cellElement.dataset.columnId = column.id;
      }
      rowElement.append(cellElement);
      cells.push(cellElement);
      cellStates.push({
        isVisible: zoneName !== 'center',
        columnId: zoneName === 'center' ? '' : column.id,
        textContent: '',
        left: Number.NaN,
        width: zoneName === 'center' ? Number.NaN : column.width,
        isSelected: false,
        isActive: false
      });
    }

    return {
      element: rowElement,
      cells,
      visibleDisplay,
      rowState: {
        isVisible: true,
        rowIndex: -1,
        dataIndex: -1,
        translateY: Number.NaN,
        height: Number.NaN,
        isSelected: false
      },
      cellStates
    };
  }

  private applyZoneLayout(): void {
    const leftWidth = this.getColumnsWidth(this.columnsByZone.left);
    const centerWidth = this.getColumnsWidth(this.columnsByZone.center);
    this.centerColumnsWidth = centerWidth;
    const rightWidth = this.getColumnsWidth(this.columnsByZone.right);
    this.leftPinnedWidth = leftWidth;
    this.rightPinnedWidth = rightWidth;
    const rowTrackHeight = this.getVirtualRowTrackHeight();
    const viewportHeight = this.getViewportHeight();
    const rootWidth = this.rootElement.clientWidth || this.container.clientWidth || leftWidth + centerWidth + rightWidth;
    const scrollbarPolicy = this.getResolvedScrollbarPolicy();
    let verticalScrollbarSourceWidth = 0;
    let horizontalScrollbarSourceHeight = 0;
    let verticalScrollbarReservedWidth = 0;
    let horizontalScrollbarReservedHeight = 0;
    let centerVisibleWidth = 0;
    let hasVerticalOverflow = false;
    let hasHorizontalOverflow = false;

    for (let pass = 0; pass < 2; pass += 1) {
      const viewportVisibleHeight = Math.max(1, viewportHeight - horizontalScrollbarReservedHeight);
      hasVerticalOverflow = rowTrackHeight > viewportVisibleHeight;
      verticalScrollbarSourceWidth = this.resolveScrollbarSourceExtent(
        scrollbarPolicy.vertical,
        hasVerticalOverflow,
        this.scrollbarSize.vertical
      );
      verticalScrollbarReservedWidth = this.resolveReservedScrollbarExtent(
        scrollbarPolicy.vertical,
        hasVerticalOverflow,
        this.scrollbarSize.vertical,
        verticalScrollbarSourceWidth
      );

      centerVisibleWidth = Math.max(0, rootWidth - leftWidth - rightWidth - verticalScrollbarReservedWidth);
      hasHorizontalOverflow = centerWidth > centerVisibleWidth;
      horizontalScrollbarSourceHeight = this.resolveScrollbarSourceExtent(
        scrollbarPolicy.horizontal,
        hasHorizontalOverflow,
        this.scrollbarSize.horizontal
      );
      horizontalScrollbarReservedHeight = this.resolveReservedScrollbarExtent(
        scrollbarPolicy.horizontal,
        hasHorizontalOverflow,
        this.scrollbarSize.horizontal,
        horizontalScrollbarSourceHeight
      );
    }

    const shouldShowVerticalBar = verticalScrollbarSourceWidth > 0;
    const shouldShowHorizontalBar = horizontalScrollbarSourceHeight > 0;
    this.centerVisibleWidth = Math.max(1, centerVisibleWidth);

    this.canUseVerticalScroll = shouldShowVerticalBar;
    this.canUseHorizontalScroll = shouldShowHorizontalBar;

    const templateColumns = `${leftWidth}px minmax(0, 1fr) ${rightWidth}px`;
    this.headerElement.style.gridTemplateColumns = templateColumns;
    this.rootElement.style.setProperty('--hgrid-v-scrollbar-width', `${verticalScrollbarReservedWidth}px`);
    this.rootElement.style.setProperty('--hgrid-h-scrollbar-height', `${horizontalScrollbarReservedHeight}px`);
    this.viewportElement.style.overflowY = 'hidden';
    this.verticalScrollElement.style.overflowY = this.toCssOverflowValue(scrollbarPolicy.vertical);
    this.horizontalScrollElement.style.overflowX = this.toCssOverflowValue(scrollbarPolicy.horizontal);
    this.verticalScrollElement.style.display = shouldShowVerticalBar ? 'block' : 'none';
    this.horizontalScrollElement.style.display = shouldShowHorizontalBar ? 'block' : 'none';
    this.verticalScrollElement.style.width = `${verticalScrollbarSourceWidth}px`;
    this.horizontalScrollElement.style.height = `${horizontalScrollbarSourceHeight}px`;

    this.headerRowLeftElement.style.width = `${leftWidth}px`;
    this.headerCenterViewportElement.style.width = `${Math.max(1, centerWidth)}px`;
    this.headerRowRightElement.style.width = `${rightWidth}px`;

    this.bodyLeftElement.style.left = '0px';
    this.bodyLeftElement.style.width = `${leftWidth}px`;
    this.bodyRightElement.style.right = `${verticalScrollbarReservedWidth}px`;
    this.bodyRightElement.style.width = `${rightWidth}px`;

    this.rowsViewportCenterElement.style.left = `${leftWidth}px`;
    this.rowsViewportCenterElement.style.width = `${Math.max(1, centerWidth)}px`;
    this.rowsViewportLeftElement.style.width = `${leftWidth}px`;
    this.rowsViewportRightElement.style.width = `${rightWidth}px`;

    this.rowsLayerLeftElement.style.width = `${leftWidth}px`;
    this.rowsLayerCenterElement.style.width = `${Math.max(1, centerWidth)}px`;
    this.rowsLayerRightElement.style.width = `${rightWidth}px`;

    this.horizontalScrollElement.style.left = `${leftWidth}px`;
    this.horizontalScrollElement.style.right = `${rightWidth + verticalScrollbarReservedWidth}px`;
    this.verticalScrollElement.style.right = '0px';
  }

  private updateViewportHeights(): void {
    const viewportHeight = this.getViewportHeight();
    const viewportHeightText = `${viewportHeight}px`;

    this.bodyElement.style.height = viewportHeightText;
    this.bodyCenterElement.style.height = viewportHeightText;
    this.bodyLeftElement.style.height = viewportHeightText;
    this.bodyRightElement.style.height = viewportHeightText;
    this.verticalScrollElement.style.height = viewportHeightText;
  }

  private updateSpacerSize(): void {
    const rowCount = this.options.rowModel.getViewRowCount();
    const baseRowHeight = this.getBaseRowHeight();
    const virtualHeight = this.getVirtualRowTrackHeight();
    const configuredViewportHeight = this.getViewportHeight();
    const measuredViewportHeight =
      this.viewportElement.clientHeight || this.verticalScrollElement.clientHeight || configuredViewportHeight;
    const metrics = createScrollScaleMetrics({
      rowCount,
      rowHeight: baseRowHeight,
      virtualHeight,
      viewportHeight: measuredViewportHeight,
      maxScrollPx: MAX_SCROLL_PX
    });
    this.virtualScrollHeight = metrics.virtualHeight;
    this.physicalScrollHeight = metrics.scrollHeight;
    this.virtualMaxScrollTop = metrics.virtualMaxScrollTop;
    this.physicalMaxScrollTop = metrics.physicalMaxScrollTop;
    this.scrollScale = metrics.scale;

    this.spacerElement.style.width = '1px';
    this.spacerElement.style.height = `${metrics.scrollHeight}px`;
    this.verticalSpacerElement.style.width = '1px';
    this.verticalSpacerElement.style.height = `${metrics.scrollHeight}px`;
    this.horizontalSpacerElement.style.width = `${Math.max(1, this.centerColumnsWidth)}px`;
  }

  private renderRows(scrollTop: number, scrollLeft: number): void {
    const viewRowCount = this.options.rowModel.getViewRowCount();
    const virtualScrollTop = this.pendingVirtualScrollTop;
    const startRow = this.getStartRowForScrollTop(virtualScrollTop);
    const viewportOffsetY = this.getRowTop(startRow);
    const horizontalWindow = this.getHorizontalWindow(scrollLeft);
    this.renderCenterHeader(horizontalWindow);
    this.renderedStartRow = startRow;
    this.renderedViewportOffsetY = viewportOffsetY;
    this.renderedScrollTop = virtualScrollTop;
    this.renderedHorizontalWindow = horizontalWindow;
    this.syncViewportTransforms(scrollTop, scrollLeft, true);

    for (let poolIndex = 0; poolIndex < this.rowPool.length; poolIndex += 1) {
      const rowIndex = startRow + poolIndex;
      if (rowIndex >= viewRowCount) {
        const hiddenPoolItem = this.rowPool[poolIndex];
        this.hidePoolRow(hiddenPoolItem.left);
        this.hidePoolRow(hiddenPoolItem.center);
        this.hidePoolRow(hiddenPoolItem.right);
        continue;
      }

      const dataIndex = this.options.rowModel.getDataIndex(rowIndex);
      const poolItem = this.rowPool[poolIndex];

      if (dataIndex === -1) {
        this.hidePoolRow(poolItem.left);
        this.hidePoolRow(poolItem.center);
        this.hidePoolRow(poolItem.right);
        continue;
      }

      const row = this.resolveRow(dataIndex);
      const rowHeight = this.resolveRenderedRowHeight(rowIndex, dataIndex);
      const rowTranslateY = this.getRowTop(rowIndex) - viewportOffsetY;

      this.renderZoneRow('left', poolItem.left, this.columnsByZone.left, row, rowIndex, dataIndex, rowTranslateY, rowHeight);
      this.renderCenterZoneRow(poolItem.center, row, rowIndex, dataIndex, rowTranslateY, rowHeight, horizontalWindow);
      this.renderZoneRow('right', poolItem.right, this.columnsByZone.right, row, rowIndex, dataIndex, rowTranslateY, rowHeight);
    }

    this.scheduleMeasuredRowHeightPass();
    if (this.editSession) {
      const canKeepEditing = this.syncEditorOverlayPosition();
      if (!canKeepEditing) {
        this.stopEditing('detached');
      }
    }
  }

  private renderZoneRow(
    zoneName: ColumnZoneName,
    zoneRow: ZoneRowItem,
    columns: ColumnDef[],
    row: GridRowData,
    rowIndex: number,
    dataIndex: number,
    rowTranslateY: number,
    rowHeight: number
  ): void {
    if (columns.length === 0) {
      this.hidePoolRow(zoneRow);
      return;
    }

    this.bindRowPosition(zoneRow, rowIndex, dataIndex, rowTranslateY, rowHeight);

    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      const column = columns[colIndex];
      const cell = zoneRow.cells[colIndex];
      const cellState = zoneRow.cellStates[colIndex];
      const globalColumnIndex = this.getGlobalColumnIndex(zoneName, colIndex);
      this.bindCell(cell, cellState, {
        isVisible: true,
        columnId: column.id,
        textContent: formatColumnValue(column, row),
        isSelected: this.selectionModel.isCellSelected(rowIndex, globalColumnIndex),
        isActive: this.selectionModel.isCellActive(rowIndex, globalColumnIndex)
      });
    }
  }

  private renderCenterZoneRow(
    zoneRow: ZoneRowItem,
    row: GridRowData,
    rowIndex: number,
    dataIndex: number,
    rowTranslateY: number,
    rowHeight: number,
    horizontalWindow: HorizontalWindow
  ): void {
    if (this.columnsByZone.center.length === 0 || horizontalWindow.end <= horizontalWindow.start) {
      this.hidePoolRow(zoneRow);
      return;
    }

    this.bindRowPosition(zoneRow, rowIndex, dataIndex, rowTranslateY, rowHeight);

    const centerColumns = this.columnsByZone.center;
    let slotIndex = 0;

    for (let colIndex = horizontalWindow.start; colIndex < horizontalWindow.end; colIndex += 1) {
      const column = centerColumns[colIndex];
      const cell = zoneRow.cells[slotIndex];
      const cellState = zoneRow.cellStates[slotIndex];
      const globalColumnIndex = this.getGlobalColumnIndex('center', colIndex);
      if (!cell) {
        break;
      }

      this.bindCell(cell, cellState, {
        isVisible: true,
        columnId: column.id,
        textContent: formatColumnValue(column, row),
        left: this.centerColumnLeft[colIndex],
        width: column.width,
        isSelected: this.selectionModel.isCellSelected(rowIndex, globalColumnIndex),
        isActive: this.selectionModel.isCellActive(rowIndex, globalColumnIndex)
      });
      slotIndex += 1;
    }

    for (let hiddenIndex = slotIndex; hiddenIndex < zoneRow.cells.length; hiddenIndex += 1) {
      const hiddenCell = zoneRow.cells[hiddenIndex];
      const hiddenState = zoneRow.cellStates[hiddenIndex];
      this.bindCell(hiddenCell, hiddenState, {
        isVisible: false,
        columnId: '',
        textContent: '',
        isSelected: false,
        isActive: false
      });
    }
  }

  private hidePoolRow(zoneRow: ZoneRowItem): void {
    if (!zoneRow.rowState.isVisible) {
      return;
    }

    zoneRow.element.style.display = 'none';
    if (zoneRow.rowState.isSelected) {
      zoneRow.element.classList.remove('hgrid__row--selected');
      zoneRow.rowState.isSelected = false;
    }
    zoneRow.rowState.isVisible = false;
    zoneRow.rowState.rowIndex = -1;
    zoneRow.rowState.dataIndex = -1;
  }

  private bindRowPosition(
    zoneRow: ZoneRowItem,
    rowIndex: number,
    dataIndex: number,
    rowTranslateY: number,
    rowHeight: number
  ): void {
    const rowState = zoneRow.rowState;

    if (!rowState.isVisible) {
      zoneRow.element.style.display = zoneRow.visibleDisplay;
      rowState.isVisible = true;
    }

    if (rowState.translateY !== rowTranslateY) {
      zoneRow.element.style.transform = `translate3d(0, ${rowTranslateY}px, 0)`;
      rowState.translateY = rowTranslateY;
    }

    if (rowState.height !== rowHeight) {
      zoneRow.element.style.height = `${rowHeight}px`;
      rowState.height = rowHeight;
    }

    if (rowState.rowIndex !== rowIndex) {
      zoneRow.element.dataset.rowIndex = String(rowIndex);
      rowState.rowIndex = rowIndex;
    }

    if (rowState.dataIndex !== dataIndex) {
      zoneRow.element.dataset.dataIndex = String(dataIndex);
      rowState.dataIndex = dataIndex;
    }

    const isSelected = this.selectionModel.isRowSelected(rowIndex);
    if (rowState.isSelected !== isSelected) {
      zoneRow.element.classList.toggle('hgrid__row--selected', isSelected);
      rowState.isSelected = isSelected;
    }
  }

  private bindCell(
    cell: HTMLDivElement,
    cellState: CellRenderState,
    nextState: {
      isVisible: boolean;
      columnId: string;
      textContent: string;
      left?: number;
      width?: number;
      isSelected?: boolean;
      isActive?: boolean;
    }
  ): void {
    const isSelected = nextState.isSelected ?? false;
    const isActive = nextState.isActive ?? false;

    if (cellState.isVisible !== nextState.isVisible) {
      cell.style.display = nextState.isVisible ? '' : 'none';
      cellState.isVisible = nextState.isVisible;
    }

    if (nextState.left !== undefined && cellState.left !== nextState.left) {
      cell.style.left = `${nextState.left}px`;
      cellState.left = nextState.left;
    }

    if (nextState.width !== undefined && cellState.width !== nextState.width) {
      cell.style.width = `${nextState.width}px`;
      cellState.width = nextState.width;
    }

    if (cellState.columnId !== nextState.columnId) {
      cell.dataset.columnId = nextState.columnId;
      cellState.columnId = nextState.columnId;
    }

    if (cellState.textContent !== nextState.textContent) {
      cell.textContent = nextState.textContent;
      cellState.textContent = nextState.textContent;
    }

    if (cellState.isSelected !== isSelected) {
      cell.classList.toggle('hgrid__cell--selected', isSelected);
      cellState.isSelected = isSelected;
    }

    if (cellState.isActive !== isActive) {
      cell.classList.toggle('hgrid__cell--active', isActive);
      cellState.isActive = isActive;
    }
  }

  private getColumnsWidth(columns: ColumnDef[]): number {
    let totalWidth = 0;

    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      totalWidth += columns[colIndex].width;
    }

    return totalWidth;
  }

  private splitColumns(columns: ColumnDef[]): ColumnsByZone {
    const byZone: ColumnsByZone = {
      left: [],
      center: [],
      right: []
    };

    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      if (column.pinned === 'left') {
        byZone.left.push(column);
      } else if (column.pinned === 'right') {
        byZone.right.push(column);
      } else {
        byZone.center.push(column);
      }
    }

    return byZone;
  }

  private getGlobalColumnCount(): number {
    return this.columnsByZone.left.length + this.columnsByZone.center.length + this.columnsByZone.right.length;
  }

  private getGlobalColumnIndex(zone: ColumnZoneName, zoneColumnIndex: number): number {
    if (zone === 'left') {
      return zoneColumnIndex;
    }

    if (zone === 'center') {
      return this.columnsByZone.left.length + zoneColumnIndex;
    }

    return this.columnsByZone.left.length + this.columnsByZone.center.length + zoneColumnIndex;
  }

  private getSelectionBounds(): { rowCount: number; columnCount: number } {
    return {
      rowCount: this.options.rowModel.getViewRowCount(),
      columnCount: this.getGlobalColumnCount()
    };
  }

  private resolveRowKeyByRowIndex = (rowIndex: number): RowKey | null => {
    if (rowIndex < 0 || rowIndex >= this.options.rowModel.getViewRowCount()) {
      return null;
    }

    const dataIndex = this.options.rowModel.getDataIndex(rowIndex);
    if (dataIndex === -1) {
      return null;
    }

    return this.options.dataProvider.getRowKey(dataIndex);
  };

  private reconcileSelection(source: SelectionChangeSource): void {
    const hasChanged = this.selectionModel.reconcile(this.getSelectionBounds(), this.resolveRowKeyByRowIndex);
    if (!hasChanged) {
      return;
    }

    const nextSelection = this.selectionModel.getSelection();
    this.keyboardRangeAnchor = nextSelection.activeCell ? { ...nextSelection.activeCell } : null;
    this.commitSelectionChange(source);
  }

  private commitSelectionChange(source: SelectionChangeSource): void {
    const selection = this.selectionModel.getSelection();
    this.eventBus.emit('selectionChange', {
      ...selection,
      source
    });
    this.markSelectionDirty();
    this.scheduleRender();
  }

  private resolveColumnByGlobalIndex(
    globalColumnIndex: number
  ): { zone: ColumnZoneName; zoneColumnIndex: number; column: ColumnDef } | null {
    if (globalColumnIndex < 0) {
      return null;
    }

    const leftCount = this.columnsByZone.left.length;
    if (globalColumnIndex < leftCount) {
      const column = this.columnsByZone.left[globalColumnIndex];
      return column
        ? {
            zone: 'left',
            zoneColumnIndex: globalColumnIndex,
            column
          }
        : null;
    }

    const centerCount = this.columnsByZone.center.length;
    if (globalColumnIndex < leftCount + centerCount) {
      const zoneColumnIndex = globalColumnIndex - leftCount;
      const column = this.columnsByZone.center[zoneColumnIndex];
      return column
        ? {
            zone: 'center',
            zoneColumnIndex,
            column
          }
        : null;
    }

    const zoneColumnIndex = globalColumnIndex - leftCount - centerCount;
    const column = this.columnsByZone.right[zoneColumnIndex];
    return column
      ? {
          zone: 'right',
          zoneColumnIndex,
          column
        }
      : null;
  }

  private findPoolItemByRowIndex(rowIndex: number): RowPoolItem | null {
    for (let poolIndex = 0; poolIndex < this.rowPool.length; poolIndex += 1) {
      const poolItem = this.rowPool[poolIndex];
      if (!poolItem.center.rowState.isVisible) {
        continue;
      }

      if (poolItem.center.rowState.rowIndex === rowIndex) {
        return poolItem;
      }
    }

    return null;
  }

  private resolveCellElementBySelectionPosition(
    rowIndex: number,
    colIndex: number
  ): { cell: HTMLDivElement; column: ColumnDef; zone: ColumnZoneName } | null {
    const columnEntry = this.resolveColumnByGlobalIndex(colIndex);
    if (!columnEntry) {
      return null;
    }

    const poolItem = this.findPoolItemByRowIndex(rowIndex);
    if (!poolItem) {
      return null;
    }

    if (columnEntry.zone === 'left') {
      const cell = poolItem.left.cells[columnEntry.zoneColumnIndex];
      if (!cell) {
        return null;
      }

      return {
        cell,
        column: columnEntry.column,
        zone: 'left'
      };
    }

    if (columnEntry.zone === 'right') {
      const cell = poolItem.right.cells[columnEntry.zoneColumnIndex];
      if (!cell) {
        return null;
      }

      return {
        cell,
        column: columnEntry.column,
        zone: 'right'
      };
    }

    if (
      columnEntry.zoneColumnIndex < this.renderedHorizontalWindow.start ||
      columnEntry.zoneColumnIndex >= this.renderedHorizontalWindow.end
    ) {
      return null;
    }

    const slotIndex = columnEntry.zoneColumnIndex - this.renderedHorizontalWindow.start;
    if (slotIndex < 0 || slotIndex >= poolItem.center.cells.length) {
      return null;
    }

    const cell = poolItem.center.cells[slotIndex];
    const cellState = poolItem.center.cellStates[slotIndex];
    if (!cell || !cellState?.isVisible || cellState.columnId !== columnEntry.column.id) {
      return null;
    }

    return {
      cell,
      column: columnEntry.column,
      zone: 'center'
    };
  }

  private normalizeEditorInputValue(column: ColumnDef, inputText: string): unknown {
    const trimmedText = inputText.trim();
    if (column.type === 'number') {
      if (trimmedText.length === 0) {
        return null;
      }

      const numericValue = Number(trimmedText);
      return Number.isFinite(numericValue) ? numericValue : inputText;
    }

    if (column.type === 'boolean') {
      const lowerCaseValue = trimmedText.toLowerCase();
      if (lowerCaseValue === 'true' || lowerCaseValue === '1' || lowerCaseValue === 'yes' || lowerCaseValue === 'on') {
        return true;
      }

      if (lowerCaseValue === 'false' || lowerCaseValue === '0' || lowerCaseValue === 'no' || lowerCaseValue === 'off') {
        return false;
      }
    }

    return inputText;
  }

  private startEditingAtCell(
    rowIndex: number,
    colIndex: number,
    dataIndexOverride?: number
  ): boolean {
    if (this.isEditValidationPending) {
      return false;
    }

    if (this.editSession) {
      const isSameCell = this.editSession.rowIndex === rowIndex && this.editSession.colIndex === colIndex;
      if (isSameCell) {
        this.syncEditorOverlayPosition();
        this.editorInputElement.focus();
        this.editorInputElement.select();
        return true;
      }

      this.stopEditing('reconcile');
    }

    const cellEntry = this.resolveCellElementBySelectionPosition(rowIndex, colIndex);
    if (!cellEntry) {
      return false;
    }

    const { column } = cellEntry;
    if (!column.editable) {
      return false;
    }

    const dataIndex = typeof dataIndexOverride === 'number' ? dataIndexOverride : this.options.rowModel.getDataIndex(rowIndex);
    if (dataIndex < 0) {
      return false;
    }

    const row = this.resolveRow(dataIndex);
    const originalValue = getColumnValue(column, row);

    this.editSession = {
      rowIndex,
      dataIndex,
      colIndex,
      column,
      originalValue
    };
    this.editValidationTicket += 1;
    this.isEditValidationPending = false;
    this.editorInputElement.disabled = false;
    this.editorHostElement.classList.remove('hgrid__editor-host--invalid', 'hgrid__editor-host--pending');
    this.editorMessageElement.textContent = '';
    this.editorInputElement.value = originalValue === undefined || originalValue === null ? '' : String(originalValue);
    this.editorHostElement.classList.add('hgrid__editor-host--visible');
    this.syncEditorOverlayPosition();
    this.editorInputElement.focus();
    this.editorInputElement.select();

    this.eventBus.emit('editStart', {
      rowIndex,
      dataIndex,
      columnId: column.id,
      value: originalValue
    });

    return true;
  }

  private stopEditing(reason: 'escape' | 'reconcile' | 'detached', shouldEmitCancel = true): void {
    if (!this.editSession) {
      return;
    }

    const currentSession = this.editSession;
    this.editValidationTicket += 1;
    this.isEditValidationPending = false;
    this.editSession = null;
    this.editorInputElement.disabled = false;
    this.editorHostElement.classList.remove('hgrid__editor-host--visible', 'hgrid__editor-host--invalid', 'hgrid__editor-host--pending');
    this.editorMessageElement.textContent = '';

    if (shouldEmitCancel) {
      this.eventBus.emit('editCancel', {
        rowIndex: currentSession.rowIndex,
        dataIndex: currentSession.dataIndex,
        columnId: currentSession.column.id,
        value: this.editorInputElement.value,
        reason
      });
    }
  }

  private async commitEditing(trigger: 'enter' | 'blur'): Promise<void> {
    const currentSession = this.editSession;
    if (!currentSession || this.isEditValidationPending) {
      return;
    }

    const nextValue = this.normalizeEditorInputValue(currentSession.column, this.editorInputElement.value);
    const row = this.resolveRow(currentSession.dataIndex);
    const validateEdit = this.options.validateEdit;
    const currentValidationTicket = ++this.editValidationTicket;

    if (validateEdit) {
      const validationResult = validateEdit({
        rowIndex: currentSession.rowIndex,
        dataIndex: currentSession.dataIndex,
        column: currentSession.column,
        value: nextValue,
        previousValue: currentSession.originalValue,
        row
      });

      if (validationResult && typeof (validationResult as Promise<unknown>).then === 'function') {
        this.isEditValidationPending = true;
        this.editorHostElement.classList.add('hgrid__editor-host--pending');
        this.editorInputElement.disabled = true;
        let resolvedMessage: string | null | undefined = null;
        try {
          resolvedMessage = await validationResult;
        } catch (error) {
          resolvedMessage = error instanceof Error && error.message ? error.message : 'Validation failed';
        }
        if (currentValidationTicket !== this.editValidationTicket || this.editSession !== currentSession) {
          return;
        }

        this.isEditValidationPending = false;
        this.editorHostElement.classList.remove('hgrid__editor-host--pending');
        this.editorInputElement.disabled = false;

        if (typeof resolvedMessage === 'string' && resolvedMessage.length > 0) {
          this.editorHostElement.classList.add('hgrid__editor-host--invalid');
          this.editorMessageElement.textContent = resolvedMessage;
          if (trigger === 'blur') {
            this.editorInputElement.focus();
            this.editorInputElement.select();
          }
          return;
        }
      } else if (typeof validationResult === 'string' && validationResult.length > 0) {
        this.editorHostElement.classList.add('hgrid__editor-host--invalid');
        this.editorMessageElement.textContent = validationResult;
        if (trigger === 'blur') {
          this.editorInputElement.focus();
          this.editorInputElement.select();
        }
        return;
      }
    }

    this.editorHostElement.classList.remove('hgrid__editor-host--invalid');
    this.editorMessageElement.textContent = '';
    let committedValue = nextValue;
    if (currentSession.column.valueSetter) {
      const rowForSetter = this.options.dataProvider.getRow
        ? this.options.dataProvider.getRow(currentSession.dataIndex) ?? row
        : row;
      currentSession.column.valueSetter(rowForSetter, nextValue, currentSession.column);
      committedValue = getColumnValue(currentSession.column, rowForSetter);
    }
    this.options.dataProvider.setValue(currentSession.dataIndex, currentSession.column.id, committedValue);

    this.eventBus.emit('editCommit', {
      rowIndex: currentSession.rowIndex,
      dataIndex: currentSession.dataIndex,
      columnId: currentSession.column.id,
      previousValue: currentSession.originalValue,
      value: committedValue
    });

    this.stopEditing('reconcile', false);
    this.markDataDirty();
    this.scheduleRender();
  }

  private syncEditorOverlayPosition(): boolean {
    if (!this.editSession) {
      return true;
    }

    const cellEntry = this.resolveCellElementBySelectionPosition(this.editSession.rowIndex, this.editSession.colIndex);
    if (!cellEntry) {
      return false;
    }

    const cellRect = cellEntry.cell.getBoundingClientRect();
    const rootRect = this.rootElement.getBoundingClientRect();
    this.editorHostElement.style.left = `${Math.max(0, cellRect.left - rootRect.left)}px`;
    this.editorHostElement.style.top = `${Math.max(0, cellRect.top - rootRect.top)}px`;
    this.editorHostElement.style.width = `${Math.max(1, cellRect.width)}px`;
    this.editorHostElement.style.height = `${Math.max(1, cellRect.height)}px`;
    return true;
  }

  private buildCenterColumnMetrics(): void {
    const leftColumns = this.columnsByZone.left;
    this.leftColumnLeft = new Array(leftColumns.length);
    this.leftColumnWidth = new Array(leftColumns.length);
    let nextLeftPinnedOffset = 0;
    for (let colIndex = 0; colIndex < leftColumns.length; colIndex += 1) {
      const width = Math.max(1, leftColumns[colIndex].width);
      this.leftColumnLeft[colIndex] = nextLeftPinnedOffset;
      this.leftColumnWidth[colIndex] = width;
      nextLeftPinnedOffset += width;
    }

    const centerColumns = this.columnsByZone.center;
    this.centerColumnLeft = new Array(centerColumns.length);
    this.centerColumnWidth = new Array(centerColumns.length);

    let nextLeft = 0;
    let minWidth = Number.POSITIVE_INFINITY;
    for (let colIndex = 0; colIndex < centerColumns.length; colIndex += 1) {
      const width = Math.max(1, centerColumns[colIndex].width);
      this.centerColumnLeft[colIndex] = nextLeft;
      this.centerColumnWidth[colIndex] = width;
      nextLeft += width;
      minWidth = Math.min(minWidth, width);
    }
    this.centerColumnsWidth = nextLeft;

    const rightColumns = this.columnsByZone.right;
    this.rightColumnLeft = new Array(rightColumns.length);
    this.rightColumnWidth = new Array(rightColumns.length);
    let nextRightPinnedOffset = 0;
    for (let colIndex = 0; colIndex < rightColumns.length; colIndex += 1) {
      const width = Math.max(1, rightColumns[colIndex].width);
      this.rightColumnLeft[colIndex] = nextRightPinnedOffset;
      this.rightColumnWidth[colIndex] = width;
      nextRightPinnedOffset += width;
    }

    if (centerColumns.length === 0) {
      this.centerCellCapacity = 0;
      return;
    }

    const safeMinWidth = Number.isFinite(minWidth) ? minWidth : 1;
    const estimatedVisibleColumns = Math.ceil(this.centerVisibleWidth / safeMinWidth) + 2;
    const estimatedWithOverscan = estimatedVisibleColumns + this.getColumnOverscan() * 2;
    this.centerCellCapacity = Math.max(
      1,
      Math.min(centerColumns.length, estimatedWithOverscan)
    );
  }

  private getColumnOverscan(): number {
    const rawOverscan = this.options.overscanCols;
    if (typeof rawOverscan !== 'number' || !Number.isFinite(rawOverscan)) {
      return DEFAULT_COLUMN_OVERSCAN;
    }

    return Math.max(0, Math.floor(rawOverscan));
  }

  private getHorizontalWindow(scrollLeft: number): HorizontalWindow {
    const totalCenterColumns = this.columnsByZone.center.length;
    if (totalCenterColumns === 0 || this.centerCellCapacity === 0) {
      return { start: 0, end: 0 };
    }

    const overscanCols = this.getColumnOverscan();
    const scrollRight = scrollLeft + Math.max(1, this.centerVisibleWidth);
    const firstVisible = this.findFirstColumnEndingAfter(scrollLeft);
    const endVisibleExclusive = this.findFirstColumnStartingAtOrAfter(scrollRight);
    const start = Math.max(0, firstVisible - overscanCols);
    const end = Math.min(totalCenterColumns, Math.max(start + 1, endVisibleExclusive + overscanCols));

    if (end - start <= this.centerCellCapacity) {
      return { start, end };
    }

    return {
      start,
      end: Math.min(totalCenterColumns, start + this.centerCellCapacity)
    };
  }

  private findFirstColumnEndingAfter(offset: number): number {
    let low = 0;
    let high = this.centerColumnLeft.length;

    while (low < high) {
      const mid = (low + high) >> 1;
      const columnEnd = this.centerColumnLeft[mid] + this.centerColumnWidth[mid];
      if (columnEnd <= offset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return Math.min(low, this.centerColumnLeft.length);
  }

  private findFirstColumnStartingAtOrAfter(offset: number): number {
    let low = 0;
    let high = this.centerColumnLeft.length;

    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.centerColumnLeft[mid] < offset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return Math.min(low, this.centerColumnLeft.length);
  }

  private findColumnIndexAtOffset(columnLeft: number[], columnWidth: number[], offset: number): number {
    if (columnLeft.length === 0 || offset < 0) {
      return -1;
    }

    let low = 0;
    let high = columnLeft.length;

    while (low < high) {
      const mid = (low + high) >> 1;
      const start = columnLeft[mid];
      const end = start + columnWidth[mid];
      if (offset < start) {
        high = mid;
      } else if (offset >= end) {
        low = mid + 1;
      } else {
        return mid;
      }
    }

    return -1;
  }

  private renderCenterHeader(horizontalWindow: HorizontalWindow): void {
    if (this.centerHeaderCellPool.length === 0 || horizontalWindow.end <= horizontalWindow.start) {
      for (let slotIndex = 0; slotIndex < this.centerHeaderCellPool.length; slotIndex += 1) {
        this.bindCell(this.centerHeaderCellPool[slotIndex], this.centerHeaderCellStates[slotIndex], {
          isVisible: false,
          columnId: '',
          textContent: ''
        });
      }
      return;
    }

    const centerColumns = this.columnsByZone.center;
    let slotIndex = 0;

    for (let colIndex = horizontalWindow.start; colIndex < horizontalWindow.end; colIndex += 1) {
      const column = centerColumns[colIndex];
      const headerCell = this.centerHeaderCellPool[slotIndex];
      if (!headerCell) {
        break;
      }

      this.bindCell(headerCell, this.centerHeaderCellStates[slotIndex], {
        isVisible: true,
        columnId: column.id,
        textContent: column.header,
        left: this.centerColumnLeft[colIndex],
        width: column.width
      });
      slotIndex += 1;
    }

    for (let hiddenIndex = slotIndex; hiddenIndex < this.centerHeaderCellPool.length; hiddenIndex += 1) {
      this.bindCell(this.centerHeaderCellPool[hiddenIndex], this.centerHeaderCellStates[hiddenIndex], {
        isVisible: false,
        columnId: '',
        textContent: ''
      });
    }
  }

  private getPoolSize(): number {
    const baseRowHeight = this.getBaseRowHeight();
    const visibleRows = Math.ceil(this.getViewportHeight() / baseRowHeight);
    const overscanRows = this.getOverscan() * 2;
    const variableRows = this.isVariableRowHeightMode() ? VARIABLE_POOL_EXTRA_ROWS : 0;
    return Math.max(1, visibleRows + overscanRows + variableRows);
  }

  private getFixedRowHeight(): number {
    return Math.max(1, Math.round(this.options.rowHeight ?? DEFAULT_ROW_HEIGHT));
  }

  private getBaseRowHeight(): number {
    const defaultEstimated = this.options.rowHeight ?? DEFAULT_ESTIMATED_ROW_HEIGHT;
    const estimated = this.options.estimatedRowHeight ?? defaultEstimated;
    return Math.max(1, Math.round(estimated));
  }

  private getRowHeightMode(): RowHeightMode {
    return this.options.rowHeightMode ?? 'fixed';
  }

  private isVariableRowHeightMode(): boolean {
    const mode = this.getRowHeightMode();
    return mode === 'estimated' || mode === 'measured';
  }

  private normalizeRowHeightValue(value: number): number {
    const fallback = this.getBaseRowHeight();
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.max(1, Math.round(value));
  }

  private resolveRenderedRowHeight(rowIndex: number, dataIndex: number): number {
    if (!this.isVariableRowHeightMode()) {
      return this.getFixedRowHeight();
    }

    if (this.getRowHeightMode() === 'estimated' && this.options.getRowHeight && !this.rowHeightMap.hasRowHeight(rowIndex)) {
      const estimatedHeight = this.options.getRowHeight(rowIndex, dataIndex);
      this.rowHeightMap.setRowHeight(rowIndex, this.normalizeRowHeightValue(estimatedHeight));
    }

    return this.rowHeightMap.getRowHeight(rowIndex);
  }

  private getVirtualRowTrackHeight(): number {
    if (!this.isVariableRowHeightMode()) {
      return this.options.rowModel.getViewRowCount() * this.getFixedRowHeight();
    }

    return this.rowHeightMap.getTotalHeight();
  }

  private getRowTop(rowIndex: number): number {
    if (!this.isVariableRowHeightMode()) {
      const clampedRowIndex = Math.max(0, Math.floor(rowIndex));
      return clampedRowIndex * this.getFixedRowHeight();
    }

    return this.rowHeightMap.getRowTop(rowIndex);
  }

  private syncRowHeightCache(forcePoolRebuild: boolean, previousCenterVisibleWidth: number): boolean {
    const rowCount = this.options.rowModel.getViewRowCount();
    const baseRowHeight = this.getBaseRowHeight();
    const mode = this.getRowHeightMode();

    if (mode !== 'measured' && this.measurementFrameId !== null) {
      cancelAnimationFrame(this.measurementFrameId);
      this.measurementFrameId = null;
    }

    const measuredWidthChanged = mode === 'measured' && Math.abs(this.centerVisibleWidth - previousCenterVisibleWidth) >= 1;
    const shouldResetCompletely =
      !this.isVariableRowHeightMode() ||
      this.rowHeightMap.getRowCount() !== rowCount ||
      this.rowHeightMap.getBaseHeight() !== baseRowHeight;

    if (shouldResetCompletely) {
      this.rowHeightMap.reset(rowCount, baseRowHeight);
      return true;
    }

    if (mode === 'measured' && (measuredWidthChanged || forcePoolRebuild)) {
      // Width-sensitive measured mode: invalidate only current rendered range and re-measure in next pass.
      const dirtyRowIndexes = this.collectVisibleRowIndexesFromPool();
      if (dirtyRowIndexes.length > 0) {
        this.rowHeightMap.clearRows(dirtyRowIndexes);
        return true;
      }
    }

    return false;
  }

  private applyRowHeightModeClass(): void {
    const mode = this.getRowHeightMode();
    this.rootElement.classList.toggle('hgrid--row-height-estimated', mode === 'estimated');
    this.rootElement.classList.toggle('hgrid--row-height-measured', mode === 'measured');
  }

  private scheduleMeasuredRowHeightPass(): void {
    if (this.getRowHeightMode() !== 'measured') {
      return;
    }

    if (this.measurementFrameId !== null) {
      return;
    }

    this.measurementFrameId = requestAnimationFrame(() => {
      this.measurementFrameId = null;
      this.measureVisibleRowHeights();
    });
  }

  private measureVisibleRowHeights(): void {
    if (this.getRowHeightMode() !== 'measured') {
      return;
    }

    const baseHeight = this.getBaseRowHeight();
    const anchorRowIndex = this.renderedStartRow;
    const anchorTopBefore = this.rowHeightMap.getRowTop(anchorRowIndex);
    let hasChanged = false;

    for (let poolIndex = 0; poolIndex < this.rowPool.length; poolIndex += 1) {
      const poolItem = this.rowPool[poolIndex];
      if (!poolItem.center.rowState.isVisible) {
        continue;
      }

      const rowIndex = poolItem.center.rowState.rowIndex;
      if (rowIndex < 0) {
        continue;
      }

      const measuredHeight = Math.max(
        baseHeight,
        Math.ceil(
          Math.max(
            this.measureZoneContentHeight(poolItem.left),
            this.measureZoneContentHeight(poolItem.center),
            this.measureZoneContentHeight(poolItem.right)
          )
        )
      );

      if (this.rowHeightMap.setRowHeight(rowIndex, measuredHeight)) {
        hasChanged = true;
      }
    }

    if (!hasChanged) {
      return;
    }

    const anchorTopAfter = this.rowHeightMap.getRowTop(anchorRowIndex);
    if (anchorTopAfter !== anchorTopBefore) {
      this.setVirtualScrollTop(this.pendingVirtualScrollTop + (anchorTopAfter - anchorTopBefore));
    }

    this.markLayoutDirty(false);
    this.scheduleRender();
  }

  private measureZoneContentHeight(zoneRow: ZoneRowItem): number {
    let maxHeight = zoneRow.element.scrollHeight;

    for (let cellIndex = 0; cellIndex < zoneRow.cells.length; cellIndex += 1) {
      const cell = zoneRow.cells[cellIndex];
      if (cell.style.display === 'none') {
        continue;
      }

      maxHeight = Math.max(maxHeight, cell.scrollHeight);
    }

    return maxHeight;
  }

  private collectVisibleRowIndexesFromPool(): number[] {
    const rowIndexes: number[] = [];
    for (let poolIndex = 0; poolIndex < this.rowPool.length; poolIndex += 1) {
      const rowState = this.rowPool[poolIndex].center.rowState;
      if (!rowState.isVisible || rowState.rowIndex < 0) {
        continue;
      }
      rowIndexes.push(rowState.rowIndex);
    }

    return rowIndexes;
  }

  private getOverscan(): number {
    return this.options.overscan ?? DEFAULT_OVERSCAN;
  }

  private getViewportHeight(): number {
    return this.options.height ?? DEFAULT_HEIGHT;
  }

  private getVariableOverscanPx(): number {
    if (!this.isVariableRowHeightMode()) {
      return 0;
    }

    return this.getBaseRowHeight() * Math.max(1, this.getOverscan());
  }

  private getStartRowForScrollTop(scrollTop: number): number {
    const overscan = this.getOverscan();
    if (!this.isVariableRowHeightMode()) {
      const firstVisibleRow = Math.floor(scrollTop / this.getFixedRowHeight());
      return Math.max(0, firstVisibleRow - overscan);
    }

    const firstVisibleRow = this.rowHeightMap.findRowIndexAtOffset(scrollTop);
    const overscanByRows = Math.max(0, firstVisibleRow - overscan);
    const overscanByPixels = this.rowHeightMap.findRowIndexAtOffset(Math.max(0, scrollTop - this.getVariableOverscanPx()));
    return Math.max(0, Math.min(overscanByRows, overscanByPixels));
  }

  private markLayoutDirty(forcePoolRebuild: boolean): void {
    this.layoutDirty = true;
    this.dataDirty = true;
    this.scrollDirty = true;
    if (forcePoolRebuild) {
      this.shouldForcePoolRebuild = true;
    }
  }

  private markDataDirty(): void {
    this.dataDirty = true;
  }

  private markSelectionDirty(): void {
    this.selectionDirty = true;
  }

  private markThemeDirty(): void {
    this.themeDirty = true;
  }

  private markScrollDirty(): void {
    this.scrollDirty = true;
  }

  private hasPendingRenderWork(): boolean {
    return this.layoutDirty || this.dataDirty || this.selectionDirty || this.themeDirty || this.scrollDirty;
  }

  private applyPendingThemeTokens(): void {
    if (!this.themeDirty) {
      return;
    }

    for (const tokenName in this.pendingThemeTokens) {
      if (Object.prototype.hasOwnProperty.call(this.pendingThemeTokens, tokenName)) {
        this.rootElement.style.setProperty(tokenName, this.pendingThemeTokens[tokenName]);
      }
    }

    this.pendingThemeTokens = {};
    this.themeDirty = false;
  }

  private flushRender(): void {
    if (!this.hasPendingRenderWork()) {
      return;
    }

    this.applyPendingThemeTokens();

    const shouldRunLayout = this.layoutDirty;
    const shouldRunRows = this.scrollDirty || this.dataDirty || this.selectionDirty;
    const shouldForcePoolRebuild = this.shouldForcePoolRebuild;

    this.layoutDirty = false;
    this.dataDirty = false;
    this.selectionDirty = false;
    this.scrollDirty = false;
    this.shouldForcePoolRebuild = false;

    if (shouldRunLayout) {
      this.refreshLayout(shouldForcePoolRebuild);
      return;
    }

    if (shouldRunRows) {
      this.renderRows(this.pendingScrollTop, this.pendingScrollLeft);
    }
  }

  private scheduleRender(): void {
    if (this.scheduledFrameId !== null) {
      return;
    }

    this.scheduledFrameId = requestAnimationFrame(() => {
      this.scheduledFrameId = null;
      this.flushRender();
    });
  }

  private handleViewportScroll = (event: Event): void => {
    if (this.isSyncingScroll) {
      return;
    }

    const viewportElement = event.currentTarget as HTMLDivElement;
    if (!this.canUseVerticalScroll) {
      this.pendingScrollTop = viewportElement.scrollTop;
      this.pendingVirtualScrollTop = this.toVirtualScrollTop(this.pendingScrollTop);
      this.syncViewportTransforms(this.pendingScrollTop, this.pendingScrollLeft, false);
      this.markScrollDirty();
      this.scheduleRender();
      return;
    }

    this.setVerticalScrollTop(viewportElement.scrollTop);
    this.markScrollDirty();
    this.scheduleRender();
  };

  private handleVerticalScroll = (event: Event): void => {
    if (this.isSyncingScroll) {
      return;
    }

    const verticalScrollElement = event.currentTarget as HTMLDivElement;
    this.setVerticalScrollTop(verticalScrollElement.scrollTop);
    this.markScrollDirty();
    this.scheduleRender();
  };

  private handleHorizontalScroll = (event: Event): void => {
    if (this.isSyncingScroll) {
      return;
    }

    const horizontalScrollElement = event.currentTarget as HTMLDivElement;
    this.pendingScrollLeft = horizontalScrollElement.scrollLeft;
    this.syncViewportTransforms(this.pendingScrollTop, this.pendingScrollLeft, false);
    this.markScrollDirty();
    this.scheduleRender();
  };

  private handleBodyWheel = (event: WheelEvent): void => {
    const target = event.target as HTMLElement;
    const bodyZone = target.closest('.hgrid__body-left, .hgrid__body-center, .hgrid__body-right');
    if (!bodyZone) {
      return;
    }

    const isPinnedZone =
      bodyZone.classList.contains('hgrid__body-left') || bodyZone.classList.contains('hgrid__body-right');
    const horizontalDelta = isPinnedZone ? 0 : event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    const verticalDelta = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
    const shouldHandleHorizontal = this.canUseHorizontalScroll && horizontalDelta !== 0;
    const shouldHandleVertical = this.canUseVerticalScroll && verticalDelta !== 0;

    if (shouldHandleHorizontal || shouldHandleVertical) {
      event.preventDefault();
    }

    if (shouldHandleVertical) {
      this.addVerticalScrollDelta(verticalDelta);
    }

    if (shouldHandleHorizontal) {
      this.setHorizontalScrollLeft(this.horizontalScrollElement.scrollLeft + horizontalDelta);
    }

    if (shouldHandleHorizontal || shouldHandleVertical) {
      this.markScrollDirty();
      this.scheduleRender();
    }
  };

  private handleAuxiliaryWheel = (event: WheelEvent): void => {
    const horizontalDelta = event.deltaX !== 0 ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    const verticalDelta = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;
    let hasConsumed = false;

    if (this.canUseHorizontalScroll && horizontalDelta !== 0) {
      this.setHorizontalScrollLeft(this.horizontalScrollElement.scrollLeft + horizontalDelta);
      hasConsumed = true;
    }

    if (this.canUseVerticalScroll && verticalDelta !== 0) {
      this.addVerticalScrollDelta(verticalDelta);
      hasConsumed = true;
    }

    if (hasConsumed) {
      event.preventDefault();
      this.markScrollDirty();
      this.scheduleRender();
    }
  };

  private handleRootPointerDown = (event: PointerEvent): void => {
    if (this.editSession) {
      return;
    }

    if (event.defaultPrevented) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const hit = this.hitTestCellAtPoint(event.clientX, event.clientY);
    if (!hit) {
      return;
    }

    const focusCell = this.toSelectionCellPosition(hit);
    const currentSelection = this.selectionModel.getSelection();
    const anchorCell = event.shiftKey && currentSelection.activeCell ? currentSelection.activeCell : focusCell;
    const hasSelectionChanged = this.selectionModel.setPointerRange(
      anchorCell,
      focusCell,
      this.getSelectionBounds(),
      this.resolveRowKeyByRowIndex
    );
    if (hasSelectionChanged) {
      this.commitSelectionChange('pointer');
    }
    this.keyboardRangeAnchor = { ...anchorCell };
    this.startPointerSelectionSession(event.pointerId, anchorCell, focusCell);

    const row = this.resolveRow(hit.dataIndex);
    this.eventBus.emit('cellClick', {
      rowIndex: hit.rowIndex,
      dataIndex: hit.dataIndex,
      columnId: hit.column.id,
      value: getColumnValue(hit.column, row)
    });
  };

  private handleRootDoubleClick = (event: MouseEvent): void => {
    if (event.defaultPrevented) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    const hit = this.hitTestCellAtPoint(event.clientX, event.clientY);
    if (!hit) {
      return;
    }

    const cellPosition = this.toSelectionCellPosition(hit);
    const hasSelectionChanged = this.selectionModel.setSelection(
      {
        activeCell: cellPosition,
        cellRanges: [
          {
            r1: cellPosition.rowIndex,
            c1: cellPosition.colIndex,
            r2: cellPosition.rowIndex,
            c2: cellPosition.colIndex
          }
        ],
        rowRanges: []
      },
      this.getSelectionBounds(),
      this.resolveRowKeyByRowIndex
    );
    if (hasSelectionChanged) {
      this.commitSelectionChange('pointer');
    }

    this.keyboardRangeAnchor = { ...cellPosition };
    if (this.startEditingAtCell(hit.rowIndex, cellPosition.colIndex, hit.dataIndex)) {
      event.preventDefault();
    }
  };

  private toSelectionCellPosition(hit: CellHitTestResult): SelectionCellPosition {
    return {
      rowIndex: hit.rowIndex,
      colIndex: this.getGlobalColumnIndex(hit.zone, hit.columnIndex)
    };
  }

  private startPointerSelectionSession(
    pointerId: number,
    anchorCell: SelectionCellPosition,
    focusCell: SelectionCellPosition
  ): void {
    this.teardownPointerSelectionSession();
    this.pointerSelectionSession = {
      pointerId,
      anchorCell: { ...anchorCell },
      lastCell: { ...focusCell }
    };
    this.keyboardRangeAnchor = { ...anchorCell };

    window.addEventListener('pointermove', this.handleWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', this.handleWindowPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.handleWindowPointerUp, { passive: true });
  }

  private teardownPointerSelectionSession(): void {
    if (!this.pointerSelectionSession) {
      return;
    }

    this.pointerSelectionSession = null;
    window.removeEventListener('pointermove', this.handleWindowPointerMove);
    window.removeEventListener('pointerup', this.handleWindowPointerUp);
    window.removeEventListener('pointercancel', this.handleWindowPointerUp);
  }

  private handleWindowPointerMove = (event: PointerEvent): void => {
    const session = this.pointerSelectionSession;
    if (!session) {
      return;
    }

    const hit = this.hitTestCellAtPoint(event.clientX, event.clientY);
    if (!hit) {
      return;
    }

    const focusCell = this.toSelectionCellPosition(hit);
    if (focusCell.rowIndex === session.lastCell.rowIndex && focusCell.colIndex === session.lastCell.colIndex) {
      return;
    }

    session.lastCell = focusCell;
    const hasSelectionChanged = this.selectionModel.setPointerRange(
      session.anchorCell,
      focusCell,
      this.getSelectionBounds(),
      this.resolveRowKeyByRowIndex
    );
    if (hasSelectionChanged) {
      this.commitSelectionChange('pointer');
    }
  };

  private handleWindowPointerUp = (event: PointerEvent): void => {
    const session = this.pointerSelectionSession;
    if (!session) {
      return;
    }

    const hit = this.hitTestCellAtPoint(event.clientX, event.clientY);
    if (hit) {
      const focusCell = this.toSelectionCellPosition(hit);
      if (focusCell.rowIndex !== session.lastCell.rowIndex || focusCell.colIndex !== session.lastCell.colIndex) {
        const hasSelectionChanged = this.selectionModel.setPointerRange(
          session.anchorCell,
          focusCell,
          this.getSelectionBounds(),
          this.resolveRowKeyByRowIndex
        );
        if (hasSelectionChanged) {
          this.commitSelectionChange('pointer');
        }
      }
    }

    this.teardownPointerSelectionSession();
  };

  private hitTestCellAtPoint(clientX: number, clientY: number): CellHitTestResult | null {
    const viewRowCount = this.options.rowModel.getViewRowCount();
    if (viewRowCount <= 0) {
      return null;
    }

    const bodyRect = this.bodyElement.getBoundingClientRect();
    const horizontalScrollbarHeight = this.horizontalScrollElement.offsetHeight;
    const bodyBottomLimit = bodyRect.bottom - horizontalScrollbarHeight;
    if (clientX < bodyRect.left || clientX > bodyRect.right || clientY < bodyRect.top || clientY >= bodyBottomLimit) {
      return null;
    }

    const virtualOffsetY = this.pendingVirtualScrollTop + (clientY - bodyRect.top);
    const rowIndex = this.resolveRowIndexFromVirtualOffset(virtualOffsetY);
    if (rowIndex < 0 || rowIndex >= viewRowCount) {
      return null;
    }

    const dataIndex = this.options.rowModel.getDataIndex(rowIndex);
    if (dataIndex === -1) {
      return null;
    }

    const leftRect = this.bodyLeftElement.getBoundingClientRect();
    if (this.leftPinnedWidth > 0 && clientX >= leftRect.left && clientX < leftRect.right) {
      const columnIndex = this.findColumnIndexAtOffset(this.leftColumnLeft, this.leftColumnWidth, clientX - leftRect.left);
      if (columnIndex === -1) {
        return null;
      }

      const column = this.columnsByZone.left[columnIndex];
      if (!column) {
        return null;
      }

      return {
        zone: 'left',
        rowIndex,
        dataIndex,
        columnIndex,
        column
      };
    }

    const rightRect = this.bodyRightElement.getBoundingClientRect();
    if (this.rightPinnedWidth > 0 && clientX >= rightRect.left && clientX < rightRect.right) {
      const columnIndex = this.findColumnIndexAtOffset(this.rightColumnLeft, this.rightColumnWidth, clientX - rightRect.left);
      if (columnIndex === -1) {
        return null;
      }

      const column = this.columnsByZone.right[columnIndex];
      if (!column) {
        return null;
      }

      return {
        zone: 'right',
        rowIndex,
        dataIndex,
        columnIndex,
        column
      };
    }

    const viewportRect = this.viewportElement.getBoundingClientRect();
    const centerVisibleLeft = viewportRect.left + this.leftPinnedWidth;
    const centerVisibleRight = viewportRect.right - this.rightPinnedWidth;
    if (clientX < centerVisibleLeft || clientX >= centerVisibleRight) {
      return null;
    }

    const centerRect = this.rowsViewportCenterElement.getBoundingClientRect();
    if (clientX < centerRect.left) {
      return null;
    }

    const centerOffsetX = clientX - centerRect.left;
    const centerColumnIndex = this.findColumnIndexAtOffset(this.centerColumnLeft, this.centerColumnWidth, centerOffsetX);
    if (centerColumnIndex === -1) {
      return null;
    }

    const centerColumn = this.columnsByZone.center[centerColumnIndex];
    if (!centerColumn) {
      return null;
    }

    return {
      zone: 'center',
      rowIndex,
      dataIndex,
      columnIndex: centerColumnIndex,
      column: centerColumn
    };
  }

  private resolveRowIndexFromVirtualOffset(virtualOffsetY: number): number {
    if (!Number.isFinite(virtualOffsetY)) {
      return -1;
    }

    const rowCount = this.options.rowModel.getViewRowCount();
    if (rowCount <= 0) {
      return -1;
    }

    if (!this.isVariableRowHeightMode()) {
      const fixedRowHeight = this.getFixedRowHeight();
      const rowIndex = Math.floor(Math.max(0, virtualOffsetY) / fixedRowHeight);
      return Math.max(0, Math.min(rowCount - 1, rowIndex));
    }

    return this.rowHeightMap.findRowIndexAtOffset(Math.max(0, virtualOffsetY));
  }

  private getInitialActiveCell(): SelectionCellPosition | null {
    const bounds = this.getSelectionBounds();
    if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
      return null;
    }

    return {
      rowIndex: Math.max(0, Math.min(bounds.rowCount - 1, this.renderedStartRow)),
      colIndex: 0
    };
  }

  private getPageStepRows(): number {
    return Math.max(1, Math.floor(this.getViewportHeight() / this.getBaseRowHeight()));
  }

  private clampSelectionCell(cell: SelectionCellPosition): SelectionCellPosition {
    const bounds = this.getSelectionBounds();
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

  private resolveNextCellByKeyboard(
    key: string,
    isCtrlOrMeta: boolean,
    activeCell: SelectionCellPosition
  ): SelectionCellPosition | null {
    const bounds = this.getSelectionBounds();
    if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
      return null;
    }

    let nextRow = activeCell.rowIndex;
    let nextCol = activeCell.colIndex;
    const pageStepRows = this.getPageStepRows();

    if (key === 'ArrowUp') {
      nextRow = isCtrlOrMeta ? 0 : nextRow - 1;
    } else if (key === 'ArrowDown') {
      nextRow = isCtrlOrMeta ? bounds.rowCount - 1 : nextRow + 1;
    } else if (key === 'ArrowLeft') {
      nextCol = isCtrlOrMeta ? 0 : nextCol - 1;
    } else if (key === 'ArrowRight') {
      nextCol = isCtrlOrMeta ? bounds.columnCount - 1 : nextCol + 1;
    } else if (key === 'PageUp') {
      nextRow -= pageStepRows;
    } else if (key === 'PageDown') {
      nextRow += pageStepRows;
    } else if (key === 'Home') {
      if (isCtrlOrMeta) {
        nextRow = 0;
        nextCol = 0;
      } else {
        nextCol = 0;
      }
    } else if (key === 'End') {
      if (isCtrlOrMeta) {
        nextRow = bounds.rowCount - 1;
        nextCol = bounds.columnCount - 1;
      } else {
        nextCol = bounds.columnCount - 1;
      }
    } else {
      return null;
    }

    return this.clampSelectionCell({
      rowIndex: nextRow,
      colIndex: nextCol
    });
  }

  private applyKeyboardSelection(nextCell: SelectionCellPosition, shouldExtendRange: boolean): boolean {
    const bounds = this.getSelectionBounds();

    if (shouldExtendRange) {
      const currentSelection = this.selectionModel.getSelection();
      const anchorCell = this.keyboardRangeAnchor ?? currentSelection.activeCell ?? nextCell;
      this.keyboardRangeAnchor = { ...anchorCell };
      return this.selectionModel.setSelection(
        {
          activeCell: nextCell,
          cellRanges: [
            {
              r1: anchorCell.rowIndex,
              c1: anchorCell.colIndex,
              r2: nextCell.rowIndex,
              c2: nextCell.colIndex
            }
          ],
          rowRanges: []
        },
        bounds,
        this.resolveRowKeyByRowIndex
      );
    }

    this.keyboardRangeAnchor = { ...nextCell };
    return this.selectionModel.setSelection(
      {
        activeCell: nextCell,
        cellRanges: [
          {
            r1: nextCell.rowIndex,
            c1: nextCell.colIndex,
            r2: nextCell.rowIndex,
            c2: nextCell.colIndex
          }
        ],
        rowRanges: []
      },
      bounds,
      this.resolveRowKeyByRowIndex
    );
  }

  private getVirtualRowHeight(rowIndex: number): number {
    if (!this.isVariableRowHeightMode()) {
      return this.getFixedRowHeight();
    }

    return this.rowHeightMap.getRowHeight(rowIndex);
  }

  private ensureSelectionCellVisible(cell: SelectionCellPosition): boolean {
    let hasScrolled = false;

    const rowTop = this.getRowTop(cell.rowIndex);
    const rowBottom = rowTop + this.getVirtualRowHeight(cell.rowIndex);
    const viewportTop = this.pendingVirtualScrollTop;
    const viewportBottom = viewportTop + this.getViewportHeight();

    if (rowTop < viewportTop) {
      this.setVirtualScrollTop(rowTop);
      hasScrolled = true;
    } else if (rowBottom > viewportBottom) {
      this.setVirtualScrollTop(rowBottom - this.getViewportHeight());
      hasScrolled = true;
    }

    const leftCount = this.columnsByZone.left.length;
    const centerCount = this.columnsByZone.center.length;
    if (cell.colIndex >= leftCount && cell.colIndex < leftCount + centerCount) {
      const centerColIndex = cell.colIndex - leftCount;
      const columnLeft = this.centerColumnLeft[centerColIndex] ?? 0;
      const columnRight = columnLeft + (this.centerColumnWidth[centerColIndex] ?? 0);
      const viewportLeft = this.pendingScrollLeft;
      const viewportRight = viewportLeft + Math.max(1, this.centerVisibleWidth);

      if (columnLeft < viewportLeft) {
        this.setHorizontalScrollLeft(columnLeft);
        hasScrolled = true;
      } else if (columnRight > viewportRight) {
        this.setHorizontalScrollLeft(columnRight - Math.max(1, this.centerVisibleWidth));
        hasScrolled = true;
      }
    }

    return hasScrolled;
  }

  private handleRootKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }

    if (this.editSession) {
      return;
    }

    if (event.key === 'Enter') {
      const currentSelection = this.selectionModel.getSelection();
      const activeCell = currentSelection.activeCell ?? this.getInitialActiveCell();
      if (!activeCell) {
        return;
      }

      const didStartEditing = this.startEditingAtCell(activeCell.rowIndex, activeCell.colIndex);
      if (didStartEditing) {
        event.preventDefault();
      }
      return;
    }

    const isCtrlOrMeta = event.ctrlKey || event.metaKey;
    const currentSelection = this.selectionModel.getSelection();
    const activeCell = currentSelection.activeCell ?? this.getInitialActiveCell();
    if (!activeCell) {
      return;
    }

    const nextCell = this.resolveNextCellByKeyboard(event.key, isCtrlOrMeta, activeCell);
    if (!nextCell) {
      return;
    }

    const hasSelectionChanged = this.applyKeyboardSelection(nextCell, event.shiftKey);
    let hasScrolled = false;
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      const direction = event.key === 'PageDown' ? 1 : -1;
      this.addVerticalScrollDelta(this.getViewportHeight() * direction);
      hasScrolled = true;
    } else {
      hasScrolled = this.ensureSelectionCellVisible(nextCell);
    }

    if (hasSelectionChanged) {
      this.commitSelectionChange('keyboard');
    }

    if (hasScrolled) {
      this.markScrollDirty();
      this.scheduleRender();
    }

    event.preventDefault();
  };

  private handleEditorInputKeyDown = (event: KeyboardEvent): void => {
    if (!this.editSession) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void this.commitEditing('enter');
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.stopEditing('escape');
    }
  };

  private handleEditorInputBlur = (): void => {
    if (!this.editSession) {
      return;
    }

    void this.commitEditing('blur');
  };

  private handleEditorInput = (): void => {
    if (!this.editSession) {
      return;
    }

    if (!this.editorHostElement.classList.contains('hgrid__editor-host--invalid')) {
      return;
    }

    this.editorHostElement.classList.remove('hgrid__editor-host--invalid');
    this.editorMessageElement.textContent = '';
  };

  private resolveRow(dataIndex: number): GridRowData {
    if (this.options.dataProvider.getRow) {
      const row = this.options.dataProvider.getRow(dataIndex);
      if (row) {
        return row;
      }
    }

    const row: GridRowData = {};
    for (let columnIndex = 0; columnIndex < this.options.columns.length; columnIndex += 1) {
      const columnId = this.options.columns[columnIndex].id;
      row[columnId] = this.options.dataProvider.getValue(dataIndex, columnId);
    }

    return row;
  }

  private getResolvedScrollbarPolicy(): Required<ScrollbarPolicy> {
    const policy = this.options.scrollbarPolicy;

    return {
      vertical: policy?.vertical ?? DEFAULT_SCROLLBAR_VISIBILITY.vertical,
      horizontal: policy?.horizontal ?? DEFAULT_SCROLLBAR_VISIBILITY.horizontal
    };
  }

  private resolveScrollbarSourceExtent(
    visibility: ScrollbarVisibility,
    hasOverflow: boolean,
    measuredSize: number
  ): number {
    if (visibility === 'hidden') {
      return 0;
    }

    if (visibility === 'always' || hasOverflow) {
      if (measuredSize > 0) {
        return measuredSize;
      }
      return INVISIBLE_SCROLLBAR_FALLBACK_SIZE;
    }

    return 0;
  }

  private resolveReservedScrollbarExtent(
    visibility: ScrollbarVisibility,
    hasOverflow: boolean,
    measuredSize: number,
    sourceSize: number
  ): number {
    if (sourceSize === 0 || visibility === 'hidden') {
      return 0;
    }

    if (measuredSize > 0) {
      return sourceSize;
    }

    if (visibility === 'always') {
      return sourceSize;
    }

    if (hasOverflow && visibility === 'auto') {
      return 0;
    }

    return 0;
  }

  private toCssOverflowValue(visibility: ScrollbarVisibility): 'auto' | 'scroll' | 'hidden' {
    if (visibility === 'hidden') {
      return 'hidden';
    }

    if (visibility === 'always') {
      return 'scroll';
    }

    return 'auto';
  }

  private measureScrollbarSize(): ScrollbarSize {
    if (!document.body) {
      return {
        vertical: MIN_SCROLLBAR_SIZE,
        horizontal: MIN_SCROLLBAR_SIZE
      };
    }

    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.width = '100px';
    probe.style.height = '100px';
    probe.style.overflow = 'scroll';
    probe.style.top = '-9999px';
    probe.style.left = '-9999px';
    document.body.append(probe);

    const vertical = probe.offsetWidth - probe.clientWidth;
    const horizontal = probe.offsetHeight - probe.clientHeight;
    probe.remove();

    return {
      vertical: vertical > 0 ? vertical : MIN_SCROLLBAR_SIZE,
      horizontal: horizontal > 0 ? horizontal : MIN_SCROLLBAR_SIZE
    };
  }

  private syncHorizontalOffset(scrollLeft: number): void {
    this.headerCenterViewportElement.style.transform = `translate3d(${-scrollLeft}px, 0, 0)`;
  }

  private syncViewportTransforms(scrollTop: number, scrollLeft: number, forceVerticalSync: boolean): void {
    this.syncHorizontalOffset(scrollLeft);

    const virtualScrollTop = this.pendingVirtualScrollTop;
    const canSyncVertical = forceVerticalSync || this.getStartRowForScrollTop(virtualScrollTop) === this.renderedStartRow;
    const effectiveVirtualScrollTop = canSyncVertical ? virtualScrollTop : this.renderedScrollTop;
    const centerVerticalOffset = this.renderedViewportOffsetY - effectiveVirtualScrollTop + scrollTop;
    const pinnedVerticalOffset = this.renderedViewportOffsetY - effectiveVirtualScrollTop;
    const centerVerticalTransform = `translate3d(${-scrollLeft}px, ${centerVerticalOffset}px, 0)`;
    const pinnedVerticalTransform = `translate3d(0, ${pinnedVerticalOffset}px, 0)`;
    this.rowsViewportCenterElement.style.transform = centerVerticalTransform;
    this.rowsViewportLeftElement.style.transform = pinnedVerticalTransform;
    this.rowsViewportRightElement.style.transform = pinnedVerticalTransform;
  }

  private getMaxVerticalScrollTop(): number {
    const maxVertical = this.verticalScrollElement.scrollHeight - this.verticalScrollElement.clientHeight;
    const maxViewport = this.viewportElement.scrollHeight - this.viewportElement.clientHeight;
    return Math.max(0, this.physicalMaxScrollTop, maxVertical, maxViewport);
  }

  private getMaxHorizontalScrollLeft(): number {
    const maxHorizontal = this.horizontalScrollElement.scrollWidth - this.horizontalScrollElement.clientWidth;
    const leftWidth = this.getColumnsWidth(this.columnsByZone.left);
    const centerWidth = this.centerColumnsWidth;
    const rightWidth = this.getColumnsWidth(this.columnsByZone.right);
    const reservedVerticalWidth = Number.parseFloat(this.rootElement.style.getPropertyValue('--hgrid-v-scrollbar-width')) || 0;
    const rootWidth = this.rootElement.clientWidth || this.container.clientWidth || leftWidth + centerWidth + rightWidth;
    const centerVisibleWidth = Math.max(1, rootWidth - leftWidth - rightWidth - reservedVerticalWidth);
    const modelMax = centerWidth - centerVisibleWidth;
    return Math.max(0, maxHorizontal, modelMax);
  }

  private setVerticalScrollTop(scrollTop: number, virtualScrollTopOverride?: number): void {
    const nextScrollTop = Math.min(this.getMaxVerticalScrollTop(), Math.max(0, scrollTop));
    this.pendingScrollTop = nextScrollTop;
    if (typeof virtualScrollTopOverride === 'number') {
      this.pendingVirtualScrollTop = this.clampVirtualScrollTop(virtualScrollTopOverride);
    } else {
      this.pendingVirtualScrollTop = this.toVirtualScrollTop(nextScrollTop);
    }

    const shouldSyncVertical = this.verticalScrollElement.scrollTop !== nextScrollTop;
    const shouldSyncViewport = this.viewportElement.scrollTop !== nextScrollTop;
    if (!shouldSyncVertical && !shouldSyncViewport) {
      this.syncViewportTransforms(this.pendingScrollTop, this.pendingScrollLeft, false);
      return;
    }

    this.isSyncingScroll = true;
    if (shouldSyncVertical) {
      this.verticalScrollElement.scrollTop = nextScrollTop;
    }
    if (shouldSyncViewport) {
      this.viewportElement.scrollTop = nextScrollTop;
    }
    this.pendingScrollTop = this.verticalScrollElement.scrollTop || this.viewportElement.scrollTop;
    if (typeof virtualScrollTopOverride !== 'number') {
      this.pendingVirtualScrollTop = this.toVirtualScrollTop(this.pendingScrollTop);
    }
    this.isSyncingScroll = false;
    this.syncViewportTransforms(this.pendingScrollTop, this.pendingScrollLeft, false);
  }

  private setVirtualScrollTop(virtualScrollTop: number): void {
    const nextVirtualScrollTop = this.clampVirtualScrollTop(virtualScrollTop);
    this.setVerticalScrollTop(this.toPhysicalScrollTop(nextVirtualScrollTop), nextVirtualScrollTop);
  }

  private addVerticalScrollDelta(deltaPx: number): void {
    if (!Number.isFinite(deltaPx) || deltaPx === 0) {
      return;
    }

    this.setVirtualScrollTop(this.pendingVirtualScrollTop + deltaPx);
  }

  private toVirtualScrollTop(physicalScrollTop: number): number {
    return mapPhysicalToVirtualScrollTop(physicalScrollTop, this.physicalMaxScrollTop, this.virtualMaxScrollTop);
  }

  private toPhysicalScrollTop(virtualScrollTop: number): number {
    return mapVirtualToPhysicalScrollTop(virtualScrollTop, this.virtualMaxScrollTop, this.physicalMaxScrollTop);
  }

  private clampVirtualScrollTop(virtualScrollTop: number): number {
    return Math.max(0, Math.min(this.virtualMaxScrollTop, virtualScrollTop));
  }

  private setHorizontalScrollLeft(scrollLeft: number): void {
    const nextScrollLeft = Math.min(this.getMaxHorizontalScrollLeft(), Math.max(0, scrollLeft));
    this.pendingScrollLeft = nextScrollLeft;

    if (this.horizontalScrollElement.scrollLeft !== nextScrollLeft) {
      this.isSyncingScroll = true;
      this.horizontalScrollElement.scrollLeft = nextScrollLeft;
      this.isSyncingScroll = false;
    }

    this.pendingScrollLeft = this.horizontalScrollElement.scrollLeft;
    this.syncViewportTransforms(this.pendingScrollTop, this.pendingScrollLeft, false);
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.markLayoutDirty(false);
        this.scheduleRender();
      });
      this.resizeObserver.observe(this.container);
      return;
    }

    window.addEventListener('resize', this.handleWindowResize, { passive: true });
  }

  private teardownResizeObserver(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
      return;
    }

    window.removeEventListener('resize', this.handleWindowResize);
  }

  private handleWindowResize = (): void => {
    this.markLayoutDirty(false);
    this.scheduleRender();
  };
}
