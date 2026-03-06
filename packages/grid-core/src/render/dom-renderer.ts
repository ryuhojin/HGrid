import { EventBus } from '../core/event-bus';
import type {
  ColumnGroupDef,
  ColumnDef,
  GridLocaleText,
  GridOptions,
  GridState,
  RowHeightMode,
  RowIndicatorCheckAllScope,
  RowIndicatorOptions,
  RowStatusTone,
  ScrollbarPolicy,
  ScrollbarVisibility,
  StateColumnRenderResult,
  UnsafeHtmlSanitizeContext
} from '../core/grid-options';
import {
  formatColumnValue,
  getColumnValue,
  createColumnValueFormatContext,
  type ColumnValueFormatContext
} from '../data/column-model';
import {
  formatGridLocaleText,
  localizeCheckAllScope,
  normalizeGridLocale,
  resolveGridLocaleText
} from '../core/grid-locale-text';
import type { DataTransaction, GridRowData, RowKey } from '../data/data-provider';
import {
  GROUP_ROW_COLUMN_ID_FIELD,
  GROUP_ROW_EXPANDED_FIELD,
  getGroupRowLevel,
  isGroupRowData
} from '../data/grouped-data-provider';
import {
  TREE_ROW_DEPTH_FIELD,
  TREE_ROW_EXPANDED_FIELD,
  TREE_ROW_HAS_CHILDREN_FIELD,
  TREE_ROW_TREE_COLUMN_ID_FIELD,
  getTreeRowDepth,
  isTreeRowData
} from '../data/tree-data-provider';
import {
  SelectionModel,
  type GridSelection,
  type GridSelectionInput,
  type SelectionCellPosition,
  type SelectionChangeSource,
  type SelectionRowRangeInput
} from '../interaction/selection-model';
import {
  MAX_SCROLL_PX,
  createScrollScaleMetrics,
  mapPhysicalToVirtualScrollTop,
  mapVirtualToPhysicalScrollTop
} from '../virtualization/scroll-scaling';
import { RowHeightMap } from '../virtualization/row-height-map';
import type { EditCommitEventPayload, EditCommitSource } from '../core/edit-events';

type ColumnZoneName = 'left' | 'center' | 'right';

interface ColumnsByZone {
  left: ColumnDef[];
  center: ColumnDef[];
  right: ColumnDef[];
}

interface CellRenderState {
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

interface IndicatorCellElements {
  checkbox: HTMLInputElement;
}

interface ZoneRowRenderState {
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

interface ZoneRowItem {
  element: HTMLDivElement;
  cells: HTMLDivElement[];
  indicatorCells: Array<IndicatorCellElements | null>;
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

interface HeaderGroupCellLayout {
  groupId: string;
  header: string;
  startColIndex: number;
  endColIndex: number;
  leafSpan: number;
  isCollapsed: boolean;
}

interface HeaderGroupRowLayout {
  level: number;
  cells: HeaderGroupCellLayout[];
}

interface HeaderLeafSpanLayout {
  columnId: string;
  colIndex: number;
  startRow: number;
  rowSpan: number;
}

interface HeaderLeafSpanMetrics {
  spansByRow: Map<number, HeaderLeafSpanLayout[]>;
  hiddenLeafColumnIds: Set<string>;
}

interface CellContentResult {
  textContent: string;
  contentMode: 'text' | 'html';
  htmlContent: string;
}

type StateColumnTone = RowStatusTone | 'dirty' | 'commit';

interface NormalizedStateColumnResult {
  textContent: string;
  ariaLabel: string;
  tooltip: string;
  tone: StateColumnTone | null;
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

interface SelectionRectangle {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

interface ClipboardCellUpdate {
  rowIndex: number;
  dataIndex: number;
  columnId: string;
  previousValue: unknown;
  value: unknown;
}

interface HeaderResizeHit {
  columnId: string;
  column: ColumnDef;
  headerCell: HTMLDivElement;
}

interface ColumnResizeSession {
  pointerId: number;
  columnId: string;
  startClientX: number;
  startWidth: number;
  minWidth: number;
  maxWidth: number;
  pendingClientX: number;
  lastEmittedWidth: number;
}

interface HeaderDropTarget {
  dropIndex: number;
  targetColumnId: string | null;
  indicatorClientX: number;
}

interface ColumnReorderSession {
  pointerId: number;
  sourceColumnId: string;
  sourceIndex: number;
  pendingClientX: number;
  pendingClientY: number;
  pendingTarget: EventTarget | null;
  currentDropIndex: number;
  currentTargetColumnId: string | null;
}

const DEFAULT_HEIGHT = 360;
const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_ESTIMATED_ROW_HEIGHT = 28;
const DEFAULT_OVERSCAN = 6;
const DEFAULT_COLUMN_OVERSCAN = 2;
const VARIABLE_POOL_EXTRA_ROWS = 12;
const MIN_SCROLLBAR_SIZE = 0;
const INVISIBLE_SCROLLBAR_FALLBACK_SIZE = 16;
const HEADER_RESIZE_HIT_SLOP_PX = 6;
const LEGACY_INDICATOR_COLUMN_ID = '__indicator';
const INDICATOR_ROW_NUMBER_COLUMN_ID = '__indicatorRowNumber';
const INDICATOR_CHECKBOX_COLUMN_ID = '__indicatorCheckbox';
const INDICATOR_STATUS_COLUMN_ID = '__indicatorStatus';
const STATE_COLUMN_ID = '__state';
const DEFAULT_INDICATOR_CHECKBOX_WIDTH = 56;
const DEFAULT_INDICATOR_ROW_NUMBER_WIDTH = 64;
const DEFAULT_INDICATOR_STATUS_WIDTH = 96;
const MIN_INDICATOR_WIDTH = 44;
const MAX_INDICATOR_WIDTH = 180;
const DEFAULT_STATE_COLUMN_WIDTH = 104;
const DEFAULT_HEADER_ROW_HEIGHT = 32;
const MAX_GROUP_HEADER_DEPTH = 8;
const MAX_GROUP_ROW_LEVEL = 12;
const MAX_TREE_ROW_LEVEL = 16;
const STATE_TONE_DIRTY = 'dirty';
const STATE_TONE_COMMIT = 'commit';
const DEFAULT_SCROLLBAR_VISIBILITY: Required<ScrollbarPolicy> = {
  vertical: 'auto',
  horizontal: 'auto'
};
let NEXT_ARIA_GRID_INSTANCE_ID = 1;

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
  private headerDropIndicatorElement: HTMLDivElement;

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
  private headerGroupRowCount = 0;
  private leafSpanHiddenColumnsByZone: Record<ColumnZoneName, Set<string>> = {
    left: new Set<string>(),
    center: new Set<string>(),
    right: new Set<string>()
  };
  private readonly rowHeightMap: RowHeightMap;
  private readonly selectionModel: SelectionModel;
  private pointerSelectionSession: PointerSelectionSession | null = null;
  private keyboardRangeAnchor: SelectionCellPosition | null = null;
  private editSession: EditSession | null = null;
  private editValidationTicket = 0;
  private isEditValidationPending = false;
  private measurementFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private columnResizeSession: ColumnResizeSession | null = null;
  private columnResizeFrameId: number | null = null;
  private headerResizeHoverCell: HTMLDivElement | null = null;
  private columnReorderSession: ColumnReorderSession | null = null;
  private columnReorderFrameId: number | null = null;
  private headerReorderDraggingCell: HTMLDivElement | null = null;
  private indicatorHeaderCheckAllElement: HTMLInputElement | null = null;
  private rowCheckboxAnchorRowIndex: number | null = null;
  private readonly ariaGridId: string;
  private ariaRowCount = -1;
  private ariaColCount = -1;
  private activeDescendantCellId = '';
  private editCommitSequence = 0;
  private locale = 'en-US';
  private localeText: GridLocaleText = resolveGridLocaleText('en-US');
  private columnValueFormatContext: ColumnValueFormatContext | null = null;

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
    this.headerDropIndicatorElement = document.createElement('div');

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
    this.ariaGridId = `hgrid-grid-${NEXT_ARIA_GRID_INSTANCE_ID++}`;
    this.refreshI18nContext();

    this.initializeDom();
    this.markLayoutDirty(true);
    this.flushRender();
  }

  public setOptions(nextOptions: GridOptions): void {
    this.teardownPointerSelectionSession();
    this.teardownColumnReorderSession();
    this.stopEditing('reconcile');
    this.options = nextOptions;
    this.columnsByZone = this.splitColumns(this.options.columns);
    this.refreshI18nContext();
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

  public getVisibleRowRange(): { startRow: number; endRow: number } | null {
    return this.getViewportVisibleRowRange();
  }

  public setSelection(selection: GridSelectionInput): void {
    const hasChanged = this.selectionModel.setSelection(selection, this.getSelectionBounds(), this.resolveRowKeyByRowIndex);
    if (!hasChanged) {
      return;
    }

    const nextSelection = this.selectionModel.getSelection();
    this.keyboardRangeAnchor = nextSelection.activeCell ? { ...nextSelection.activeCell } : null;
    this.rowCheckboxAnchorRowIndex = nextSelection.activeCell ? nextSelection.activeCell.rowIndex : null;
    this.commitSelectionChange('api');
  }

  public clearSelection(): void {
    const hasChanged = this.selectionModel.clear();
    if (!hasChanged) {
      return;
    }

    this.keyboardRangeAnchor = null;
    this.rowCheckboxAnchorRowIndex = null;
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
    this.teardownColumnResizeSession();
    this.teardownColumnReorderSession();
    this.stopEditing('reconcile');
    this.viewportElement.removeEventListener('scroll', this.handleViewportScroll);
    this.verticalScrollElement.removeEventListener('scroll', this.handleVerticalScroll);
    this.horizontalScrollElement.removeEventListener('scroll', this.handleHorizontalScroll);
    this.horizontalScrollElement.removeEventListener('wheel', this.handleAuxiliaryWheel);
    this.headerElement.removeEventListener('wheel', this.handleAuxiliaryWheel);
    this.headerElement.removeEventListener('pointermove', this.handleHeaderPointerMove);
    this.headerElement.removeEventListener('pointerleave', this.handleHeaderPointerLeave);
    this.bodyElement.removeEventListener('wheel', this.handleBodyWheel);
    this.rootElement.removeEventListener('keydown', this.handleRootKeyDown);
    this.rootElement.removeEventListener('copy', this.handleRootCopy);
    this.rootElement.removeEventListener('paste', this.handleRootPaste);
    this.rootElement.removeEventListener('pointerdown', this.handleRootPointerDown);
    this.rootElement.removeEventListener('click', this.handleRootClick);
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
    this.refreshI18nContext();
    this.rootElement.id = this.ariaGridId;
    this.rootElement.setAttribute('role', 'grid');
    this.rootElement.setAttribute('aria-multiselectable', 'true');
    this.rootElement.tabIndex = 0;
    this.setHeaderRowCount(0);

    this.headerElement.className = 'hgrid__header';
    this.headerElement.setAttribute('role', 'rowgroup');
    this.headerLeftElement.className = 'hgrid__header-left';
    this.headerLeftElement.setAttribute('role', 'presentation');
    this.headerCenterElement.className = 'hgrid__header-center';
    this.headerCenterElement.setAttribute('role', 'presentation');
    this.headerCenterViewportElement.className = 'hgrid__header-viewport';
    this.headerCenterViewportElement.setAttribute('role', 'presentation');
    this.headerRightElement.className = 'hgrid__header-right';
    this.headerRightElement.setAttribute('role', 'presentation');

    this.headerRowLeftElement.className = 'hgrid__header-row hgrid__header-row--left';
    this.headerRowCenterElement.className = 'hgrid__header-row hgrid__header-row--center';
    this.headerRowRightElement.className = 'hgrid__header-row hgrid__header-row--right';
    this.headerDropIndicatorElement.className = 'hgrid__header-drop-indicator';
    this.headerDropIndicatorElement.style.display = 'none';

    this.headerLeftElement.append(this.headerRowLeftElement);
    this.headerCenterViewportElement.append(this.headerRowCenterElement);
    this.headerCenterElement.append(this.headerCenterViewportElement);
    this.headerRightElement.append(this.headerRowRightElement);
    this.headerElement.append(this.headerLeftElement, this.headerCenterElement, this.headerRightElement, this.headerDropIndicatorElement);

    this.bodyElement.className = 'hgrid__body';
    this.bodyElement.setAttribute('role', 'rowgroup');
    this.bodyLeftElement.className = 'hgrid__body-left';
    this.bodyLeftElement.setAttribute('role', 'presentation');
    this.bodyCenterElement.className = 'hgrid__body-center';
    this.bodyCenterElement.setAttribute('role', 'presentation');
    this.bodyRightElement.className = 'hgrid__body-right';
    this.bodyRightElement.setAttribute('role', 'presentation');

    this.viewportElement.className = 'hgrid__viewport';
    this.viewportElement.setAttribute('role', 'presentation');
    this.spacerElement.className = 'hgrid__spacer';
    this.spacerElement.setAttribute('aria-hidden', 'true');
    this.verticalScrollElement.className = 'hgrid__v-scroll';
    this.verticalScrollElement.setAttribute('aria-hidden', 'true');
    this.verticalSpacerElement.className = 'hgrid__v-spacer';
    this.verticalSpacerElement.setAttribute('aria-hidden', 'true');
    this.horizontalScrollElement.className = 'hgrid__h-scroll';
    this.horizontalScrollElement.setAttribute('aria-hidden', 'true');
    this.horizontalSpacerElement.className = 'hgrid__h-spacer';
    this.horizontalSpacerElement.setAttribute('aria-hidden', 'true');

    this.rowsViewportLeftElement.className = 'hgrid__rows-viewport hgrid__rows-viewport--left';
    this.rowsViewportLeftElement.setAttribute('role', 'presentation');
    this.rowsViewportCenterElement.className = 'hgrid__rows-viewport hgrid__rows-viewport--center';
    this.rowsViewportCenterElement.setAttribute('role', 'presentation');
    this.rowsViewportRightElement.className = 'hgrid__rows-viewport hgrid__rows-viewport--right';
    this.rowsViewportRightElement.setAttribute('role', 'presentation');

    this.rowsLayerLeftElement.className = 'hgrid__rows-layer hgrid__rows-layer--left';
    this.rowsLayerLeftElement.setAttribute('role', 'presentation');
    this.rowsLayerCenterElement.className = 'hgrid__rows-layer hgrid__rows-layer--center';
    this.rowsLayerCenterElement.setAttribute('role', 'presentation');
    this.rowsLayerRightElement.className = 'hgrid__rows-layer hgrid__rows-layer--right';
    this.rowsLayerRightElement.setAttribute('role', 'presentation');

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
    this.overlayElement.setAttribute('role', 'presentation');
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
    this.headerElement.addEventListener('pointermove', this.handleHeaderPointerMove, { passive: true });
    this.headerElement.addEventListener('pointerleave', this.handleHeaderPointerLeave, { passive: true });
    this.bodyElement.addEventListener('wheel', this.handleBodyWheel, { passive: false });
    this.rootElement.addEventListener('keydown', this.handleRootKeyDown);
    this.rootElement.addEventListener('copy', this.handleRootCopy);
    this.rootElement.addEventListener('paste', this.handleRootPaste);
    this.rootElement.addEventListener('pointerdown', this.handleRootPointerDown);
    this.rootElement.addEventListener('click', this.handleRootClick);
    this.rootElement.addEventListener('dblclick', this.handleRootDoubleClick);
    this.editorInputElement.addEventListener('keydown', this.handleEditorInputKeyDown);
    this.editorInputElement.addEventListener('blur', this.handleEditorInputBlur);
    this.editorInputElement.addEventListener('input', this.handleEditorInput);

    this.syncAriaGridMetrics();
    this.syncAriaActiveDescendant();
    this.container.replaceChildren(this.rootElement);
    this.setupResizeObserver();
  }

  private refreshI18nContext(): void {
    const hasExplicitLocale = typeof this.options.locale === 'string' && this.options.locale.trim().length > 0;
    this.locale = normalizeGridLocale(this.options.locale, 'en-US');
    this.localeText = resolveGridLocaleText(this.locale, this.options.localeText);
    const hasNumberFormatOptions = Boolean(this.options.numberFormatOptions);
    const hasDateTimeFormatOptions = Boolean(this.options.dateTimeFormatOptions);
    const shouldUseIntlFormatting = hasExplicitLocale || hasNumberFormatOptions || hasDateTimeFormatOptions;
    this.columnValueFormatContext = shouldUseIntlFormatting
      ? createColumnValueFormatContext({
          locale: this.locale,
          numberFormatOptions: this.options.numberFormatOptions,
          dateTimeFormatOptions: this.options.dateTimeFormatOptions
        })
      : null;

    this.rootElement.lang = this.locale;
    const isRtl = this.options.rtl === true;
    this.rootElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    this.rootElement.classList.toggle('hgrid--rtl', isRtl);
  }

  private localizeText(template: string, values: Record<string, string | number>): string {
    return formatGridLocaleText(template, values);
  }

  private getVisibleColumnCount(): number {
    return this.columnsByZone.left.length + this.columnsByZone.center.length + this.columnsByZone.right.length;
  }

  private getZoneColumnStartIndex(zoneName: ColumnZoneName): number {
    if (zoneName === 'left') {
      return 0;
    }

    if (zoneName === 'center') {
      return this.columnsByZone.left.length;
    }

    return this.columnsByZone.left.length + this.columnsByZone.center.length;
  }

  private getAriaCellId(rowIndex: number, colIndex: number): string {
    return `${this.ariaGridId}-cell-r${this.getAriaRowIndexForDataRow(rowIndex)}-c${colIndex + 1}`;
  }

  private getAccessibleHeaderRowCount(): number {
    return this.headerGroupRowCount + 1;
  }

  private getAriaRowIndexForDataRow(rowIndex: number): number {
    return this.getAccessibleHeaderRowCount() + rowIndex + 1;
  }

  private syncAriaGridMetrics(): void {
    const rowCount = this.options.rowModel.getViewRowCount() + this.getAccessibleHeaderRowCount();
    const colCount = this.getVisibleColumnCount();

    if (this.ariaRowCount !== rowCount) {
      this.rootElement.setAttribute('aria-rowcount', String(Math.max(0, rowCount)));
      this.ariaRowCount = rowCount;
    }

    if (this.ariaColCount !== colCount) {
      this.rootElement.setAttribute('aria-colcount', String(Math.max(0, colCount)));
      this.ariaColCount = colCount;
    }
  }

  private syncAriaActiveDescendant(): void {
    const selection = this.selectionModel.getSelection();
    const activeCell = selection.activeCell;
    if (!activeCell) {
      if (this.activeDescendantCellId.length > 0) {
        this.rootElement.removeAttribute('aria-activedescendant');
        this.activeDescendantCellId = '';
      }
      return;
    }

    const cellEntry = this.resolveCellElementBySelectionPosition(activeCell.rowIndex, activeCell.colIndex);
    if (!cellEntry || !cellEntry.cell.id) {
      if (this.activeDescendantCellId.length > 0) {
        this.rootElement.removeAttribute('aria-activedescendant');
        this.activeDescendantCellId = '';
      }
      return;
    }

    if (this.activeDescendantCellId !== cellEntry.cell.id) {
      this.rootElement.setAttribute('aria-activedescendant', cellEntry.cell.id);
      this.activeDescendantCellId = cellEntry.cell.id;
    }
  }

  private getResolvedRowIndicatorOptions(): Required<
    Pick<RowIndicatorOptions, 'showCheckbox' | 'checkAllScope'>
  > &
    Pick<RowIndicatorOptions, 'getRowStatus'> {
    const rowIndicatorOptions = this.options.rowIndicator;

    return {
      showCheckbox: rowIndicatorOptions?.showCheckbox !== false,
      checkAllScope: rowIndicatorOptions?.checkAllScope ?? 'filtered',
      getRowStatus: rowIndicatorOptions?.getRowStatus
    };
  }

  private isIndicatorCheckboxColumnId(columnId: string): boolean {
    return columnId === INDICATOR_CHECKBOX_COLUMN_ID || columnId === LEGACY_INDICATOR_COLUMN_ID;
  }

  private clampIndicatorColumnWidth(width: number): number {
    return Math.max(MIN_INDICATOR_WIDTH, Math.min(MAX_INDICATOR_WIDTH, Math.round(width)));
  }

  private resolveIndicatorColumnWidth(optionWidth: number | undefined, fallbackWidth: number): number {
    const resolvedOptionWidth = Number(optionWidth);
    if (Number.isFinite(resolvedOptionWidth)) {
      return this.clampIndicatorColumnWidth(resolvedOptionWidth);
    }

    return this.clampIndicatorColumnWidth(fallbackWidth);
  }

  private getResolvedIndicatorCheckboxColumnWidth(fallbackWidth: number): number {
    const optionWidth = Number(this.options.rowIndicator?.width);
    return this.resolveIndicatorColumnWidth(optionWidth, fallbackWidth);
  }

  private normalizeRowStatusTone(value: unknown): RowStatusTone | null {
    if (value === 'inserted' || value === 'updated' || value === 'deleted' || value === 'invalid' || value === 'error' || value === 'clean') {
      return value;
    }

    return null;
  }

  private resolveRowStatusTone(row: GridRowData, rowIndex: number, dataIndex: number, isSelected: boolean): RowStatusTone | null {
    const rowIndicatorOptions = this.getResolvedRowIndicatorOptions();
    if (rowIndicatorOptions.getRowStatus) {
      const resolvedStatus = rowIndicatorOptions.getRowStatus({
        rowIndex,
        dataIndex,
        row,
        isSelected
      });
      return this.normalizeRowStatusTone(resolvedStatus);
    }

    return this.normalizeRowStatusTone(row.__rowStatus ?? row.rowStatus);
  }

  private resolveIndicatorStatusText(row: GridRowData, rowIndex: number, dataIndex: number, isSelected: boolean): string {
    const statusTone = this.resolveRowStatusTone(row, rowIndex, dataIndex, isSelected);
    if (statusTone) {
      return statusTone;
    }

    const fallbackValue = row.__indicatorStatus ?? row.__state ?? row.state ?? row.status;
    return typeof fallbackValue === 'string' ? fallbackValue : '';
  }

  private getHeaderRowHeight(): number {
    return DEFAULT_HEADER_ROW_HEIGHT;
  }

  private getColumnGroups(): ColumnGroupDef[] {
    if (!Array.isArray(this.options.columnGroups)) {
      return [];
    }

    return this.options.columnGroups;
  }

  private getZoneGroupRowLayouts(columns: ColumnDef[]): HeaderGroupRowLayout[] {
    const columnGroups = this.getColumnGroups();
    if (columns.length === 0 || columnGroups.length === 0) {
      return [];
    }

    const columnIndexById = new Map<string, number>();
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      columnIndexById.set(columns[columnIndex].id, columnIndex);
    }

    const rowMap = new Map<number, HeaderGroupCellLayout[]>();
    const collectIndicesFromNode = (node: string | ColumnGroupDef, level: number): number[] => {
      if (typeof node === 'string') {
        const matchedIndex = columnIndexById.get(node);
        return matchedIndex === undefined ? [] : [matchedIndex];
      }

      if (!node || typeof node !== 'object' || level >= MAX_GROUP_HEADER_DEPTH) {
        return [];
      }

      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length === 0) {
        return [];
      }

      const indexSet = new Set<number>();
      for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
        const childIndices = collectIndicesFromNode(children[childIndex], level + 1);
        for (let index = 0; index < childIndices.length; index += 1) {
          indexSet.add(childIndices[index]);
        }
      }

      if (indexSet.size === 0) {
        return [];
      }

      const sortedIndices = Array.from(indexSet).sort((left, right) => left - right);
      const groupIdText = typeof node.groupId === 'string' && node.groupId.length > 0 ? node.groupId : `group-${level}`;
      const headerText = typeof node.header === 'string' && node.header.length > 0 ? node.header : groupIdText;
      let segmentStart = sortedIndices[0];
      let segmentEnd = sortedIndices[0];
      for (let index = 1; index < sortedIndices.length; index += 1) {
        const nextIndex = sortedIndices[index];
        if (nextIndex === segmentEnd + 1) {
          segmentEnd = nextIndex;
          continue;
        }

        const rowCells = rowMap.get(level) ?? [];
        rowCells.push({
          groupId: groupIdText,
          header: headerText,
          startColIndex: segmentStart,
          endColIndex: segmentEnd + 1,
          leafSpan: segmentEnd - segmentStart + 1,
          isCollapsed: node.collapsed === true
        });
        rowMap.set(level, rowCells);
        segmentStart = nextIndex;
        segmentEnd = nextIndex;
      }

      const rowCells = rowMap.get(level) ?? [];
      rowCells.push({
        groupId: groupIdText,
        header: headerText,
        startColIndex: segmentStart,
        endColIndex: segmentEnd + 1,
        leafSpan: segmentEnd - segmentStart + 1,
        isCollapsed: node.collapsed === true
      });
      rowMap.set(level, rowCells);
      return sortedIndices;
    };

    for (let rootIndex = 0; rootIndex < columnGroups.length; rootIndex += 1) {
      collectIndicesFromNode(columnGroups[rootIndex], 0);
    }

    const rowLevels = Array.from(rowMap.keys()).sort((left, right) => left - right);
    const layouts: HeaderGroupRowLayout[] = [];
    for (let rowIndex = 0; rowIndex < rowLevels.length; rowIndex += 1) {
      const level = rowLevels[rowIndex];
      const cells = (rowMap.get(level) ?? []).slice().sort((left, right) => left.startColIndex - right.startColIndex);
      if (cells.length === 0) {
        continue;
      }
      layouts.push({
        level,
        cells
      });
    }

    return layouts;
  }

  private getZoneLeafSpanMetrics(
    columns: ColumnDef[],
    groupRows: HeaderGroupRowLayout[],
    maxGroupRowCount: number
  ): HeaderLeafSpanMetrics {
    const deepestGroupLevelByColumn = new Array<number>(columns.length);
    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      deepestGroupLevelByColumn[colIndex] = -1;
    }

    for (let rowIndex = 0; rowIndex < groupRows.length; rowIndex += 1) {
      const rowLayout = groupRows[rowIndex];
      const level = rowLayout.level;
      for (let cellIndex = 0; cellIndex < rowLayout.cells.length; cellIndex += 1) {
        const groupCell = rowLayout.cells[cellIndex];
        const startCol = Math.max(0, groupCell.startColIndex);
        const endCol = Math.min(columns.length, groupCell.endColIndex);
        for (let colIndex = startCol; colIndex < endCol; colIndex += 1) {
          deepestGroupLevelByColumn[colIndex] = Math.max(deepestGroupLevelByColumn[colIndex], level);
        }
      }
    }

    const spansByRow = new Map<number, HeaderLeafSpanLayout[]>();
    const hiddenLeafColumnIds = new Set<string>();
    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      const column = columns[colIndex];
      const leafStartRow = deepestGroupLevelByColumn[colIndex] + 1;
      const rowSpan = maxGroupRowCount - leafStartRow + 1;
      if (rowSpan <= 1) {
        continue;
      }

      const rowSpans = spansByRow.get(leafStartRow) ?? [];
      rowSpans.push({
        columnId: column.id,
        colIndex,
        startRow: leafStartRow,
        rowSpan
      });
      spansByRow.set(leafStartRow, rowSpans);
      hiddenLeafColumnIds.add(column.id);
    }

    return {
      spansByRow,
      hiddenLeafColumnIds
    };
  }

  private populateHeaderLeafCell(
    headerCellElement: HTMLDivElement,
    column: ColumnDef,
    asPlaceholder: boolean,
    ariaColIndex: number
  ): void {
    headerCellElement.className = 'hgrid__header-cell hgrid__header-cell--leaf';
    headerCellElement.dataset.columnId = column.id;
    headerCellElement.setAttribute('role', 'columnheader');
    headerCellElement.setAttribute('aria-colindex', String(ariaColIndex));
    if (asPlaceholder) {
      headerCellElement.classList.add('hgrid__header-cell--leaf-placeholder');
      headerCellElement.textContent = '';
      headerCellElement.style.display = 'none';
      headerCellElement.removeAttribute('aria-colindex');
      return;
    }

    if (this.isIndicatorCheckboxColumnId(column.id)) {
      const rowIndicatorOptions = this.getResolvedRowIndicatorOptions();
      headerCellElement.classList.add('hgrid__header-cell--indicator', 'hgrid__header-cell--indicator-checkbox');
      const checkbox = document.createElement('input');
      checkbox.className = 'hgrid__indicator-checkall';
      checkbox.type = 'checkbox';
      checkbox.tabIndex = -1;
      checkbox.checked = false;
      checkbox.style.display = rowIndicatorOptions.showCheckbox ? '' : 'none';
      checkbox.disabled = !rowIndicatorOptions.showCheckbox;
      const scopeLabel = localizeCheckAllScope(this.localeText, rowIndicatorOptions.checkAllScope);
      checkbox.setAttribute('aria-label', this.localizeText(this.localeText.selectAllRows, { scope: scopeLabel }));
      headerCellElement.append(checkbox);
      this.indicatorHeaderCheckAllElement = checkbox;
      return;
    }

    headerCellElement.textContent = column.header;
  }

  private setHeaderRowCount(groupRowCount: number): void {
    const normalizedGroupRowCount = Math.max(0, Math.min(MAX_GROUP_HEADER_DEPTH, groupRowCount));
    this.headerGroupRowCount = normalizedGroupRowCount;
    const rowHeight = this.getHeaderRowHeight();
    const totalHeight = rowHeight * (normalizedGroupRowCount + 1);
    this.rootElement.style.setProperty('--hgrid-header-row-height', `${rowHeight}px`);
    this.rootElement.style.setProperty('--hgrid-header-height', `${totalHeight}px`);
  }

  private normalizeStateTone(value: unknown): StateColumnTone | null {
    if (
      value === 'inserted' ||
      value === 'updated' ||
      value === 'deleted' ||
      value === 'invalid' ||
      value === 'error' ||
      value === 'clean' ||
      value === STATE_TONE_DIRTY ||
      value === STATE_TONE_COMMIT
    ) {
      return value;
    }

    return null;
  }

  private getDefaultStateTextFromStatus(status: RowStatusTone | null): { text: string; tone: StateColumnTone | null } {
    if (status === 'updated') {
      return {
        text: STATE_TONE_DIRTY,
        tone: STATE_TONE_DIRTY
      };
    }

    if (status === 'clean') {
      return {
        text: STATE_TONE_COMMIT,
        tone: STATE_TONE_COMMIT
      };
    }

    if (status === 'inserted' || status === 'deleted' || status === 'invalid' || status === 'error') {
      return {
        text: status,
        tone: status
      };
    }

    return {
      text: '',
      tone: null
    };
  }

  private resolveStateColumnResult(
    row: GridRowData,
    rowIndex: number,
    dataIndex: number,
    status: RowStatusTone | null
  ): NormalizedStateColumnResult {
    const renderer = this.options.stateColumn?.render;
    if (renderer) {
      const rendered = renderer({
        rowIndex,
        dataIndex,
        row,
        status
      });
      if (typeof rendered === 'string') {
        return {
          textContent: rendered,
          ariaLabel: rendered,
          tooltip: rendered,
          tone: null
        };
      }

      if (rendered && typeof rendered === 'object') {
        const stateResult = rendered as StateColumnRenderResult;
        const text = stateResult.text ? String(stateResult.text) : '';
        const ariaLabel = stateResult.ariaLabel ? String(stateResult.ariaLabel) : text;
        const tooltip = stateResult.tooltip ? String(stateResult.tooltip) : text;
        const tone = this.normalizeStateTone(stateResult.tone);
        return {
          textContent: text,
          ariaLabel,
          tooltip,
          tone
        };
      }
    }

    const rowStateText = typeof row.__state === 'string' ? row.__state : typeof row.state === 'string' ? row.state : '';
    if (rowStateText.length > 0) {
      return {
        textContent: rowStateText,
        ariaLabel: rowStateText,
        tooltip: rowStateText,
        tone: this.normalizeStateTone(rowStateText)
      };
    }

    const fallback = this.getDefaultStateTextFromStatus(status);
    return {
      textContent: fallback.text,
      ariaLabel: fallback.text,
      tooltip: fallback.text,
      tone: fallback.tone
    };
  }

  private getIndicatorCheckboxGlobalColumnIndex(): number {
    const leftColumns = this.columnsByZone.left;
    let legacyColumnIndex = -1;
    for (let columnIndex = 0; columnIndex < leftColumns.length; columnIndex += 1) {
      const columnId = leftColumns[columnIndex].id;
      if (columnId === INDICATOR_CHECKBOX_COLUMN_ID) {
        return columnIndex;
      }

      if (columnId === LEGACY_INDICATOR_COLUMN_ID && legacyColumnIndex === -1) {
        legacyColumnIndex = columnIndex;
      }
    }

    return legacyColumnIndex;
  }

  private getSelectionRowRangeInputs(): SelectionRowRangeInput[] {
    const selection = this.selectionModel.getSelection();
    return selection.rowRanges.map((range) => ({
      r1: range.r1,
      r2: range.r2
    }));
  }

  private mergeRowRangeInputs(ranges: SelectionRowRangeInput[]): SelectionRowRangeInput[] {
    if (ranges.length === 0) {
      return [];
    }

    const sorted = ranges
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
    for (let rangeIndex = 0; rangeIndex < sorted.length; rangeIndex += 1) {
      const current = sorted[rangeIndex];
      const previous = merged[merged.length - 1];
      if (!previous) {
        merged.push({ ...current });
        continue;
      }

      if (current.r1 <= previous.r2 + 1) {
        previous.r2 = Math.max(previous.r2, current.r2);
        continue;
      }

      merged.push({ ...current });
    }

    return merged;
  }

  private addRowRange(
    ranges: SelectionRowRangeInput[],
    rowStart: number,
    rowEnd: number
  ): SelectionRowRangeInput[] {
    return this.mergeRowRangeInputs(
      ranges.concat({
        r1: Math.min(rowStart, rowEnd),
        r2: Math.max(rowStart, rowEnd)
      })
    );
  }

  private removeRowRange(
    ranges: SelectionRowRangeInput[],
    rowStart: number,
    rowEnd: number
  ): SelectionRowRangeInput[] {
    const start = Math.min(rowStart, rowEnd);
    const end = Math.max(rowStart, rowEnd);
    const nextRanges: SelectionRowRangeInput[] = [];

    for (let rangeIndex = 0; rangeIndex < ranges.length; rangeIndex += 1) {
      const range = ranges[rangeIndex];
      const rangeStart = Math.min(range.r1, range.r2);
      const rangeEnd = Math.max(range.r1, range.r2);

      if (rangeEnd < start || rangeStart > end) {
        nextRanges.push({
          r1: rangeStart,
          r2: rangeEnd
        });
        continue;
      }

      if (rangeStart < start) {
        nextRanges.push({
          r1: rangeStart,
          r2: start - 1
        });
      }

      if (rangeEnd > end) {
        nextRanges.push({
          r1: end + 1,
          r2: rangeEnd
        });
      }
    }

    return this.mergeRowRangeInputs(nextRanges);
  }

  private applyIndicatorSelection(
    rowRanges: SelectionRowRangeInput[],
    focusRowIndex: number,
    source: SelectionChangeSource
  ): void {
    const bounds = this.getSelectionBounds();
    if (bounds.rowCount <= 0) {
      return;
    }

    const indicatorColIndex = this.getIndicatorCheckboxGlobalColumnIndex();
    const clampedRowIndex = Math.max(0, Math.min(bounds.rowCount - 1, focusRowIndex));
    const activeCell =
      indicatorColIndex >= 0
        ? {
            rowIndex: clampedRowIndex,
            colIndex: indicatorColIndex
          }
        : null;
    const hasChanged = this.selectionModel.setSelection(
      {
        activeCell,
        cellRanges: [],
        rowRanges
      },
      bounds,
      this.resolveRowKeyByRowIndex
    );
    if (!hasChanged) {
      return;
    }

    this.keyboardRangeAnchor = activeCell ? { ...activeCell } : null;
    this.commitSelectionChange(source);
  }

  private toggleRowSelectionByIndicator(
    rowIndex: number,
    modifiers: { isShift: boolean; isMeta: boolean },
    source: SelectionChangeSource
  ): void {
    const bounds = this.getSelectionBounds();
    if (bounds.rowCount <= 0) {
      return;
    }

    const normalizedRowIndex = Math.max(0, Math.min(bounds.rowCount - 1, rowIndex));
    const currentRanges = this.getSelectionRowRangeInputs();
    const isSelected = this.selectionModel.isRowSelected(normalizedRowIndex);
    let nextRanges = currentRanges;

    if (modifiers.isShift && this.rowCheckboxAnchorRowIndex !== null) {
      const rangeStart = Math.min(this.rowCheckboxAnchorRowIndex, normalizedRowIndex);
      const rangeEnd = Math.max(this.rowCheckboxAnchorRowIndex, normalizedRowIndex);
      nextRanges = this.addRowRange(nextRanges, rangeStart, rangeEnd);
    } else if (modifiers.isMeta) {
      nextRanges = isSelected
        ? this.removeRowRange(nextRanges, normalizedRowIndex, normalizedRowIndex)
        : this.addRowRange(nextRanges, normalizedRowIndex, normalizedRowIndex);
      this.rowCheckboxAnchorRowIndex = normalizedRowIndex;
    } else {
      // Checkbox UX: plain click toggles row and preserves existing multi-selection.
      nextRanges = isSelected
        ? this.removeRowRange(nextRanges, normalizedRowIndex, normalizedRowIndex)
        : this.addRowRange(nextRanges, normalizedRowIndex, normalizedRowIndex);
      this.rowCheckboxAnchorRowIndex = normalizedRowIndex;
    }

    this.applyIndicatorSelection(nextRanges, normalizedRowIndex, source);
  }

  private getViewportVisibleRowRange(): { startRow: number; endRow: number } | null {
    let startRow = Number.POSITIVE_INFINITY;
    let endRow = Number.NEGATIVE_INFINITY;

    for (let poolIndex = 0; poolIndex < this.rowPool.length; poolIndex += 1) {
      const rowState = this.rowPool[poolIndex].center.rowState;
      if (!rowState.isVisible || rowState.rowIndex < 0) {
        continue;
      }

      startRow = Math.min(startRow, rowState.rowIndex);
      endRow = Math.max(endRow, rowState.rowIndex);
    }

    if (!Number.isFinite(startRow) || !Number.isFinite(endRow) || endRow < startRow) {
      return null;
    }

    return {
      startRow,
      endRow
    };
  }

  private resolveCheckAllRowRange(scope: RowIndicatorCheckAllScope): { startRow: number; endRow: number } | null {
    const viewRowCount = this.options.rowModel.getViewRowCount();
    if (viewRowCount <= 0) {
      return null;
    }

    if (scope === 'viewport') {
      return this.getViewportVisibleRowRange();
    }

    return {
      startRow: 0,
      endRow: viewRowCount - 1
    };
  }

  private countSelectedRowsInRange(startRow: number, endRow: number): number {
    const selection = this.selectionModel.getSelection();
    let selectedCount = 0;

    for (let rangeIndex = 0; rangeIndex < selection.rowRanges.length; rangeIndex += 1) {
      const range = selection.rowRanges[rangeIndex];
      const overlapStart = Math.max(startRow, range.r1);
      const overlapEnd = Math.min(endRow, range.r2);
      if (overlapStart > overlapEnd) {
        continue;
      }

      selectedCount += overlapEnd - overlapStart + 1;
      if (selectedCount >= endRow - startRow + 1) {
        return endRow - startRow + 1;
      }
    }

    return selectedCount;
  }

  private syncIndicatorHeaderCheckAllState(): void {
    if (!this.indicatorHeaderCheckAllElement) {
      return;
    }

    const rowIndicatorOptions = this.getResolvedRowIndicatorOptions();
    if (!rowIndicatorOptions.showCheckbox) {
      this.indicatorHeaderCheckAllElement.checked = false;
      this.indicatorHeaderCheckAllElement.indeterminate = false;
      this.indicatorHeaderCheckAllElement.disabled = true;
      return;
    }

    const rowRange = this.resolveCheckAllRowRange(rowIndicatorOptions.checkAllScope);
    if (!rowRange) {
      this.indicatorHeaderCheckAllElement.checked = false;
      this.indicatorHeaderCheckAllElement.indeterminate = false;
      this.indicatorHeaderCheckAllElement.disabled = true;
      return;
    }

    const totalRows = rowRange.endRow - rowRange.startRow + 1;
    const selectedRows = this.countSelectedRowsInRange(rowRange.startRow, rowRange.endRow);
    this.indicatorHeaderCheckAllElement.disabled = false;
    this.indicatorHeaderCheckAllElement.checked = totalRows > 0 && selectedRows === totalRows;
    this.indicatorHeaderCheckAllElement.indeterminate = selectedRows > 0 && selectedRows < totalRows;
  }

  private toggleCheckAllByIndicator(checked: boolean, source: SelectionChangeSource): void {
    const rowIndicatorOptions = this.getResolvedRowIndicatorOptions();
    const targetRange = this.resolveCheckAllRowRange(rowIndicatorOptions.checkAllScope);
    if (!targetRange) {
      return;
    }

    const currentRanges = this.getSelectionRowRangeInputs();
    const nextRanges = checked
      ? this.addRowRange(currentRanges, targetRange.startRow, targetRange.endRow)
      : this.removeRowRange(currentRanges, targetRange.startRow, targetRange.endRow);
    const focusRowIndex = checked ? targetRange.startRow : Math.max(0, targetRange.startRow);
    this.rowCheckboxAnchorRowIndex = focusRowIndex;
    this.applyIndicatorSelection(nextRanges, focusRowIndex, source);
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
    this.syncAriaGridMetrics();

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
    this.indicatorHeaderCheckAllElement = null;
    const leftGroupRows = this.getZoneGroupRowLayouts(this.columnsByZone.left);
    const centerGroupRows = this.getZoneGroupRowLayouts(this.columnsByZone.center);
    const rightGroupRows = this.getZoneGroupRowLayouts(this.columnsByZone.right);
    const maxGroupRowCount = Math.max(leftGroupRows.length, centerGroupRows.length, rightGroupRows.length);
    const leftLeafSpanMetrics = this.getZoneLeafSpanMetrics(this.columnsByZone.left, leftGroupRows, maxGroupRowCount);
    const centerLeafSpanMetrics = this.getZoneLeafSpanMetrics(this.columnsByZone.center, centerGroupRows, maxGroupRowCount);
    const rightLeafSpanMetrics = this.getZoneLeafSpanMetrics(this.columnsByZone.right, rightGroupRows, maxGroupRowCount);
    this.leafSpanHiddenColumnsByZone.left = leftLeafSpanMetrics.hiddenLeafColumnIds;
    this.leafSpanHiddenColumnsByZone.center = centerLeafSpanMetrics.hiddenLeafColumnIds;
    this.leafSpanHiddenColumnsByZone.right = rightLeafSpanMetrics.hiddenLeafColumnIds;
    this.setHeaderRowCount(maxGroupRowCount);

    this.buildHeaderZone(
      this.headerLeftElement,
      this.headerRowLeftElement,
      this.columnsByZone.left,
      'left',
      leftGroupRows,
      maxGroupRowCount,
      leftLeafSpanMetrics,
      this.leftColumnLeft,
      this.leftColumnWidth,
      this.leftPinnedWidth
    );
    this.buildHeaderZone(
      this.headerCenterViewportElement,
      this.headerRowCenterElement,
      this.columnsByZone.center,
      'center',
      centerGroupRows,
      maxGroupRowCount,
      centerLeafSpanMetrics,
      this.centerColumnLeft,
      this.centerColumnWidth,
      this.centerColumnsWidth
    );
    this.buildHeaderZone(
      this.headerRightElement,
      this.headerRowRightElement,
      this.columnsByZone.right,
      'right',
      rightGroupRows,
      maxGroupRowCount,
      rightLeafSpanMetrics,
      this.rightColumnLeft,
      this.rightColumnWidth,
      this.rightPinnedWidth
    );
    this.syncIndicatorHeaderCheckAllState();
  }

  private buildHeaderZone(
    zoneContainer: HTMLDivElement,
    leafRowElement: HTMLDivElement,
    columns: ColumnDef[],
    zoneName: ColumnZoneName,
    groupRows: HeaderGroupRowLayout[],
    maxGroupRowCount: number,
    leafSpanMetrics: HeaderLeafSpanMetrics,
    columnLeft: number[],
    columnWidth: number[],
    zoneWidth: number
  ): void {
    zoneContainer.replaceChildren();
    for (let rowIndex = 0; rowIndex < maxGroupRowCount; rowIndex += 1) {
      const groupRowLayout = groupRows[rowIndex] ?? null;
      const groupRowElement = this.createHeaderGroupRow(
        zoneName,
        groupRowLayout,
        columnLeft,
        columnWidth,
        zoneWidth,
        rowIndex,
        leafSpanMetrics,
        columns
      );
      zoneContainer.append(groupRowElement);
    }

    if (zoneName === 'center') {
      this.buildCenterHeaderRow(leafRowElement);
    } else {
      this.buildPinnedHeaderLeafRow(leafRowElement, columns, zoneName, columnLeft, zoneWidth);
    }
    zoneContainer.append(leafRowElement);
  }

  private createHeaderGroupRow(
    zoneName: ColumnZoneName,
    rowLayout: HeaderGroupRowLayout | null,
    columnLeft: number[],
    columnWidth: number[],
    zoneWidth: number,
    rowIndex: number,
    leafSpanMetrics: HeaderLeafSpanMetrics,
    columns: ColumnDef[]
  ): HTMLDivElement {
    const rowElement = document.createElement('div');
    rowElement.className = `hgrid__header-row hgrid__header-row--${zoneName} hgrid__header-row--group`;
    const isAriaHeaderRow = zoneName === 'center';
    rowElement.setAttribute('role', isAriaHeaderRow ? 'row' : 'presentation');
    if (isAriaHeaderRow) {
      rowElement.setAttribute('aria-rowindex', String(rowIndex + 1));
    } else {
      rowElement.removeAttribute('aria-rowindex');
    }
    rowElement.style.display = 'block';
    rowElement.style.position = 'relative';
    rowElement.style.width = `${Math.max(1, zoneWidth)}px`;
    const zoneColumnStartIndex = this.getZoneColumnStartIndex(zoneName);

    if (rowLayout) {
      for (let cellIndex = 0; cellIndex < rowLayout.cells.length; cellIndex += 1) {
        const cellLayout = rowLayout.cells[cellIndex];
        const startColIndex = cellLayout.startColIndex;
        const endColIndex = cellLayout.endColIndex - 1;
        if (
          startColIndex < 0 ||
          endColIndex < startColIndex ||
          startColIndex >= columnLeft.length ||
          endColIndex >= columnLeft.length
        ) {
          continue;
        }

        const left = columnLeft[startColIndex];
        const right = columnLeft[endColIndex] + columnWidth[endColIndex];
        const width = Math.max(0, right - left);
        if (width <= 0) {
          continue;
        }

        const headerCellElement = document.createElement('div');
        headerCellElement.className = 'hgrid__header-cell hgrid__header-cell--group';
        if (cellLayout.isCollapsed) {
          headerCellElement.classList.add('hgrid__header-cell--group-collapsed');
        }
        headerCellElement.style.position = 'absolute';
        headerCellElement.style.left = `${left}px`;
        headerCellElement.style.width = `${width}px`;
        headerCellElement.dataset.groupId = cellLayout.groupId;
        headerCellElement.setAttribute('role', 'columnheader');
        headerCellElement.setAttribute('aria-colindex', String(zoneColumnStartIndex + startColIndex + 1));
        headerCellElement.setAttribute('aria-colspan', String(cellLayout.leafSpan));
        headerCellElement.textContent = cellLayout.header;
        rowElement.append(headerCellElement);
      }
    }

    const leafSpanRows = leafSpanMetrics.spansByRow.get(rowIndex) ?? [];
    if (leafSpanRows.length > 0) {
      const rowHeight = this.getHeaderRowHeight();
      for (let spanIndex = 0; spanIndex < leafSpanRows.length; spanIndex += 1) {
        const spanLayout = leafSpanRows[spanIndex];
        const column = columns[spanLayout.colIndex];
        if (!column) {
          continue;
        }

        const left = columnLeft[spanLayout.colIndex];
        const width = columnWidth[spanLayout.colIndex];
        if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) {
          continue;
        }

        const headerCellElement = document.createElement('div');
        this.populateHeaderLeafCell(headerCellElement, column, false, zoneColumnStartIndex + spanLayout.colIndex + 1);
        headerCellElement.classList.add('hgrid__header-cell--leaf-span');
        headerCellElement.style.position = 'absolute';
        headerCellElement.style.left = `${left}px`;
        headerCellElement.style.width = `${width}px`;
        headerCellElement.style.height = `${Math.max(1, spanLayout.rowSpan * rowHeight)}px`;
        rowElement.append(headerCellElement);
      }
    }

    return rowElement;
  }

  private buildPinnedHeaderLeafRow(
    rowElement: HTMLDivElement,
    columns: ColumnDef[],
    zoneName: ColumnZoneName,
    columnLeft: number[],
    zoneWidth: number
  ): void {
    rowElement.replaceChildren();
    rowElement.classList.add('hgrid__header-row--leaf');
    rowElement.setAttribute('role', 'presentation');
    rowElement.removeAttribute('aria-rowindex');
    rowElement.style.display = 'block';
    rowElement.style.position = 'relative';
    rowElement.style.width = `${Math.max(1, zoneWidth)}px`;
    const hiddenColumns = this.leafSpanHiddenColumnsByZone[zoneName];
    const zoneColumnStartIndex = this.getZoneColumnStartIndex(zoneName);

    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      const column = columns[colIndex];
      const headerCellElement = document.createElement('div');
      this.populateHeaderLeafCell(
        headerCellElement,
        column,
        hiddenColumns.has(column.id),
        zoneColumnStartIndex + colIndex + 1
      );
      headerCellElement.style.position = 'absolute';
      headerCellElement.style.left = `${columnLeft[colIndex] ?? 0}px`;
      headerCellElement.style.width = `${column.width}px`;
      rowElement.append(headerCellElement);
    }
  }

  private buildCenterHeaderRow(rowElement: HTMLDivElement): void {
    rowElement.replaceChildren();
    rowElement.classList.add('hgrid__header-row--leaf');
    rowElement.setAttribute('role', 'row');
    rowElement.setAttribute('aria-rowindex', String(this.headerGroupRowCount + 1));
    rowElement.style.display = 'block';
    rowElement.style.position = 'relative';
    rowElement.style.width = `${Math.max(1, this.centerColumnsWidth)}px`;
    this.centerHeaderCellPool = [];
    this.centerHeaderCellStates = [];

    for (let slotIndex = 0; slotIndex < this.centerCellCapacity; slotIndex += 1) {
      const headerCellElement = document.createElement('div');
      headerCellElement.className = 'hgrid__header-cell hgrid__header-cell--center hgrid__header-cell--leaf';
      headerCellElement.style.position = 'absolute';
      headerCellElement.style.left = '0px';
      headerCellElement.style.display = 'none';
      headerCellElement.setAttribute('role', 'columnheader');
      rowElement.append(headerCellElement);
      this.centerHeaderCellPool.push(headerCellElement);
      this.centerHeaderCellStates.push({
        isVisible: false,
        columnId: '',
        role: 'columnheader',
        contentMode: 'text',
        textContent: '',
        htmlContent: '',
        left: 0,
        width: 0,
        isSelected: false,
        isActive: false,
        extraClassName: '',
        titleText: '',
        ariaLabel: '',
        ariaRowIndex: -1,
        ariaColIndex: -1,
        cellId: ''
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
    rowElement.setAttribute('role', zoneName === 'center' ? 'row' : 'presentation');
    rowElement.style.height = `${this.getBaseRowHeight()}px`;
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
        if (this.isIndicatorCheckboxColumnId(column.id)) {
          cellElement.classList.add('hgrid__cell--indicator', 'hgrid__cell--indicator-checkbox');
          indicatorCell = this.createIndicatorCellElements(cellElement);
        }
      }
      rowElement.append(cellElement);
      cells.push(cellElement);
      indicatorCells.push(indicatorCell);
      cellStates.push({
        isVisible: zoneName !== 'center',
        columnId: zoneName === 'center' ? '' : column.id,
        role: 'gridcell',
        contentMode: 'text',
        textContent: '',
        htmlContent: '',
        left: Number.NaN,
        width: zoneName === 'center' ? Number.NaN : column.width,
        isSelected: false,
        isActive: false,
        extraClassName: '',
        titleText: '',
        ariaLabel: '',
        ariaRowIndex: -1,
        ariaColIndex: -1,
        cellId: ''
      });
    }

    return {
      element: rowElement,
      cells,
      indicatorCells,
      visibleDisplay,
      rowState: {
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
      },
      cellStates
    };
  }

  private createIndicatorCellElements(cellElement: HTMLDivElement): IndicatorCellElements {
    const wrapper = document.createElement('div');
    wrapper.className = 'hgrid__indicator-cell';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'hgrid__indicator-checkbox';
    checkbox.tabIndex = -1;
    checkbox.setAttribute('aria-label', this.localeText.selectRowGeneric);

    wrapper.append(checkbox);
    cellElement.append(wrapper);

    return {
      checkbox
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
      const isTreeRow = isTreeRowData(row);
      const treeLevel = isTreeRow ? Math.min(MAX_TREE_ROW_LEVEL, getTreeRowDepth(row)) : 0;
      const isGroupRow = !isTreeRow && isGroupRowData(row);
      const groupLevel = isGroupRow ? Math.min(MAX_GROUP_ROW_LEVEL, getGroupRowLevel(row)) : 0;
      const isRowLoading = !isGroupRow && !isTreeRow && this.options.dataProvider.isRowLoading?.(dataIndex) === true;
      const rowHeight = this.resolveRenderedRowHeight(rowIndex, dataIndex);
      const rowTranslateY = this.getRowTop(rowIndex) - viewportOffsetY;

      this.renderZoneRow(
        'left',
        poolItem.left,
        this.columnsByZone.left,
        row,
        rowIndex,
        dataIndex,
        rowTranslateY,
        rowHeight,
        isRowLoading,
        isGroupRow,
        groupLevel,
        isTreeRow,
        treeLevel
      );
      this.renderCenterZoneRow(
        poolItem.center,
        row,
        rowIndex,
        dataIndex,
        rowTranslateY,
        rowHeight,
        horizontalWindow,
        isRowLoading,
        isGroupRow,
        groupLevel,
        isTreeRow,
        treeLevel
      );
      this.renderZoneRow(
        'right',
        poolItem.right,
        this.columnsByZone.right,
        row,
        rowIndex,
        dataIndex,
        rowTranslateY,
        rowHeight,
        isRowLoading,
        isGroupRow,
        groupLevel,
        isTreeRow,
        treeLevel
      );
    }

    this.syncIndicatorHeaderCheckAllState();
    this.syncAriaGridMetrics();
    this.syncAriaActiveDescendant();
    this.scheduleMeasuredRowHeightPass();
    if (this.editSession) {
      const canKeepEditing = this.syncEditorOverlayPosition();
      if (!canKeepEditing) {
        this.stopEditing('detached');
      }
    }
  }

  private resolveCellContent(
    column: ColumnDef,
    row: GridRowData,
    rowIndex: number,
    dataIndex: number,
    isRowLoading: boolean
  ): CellContentResult {
    const textContent = isRowLoading ? '' : formatColumnValue(column, row, this.columnValueFormatContext ?? undefined);
    if (isRowLoading || column.unsafeHtml !== true) {
      return {
        textContent,
        contentMode: 'text',
        htmlContent: ''
      };
    }

    const value = getColumnValue(column, row);
    const context: UnsafeHtmlSanitizeContext = {
      rowIndex,
      dataIndex,
      rowKey: this.options.dataProvider.getRowKey(dataIndex),
      column,
      row,
      value
    };
    const htmlContent = this.resolveUnsafeHtmlContent(textContent, context);
    return {
      textContent,
      contentMode: 'html',
      htmlContent
    };
  }

  private resolveUnsafeHtmlContent(rawHtml: string, context: UnsafeHtmlSanitizeContext): string {
    const columnSanitize = context.column.sanitizeHtml;
    if (typeof columnSanitize === 'function') {
      const sanitizedHtml = columnSanitize(rawHtml, context);
      return typeof sanitizedHtml === 'string' ? sanitizedHtml : '';
    }

    const gridSanitize = this.options.sanitizeHtml;
    if (typeof gridSanitize === 'function') {
      const sanitizedHtml = gridSanitize(rawHtml, context);
      return typeof sanitizedHtml === 'string' ? sanitizedHtml : '';
    }

    return rawHtml;
  }

  private prependCellPrefix(content: CellContentResult, prefix: string): CellContentResult {
    if (prefix.length === 0) {
      return content;
    }

    if (content.contentMode === 'html') {
      return {
        textContent: `${prefix} ${content.textContent}`,
        contentMode: 'html',
        htmlContent: `${escapeHtmlText(prefix)} ${content.htmlContent}`
      };
    }

    return {
      textContent: `${prefix} ${content.textContent}`,
      contentMode: 'text',
      htmlContent: ''
    };
  }

  private createEditCommitEventPayload(
    payload: {
      rowIndex: number;
      dataIndex: number;
      columnId: string;
      previousValue: unknown;
      value: unknown;
    },
    source: EditCommitSource
  ): EditCommitEventPayload {
    const timestampMs = Date.now();
    this.editCommitSequence += 1;

    return {
      rowIndex: payload.rowIndex,
      dataIndex: payload.dataIndex,
      rowKey: this.options.dataProvider.getRowKey(payload.dataIndex),
      columnId: payload.columnId,
      previousValue: payload.previousValue,
      value: payload.value,
      source,
      commitId: `edit-${timestampMs}-${this.editCommitSequence}`,
      timestampMs,
      timestamp: new Date(timestampMs).toISOString()
    };
  }

  private renderZoneRow(
    zoneName: ColumnZoneName,
    zoneRow: ZoneRowItem,
    columns: ColumnDef[],
    row: GridRowData,
    rowIndex: number,
    dataIndex: number,
    rowTranslateY: number,
    rowHeight: number,
    isRowLoading: boolean,
    isGroupRow: boolean,
    groupLevel: number,
    isTreeRow: boolean,
    treeLevel: number
  ): void {
    if (columns.length === 0) {
      this.hidePoolRow(zoneRow);
      return;
    }

    this.bindRowPosition(zoneRow, rowIndex, dataIndex, rowTranslateY, rowHeight, isGroupRow, groupLevel, isTreeRow, treeLevel);
    const groupColumnId = isGroupRow ? this.resolveGroupRowColumnId(row) : null;
    const isGroupExpanded = isGroupRow ? this.resolveGroupRowExpanded(row) : false;
    const treeColumnId = isTreeRow ? this.resolveTreeRowColumnId(row) : null;
    const isTreeExpanded = isTreeRow ? this.resolveTreeRowExpanded(row) : false;
    const treeHasChildren = isTreeRow ? this.resolveTreeRowHasChildren(row) : false;

    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      const column = columns[colIndex];
      const cell = zoneRow.cells[colIndex];
      const cellState = zoneRow.cellStates[colIndex];
      const indicatorCell = zoneRow.indicatorCells[colIndex];
      const globalColumnIndex = this.getGlobalColumnIndex(zoneName, colIndex);
      const ariaColIndex = globalColumnIndex + 1;
      const isCellSelected = this.selectionModel.isCellSelected(rowIndex, globalColumnIndex);
      const isCellActive = this.selectionModel.isCellActive(rowIndex, globalColumnIndex);
      const cellId = isCellActive ? this.getAriaCellId(rowIndex, globalColumnIndex) : '';
      if (this.isIndicatorCheckboxColumnId(column.id) && indicatorCell) {
        this.bindIndicatorCheckboxCell(
          cell,
          cellState,
          indicatorCell,
          column.id,
          rowIndex,
          globalColumnIndex,
          isGroupRow
        );
        continue;
      }

      if (column.id === INDICATOR_ROW_NUMBER_COLUMN_ID) {
        const rowNumberText = isGroupRow ? '' : String(rowIndex + 1);
        this.bindCell(cell, cellState, {
          isVisible: true,
          columnId: column.id,
          role: 'gridcell',
          textContent: rowNumberText,
          ariaRowIndex: this.getAriaRowIndexForDataRow(rowIndex),
          ariaColIndex,
          cellId,
          isSelected: isCellSelected,
          isActive: isCellActive,
          extraClassName: 'hgrid__cell--indicator hgrid__cell--indicator-row-number',
          ariaLabel: isGroupRow ? '' : this.localizeText(this.localeText.rowNumber, { row: rowIndex + 1 })
        });
        continue;
      }

      if (column.id === INDICATOR_STATUS_COLUMN_ID) {
        const isRowSelected = isGroupRow ? false : this.selectionModel.isRowSelected(rowIndex);
        const statusText = isGroupRow ? '' : this.resolveIndicatorStatusText(row, rowIndex, dataIndex, isRowSelected);
        this.bindCell(cell, cellState, {
          isVisible: true,
          columnId: column.id,
          role: 'gridcell',
          textContent: statusText,
          ariaRowIndex: this.getAriaRowIndexForDataRow(rowIndex),
          ariaColIndex,
          cellId,
          isSelected: isCellSelected,
          isActive: isCellActive,
          extraClassName: 'hgrid__cell--indicator hgrid__cell--indicator-status',
          titleText: statusText,
          ariaLabel:
            statusText.length > 0
              ? this.localizeText(this.localeText.rowStatusWithValue, { row: rowIndex + 1, status: statusText })
              : this.localizeText(this.localeText.rowStatus, { row: rowIndex + 1 })
        });
        continue;
      }

      let cellContent = this.resolveCellContent(column, row, rowIndex, dataIndex, isRowLoading);
      let extraClassName = isRowLoading ? 'hgrid__cell--loading' : '';
      let titleText = '';
      let ariaLabel = '';
      if (column.id === STATE_COLUMN_ID && !isRowLoading) {
        const rowStatus = this.resolveRowStatusTone(row, rowIndex, dataIndex, this.selectionModel.isRowSelected(rowIndex));
        const stateColumnResult = this.resolveStateColumnResult(row, rowIndex, dataIndex, rowStatus);
        cellContent = {
          textContent: stateColumnResult.textContent,
          contentMode: 'text',
          htmlContent: ''
        };
        extraClassName = `hgrid__cell--state${stateColumnResult.tone ? ` hgrid__cell--state-${stateColumnResult.tone}` : ''}`;
        titleText = stateColumnResult.tooltip;
        ariaLabel = stateColumnResult.ariaLabel;
      }

      if (isGroupRow && groupColumnId && column.id === groupColumnId) {
        const expandGlyph = isGroupExpanded ? '▾' : '▸';
        cellContent = this.prependCellPrefix(cellContent, expandGlyph);
        const indentPx = 10 + groupLevel * 14;
        extraClassName = `${extraClassName.length > 0 ? `${extraClassName} ` : ''}hgrid__cell--group`.trim();
        cell.style.setProperty('--hgrid-group-indent', `${indentPx}px`);
      } else if (isTreeRow && treeColumnId && column.id === treeColumnId) {
        const glyph = treeHasChildren ? (isTreeExpanded ? '▾' : '▸') : '•';
        cellContent = this.prependCellPrefix(cellContent, glyph);
        const indentPx = 10 + treeLevel * 14;
        extraClassName = `${extraClassName.length > 0 ? `${extraClassName} ` : ''}hgrid__cell--tree`.trim();
        cell.style.setProperty('--hgrid-tree-indent', `${indentPx}px`);
      } else if (cell.style.getPropertyValue('--hgrid-group-indent').length > 0) {
        cell.style.removeProperty('--hgrid-group-indent');
        if (cell.style.getPropertyValue('--hgrid-tree-indent').length > 0) {
          cell.style.removeProperty('--hgrid-tree-indent');
        }
      } else if (cell.style.getPropertyValue('--hgrid-tree-indent').length > 0) {
        cell.style.removeProperty('--hgrid-tree-indent');
      }

      this.bindCell(cell, cellState, {
        isVisible: true,
        columnId: column.id,
        role: 'gridcell',
        textContent: cellContent.textContent,
        contentMode: cellContent.contentMode,
        htmlContent: cellContent.htmlContent,
        ariaRowIndex: this.getAriaRowIndexForDataRow(rowIndex),
        ariaColIndex,
        cellId,
        isSelected: isCellSelected,
        isActive: isCellActive,
        extraClassName,
        titleText,
        ariaLabel
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
    horizontalWindow: HorizontalWindow,
    isRowLoading: boolean,
    isGroupRow: boolean,
    groupLevel: number,
    isTreeRow: boolean,
    treeLevel: number
  ): void {
    if (this.columnsByZone.center.length === 0 || horizontalWindow.end <= horizontalWindow.start) {
      this.hidePoolRow(zoneRow);
      return;
    }

    this.bindRowPosition(zoneRow, rowIndex, dataIndex, rowTranslateY, rowHeight, isGroupRow, groupLevel, isTreeRow, treeLevel);
    const groupColumnId = isGroupRow ? this.resolveGroupRowColumnId(row) : null;
    const isGroupExpanded = isGroupRow ? this.resolveGroupRowExpanded(row) : false;
    const treeColumnId = isTreeRow ? this.resolveTreeRowColumnId(row) : null;
    const isTreeExpanded = isTreeRow ? this.resolveTreeRowExpanded(row) : false;
    const treeHasChildren = isTreeRow ? this.resolveTreeRowHasChildren(row) : false;

    const centerColumns = this.columnsByZone.center;
    let slotIndex = 0;

    for (let colIndex = horizontalWindow.start; colIndex < horizontalWindow.end; colIndex += 1) {
      const column = centerColumns[colIndex];
      const cell = zoneRow.cells[slotIndex];
      const cellState = zoneRow.cellStates[slotIndex];
      const globalColumnIndex = this.getGlobalColumnIndex('center', colIndex);
      const isCellSelected = this.selectionModel.isCellSelected(rowIndex, globalColumnIndex);
      const isCellActive = this.selectionModel.isCellActive(rowIndex, globalColumnIndex);
      const cellId = isCellActive ? this.getAriaCellId(rowIndex, globalColumnIndex) : '';
      if (!cell) {
        break;
      }

      let cellContent = this.resolveCellContent(column, row, rowIndex, dataIndex, isRowLoading);
      let extraClassName = isRowLoading ? 'hgrid__cell--loading' : '';
      let titleText = '';
      let ariaLabel = '';
      if (column.id === STATE_COLUMN_ID && !isRowLoading) {
        const rowStatus = this.resolveRowStatusTone(row, rowIndex, dataIndex, this.selectionModel.isRowSelected(rowIndex));
        const stateColumnResult = this.resolveStateColumnResult(row, rowIndex, dataIndex, rowStatus);
        cellContent = {
          textContent: stateColumnResult.textContent,
          contentMode: 'text',
          htmlContent: ''
        };
        extraClassName = `hgrid__cell--state${stateColumnResult.tone ? ` hgrid__cell--state-${stateColumnResult.tone}` : ''}`;
        titleText = stateColumnResult.tooltip;
        ariaLabel = stateColumnResult.ariaLabel;
      }

      if (isGroupRow && groupColumnId && column.id === groupColumnId) {
        const expandGlyph = isGroupExpanded ? '▾' : '▸';
        cellContent = this.prependCellPrefix(cellContent, expandGlyph);
        const indentPx = 10 + groupLevel * 14;
        extraClassName = `${extraClassName.length > 0 ? `${extraClassName} ` : ''}hgrid__cell--group`.trim();
        cell.style.setProperty('--hgrid-group-indent', `${indentPx}px`);
      } else if (isTreeRow && treeColumnId && column.id === treeColumnId) {
        const glyph = treeHasChildren ? (isTreeExpanded ? '▾' : '▸') : '•';
        cellContent = this.prependCellPrefix(cellContent, glyph);
        const indentPx = 10 + treeLevel * 14;
        extraClassName = `${extraClassName.length > 0 ? `${extraClassName} ` : ''}hgrid__cell--tree`.trim();
        cell.style.setProperty('--hgrid-tree-indent', `${indentPx}px`);
      } else if (cell.style.getPropertyValue('--hgrid-group-indent').length > 0) {
        cell.style.removeProperty('--hgrid-group-indent');
        if (cell.style.getPropertyValue('--hgrid-tree-indent').length > 0) {
          cell.style.removeProperty('--hgrid-tree-indent');
        }
      } else if (cell.style.getPropertyValue('--hgrid-tree-indent').length > 0) {
        cell.style.removeProperty('--hgrid-tree-indent');
      }

      this.bindCell(cell, cellState, {
        isVisible: true,
        columnId: column.id,
        role: 'gridcell',
        textContent: cellContent.textContent,
        contentMode: cellContent.contentMode,
        htmlContent: cellContent.htmlContent,
        ariaRowIndex: this.getAriaRowIndexForDataRow(rowIndex),
        ariaColIndex: globalColumnIndex + 1,
        cellId,
        left: this.centerColumnLeft[colIndex],
        width: column.width,
        isSelected: isCellSelected,
        isActive: isCellActive,
        extraClassName,
        titleText,
        ariaLabel
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

  private bindRowPosition(
    zoneRow: ZoneRowItem,
    rowIndex: number,
    dataIndex: number,
    rowTranslateY: number,
    rowHeight: number,
    isGroupRow: boolean,
    groupLevel: number,
    isTreeRow: boolean,
    treeLevel: number
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
      if (zoneRow.element.getAttribute('role') === 'row') {
        zoneRow.element.setAttribute('aria-rowindex', String(this.getAriaRowIndexForDataRow(rowIndex)));
      } else {
        zoneRow.element.removeAttribute('aria-rowindex');
      }
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

    if (rowState.isGroupRow !== isGroupRow) {
      zoneRow.element.classList.toggle('hgrid__row--group', isGroupRow);
      rowState.isGroupRow = isGroupRow;
    }

    if (rowState.groupLevel !== groupLevel) {
      if (isGroupRow) {
        zoneRow.element.dataset.groupLevel = String(groupLevel);
      } else {
        delete zoneRow.element.dataset.groupLevel;
      }
      rowState.groupLevel = groupLevel;
    }

    if (rowState.isTreeRow !== isTreeRow) {
      zoneRow.element.classList.toggle('hgrid__row--tree', isTreeRow);
      rowState.isTreeRow = isTreeRow;
    }

    if (rowState.treeLevel !== treeLevel) {
      if (isTreeRow) {
        zoneRow.element.dataset.treeLevel = String(treeLevel);
      } else {
        delete zoneRow.element.dataset.treeLevel;
      }
      rowState.treeLevel = treeLevel;
    }
  }

  private bindCell(
    cell: HTMLDivElement,
    cellState: CellRenderState,
    nextState: {
      isVisible: boolean;
      columnId: string;
      textContent: string;
      contentMode?: 'text' | 'html';
      htmlContent?: string;
      role?: string;
      left?: number;
      width?: number;
      isSelected?: boolean;
      isActive?: boolean;
      extraClassName?: string;
      titleText?: string;
      ariaLabel?: string;
      ariaRowIndex?: number;
      ariaColIndex?: number;
      cellId?: string;
    }
  ): void {
    const role = nextState.role ?? cellState.role;
    const isSelected = nextState.isSelected ?? false;
    const isActive = nextState.isActive ?? false;
    const extraClassName = nextState.extraClassName ?? '';
    const titleText = nextState.titleText ?? '';
    const ariaLabel = nextState.ariaLabel ?? '';
    const ariaRowIndex = nextState.ariaRowIndex ?? -1;
    const ariaColIndex = nextState.ariaColIndex ?? -1;
    const cellId = nextState.cellId ?? '';
    const contentMode = nextState.contentMode ?? 'text';
    const htmlContent = nextState.htmlContent ?? '';

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

    if (cellState.role !== role) {
      if (role.length > 0) {
        cell.setAttribute('role', role);
      } else {
        cell.removeAttribute('role');
      }
      cellState.role = role;
    }

    if (cellState.contentMode !== contentMode) {
      if (contentMode === 'html') {
        cell.innerHTML = htmlContent;
        cellState.htmlContent = htmlContent;
      } else {
        cell.textContent = nextState.textContent;
        cellState.htmlContent = '';
      }
      cellState.textContent = nextState.textContent;
      cellState.contentMode = contentMode;
    } else if (contentMode === 'html') {
      if (cellState.htmlContent !== htmlContent) {
        cell.innerHTML = htmlContent;
        cellState.htmlContent = htmlContent;
      }
      if (cellState.textContent !== nextState.textContent) {
        cellState.textContent = nextState.textContent;
      }
    } else {
      if (cellState.textContent !== nextState.textContent) {
        cell.textContent = nextState.textContent;
        cellState.textContent = nextState.textContent;
      }
      if (cellState.htmlContent.length > 0) {
        cellState.htmlContent = '';
      }
    }

    if (cellState.extraClassName !== extraClassName) {
      if (cellState.extraClassName.length > 0) {
        const previousClasses = cellState.extraClassName.split(' ');
        for (let classIndex = 0; classIndex < previousClasses.length; classIndex += 1) {
          const previousClassName = previousClasses[classIndex];
          if (previousClassName) {
            cell.classList.remove(previousClassName);
          }
        }
      }

      if (extraClassName.length > 0) {
        const nextClasses = extraClassName.split(' ');
        for (let classIndex = 0; classIndex < nextClasses.length; classIndex += 1) {
          const nextClassName = nextClasses[classIndex];
          if (nextClassName) {
            cell.classList.add(nextClassName);
          }
        }
      }

      cellState.extraClassName = extraClassName;
    }

    if (cellState.titleText !== titleText) {
      if (titleText.length > 0) {
        cell.title = titleText;
      } else {
        cell.removeAttribute('title');
      }
      cellState.titleText = titleText;
    }

    if (cellState.ariaLabel !== ariaLabel) {
      if (ariaLabel.length > 0) {
        cell.setAttribute('aria-label', ariaLabel);
      } else {
        cell.removeAttribute('aria-label');
      }
      cellState.ariaLabel = ariaLabel;
    }

    if (cellState.ariaRowIndex !== ariaRowIndex) {
      if (ariaRowIndex > 0) {
        cell.setAttribute('aria-rowindex', String(ariaRowIndex));
      } else {
        cell.removeAttribute('aria-rowindex');
      }
      cellState.ariaRowIndex = ariaRowIndex;
    }

    if (cellState.ariaColIndex !== ariaColIndex) {
      if (ariaColIndex > 0) {
        cell.setAttribute('aria-colindex', String(ariaColIndex));
      } else {
        cell.removeAttribute('aria-colindex');
      }
      cellState.ariaColIndex = ariaColIndex;
    }

    if (cellState.cellId !== cellId) {
      if (cellId.length > 0) {
        cell.id = cellId;
      } else {
        cell.removeAttribute('id');
      }
      cellState.cellId = cellId;
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

  private bindIndicatorCheckboxCell(
    cell: HTMLDivElement,
    cellState: CellRenderState,
    indicatorCell: IndicatorCellElements,
    columnId: string,
    rowIndex: number,
    globalColumnIndex: number,
    isGroupRow: boolean
  ): void {
    const rowIndicatorOptions = this.getResolvedRowIndicatorOptions();
    const isRowSelected = this.selectionModel.isRowSelected(rowIndex);
    const extraClassName = 'hgrid__cell--indicator hgrid__cell--indicator-checkbox';
    const isActive = this.selectionModel.isCellActive(rowIndex, globalColumnIndex);
    const cellId = isActive ? this.getAriaCellId(rowIndex, globalColumnIndex) : '';

    this.bindCell(cell, cellState, {
      isVisible: true,
      columnId,
      role: 'gridcell',
      textContent: '',
      ariaRowIndex: this.getAriaRowIndexForDataRow(rowIndex),
      ariaColIndex: globalColumnIndex + 1,
      cellId,
      isSelected: this.selectionModel.isCellSelected(rowIndex, globalColumnIndex),
      isActive,
      extraClassName,
      ariaLabel: isGroupRow ? '' : `Row ${rowIndex + 1} selection checkbox`
    });

    indicatorCell.checkbox.style.display = rowIndicatorOptions.showCheckbox && !isGroupRow ? '' : 'none';
    indicatorCell.checkbox.checked = isGroupRow ? false : isRowSelected;
    indicatorCell.checkbox.indeterminate = false;
    indicatorCell.checkbox.disabled = isGroupRow;
    indicatorCell.checkbox.setAttribute(
      'aria-label',
      isGroupRow ? this.localeText.groupingRow : this.localizeText(this.localeText.selectRow, { row: rowIndex + 1 })
    );
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
      let normalizedColumn = column;

      if (this.isIndicatorCheckboxColumnId(column.id)) {
        const fallbackWidth = Number.isFinite(column.width) ? column.width : DEFAULT_INDICATOR_CHECKBOX_WIDTH;
        const indicatorWidth = this.getResolvedIndicatorCheckboxColumnWidth(fallbackWidth);
        normalizedColumn = {
          ...column,
          pinned: 'left',
          width: indicatorWidth,
          minWidth: indicatorWidth,
          maxWidth: indicatorWidth
        };
      } else if (column.id === INDICATOR_ROW_NUMBER_COLUMN_ID) {
        const fallbackWidth = Number.isFinite(column.width) ? column.width : DEFAULT_INDICATOR_ROW_NUMBER_WIDTH;
        const indicatorWidth = this.resolveIndicatorColumnWidth(undefined, fallbackWidth);
        normalizedColumn = {
          ...column,
          pinned: 'left',
          width: indicatorWidth,
          minWidth: indicatorWidth,
          maxWidth: indicatorWidth
        };
      } else if (column.id === INDICATOR_STATUS_COLUMN_ID) {
        const fallbackWidth = Number.isFinite(column.width) ? column.width : DEFAULT_INDICATOR_STATUS_WIDTH;
        normalizedColumn = {
          ...column,
          pinned: 'left',
          width: this.resolveIndicatorColumnWidth(undefined, fallbackWidth)
        };
      } else if (column.id === STATE_COLUMN_ID) {
        const stateWidth = Number.isFinite(column.width) ? column.width : DEFAULT_STATE_COLUMN_WIDTH;
        normalizedColumn = {
          ...column,
          pinned: 'left',
          width: stateWidth
        };
      }

      if (normalizedColumn.pinned === 'left') {
        byZone.left.push(normalizedColumn);
      } else if (normalizedColumn.pinned === 'right') {
        byZone.right.push(normalizedColumn);
      } else {
        byZone.center.push(normalizedColumn);
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
    this.rowCheckboxAnchorRowIndex = nextSelection.activeCell ? nextSelection.activeCell.rowIndex : null;
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

  private sanitizeClipboardText(rawText: string): string {
    return rawText.replace(/\u0000/g, '').replace(/\r\n?/g, '\n');
  }

  private parseClipboardTsv(rawText: string): string[][] {
    const normalizedText = this.sanitizeClipboardText(rawText);
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

  private resolvePrimarySelectionRectangle(): SelectionRectangle | null {
    const bounds = this.getSelectionBounds();
    if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
      return null;
    }

    const selection = this.selectionModel.getSelection();
    const primaryRange = selection.cellRanges[0];
    if (primaryRange) {
      return {
        startRow: Math.max(0, Math.min(primaryRange.r1, primaryRange.r2)),
        endRow: Math.min(bounds.rowCount - 1, Math.max(primaryRange.r1, primaryRange.r2)),
        startCol: Math.max(0, Math.min(primaryRange.c1, primaryRange.c2)),
        endCol: Math.min(bounds.columnCount - 1, Math.max(primaryRange.c1, primaryRange.c2))
      };
    }

    const activeCell = selection.activeCell ?? this.getInitialActiveCell();
    if (!activeCell) {
      return null;
    }

    const clampedCell = this.clampSelectionCell(activeCell);
    return {
      startRow: clampedCell.rowIndex,
      endRow: clampedCell.rowIndex,
      startCol: clampedCell.colIndex,
      endCol: clampedCell.colIndex
    };
  }

  private readCellTextForClipboard(rowIndex: number, colIndex: number): string {
    const columnEntry = this.resolveColumnByGlobalIndex(colIndex);
    if (!columnEntry) {
      return '';
    }

    if (columnEntry.column.id === INDICATOR_ROW_NUMBER_COLUMN_ID) {
      return String(rowIndex + 1);
    }

    if (this.isIndicatorCheckboxColumnId(columnEntry.column.id)) {
      return this.selectionModel.isRowSelected(rowIndex) ? 'true' : 'false';
    }

    const dataIndex = this.options.rowModel.getDataIndex(rowIndex);
    if (dataIndex < 0) {
      return '';
    }

    const row = this.resolveRow(dataIndex);
    return formatColumnValue(columnEntry.column, row, this.columnValueFormatContext ?? undefined);
  }

  private buildSelectionTsv(): string | null {
    const selectionRectangle = this.resolvePrimarySelectionRectangle();
    if (!selectionRectangle) {
      return null;
    }

    const lines: string[] = [];
    for (let rowIndex = selectionRectangle.startRow; rowIndex <= selectionRectangle.endRow; rowIndex += 1) {
      const cells: string[] = [];
      for (let colIndex = selectionRectangle.startCol; colIndex <= selectionRectangle.endCol; colIndex += 1) {
        cells.push(this.readCellTextForClipboard(rowIndex, colIndex));
      }
      lines.push(cells.join('\t'));
    }

    return lines.join('\n');
  }

  private writeTextToClipboard(text: string): boolean {
    const navigatorClipboard = navigator.clipboard;
    if (!navigatorClipboard || typeof navigatorClipboard.writeText !== 'function') {
      return false;
    }

    void navigatorClipboard.writeText(text).catch(() => undefined);
    return true;
  }

  private resolvePasteValue(column: ColumnDef, row: GridRowData, dataIndex: number, inputText: string): unknown {
    const normalizedValue = this.normalizeEditorInputValue(column, inputText);
    if (!column.valueSetter) {
      return normalizedValue;
    }

    const rowForSetter = this.options.dataProvider.getRow ? this.options.dataProvider.getRow(dataIndex) ?? row : row;
    column.valueSetter(rowForSetter, normalizedValue, column);
    return getColumnValue(column, rowForSetter);
  }

  private applyClipboardMatrix(matrix: string[][]): ClipboardCellUpdate[] {
    const selectionRectangle = this.resolvePrimarySelectionRectangle();
    if (!selectionRectangle || matrix.length === 0) {
      return [];
    }

    let sourceColumnCount = 0;
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
      sourceColumnCount = Math.max(sourceColumnCount, matrix[rowIndex].length);
    }
    if (sourceColumnCount <= 0) {
      return [];
    }

    const selectedRowCount = selectionRectangle.endRow - selectionRectangle.startRow + 1;
    const selectedColCount = selectionRectangle.endCol - selectionRectangle.startCol + 1;
    const shouldFillSelection = matrix.length === 1 && sourceColumnCount === 1 && (selectedRowCount > 1 || selectedColCount > 1);
    const destinationRowCount = shouldFillSelection ? selectedRowCount : matrix.length;
    const destinationColCount = shouldFillSelection ? selectedColCount : sourceColumnCount;
    const selectionBounds = this.getSelectionBounds();

    const transactions: DataTransaction[] = [];
    const updates: ClipboardCellUpdate[] = [];

    for (let rowOffset = 0; rowOffset < destinationRowCount; rowOffset += 1) {
      const rowIndex = selectionRectangle.startRow + rowOffset;
      if (rowIndex < 0 || rowIndex >= selectionBounds.rowCount) {
        break;
      }

      const dataIndex = this.options.rowModel.getDataIndex(rowIndex);
      if (dataIndex < 0) {
        continue;
      }

      const row = this.resolveRow(dataIndex);
      if (isGroupRowData(row)) {
        continue;
      }

      for (let colOffset = 0; colOffset < destinationColCount; colOffset += 1) {
        const colIndex = selectionRectangle.startCol + colOffset;
        if (colIndex < 0 || colIndex >= selectionBounds.columnCount) {
          break;
        }

        const columnEntry = this.resolveColumnByGlobalIndex(colIndex);
        if (!columnEntry) {
          continue;
        }

        const column = columnEntry.column;
        if (!column.editable) {
          continue;
        }

        const sourceRow = shouldFillSelection ? 0 : rowOffset;
        const sourceCol = shouldFillSelection ? 0 : colOffset;
        const inputText = matrix[sourceRow]?.[sourceCol];
        if (typeof inputText !== 'string') {
          continue;
        }

        const previousValue = getColumnValue(column, row);
        const nextValue = this.resolvePasteValue(column, row, dataIndex, inputText);
        if (Object.is(previousValue, nextValue)) {
          continue;
        }

        transactions.push({
          type: 'updateCell',
          index: dataIndex,
          columnId: column.id,
          value: nextValue
        });
        updates.push({
          rowIndex,
          dataIndex,
          columnId: column.id,
          previousValue,
          value: nextValue
        });
      }
    }

    if (transactions.length === 0) {
      return [];
    }

    this.options.dataProvider.applyTransactions(transactions);
    this.markDataDirty();
    this.scheduleRender();

    return updates;
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
    if (isGroupRowData(row)) {
      return false;
    }
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
          resolvedMessage = error instanceof Error && error.message ? error.message : this.localeText.validationFailed;
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

    this.eventBus.emit(
      'editCommit',
      this.createEditCommitEventPayload(
        {
          rowIndex: currentSession.rowIndex,
          dataIndex: currentSession.dataIndex,
          columnId: currentSession.column.id,
          previousValue: currentSession.originalValue,
          value: committedValue
        },
        'editor'
      )
    );

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
    const hiddenColumns = this.leafSpanHiddenColumnsByZone.center;
    let slotIndex = 0;

    for (let colIndex = horizontalWindow.start; colIndex < horizontalWindow.end; colIndex += 1) {
      const column = centerColumns[colIndex];
      const headerCell = this.centerHeaderCellPool[slotIndex];
      if (!headerCell) {
        break;
      }

      if (hiddenColumns.has(column.id)) {
        this.bindCell(headerCell, this.centerHeaderCellStates[slotIndex], {
          isVisible: false,
          columnId: '',
          textContent: ''
        });
        slotIndex += 1;
        continue;
      }

      this.bindCell(headerCell, this.centerHeaderCellStates[slotIndex], {
        isVisible: true,
        columnId: column.id,
        role: 'columnheader',
        textContent: column.header,
        ariaRowIndex: this.headerGroupRowCount + 1,
        left: this.centerColumnLeft[colIndex],
        width: column.width,
        ariaColIndex: this.getZoneColumnStartIndex('center') + colIndex + 1
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

  private handleHeaderPointerMove = (event: PointerEvent): void => {
    if (this.columnResizeSession || this.columnReorderSession) {
      return;
    }

    const resizeHit = this.hitTestHeaderResize(event.clientX, event.clientY, event.target as HTMLElement | null);
    this.setHeaderResizeHoverCell(resizeHit?.headerCell ?? null);
  };

  private handleHeaderPointerLeave = (): void => {
    if (this.columnResizeSession || this.columnReorderSession) {
      return;
    }

    this.setHeaderResizeHoverCell(null);
  };

  private hitTestHeaderResize(clientX: number, clientY: number, target: HTMLElement | null): HeaderResizeHit | null {
    if (!target) {
      return null;
    }

    const headerCell = target.closest('.hgrid__header-cell--leaf') as HTMLDivElement | null;
    if (!headerCell || !this.headerElement.contains(headerCell)) {
      return null;
    }

    if (headerCell.style.display === 'none') {
      return null;
    }

    const cellRect = headerCell.getBoundingClientRect();
    if (clientY < cellRect.top || clientY > cellRect.bottom) {
      return null;
    }

    if (clientX < cellRect.left || clientX > cellRect.right + HEADER_RESIZE_HIT_SLOP_PX) {
      return null;
    }

    if (cellRect.right - clientX > HEADER_RESIZE_HIT_SLOP_PX) {
      return null;
    }

    const columnId = headerCell.dataset.columnId;
    if (!columnId) {
      return null;
    }

    const column = this.findVisibleColumnById(columnId);
    if (!column) {
      return null;
    }

    return {
      columnId,
      column,
      headerCell
    };
  }

  private findVisibleColumnById(columnId: string): ColumnDef | null {
    for (let columnIndex = 0; columnIndex < this.options.columns.length; columnIndex += 1) {
      const column = this.options.columns[columnIndex];
      if (column.id === columnId) {
        return column;
      }
    }

    return null;
  }

  private resolveColumnWidthBounds(column: ColumnDef): { minWidth: number; maxWidth: number } {
    const rawMinWidth = Number(column.minWidth);
    const minWidth = Number.isFinite(rawMinWidth) ? Math.max(1, rawMinWidth) : 1;
    const rawMaxWidth = Number(column.maxWidth);
    const maxWidth = Number.isFinite(rawMaxWidth) ? Math.max(minWidth, rawMaxWidth) : Number.POSITIVE_INFINITY;

    return {
      minWidth,
      maxWidth
    };
  }

  private clampColumnWidth(width: number, minWidth: number, maxWidth: number): number {
    return Math.min(maxWidth, Math.max(minWidth, width));
  }

  private setHeaderResizeHoverCell(nextCell: HTMLDivElement | null): void {
    if (this.headerResizeHoverCell === nextCell) {
      return;
    }

    if (this.headerResizeHoverCell) {
      this.headerResizeHoverCell.classList.remove('hgrid__header-cell--resize-hover');
    }

    this.headerResizeHoverCell = nextCell;

    if (this.headerResizeHoverCell) {
      this.headerResizeHoverCell.classList.add('hgrid__header-cell--resize-hover');
    }
  }

  private resolveHeaderCellFromTarget(target: HTMLElement | null): HTMLDivElement | null {
    if (!target) {
      return null;
    }

    const headerCell = target.closest('.hgrid__header-cell--leaf') as HTMLDivElement | null;
    if (!headerCell || !this.headerElement.contains(headerCell)) {
      return null;
    }

    if (headerCell.style.display === 'none') {
      return null;
    }

    const columnId = headerCell.dataset.columnId;
    if (!columnId) {
      return null;
    }

    return headerCell;
  }

  private getVisibleColumnIndexById(columnId: string): number {
    for (let columnIndex = 0; columnIndex < this.options.columns.length; columnIndex += 1) {
      if (this.options.columns[columnIndex].id === columnId) {
        return columnIndex;
      }
    }

    return -1;
  }

  private findHeaderCellAtPoint(clientX: number, clientY: number): HTMLDivElement | null {
    if (typeof document.elementFromPoint === 'function') {
      const elementAtPoint = document.elementFromPoint(clientX, clientY);
      if (elementAtPoint instanceof HTMLElement) {
        const resolvedByPoint = this.resolveHeaderCellFromTarget(elementAtPoint);
        if (resolvedByPoint) {
          return resolvedByPoint;
        }
      }
    }

    const headerCells = this.headerElement.querySelectorAll('.hgrid__header-cell--leaf');
    for (let cellIndex = 0; cellIndex < headerCells.length; cellIndex += 1) {
      const headerCell = headerCells[cellIndex] as HTMLDivElement;
      if (headerCell.style.display === 'none') {
        continue;
      }

      const cellRect = headerCell.getBoundingClientRect();
      if (clientX >= cellRect.left && clientX <= cellRect.right && clientY >= cellRect.top && clientY <= cellRect.bottom) {
        return headerCell;
      }
    }

    return null;
  }

  private resolveHeaderDropTarget(clientX: number, clientY: number, target: EventTarget | null): HeaderDropTarget | null {
    let headerCell: HTMLDivElement | null = null;
    if (target instanceof HTMLElement) {
      headerCell = this.resolveHeaderCellFromTarget(target);
    }

    if (!headerCell) {
      headerCell = this.findHeaderCellAtPoint(clientX, clientY);
    }

    if (!headerCell) {
      return null;
    }

    const columnId = headerCell.dataset.columnId;
    if (!columnId) {
      return null;
    }

    const columnIndex = this.getVisibleColumnIndexById(columnId);
    if (columnIndex === -1) {
      return null;
    }

    const cellRect = headerCell.getBoundingClientRect();
    const dropAfter = clientX > cellRect.left + cellRect.width * 0.5;
    return {
      dropIndex: columnIndex + (dropAfter ? 1 : 0),
      targetColumnId: columnId,
      indicatorClientX: dropAfter ? cellRect.right : cellRect.left
    };
  }

  private showHeaderDropIndicator(indicatorClientX: number): void {
    const headerRect = this.headerElement.getBoundingClientRect();
    const clampedLeft = Math.max(0, Math.min(headerRect.width, indicatorClientX - headerRect.left));
    this.headerDropIndicatorElement.style.display = 'block';
    this.headerDropIndicatorElement.style.transform = `translateX(${clampedLeft}px)`;
  }

  private hideHeaderDropIndicator(): void {
    this.headerDropIndicatorElement.style.display = 'none';
  }

  private normalizeDropIndexForSource(dropIndex: number, sourceIndex: number): number {
    if (dropIndex > sourceIndex) {
      return dropIndex - 1;
    }

    return dropIndex;
  }

  private buildReorderedColumnOrder(sourceIndex: number, targetIndex: number): string[] {
    const nextOrder = this.options.columns.map((column) => column.id);
    if (sourceIndex < 0 || sourceIndex >= nextOrder.length) {
      return nextOrder;
    }

    const [movedColumnId] = nextOrder.splice(sourceIndex, 1);
    const boundedTargetIndex = Math.max(0, Math.min(nextOrder.length, targetIndex));
    nextOrder.splice(boundedTargetIndex, 0, movedColumnId);
    return nextOrder;
  }

  private startColumnReorderSession(
    pointerId: number,
    clientX: number,
    clientY: number,
    sourceHeaderCell: HTMLDivElement
  ): void {
    const sourceColumnId = sourceHeaderCell.dataset.columnId;
    if (!sourceColumnId) {
      return;
    }

    const sourceIndex = this.getVisibleColumnIndexById(sourceColumnId);
    if (sourceIndex === -1) {
      return;
    }

    this.teardownColumnReorderSession();
    this.teardownPointerSelectionSession();
    this.setHeaderResizeHoverCell(null);

    this.columnReorderSession = {
      pointerId,
      sourceColumnId,
      sourceIndex,
      pendingClientX: clientX,
      pendingClientY: clientY,
      pendingTarget: sourceHeaderCell,
      currentDropIndex: sourceIndex + 1,
      currentTargetColumnId: sourceColumnId
    };

    this.headerReorderDraggingCell = sourceHeaderCell;
    this.headerReorderDraggingCell.classList.add('hgrid__header-cell--dragging');
    this.rootElement.classList.add('hgrid--column-reordering');

    const initialDropTarget = this.resolveHeaderDropTarget(clientX, clientY, sourceHeaderCell);
    if (initialDropTarget) {
      this.columnReorderSession.currentDropIndex = initialDropTarget.dropIndex;
      this.columnReorderSession.currentTargetColumnId = initialDropTarget.targetColumnId;
      this.showHeaderDropIndicator(initialDropTarget.indicatorClientX);
    } else {
      this.hideHeaderDropIndicator();
    }

    window.addEventListener('pointermove', this.handleWindowColumnReorderMove, { passive: true });
    window.addEventListener('pointerup', this.handleWindowColumnReorderEnd);
    window.addEventListener('pointercancel', this.handleWindowColumnReorderEnd);
  }

  private teardownColumnReorderSession(): void {
    if (this.columnReorderFrameId !== null) {
      cancelAnimationFrame(this.columnReorderFrameId);
      this.columnReorderFrameId = null;
    }

    window.removeEventListener('pointermove', this.handleWindowColumnReorderMove);
    window.removeEventListener('pointerup', this.handleWindowColumnReorderEnd);
    window.removeEventListener('pointercancel', this.handleWindowColumnReorderEnd);

    if (this.headerReorderDraggingCell) {
      this.headerReorderDraggingCell.classList.remove('hgrid__header-cell--dragging');
      this.headerReorderDraggingCell = null;
    }

    this.hideHeaderDropIndicator();
    this.rootElement.classList.remove('hgrid--column-reordering');
    this.columnReorderSession = null;
  }

  private handleWindowColumnReorderMove = (event: PointerEvent): void => {
    const session = this.columnReorderSession;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    session.pendingClientX = event.clientX;
    session.pendingClientY = event.clientY;
    session.pendingTarget = event.target;

    if (this.columnReorderFrameId !== null) {
      return;
    }

    this.columnReorderFrameId = requestAnimationFrame(() => {
      this.columnReorderFrameId = null;
      this.flushColumnReorderFrame();
    });
  };

  private handleWindowColumnReorderEnd = (event: PointerEvent): void => {
    const session = this.columnReorderSession;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    session.pendingClientX = event.clientX;
    session.pendingClientY = event.clientY;
    session.pendingTarget = event.target;

    if (this.columnReorderFrameId !== null) {
      cancelAnimationFrame(this.columnReorderFrameId);
      this.columnReorderFrameId = null;
    }

    this.flushColumnReorderFrame();
    this.commitColumnReorderSession();
    this.teardownColumnReorderSession();
  };

  private flushColumnReorderFrame(): void {
    const session = this.columnReorderSession;
    if (!session) {
      return;
    }

    const dropTarget = this.resolveHeaderDropTarget(session.pendingClientX, session.pendingClientY, session.pendingTarget);
    if (!dropTarget) {
      this.hideHeaderDropIndicator();
      return;
    }

    session.currentDropIndex = dropTarget.dropIndex;
    session.currentTargetColumnId = dropTarget.targetColumnId;
    this.showHeaderDropIndicator(dropTarget.indicatorClientX);
  }

  private commitColumnReorderSession(): void {
    const session = this.columnReorderSession;
    if (!session) {
      return;
    }

    const normalizedTargetIndex = this.normalizeDropIndexForSource(session.currentDropIndex, session.sourceIndex);
    if (normalizedTargetIndex === session.sourceIndex) {
      return;
    }

    const nextOrder = this.buildReorderedColumnOrder(session.sourceIndex, normalizedTargetIndex);
    this.eventBus.emit('columnReorder', {
      sourceColumnId: session.sourceColumnId,
      targetColumnId: session.currentTargetColumnId,
      fromIndex: session.sourceIndex,
      toIndex: normalizedTargetIndex,
      columnOrder: nextOrder
    });
  }

  private startColumnResizeSession(pointerId: number, clientX: number, resizeHit: HeaderResizeHit): void {
    this.teardownColumnResizeSession();
    this.teardownColumnReorderSession();
    this.teardownPointerSelectionSession();

    const { minWidth, maxWidth } = this.resolveColumnWidthBounds(resizeHit.column);
    const startWidth = this.clampColumnWidth(resizeHit.column.width, minWidth, maxWidth);
    this.columnResizeSession = {
      pointerId,
      columnId: resizeHit.columnId,
      startClientX: clientX,
      startWidth,
      minWidth,
      maxWidth,
      pendingClientX: clientX,
      lastEmittedWidth: startWidth
    };

    this.rootElement.classList.add('hgrid--column-resizing');
    this.setHeaderResizeHoverCell(null);
    this.eventBus.emit('columnResize', {
      columnId: resizeHit.columnId,
      width: startWidth,
      phase: 'start'
    });

    window.addEventListener('pointermove', this.handleWindowColumnResizeMove, { passive: true });
    window.addEventListener('pointerup', this.handleWindowColumnResizeEnd);
    window.addEventListener('pointercancel', this.handleWindowColumnResizeEnd);
  }

  private teardownColumnResizeSession(): void {
    this.setHeaderResizeHoverCell(null);

    if (this.columnResizeFrameId !== null) {
      cancelAnimationFrame(this.columnResizeFrameId);
      this.columnResizeFrameId = null;
    }

    window.removeEventListener('pointermove', this.handleWindowColumnResizeMove);
    window.removeEventListener('pointerup', this.handleWindowColumnResizeEnd);
    window.removeEventListener('pointercancel', this.handleWindowColumnResizeEnd);

    if (!this.columnResizeSession) {
      this.rootElement.classList.remove('hgrid--column-resizing');
      return;
    }

    this.columnResizeSession = null;
    this.rootElement.classList.remove('hgrid--column-resizing');
  }

  private handleWindowColumnResizeMove = (event: PointerEvent): void => {
    const session = this.columnResizeSession;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    session.pendingClientX = event.clientX;

    if (this.columnResizeFrameId !== null) {
      return;
    }

    this.columnResizeFrameId = requestAnimationFrame(() => {
      this.columnResizeFrameId = null;
      this.flushColumnResizeFrame('move');
    });
  };

  private handleWindowColumnResizeEnd = (event: PointerEvent): void => {
    const session = this.columnResizeSession;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }

    session.pendingClientX = event.clientX;

    if (this.columnResizeFrameId !== null) {
      cancelAnimationFrame(this.columnResizeFrameId);
      this.columnResizeFrameId = null;
    }

    this.flushColumnResizeFrame('end');
    this.teardownColumnResizeSession();
  };

  private flushColumnResizeFrame(phase: 'move' | 'end'): void {
    const session = this.columnResizeSession;
    if (!session) {
      return;
    }

    const deltaX = session.pendingClientX - session.startClientX;
    const nextWidth = this.clampColumnWidth(session.startWidth + deltaX, session.minWidth, session.maxWidth);
    if (phase === 'move' && nextWidth === session.lastEmittedWidth) {
      return;
    }

    session.lastEmittedWidth = nextWidth;
    this.eventBus.emit('columnResize', {
      columnId: session.columnId,
      width: nextWidth,
      phase
    });
  }

  private isIndicatorControlTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return Boolean(target.closest('.hgrid__indicator-checkbox, .hgrid__indicator-checkall'));
  }

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

    if (this.isIndicatorControlTarget(event.target)) {
      return;
    }

    const resizeHit = this.hitTestHeaderResize(event.clientX, event.clientY, event.target as HTMLElement | null);
    if (resizeHit) {
      this.startColumnResizeSession(event.pointerId, event.clientX, resizeHit);
      event.preventDefault();
      return;
    }

    const headerCell = this.resolveHeaderCellFromTarget(event.target as HTMLElement | null);
    if (headerCell && this.options.columns.length > 1) {
      this.startColumnReorderSession(event.pointerId, event.clientX, event.clientY, headerCell);
      event.preventDefault();
      return;
    }

    const hit = this.hitTestCellAtPoint(event.clientX, event.clientY);
    if (!hit) {
      return;
    }

    if (this.isIndicatorCheckboxColumnId(hit.column.id)) {
      this.rootElement.focus();
      this.toggleRowSelectionByIndicator(
        hit.rowIndex,
        {
          isShift: event.shiftKey,
          isMeta: event.metaKey || event.ctrlKey
        },
        'pointer'
      );
      this.eventBus.emit('cellClick', {
        rowIndex: hit.rowIndex,
        dataIndex: hit.dataIndex,
        columnId: hit.column.id,
        value: this.selectionModel.isRowSelected(hit.rowIndex)
      });
      event.preventDefault();
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

  private handleRootClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const checkAllElement = target.closest('.hgrid__indicator-checkall');
    if (checkAllElement instanceof HTMLInputElement) {
      this.rootElement.focus();
      this.toggleCheckAllByIndicator(checkAllElement.checked, 'pointer');
      event.preventDefault();
      return;
    }

    const rowCheckboxElement = target.closest('.hgrid__indicator-checkbox');
    if (!(rowCheckboxElement instanceof HTMLInputElement)) {
      return;
    }

    const rowElement = rowCheckboxElement.closest('.hgrid__row');
    if (!(rowElement instanceof HTMLDivElement)) {
      return;
    }

    const rowIndex = Number.parseInt(rowElement.dataset.rowIndex ?? '-1', 10);
    const dataIndex = Number.parseInt(rowElement.dataset.dataIndex ?? '-1', 10);
    if (!Number.isFinite(rowIndex) || rowIndex < 0 || !Number.isFinite(dataIndex) || dataIndex < 0) {
      return;
    }

    this.rootElement.focus();
    this.toggleRowSelectionByIndicator(
      rowIndex,
      {
        isShift: event.shiftKey,
        isMeta: event.metaKey || event.ctrlKey
      },
      'pointer'
    );
    const indicatorCell = rowCheckboxElement.closest('.hgrid__cell');
    const indicatorColumnId =
      indicatorCell instanceof HTMLDivElement && indicatorCell.dataset.columnId
        ? indicatorCell.dataset.columnId
        : INDICATOR_CHECKBOX_COLUMN_ID;
    this.eventBus.emit('cellClick', {
      rowIndex,
      dataIndex,
      columnId: indicatorColumnId,
      value: rowCheckboxElement.checked
    });
    event.preventDefault();
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

  private getEditableGlobalColumnIndexes(): number[] {
    const editableIndexes: number[] = [];

    for (let colIndex = 0; colIndex < this.columnsByZone.left.length; colIndex += 1) {
      if (this.columnsByZone.left[colIndex].editable) {
        editableIndexes.push(colIndex);
      }
    }

    const centerOffset = this.columnsByZone.left.length;
    for (let colIndex = 0; colIndex < this.columnsByZone.center.length; colIndex += 1) {
      if (this.columnsByZone.center[colIndex].editable) {
        editableIndexes.push(centerOffset + colIndex);
      }
    }

    const rightOffset = this.columnsByZone.left.length + this.columnsByZone.center.length;
    for (let colIndex = 0; colIndex < this.columnsByZone.right.length; colIndex += 1) {
      if (this.columnsByZone.right[colIndex].editable) {
        editableIndexes.push(rightOffset + colIndex);
      }
    }

    return editableIndexes;
  }

  private findNextEditableColumnIndex(
    editableColumnIndexes: number[],
    currentColIndex: number,
    direction: 1 | -1
  ): number {
    if (direction > 0) {
      for (let index = 0; index < editableColumnIndexes.length; index += 1) {
        const candidate = editableColumnIndexes[index];
        if (candidate > currentColIndex) {
          return candidate;
        }
      }
      return -1;
    }

    for (let index = editableColumnIndexes.length - 1; index >= 0; index -= 1) {
      const candidate = editableColumnIndexes[index];
      if (candidate < currentColIndex) {
        return candidate;
      }
    }

    return -1;
  }

  private isEditableRowIndex(rowIndex: number): boolean {
    const rowCount = this.options.rowModel.getViewRowCount();
    if (rowIndex < 0 || rowIndex >= rowCount) {
      return false;
    }

    const dataIndex = this.options.rowModel.getDataIndex(rowIndex);
    if (dataIndex < 0) {
      return false;
    }

    const row = this.resolveRow(dataIndex);
    return !isGroupRowData(row);
  }

  private resolveNextEditableCellByTab(currentCell: SelectionCellPosition, direction: 1 | -1): SelectionCellPosition | null {
    const bounds = this.getSelectionBounds();
    if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
      return null;
    }

    const editableColumnIndexes = this.getEditableGlobalColumnIndexes();
    if (editableColumnIndexes.length === 0) {
      return null;
    }

    if (direction > 0) {
      let rowIndex = currentCell.rowIndex;
      let colIndex = currentCell.colIndex;

      while (rowIndex < bounds.rowCount) {
        if (this.isEditableRowIndex(rowIndex)) {
          const nextColIndex = this.findNextEditableColumnIndex(editableColumnIndexes, colIndex, 1);
          if (nextColIndex >= 0) {
            return {
              rowIndex,
              colIndex: nextColIndex
            };
          }
        }

        rowIndex += 1;
        colIndex = -1;
      }

      return null;
    }

    let rowIndex = currentCell.rowIndex;
    let colIndex = currentCell.colIndex;
    while (rowIndex >= 0) {
      if (this.isEditableRowIndex(rowIndex)) {
        const nextColIndex = this.findNextEditableColumnIndex(editableColumnIndexes, colIndex, -1);
        if (nextColIndex >= 0) {
          return {
            rowIndex,
            colIndex: nextColIndex
          };
        }
      }

      rowIndex -= 1;
      colIndex = bounds.columnCount;
    }

    return null;
  }

  private resolveNextCellByTab(activeCell: SelectionCellPosition, reverse: boolean): SelectionCellPosition | null {
    const bounds = this.getSelectionBounds();
    if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
      return null;
    }

    let nextRow = activeCell.rowIndex;
    let nextCol = activeCell.colIndex;

    if (reverse) {
      if (nextCol > 0) {
        nextCol -= 1;
      } else if (nextRow > 0) {
        nextRow -= 1;
        nextCol = bounds.columnCount - 1;
      } else {
        return null;
      }
    } else if (nextCol < bounds.columnCount - 1) {
      nextCol += 1;
    } else if (nextRow < bounds.rowCount - 1) {
      nextRow += 1;
      nextCol = 0;
    } else {
      return null;
    }

    return {
      rowIndex: nextRow,
      colIndex: nextCol
    };
  }

  private handleKeyboardSelectAllShortcut(event: KeyboardEvent): boolean {
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;
    if (!isCtrlOrMeta || event.altKey) {
      return false;
    }

    if (event.key.toLowerCase() !== 'a') {
      return false;
    }

    const bounds = this.getSelectionBounds();
    if (bounds.rowCount <= 0 || bounds.columnCount <= 0) {
      event.preventDefault();
      return true;
    }

    const currentSelection = this.selectionModel.getSelection();
    const activeCell = currentSelection.activeCell ?? this.getInitialActiveCell() ?? { rowIndex: 0, colIndex: 0 };
    const hasSelectionChanged = this.selectionModel.setSelection(
      {
        activeCell,
        cellRanges: [
          {
            r1: 0,
            c1: 0,
            r2: bounds.rowCount - 1,
            c2: bounds.columnCount - 1
          }
        ],
        rowRanges: []
      },
      bounds,
      this.resolveRowKeyByRowIndex
    );
    if (hasSelectionChanged) {
      this.keyboardRangeAnchor = { ...activeCell };
      this.commitSelectionChange('keyboard');
    }

    event.preventDefault();
    return true;
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

    if (this.handleClipboardCopyShortcut(event)) {
      return;
    }

    if (this.handleKeyboardSelectAllShortcut(event)) {
      return;
    }

    if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
      const currentSelection = this.selectionModel.getSelection();
      const activeCell = currentSelection.activeCell ?? this.getInitialActiveCell();
      if (!activeCell) {
        return;
      }

      const activeColumn = this.resolveColumnByGlobalIndex(activeCell.colIndex);
      if (!activeColumn || !this.isIndicatorCheckboxColumnId(activeColumn.column.id)) {
        return;
      }

      this.toggleRowSelectionByIndicator(
        activeCell.rowIndex,
        {
          isShift: event.shiftKey,
          isMeta: event.ctrlKey || event.metaKey
        },
        'keyboard'
      );
      event.preventDefault();
      return;
    }

    if (event.key === 'Enter' || event.key === 'F2') {
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

    if (event.key === 'Tab') {
      const nextCell = this.resolveNextCellByTab(activeCell, event.shiftKey);
      if (!nextCell) {
        return;
      }

      const hasSelectionChanged = this.applyKeyboardSelection(nextCell, false);
      const hasScrolled = this.ensureSelectionCellVisible(nextCell);

      if (hasSelectionChanged) {
        this.commitSelectionChange('keyboard');
      }

      if (hasScrolled) {
        this.markScrollDirty();
        this.scheduleRender();
      }

      event.preventDefault();
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

  private handleClipboardCopyShortcut(event: KeyboardEvent): boolean {
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;
    if (!isCtrlOrMeta || event.altKey) {
      return false;
    }

    if (event.key.toLowerCase() !== 'c') {
      return false;
    }

    const selectionTsv = this.buildSelectionTsv();
    if (selectionTsv === null) {
      return false;
    }

    if (!this.writeTextToClipboard(selectionTsv)) {
      return false;
    }

    event.preventDefault();
    return true;
  }

  private handleRootCopy = (event: ClipboardEvent): void => {
    if (event.defaultPrevented || this.editSession) {
      return;
    }

    const selectionTsv = this.buildSelectionTsv();
    if (selectionTsv === null) {
      return;
    }

    if (event.clipboardData) {
      event.clipboardData.setData('text/plain', selectionTsv);
      event.preventDefault();
      return;
    }

    if (this.writeTextToClipboard(selectionTsv)) {
      event.preventDefault();
    }
  };

  private handleRootPaste = (event: ClipboardEvent): void => {
    if (event.defaultPrevented || this.editSession) {
      return;
    }

    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }

    const plainText = clipboardData.getData('text/plain');
    if (typeof plainText !== 'string' || plainText.length === 0) {
      return;
    }

    const matrix = this.parseClipboardTsv(plainText);
    const updates = this.applyClipboardMatrix(matrix);
    if (updates.length === 0) {
      return;
    }

    const firstUpdate = updates[0];
    this.eventBus.emit(
      'editCommit',
      this.createEditCommitEventPayload(
        {
          rowIndex: firstUpdate.rowIndex,
          dataIndex: firstUpdate.dataIndex,
          columnId: firstUpdate.columnId,
          previousValue: firstUpdate.previousValue,
          value: firstUpdate.value
        },
        'clipboard'
      )
    );
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

    if (event.key === 'Tab') {
      event.preventDefault();
      void this.commitEditingWithTabNavigation(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.stopEditing('escape');
    }
  };

  private async commitEditingWithTabNavigation(direction: 1 | -1): Promise<void> {
    const currentSession = this.editSession;
    if (!currentSession || this.isEditValidationPending) {
      return;
    }

    const currentCell: SelectionCellPosition = {
      rowIndex: currentSession.rowIndex,
      colIndex: currentSession.colIndex
    };

    await this.commitEditing('enter');

    if (this.editSession) {
      return;
    }

    const nextCell = this.resolveNextEditableCellByTab(currentCell, direction);
    if (!nextCell) {
      this.rootElement.focus();
      return;
    }

    const hasSelectionChanged = this.applyKeyboardSelection(nextCell, false);
    const hasScrolled = this.ensureSelectionCellVisible(nextCell);

    if (hasSelectionChanged) {
      this.commitSelectionChange('keyboard');
    }

    if (hasScrolled) {
      this.markScrollDirty();
      this.scheduleRender();
      requestAnimationFrame(() => {
        if (!this.editSession) {
          this.startEditingAtCell(nextCell.rowIndex, nextCell.colIndex);
        }
      });
      return;
    }

    this.startEditingAtCell(nextCell.rowIndex, nextCell.colIndex);
  }

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

  private resolveGroupRowColumnId(row: GridRowData): string | null {
    const value = row[GROUP_ROW_COLUMN_ID_FIELD];
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }

    return value;
  }

  private resolveGroupRowExpanded(row: GridRowData): boolean {
    return row[GROUP_ROW_EXPANDED_FIELD] === true;
  }

  private resolveTreeRowColumnId(row: GridRowData): string | null {
    const value = row[TREE_ROW_TREE_COLUMN_ID_FIELD];
    if (typeof value !== 'string' || value.length === 0) {
      return null;
    }

    return value;
  }

  private resolveTreeRowExpanded(row: GridRowData): boolean {
    return row[TREE_ROW_EXPANDED_FIELD] === true;
  }

  private resolveTreeRowHasChildren(row: GridRowData): boolean {
    return row[TREE_ROW_HAS_CHILDREN_FIELD] === true;
  }

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
