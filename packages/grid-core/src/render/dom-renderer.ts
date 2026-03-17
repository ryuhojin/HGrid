import { EventBus } from '../core/event-bus';
import type { GridCustomToolPanelActionPort, GridRendererPort, GridRendererRuntimeOptions } from '../core/grid-internal-contracts';
import type {
  ColumnGroupDef,
  ColumnDef,
  EditValidationIssue,
  GroupAggregationDef,
  GroupAggregationType,
  GridBuiltInBodyMenuActionId,
  GridColumnLayout,
  GridColumnLayoutPreset,
  ColumnFilterMode,
  ColumnPinPosition,
  GridCustomToolPanelDefinition,
  GridBuiltInColumnMenuActionId,
  GridEditActionBarActionContext,
  GridEditActionBarActionResult,
  GridColumnMenuContext,
  GridContextMenuContext,
  GridBuiltInStatusBarItemId,
  GridStatusBarCustomItemDefinition,
  GridStatusBarCustomItemRenderContext,
  GridStatusBarItemAlign,
  GridStatusBarItemTone,
  GridLocaleText,
  GridMenuItem,
  GridMenuOpenSource,
  GridOptions,
  GridRangeHandleMode,
  GridSideBarOptions,
  GridSetFilterReason,
  GridSetFilterValueOption,
  GridState,
  GroupModelItem,
  GroupingMode,
  PivotModelItem,
  PivotValueDef,
  PivotingMode,
  GridToolPanelId,
  RowHeightMode,
  RowIndicatorCheckAllScope,
  RowIndicatorOptions,
  RowStatusTone,
  ScrollbarPolicy,
  StateColumnRenderResult,
  UnsafeHtmlSanitizeContext
} from '../core/grid-options';
import {
  formatColumnValue,
  getColumnValue,
  createColumnValueFormatContext,
  type ResolvedColumnDef,
  type ColumnValueFormatContext
} from '../data/column-model';
import {
  formatGridLocaleText,
  localizeCheckAllScope,
  normalizeGridLocale,
  resolveGridLocaleText
} from '../core/grid-locale-text';
import type { DataTransaction, GridRowData, HistoryCellUpdate, RowKey } from '../data/data-provider';
import { RemoteDataProvider } from '../data/remote-data-provider';
import {
  GROUP_ROW_COLUMN_ID_FIELD,
  GROUP_ROW_EXPANDED_FIELD,
  getGroupRowLevel,
  isGroupRowData
} from '../data/grouped-data-provider';
import { RemoteServerSideViewDataProvider } from '../data/remote-server-side-view-data-provider';
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
  mapPhysicalToVirtualScrollTop,
  mapVirtualToPhysicalScrollTop
} from '../virtualization/scroll-scaling';
import { RowHeightMap } from '../virtualization/row-height-map';
import type {
  EditCommitEventPayload,
  EditCommitSource,
  EditTransactionKind,
  EditTransactionStep
} from '../core/edit-events';
import type {
  AdvancedFilterModel,
  ColumnFilterCondition,
  ColumnFilterInput,
  DateFilterOperator,
  GridFilterModel,
  NumberFilterOperator,
  SetFilterCondition,
  TextFilterOperator
} from '../data/filter-executor';
import {
  cloneAdvancedFilterModel as cloneAdvancedFilterModelValue,
  isAdvancedFilterGroup,
  type AdvancedFilterNode
} from '../data/filter-model';
import {
  calculateMaxHorizontalScrollLeft,
  calculateScrollScaleLayoutMetrics,
  calculateZoneLayoutMetrics,
  sumColumnWidths,
  toCssOverflowValue,
  type ScrollbarSize
} from './dom-renderer-layout-metrics';
import {
  buildReorderedColumnOrder,
  clampHeaderDropIndicatorOffset,
  createColumnReorderSession,
  createColumnResizeSession,
  createHeaderDropTarget,
  findVisibleColumnById,
  getVisibleColumnIndexById,
  isHeaderResizeHandleHit,
  normalizeDropIndexForSource,
  resolveNextColumnResizeWidth,
  type ColumnReorderSession,
  type ColumnResizeSession,
  type HeaderDropTarget,
  type HeaderResizeHit
} from './dom-renderer-header-interactions';
import {
  bindCell as bindGridCell,
  prependCellContentPrefix,
  type CellBindingState,
  type CellContentResult
} from './dom-renderer-cell-binding';
import {
  createAriaGridId,
  getAccessibleHeaderRowCount,
  getAriaCellId,
  getAriaRowIndexForDataRow,
  resolveAriaActiveDescendantUpdate,
  resolveAriaGridMetrics
} from './dom-renderer-a11y-sync';
import {
  createActiveEditorOverlayState,
  createClosedEditorOverlayState,
  createEditSession,
  createInvalidEditorOverlayState,
  createOpenEditorOverlayState,
  createPendingEditorOverlayState,
  formatEditorInputValue,
  normalizeEditorInputValue,
  resolveColumnEditor,
  resolveEditValidationMessage,
  resolveEditorOverlayRect,
  sanitizeEditorInputValue,
  shouldRefocusEditorAfterValidationFailure,
  type EditSession,
  type ResolvedColumnEditor,
  type EditorOverlayState
} from './dom-renderer-editor-overlay';
import {
  buildSelectionTsv,
  clampSelectionCellToBounds,
  parseClipboardTsv,
  resolveClipboardMatrixMetrics,
  resolveClipboardSourceOffsets,
  resolveInitialActiveCell,
  resolvePrimarySelectionRectangle,
  type SelectionRectangle
} from './dom-renderer-selection-clipboard';
import {
  resolveFillHandleAutoScrollDelta,
  resolveMatrixSeriesFillModel,
  resolveMatrixSeriesFillValue,
  getSelectionRectangleColumnCount,
  getSelectionRectangleRowCount,
  isCellInsideSelectionRectangle,
  resolveFillPreviewRectangle,
  resolveRepeatingFillOffset,
  shouldUseMatrixSeriesFill,
  selectionRectanglesEqual,
  shouldUseHorizontalSeriesFill,
  shouldUseVerticalSeriesFill
} from './dom-renderer-fill-handle';
import {
  applyZoneRowBindingState,
  createCellRenderState,
  hideZoneRow,
  rebuildRowPool,
  type CellRenderState,
  type IndicatorCellElements,
  type RowPoolItem,
  type ZoneRowItem
} from './dom-renderer-row-pool';
import {
  resolveHorizontalWindow,
  resolveViewportTransformMetrics,
  type HorizontalWindow
} from './dom-renderer-scroll-path';
import {
  computeSelectionAggregateSummaryChunked,
  computeSelectionAggregateSummary,
  resolveStatusBarRemoteSummary,
  resolveStatusBarRowsSummary,
  resolveStatusBarSelectionSummary,
  type StatusBarAggregateSummary,
  type StatusBarSelectionSummary
} from './dom-renderer-status-bar';

type ColumnZoneName = 'left' | 'center' | 'right';
type GridBuiltInMenuActionId = GridBuiltInColumnMenuActionId | GridBuiltInBodyMenuActionId;
interface FilterRowPoolItem {
  cellElement: HTMLDivElement;
  textInputElement: HTMLInputElement;
  booleanSelectElement: HTMLSelectElement;
  setSelectElement: HTMLSelectElement;
  dateShellElement: HTMLDivElement;
  dateOperatorElement: HTMLSelectElement;
  dateValueInputElement: HTMLInputElement;
  dateSecondaryInputElement: HTMLInputElement;
}

const BUILT_IN_COLUMN_MENU_ACTION_IDS: ReadonlySet<GridBuiltInColumnMenuActionId> = new Set<GridBuiltInColumnMenuActionId>([
  'sortAsc',
  'sortDesc',
  'clearSort',
  'pinLeft',
  'pinRight',
  'unpin',
  'autoSizeColumn',
  'resetColumnWidth',
  'hideColumn'
]);
const BUILT_IN_BODY_MENU_ACTION_IDS: ReadonlySet<GridBuiltInBodyMenuActionId> = new Set<GridBuiltInBodyMenuActionId>([
  'copyCell',
  'copyRow',
  'copySelection',
  'filterByValue',
  'clearColumnFilter'
]);

function isBuiltInColumnMenuActionId(value: string): value is GridBuiltInColumnMenuActionId {
  return BUILT_IN_COLUMN_MENU_ACTION_IDS.has(value as GridBuiltInColumnMenuActionId);
}

function isBuiltInBodyMenuActionId(value: string): value is GridBuiltInBodyMenuActionId {
  return BUILT_IN_BODY_MENU_ACTION_IDS.has(value as GridBuiltInBodyMenuActionId);
}

function escapeAttributeSelectorValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseFilterRowNumericValue(rawValue: string): number | null {
  const parsed = Number(rawValue.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFilterRowDateValue(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeDateFilterRowDraft(rawValue: string): {
  operator: DateFilterOperator;
  value: string;
  secondaryValue: string;
} {
  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return {
      operator: 'on',
      value: '',
      secondaryValue: ''
    };
  }

  const betweenMatch = trimmed.match(/^(.+?)\s*\.\.\s*(.+)$/);
  if (betweenMatch) {
    return {
      operator: 'between',
      value: betweenMatch[1].trim(),
      secondaryValue: betweenMatch[2].trim()
    };
  }

  const operatorMatch = trimmed.match(/^(>=|<=|!=|<>|>|<|=)\s*(.+)$/);
  if (!operatorMatch) {
    return {
      operator: 'on',
      value: trimmed,
      secondaryValue: ''
    };
  }

  const operatorToken = operatorMatch[1];
  return {
    operator:
      operatorToken === '>='
        ? 'onOrAfter'
        : operatorToken === '>'
          ? 'after'
          : operatorToken === '<='
            ? 'onOrBefore'
            : operatorToken === '<'
              ? 'before'
              : operatorToken === '!=' || operatorToken === '<>'
                ? 'notOn'
                : 'on',
    value: operatorMatch[2].trim(),
    secondaryValue: ''
  };
}

function encodeDateFilterRowDraft(operator: DateFilterOperator, value: string, secondaryValue: string): string {
  const normalizedValue = value.trim();
  const normalizedSecondaryValue = secondaryValue.trim();
  if (normalizedValue.length === 0 && normalizedSecondaryValue.length === 0) {
    return '';
  }

  if (operator === 'between') {
    return `${normalizedValue}..${normalizedSecondaryValue}`;
  }

  if (normalizedValue.length === 0) {
    return '';
  }

  if (operator === 'on') {
    return normalizedValue;
  }

  if (operator === 'notOn') {
    return `!=${normalizedValue}`;
  }

  if (operator === 'before') {
    return `<${normalizedValue}`;
  }

  if (operator === 'onOrBefore') {
    return `<=${normalizedValue}`;
  }

  if (operator === 'after') {
    return `>${normalizedValue}`;
  }

  if (operator === 'onOrAfter') {
    return `>=${normalizedValue}`;
  }

  return normalizedValue;
}

function getDateFilterRowOperatorToken(operator: DateFilterOperator): string {
  if (operator === 'between') {
    return '..';
  }
  if (operator === 'notOn') {
    return '!=';
  }
  if (operator === 'before') {
    return '<';
  }
  if (operator === 'onOrBefore') {
    return '<=';
  }
  if (operator === 'after') {
    return '>';
  }
  if (operator === 'onOrAfter') {
    return '>=';
  }
  return '=';
}

function estimateTextPixelWidth(text: string): number {
  return Math.max(0, Math.ceil(text.length * 8.2));
}

function cloneColumnFilterInput(filterInput: ColumnFilterInput | undefined): ColumnFilterInput | undefined {
  if (!filterInput) {
    return undefined;
  }

  if (Array.isArray(filterInput)) {
    return filterInput.map((condition) => ({ ...condition }));
  }

  return { ...filterInput };
}

function cloneGridFilterModel(filterModel: GridFilterModel): GridFilterModel {
  const cloned: GridFilterModel = {};
  const columnIds = Object.keys(filterModel);
  for (let index = 0; index < columnIds.length; index += 1) {
    const columnId = columnIds[index];
    const clonedInput = cloneColumnFilterInput(filterModel[columnId]);
    if (clonedInput) {
      cloned[columnId] = clonedInput;
    }
  }

  return cloned;
}

function getPrimaryColumnFilterCondition(filterInput: ColumnFilterInput | undefined): ColumnFilterCondition | null {
  if (!filterInput) {
    return null;
  }

  if (Array.isArray(filterInput)) {
    const firstCondition = filterInput[0];
    return firstCondition && typeof firstCondition === 'object' ? { ...firstCondition } : null;
  }

  return { ...filterInput };
}

function getColumnFilterConditions(filterInput: ColumnFilterInput | undefined): ColumnFilterCondition[] {
  if (!filterInput) {
    return [];
  }

  if (Array.isArray(filterInput)) {
    const conditions: ColumnFilterCondition[] = [];
    for (let index = 0; index < filterInput.length; index += 1) {
      const condition = filterInput[index];
      if (condition && typeof condition === 'object') {
        conditions.push({ ...condition });
      }
    }
    return conditions;
  }

  return [{ ...filterInput }];
}

function cloneFilterModelValue(filterModel: GridFilterModel): GridFilterModel {
  const nextFilterModel: GridFilterModel = {};
  const columnIds = Object.keys(filterModel);
  for (let index = 0; index < columnIds.length; index += 1) {
    const columnId = columnIds[index];
    const filterInput = filterModel[columnId];
    if (!filterInput) {
      continue;
    }

    nextFilterModel[columnId] = Array.isArray(filterInput)
      ? filterInput.map((condition) => ({ ...condition }))
      : { ...filterInput };
  }

  return nextFilterModel;
}

function cloneColumnLayoutValue(layout: GridColumnLayout): GridColumnLayout {
  return {
    columnOrder: Array.isArray(layout.columnOrder) ? layout.columnOrder.slice() : [],
    hiddenColumnIds: Array.isArray(layout.hiddenColumnIds) ? layout.hiddenColumnIds.slice() : [],
    pinnedColumns: layout.pinnedColumns && typeof layout.pinnedColumns === 'object' ? { ...layout.pinnedColumns } : {},
    columnWidths: layout.columnWidths && typeof layout.columnWidths === 'object' ? { ...layout.columnWidths } : {}
  };
}

function normalizeFilterSetOptionKey(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return `s:${value}`;
  }

  if (typeof value === 'number') {
    return `n:${Number.isNaN(value) ? 'NaN' : String(value)}`;
  }

  if (typeof value === 'boolean') {
    return `b:${value ? '1' : '0'}`;
  }

  if (value instanceof Date) {
    return `d:${value.toISOString()}`;
  }

  return `j:${JSON.stringify(value)}`;
}

function formatFilterSetOptionLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return FILTER_NULL_OPTION_LABEL;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

interface ColumnsByZone {
  left: ColumnDef[];
  center: ColumnDef[];
  right: ColumnDef[];
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

interface FillHandleSession {
  pointerId: number;
  sourceRectangle: SelectionRectangle;
  previewRectangle: SelectionRectangle;
  lastCell: SelectionCellPosition;
  lastClientX: number;
  lastClientY: number;
}

interface FillSourceCell {
  rawValue: unknown;
  textValue: string;
}

interface ResolvedColumnMenuItem {
  id: string;
  label: string;
  disabled: boolean;
  checked: boolean;
  danger: boolean;
  isSeparator: boolean;
  builtInActionId: GridBuiltInMenuActionId | null;
  onSelect: ((context: GridContextMenuContext) => void) | null;
}

interface OpenColumnMenuState {
  columnId: string;
  source: GridMenuOpenSource;
  items: ResolvedColumnMenuItem[];
  context: GridContextMenuContext;
}

type FilterPanelMode = 'text' | 'number' | 'date' | 'set';

interface FilterSetOption {
  key: string;
  label: string;
  value: unknown;
  isNull: boolean;
}

interface OpenFilterPanelState {
  columnId: string;
  source: GridMenuOpenSource;
  context: GridContextMenuContext;
  mode: FilterPanelMode;
  setOptions: FilterSetOption[];
}

type FilterToolPanelSurface = 'quick' | 'builder';

interface ColumnToolPanelRowState {
  column: ColumnDef;
  isVisible: boolean;
  canHide: boolean;
  order: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

interface ActiveToolPanelColumnState {
  column: ColumnDef;
  order: number;
}

interface ValueToolPanelRowState {
  column: ColumnDef;
  aggregateType: GroupAggregationType | null;
  order: number;
}

interface ToolPanelDockMetrics {
  railWidth: number;
  panelWidth: number;
  totalWidth: number;
}

interface ClipboardCellUpdate {
  rowIndex: number;
  dataIndex: number;
  rowKey?: RowKey;
  columnId: string;
  previousValue: unknown;
  value: unknown;
}

interface EditHistoryUpdate {
  rowKey: RowKey;
  dataIndexHint: number;
  columnId: string;
  previousValue: unknown;
  value: unknown;
}

interface EditHistoryEntry {
  transactionId: string;
  rootTransactionId: string;
  transactionKind: Exclude<EditTransactionKind, 'historyReplay'>;
  source: Exclude<EditCommitSource, 'undo' | 'redo'>;
  updates: EditHistoryUpdate[];
}

interface EditCommitTransactionContext {
  source: EditCommitSource;
  transactionId: string;
  rootTransactionId: string;
  transactionKind: EditTransactionKind;
  transactionStep: EditTransactionStep;
}

const HISTORY_ROW_KEY_FIELD_CANDIDATES = ['id', 'rowId', 'key'] as const;

const DEFAULT_HEIGHT = 360;
const DEFAULT_ROW_HEIGHT = 28;
const DEFAULT_ESTIMATED_ROW_HEIGHT = 28;
const DEFAULT_OVERSCAN = 6;
const DEFAULT_COLUMN_OVERSCAN = 2;
const VARIABLE_POOL_EXTRA_ROWS = 12;
const MIN_SCROLLBAR_SIZE = 0;
const INVISIBLE_SCROLLBAR_FALLBACK_SIZE = 16;
const TOOL_PANEL_RAIL_WIDTH = 28;
const RANGE_HANDLE_SIZE = 10;
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
const DEFAULT_FILL_HANDLE_AUTO_SCROLL_EDGE = 28;
const DEFAULT_FILL_HANDLE_AUTO_SCROLL_STEP = 32;
const HEADER_MENU_TRIGGER_WIDTH_PX = 22;
const MAX_GROUP_HEADER_DEPTH = 8;
const MAX_FILTER_SET_OPTIONS = 200;
const MAX_FILTER_SET_SCAN_ROWS = 5_000;
const FILTER_NULL_OPTION_LABEL = 'null';
const TEXT_FILTER_OPERATORS: TextFilterOperator[] = ['contains', 'startsWith', 'endsWith', 'equals', 'notEquals'];
const NUMBER_FILTER_OPERATORS: NumberFilterOperator[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'];
const DATE_FILTER_OPERATORS: DateFilterOperator[] = ['on', 'before', 'after', 'onOrBefore', 'onOrAfter', 'between', 'notOn'];
const MAX_GROUP_ROW_LEVEL = 12;
const MAX_TREE_ROW_LEVEL = 16;
const STATE_TONE_DIRTY = 'dirty';
const STATE_TONE_COMMIT = 'commit';
const DEFAULT_SCROLLBAR_VISIBILITY: Required<ScrollbarPolicy> = {
  vertical: 'auto',
  horizontal: 'auto'
};
let NEXT_ARIA_GRID_INSTANCE_ID = 1;

export class DomRenderer implements GridRendererPort {
  private readonly container: HTMLElement;
  private readonly eventBus: EventBus;
  private readonly customToolPanelActions: GridCustomToolPanelActionPort;

  private rootElement: HTMLDivElement;

  private headerElement: HTMLDivElement;
  private headerLeftElement: HTMLDivElement;
  private headerCenterElement: HTMLDivElement;
  private headerCenterViewportElement: HTMLDivElement;
  private headerRowLeftElement: HTMLDivElement;
  private headerRowCenterElement: HTMLDivElement;
  private filterRowLeftElement: HTMLDivElement;
  private filterRowCenterElement: HTMLDivElement;
  private headerRightElement: HTMLDivElement;
  private headerRowRightElement: HTMLDivElement;
  private filterRowRightElement: HTMLDivElement;
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
  private fillHandleElement: HTMLDivElement;
  private editActionBarElement: HTMLDivElement;
  private editActionBarMainElement: HTMLDivElement;
  private editActionBarActionsElement: HTMLDivElement;
  private editActionBarMessageElement: HTMLDivElement;
  private statusBarElement: HTMLDivElement;
  private statusBarMainElement: HTMLDivElement;
  private statusBarMetaElement: HTMLDivElement;
  private sideBarShellElement: HTMLDivElement;
  private editorHostElement: HTMLDivElement;
  private editorInputElement: HTMLInputElement;
  private editorSelectElement: HTMLSelectElement;
  private editorMessageElement: HTMLDivElement;
  private columnMenuElement: HTMLDivElement;
  private columnMenuListElement: HTMLDivElement;
  private filterPanelElement: HTMLDivElement;
  private filterPanelBodyElement: HTMLDivElement;
  private toolPanelRailElement: HTMLDivElement;
  private toolPanelElement: HTMLDivElement;
  private toolPanelBodyElement: HTMLDivElement;

  private options: GridOptions;
  private columnCatalog: ColumnDef[];
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
  private editActionBarDirty = false;
  private statusBarDirty = false;
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
  private centerFilterCellPool: FilterRowPoolItem[] = [];
  private headerGroupRowCount = 0;
  private leafSpanHiddenColumnsByZone: Record<ColumnZoneName, Set<string>> = {
    left: new Set<string>(),
    center: new Set<string>(),
    right: new Set<string>()
  };
  private readonly rowHeightMap: RowHeightMap;
  private readonly selectionModel: SelectionModel;
  private pointerSelectionSession: PointerSelectionSession | null = null;
  private fillHandleSession: FillHandleSession | null = null;
  private fillHandleAutoScrollFrameId: number | null = null;
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
  private openColumnMenuState: OpenColumnMenuState | null = null;
  private openFilterPanelState: OpenFilterPanelState | null = null;
  private openToolPanelId: GridToolPanelId | null = null;
  private preferredToolPanelId: GridToolPanelId | null = null;
  private activeToolPanelFilterColumnId: string | null = null;
  private activeToolPanelFilterMode: FilterPanelMode | null = null;
  private activeToolPanelFilterSurface: FilterToolPanelSurface = 'quick';
  private toolPanelAdvancedFilterDraft: AdvancedFilterModel | null = null;
  private toolPanelAdvancedFilterPresetId: string | null = null;
  private toolPanelAdvancedFilterPresetLabel = '';
  private toolPanelAdvancedFilterSetSearchByPath: Record<string, string> = {};
  private toolPanelColumnSearchQuery = '';
  private toolPanelColumnLayoutPresetId: string | null = null;
  private indicatorHeaderCheckAllElement: HTMLInputElement | null = null;
  private rowCheckboxAnchorRowIndex: number | null = null;
  private readonly ariaGridId: string;
  private ariaRowCount = -1;
  private ariaColCount = -1;
  private activeDescendantCellId = '';
  private editCommitSequence = 0;
  private editTransactionSequence = 0;
  private locale = 'en-US';
  private localeText: GridLocaleText = resolveGridLocaleText('en-US');
  private columnValueFormatContext: ColumnValueFormatContext | null = null;
  private statusBarNumberFormatter = new Intl.NumberFormat('en-US');
  private filterModel: GridFilterModel = {};
  private advancedFilterModel: AdvancedFilterModel | null = null;
  private filterRowDraftByColumnId: Record<string, string> = {};
  private filterSetOptionsCache = new Map<string, FilterSetOption[]>();
  private undoStack: EditHistoryEntry[] = [];
  private redoStack: EditHistoryEntry[] = [];
  private statusBarNeedsSummaryRefresh = true;
  private statusBarSelectionSummary: StatusBarSelectionSummary | null = null;
  private statusBarAggregateSummary: StatusBarAggregateSummary | null = null;
  private statusBarAggregateComputationId = 0;
  private editActionBarPendingAction: 'save' | 'discard' | null = null;
  private editActionBarLastMessage: { text: string; tone: GridStatusBarItemTone } | null = null;

  public constructor(
    container: HTMLElement,
    options: GridOptions,
    eventBus: EventBus,
    customToolPanelActions: GridCustomToolPanelActionPort
  ) {
    this.container = container;
    this.options = options;
    this.eventBus = eventBus;
    this.customToolPanelActions = customToolPanelActions;

    this.rootElement = document.createElement('div');

    this.headerElement = document.createElement('div');
    this.headerLeftElement = document.createElement('div');
    this.headerCenterElement = document.createElement('div');
    this.headerCenterViewportElement = document.createElement('div');
    this.headerRowLeftElement = document.createElement('div');
    this.headerRowCenterElement = document.createElement('div');
    this.filterRowLeftElement = document.createElement('div');
    this.filterRowCenterElement = document.createElement('div');
    this.headerRightElement = document.createElement('div');
    this.headerRowRightElement = document.createElement('div');
    this.filterRowRightElement = document.createElement('div');
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
    this.fillHandleElement = document.createElement('div');
    this.editActionBarElement = document.createElement('div');
    this.editActionBarMainElement = document.createElement('div');
    this.editActionBarActionsElement = document.createElement('div');
    this.editActionBarMessageElement = document.createElement('div');
    this.statusBarElement = document.createElement('div');
    this.statusBarMainElement = document.createElement('div');
    this.statusBarMetaElement = document.createElement('div');
    this.sideBarShellElement = document.createElement('div');
    this.editorHostElement = document.createElement('div');
    this.editorInputElement = document.createElement('input');
    this.editorSelectElement = document.createElement('select');
    this.editorMessageElement = document.createElement('div');
    this.columnMenuElement = document.createElement('div');
    this.columnMenuListElement = document.createElement('div');
    this.filterPanelElement = document.createElement('div');
    this.filterPanelBodyElement = document.createElement('div');
    this.toolPanelRailElement = document.createElement('div');
    this.toolPanelElement = document.createElement('div');
    this.toolPanelBodyElement = document.createElement('div');

    this.columnCatalog = this.cloneColumnCatalog(this.options.columns);
    this.columnsByZone = this.splitColumns(this.options.columns);
    this.scrollbarSize = this.measureScrollbarSize();
    this.rowHeightMap = new RowHeightMap(this.options.rowModel.getViewRowCount(), this.getBaseRowHeight());
    this.selectionModel = new SelectionModel();
    this.ariaGridId = createAriaGridId(NEXT_ARIA_GRID_INSTANCE_ID++);
    this.refreshI18nContext();

    this.initializeDom();
    this.eventBus.on('dirtyChange', this.handleDirtyChangeEvent);
    this.markLayoutDirty(true);
    this.flushRender();
  }

  public setOptions(nextOptions: GridOptions): void {
    const didChangeDataProvider = this.options.dataProvider !== nextOptions.dataProvider;
    this.teardownPointerSelectionSession();
    this.teardownFillHandleSession();
    this.teardownColumnReorderSession();
    this.closeColumnMenu();
    this.closeFilterPanel();
    this.stopEditing('reconcile');
    this.options = nextOptions;
    if (didChangeDataProvider || !this.isUndoRedoEnabled()) {
      this.clearEditHistory();
    }
    if (didChangeDataProvider) {
      this.editActionBarLastMessage = null;
      this.editActionBarPendingAction = null;
    }
    this.clearFilterSetOptionsCache();
    this.columnsByZone = this.splitColumns(this.options.columns);
    this.refreshI18nContext();
    this.reconcileToolPanelState(false);
    this.reconcileSelection('reconcile');
    this.markLayoutDirty(true);
    this.editActionBarDirty = true;
    this.flushRender();
  }

  public refreshDataView(): void {
    this.teardownPointerSelectionSession();
    this.teardownFillHandleSession();
    this.teardownColumnReorderSession();
    this.closeColumnMenu();
    this.closeFilterPanel();
    this.stopEditing('reconcile');
    this.reconcileSelection('reconcile');
    this.clearFilterSetOptionsCache();

    const previousVirtualScrollTop = this.pendingVirtualScrollTop;
    const previousScrollLeft = this.pendingScrollLeft;
    const didResetRowHeightCache = this.syncRowHeightCache(false, this.centerVisibleWidth);
    if (didResetRowHeightCache) {
      this.updateSpacerSize();
      this.setVirtualScrollTop(previousVirtualScrollTop);
      this.setHorizontalScrollLeft(previousScrollLeft);
    }

    this.syncAriaGridMetrics();
    this.markDataDirty();
    this.editActionBarDirty = true;
    this.flushRender();
  }

  public setColumns(columns: ColumnDef[]): void {
    this.setOptions({
      ...this.options,
      columns
    });
  }

  public setColumnCatalog(columns: ColumnDef[]): void {
    this.columnCatalog = this.cloneColumnCatalog(columns);
    this.clearFilterSetOptionsCache();
    this.reconcileToolPanelState(false);
  }

  public setFilterModel(filterModel: GridFilterModel): void {
    this.filterModel = cloneGridFilterModel(filterModel);
    this.syncFilterRowDraftFromModel();
    this.syncHeaderFilterState();
    this.syncFilterRowInputs();
    if (this.openFilterPanelState) {
      this.openFilterPanelState = {
        ...this.openFilterPanelState,
        setOptions: this.collectFilterSetOptions(this.openFilterPanelState.context.column)
      };
      this.renderFilterPanel();
    }
    if (this.openToolPanelId) {
      this.reconcileToolPanelState(false);
    }
  }

  public setAdvancedFilterModel(advancedFilterModel: AdvancedFilterModel | null): void {
    this.advancedFilterModel = cloneAdvancedFilterModelValue(advancedFilterModel);
    this.toolPanelAdvancedFilterDraft = cloneAdvancedFilterModelValue(this.advancedFilterModel);
    if (this.openToolPanelId) {
      this.reconcileToolPanelState(false);
    }
  }

  public setState(state: GridState): void {
    this.closeColumnMenu();
    this.closeFilterPanel();
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

  public undoLastEdit(): boolean {
    return this.applyEditHistory('undo');
  }

  public redoLastEdit(): boolean {
    return this.applyEditHistory('redo');
  }

  public canUndoEdit(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedoEdit(): boolean {
    return this.redoStack.length > 0;
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
    this.teardownFillHandleSession();
    this.teardownColumnResizeSession();
    this.teardownColumnReorderSession();
    this.stopEditing('reconcile');
    this.closeFilterPanel();
    this.closeToolPanel();
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
    this.rootElement.removeEventListener('contextmenu', this.handleRootContextMenu);
    this.headerElement.removeEventListener('input', this.handleHeaderInput);
    this.headerElement.removeEventListener('change', this.handleHeaderChange);
    this.headerElement.removeEventListener('keydown', this.handleHeaderKeyDown);
    this.fillHandleElement.removeEventListener('pointerdown', this.handleFillHandlePointerDown);
    this.editorInputElement.removeEventListener('keydown', this.handleEditorInputKeyDown);
    this.editorInputElement.removeEventListener('blur', this.handleEditorInputBlur);
    this.editorInputElement.removeEventListener('input', this.handleEditorInput);
    this.editorSelectElement.removeEventListener('keydown', this.handleEditorInputKeyDown);
    this.editorSelectElement.removeEventListener('blur', this.handleEditorInputBlur);
    this.editorSelectElement.removeEventListener('change', this.handleEditorInput);
    this.filterPanelElement.removeEventListener('click', this.handleFilterPanelClick);
    this.filterPanelElement.removeEventListener('input', this.handleFilterPanelInput);
    this.toolPanelRailElement.removeEventListener('click', this.handleToolPanelRailClick);
    this.toolPanelElement.removeEventListener('click', this.handleToolPanelClick);
    this.toolPanelElement.removeEventListener('change', this.handleToolPanelChange);
    this.toolPanelElement.removeEventListener('input', this.handleToolPanelInput);
    this.editActionBarElement.removeEventListener('click', this.handleEditActionBarClick);
    this.teardownResizeObserver();
    this.eventBus.off('dirtyChange', this.handleDirtyChangeEvent);

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
    this.filterRowLeftElement.className = 'hgrid__filter-row hgrid__filter-row--left';
    this.filterRowCenterElement.className = 'hgrid__filter-row hgrid__filter-row--center';
    this.headerRowRightElement.className = 'hgrid__header-row hgrid__header-row--right';
    this.filterRowRightElement.className = 'hgrid__filter-row hgrid__filter-row--right';
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
    this.fillHandleElement.className = 'hgrid__fill-handle';
    this.fillHandleElement.setAttribute('role', 'presentation');
    this.fillHandleElement.dataset.rangeHandle = 'true';
    this.editActionBarElement.className = 'hgrid__edit-action-bar';
    this.editActionBarElement.setAttribute('role', 'toolbar');
    this.editActionBarMainElement.className = 'hgrid__edit-action-bar-main';
    this.editActionBarActionsElement.className = 'hgrid__edit-action-bar-actions';
    this.editActionBarMessageElement.className = 'hgrid__edit-action-bar-message';
    this.statusBarElement.className = 'hgrid__status-bar';
    this.statusBarElement.setAttribute('role', 'status');
    this.statusBarMainElement.className = 'hgrid__status-bar-main';
    this.statusBarMetaElement.className = 'hgrid__status-bar-meta';
    this.sideBarShellElement.className = 'hgrid__side-bar-shell';
    this.sideBarShellElement.setAttribute('role', 'presentation');
    this.editorHostElement.className = 'hgrid__editor-host';
    this.editorInputElement.className = 'hgrid__editor-input';
    this.editorInputElement.type = 'text';
    this.editorInputElement.spellcheck = false;
    this.editorSelectElement.className = 'hgrid__editor-input hgrid__editor-input--select';
    this.editorSelectElement.style.display = 'none';
    this.editorMessageElement.className = 'hgrid__editor-message';
    this.editorMessageElement.setAttribute('role', 'alert');
    this.editorMessageElement.setAttribute('aria-live', 'polite');
    this.columnMenuElement.className = 'hgrid__column-menu';
    this.columnMenuElement.setAttribute('role', 'presentation');
    this.columnMenuListElement.className = 'hgrid__column-menu-list';
    this.columnMenuListElement.setAttribute('role', 'menu');
    this.filterPanelElement.className = 'hgrid__filter-panel';
    this.filterPanelElement.setAttribute('role', 'dialog');
    this.filterPanelElement.setAttribute('aria-modal', 'false');
    this.filterPanelBodyElement.className = 'hgrid__filter-panel-body';
    this.toolPanelRailElement.className = 'hgrid__tool-panel-rail';
    this.toolPanelElement.className = 'hgrid__tool-panel';
    this.toolPanelElement.setAttribute('role', 'complementary');
    this.toolPanelBodyElement.className = 'hgrid__tool-panel-body';
    this.editorHostElement.append(this.editorInputElement, this.editorSelectElement, this.editorMessageElement);
    this.columnMenuElement.append(this.columnMenuListElement);
    this.filterPanelElement.append(this.filterPanelBodyElement);
    this.toolPanelElement.append(this.toolPanelBodyElement);
    this.editActionBarElement.append(
      this.editActionBarMainElement,
      this.editActionBarActionsElement,
      this.editActionBarMessageElement
    );
    this.statusBarElement.append(this.statusBarMainElement, this.statusBarMetaElement);
    this.sideBarShellElement.append(this.toolPanelRailElement, this.toolPanelElement);
    this.overlayElement.append(
      this.fillHandleElement,
      this.editorHostElement,
      this.columnMenuElement,
      this.filterPanelElement
    );

    this.rootElement.append(
      this.headerElement,
      this.bodyElement,
      this.editActionBarElement,
      this.statusBarElement,
      this.overlayElement,
      this.sideBarShellElement
    );

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
    this.rootElement.addEventListener('contextmenu', this.handleRootContextMenu);
    this.headerElement.addEventListener('input', this.handleHeaderInput);
    this.headerElement.addEventListener('change', this.handleHeaderChange);
    this.headerElement.addEventListener('keydown', this.handleHeaderKeyDown);
    this.fillHandleElement.addEventListener('pointerdown', this.handleFillHandlePointerDown);
    this.editorInputElement.addEventListener('keydown', this.handleEditorInputKeyDown);
    this.editorInputElement.addEventListener('blur', this.handleEditorInputBlur);
    this.editorInputElement.addEventListener('input', this.handleEditorInput);
    this.editorSelectElement.addEventListener('keydown', this.handleEditorInputKeyDown);
    this.editorSelectElement.addEventListener('blur', this.handleEditorInputBlur);
    this.editorSelectElement.addEventListener('change', this.handleEditorInput);
    this.filterPanelElement.addEventListener('click', this.handleFilterPanelClick);
    this.filterPanelElement.addEventListener('input', this.handleFilterPanelInput);
    this.toolPanelRailElement.addEventListener('click', this.handleToolPanelRailClick);
    this.toolPanelElement.addEventListener('click', this.handleToolPanelClick);
    this.toolPanelElement.addEventListener('change', this.handleToolPanelChange);
    this.toolPanelElement.addEventListener('input', this.handleToolPanelInput);
    this.editActionBarElement.addEventListener('click', this.handleEditActionBarClick);

    this.syncAriaGridMetrics();
    this.syncAriaActiveDescendant();
    this.reconcileToolPanelState(true);
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
    try {
      this.statusBarNumberFormatter = new Intl.NumberFormat(this.locale, this.options.numberFormatOptions);
    } catch {
      this.statusBarNumberFormatter = new Intl.NumberFormat('en-US');
    }

    this.rootElement.lang = this.locale;
    const isRtl = this.options.rtl === true;
    this.rootElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
    this.rootElement.classList.toggle('hgrid--rtl', isRtl);
  }

  private localizeText(template: string, values: Record<string, string | number>): string {
    return formatGridLocaleText(template, values);
  }

  private isSystemUtilityColumnId(columnId: string): boolean {
    return (
      columnId === LEGACY_INDICATOR_COLUMN_ID ||
      columnId === INDICATOR_ROW_NUMBER_COLUMN_ID ||
      columnId === INDICATOR_CHECKBOX_COLUMN_ID ||
      columnId === INDICATOR_STATUS_COLUMN_ID ||
      columnId === STATE_COLUMN_ID
    );
  }

  private isColumnMenuEnabled(): boolean {
    return Boolean(this.options.columnMenu && this.options.columnMenu.enabled !== false);
  }

  private isContextMenuEnabled(): boolean {
    return Boolean(this.options.contextMenu && this.options.contextMenu.enabled !== false);
  }

  private getColumnMenuTriggerMode(): 'button' | 'contextmenu' | 'both' | null {
    if (!this.isColumnMenuEnabled()) {
      return null;
    }

    return this.options.columnMenu?.trigger ?? 'both';
  }

  private supportsColumnMenuOpenSource(source: GridMenuOpenSource): boolean {
    const triggerMode = this.getColumnMenuTriggerMode();
    if (source === 'button') {
      return triggerMode === 'button' || triggerMode === 'both';
    }

    if (source === 'contextmenu') {
      return triggerMode === 'contextmenu' || triggerMode === 'both' || this.isContextMenuEnabled();
    }

    return this.isColumnMenuEnabled();
  }

  private isColumnMenuEligibleColumn(column: ColumnDef): boolean {
    return !this.isSystemUtilityColumnId(column.id);
  }

  private getMenuEligibleVisibleColumnCount(): number {
    let count = 0;
    for (let index = 0; index < this.options.columns.length; index += 1) {
      if (this.isColumnMenuEligibleColumn(this.options.columns[index])) {
        count += 1;
      }
    }
    return count;
  }

  private isHeaderMenuTriggerHit(clientX: number, headerCell: HTMLDivElement): boolean {
    const triggerMode = this.getColumnMenuTriggerMode();
    if (triggerMode !== 'button' && triggerMode !== 'both') {
      return false;
    }

    const columnId = headerCell.dataset.columnId;
    if (!columnId) {
      return false;
    }

    const column = findVisibleColumnById(this.options.columns, columnId);
    if (!column || !this.isColumnMenuEligibleColumn(column)) {
      return false;
    }

    const cellRect = headerCell.getBoundingClientRect();
    if (cellRect.width <= HEADER_RESIZE_HIT_SLOP_PX * 2) {
      return false;
    }

    if (this.options.rtl === true) {
      const triggerLimit = Math.min(cellRect.right, cellRect.left + HEADER_MENU_TRIGGER_WIDTH_PX);
      const resizeLimit = cellRect.left + HEADER_RESIZE_HIT_SLOP_PX;
      return clientX >= resizeLimit && clientX <= triggerLimit;
    }

    const triggerStart = Math.max(cellRect.left, cellRect.right - HEADER_MENU_TRIGGER_WIDTH_PX);
    const resizeBoundary = cellRect.right - HEADER_RESIZE_HIT_SLOP_PX;
    return clientX >= triggerStart && clientX < resizeBoundary;
  }

  private findVisibleHeaderCellByColumnId(columnId: string): HTMLDivElement | null {
    const selector = `.hgrid__header-cell--leaf[data-column-id="${escapeAttributeSelectorValue(columnId)}"]`;
    const headerCells = this.headerElement.querySelectorAll(selector);
    for (let index = 0; index < headerCells.length; index += 1) {
      const headerCell = headerCells[index] as HTMLDivElement;
      if (headerCell.style.display !== 'none') {
        return headerCell;
      }
    }

    return null;
  }

  private isTargetInsideColumnMenu(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest('.hgrid__column-menu'));
  }

  private isTargetInsideFilterPanel(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest('.hgrid__filter-panel'));
  }

  private isTargetInsideToolPanel(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest('.hgrid__tool-panel, .hgrid__tool-panel-rail'));
  }

  private isTargetInsideFilterRow(target: EventTarget | null): boolean {
    return target instanceof HTMLElement && Boolean(target.closest('.hgrid__filter-row'));
  }

  private cloneColumnCatalog(columns: ColumnDef[]): ColumnDef[] {
    const clonedColumns: ColumnDef[] = new Array(columns.length);
    for (let index = 0; index < columns.length; index += 1) {
      clonedColumns[index] = { ...columns[index] };
    }

    return clonedColumns;
  }

  private getResolvedSideBar(): GridSideBarOptions | null {
    const sideBar = this.options.sideBar;
    if (!sideBar || sideBar.enabled !== true) {
      return null;
    }

    const panels = Array.isArray(sideBar.panels) ? sideBar.panels : ['columns'];
    if (panels.length === 0) {
      return null;
    }

    return sideBar;
  }

  private getCustomToolPanelDefinitions(): GridCustomToolPanelDefinition[] {
    const sideBar = this.getResolvedSideBar();
    if (!sideBar || !Array.isArray(sideBar.customPanels) || sideBar.customPanels.length === 0) {
      return [];
    }

    return sideBar.customPanels.slice();
  }

  private getCustomToolPanelDefinition(panelId: GridToolPanelId): GridCustomToolPanelDefinition | null {
    const customPanels = this.getCustomToolPanelDefinitions();
    for (let index = 0; index < customPanels.length; index += 1) {
      const panel = customPanels[index];
      if (panel.id === panelId) {
        return panel;
      }
    }

    return null;
  }

  private getConfiguredToolPanels(): GridToolPanelId[] {
    const sideBar = this.getResolvedSideBar();
    if (!sideBar) {
      return [];
    }

    const configuredPanels = Array.isArray(sideBar.panels) ? sideBar.panels.slice() : ['columns'];
    const supportedPanels: GridToolPanelId[] = [];
    for (let index = 0; index < configuredPanels.length; index += 1) {
      const panelId = configuredPanels[index];
      const isBuiltInPanel =
        panelId === 'columns' || panelId === 'filters' || panelId === 'grouping' || panelId === 'pivot';
      const isCustomPanel = !isBuiltInPanel && this.getCustomToolPanelDefinition(panelId) !== null;
      if ((isBuiltInPanel || isCustomPanel) && supportedPanels.indexOf(panelId) === -1) {
        supportedPanels.push(panelId);
      }
    }

    return supportedPanels;
  }

  private isToolPanelAvailable(panelId: GridToolPanelId): boolean {
    return this.getConfiguredToolPanels().indexOf(panelId) !== -1;
  }

  private getToolPanelWidth(): number {
    const configuredWidth = this.options.sideBar?.width;
    if (typeof configuredWidth !== 'number' || !Number.isFinite(configuredWidth)) {
      return 300;
    }

    return Math.max(240, Math.min(420, Math.round(configuredWidth)));
  }

  private getToolPanelDockMetrics(): ToolPanelDockMetrics {
    const configuredPanels = this.getConfiguredToolPanels();
    if (configuredPanels.length === 0) {
      return {
        railWidth: 0,
        panelWidth: 0,
        totalWidth: 0
      };
    }

    const isPanelOpen = Boolean(this.openToolPanelId && this.isToolPanelAvailable(this.openToolPanelId));
    const panelWidth = isPanelOpen ? this.getToolPanelWidth() : 0;
    const railWidth = isPanelOpen ? 0 : TOOL_PANEL_RAIL_WIDTH;

    return {
      railWidth,
      panelWidth,
      totalWidth: railWidth + panelWidth
    };
  }

  private getGridSurfaceWidth(): number {
    const baseWidth =
      this.rootElement.clientWidth ||
      this.container.clientWidth ||
      sumColumnWidths(this.columnsByZone.left) + sumColumnWidths(this.columnsByZone.center) + sumColumnWidths(this.columnsByZone.right);

    return Math.max(1, baseWidth - this.getToolPanelDockMetrics().totalWidth);
  }

  private syncToolPanelDockLayout(): void {
    const dockMetrics = this.getToolPanelDockMetrics();
    this.rootElement.style.setProperty('--hgrid-side-bar-space-right', `${dockMetrics.totalWidth}px`);
    this.rootElement.style.setProperty('--hgrid-tool-panel-rail-width', `${dockMetrics.railWidth}px`);
    this.rootElement.style.setProperty('--hgrid-tool-panel-width', `${dockMetrics.panelWidth}px`);

    if (dockMetrics.totalWidth === 0) {
      this.sideBarShellElement.style.display = 'none';
      this.sideBarShellElement.style.width = '';
      this.toolPanelRailElement.style.width = '';
      return;
    }

    this.sideBarShellElement.style.display = 'flex';
    this.sideBarShellElement.style.width = `${dockMetrics.totalWidth}px`;
    this.toolPanelRailElement.style.width = `${dockMetrics.railWidth}px`;
    this.toolPanelRailElement.style.display = dockMetrics.railWidth > 0 ? 'flex' : 'none';
  }

  private requestToolPanelDockRelayout(previousDockWidth: number): void {
    if (previousDockWidth === this.getToolPanelDockMetrics().totalWidth) {
      return;
    }

    this.markLayoutDirty(false);
    this.scheduleRender();
  }

  private getColumnsToolPanelRows(): ColumnToolPanelRowState[] {
    const rows: ColumnToolPanelRowState[] = [];
    const normalizedSearch = this.toolPanelColumnSearchQuery.trim().toLowerCase();
    const orderedColumns: ColumnDef[] = [];
    let visibleColumnCount = 0;
    for (let index = 0; index < this.columnCatalog.length; index += 1) {
      const column = this.columnCatalog[index];
      if (this.isSystemUtilityColumnId(column.id)) {
        continue;
      }

      orderedColumns.push(column);
      if (column.visible !== false) {
        visibleColumnCount += 1;
      }
    }

    const filteredColumns =
      normalizedSearch.length === 0
        ? orderedColumns
        : orderedColumns.filter((column) => {
            const header = String(column.header ?? '').trim().toLowerCase();
            const columnId = column.id.trim().toLowerCase();
            return header.includes(normalizedSearch) || columnId.includes(normalizedSearch);
          });

    for (let index = 0; index < filteredColumns.length; index += 1) {
      const column = filteredColumns[index];
      if (this.isSystemUtilityColumnId(column.id)) {
        continue;
      }

      const isVisible = column.visible !== false;
      rows.push({
        column,
        isVisible,
        canHide: !isVisible || visibleColumnCount > 1,
        order: index,
        canMoveUp: index > 0,
        canMoveDown: index < filteredColumns.length - 1
      });
    }

    return rows;
  }

  private getColumnsToolPanelOrderedColumnIds(): string[] {
    const columnIds: string[] = [];
    for (let index = 0; index < this.columnCatalog.length; index += 1) {
      const column = this.columnCatalog[index];
      if (this.isSystemUtilityColumnId(column.id)) {
        continue;
      }
      columnIds.push(column.id);
    }
    return columnIds;
  }

  private getCurrentColumnLayout(): GridColumnLayout {
    const hiddenColumnIds: string[] = [];
    const pinnedColumns: Record<string, ColumnPinPosition> = {};
    const columnWidths: Record<string, number> = {};
    const columnOrder: string[] = [];

    for (let index = 0; index < this.columnCatalog.length; index += 1) {
      const column = this.columnCatalog[index];
      if (this.isSystemUtilityColumnId(column.id)) {
        continue;
      }

      columnOrder.push(column.id);
      columnWidths[column.id] = column.width;
      if (column.visible === false) {
        hiddenColumnIds.push(column.id);
      }
      if (column.pinned) {
        pinnedColumns[column.id] = column.pinned;
      }
    }

    return {
      columnOrder,
      hiddenColumnIds,
      pinnedColumns,
      columnWidths
    };
  }

  private getColumnLayoutPresets(): GridColumnLayoutPreset[] {
    return Array.isArray(this.options.sideBar?.columnLayoutPresets)
      ? this.options.sideBar.columnLayoutPresets
          .filter(
            (preset): preset is GridColumnLayoutPreset =>
              Boolean(preset && typeof preset.id === 'string' && preset.id.length > 0 && typeof preset.label === 'string' && preset.label.length > 0)
          )
          .map((preset) => ({
            id: preset.id,
            label: preset.label,
            layout: cloneColumnLayoutValue(preset.layout)
          }))
      : [];
  }

  private reconcileToolPanelColumnLayoutPresetState(): void {
    const presets = this.getColumnLayoutPresets();
    const selectedPreset = presets.find((preset) => preset.id === this.toolPanelColumnLayoutPresetId) ?? null;
    if (!selectedPreset) {
      this.toolPanelColumnLayoutPresetId = presets[0]?.id ?? null;
    }
  }

  private moveColumnsToolPanelColumnOrder(columnId: string, direction: 'up' | 'down'): void {
    const displayedRows = this.getColumnsToolPanelRows();
    const displayedColumnIds = displayedRows.map((row) => row.column.id);
    const sourceDisplayedIndex = displayedColumnIds.indexOf(columnId);
    if (sourceDisplayedIndex === -1) {
      return;
    }

    const targetDisplayedIndex = direction === 'up' ? sourceDisplayedIndex - 1 : sourceDisplayedIndex + 1;
    if (targetDisplayedIndex < 0 || targetDisplayedIndex >= displayedColumnIds.length) {
      return;
    }

    const targetColumnId = displayedColumnIds[targetDisplayedIndex];
    const orderedColumnIds = this.getColumnsToolPanelOrderedColumnIds();
    const sourceIndex = orderedColumnIds.indexOf(columnId);
    const targetIndex = orderedColumnIds.indexOf(targetColumnId);
    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const dropIndex = direction === 'up' ? targetIndex : targetIndex + 1;
    const normalizedTargetIndex = normalizeDropIndexForSource(dropIndex, sourceIndex);
    if (normalizedTargetIndex === sourceIndex) {
      return;
    }

    this.eventBus.emit('columnReorder', {
      sourceColumnId: columnId,
      targetColumnId,
      fromIndex: sourceIndex,
      toIndex: normalizedTargetIndex,
      columnOrder: buildReorderedColumnOrder(orderedColumnIds, sourceIndex, normalizedTargetIndex)
    });
  }

  private getFilterableToolPanelColumns(): ColumnDef[] {
    const columns: ColumnDef[] = [];
    for (let index = 0; index < this.columnCatalog.length; index += 1) {
      const column = this.columnCatalog[index];
      if (this.isSystemUtilityColumnId(column.id)) {
        continue;
      }
      columns.push(column);
    }

    return columns;
  }

  private getAdvancedFilterPresets(): Array<{ id: string; label: string; advancedFilterModel: AdvancedFilterModel }> {
    return Array.isArray(this.options.advancedFilterPresets)
      ? this.options.advancedFilterPresets
          .filter(
            (preset): preset is { id: string; label: string; advancedFilterModel: AdvancedFilterModel } =>
              Boolean(
                preset &&
                  typeof preset.id === 'string' &&
                  preset.id.length > 0 &&
                  typeof preset.label === 'string' &&
                  preset.label.length > 0 &&
                  preset.advancedFilterModel
              )
          )
          .map((preset) => ({
            id: preset.id,
            label: preset.label,
            advancedFilterModel: cloneAdvancedFilterModelValue(preset.advancedFilterModel) ?? {
              operator: 'and',
              rules: []
            }
          }))
      : [];
  }

  private reconcileToolPanelAdvancedFilterPresetState(): void {
    const presets = this.getAdvancedFilterPresets();
    const selectedPreset = presets.find((preset) => preset.id === this.toolPanelAdvancedFilterPresetId) ?? null;
    if (!selectedPreset) {
      this.toolPanelAdvancedFilterPresetId = presets[0]?.id ?? null;
    }

    if (this.toolPanelAdvancedFilterPresetLabel.trim().length === 0) {
      this.toolPanelAdvancedFilterPresetLabel = selectedPreset?.label ?? '';
    }
  }

  private isToolPanelFilterModeAllowed(column: ColumnDef, mode: FilterPanelMode): boolean {
    if (column.type === 'number') {
      return mode === 'number';
    }

    if (column.type === 'date') {
      return mode === 'date';
    }

    if (column.type === 'boolean') {
      return mode === 'set';
    }

    if (this.canSwitchTextSetFilter(column)) {
      return mode === 'text' || mode === 'set';
    }

    return mode === 'text';
  }

  private supportsAdvancedFilterSetCondition(column: ColumnDef): boolean {
    return column.type === 'text' || column.type === 'boolean';
  }

  private reconcileToolPanelFilterState(): void {
    const filterableColumns = this.getFilterableToolPanelColumns();
    if (filterableColumns.length === 0) {
      this.activeToolPanelFilterColumnId = null;
      this.activeToolPanelFilterMode = null;
      return;
    }

    const activeColumn =
      filterableColumns.find((column) => column.id === this.activeToolPanelFilterColumnId) ?? filterableColumns[0];
    this.activeToolPanelFilterColumnId = activeColumn.id;

    if (!this.activeToolPanelFilterMode || !this.isToolPanelFilterModeAllowed(activeColumn, this.activeToolPanelFilterMode)) {
      this.activeToolPanelFilterMode = this.resolveFilterPanelMode(activeColumn);
    }
  }

  private getActiveToolPanelFilterColumn(): ColumnDef | null {
    this.reconcileToolPanelFilterState();
    const columnId = this.activeToolPanelFilterColumnId;
    if (!columnId) {
      return null;
    }

    return this.getFilterableToolPanelColumns().find((column) => column.id === columnId) ?? null;
  }

  private createDefaultAdvancedFilterCondition(column: ColumnDef): ColumnFilterCondition {
    if (column.type === 'number') {
      return {
        kind: 'number',
        operator: 'eq'
      };
    }

    if (column.type === 'date') {
      return {
        kind: 'date',
        operator: 'on'
      };
    }

    if (column.type === 'boolean') {
      return {
        kind: 'set',
        values: []
      };
    }

    return {
      kind: 'text',
      operator: 'contains',
      value: ''
    };
  }

  private normalizeAdvancedFilterRuleConditionForColumn(column: ColumnDef, condition: ColumnFilterCondition): ColumnFilterCondition {
    if (column.type === 'number') {
      return condition.kind === 'number' ? condition : { kind: 'number', operator: 'eq' };
    }

    if (column.type === 'date') {
      return condition.kind === 'date' ? condition : { kind: 'date', operator: 'on' };
    }

    if (column.type === 'boolean') {
      return condition.kind === 'set' ? condition : { kind: 'set', values: [] };
    }

    if (condition.kind === 'text' || condition.kind === 'set') {
      return condition;
    }

    return { kind: 'text', operator: 'contains', value: '' };
  }

  private getAdvancedFilterSetSearchQuery(path: string): string {
    return this.toolPanelAdvancedFilterSetSearchByPath[path] ?? '';
  }

  private getAdvancedFilterSetOptions(column: ColumnDef, path: string): FilterSetOption[] {
    const query = this.getAdvancedFilterSetSearchQuery(path).trim().toLowerCase();
    const options = this.collectFilterSetOptions(column, 'builder');
    if (query.length === 0) {
      return options;
    }

    return options.filter((option) => option.label.toLowerCase().includes(query));
  }

  private getSetConditionSelectedKeys(condition: SetFilterCondition | null): Set<string> {
    const selectedKeys = new Set<string>();
    if (!condition) {
      return selectedKeys;
    }

    for (let index = 0; index < condition.values.length; index += 1) {
      selectedKeys.add(normalizeFilterSetOptionKey(condition.values[index]));
    }
    if (condition.includeNull === true) {
      selectedKeys.add('null');
    }
    return selectedKeys;
  }

  private createDefaultAdvancedFilterRuleNode(column: ColumnDef): AdvancedFilterNode {
    return {
      kind: 'rule',
      columnId: column.id,
      condition: this.createDefaultAdvancedFilterCondition(column)
    };
  }

  private createDefaultAdvancedFilterGroupNode(): AdvancedFilterNode | null {
    const columns = this.getFilterableToolPanelColumns();
    const firstColumn = columns[0];
    if (!firstColumn) {
      return null;
    }

    return {
      kind: 'group',
      operator: 'and',
      rules: [this.createDefaultAdvancedFilterRuleNode(firstColumn)]
    };
  }

  private createDefaultAdvancedFilterDraft(): AdvancedFilterModel | null {
    const columns = this.getFilterableToolPanelColumns();
    const firstColumn = columns[0];
    if (!firstColumn) {
      return null;
    }

    return {
      operator: 'and',
      rules: [this.createDefaultAdvancedFilterRuleNode(firstColumn)]
    };
  }

  private cloneAdvancedFilterDraftNode(node: AdvancedFilterNode): AdvancedFilterNode | null {
    return cloneAdvancedFilterModelValue({
      operator: 'and',
      rules: [node]
    })?.rules[0] ?? null;
  }

  private normalizeToolPanelAdvancedFilterNodes(
    nodes: ReadonlyArray<AdvancedFilterNode>,
    availableColumnIds: Set<string>
  ): AdvancedFilterNode[] {
    const normalizedNodes: AdvancedFilterNode[] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node || typeof node !== 'object') {
        continue;
      }

      if (isAdvancedFilterGroup(node)) {
        const normalizedRules = this.normalizeToolPanelAdvancedFilterNodes(node.rules, availableColumnIds);
        if (normalizedRules.length === 0) {
          continue;
        }
        normalizedNodes.push({
          kind: 'group',
          operator: node.operator === 'or' ? 'or' : 'and',
          rules: normalizedRules
        });
        continue;
      }

      if (!availableColumnIds.has(node.columnId)) {
        continue;
      }

      normalizedNodes.push({
        kind: node.kind === 'rule' ? 'rule' : undefined,
        columnId: node.columnId,
        condition: { ...node.condition }
      });
    }

    return normalizedNodes;
  }

  private parseAdvancedFilterPath(pathValue: string | undefined): number[] | null {
    if (typeof pathValue !== 'string' || pathValue.length === 0) {
      return null;
    }

    const segments = pathValue.split('.');
    const path: number[] = [];
    for (let index = 0; index < segments.length; index += 1) {
      const parsed = Number(segments[index]);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return null;
      }
      path.push(parsed);
    }
    return path.length > 0 ? path : null;
  }

  private getAdvancedFilterDraftNode(path: ReadonlyArray<number>): AdvancedFilterNode | null {
    if (!this.toolPanelAdvancedFilterDraft || path.length === 0) {
      return null;
    }

    let nodes = this.toolPanelAdvancedFilterDraft.rules;
    let currentNode: AdvancedFilterNode | null = null;
    for (let depth = 0; depth < path.length; depth += 1) {
      currentNode = nodes[path[depth]] ?? null;
      if (!currentNode) {
        return null;
      }

      if (depth < path.length - 1) {
        if (!isAdvancedFilterGroup(currentNode)) {
          return null;
        }
        nodes = currentNode.rules;
      }
    }

    return currentNode;
  }

  private updateAdvancedFilterDraftNodes(
    nodes: ReadonlyArray<AdvancedFilterNode>,
    path: ReadonlyArray<number>,
    depth: number,
    updater: (node: AdvancedFilterNode) => AdvancedFilterNode | null
  ): AdvancedFilterNode[] {
    const nextNodes: AdvancedFilterNode[] = [];
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const clonedNode = this.cloneAdvancedFilterDraftNode(node);
      if (!clonedNode) {
        continue;
      }

      if (index !== path[depth]) {
        nextNodes.push(clonedNode);
        continue;
      }

      if (depth === path.length - 1) {
        const updatedNode = updater(clonedNode);
        if (updatedNode) {
          nextNodes.push(updatedNode);
        }
        continue;
      }

      if (!isAdvancedFilterGroup(clonedNode)) {
        nextNodes.push(clonedNode);
        continue;
      }

      const updatedRules = this.updateAdvancedFilterDraftNodes(clonedNode.rules, path, depth + 1, updater);
      if (updatedRules.length === 0) {
        continue;
      }

      nextNodes.push({
        kind: 'group',
        operator: clonedNode.operator,
        rules: updatedRules
      });
    }

    return nextNodes;
  }

  private updateAdvancedFilterDraftNode(
    path: ReadonlyArray<number>,
    updater: (node: AdvancedFilterNode) => AdvancedFilterNode | null
  ): void {
    this.reconcileToolPanelAdvancedFilterDraft();
    if (!this.toolPanelAdvancedFilterDraft || path.length === 0) {
      return;
    }

    const nextRules = this.updateAdvancedFilterDraftNodes(this.toolPanelAdvancedFilterDraft.rules, path, 0, updater);
    this.toolPanelAdvancedFilterDraft =
      nextRules.length > 0
        ? {
            operator: this.toolPanelAdvancedFilterDraft.operator,
            rules: nextRules
          }
        : this.createDefaultAdvancedFilterDraft();
  }

  private appendAdvancedFilterDraftChild(parentPath: ReadonlyArray<number> | null, kind: 'rule' | 'group'): void {
    this.reconcileToolPanelAdvancedFilterDraft();
    if (!this.toolPanelAdvancedFilterDraft) {
      return;
    }

    const availableColumns = this.getFilterableToolPanelColumns();
    const firstColumn = availableColumns[0];
    if (!firstColumn) {
      return;
    }

    const nextNode =
      kind === 'group' ? this.createDefaultAdvancedFilterGroupNode() : this.createDefaultAdvancedFilterRuleNode(firstColumn);
    if (!nextNode) {
      return;
    }

    if (!parentPath || parentPath.length === 0) {
      this.toolPanelAdvancedFilterDraft = {
        operator: this.toolPanelAdvancedFilterDraft.operator,
        rules: this.toolPanelAdvancedFilterDraft.rules.concat(nextNode)
      };
      return;
    }

    this.updateAdvancedFilterDraftNode(parentPath, (node) => {
      if (!isAdvancedFilterGroup(node)) {
        return node;
      }

      return {
        kind: 'group',
        operator: node.operator,
        rules: node.rules.concat(nextNode)
      };
    });
  }

  private reconcileToolPanelAdvancedFilterDraft(): void {
    const availableColumns = this.getFilterableToolPanelColumns();
    if (availableColumns.length === 0) {
      this.toolPanelAdvancedFilterDraft = null;
      return;
    }

    const availableColumnIds = new Set(availableColumns.map((column) => column.id));
    const baseDraft = cloneAdvancedFilterModelValue(this.toolPanelAdvancedFilterDraft) ?? cloneAdvancedFilterModelValue(this.advancedFilterModel);
    if (!baseDraft) {
      this.toolPanelAdvancedFilterDraft = this.createDefaultAdvancedFilterDraft();
      return;
    }

    const nextRules = this.normalizeToolPanelAdvancedFilterNodes(baseDraft.rules, availableColumnIds);

    this.toolPanelAdvancedFilterDraft =
      nextRules.length > 0
        ? {
            operator: baseDraft.operator === 'or' ? 'or' : 'and',
            rules: nextRules
          }
        : this.createDefaultAdvancedFilterDraft();
  }

  private normalizeAdvancedFilterDraft(): AdvancedFilterModel | null {
    this.reconcileToolPanelAdvancedFilterDraft();
    return cloneAdvancedFilterModelValue(this.toolPanelAdvancedFilterDraft);
  }

  private getGroupableToolPanelColumns(): ColumnDef[] {
    const columns: ColumnDef[] = [];
    for (let index = 0; index < this.columnCatalog.length; index += 1) {
      const column = this.columnCatalog[index];
      if (this.isSystemUtilityColumnId(column.id)) {
        continue;
      }
      columns.push(column);
    }

    return columns;
  }

  private getCurrentGroupingMode(): GroupingMode {
    return this.options.grouping?.mode === 'server' ? 'server' : 'client';
  }

  private getCurrentGroupModel(): GroupModelItem[] {
    return Array.isArray(this.options.grouping?.groupModel) ? this.options.grouping.groupModel.map((item) => ({ ...item })) : [];
  }

  private getCurrentGroupAggregations(): GroupAggregationDef[] {
    return Array.isArray(this.options.grouping?.aggregations)
      ? this.options.grouping.aggregations.map((item) => ({ ...item }))
      : [];
  }

  private getCurrentPivotingMode(): PivotingMode {
    return this.options.pivoting?.mode === 'server' ? 'server' : 'client';
  }

  private getCurrentPivotModel(): PivotModelItem[] {
    return Array.isArray(this.options.pivoting?.pivotModel) ? this.options.pivoting.pivotModel.map((item) => ({ ...item })) : [];
  }

  private getCurrentPivotValues(): PivotValueDef[] {
    return Array.isArray(this.options.pivoting?.values) ? this.options.pivoting.values.map((item) => ({ ...item })) : [];
  }

  private getActiveGroupingColumns(): ActiveToolPanelColumnState[] {
    const groupableColumns = this.getGroupableToolPanelColumns();
    const groupModel = this.getCurrentGroupModel();
    const activeColumns: ActiveToolPanelColumnState[] = [];
    for (let index = 0; index < groupModel.length; index += 1) {
      const groupItem = groupModel[index];
      const column = groupableColumns.find((candidate) => candidate.id === groupItem.columnId);
      if (!column) {
        continue;
      }
      activeColumns.push({
        column,
        order: index
      });
    }

    return activeColumns;
  }

  private getActivePivotColumns(): ActiveToolPanelColumnState[] {
    const groupableColumns = this.getGroupableToolPanelColumns();
    const pivotModel = this.getCurrentPivotModel();
    const activeColumns: ActiveToolPanelColumnState[] = [];
    for (let index = 0; index < pivotModel.length; index += 1) {
      const pivotItem = pivotModel[index];
      const column = groupableColumns.find((candidate) => candidate.id === pivotItem.columnId);
      if (!column) {
        continue;
      }
      activeColumns.push({
        column,
        order: index
      });
    }

    return activeColumns;
  }

  private getAggregationTypesForColumn(column: ColumnDef): GroupAggregationType[] {
    if (column.type === 'number') {
      return ['sum', 'avg', 'min', 'max', 'count'];
    }

    return ['count', 'min', 'max'];
  }

  private getActiveGroupingAggregationRows(): ValueToolPanelRowState[] {
    const columns = this.getGroupableToolPanelColumns();
    const aggregations = this.getCurrentGroupAggregations();
    const rows: ValueToolPanelRowState[] = [];
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      const aggregation = aggregations.find((item) => item.columnId === column.id);
      rows.push({
        column,
        aggregateType: aggregation?.type ?? null,
        order: aggregation ? aggregations.findIndex((item) => item.columnId === column.id) : -1
      });
    }

    return rows;
  }

  private getActivePivotValueRows(): ValueToolPanelRowState[] {
    const columns = this.getGroupableToolPanelColumns();
    const pivotValues = this.getCurrentPivotValues();
    const rows: ValueToolPanelRowState[] = [];
    for (let index = 0; index < columns.length; index += 1) {
      const column = columns[index];
      const pivotValue = pivotValues.find((item) => item.columnId === column.id);
      rows.push({
        column,
        aggregateType: pivotValue?.type ?? null,
        order: pivotValue ? pivotValues.findIndex((item) => item.columnId === column.id) : -1
      });
    }

    return rows;
  }

  private moveOrderedColumnModel(
    model: Array<{ columnId: string }>,
    columnId: string,
    direction: 'up' | 'down'
  ): Array<{ columnId: string }> {
    const currentIndex = model.findIndex((item) => item.columnId === columnId);
    if (currentIndex === -1) {
      return model.map((item) => ({ ...item }));
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= model.length) {
      return model.map((item) => ({ ...item }));
    }

    const nextModel = model.map((item) => ({ ...item }));
    const [movedItem] = nextModel.splice(currentIndex, 1);
    nextModel.splice(targetIndex, 0, movedItem);
    return nextModel;
  }

  private getToolPanelTitle(panelId: GridToolPanelId): string {
    if (panelId === 'columns') {
      return this.localeText.toolPanelColumnsTitle;
    }

    if (panelId === 'filters') {
      return this.localeText.toolPanelFiltersTitle;
    }

    if (panelId === 'grouping') {
      return this.localeText.toolPanelGroupingTitle;
    }

    if (panelId === 'pivot') {
      return this.localeText.toolPanelPivotTitle;
    }

    return this.getCustomToolPanelDefinition(panelId)?.title ?? panelId;
  }

  private getPreferredToolPanelId(configuredPanels: GridToolPanelId[]): GridToolPanelId | null {
    if (this.preferredToolPanelId && configuredPanels.indexOf(this.preferredToolPanelId) !== -1) {
      return this.preferredToolPanelId;
    }

    const defaultPanel = this.options.sideBar?.defaultPanel;
    if (defaultPanel && configuredPanels.indexOf(defaultPanel) !== -1) {
      return defaultPanel;
    }

    return configuredPanels[0] ?? null;
  }

  private renderToolPanelRail(): void {
    const configuredPanels = this.getConfiguredToolPanels();
    if (configuredPanels.length === 0) {
      this.toolPanelRailElement.replaceChildren();
      this.toolPanelRailElement.style.display = 'none';
      this.syncToolPanelDockLayout();
      return;
    }

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'hgrid__tool-panel-toggle';
    toggleButton.dataset.toolPanelToggle = 'true';
    toggleButton.setAttribute('aria-expanded', this.openToolPanelId ? 'true' : 'false');
    toggleButton.setAttribute('aria-label', this.openToolPanelId ? this.localeText.toolPanelClose : this.localeText.toolPanelToggle);

    const iconElement = document.createElement('span');
    iconElement.className = 'hgrid__tool-panel-toggle-icon';
    iconElement.textContent = this.openToolPanelId ? '×' : '≡';

    const labelElement = document.createElement('span');
    labelElement.className = 'hgrid__tool-panel-toggle-label';
    labelElement.textContent = this.openToolPanelId
      ? this.getToolPanelTitle(this.openToolPanelId)
      : this.localeText.toolPanelToggle;

    toggleButton.append(iconElement, labelElement);

    this.toolPanelRailElement.replaceChildren(toggleButton);
    this.toolPanelRailElement.style.display = this.openToolPanelId ? 'none' : 'flex';
    this.syncToolPanelDockLayout();
  }

  private createToolPanelHeader(panelId: GridToolPanelId): HTMLDivElement {
    const headerElement = document.createElement('div');
    headerElement.className = 'hgrid__tool-panel-header';

    const configuredPanels = this.getConfiguredToolPanels();
    let titleOrTabsElement: HTMLElement;
    if (configuredPanels.length > 1) {
      const tabsElement = document.createElement('div');
      tabsElement.className = 'hgrid__tool-panel-tabs';
      tabsElement.setAttribute('role', 'tablist');
      for (let index = 0; index < configuredPanels.length; index += 1) {
        const configuredPanelId = configuredPanels[index];
        const tabElement = document.createElement('button');
        tabElement.type = 'button';
        tabElement.className = 'hgrid__tool-panel-tab';
        tabElement.dataset.toolPanelTabId = configuredPanelId;
        tabElement.setAttribute('role', 'tab');
        tabElement.setAttribute('aria-selected', configuredPanelId === panelId ? 'true' : 'false');
        tabElement.tabIndex = configuredPanelId === panelId ? 0 : -1;
        tabElement.textContent = this.getToolPanelTitle(configuredPanelId);
        if (configuredPanelId === panelId) {
          tabElement.classList.add('hgrid__tool-panel-tab--active');
        }
        tabsElement.append(tabElement);
      }
      titleOrTabsElement = tabsElement;
    } else {
      const titleElement = document.createElement('div');
      titleElement.className = 'hgrid__tool-panel-title';
      titleElement.textContent = this.getToolPanelTitle(panelId);
      titleOrTabsElement = titleElement;
    }

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'hgrid__tool-panel-close';
    closeButton.dataset.toolPanelAction = 'close';
    closeButton.setAttribute('aria-label', this.localeText.toolPanelClose);
    closeButton.textContent = '×';

    headerElement.append(titleOrTabsElement, closeButton);
    return headerElement;
  }

  private renderColumnsToolPanel(): void {
    const headerElement = this.createToolPanelHeader('columns');

    const contentElement = document.createElement('div');
    contentElement.className = 'hgrid__tool-panel-columns';

    this.reconcileToolPanelColumnLayoutPresetState();

    const layoutPresets = this.getColumnLayoutPresets();
    if (layoutPresets.length > 0) {
      const presetSectionElement = document.createElement('div');
      presetSectionElement.className = 'hgrid__tool-panel-columns-presets';

      const titleElement = document.createElement('div');
      titleElement.className = 'hgrid__advanced-filter-presets-title';
      titleElement.textContent = this.localeText.toolPanelLayoutPresets;

      const selectElement = document.createElement('select');
      selectElement.className = 'hgrid__filter-panel-select';
      selectElement.dataset.toolPanelColumnsPresetSelect = 'true';

      for (let index = 0; index < layoutPresets.length; index += 1) {
        const preset = layoutPresets[index];
        const optionElement = document.createElement('option');
        optionElement.value = preset.id;
        optionElement.textContent = preset.label;
        selectElement.append(optionElement);
      }

      if (this.toolPanelColumnLayoutPresetId) {
        selectElement.value = this.toolPanelColumnLayoutPresetId;
      }

      const currentLayout = this.getCurrentColumnLayout();
      const selectedPreset = layoutPresets.find((preset) => preset.id === this.toolPanelColumnLayoutPresetId) ?? null;
      const applyButton = this.createToolPanelFilterActionButton('apply', this.localeText.toolPanelApplyLayoutPreset);
      applyButton.dataset.toolPanelColumnsPresetAction = 'apply';
      delete applyButton.dataset.toolPanelFilterAction;
      applyButton.disabled =
        !selectedPreset || JSON.stringify(selectedPreset.layout) === JSON.stringify(currentLayout);

      const actionRowElement = document.createElement('div');
      actionRowElement.className = 'hgrid__filter-panel-actions';
      actionRowElement.append(applyButton);

      presetSectionElement.append(
        titleElement,
        this.createFilterField(this.localeText.toolPanelLayoutPresets, selectElement),
        actionRowElement
      );
      contentElement.append(presetSectionElement);
    }

    const searchShellElement = document.createElement('div');
    searchShellElement.className = 'hgrid__tool-panel-search-shell';

    const searchInputElement = document.createElement('input');
    searchInputElement.type = 'search';
    searchInputElement.className = 'hgrid__tool-panel-search-input';
    searchInputElement.placeholder = this.localeText.toolPanelSearchColumns;
    searchInputElement.value = this.toolPanelColumnSearchQuery;
    searchInputElement.dataset.toolPanelColumnsSearch = 'true';
    searchInputElement.setAttribute('aria-label', this.localeText.toolPanelSearchColumns);

    searchShellElement.append(searchInputElement);
    contentElement.append(searchShellElement);

    const listElement = document.createElement('div');
    listElement.className = 'hgrid__tool-panel-columns-list';

    const rows = this.getColumnsToolPanelRows();
    if (rows.length === 0) {
      const emptyElement = document.createElement('div');
      emptyElement.className = 'hgrid__tool-panel-empty';
      emptyElement.textContent = this.localeText.toolPanelNoColumns;
      listElement.append(emptyElement);
      contentElement.append(listElement);
      this.toolPanelBodyElement.replaceChildren(headerElement, contentElement);
      return;
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowElement = document.createElement('div');
      rowElement.className = 'hgrid__tool-panel-column-row';

      const labelElement = document.createElement('label');
      labelElement.className = 'hgrid__tool-panel-column-label';

      const checkboxElement = document.createElement('input');
      checkboxElement.type = 'checkbox';
      checkboxElement.checked = row.isVisible;
      checkboxElement.disabled = !row.canHide;
      checkboxElement.dataset.toolPanelVisibilityColumnId = row.column.id;

      const metaElement = document.createElement('span');
      metaElement.className = 'hgrid__tool-panel-column-order';
      metaElement.textContent = `${row.order + 1}`;

      const textWrapElement = document.createElement('span');
      textWrapElement.className = 'hgrid__tool-panel-column-text';

      const textElement = document.createElement('span');
      textElement.className = 'hgrid__tool-panel-column-title';
      textElement.textContent = row.column.header;

      const subtextElement = document.createElement('span');
      subtextElement.className = 'hgrid__tool-panel-column-subtitle';
      subtextElement.textContent = row.column.id;

      textWrapElement.append(textElement, subtextElement);
      labelElement.append(checkboxElement, metaElement, textWrapElement);

      const reorderElement = document.createElement('div');
      reorderElement.className = 'hgrid__tool-panel-column-reorder';

      const upButton = document.createElement('button');
      upButton.type = 'button';
      upButton.className = 'hgrid__tool-panel-order-button';
      upButton.dataset.toolPanelOrderKind = 'columns';
      upButton.dataset.toolPanelOrderColumnId = row.column.id;
      upButton.dataset.toolPanelOrderDirection = 'up';
      upButton.disabled = !row.canMoveUp;
      upButton.setAttribute('aria-label', this.localeText.toolPanelMoveColumnUp);
      upButton.textContent = '↑';

      const downButton = document.createElement('button');
      downButton.type = 'button';
      downButton.className = 'hgrid__tool-panel-order-button';
      downButton.dataset.toolPanelOrderKind = 'columns';
      downButton.dataset.toolPanelOrderColumnId = row.column.id;
      downButton.dataset.toolPanelOrderDirection = 'down';
      downButton.disabled = !row.canMoveDown;
      downButton.setAttribute('aria-label', this.localeText.toolPanelMoveColumnDown);
      downButton.textContent = '↓';

      reorderElement.append(upButton, downButton);

      const pinSelectElement = document.createElement('select');
      pinSelectElement.className = 'hgrid__tool-panel-pin-select';
      pinSelectElement.dataset.toolPanelPinColumnId = row.column.id;

      const pinOptions: Array<{ value: string; label: string }> = [
        { value: 'none', label: this.localeText.columnMenuUnpin },
        { value: 'left', label: this.localeText.columnMenuPinLeft },
        { value: 'right', label: this.localeText.columnMenuPinRight }
      ];
      for (let optionIndex = 0; optionIndex < pinOptions.length; optionIndex += 1) {
        const pinOption = pinOptions[optionIndex];
        const optionElement = document.createElement('option');
        optionElement.value = pinOption.value;
        optionElement.textContent = pinOption.label;
        pinSelectElement.append(optionElement);
      }

      pinSelectElement.value = row.column.pinned ?? 'none';
      rowElement.append(labelElement, reorderElement, pinSelectElement);
      listElement.append(rowElement);
    }

    contentElement.append(listElement);
    this.toolPanelBodyElement.replaceChildren(headerElement, contentElement);
  }

  private renderFiltersToolPanel(): void {
    const headerElement = this.createToolPanelHeader('filters');
    const contentElement = document.createElement('div');
    contentElement.className = 'hgrid__tool-panel-filters';
    const surfaceTabsElement = document.createElement('div');
    surfaceTabsElement.className = 'hgrid__tool-panel-filter-surface-tabs';

    const quickButton = document.createElement('button');
    quickButton.type = 'button';
    quickButton.className = 'hgrid__tool-panel-filter-surface-tab';
    quickButton.dataset.toolPanelFilterSurface = 'quick';
    quickButton.textContent = this.localeText.filterPanelQuickMode;
    quickButton.classList.toggle('hgrid__tool-panel-filter-surface-tab--active', this.activeToolPanelFilterSurface === 'quick');

    const builderButton = document.createElement('button');
    builderButton.type = 'button';
    builderButton.className = 'hgrid__tool-panel-filter-surface-tab';
    builderButton.dataset.toolPanelFilterSurface = 'builder';
    builderButton.textContent = this.localeText.filterPanelBuilderMode;
    builderButton.classList.toggle(
      'hgrid__tool-panel-filter-surface-tab--active',
      this.activeToolPanelFilterSurface === 'builder'
    );

    surfaceTabsElement.append(quickButton, builderButton);
    contentElement.append(surfaceTabsElement);

    if (this.activeToolPanelFilterSurface === 'builder') {
      contentElement.append(this.createAdvancedFilterBuilderToolPanelContent());
    } else {
      contentElement.append(this.createQuickFilterToolPanelContent());
    }

    this.toolPanelBodyElement.replaceChildren(headerElement, contentElement);
  }

  private createQuickFilterToolPanelContent(): HTMLElement {
    const contentFragment = document.createDocumentFragment();
    const columnListElement = document.createElement('div');
    columnListElement.className = 'hgrid__tool-panel-filter-columns';
    const filterableColumns = this.getFilterableToolPanelColumns();
    const activeColumn = this.getActiveToolPanelFilterColumn();

    for (let index = 0; index < filterableColumns.length; index += 1) {
      const column = filterableColumns[index];
      const buttonElement = document.createElement('button');
      buttonElement.type = 'button';
      buttonElement.className = 'hgrid__tool-panel-filter-column';
      buttonElement.dataset.toolPanelFilterColumnId = column.id;
      buttonElement.textContent = column.header;
      if (activeColumn && column.id === activeColumn.id) {
        buttonElement.classList.add('hgrid__tool-panel-filter-column--active');
      }
      if (this.hasActiveColumnFilter(column.id)) {
        buttonElement.classList.add('hgrid__tool-panel-filter-column--filtered');
      }
      columnListElement.append(buttonElement);
    }

    const editorElement = document.createElement('div');
    editorElement.className = 'hgrid__tool-panel-filter-editor';
    if (activeColumn && this.activeToolPanelFilterMode) {
      const titleElement = document.createElement('div');
      titleElement.className = 'hgrid__filter-panel-title';
      titleElement.textContent = `${this.localeText.filterPanelTitle} · ${activeColumn.header}`;
      editorElement.append(titleElement);

      if (this.canSwitchTextSetFilter(activeColumn)) {
        const modeToggleElement = document.createElement('div');
        modeToggleElement.className = 'hgrid__filter-panel-mode-toggle';

        const textModeButton = document.createElement('button');
        textModeButton.type = 'button';
        textModeButton.className = 'hgrid__filter-panel-mode';
        textModeButton.dataset.toolPanelFilterModeTrigger = 'text';
        textModeButton.textContent = this.localeText.filterPanelTextMode;
        textModeButton.setAttribute('aria-pressed', this.activeToolPanelFilterMode === 'text' ? 'true' : 'false');
        textModeButton.classList.toggle('hgrid__filter-panel-mode--active', this.activeToolPanelFilterMode === 'text');

        const setModeButton = document.createElement('button');
        setModeButton.type = 'button';
        setModeButton.className = 'hgrid__filter-panel-mode';
        setModeButton.dataset.toolPanelFilterModeTrigger = 'set';
        setModeButton.textContent = this.localeText.filterPanelSetMode;
        setModeButton.setAttribute('aria-pressed', this.activeToolPanelFilterMode === 'set' ? 'true' : 'false');
        setModeButton.classList.toggle('hgrid__filter-panel-mode--active', this.activeToolPanelFilterMode === 'set');

        modeToggleElement.append(textModeButton, setModeButton);
        editorElement.append(modeToggleElement);
      }

      const formElement = document.createElement('div');
      formElement.className = 'hgrid__filter-panel-form';
      this.appendToolPanelFilterEditorFields(formElement, activeColumn, this.activeToolPanelFilterMode);
      editorElement.append(formElement);

      const actionRowElement = document.createElement('div');
      actionRowElement.className = 'hgrid__filter-panel-actions';
      actionRowElement.append(
        this.createToolPanelFilterActionButton('apply', this.localeText.filterPanelApply),
        this.createToolPanelFilterActionButton('clear', this.localeText.filterPanelClear)
      );
      editorElement.append(actionRowElement);
    }

    contentFragment.append(columnListElement, editorElement);

    const wrapper = document.createElement('div');
    wrapper.className = 'hgrid__tool-panel-filter-surface';
    wrapper.append(contentFragment);
    return wrapper;
  }

  private createAdvancedFilterPresetSection(): HTMLDivElement {
    const sectionElement = document.createElement('div');
    sectionElement.className = 'hgrid__advanced-filter-presets';

    const titleElement = document.createElement('div');
    titleElement.className = 'hgrid__advanced-filter-presets-title';
    titleElement.textContent = this.localeText.filterPanelPresetsTitle;

    const presets = this.getAdvancedFilterPresets();
    const selectElement = document.createElement('select');
    selectElement.className = 'hgrid__filter-panel-select';
    selectElement.dataset.advancedFilterPresetSelect = 'true';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = this.localeText.filterPanelPresetEmpty;
    selectElement.append(emptyOption);

    for (let index = 0; index < presets.length; index += 1) {
      const preset = presets[index];
      const optionElement = document.createElement('option');
      optionElement.value = preset.id;
      optionElement.textContent = preset.label;
      selectElement.append(optionElement);
    }
    selectElement.value = this.toolPanelAdvancedFilterPresetId ?? '';

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'hgrid__filter-panel-input';
    labelInput.placeholder = this.localeText.filterPanelPresetName;
    labelInput.value = this.toolPanelAdvancedFilterPresetLabel;
    labelInput.dataset.advancedFilterPresetLabel = 'true';

    const actionRowElement = document.createElement('div');
    actionRowElement.className = 'hgrid__filter-panel-actions';

    const saveButton = this.createToolPanelFilterActionButton('apply', this.localeText.filterPanelPresetSave);
    saveButton.dataset.advancedFilterPresetAction = 'save';
    delete saveButton.dataset.toolPanelFilterAction;

    const applyButton = this.createToolPanelFilterActionButton('apply', this.localeText.filterPanelPresetApply);
    applyButton.dataset.advancedFilterPresetAction = 'apply';
    applyButton.disabled = presets.length === 0 || !this.toolPanelAdvancedFilterPresetId;
    delete applyButton.dataset.toolPanelFilterAction;

    const deleteButton = this.createToolPanelFilterActionButton('clear', this.localeText.filterPanelPresetDelete);
    deleteButton.dataset.advancedFilterPresetAction = 'delete';
    delete deleteButton.dataset.toolPanelFilterAction;
    deleteButton.disabled = presets.length === 0 || !this.toolPanelAdvancedFilterPresetId;

    actionRowElement.append(saveButton, applyButton, deleteButton);
    sectionElement.append(
      titleElement,
      this.createFilterField(this.localeText.filterPanelPresetsTitle, selectElement),
      this.createFilterField(this.localeText.filterPanelPresetName, labelInput),
      actionRowElement
    );
    return sectionElement;
  }

  private createAdvancedFilterBuilderToolPanelContent(): HTMLElement {
    this.reconcileToolPanelAdvancedFilterDraft();
    this.reconcileToolPanelAdvancedFilterPresetState();
    const wrapper = document.createElement('div');
    wrapper.className = 'hgrid__tool-panel-filter-builder';

    const draft = this.toolPanelAdvancedFilterDraft;
    const titleElement = document.createElement('div');
    titleElement.className = 'hgrid__filter-panel-title';
    titleElement.textContent = this.localeText.filterPanelBuilderMode;
    wrapper.append(titleElement, this.createAdvancedFilterPresetSection());

    if (!draft) {
      const emptyElement = document.createElement('div');
      emptyElement.className = 'hgrid__advanced-filter-empty';
      emptyElement.textContent = this.localeText.filterPanelNoRules;
      wrapper.append(emptyElement);
      return wrapper;
    }

    const matchSelect = this.createFilterSelect(['and', 'or'], draft.operator);
    matchSelect.dataset.advancedFilterRole = 'match';

    const matchRow = document.createElement('div');
    matchRow.className = 'hgrid__advanced-filter-match-row';
    matchRow.append(this.createFilterField(this.localeText.filterPanelMatch, matchSelect));
    wrapper.append(matchRow);

    const rulesElement = document.createElement('div');
    rulesElement.className = 'hgrid__advanced-filter-rules';
    const availableColumns = this.getFilterableToolPanelColumns();

    for (let index = 0; index < draft.rules.length; index += 1) {
      const nodeElement = this.createAdvancedFilterBuilderNodeElement(String(index), draft.rules[index], availableColumns, 0);
      if (nodeElement) {
        rulesElement.append(nodeElement);
      }
    }

    wrapper.append(rulesElement);

    const actionRowElement = document.createElement('div');
    actionRowElement.className = 'hgrid__filter-panel-actions';
    const addRuleButton = this.createToolPanelFilterActionButton('apply', this.localeText.filterPanelAddRule);
    addRuleButton.classList.remove('hgrid__filter-panel-action--primary');
    addRuleButton.dataset.advancedFilterAction = 'add-rule';
    delete addRuleButton.dataset.toolPanelFilterAction;

    const addGroupButton = this.createToolPanelFilterActionButton('apply', this.localeText.filterPanelAddGroup);
    addGroupButton.classList.remove('hgrid__filter-panel-action--primary');
    addGroupButton.dataset.advancedFilterAction = 'add-group';
    delete addGroupButton.dataset.toolPanelFilterAction;

    const applyButton = this.createToolPanelFilterActionButton('apply', this.localeText.filterPanelApply);
    applyButton.dataset.advancedFilterAction = 'apply';
    delete applyButton.dataset.toolPanelFilterAction;

    const clearButton = this.createToolPanelFilterActionButton('clear', this.localeText.filterPanelClear);
    clearButton.dataset.advancedFilterAction = 'clear';
    delete clearButton.dataset.toolPanelFilterAction;

    actionRowElement.append(addRuleButton, addGroupButton, applyButton, clearButton);
    wrapper.append(actionRowElement);

    return wrapper;
  }

  private createAdvancedFilterBuilderNodeElement(
    path: string,
    node: AdvancedFilterNode,
    availableColumns: ColumnDef[],
    depth: number
  ): HTMLElement | null {
    if (isAdvancedFilterGroup(node)) {
      return this.createAdvancedFilterGroupNodeElement(path, node, availableColumns, depth);
    }

    return this.createAdvancedFilterRuleNodeElement(path, node, availableColumns, depth);
  }

  private createAdvancedFilterSetConditionFields(
    path: string,
    column: ColumnDef,
    condition: SetFilterCondition
  ): HTMLElement[] {
    const searchElement = this.createFilterInput('text', this.getAdvancedFilterSetSearchQuery(path));
    searchElement.className = 'hgrid__filter-panel-search';
    searchElement.placeholder = this.localeText.filterPanelSearch;
    searchElement.dataset.advancedFilterRole = 'set-search';
    searchElement.dataset.advancedFilterPath = path;

    const listElement = document.createElement('div');
    listElement.className = 'hgrid__filter-panel-set-list hgrid__tool-panel-filter-set-list';

    const setOptions = this.getAdvancedFilterSetOptions(column, path);
    const selectedKeys = this.getSetConditionSelectedKeys(condition);
    for (let index = 0; index < setOptions.length; index += 1) {
      const option = setOptions[index];
      const optionLabel = document.createElement('label');
      optionLabel.className = 'hgrid__filter-panel-set-option hgrid__tool-panel-filter-set-option';
      optionLabel.dataset.toolPanelFilterOptionLabel = option.label.toLowerCase();

      const checkboxElement = document.createElement('input');
      checkboxElement.type = 'checkbox';
      checkboxElement.checked = selectedKeys.has(option.key);
      checkboxElement.dataset.advancedFilterRole = 'set-option';
      checkboxElement.dataset.advancedFilterPath = path;
      checkboxElement.dataset.advancedFilterSetKey = option.key;

      const textElement = document.createElement('span');
      textElement.textContent = option.label;

      optionLabel.append(checkboxElement, textElement);
      listElement.append(optionLabel);
    }

    return [
      this.createFilterField(this.localeText.filterPanelSearch, searchElement),
      listElement
    ];
  }

  private createAdvancedFilterRuleNodeElement(
    path: string,
    node: AdvancedFilterNode,
    availableColumns: ColumnDef[],
    depth: number
  ): HTMLElement | null {
    if (isAdvancedFilterGroup(node)) {
      return null;
    }

    const resolvedColumn = availableColumns.find((column) => column.id === node.columnId) ?? availableColumns[0];
    if (!resolvedColumn) {
      return null;
    }

    const ruleElement = document.createElement('div');
    ruleElement.className = 'hgrid__advanced-filter-rule';
    ruleElement.dataset.advancedFilterPath = path;
    ruleElement.style.setProperty('--hgrid-advanced-filter-depth', String(depth));

    const headerElement = document.createElement('div');
    headerElement.className = 'hgrid__advanced-filter-rule-header';

    const columnSelect = document.createElement('select');
    columnSelect.className = 'hgrid__filter-panel-select';
    columnSelect.dataset.advancedFilterRole = 'column';
    columnSelect.dataset.advancedFilterPath = path;
    for (let optionIndex = 0; optionIndex < availableColumns.length; optionIndex += 1) {
      const optionColumn = availableColumns[optionIndex];
      const optionElement = document.createElement('option');
      optionElement.value = optionColumn.id;
      optionElement.textContent = optionColumn.header;
      columnSelect.append(optionElement);
    }
    columnSelect.value = resolvedColumn.id;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'hgrid__advanced-filter-remove';
    removeButton.dataset.advancedFilterAction = 'remove-node';
    removeButton.dataset.advancedFilterPath = path;
    removeButton.textContent = this.localeText.filterPanelRemoveRule;

    headerElement.append(this.createFilterField(this.localeText.filterPanelColumn, columnSelect), removeButton);
    ruleElement.append(headerElement);

    const condition = this.normalizeAdvancedFilterRuleConditionForColumn(resolvedColumn, node.condition);
    if (this.supportsAdvancedFilterSetCondition(resolvedColumn)) {
      const conditionKindSelect = document.createElement('select');
      conditionKindSelect.className = 'hgrid__filter-panel-select';
      conditionKindSelect.dataset.advancedFilterRole = 'condition-kind';
      conditionKindSelect.dataset.advancedFilterPath = path;

      const allowedKinds = resolvedColumn.type === 'boolean' ? ['set'] : ['text', 'set'];
      for (let index = 0; index < allowedKinds.length; index += 1) {
        const kind = allowedKinds[index];
        const optionElement = document.createElement('option');
        optionElement.value = kind;
        optionElement.textContent = kind === 'set' ? this.localeText.filterPanelSetMode : this.localeText.filterPanelTextMode;
        conditionKindSelect.append(optionElement);
      }
      conditionKindSelect.value = condition.kind === 'set' ? 'set' : 'text';
      ruleElement.append(this.createFilterField(this.localeText.filterPanelConditionKind, conditionKindSelect));
    }

    if (condition.kind !== 'set') {
      const operatorSelect = this.createFilterSelect(
        resolvedColumn.type === 'number' ? NUMBER_FILTER_OPERATORS : resolvedColumn.type === 'date' ? DATE_FILTER_OPERATORS : TEXT_FILTER_OPERATORS,
        (condition as { operator?: string }).operator ?? (resolvedColumn.type === 'number' ? 'eq' : resolvedColumn.type === 'date' ? 'on' : 'contains')
      );
      operatorSelect.dataset.advancedFilterRole = 'condition-operator';
      operatorSelect.dataset.advancedFilterPath = path;
      ruleElement.append(this.createFilterField(this.localeText.filterPanelOperator, operatorSelect));
    }

    if (resolvedColumn.type === 'number') {
      const numberCondition: Extract<ColumnFilterCondition, { kind: 'number' }> =
        condition.kind === 'number' ? condition : { kind: 'number', operator: 'eq' };
      const valueInput = this.createFilterInput('number', numberCondition.value === undefined ? '' : String(numberCondition.value));
      valueInput.dataset.advancedFilterRole = 'value';
      valueInput.dataset.advancedFilterPath = path;
      const minInput = this.createFilterInput('number', numberCondition.min === undefined ? '' : String(numberCondition.min));
      minInput.dataset.advancedFilterRole = 'min';
      minInput.dataset.advancedFilterPath = path;
      const maxInput = this.createFilterInput('number', numberCondition.max === undefined ? '' : String(numberCondition.max));
      maxInput.dataset.advancedFilterRole = 'max';
      maxInput.dataset.advancedFilterPath = path;
      ruleElement.append(
        this.createFilterField(this.localeText.filterPanelValue, valueInput),
        this.createFilterField(this.localeText.filterPanelMin, minInput),
        this.createFilterField(this.localeText.filterPanelMax, maxInput)
      );
      return ruleElement;
    }

    if (resolvedColumn.type === 'date') {
      const dateCondition: Extract<ColumnFilterCondition, { kind: 'date' }> =
        condition.kind === 'date' ? condition : { kind: 'date', operator: 'on' };
      const valueInput = this.createFilterInput('date', typeof dateCondition.value === 'string' ? dateCondition.value : '');
      valueInput.dataset.advancedFilterRole = 'value';
      valueInput.dataset.advancedFilterPath = path;
      const minInput = this.createFilterInput('date', typeof dateCondition.min === 'string' ? dateCondition.min : '');
      minInput.dataset.advancedFilterRole = 'min';
      minInput.dataset.advancedFilterPath = path;
      const maxInput = this.createFilterInput('date', typeof dateCondition.max === 'string' ? dateCondition.max : '');
      maxInput.dataset.advancedFilterRole = 'max';
      maxInput.dataset.advancedFilterPath = path;
      ruleElement.append(
        this.createFilterField(this.localeText.filterPanelValue, valueInput),
        this.createFilterField(this.localeText.filterPanelMin, minInput),
        this.createFilterField(this.localeText.filterPanelMax, maxInput)
      );
      return ruleElement;
    }

    if (condition.kind === 'set') {
      const setCondition: SetFilterCondition = condition.kind === 'set' ? condition : { kind: 'set', values: [] };
      const setFields = this.createAdvancedFilterSetConditionFields(path, resolvedColumn, setCondition);
      for (let index = 0; index < setFields.length; index += 1) {
        ruleElement.append(setFields[index]);
      }
      return ruleElement;
    }

    const textCondition: Extract<ColumnFilterCondition, { kind: 'text' }> =
      condition.kind === 'text' ? condition : { kind: 'text', operator: 'contains', value: '' };
    const valueInput = this.createFilterInput('text', textCondition.value ?? '');
    valueInput.dataset.advancedFilterRole = 'value';
    valueInput.dataset.advancedFilterPath = path;
    ruleElement.append(this.createFilterField(this.localeText.filterPanelValue, valueInput));
    return ruleElement;
  }

  private createAdvancedFilterGroupNodeElement(
    path: string,
    node: AdvancedFilterNode,
    availableColumns: ColumnDef[],
    depth: number
  ): HTMLElement | null {
    if (!isAdvancedFilterGroup(node)) {
      return null;
    }

    const groupElement = document.createElement('div');
    groupElement.className = 'hgrid__advanced-filter-group';
    groupElement.dataset.advancedFilterPath = path;
    groupElement.style.setProperty('--hgrid-advanced-filter-depth', String(depth));

    const headerElement = document.createElement('div');
    headerElement.className = 'hgrid__advanced-filter-group-header';

    const titleElement = document.createElement('div');
    titleElement.className = 'hgrid__advanced-filter-group-title';
    titleElement.textContent = this.localeText.filterPanelGroup;

    const operatorSelect = this.createFilterSelect(['and', 'or'], node.operator);
    operatorSelect.dataset.advancedFilterRole = 'group-operator';
    operatorSelect.dataset.advancedFilterPath = path;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'hgrid__advanced-filter-remove';
    removeButton.dataset.advancedFilterAction = 'remove-node';
    removeButton.dataset.advancedFilterPath = path;
    removeButton.textContent = this.localeText.filterPanelRemoveRule;

    headerElement.append(titleElement, this.createFilterField(this.localeText.filterPanelMatch, operatorSelect), removeButton);
    groupElement.append(headerElement);

    const rulesElement = document.createElement('div');
    rulesElement.className = 'hgrid__advanced-filter-group-rules';
    for (let index = 0; index < node.rules.length; index += 1) {
      const childPath = `${path}.${index}`;
      const childElement = this.createAdvancedFilterBuilderNodeElement(childPath, node.rules[index], availableColumns, depth + 1);
      if (childElement) {
        rulesElement.append(childElement);
      }
    }
    groupElement.append(rulesElement);

    const actionRowElement = document.createElement('div');
    actionRowElement.className = 'hgrid__advanced-filter-group-actions';

    const addRuleButton = this.createToolPanelFilterActionButton('apply', this.localeText.filterPanelAddRule);
    addRuleButton.classList.remove('hgrid__filter-panel-action--primary');
    addRuleButton.dataset.advancedFilterAction = 'add-rule';
    addRuleButton.dataset.advancedFilterPath = path;
    delete addRuleButton.dataset.toolPanelFilterAction;

    const addGroupButton = this.createToolPanelFilterActionButton('apply', this.localeText.filterPanelAddGroup);
    addGroupButton.classList.remove('hgrid__filter-panel-action--primary');
    addGroupButton.dataset.advancedFilterAction = 'add-group';
    addGroupButton.dataset.advancedFilterPath = path;
    delete addGroupButton.dataset.toolPanelFilterAction;

    actionRowElement.append(addRuleButton, addGroupButton);
    groupElement.append(actionRowElement);

    return groupElement;
  }

  private createToolPanelSection(title: string): HTMLDivElement {
    const sectionElement = document.createElement('div');
    sectionElement.className = 'hgrid__tool-panel-section';

    const titleElement = document.createElement('div');
    titleElement.className = 'hgrid__tool-panel-section-title';
    titleElement.textContent = title;

    sectionElement.append(titleElement);
    return sectionElement;
  }

  private createToolPanelModeSelect(
    mode: GroupingMode | PivotingMode,
    modeAttribute: 'grouping' | 'pivot'
  ): HTMLSelectElement {
    const selectElement = document.createElement('select');
    selectElement.className = 'hgrid__tool-panel-mode-select';
    selectElement.dataset.toolPanelModeKind = modeAttribute;

    const options: Array<{ value: string; label: string }> = [
      { value: 'client', label: 'Client' },
      { value: 'server', label: 'Server' }
    ];
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index];
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      selectElement.append(optionElement);
    }

    selectElement.value = mode;
    return selectElement;
  }

  private createToolPanelOrderedColumnRow(
    kind: 'group' | 'pivot',
    activeState: ActiveToolPanelColumnState,
    totalCount: number
  ): HTMLDivElement {
    const rowElement = document.createElement('div');
    rowElement.className = 'hgrid__tool-panel-order-row';

    const labelElement = document.createElement('div');
    labelElement.className = 'hgrid__tool-panel-order-label';
    labelElement.textContent = `${activeState.order + 1}. ${activeState.column.header}`;

    const actionsElement = document.createElement('div');
    actionsElement.className = 'hgrid__tool-panel-order-actions';

    const upButton = document.createElement('button');
    upButton.type = 'button';
    upButton.className = 'hgrid__tool-panel-order-button';
    upButton.dataset.toolPanelOrderKind = kind;
    upButton.dataset.toolPanelOrderColumnId = activeState.column.id;
    upButton.dataset.toolPanelOrderDirection = 'up';
    upButton.disabled = activeState.order === 0;
    upButton.textContent = 'Up';

    const downButton = document.createElement('button');
    downButton.type = 'button';
    downButton.className = 'hgrid__tool-panel-order-button';
    downButton.dataset.toolPanelOrderKind = kind;
    downButton.dataset.toolPanelOrderColumnId = activeState.column.id;
    downButton.dataset.toolPanelOrderDirection = 'down';
    downButton.disabled = activeState.order >= totalCount - 1;
    downButton.textContent = 'Down';

    actionsElement.append(upButton, downButton);
    rowElement.append(labelElement, actionsElement);
    return rowElement;
  }

  private createToolPanelAggregateSelectRow(
    kind: 'group' | 'pivot',
    row: ValueToolPanelRowState
  ): HTMLDivElement {
    const rowElement = document.createElement('div');
    rowElement.className = 'hgrid__tool-panel-column-row';

    const labelElement = document.createElement('div');
    labelElement.className = 'hgrid__tool-panel-column-label';
    labelElement.textContent = row.column.header;

    const selectElement = document.createElement('select');
    selectElement.className = 'hgrid__tool-panel-pin-select';
    selectElement.dataset.toolPanelAggregateKind = kind;
    selectElement.dataset.toolPanelAggregateColumnId = row.column.id;

    const noneOption = document.createElement('option');
    noneOption.value = 'none';
    noneOption.textContent = 'None';
    selectElement.append(noneOption);

    const aggregateTypes = this.getAggregationTypesForColumn(row.column);
    for (let index = 0; index < aggregateTypes.length; index += 1) {
      const aggregateType = aggregateTypes[index];
      const optionElement = document.createElement('option');
      optionElement.value = aggregateType;
      optionElement.textContent = aggregateType.toUpperCase();
      selectElement.append(optionElement);
    }

    selectElement.value = row.aggregateType ?? 'none';
    rowElement.append(labelElement, selectElement);
    return rowElement;
  }

  private renderGroupingToolPanel(): void {
    const headerElement = this.createToolPanelHeader('grouping');
    const contentElement = document.createElement('div');
    contentElement.className = 'hgrid__tool-panel-config';

    const modeSection = this.createToolPanelSection('Mode');
    modeSection.append(this.createToolPanelModeSelect(this.getCurrentGroupingMode(), 'grouping'));

    const activeSection = this.createToolPanelSection('Grouped Columns');
    const activeColumns = this.getActiveGroupingColumns();
    if (activeColumns.length === 0) {
      const emptyElement = document.createElement('div');
      emptyElement.className = 'hgrid__tool-panel-empty';
      emptyElement.textContent = 'No grouped columns';
      activeSection.append(emptyElement);
    } else {
      for (let index = 0; index < activeColumns.length; index += 1) {
        activeSection.append(this.createToolPanelOrderedColumnRow('group', activeColumns[index], activeColumns.length));
      }
    }

    const columnsSection = this.createToolPanelSection('Available Columns');
    const columnsListElement = document.createElement('div');
    columnsListElement.className = 'hgrid__tool-panel-columns';
    const groupModel = this.getCurrentGroupModel();
    const groupableColumns = this.getGroupableToolPanelColumns();
    for (let index = 0; index < groupableColumns.length; index += 1) {
      const column = groupableColumns[index];
      const rowElement = document.createElement('label');
      rowElement.className = 'hgrid__tool-panel-column-row';
      const checkboxElement = document.createElement('input');
      checkboxElement.type = 'checkbox';
      checkboxElement.dataset.toolPanelGroupColumnId = column.id;
      checkboxElement.checked = groupModel.some((item) => item.columnId === column.id);
      const textElement = document.createElement('span');
      textElement.textContent = column.header;
      rowElement.append(checkboxElement, textElement);
      columnsListElement.append(rowElement);
    }
    columnsSection.append(columnsListElement);

    const valuesSection = this.createToolPanelSection('Aggregations');
    const groupingAggregationRows = this.getActiveGroupingAggregationRows();
    for (let index = 0; index < groupingAggregationRows.length; index += 1) {
      valuesSection.append(this.createToolPanelAggregateSelectRow('group', groupingAggregationRows[index]));
    }

    const actionRowElement = document.createElement('div');
    actionRowElement.className = 'hgrid__filter-panel-actions';
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'hgrid__filter-panel-action';
    clearButton.dataset.toolPanelActionKind = 'grouping';
    clearButton.dataset.toolPanelAction = 'clear';
    clearButton.textContent = 'Clear grouping';
    actionRowElement.append(clearButton);

    contentElement.append(modeSection, activeSection, columnsSection, valuesSection, actionRowElement);
    this.toolPanelBodyElement.replaceChildren(headerElement, contentElement);
  }

  private renderPivotToolPanel(): void {
    const headerElement = this.createToolPanelHeader('pivot');
    const contentElement = document.createElement('div');
    contentElement.className = 'hgrid__tool-panel-config';

    const modeSection = this.createToolPanelSection('Mode');
    modeSection.append(this.createToolPanelModeSelect(this.getCurrentPivotingMode(), 'pivot'));

    const activeSection = this.createToolPanelSection('Pivot Columns');
    const activeColumns = this.getActivePivotColumns();
    if (activeColumns.length === 0) {
      const emptyElement = document.createElement('div');
      emptyElement.className = 'hgrid__tool-panel-empty';
      emptyElement.textContent = 'No pivot columns';
      activeSection.append(emptyElement);
    } else {
      for (let index = 0; index < activeColumns.length; index += 1) {
        activeSection.append(this.createToolPanelOrderedColumnRow('pivot', activeColumns[index], activeColumns.length));
      }
    }

    const columnsSection = this.createToolPanelSection('Available Pivot Columns');
    const columnsListElement = document.createElement('div');
    columnsListElement.className = 'hgrid__tool-panel-columns';
    const pivotModel = this.getCurrentPivotModel();
    const groupableColumns = this.getGroupableToolPanelColumns();
    for (let index = 0; index < groupableColumns.length; index += 1) {
      const column = groupableColumns[index];
      const rowElement = document.createElement('label');
      rowElement.className = 'hgrid__tool-panel-column-row';
      const checkboxElement = document.createElement('input');
      checkboxElement.type = 'checkbox';
      checkboxElement.dataset.toolPanelPivotColumnId = column.id;
      checkboxElement.checked = pivotModel.some((item) => item.columnId === column.id);
      const textElement = document.createElement('span');
      textElement.textContent = column.header;
      rowElement.append(checkboxElement, textElement);
      columnsListElement.append(rowElement);
    }
    columnsSection.append(columnsListElement);

    const valuesSection = this.createToolPanelSection('Value Columns');
    const pivotValueRows = this.getActivePivotValueRows();
    for (let index = 0; index < pivotValueRows.length; index += 1) {
      valuesSection.append(this.createToolPanelAggregateSelectRow('pivot', pivotValueRows[index]));
    }

    const actionRowElement = document.createElement('div');
    actionRowElement.className = 'hgrid__filter-panel-actions';
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'hgrid__filter-panel-action';
    clearButton.dataset.toolPanelActionKind = 'pivot';
    clearButton.dataset.toolPanelAction = 'clear';
    clearButton.textContent = 'Clear pivot';
    actionRowElement.append(clearButton);

    contentElement.append(modeSection, activeSection, columnsSection, valuesSection, actionRowElement);
    this.toolPanelBodyElement.replaceChildren(headerElement, contentElement);
  }

  private renderCustomToolPanel(panelDefinition: GridCustomToolPanelDefinition): void {
    const headerElement = this.createToolPanelHeader(panelDefinition.id);
    const contentElement = document.createElement('div');
    contentElement.className = 'hgrid__tool-panel-custom';

    panelDefinition.render({
      container: contentElement,
      state: {
        columns: this.columnCatalog.map((column) => ({ ...column })),
        visibleColumns: this.options.columns.map((column) => ({ ...column })),
        filterModel: cloneGridFilterModel(this.filterModel),
        groupModel: this.getCurrentGroupModel(),
        groupAggregations: this.getCurrentGroupAggregations(),
        groupingMode: this.getCurrentGroupingMode(),
        pivotModel: this.getCurrentPivotModel(),
        pivotValues: this.getCurrentPivotValues(),
        pivotingMode: this.getCurrentPivotingMode()
      },
      actions: {
        closePanel: () => this.closeToolPanel(),
        setFilterModel: (filterModel) => this.customToolPanelActions.setFilterModel(filterModel),
        clearFilterModel: () => this.customToolPanelActions.clearFilterModel(),
        setAdvancedFilterModel: (advancedFilterModel) => this.customToolPanelActions.setAdvancedFilterModel(advancedFilterModel),
        setColumnLayout: (layout) => this.customToolPanelActions.setColumnLayout(layout)
      }
    });

    this.toolPanelBodyElement.replaceChildren(headerElement, contentElement);
  }

  private renderToolPanel(): void {
    if (!this.openToolPanelId || !this.isToolPanelAvailable(this.openToolPanelId)) {
      this.toolPanelElement.classList.remove('hgrid__tool-panel--open');
      this.toolPanelElement.style.display = 'none';
      this.toolPanelElement.style.width = '';
      this.toolPanelBodyElement.replaceChildren();
      this.syncToolPanelDockLayout();
      return;
    }

    if (this.openToolPanelId === 'columns') {
      this.renderColumnsToolPanel();
    } else if (this.openToolPanelId === 'filters') {
      this.renderFiltersToolPanel();
    } else if (this.openToolPanelId === 'grouping') {
      this.renderGroupingToolPanel();
    } else if (this.openToolPanelId === 'pivot') {
      this.renderPivotToolPanel();
    } else {
      const customToolPanel = this.getCustomToolPanelDefinition(this.openToolPanelId);
      if (customToolPanel) {
        this.renderCustomToolPanel(customToolPanel);
      } else {
        this.toolPanelBodyElement.replaceChildren();
      }
    }

    this.toolPanelElement.style.width = `${this.getToolPanelWidth()}px`;
    this.toolPanelElement.classList.add('hgrid__tool-panel--open');
    this.toolPanelElement.style.display = 'flex';
    this.syncToolPanelDockLayout();
  }

  private reconcileToolPanelState(applyDefault: boolean): void {
    const previousDockWidth = this.getToolPanelDockMetrics().totalWidth;
    const configuredPanels = this.getConfiguredToolPanels();
    if (configuredPanels.length === 0) {
      this.openToolPanelId = null;
      this.preferredToolPanelId = null;
      this.activeToolPanelFilterColumnId = null;
      this.activeToolPanelFilterMode = null;
      this.activeToolPanelFilterSurface = 'quick';
      this.toolPanelAdvancedFilterDraft = null;
      this.renderToolPanelRail();
      this.renderToolPanel();
      this.requestToolPanelDockRelayout(previousDockWidth);
      return;
    }

    if (this.openToolPanelId && configuredPanels.indexOf(this.openToolPanelId) === -1) {
      this.openToolPanelId = null;
    }

    if (this.preferredToolPanelId && configuredPanels.indexOf(this.preferredToolPanelId) === -1) {
      this.preferredToolPanelId = null;
    }

    if (!this.openToolPanelId && applyDefault && this.options.sideBar?.initialOpen !== false) {
      const preferredPanel = this.getPreferredToolPanelId(configuredPanels);
      if (preferredPanel) {
        this.openToolPanelId = preferredPanel;
        this.preferredToolPanelId = preferredPanel;
      }
    }

    if (this.openToolPanelId === 'filters') {
      this.reconcileToolPanelFilterState();
      this.reconcileToolPanelAdvancedFilterDraft();
      this.reconcileToolPanelAdvancedFilterPresetState();
    } else {
      this.activeToolPanelFilterColumnId = null;
      this.activeToolPanelFilterMode = null;
      this.activeToolPanelFilterSurface = 'quick';
    }

    this.renderToolPanelRail();
    this.renderToolPanel();
    this.requestToolPanelDockRelayout(previousDockWidth);
  }

  private openToolPanel(panelId: GridToolPanelId): void {
    if (!this.isToolPanelAvailable(panelId)) {
      return;
    }
    if (this.openToolPanelId === panelId) {
      return;
    }

    const previousDockWidth = this.getToolPanelDockMetrics().totalWidth;
    this.closeColumnMenu();
    this.closeFilterPanel();
    this.openToolPanelId = panelId;
    this.preferredToolPanelId = panelId;
    if (panelId === 'filters') {
      this.reconcileToolPanelFilterState();
    }
    this.renderToolPanelRail();
    this.renderToolPanel();
    this.requestToolPanelDockRelayout(previousDockWidth);
  }

  private closeToolPanel(): void {
    if (!this.openToolPanelId && !this.activeToolPanelFilterColumnId && !this.activeToolPanelFilterMode) {
      return;
    }

    const previousDockWidth = this.getToolPanelDockMetrics().totalWidth;
    this.openToolPanelId = null;
    this.activeToolPanelFilterColumnId = null;
    this.activeToolPanelFilterMode = null;
    this.renderToolPanelRail();
    this.renderToolPanel();
    this.requestToolPanelDockRelayout(previousDockWidth);
  }

  private getEditActionBarRuntime() {
    const runtimeOptions = this.options as GridOptions & GridRendererRuntimeOptions;
    return runtimeOptions.__editActionBarRuntime ?? null;
  }

  private isEditActionBarEnabled(): boolean {
    return Boolean(this.options.editPolicy?.actionBar?.enabled === true && this.getEditActionBarRuntime());
  }

  private createEditActionBarButton(
    action: 'save' | 'discard',
    label: string,
    isDisabled: boolean,
    isPending: boolean
  ): HTMLButtonElement {
    const buttonElement = document.createElement('button');
    buttonElement.type = 'button';
    buttonElement.className = 'hgrid__edit-action-bar-button';
    buttonElement.dataset.editActionBarAction = action;
    if (action === 'save') {
      buttonElement.classList.add('hgrid__edit-action-bar-button--primary');
    }
    buttonElement.disabled = isDisabled || isPending;
    buttonElement.textContent = label;
    return buttonElement;
  }

  private normalizeEditActionBarResult(
    result: boolean | void | GridEditActionBarActionResult | null | undefined,
    fallbackMessage: string
  ): { completed: boolean; message: string; tone: GridStatusBarItemTone } {
    if (result === false) {
      return {
        completed: false,
        message: '',
        tone: 'default'
      };
    }

    if (result && typeof result === 'object') {
      return {
        completed: result.completed !== false,
        message: typeof result.message === 'string' ? result.message.trim() : fallbackMessage,
        tone: result.tone === 'active' || result.tone === 'danger' ? result.tone : 'default'
      };
    }

    return {
      completed: true,
      message: fallbackMessage,
      tone: 'active'
    };
  }

  private async runEditActionBarAction(action: 'save' | 'discard'): Promise<void> {
    const runtime = this.getEditActionBarRuntime();
    if (!runtime || this.editActionBarPendingAction) {
      return;
    }

    const state = runtime.getState();
    if (!state.hasDirtyChanges) {
      return;
    }

    const remoteSummary = resolveStatusBarRemoteSummary(this.resolveRemoteStatusDataProvider()?.getDebugState() ?? null);
    const context: GridEditActionBarActionContext = {
      dirtyChanges: state.changes,
      summary: state.summary,
      remote: remoteSummary
    };
    const fallbackMessage =
      action === 'save' ? this.localeText.editActionBarSaved : this.localeText.editActionBarDiscarded;
    const fallbackError =
      action === 'save' ? this.localeText.editActionBarSaveFailed : this.localeText.editActionBarDiscardFailed;

    this.editActionBarPendingAction = action;
    this.editActionBarLastMessage = null;
    this.editActionBarDirty = true;
    this.scheduleRender();

    try {
      const result = action === 'save' ? await runtime.onSave(context) : await runtime.onDiscard(context);
      const normalizedResult = this.normalizeEditActionBarResult(result, fallbackMessage);
      this.editActionBarLastMessage =
        normalizedResult.message.length > 0
          ? {
              text: normalizedResult.message,
              tone: normalizedResult.completed ? normalizedResult.tone : 'danger'
            }
          : null;
    } catch (error) {
      const errorMessage = error instanceof Error && error.message.trim().length > 0 ? error.message.trim() : fallbackError;
      this.editActionBarLastMessage = {
        text: errorMessage,
        tone: 'danger'
      };
    } finally {
      this.editActionBarPendingAction = null;
      this.editActionBarDirty = true;
      this.scheduleRender();
    }
  }

  private renderEditActionBar(): void {
    if (!this.isEditActionBarEnabled()) {
      this.editActionBarElement.style.display = 'none';
      this.editActionBarMainElement.replaceChildren();
      this.editActionBarActionsElement.replaceChildren();
      this.editActionBarMessageElement.textContent = '';
      this.editActionBarMessageElement.className = 'hgrid__edit-action-bar-message';
      return;
    }

    const runtime = this.getEditActionBarRuntime();
    if (!runtime) {
      return;
    }

    const state = runtime.getState();
    const remoteSummary = resolveStatusBarRemoteSummary(this.resolveRemoteStatusDataProvider()?.getDebugState() ?? null);
    const hasActionableChanges = state.hasDirtyChanges;
    const hasRemoteIssues = Boolean(remoteSummary && (remoteSummary.isPending || remoteSummary.hasError));
    const hasMessage = Boolean(this.editActionBarLastMessage && this.editActionBarLastMessage.text.length > 0);
    const shouldShow = hasActionableChanges || hasRemoteIssues || hasMessage || this.editActionBarPendingAction !== null;
    if (!shouldShow) {
      this.editActionBarElement.style.display = 'none';
      this.editActionBarMainElement.replaceChildren();
      this.editActionBarActionsElement.replaceChildren();
      this.editActionBarMessageElement.textContent = '';
      this.editActionBarMessageElement.className = 'hgrid__edit-action-bar-message';
      return;
    }

    this.editActionBarElement.style.display = 'flex';

    const summaryItems: HTMLElement[] = [];
    if (state.summary.rowCount > 0 || state.summary.cellCount > 0) {
      summaryItems.push(
        this.createStatusBarItem(
          'editActionBarDirty',
          this.localizeText(this.localeText.editActionBarDirtySummary, {
            rows: state.summary.rowCount,
            cells: state.summary.cellCount
          }),
          'active'
        )
      );
    }

    if (remoteSummary?.isPending) {
      summaryItems.push(
        this.createStatusBarItem(
          'editActionBarRemotePending',
          this.localizeText(this.localeText.statusBarRemotePending, {
            rows: remoteSummary.pendingRowCount,
            cells: remoteSummary.pendingCellCount
          }),
          'active'
        )
      );
    }

    if (remoteSummary?.hasError) {
      summaryItems.push(
        this.createStatusBarItem(
          'editActionBarRemoteError',
          this.localizeText(this.localeText.statusBarRemoteError, {
            count: remoteSummary.errorCount
          }),
          'danger'
        )
      );
    }

    const isBusy = this.editActionBarPendingAction !== null;
    const saveLabel =
      this.editActionBarPendingAction === 'save' ? this.localeText.editActionBarSaving : this.localeText.editActionBarSave;
    const discardLabel =
      this.editActionBarPendingAction === 'discard'
        ? this.localeText.editActionBarDiscarding
        : this.localeText.editActionBarDiscard;

    this.editActionBarMainElement.replaceChildren(...summaryItems);
    this.editActionBarActionsElement.replaceChildren(
      this.createEditActionBarButton('discard', discardLabel, !hasActionableChanges, isBusy),
      this.createEditActionBarButton('save', saveLabel, !hasActionableChanges, isBusy)
    );

    const shouldShowMessage = Boolean(
      this.editActionBarLastMessage &&
      this.editActionBarLastMessage.text.length > 0 &&
      (!hasActionableChanges || this.editActionBarLastMessage.tone === 'danger')
    );
    this.editActionBarMessageElement.className = 'hgrid__edit-action-bar-message';
    if (shouldShowMessage && this.editActionBarLastMessage) {
      this.editActionBarMessageElement.textContent = this.editActionBarLastMessage.text;
      if (this.editActionBarLastMessage.tone === 'active') {
        this.editActionBarMessageElement.classList.add('hgrid__edit-action-bar-message--active');
      } else if (this.editActionBarLastMessage.tone === 'danger') {
        this.editActionBarMessageElement.classList.add('hgrid__edit-action-bar-message--danger');
      }
    } else {
      this.editActionBarMessageElement.textContent = '';
    }
  }

  private isStatusBarEnabled(): boolean {
    return Boolean(this.options.statusBar && this.options.statusBar.enabled === true);
  }

  private getResolvedCustomStatusBarItems(): GridStatusBarCustomItemDefinition[] {
    return Array.isArray(this.options.statusBar?.customItems) ? this.options.statusBar.customItems.slice() : [];
  }

  private getResolvedStatusBarItems(): string[] {
    const configuredItems = this.options.statusBar?.items;
    const customItems = this.getResolvedCustomStatusBarItems();
    const customItemIds = new Set<string>(customItems.map((item) => item.id));
    if (!Array.isArray(configuredItems) || configuredItems.length === 0) {
      return ['selection', 'aggregates', 'rows', 'remote', ...customItems.map((item) => item.id)];
    }

    const resolvedItems: string[] = [];
    for (let index = 0; index < configuredItems.length; index += 1) {
      const item = configuredItems[index];
      const isBuiltIn = item === 'selection' || item === 'aggregates' || item === 'rows' || item === 'remote';
      if (
        !isBuiltIn &&
        !customItemIds.has(item)
      ) {
        continue;
      }
      if (resolvedItems.indexOf(item) === -1) {
        resolvedItems.push(item);
      }
    }

    return resolvedItems.length > 0 ? resolvedItems : ['selection', 'aggregates', 'rows', 'remote', ...customItems.map((item) => item.id)];
  }

  private resolveStatusBarCustomItem(
    itemId: string,
    context: GridStatusBarCustomItemRenderContext
  ): { text: string; tone: GridStatusBarItemTone; align: GridStatusBarItemAlign } | null {
    const itemDefinition = this.getResolvedCustomStatusBarItems().find((item) => item.id === itemId) ?? null;
    if (!itemDefinition) {
      return null;
    }

    const renderedValue = itemDefinition.render(context);
    if (typeof renderedValue === 'string') {
      const text = renderedValue.trim();
      return text.length > 0
        ? {
            text,
            tone: 'default',
            align: itemDefinition.align ?? 'meta'
          }
        : null;
    }

    if (!renderedValue || typeof renderedValue !== 'object' || typeof renderedValue.text !== 'string') {
      return null;
    }

    const text = renderedValue.text.trim();
    if (text.length === 0) {
      return null;
    }

    return {
      text,
      tone:
        renderedValue.tone === 'active' || renderedValue.tone === 'danger'
          ? renderedValue.tone
          : 'default',
      align:
        renderedValue.align === 'main' || renderedValue.align === 'meta'
          ? renderedValue.align
          : itemDefinition.align ?? 'meta'
    };
  }

  private resolveRemoteStatusDataProvider(): RemoteDataProvider | null {
    const dataProvider = this.options.dataProvider;
    if (dataProvider instanceof RemoteServerSideViewDataProvider) {
      return dataProvider.getSourceDataProvider();
    }

    return dataProvider instanceof RemoteDataProvider ? dataProvider : null;
  }

  private getStatusBarAggregateAsyncThreshold(): number {
    const configuredThreshold = this.options.statusBar?.aggregateAsyncThreshold;
    return typeof configuredThreshold === 'number' && Number.isFinite(configuredThreshold)
      ? Math.max(1, Math.floor(configuredThreshold))
      : 4_000;
  }

  private getStatusBarAggregateChunkSize(): number {
    const configuredChunkSize = this.options.statusBar?.aggregateChunkSize;
    return typeof configuredChunkSize === 'number' && Number.isFinite(configuredChunkSize)
      ? Math.max(1, Math.floor(configuredChunkSize))
      : 2_000;
  }

  private resolveStatusBarAggregateCellValue(rowIndex: number, columnIndex: number): unknown {
    const column = this.options.columns[columnIndex];
    if (!column) {
      return undefined;
    }

    const dataIndex = this.options.rowModel.getDataIndex(rowIndex);
    if (dataIndex < 0) {
      return undefined;
    }

    return this.options.dataProvider.getValue(dataIndex, column.id);
  }

  private resolveStatusBarAggregateIsNumericColumn(columnIndex: number): boolean {
    const column = this.options.columns[columnIndex];
    return Boolean(column && column.type === 'number' && !this.isSystemUtilityColumnId(column.id));
  }

  private scheduleStatusBarAggregateSummaryComputation(
    selectionRectangle: SelectionRectangle,
    computationId: number
  ): void {
    void computeSelectionAggregateSummaryChunked(selectionRectangle, {
      chunkSize: this.getStatusBarAggregateChunkSize(),
      shouldContinue: () => computationId === this.statusBarAggregateComputationId,
      onProgress: (summary) => {
        if (computationId !== this.statusBarAggregateComputationId) {
          return;
        }

        this.statusBarAggregateSummary = summary;
        this.statusBarDirty = true;
        this.scheduleRender();
      },
      isNumericColumn: (columnIndex) => this.resolveStatusBarAggregateIsNumericColumn(columnIndex),
      readNumericCell: (rowIndex, columnIndex) => this.resolveStatusBarAggregateCellValue(rowIndex, columnIndex)
    }).then((summary) => {
      if (computationId !== this.statusBarAggregateComputationId) {
        return;
      }

      this.statusBarAggregateSummary = summary;
      this.statusBarDirty = true;
      this.scheduleRender();
    });
  }

  private refreshStatusBarSummary(): void {
    if (!this.isStatusBarEnabled()) {
      this.statusBarAggregateComputationId += 1;
      this.statusBarSelectionSummary = null;
      this.statusBarAggregateSummary = null;
      this.statusBarNeedsSummaryRefresh = false;
      return;
    }

    const bounds = this.getSelectionBounds();
    const selection = this.selectionModel.getSelection();
    const fallbackActiveCell = resolveInitialActiveCell(bounds, this.renderedStartRow);
    const selectionSummary = resolveStatusBarSelectionSummary(bounds, selection, fallbackActiveCell);
    this.statusBarSelectionSummary = selectionSummary;
    const totalCellCount = selectionSummary.selectedCellCount;
    const nextComputationId = this.statusBarAggregateComputationId + 1;
    this.statusBarAggregateComputationId = nextComputationId;
    if (!selectionSummary.selectionRectangle) {
      this.statusBarAggregateSummary = null;
      this.statusBarNeedsSummaryRefresh = false;
      return;
    }

    if (totalCellCount > this.getStatusBarAggregateAsyncThreshold()) {
      this.statusBarAggregateSummary = {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        isComputing: true,
        processedCellCount: 0,
        totalCellCount
      };
      this.scheduleStatusBarAggregateSummaryComputation(selectionSummary.selectionRectangle, nextComputationId);
      this.statusBarNeedsSummaryRefresh = false;
      return;
    }

    this.statusBarAggregateSummary = computeSelectionAggregateSummary(selectionSummary.selectionRectangle, {
      isNumericColumn: (columnIndex) => this.resolveStatusBarAggregateIsNumericColumn(columnIndex),
      readNumericCell: (rowIndex, columnIndex) => this.resolveStatusBarAggregateCellValue(rowIndex, columnIndex)
    });
    this.statusBarNeedsSummaryRefresh = false;
  }

  private createStatusBarItem(itemId: string, text: string, tone: 'default' | 'active' | 'danger' = 'default'): HTMLDivElement {
    const itemElement = document.createElement('div');
    itemElement.className = 'hgrid__status-bar-item';
    itemElement.dataset.statusBarItem = itemId;
    if (tone === 'active') {
      itemElement.classList.add('hgrid__status-bar-item--active');
    } else if (tone === 'danger') {
      itemElement.classList.add('hgrid__status-bar-item--danger');
    }
    itemElement.textContent = text;
    return itemElement;
  }

  private formatStatusBarMetric(value: number): string {
    return this.statusBarNumberFormatter.format(value);
  }

  private renderStatusBar(refreshSummary: boolean): void {
    if (!this.isStatusBarEnabled()) {
      this.statusBarElement.style.display = 'none';
      this.statusBarMainElement.replaceChildren();
      this.statusBarMetaElement.replaceChildren();
      this.statusBarSelectionSummary = null;
      this.statusBarAggregateSummary = null;
      this.statusBarNeedsSummaryRefresh = false;
      return;
    }

    if (refreshSummary || this.statusBarNeedsSummaryRefresh || !this.statusBarSelectionSummary) {
      this.refreshStatusBarSummary();
    }

    this.statusBarElement.style.display = 'flex';

    const mainItems: HTMLElement[] = [];
    const metaItems: HTMLElement[] = [];
    const resolvedItems = this.getResolvedStatusBarItems();
    const rowsSummary = resolveStatusBarRowsSummary(
      this.options.rowModel.getViewRowCount(),
      this.options.dataProvider.getRowCount(),
      this.getViewportVisibleRowRange()
    );
    const remoteSummary = resolveStatusBarRemoteSummary(this.resolveRemoteStatusDataProvider()?.getDebugState() ?? null);
    const columnLayout = this.getCurrentColumnLayout();
    const customItemContext: GridStatusBarCustomItemRenderContext = {
      state: {
        selection: {
          kind: this.statusBarSelectionSummary?.kind ?? 'none',
          selectedCellCount: this.statusBarSelectionSummary?.selectedCellCount ?? 0,
          selectedRowCount: this.statusBarSelectionSummary?.selectedRowCount ?? 0
        },
        aggregates: this.statusBarAggregateSummary
          ? {
              count: this.statusBarAggregateSummary.count,
              sum: this.statusBarAggregateSummary.sum,
              avg: this.statusBarAggregateSummary.avg,
              min: this.statusBarAggregateSummary.min,
              max: this.statusBarAggregateSummary.max,
              isComputing: this.statusBarAggregateSummary.isComputing,
              processedCellCount: this.statusBarAggregateSummary.processedCellCount,
              totalCellCount: this.statusBarAggregateSummary.totalCellCount
            }
          : null,
        rows: rowsSummary,
        remote: remoteSummary,
        filterModel: cloneFilterModelValue(this.filterModel),
        advancedFilterModel: cloneAdvancedFilterModelValue(this.advancedFilterModel),
        columnLayout: cloneColumnLayoutValue(columnLayout),
        visibleColumnCount: Math.max(0, columnLayout.columnOrder.length - columnLayout.hiddenColumnIds.length),
        totalColumnCount: columnLayout.columnOrder.length
      }
    };

    for (let index = 0; index < resolvedItems.length; index += 1) {
      const itemId = resolvedItems[index];
      if (itemId === 'selection' && this.statusBarSelectionSummary && this.statusBarSelectionSummary.kind !== 'none') {
        const selectionText =
          this.statusBarSelectionSummary.kind === 'rows'
            ? this.localizeText(this.localeText.statusBarSelectionRows, {
                count: this.statusBarSelectionSummary.selectedRowCount
              })
            : this.localizeText(this.localeText.statusBarSelectionCells, {
                count: this.statusBarSelectionSummary.selectedCellCount
              });
        mainItems.push(this.createStatusBarItem('selection', selectionText));
        continue;
      }

      if (itemId === 'aggregates' && this.statusBarAggregateSummary) {
        if (this.statusBarAggregateSummary.isComputing) {
          const processedCellCount = this.statusBarAggregateSummary.processedCellCount ?? 0;
          const totalCellCount = Math.max(1, this.statusBarAggregateSummary.totalCellCount ?? processedCellCount);
          const percent = Math.max(0, Math.min(100, Math.round((processedCellCount / totalCellCount) * 100)));
          mainItems.push(
            this.createStatusBarItem(
              'aggregates',
              this.localizeText(this.localeText.statusBarAggregatesCalculating, {
                percent
              }),
              'active'
            )
          );
        } else {
          const aggregateText = [
            this.localizeText(this.localeText.statusBarSum, {
              value: this.formatStatusBarMetric(this.statusBarAggregateSummary.sum)
            }),
            this.localizeText(this.localeText.statusBarAvg, {
              value: this.formatStatusBarMetric(this.statusBarAggregateSummary.avg)
            }),
            this.localizeText(this.localeText.statusBarMin, {
              value: this.formatStatusBarMetric(this.statusBarAggregateSummary.min)
            }),
            this.localizeText(this.localeText.statusBarMax, {
              value: this.formatStatusBarMetric(this.statusBarAggregateSummary.max)
            })
          ].join(' · ');
          mainItems.push(this.createStatusBarItem('aggregates', aggregateText));
        }
        continue;
      }

      if (itemId === 'rows') {
        const rowsText = [
          this.localizeText(this.localeText.statusBarVisibleRows, {
            count: rowsSummary.visibleRowCount
          }),
          rowsSummary.isFiltered
            ? this.localizeText(this.localeText.statusBarFilteredRows, {
                filtered: rowsSummary.viewRowCount,
                total: rowsSummary.sourceRowCount
              })
            : this.localizeText(this.localeText.statusBarRows, {
                count: rowsSummary.viewRowCount
              })
        ].join(' · ');
        metaItems.push(this.createStatusBarItem('rows', rowsText));
        continue;
      }

      if (itemId === 'remote') {
        if (!remoteSummary) {
          continue;
        }

        const remoteParts: string[] = [];
        let remoteTone: 'default' | 'active' | 'danger' = 'default';
        if (remoteSummary.loadingCount > 0) {
          remoteParts.push(this.localizeText(this.localeText.statusBarRemoteLoading, { count: remoteSummary.loadingCount }));
          remoteTone = 'active';
        }
        if (remoteSummary.refreshingCount > 0) {
          remoteParts.push(this.localizeText(this.localeText.statusBarRemoteRefreshing, { count: remoteSummary.refreshingCount }));
          remoteTone = 'active';
        }
        if (remoteSummary.hasError) {
          remoteParts.push(this.localizeText(this.localeText.statusBarRemoteError, { count: remoteSummary.errorCount }));
          remoteTone = 'danger';
        }
        if (remoteSummary.isPending) {
          remoteParts.push(
            this.localizeText(this.localeText.statusBarRemotePending, {
              rows: remoteSummary.pendingRowCount,
              cells: remoteSummary.pendingCellCount
            })
          );
          if (remoteTone !== 'danger') {
            remoteTone = 'active';
          }
        }
        if (remoteParts.length === 0) {
          remoteParts.push(this.localeText.statusBarRemoteSynced);
        }
        metaItems.push(this.createStatusBarItem('remote', remoteParts.join(' · '), remoteTone));
        continue;
      }

      const customItem = this.resolveStatusBarCustomItem(itemId, customItemContext);
      if (customItem) {
        const itemElement = this.createStatusBarItem(itemId, customItem.text, customItem.tone);
        if (customItem.align === 'main') {
          mainItems.push(itemElement);
        } else {
          metaItems.push(itemElement);
        }
      }
    }

    this.statusBarMainElement.replaceChildren(...mainItems);
    this.statusBarMetaElement.replaceChildren(...metaItems);
    this.statusBarElement.classList.toggle('hgrid__status-bar--empty', mainItems.length === 0 && metaItems.length === 0);
  }

  private getColumnFilterCondition(columnId: string): ColumnFilterCondition | null {
    return getPrimaryColumnFilterCondition(this.filterModel[columnId]);
  }

  private getColumnFilterConditionsById(columnId: string): ColumnFilterCondition[] {
    return getColumnFilterConditions(this.filterModel[columnId]);
  }

  private hasActiveColumnFilter(columnId: string): boolean {
    return this.getColumnFilterCondition(columnId) !== null;
  }

  private isFilterRowEnabled(): boolean {
    return this.options.filterRow?.enabled === true;
  }

  private getFilterRowHeight(): number {
    return this.isFilterRowEnabled() ? 36 : 0;
  }

  private clearFilterSetOptionsCache(): void {
    this.filterSetOptionsCache.clear();
  }

  private getColumnFilterMode(column: ColumnDef): ColumnFilterMode {
    if (column.type === 'boolean') {
      return 'set';
    }

    if (column.type !== 'text') {
      return 'auto';
    }

    return column.filterMode === 'set' ? 'set' : 'text';
  }

  private usesSetFilterRowEditor(column: ColumnDef): boolean {
    return column.type === 'boolean' || this.getColumnFilterMode(column) === 'set';
  }

  private createFilterSetOptionsCacheKey(columnId: string, reason: GridSetFilterReason): string {
    return `${reason}:${columnId}`;
  }

  private toGridSetFilterValueOption(option: FilterSetOption): GridSetFilterValueOption {
    return {
      value: option.value,
      label: option.label
    };
  }

  private normalizeCustomSetFilterOption(value: GridSetFilterValueOption | unknown): FilterSetOption | null {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
      const candidate = value as GridSetFilterValueOption;
      const optionValue = candidate.value;
      return {
        key: normalizeFilterSetOptionKey(optionValue),
        label: typeof candidate.label === 'string' && candidate.label.length > 0 ? candidate.label : formatFilterSetOptionLabel(optionValue),
        value: optionValue,
        isNull: optionValue === null || optionValue === undefined
      };
    }

    return {
      key: normalizeFilterSetOptionKey(value),
      label: formatFilterSetOptionLabel(value),
      value,
      isNull: value === null || value === undefined
    };
  }

  private collectFilterSetOptionsFromProvider(column: ColumnDef, rowCount: number, maxDistinctValues: number): FilterSetOption[] {
    const provider = this.options.dataProvider;
    const safeRowCount = Math.max(0, Math.min(provider.getRowCount(), rowCount));
    const safeMaxDistinctValues = Math.max(1, maxDistinctValues);
    const optionsByKey = new Map<string, FilterSetOption>();

    for (let dataIndex = 0; dataIndex < safeRowCount; dataIndex += 1) {
      const row = typeof provider.peekRow === 'function' ? provider.peekRow(dataIndex) : provider.getRow?.(dataIndex);
      if (row === undefined && provider.getRow) {
        continue;
      }

      const value = row !== undefined ? getColumnValue(column, row) : provider.getValue(dataIndex, column.id);

      const key = normalizeFilterSetOptionKey(value);
      if (optionsByKey.has(key)) {
        continue;
      }

      optionsByKey.set(key, {
        key,
        label: formatFilterSetOptionLabel(value),
        value,
        isNull: value === null || value === undefined
      });

      if (optionsByKey.size >= safeMaxDistinctValues) {
        break;
      }
    }

    return Array.from(optionsByKey.values());
  }

  private getBaseFilterSetOptions(column: ColumnDef, reason: GridSetFilterReason): FilterSetOption[] {
    const cacheKey = this.createFilterSetOptionsCacheKey(column.id, reason);
    const cachedOptions = this.filterSetOptionsCache.get(cacheKey);
    if (cachedOptions) {
      return cachedOptions.map((option) => ({ ...option }));
    }

    const setFilterOptions = this.options.setFilter;
    const maxDistinctValues = Math.max(1, setFilterOptions?.maxDistinctValues ?? MAX_FILTER_SET_OPTIONS);
    const sampledRowCount = Math.max(1, setFilterOptions?.maxScanRows ?? MAX_FILTER_SET_SCAN_ROWS);
    const providerRowCount = this.options.dataProvider.getRowCount();
    const rowCount = (setFilterOptions?.valueSource ?? 'sampled') === 'full'
      ? providerRowCount
      : Math.min(providerRowCount, sampledRowCount);

    const sampledOptions = this.collectFilterSetOptionsFromProvider(column, Math.min(providerRowCount, sampledRowCount), maxDistinctValues);
    let resolvedOptions = (setFilterOptions?.valueSource ?? 'sampled') === 'full'
      ? this.collectFilterSetOptionsFromProvider(column, rowCount, maxDistinctValues)
      : sampledOptions;

    if (setFilterOptions?.getValues) {
      const customOptions = setFilterOptions.getValues({
        column: { ...column },
        dataProvider: this.options.dataProvider,
        locale: this.locale,
        reason,
        sampledOptions: sampledOptions.map((option) => this.toGridSetFilterValueOption(option))
      });
      if (Array.isArray(customOptions)) {
        const customOptionsByKey = new Map<string, FilterSetOption>();
        for (let index = 0; index < customOptions.length; index += 1) {
          const normalizedOption = this.normalizeCustomSetFilterOption(customOptions[index]);
          if (!normalizedOption || customOptionsByKey.has(normalizedOption.key)) {
            continue;
          }
          customOptionsByKey.set(normalizedOption.key, normalizedOption);
        }
        if (customOptionsByKey.size > 0) {
          resolvedOptions = Array.from(customOptionsByKey.values()).slice(0, maxDistinctValues);
        }
      }
    }

    const sortedOptions = resolvedOptions
      .slice()
      .sort((left, right) => left.label.localeCompare(right.label, this.locale));

    this.filterSetOptionsCache.set(cacheKey, sortedOptions.map((option) => ({ ...option })));
    return sortedOptions.map((option) => ({ ...option }));
  }

  private parseFilterRowInput(column: ColumnDef, rawValue: string): ColumnFilterInput | null {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      return null;
    }

    if (column.type === 'boolean') {
      if (trimmed === 'null') {
        return {
          kind: 'set',
          values: [],
          includeNull: true
        };
      }

      if (trimmed === 'true' || trimmed === 'false') {
        return {
          kind: 'set',
          values: [trimmed === 'true'],
          includeNull: false
        };
      }

      return null;
    }

    if (column.type === 'number') {
      const betweenMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/);
      if (betweenMatch) {
        const min = parseFilterRowNumericValue(betweenMatch[1]);
        const max = parseFilterRowNumericValue(betweenMatch[2]);
        if (min !== null && max !== null) {
          return { kind: 'number', operator: 'between', min, max };
        }
      }

      const numericOperatorMatch = trimmed.match(/^(>=|<=|!=|<>|>|<|=)\s*(-?\d+(?:\.\d+)?)$/);
      if (numericOperatorMatch) {
        const parsedValue = parseFilterRowNumericValue(numericOperatorMatch[2]);
        if (parsedValue === null) {
          return null;
        }

        const operatorToken = numericOperatorMatch[1];
        const operator: NumberFilterOperator =
          operatorToken === '>='
            ? 'gte'
            : operatorToken === '>'
              ? 'gt'
              : operatorToken === '<='
                ? 'lte'
                : operatorToken === '<'
                  ? 'lt'
                  : operatorToken === '!=' || operatorToken === '<>'
                    ? 'ne'
                    : 'eq';
        return {
          kind: 'number',
          operator,
          value: parsedValue
        };
      }

      const parsedValue = parseFilterRowNumericValue(trimmed);
      return parsedValue === null
        ? null
        : {
            kind: 'number',
            operator: 'eq',
            value: parsedValue
          };
    }

    if (column.type === 'date') {
      const betweenMatch = trimmed.match(/^(.+?)\s*\.\.\s*(.+)$/);
      if (betweenMatch) {
        const min = parseFilterRowDateValue(betweenMatch[1]);
        const max = parseFilterRowDateValue(betweenMatch[2]);
        if (min && max) {
          return { kind: 'date', operator: 'between', min, max };
        }
      }

      const dateOperatorMatch = trimmed.match(/^(>=|<=|!=|<>|>|<|=)\s*(.+)$/);
      if (dateOperatorMatch) {
        const parsedValue = parseFilterRowDateValue(dateOperatorMatch[2]);
        if (!parsedValue) {
          return null;
        }

        const operatorToken = dateOperatorMatch[1];
        const operator: DateFilterOperator =
          operatorToken === '>='
            ? 'onOrAfter'
            : operatorToken === '>'
              ? 'after'
              : operatorToken === '<='
                ? 'onOrBefore'
                : operatorToken === '<'
                  ? 'before'
                  : operatorToken === '!=' || operatorToken === '<>'
                    ? 'notOn'
                    : 'on';
        return {
          kind: 'date',
          operator,
          value: parsedValue
        };
      }

      return {
        kind: 'date',
        operator: 'on',
        value: trimmed
      };
    }

    if (this.usesSetFilterRowEditor(column)) {
      const setOptions = this.collectFilterSetOptions(column, 'filterRow');
      for (let index = 0; index < setOptions.length; index += 1) {
        const option = setOptions[index];
        if (option.key !== trimmed) {
          continue;
        }

        if (option.isNull) {
          return {
            kind: 'set',
            values: [],
            includeNull: true
          };
        }

        return {
          kind: 'set',
          values: [option.value],
          includeNull: false
        };
      }

      return null;
    }

    if (trimmed.startsWith('!=')) {
      return {
        kind: 'text',
        operator: 'notEquals',
        value: trimmed.slice(2).trim()
      };
    }

    if (trimmed.startsWith('=')) {
      return {
        kind: 'text',
        operator: 'equals',
        value: trimmed.slice(1).trim()
      };
    }

    if (trimmed.startsWith('^')) {
      return {
        kind: 'text',
        operator: 'startsWith',
        value: trimmed.slice(1).trim()
      };
    }

    if (trimmed.startsWith('$')) {
      return {
        kind: 'text',
        operator: 'endsWith',
        value: trimmed.slice(1).trim()
      };
    }

    return {
      kind: 'text',
      operator: 'contains',
      value: trimmed
    };
  }

  private formatFilterRowInput(column: ColumnDef): string {
    const condition = this.getColumnFilterCondition(column.id);
    if (!condition || Array.isArray(condition)) {
      return '';
    }

    if (column.type === 'number' && condition.kind === 'number') {
      if (condition.operator === 'between') {
        return `${condition.min ?? ''}..${condition.max ?? ''}`;
      }
      if (condition.operator === 'gte') {
        return `>=${condition.value ?? ''}`;
      }
      if (condition.operator === 'gt') {
        return `>${condition.value ?? ''}`;
      }
      if (condition.operator === 'lte') {
        return `<=${condition.value ?? ''}`;
      }
      if (condition.operator === 'lt') {
        return `<${condition.value ?? ''}`;
      }
      if (condition.operator === 'ne') {
        return `!=${condition.value ?? ''}`;
      }
      return condition.value === undefined ? '' : String(condition.value);
    }

    if (column.type === 'date' && condition.kind === 'date') {
      if (condition.operator === 'between') {
        return `${condition.min ?? ''}..${condition.max ?? ''}`;
      }
      if (condition.operator === 'onOrAfter') {
        return `>=${condition.value ?? ''}`;
      }
      if (condition.operator === 'after') {
        return `>${condition.value ?? ''}`;
      }
      if (condition.operator === 'onOrBefore') {
        return `<=${condition.value ?? ''}`;
      }
      if (condition.operator === 'before') {
        return `<${condition.value ?? ''}`;
      }
      if (condition.operator === 'notOn') {
        return `!=${condition.value ?? ''}`;
      }
      return typeof condition.value === 'string' ? condition.value : '';
    }

    if (column.type === 'boolean' && condition.kind === 'set') {
      const hasNull = condition.includeNull === true;
      const hasTrue = condition.values.some((value) => value === true);
      const hasFalse = condition.values.some((value) => value === false);
      if (hasNull && !hasTrue && !hasFalse) {
        return 'null';
      }
      if (!hasNull && hasTrue && !hasFalse) {
        return 'true';
      }
      if (!hasNull && !hasTrue && hasFalse) {
        return 'false';
      }
      return '';
    }

    if (this.usesSetFilterRowEditor(column) && condition.kind === 'set') {
      const hasNull = condition.includeNull === true;
      if (hasNull && condition.values.length === 0) {
        return 'null';
      }

      if (!hasNull && condition.values.length === 1) {
        return normalizeFilterSetOptionKey(condition.values[0]);
      }

      return '';
    }

    if (condition.kind === 'text') {
      if (condition.operator === 'equals') {
        return `=${condition.value ?? ''}`;
      }
      if (condition.operator === 'notEquals') {
        return `!=${condition.value ?? ''}`;
      }
      if (condition.operator === 'startsWith') {
        return `^${condition.value ?? ''}`;
      }
      if (condition.operator === 'endsWith') {
        return `$${condition.value ?? ''}`;
      }
      return condition.value ?? '';
    }

    return '';
  }

  private syncFilterRowDraftFromModel(): void {
    const nextDraft: Record<string, string> = {};
    for (let index = 0; index < this.columnCatalog.length; index += 1) {
      const column = this.columnCatalog[index];
      if (this.isSystemUtilityColumnId(column.id)) {
        continue;
      }

      const value = this.formatFilterRowInput(column);
      if (value.length > 0) {
        nextDraft[column.id] = value;
      }
    }
    this.filterRowDraftByColumnId = nextDraft;
  }

  private getFilterRowDraftValue(column: ColumnDef): string {
    if (Object.prototype.hasOwnProperty.call(this.filterRowDraftByColumnId, column.id)) {
      return this.filterRowDraftByColumnId[column.id] ?? '';
    }

    return this.formatFilterRowInput(column);
  }

  private getFilterRowPlaceholder(column: ColumnDef): string {
    if (this.usesSetFilterRowEditor(column)) {
      return this.localeText.filterRowSetAny;
    }

    if (column.type === 'number') {
      return this.localeText.filterRowPlaceholderNumber;
    }

    if (column.type === 'date') {
      return this.localeText.filterRowPlaceholderDate;
    }

    return this.localeText.filterRowPlaceholderText;
  }

  private syncDateFilterRowShell(
    shellElement: HTMLDivElement,
    operatorElement: HTMLSelectElement,
    valueInputElement: HTMLInputElement,
    secondaryInputElement: HTMLInputElement,
    column: ColumnDef
  ): void {
    const draft = decodeDateFilterRowDraft(this.getFilterRowDraftValue(column));
    operatorElement.value = draft.operator;
    valueInputElement.value = draft.value;
    secondaryInputElement.value = draft.secondaryValue;
    shellElement.classList.toggle('hgrid__filter-row-date-shell--between', draft.operator === 'between');
    shellElement.classList.toggle('hgrid__filter-row-date-shell--active', this.hasActiveColumnFilter(column.id));
  }

  private syncFilterRowSetSelect(selectElement: HTMLSelectElement, column: ColumnDef, setOptions: FilterSetOption[]): void {
    const currentValue = this.getFilterRowDraftValue(column);
    const nextOptions: Array<{ value: string; label: string }> = [
      { value: '', label: this.localeText.filterRowSetAny }
    ];

    for (let index = 0; index < setOptions.length; index += 1) {
      const option = setOptions[index];
      nextOptions.push({
        value: option.key,
        label: option.isNull ? this.localeText.filterRowSetBlank : option.label
      });
    }

    const shouldRebuild =
      selectElement.options.length !== nextOptions.length ||
      nextOptions.some((option, index) => {
        const existingOption = selectElement.options[index];
        return !existingOption || existingOption.value !== option.value || existingOption.text !== option.label;
      });

    if (shouldRebuild) {
      selectElement.replaceChildren();
      for (let index = 0; index < nextOptions.length; index += 1) {
        const option = nextOptions[index];
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.label;
        selectElement.append(optionElement);
      }
    }

    selectElement.value = nextOptions.some((option) => option.value === currentValue) ? currentValue : '';
    selectElement.classList.toggle('hgrid__filter-row-input--active', this.hasActiveColumnFilter(column.id));
  }

  private syncFilterRowInputs(): void {
    if (!this.isFilterRowEnabled()) {
      return;
    }

    const inputs = this.headerElement.querySelectorAll('.hgrid__filter-row-input[data-filter-row-column-id]');
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index] as HTMLInputElement;
      const columnId = input.dataset.filterRowColumnId ?? '';
      const column = findVisibleColumnById(this.columnCatalog, columnId);
      if (!column) {
        continue;
      }

      const nextValue = this.getFilterRowDraftValue(column);
      if (input.value !== nextValue) {
        input.value = nextValue;
      }

      input.classList.toggle('hgrid__filter-row-input--active', this.hasActiveColumnFilter(column.id));
    }

    const booleanSelects = this.headerElement.querySelectorAll('.hgrid__filter-row-select[data-filter-row-column-id]');
    for (let index = 0; index < booleanSelects.length; index += 1) {
      const select = booleanSelects[index] as HTMLSelectElement;
      const columnId = select.dataset.filterRowColumnId ?? '';
      const column = findVisibleColumnById(this.columnCatalog, columnId);
      if (!column || column.type !== 'boolean') {
        continue;
      }

      const nextValue = this.getFilterRowDraftValue(column);
      if (select.value !== nextValue) {
        select.value = nextValue;
      }
      select.classList.toggle('hgrid__filter-row-input--active', this.hasActiveColumnFilter(column.id));
    }

    const setSelects = this.headerElement.querySelectorAll('.hgrid__filter-row-set-select[data-filter-row-column-id]');
    for (let index = 0; index < setSelects.length; index += 1) {
      const select = setSelects[index] as HTMLSelectElement;
      const columnId = select.dataset.filterRowColumnId ?? '';
      const column = findVisibleColumnById(this.columnCatalog, columnId);
      if (!column || !this.usesSetFilterRowEditor(column) || column.type === 'boolean') {
        continue;
      }

      const setOptions = this.collectFilterSetOptions(column, 'filterRow');
      this.syncFilterRowSetSelect(select, column, setOptions);
    }

    const dateShells = this.headerElement.querySelectorAll('.hgrid__filter-row-date-shell[data-filter-row-column-id]');
    for (let index = 0; index < dateShells.length; index += 1) {
      const shellElement = dateShells[index] as HTMLDivElement;
      const columnId = shellElement.dataset.filterRowColumnId ?? '';
      const column = findVisibleColumnById(this.columnCatalog, columnId);
      if (!column || column.type !== 'date') {
        continue;
      }

      const operatorElement = shellElement.querySelector('.hgrid__filter-row-date-operator') as HTMLSelectElement | null;
      const valueInputElement = shellElement.querySelector(
        '.hgrid__filter-row-date-input[data-filter-row-control="date-value"]'
      ) as HTMLInputElement | null;
      const secondaryInputElement = shellElement.querySelector(
        '.hgrid__filter-row-date-input[data-filter-row-control="date-secondary"]'
      ) as HTMLInputElement | null;
      if (!operatorElement || !valueInputElement || !secondaryInputElement) {
        continue;
      }

      this.syncDateFilterRowShell(shellElement, operatorElement, valueInputElement, secondaryInputElement, column);
    }
  }

  private getHeaderLeafExtraClassName(column: ColumnDef): string {
    const classNames: string[] = [];
    if (this.isColumnMenuEligibleColumn(column) && (this.getColumnMenuTriggerMode() === 'button' || this.getColumnMenuTriggerMode() === 'both')) {
      classNames.push('hgrid__header-cell--menuable');
    }
    if (this.hasActiveColumnFilter(column.id)) {
      classNames.push('hgrid__header-cell--filtered');
    }
    return classNames.join(' ');
  }

  private syncHeaderFilterState(): void {
    const headerCells = this.headerElement.querySelectorAll('.hgrid__header-cell--leaf[data-column-id]');
    for (let index = 0; index < headerCells.length; index += 1) {
      const headerCell = headerCells[index] as HTMLDivElement;
      const columnId = headerCell.dataset.columnId ?? '';
      headerCell.classList.toggle('hgrid__header-cell--filtered', this.hasActiveColumnFilter(columnId));
    }
  }

  private canSwitchTextSetFilter(column: ColumnDef): boolean {
    return column.type === 'text';
  }

  private supportsMultiConditionFilterMode(mode: FilterPanelMode): boolean {
    return mode === 'text' || mode === 'number' || mode === 'date';
  }

  private getConditionsForFilterPanelMode(columnId: string, mode: FilterPanelMode): ColumnFilterCondition[] {
    const conditions = this.getColumnFilterConditionsById(columnId);
    const matchingConditions: ColumnFilterCondition[] = [];
    for (let index = 0; index < conditions.length; index += 1) {
      const condition = conditions[index];
      if (condition.kind === mode) {
        matchingConditions.push(condition);
      }
    }
    return matchingConditions.slice(0, 2);
  }

  private resolveDefaultFilterPanelMode(column: ColumnDef): FilterPanelMode {
    if (column.type === 'number') {
      return 'number';
    }

    if (column.type === 'date') {
      return 'date';
    }

    if (column.type === 'boolean') {
      return 'set';
    }

    if (this.getColumnFilterMode(column) === 'set') {
      return 'set';
    }

    return 'text';
  }

  private resolveFilterPanelMode(column: ColumnDef): FilterPanelMode {
    const currentCondition = this.getColumnFilterCondition(column.id);
    if (currentCondition) {
      return currentCondition.kind;
    }

    return this.resolveDefaultFilterPanelMode(column);
  }

  private collectFilterSetOptions(column: ColumnDef, reason: GridSetFilterReason = 'panel'): FilterSetOption[] {
    const optionsByKey = new Map<string, FilterSetOption>();
    const baseOptions = this.getBaseFilterSetOptions(column, reason);
    for (let index = 0; index < baseOptions.length; index += 1) {
      const option = baseOptions[index];
      optionsByKey.set(option.key, option);
    }

    const currentCondition = this.getColumnFilterCondition(column.id);
    if (currentCondition?.kind === 'set') {
      for (let index = 0; index < currentCondition.values.length; index += 1) {
        const value = currentCondition.values[index];
        const key = normalizeFilterSetOptionKey(value);
        if (optionsByKey.has(key)) {
          continue;
        }

        optionsByKey.set(key, {
          key,
          label: formatFilterSetOptionLabel(value),
          value,
          isNull: value === null || value === undefined
        });
      }

      if (currentCondition.includeNull === true && !optionsByKey.has('null')) {
        optionsByKey.set('null', {
          key: 'null',
          label: FILTER_NULL_OPTION_LABEL,
          value: null,
          isNull: true
        });
      }
    }

    return Array.from(optionsByKey.values()).sort((left, right) => left.label.localeCompare(right.label, this.locale));
  }

  private resolveColumnMenuContext(columnId: string, source: GridMenuOpenSource): GridContextMenuContext | null {
    const column = findVisibleColumnById(this.options.columns, columnId);
    if (!column || !this.isColumnMenuEligibleColumn(column)) {
      return null;
    }

    return {
      kind: 'header',
      column: { ...column },
      visibleColumns: this.options.columns.map((visibleColumn) => ({ ...visibleColumn })),
      source
    };
  }

  private resolveBodyContextMenuSelection(hit: CellHitTestResult): GridSelection {
    const targetCell = this.toSelectionCellPosition(hit);
    let hasSelectionChanged = false;

    if (this.selectionModel.isCellSelected(targetCell.rowIndex, targetCell.colIndex)) {
      hasSelectionChanged = this.selectionModel.setSelection(
        {
          activeCell: targetCell
        },
        this.getSelectionBounds(),
        this.resolveRowKeyByRowIndex
      );
    } else {
      hasSelectionChanged = this.selectionModel.setSelection(
        {
          activeCell: targetCell,
          cellRanges: [
            {
              r1: targetCell.rowIndex,
              c1: targetCell.colIndex,
              r2: targetCell.rowIndex,
              c2: targetCell.colIndex
            }
          ],
          rowRanges: []
        },
        this.getSelectionBounds(),
        this.resolveRowKeyByRowIndex
      );
    }

    if (hasSelectionChanged) {
      this.commitSelectionChange('pointer');
    }

    this.keyboardRangeAnchor = { ...targetCell };
    this.rootElement.focus();
    return this.selectionModel.getSelection();
  }

  private resolveBodyContextMenuContext(hit: CellHitTestResult, source: GridMenuOpenSource): GridContextMenuContext | null {
    const row = this.resolveRow(hit.dataIndex);
    const rowKey = this.options.dataProvider.getRowKey(hit.dataIndex);
    const selection = this.resolveBodyContextMenuSelection(hit);

    return {
      kind: 'cell',
      column: { ...hit.column },
      visibleColumns: this.options.columns.map((visibleColumn) => ({ ...visibleColumn })),
      source,
      rowIndex: hit.rowIndex,
      dataIndex: hit.dataIndex,
      rowKey,
      row: row ? { ...row } : null,
      value: getColumnValue(hit.column, row),
      selection
    };
  }

  private createBuiltInColumnMenuItems(context: GridColumnMenuContext): ResolvedColumnMenuItem[] {
    if (!this.isColumnMenuEnabled()) {
      return [];
    }

    const column = context.column as ResolvedColumnDef;
    const resolvedItems: ResolvedColumnMenuItem[] = [
      {
        id: 'sortAsc',
        label: this.localeText.columnMenuSortAsc,
        disabled: false,
        checked: false,
        danger: false,
        isSeparator: false,
        builtInActionId: 'sortAsc',
        onSelect: null
      },
      {
        id: 'sortDesc',
        label: this.localeText.columnMenuSortDesc,
        disabled: false,
        checked: false,
        danger: false,
        isSeparator: false,
        builtInActionId: 'sortDesc',
        onSelect: null
      },
      {
        id: 'clearSort',
        label: this.localeText.columnMenuClearSort,
        disabled: false,
        checked: false,
        danger: false,
        isSeparator: false,
        builtInActionId: 'clearSort',
        onSelect: null
      },
      {
        id: 'openFilter',
        label: this.localeText.columnMenuOpenFilter,
        disabled: false,
        checked: this.hasActiveColumnFilter(column.id),
        danger: false,
        isSeparator: false,
        builtInActionId: null,
        onSelect: (menuContext) => {
          this.openFilterPanelForContext(menuContext, context.source);
        }
      },
      {
        id: '__separator-sort-layout__',
        label: '',
        disabled: true,
        checked: false,
        danger: false,
        isSeparator: true,
        builtInActionId: null,
        onSelect: null
      },
      {
        id: 'pinLeft',
        label: this.localeText.columnMenuPinLeft,
        disabled: column.pinned === 'left',
        checked: column.pinned === 'left',
        danger: false,
        isSeparator: false,
        builtInActionId: 'pinLeft',
        onSelect: null
      },
      {
        id: 'pinRight',
        label: this.localeText.columnMenuPinRight,
        disabled: column.pinned === 'right',
        checked: column.pinned === 'right',
        danger: false,
        isSeparator: false,
        builtInActionId: 'pinRight',
        onSelect: null
      },
      {
        id: 'unpin',
        label: this.localeText.columnMenuUnpin,
        disabled: column.pinned !== 'left' && column.pinned !== 'right',
        checked: column.pinned !== 'left' && column.pinned !== 'right',
        danger: false,
        isSeparator: false,
        builtInActionId: 'unpin',
        onSelect: null
      },
      {
        id: '__separator-layout-width__',
        label: '',
        disabled: true,
        checked: false,
        danger: false,
        isSeparator: true,
        builtInActionId: null,
        onSelect: null
      },
      {
        id: 'autoSizeColumn',
        label: this.localeText.columnMenuAutoSizeColumn,
        disabled: false,
        checked: false,
        danger: false,
        isSeparator: false,
        builtInActionId: 'autoSizeColumn',
        onSelect: null
      },
      {
        id: 'resetColumnWidth',
        label: this.localeText.columnMenuResetColumnWidth,
        disabled: Math.abs(column.width - (column.initialWidth ?? column.width)) < 1,
        checked: false,
        danger: false,
        isSeparator: false,
        builtInActionId: 'resetColumnWidth',
        onSelect: null
      },
      {
        id: '__separator-width-visibility__',
        label: '',
        disabled: true,
        checked: false,
        danger: false,
        isSeparator: true,
        builtInActionId: null,
        onSelect: null
      },
      {
        id: 'hideColumn',
        label: this.localeText.columnMenuHideColumn,
        disabled: this.getMenuEligibleVisibleColumnCount() <= 1,
        checked: false,
        danger: true,
        isSeparator: false,
        builtInActionId: 'hideColumn',
        onSelect: null
      }
    ];

    return resolvedItems;
  }

  private getBuiltInBodyContextMenuActions(): GridBuiltInBodyMenuActionId[] {
    const configuredActions = this.options.contextMenu?.builtInActions;
    if (!Array.isArray(configuredActions) || configuredActions.length === 0) {
      return [];
    }

    const resolvedActions: GridBuiltInBodyMenuActionId[] = [];
    const seen = new Set<GridBuiltInBodyMenuActionId>();
    for (let index = 0; index < configuredActions.length; index += 1) {
      const actionId = configuredActions[index];
      if (!isBuiltInBodyMenuActionId(actionId) || seen.has(actionId)) {
        continue;
      }
      seen.add(actionId);
      resolvedActions.push(actionId);
    }

    return resolvedActions;
  }

  private canApplyBodyContextValueFilter(context: GridContextMenuContext): boolean {
    if (context.kind !== 'cell' || !context.row || this.isSystemUtilityColumnId(context.column.id)) {
      return false;
    }

    return !isGroupRowData(context.row);
  }

  private resolveBodyContextFilterInput(context: GridContextMenuContext): ColumnFilterInput | null {
    if (!this.canApplyBodyContextValueFilter(context)) {
      return null;
    }

    if (context.value === null || context.value === undefined) {
      return {
        kind: 'set',
        values: [],
        includeNull: true
      };
    }

    return {
      kind: 'set',
      values: [context.value],
      includeNull: false
    };
  }

  private resolveBodyContextCellCopyText(context: GridContextMenuContext): string | null {
    if (context.kind !== 'cell' || !context.row) {
      return null;
    }

    return formatColumnValue(context.column, context.row, this.columnValueFormatContext ?? undefined);
  }

  private resolveBodyContextRowCopyText(context: GridContextMenuContext): string | null {
    if (context.kind !== 'cell' || !context.row) {
      return null;
    }

    const visibleColumns = context.visibleColumns.filter((column) => this.isColumnMenuEligibleColumn(column));
    if (visibleColumns.length === 0) {
      return null;
    }

    return visibleColumns
      .map((column) => formatColumnValue(column, context.row as GridRowData, this.columnValueFormatContext ?? undefined))
      .join('\t');
  }

  private createBuiltInBodyContextMenuItems(context: GridContextMenuContext): ResolvedColumnMenuItem[] {
    if (context.kind !== 'cell' || !this.isContextMenuEnabled()) {
      return [];
    }

    const configuredActions = this.getBuiltInBodyContextMenuActions();
    if (configuredActions.length === 0) {
      return [];
    }

    const selectionTsv = this.buildSelectionTsv();
    const hasColumnFilter = Object.prototype.hasOwnProperty.call(this.filterModel, context.column.id);
    const canFilterByValue = this.canApplyBodyContextValueFilter(context);
    const canCopyCell = this.resolveBodyContextCellCopyText(context) !== null;
    const canCopyRow = this.resolveBodyContextRowCopyText(context) !== null;

    return configuredActions.map((actionId) => {
      let label = '';
      let disabled = false;

      if (actionId === 'copyCell') {
        label = this.localeText.contextMenuCopyCell;
        disabled = !canCopyCell;
      } else if (actionId === 'copyRow') {
        label = this.localeText.contextMenuCopyRow;
        disabled = !canCopyRow;
      } else if (actionId === 'copySelection') {
        label = this.localeText.contextMenuCopySelection;
        disabled = selectionTsv === null;
      } else if (actionId === 'filterByValue') {
        label = this.localeText.contextMenuFilterByValue;
        disabled = !canFilterByValue;
      } else if (actionId === 'clearColumnFilter') {
        label = this.localeText.contextMenuClearColumnFilter;
        disabled = !hasColumnFilter;
      }

      return {
        id: actionId,
        label,
        disabled,
        checked: false,
        danger: false,
        isSeparator: false,
        builtInActionId: actionId,
        onSelect: null
      };
    });
  }

  private normalizeCustomColumnMenuItems(
    items: GridMenuItem[] | undefined,
    context: GridContextMenuContext
  ): ResolvedColumnMenuItem[] {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    const resolvedItems: ResolvedColumnMenuItem[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item || typeof item !== 'object') {
        continue;
      }

      if (item.separator === true) {
        resolvedItems.push({
          id: `__separator-custom-${index}__`,
          label: '',
          disabled: true,
          checked: false,
          danger: false,
          isSeparator: true,
          builtInActionId: null,
          onSelect: null
        });
        continue;
      }

      if (typeof item.id !== 'string' || item.id.trim().length === 0) {
        continue;
      }

      if (typeof item.label !== 'string' || item.label.trim().length === 0) {
        continue;
      }

      resolvedItems.push({
        id: item.id,
        label: item.label,
        disabled: item.disabled === true,
        checked: item.checked === true,
        danger: item.danger === true,
        isSeparator: false,
        builtInActionId: null,
        onSelect: typeof item.onSelect === 'function' ? () => item.onSelect?.(context) : null
      });
    }

    return resolvedItems;
  }

  private finalizeResolvedColumnMenuItems(items: ResolvedColumnMenuItem[]): ResolvedColumnMenuItem[] {
    const finalized: ResolvedColumnMenuItem[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.isSeparator) {
        if (finalized.length === 0 || finalized[finalized.length - 1]?.isSeparator) {
          continue;
        }
      }
      finalized.push(item);
    }

    while (finalized.length > 0 && finalized[finalized.length - 1]?.isSeparator) {
      finalized.pop();
    }

    return finalized;
  }

  private buildColumnMenuItems(context: GridContextMenuContext): ResolvedColumnMenuItem[] {
    const resolvedItems =
      context.kind === 'cell' ? this.createBuiltInBodyContextMenuItems(context) : this.createBuiltInColumnMenuItems(context);
    const appendItems = (items: ResolvedColumnMenuItem[]): void => {
      if (items.length === 0) {
        return;
      }

      if (
        resolvedItems.length > 0 &&
        !resolvedItems[resolvedItems.length - 1]?.isSeparator &&
        !items[0]?.isSeparator
      ) {
        resolvedItems.push({
          id: `__separator-bridge-${resolvedItems.length}__`,
          label: '',
          disabled: true,
          checked: false,
          danger: false,
          isSeparator: true,
          builtInActionId: null,
          onSelect: null
        });
      }

      for (let index = 0; index < items.length; index += 1) {
        resolvedItems.push(items[index]);
      }
    };

    if (context.kind !== 'cell' && this.isColumnMenuEnabled() && typeof this.options.columnMenu?.getItems === 'function') {
      appendItems(this.normalizeCustomColumnMenuItems(this.options.columnMenu.getItems(context), context));
    }

    if (context.source === 'contextmenu' && this.isContextMenuEnabled() && typeof this.options.contextMenu?.getItems === 'function') {
      appendItems(this.normalizeCustomColumnMenuItems(this.options.contextMenu.getItems(context), context));
    }

    return this.finalizeResolvedColumnMenuItems(resolvedItems);
  }

  private renderColumnMenu(items: ResolvedColumnMenuItem[]): void {
    const children: HTMLElement[] = [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item.isSeparator) {
        const separatorElement = document.createElement('div');
        separatorElement.className = 'hgrid__column-menu-separator';
        separatorElement.setAttribute('role', 'separator');
        children.push(separatorElement);
        continue;
      }

      const itemElement = document.createElement('button');
      itemElement.type = 'button';
      itemElement.className = 'hgrid__column-menu-item';
      itemElement.setAttribute('data-menu-item-index', String(index));
      itemElement.setAttribute('role', item.checked ? 'menuitemcheckbox' : 'menuitem');
      if (item.checked) {
        itemElement.classList.add('hgrid__column-menu-item--checked');
        itemElement.setAttribute('aria-checked', 'true');
      }
      if (item.danger) {
        itemElement.classList.add('hgrid__column-menu-item--danger');
      }
      if (item.disabled) {
        itemElement.disabled = true;
      }

      itemElement.textContent = item.label;
      children.push(itemElement);
    }

    this.columnMenuListElement.replaceChildren(...children);
  }

  private focusFirstColumnMenuItem(): void {
    const firstEnabledItem = this.columnMenuListElement.querySelector(
      '.hgrid__column-menu-item:not(:disabled)'
    ) as HTMLButtonElement | null;
    firstEnabledItem?.focus();
  }

  private openColumnMenuAtAnchor(
    context: GridContextMenuContext,
    items: ResolvedColumnMenuItem[],
    anchorRect: DOMRect | { left: number; right: number; top: number; bottom: number; width: number; height: number },
    source: GridMenuOpenSource,
    clientX?: number,
    clientY?: number
  ): void {
    this.closeFilterPanel();
    this.openColumnMenuState = {
      columnId: context.column.id,
      source,
      items,
      context
    };

    this.renderColumnMenu(items);
    this.columnMenuElement.classList.add('hgrid__column-menu--open');
    this.columnMenuElement.style.display = 'block';

    const rootRect = this.rootElement.getBoundingClientRect();
    const menuRect = this.columnMenuElement.getBoundingClientRect();
    const rootWidth = Math.max(this.rootElement.clientWidth, Math.round(rootRect.width));
    const rootHeight = Math.max(this.rootElement.clientHeight, Math.round(rootRect.height));
    const availableWidth = Math.max(1, rootWidth - 8);
    const availableHeight = Math.max(1, rootHeight - 8);
    const hasClientX = typeof clientX === 'number' && Number.isFinite(clientX);
    const hasClientY = typeof clientY === 'number' && Number.isFinite(clientY);
    const anchorX = hasClientX ? clientX - rootRect.left : anchorRect.right - rootRect.left;
    const anchorY = hasClientY ? clientY - rootRect.top : anchorRect.bottom - rootRect.top;
    const preferredMinWidth = Math.min(Math.max(168, anchorRect.width), Math.max(168, availableWidth));
    this.columnMenuElement.style.minWidth = `${preferredMinWidth}px`;
    this.columnMenuElement.style.maxWidth = `${availableWidth}px`;
    this.columnMenuElement.style.maxHeight = `${availableHeight}px`;

    const measuredMenuRect = this.columnMenuElement.getBoundingClientRect();
    const menuWidth = Math.min(Math.max(measuredMenuRect.width, preferredMinWidth, menuRect.width), availableWidth);
    const menuHeight = Math.min(Math.max(measuredMenuRect.height, 0), availableHeight);
    const fallbackX =
      this.options.rtl === true ? anchorRect.left - rootRect.left : anchorRect.right - rootRect.left - menuWidth;
    const rawLeft = source === 'contextmenu' ? anchorX : fallbackX;
    const left = Math.max(4, Math.min(Math.max(4, rootWidth - menuWidth - 4), rawLeft));
    const belowTop = Math.max(4, anchorY + 4);
    const aboveTop = Math.max(4, (hasClientY ? anchorY : anchorRect.top - rootRect.top) - menuHeight - 4);
    const top = belowTop + menuHeight <= rootHeight - 4 ? belowTop : aboveTop;

    this.columnMenuElement.style.left = `${left}px`;
    this.columnMenuElement.style.top = `${Math.max(4, top)}px`;
    this.focusFirstColumnMenuItem();
  }

  private openColumnMenuForHeaderCell(
    headerCell: HTMLDivElement,
    source: GridMenuOpenSource,
    clientX?: number,
    clientY?: number
  ): void {
    const columnId = headerCell.dataset.columnId;
    if (!columnId || !this.supportsColumnMenuOpenSource(source)) {
      return;
    }

    const context = this.resolveColumnMenuContext(columnId, source);
    if (!context) {
      return;
    }

    const items = this.buildColumnMenuItems(context);
    if (items.length === 0) {
      this.closeColumnMenu();
      return;
    }

    const headerRect = headerCell.getBoundingClientRect();
    this.openColumnMenuAtAnchor(context, items, headerRect, source, clientX, clientY);
  }

  private openColumnMenuForBodyCell(
    hit: CellHitTestResult,
    cellElement: HTMLDivElement,
    clientX: number,
    clientY: number
  ): void {
    if (!this.isContextMenuEnabled()) {
      return;
    }

    const context = this.resolveBodyContextMenuContext(hit, 'contextmenu');
    if (!context) {
      return;
    }

    const items = this.buildColumnMenuItems(context);
    if (items.length === 0) {
      this.closeColumnMenu();
      return;
    }

    this.openColumnMenuAtAnchor(context, items, cellElement.getBoundingClientRect(), 'contextmenu', clientX, clientY);
  }

  private createFilterField(labelText: string, control: HTMLElement): HTMLLabelElement {
    const fieldElement = document.createElement('label');
    fieldElement.className = 'hgrid__filter-panel-field';
    const labelElement = document.createElement('span');
    labelElement.className = 'hgrid__filter-panel-label';
    labelElement.textContent = labelText;
    fieldElement.append(labelElement, control);
    return fieldElement;
  }

  private createFilterSelect<T extends string>(values: T[], selectedValue: T): HTMLSelectElement {
    const selectElement = document.createElement('select');
    selectElement.className = 'hgrid__filter-panel-select';
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index];
      const optionElement = document.createElement('option');
      optionElement.value = value;
      optionElement.textContent = value;
      optionElement.selected = value === selectedValue;
      selectElement.append(optionElement);
    }
    return selectElement;
  }

  private createFilterInput(type: 'text' | 'number' | 'date', value: string): HTMLInputElement {
    const inputElement = document.createElement('input');
    inputElement.className = 'hgrid__filter-panel-input';
    inputElement.type = type;
    inputElement.value = value;
    return inputElement;
  }

  private createFilterActionButton(action: 'apply' | 'clear' | 'cancel', label: string): HTMLButtonElement {
    const buttonElement = document.createElement('button');
    buttonElement.type = 'button';
    buttonElement.className = 'hgrid__filter-panel-action';
    if (action === 'apply') {
      buttonElement.classList.add('hgrid__filter-panel-action--primary');
    }
    buttonElement.dataset.filterAction = action;
    buttonElement.textContent = label;
    return buttonElement;
  }

  private createToolPanelFilterActionButton(action: 'apply' | 'clear', label: string): HTMLButtonElement {
    const buttonElement = document.createElement('button');
    buttonElement.type = 'button';
    buttonElement.className = 'hgrid__filter-panel-action';
    if (action === 'apply') {
      buttonElement.classList.add('hgrid__filter-panel-action--primary');
    }
    buttonElement.dataset.toolPanelFilterAction = action;
    buttonElement.textContent = label;
    return buttonElement;
  }

  private createFilterClauseSection(title: string, fields: HTMLElement[]): HTMLDivElement {
    const sectionElement = document.createElement('div');
    sectionElement.className = 'hgrid__filter-panel-clause';
    const titleElement = document.createElement('div');
    titleElement.className = 'hgrid__filter-panel-clause-title';
    titleElement.textContent = title;
    sectionElement.append(titleElement, ...fields);
    return sectionElement;
  }

  private createFilterClauseDivider(): HTMLDivElement {
    const dividerElement = document.createElement('div');
    dividerElement.className = 'hgrid__filter-panel-divider';
    dividerElement.textContent = this.localeText.filterPanelAnd;
    return dividerElement;
  }

  private createTextFilterClauseFields(condition: Extract<ColumnFilterCondition, { kind: 'text' }> | null, clauseIndex: number): HTMLElement[] {
    const operatorElement = this.createFilterSelect(TEXT_FILTER_OPERATORS, condition?.operator ?? 'contains');
    operatorElement.dataset.filterRole = 'operator';
    operatorElement.dataset.filterClauseIndex = String(clauseIndex);

    const valueElement = this.createFilterInput('text', condition?.value ?? '');
    valueElement.dataset.filterRole = 'value';
    valueElement.dataset.filterClauseIndex = String(clauseIndex);

    return [
      this.createFilterField(this.localeText.filterPanelOperator, operatorElement),
      this.createFilterField(this.localeText.filterPanelValue, valueElement)
    ];
  }

  private createNumberFilterClauseFields(
    condition: Extract<ColumnFilterCondition, { kind: 'number' }> | null,
    clauseIndex: number
  ): HTMLElement[] {
    const operatorElement = this.createFilterSelect(NUMBER_FILTER_OPERATORS, condition?.operator ?? 'eq');
    operatorElement.dataset.filterRole = 'operator';
    operatorElement.dataset.filterClauseIndex = String(clauseIndex);

    const valueElement = this.createFilterInput('number', condition?.value === undefined ? '' : String(condition.value));
    valueElement.dataset.filterRole = 'value';
    valueElement.dataset.filterClauseIndex = String(clauseIndex);

    const minElement = this.createFilterInput('number', condition?.min === undefined ? '' : String(condition.min));
    minElement.dataset.filterRole = 'min';
    minElement.dataset.filterClauseIndex = String(clauseIndex);

    const maxElement = this.createFilterInput('number', condition?.max === undefined ? '' : String(condition.max));
    maxElement.dataset.filterRole = 'max';
    maxElement.dataset.filterClauseIndex = String(clauseIndex);

    return [
      this.createFilterField(this.localeText.filterPanelOperator, operatorElement),
      this.createFilterField(this.localeText.filterPanelValue, valueElement),
      this.createFilterField(this.localeText.filterPanelMin, minElement),
      this.createFilterField(this.localeText.filterPanelMax, maxElement)
    ];
  }

  private createDateFilterClauseFields(
    condition: Extract<ColumnFilterCondition, { kind: 'date' }> | null,
    clauseIndex: number
  ): HTMLElement[] {
    const operatorElement = this.createFilterSelect(DATE_FILTER_OPERATORS, condition?.operator ?? 'on');
    operatorElement.dataset.filterRole = 'operator';
    operatorElement.dataset.filterClauseIndex = String(clauseIndex);

    const valueElement = this.createFilterInput('date', typeof condition?.value === 'string' ? condition.value : '');
    valueElement.dataset.filterRole = 'value';
    valueElement.dataset.filterClauseIndex = String(clauseIndex);

    const minElement = this.createFilterInput('date', typeof condition?.min === 'string' ? condition.min : '');
    minElement.dataset.filterRole = 'min';
    minElement.dataset.filterClauseIndex = String(clauseIndex);

    const maxElement = this.createFilterInput('date', typeof condition?.max === 'string' ? condition.max : '');
    maxElement.dataset.filterRole = 'max';
    maxElement.dataset.filterClauseIndex = String(clauseIndex);

    return [
      this.createFilterField(this.localeText.filterPanelOperator, operatorElement),
      this.createFilterField(this.localeText.filterPanelValue, valueElement),
      this.createFilterField(this.localeText.filterPanelMin, minElement),
      this.createFilterField(this.localeText.filterPanelMax, maxElement)
    ];
  }

  private createToolPanelTextFilterClauseFields(
    condition: Extract<ColumnFilterCondition, { kind: 'text' }> | null,
    clauseIndex: number
  ): HTMLElement[] {
    const fields = this.createTextFilterClauseFields(condition, clauseIndex);
    this.decorateToolPanelFilterFields(fields, clauseIndex);
    return fields;
  }

  private createToolPanelNumberFilterClauseFields(
    condition: Extract<ColumnFilterCondition, { kind: 'number' }> | null,
    clauseIndex: number
  ): HTMLElement[] {
    const fields = this.createNumberFilterClauseFields(condition, clauseIndex);
    this.decorateToolPanelFilterFields(fields, clauseIndex);
    return fields;
  }

  private createToolPanelDateFilterClauseFields(
    condition: Extract<ColumnFilterCondition, { kind: 'date' }> | null,
    clauseIndex: number
  ): HTMLElement[] {
    const fields = this.createDateFilterClauseFields(condition, clauseIndex);
    this.decorateToolPanelFilterFields(fields, clauseIndex);
    return fields;
  }

  private decorateToolPanelFilterFields(fields: HTMLElement[], clauseIndex: number): void {
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      const control = field.querySelector('[data-filter-role]') as HTMLInputElement | HTMLSelectElement | null;
      if (!control) {
        continue;
      }

      const role = control.dataset.filterRole;
      if (!role) {
        continue;
      }

      control.dataset.toolPanelFilterRole = role;
      control.dataset.toolPanelFilterClauseIndex = String(clauseIndex);
      delete control.dataset.filterRole;
      delete control.dataset.filterClauseIndex;
    }
  }

  private appendToolPanelFilterEditorFields(
    formElement: HTMLDivElement,
    column: ColumnDef,
    mode: FilterPanelMode
  ): void {
    if (mode === 'text') {
      const textConditions = this.getConditionsForFilterPanelMode(column.id, 'text');
      formElement.append(
        this.createFilterClauseSection(
          this.localeText.filterPanelConditionOne,
          this.createToolPanelTextFilterClauseFields(
            (textConditions[0] as Extract<ColumnFilterCondition, { kind: 'text' }> | undefined) ?? null,
            0
          )
        )
      );
      if (this.supportsMultiConditionFilterMode(mode)) {
        formElement.append(this.createFilterClauseDivider());
        formElement.append(
          this.createFilterClauseSection(
            this.localeText.filterPanelConditionTwo,
            this.createToolPanelTextFilterClauseFields(
              (textConditions[1] as Extract<ColumnFilterCondition, { kind: 'text' }> | undefined) ?? null,
              1
            )
          )
        );
      }
      return;
    }

    if (mode === 'number') {
      const numberConditions = this.getConditionsForFilterPanelMode(column.id, 'number');
      formElement.append(
        this.createFilterClauseSection(
          this.localeText.filterPanelConditionOne,
          this.createToolPanelNumberFilterClauseFields(
            (numberConditions[0] as Extract<ColumnFilterCondition, { kind: 'number' }> | undefined) ?? null,
            0
          )
        )
      );
      if (this.supportsMultiConditionFilterMode(mode)) {
        formElement.append(this.createFilterClauseDivider());
        formElement.append(
          this.createFilterClauseSection(
            this.localeText.filterPanelConditionTwo,
            this.createToolPanelNumberFilterClauseFields(
              (numberConditions[1] as Extract<ColumnFilterCondition, { kind: 'number' }> | undefined) ?? null,
              1
            )
          )
        );
      }
      return;
    }

    if (mode === 'date') {
      const dateConditions = this.getConditionsForFilterPanelMode(column.id, 'date');
      formElement.append(
        this.createFilterClauseSection(
          this.localeText.filterPanelConditionOne,
          this.createToolPanelDateFilterClauseFields(
            (dateConditions[0] as Extract<ColumnFilterCondition, { kind: 'date' }> | undefined) ?? null,
            0
          )
        )
      );
      if (this.supportsMultiConditionFilterMode(mode)) {
        formElement.append(this.createFilterClauseDivider());
        formElement.append(
          this.createFilterClauseSection(
            this.localeText.filterPanelConditionTwo,
            this.createToolPanelDateFilterClauseFields(
              (dateConditions[1] as Extract<ColumnFilterCondition, { kind: 'date' }> | undefined) ?? null,
              1
            )
          )
        );
      }
      return;
    }

    const setCondition = this.getColumnFilterCondition(column.id)?.kind === 'set' ? this.getColumnFilterCondition(column.id) as SetFilterCondition : null;
    const selectedKeys = new Set<string>();
    if (setCondition) {
      for (let index = 0; index < setCondition.values.length; index += 1) {
        selectedKeys.add(normalizeFilterSetOptionKey(setCondition.values[index]));
      }
      if (setCondition.includeNull === true) {
        selectedKeys.add('null');
      }
    }

    const searchElement = this.createFilterInput('text', '');
    searchElement.className = 'hgrid__filter-panel-search';
    searchElement.placeholder = this.localeText.filterPanelSearch;
    searchElement.dataset.toolPanelFilterSetSearch = 'true';
    formElement.append(this.createFilterField(this.localeText.filterPanelSearch, searchElement));

    const listElement = document.createElement('div');
    listElement.className = 'hgrid__filter-panel-set-list hgrid__tool-panel-filter-set-list';
    const setOptions = this.collectFilterSetOptions(column);
    for (let index = 0; index < setOptions.length; index += 1) {
      const option = setOptions[index];
      const optionLabel = document.createElement('label');
      optionLabel.className = 'hgrid__filter-panel-set-option hgrid__tool-panel-filter-set-option';
      optionLabel.dataset.toolPanelFilterOptionLabel = option.label.toLowerCase();

      const checkboxElement = document.createElement('input');
      checkboxElement.type = 'checkbox';
      checkboxElement.checked = selectedKeys.has(option.key);
      checkboxElement.dataset.toolPanelFilterOptionKey = option.key;

      const textElement = document.createElement('span');
      textElement.textContent = option.label;

      optionLabel.append(checkboxElement, textElement);
      listElement.append(optionLabel);
    }
    formElement.append(listElement);
  }

  private readClauseScopedInputValue(role: 'operator' | 'value' | 'min' | 'max', clauseIndex: number): string {
    const selector = `[data-filter-role="${role}"][data-filter-clause-index="${clauseIndex}"]`;
    const inputElement = this.filterPanelElement.querySelector(selector) as HTMLInputElement | HTMLSelectElement | null;
    return inputElement?.value ?? '';
  }

  private readTextFilterClauseInput(clauseIndex: number): Extract<ColumnFilterCondition, { kind: 'text' }> | null {
    const value = this.readClauseScopedInputValue('value', clauseIndex);
    if (value.length === 0) {
      return null;
    }

    return {
      kind: 'text',
      operator: this.readClauseScopedInputValue('operator', clauseIndex) as TextFilterOperator,
      value,
      caseSensitive: false
    };
  }

  private readNumberFilterClauseInput(clauseIndex: number): Extract<ColumnFilterCondition, { kind: 'number' }> | null {
    const operator = this.readClauseScopedInputValue('operator', clauseIndex) as NumberFilterOperator;
    if (operator === 'between') {
      const min = this.readClauseScopedInputValue('min', clauseIndex);
      const max = this.readClauseScopedInputValue('max', clauseIndex);
      if (min.length === 0 || max.length === 0) {
        return null;
      }

      return {
        kind: 'number',
        operator,
        min: Number(min),
        max: Number(max)
      };
    }

    const value = this.readClauseScopedInputValue('value', clauseIndex);
    if (value.length === 0) {
      return null;
    }

    return {
      kind: 'number',
      operator,
      value: Number(value)
    };
  }

  private readDateFilterClauseInput(clauseIndex: number): Extract<ColumnFilterCondition, { kind: 'date' }> | null {
    const operator = this.readClauseScopedInputValue('operator', clauseIndex) as DateFilterOperator;
    if (operator === 'between') {
      const min = this.readClauseScopedInputValue('min', clauseIndex);
      const max = this.readClauseScopedInputValue('max', clauseIndex);
      if (min.length === 0 || max.length === 0) {
        return null;
      }

      return {
        kind: 'date',
        operator,
        min,
        max
      };
    }

    const value = this.readClauseScopedInputValue('value', clauseIndex);
    if (value.length === 0) {
      return null;
    }

    return {
      kind: 'date',
      operator,
      value
    };
  }

  private readToolPanelClauseScopedInputValue(role: 'operator' | 'value' | 'min' | 'max', clauseIndex: number): string {
    const selector = `[data-tool-panel-filter-role="${role}"][data-tool-panel-filter-clause-index="${clauseIndex}"]`;
    const inputElement = this.toolPanelElement.querySelector(selector) as HTMLInputElement | HTMLSelectElement | null;
    return inputElement?.value ?? '';
  }

  private readToolPanelTextFilterClauseInput(clauseIndex: number): Extract<ColumnFilterCondition, { kind: 'text' }> | null {
    const value = this.readToolPanelClauseScopedInputValue('value', clauseIndex);
    if (value.length === 0) {
      return null;
    }

    return {
      kind: 'text',
      operator: this.readToolPanelClauseScopedInputValue('operator', clauseIndex) as TextFilterOperator,
      value,
      caseSensitive: false
    };
  }

  private readToolPanelNumberFilterClauseInput(
    clauseIndex: number
  ): Extract<ColumnFilterCondition, { kind: 'number' }> | null {
    const operator = this.readToolPanelClauseScopedInputValue('operator', clauseIndex) as NumberFilterOperator;
    if (operator === 'between') {
      const min = this.readToolPanelClauseScopedInputValue('min', clauseIndex);
      const max = this.readToolPanelClauseScopedInputValue('max', clauseIndex);
      if (min.length === 0 || max.length === 0) {
        return null;
      }

      return {
        kind: 'number',
        operator,
        min: Number(min),
        max: Number(max)
      };
    }

    const value = this.readToolPanelClauseScopedInputValue('value', clauseIndex);
    if (value.length === 0) {
      return null;
    }

    return {
      kind: 'number',
      operator,
      value: Number(value)
    };
  }

  private readToolPanelDateFilterClauseInput(clauseIndex: number): Extract<ColumnFilterCondition, { kind: 'date' }> | null {
    const operator = this.readToolPanelClauseScopedInputValue('operator', clauseIndex) as DateFilterOperator;
    if (operator === 'between') {
      const min = this.readToolPanelClauseScopedInputValue('min', clauseIndex);
      const max = this.readToolPanelClauseScopedInputValue('max', clauseIndex);
      if (min.length === 0 || max.length === 0) {
        return null;
      }

      return {
        kind: 'date',
        operator,
        min,
        max
      };
    }

    const value = this.readToolPanelClauseScopedInputValue('value', clauseIndex);
    if (value.length === 0) {
      return null;
    }

    return {
      kind: 'date',
      operator,
      value
    };
  }

  private readToolPanelFilterInput(): ColumnFilterInput | null {
    const column = this.getActiveToolPanelFilterColumn();
    const mode = this.activeToolPanelFilterMode;
    if (!column || !mode) {
      return null;
    }

    if (mode === 'text') {
      const conditions = [this.readToolPanelTextFilterClauseInput(0), this.readToolPanelTextFilterClauseInput(1)].filter(
        (condition): condition is Extract<ColumnFilterCondition, { kind: 'text' }> => Boolean(condition)
      );
      if (conditions.length === 0) {
        return null;
      }
      return conditions.length === 1 ? conditions[0] : conditions;
    }

    if (mode === 'number') {
      const conditions = [this.readToolPanelNumberFilterClauseInput(0), this.readToolPanelNumberFilterClauseInput(1)].filter(
        (condition): condition is Extract<ColumnFilterCondition, { kind: 'number' }> => Boolean(condition)
      );
      if (conditions.length === 0) {
        return null;
      }
      return conditions.length === 1 ? conditions[0] : conditions;
    }

    if (mode === 'date') {
      const conditions = [this.readToolPanelDateFilterClauseInput(0), this.readToolPanelDateFilterClauseInput(1)].filter(
        (condition): condition is Extract<ColumnFilterCondition, { kind: 'date' }> => Boolean(condition)
      );
      if (conditions.length === 0) {
        return null;
      }
      return conditions.length === 1 ? conditions[0] : conditions;
    }

    const selectedKeys = new Set<string>();
    const selectedValues: unknown[] = [];
    const optionElements = this.toolPanelElement.querySelectorAll('[data-tool-panel-filter-option-key]');
    for (let index = 0; index < optionElements.length; index += 1) {
      const optionElement = optionElements[index] as HTMLInputElement;
      if (!optionElement.checked) {
        continue;
      }
      const optionKey = optionElement.dataset.toolPanelFilterOptionKey ?? '';
      selectedKeys.add(optionKey);
    }

    const setOptions = this.collectFilterSetOptions(column);
    for (let index = 0; index < setOptions.length; index += 1) {
      const option = setOptions[index];
      if (!selectedKeys.has(option.key) || option.isNull) {
        continue;
      }
      selectedValues.push(option.value);
    }

    if (selectedValues.length === 0 && !selectedKeys.has('null')) {
      return null;
    }

    return {
      kind: 'set',
      values: selectedValues,
      includeNull: selectedKeys.has('null')
    };
  }

  private positionFilterPanel(anchorRect: DOMRect): void {
    const rootRect = this.rootElement.getBoundingClientRect();
    const panelRect = this.filterPanelElement.getBoundingClientRect();
    const rootWidth = Math.max(this.rootElement.clientWidth, Math.round(rootRect.width));
    const rootHeight = Math.max(this.rootElement.clientHeight, Math.round(rootRect.height));
    const availableWidth = Math.max(1, rootWidth - 16);
    const availableHeight = Math.max(1, rootHeight - 16);
    const preferredWidth = Math.max(280, anchorRect.width);
    this.filterPanelElement.style.minWidth = `${Math.min(preferredWidth, availableWidth)}px`;
    this.filterPanelElement.style.maxWidth = `${availableWidth}px`;
    this.filterPanelElement.style.maxHeight = `${availableHeight}px`;

    const measuredPanelRect = this.filterPanelElement.getBoundingClientRect();
    const panelWidth = Math.min(Math.max(measuredPanelRect.width, Math.min(220, availableWidth)), availableWidth);
    const panelHeight = Math.min(Math.max(measuredPanelRect.height, 0), availableHeight);
    const fallbackLeft =
      this.options.rtl === true ? anchorRect.left - rootRect.left : anchorRect.right - rootRect.left - panelWidth;
    const left = Math.max(8, Math.min(Math.max(8, rootWidth - panelWidth - 8), fallbackLeft));
    const belowTop = Math.max(8, anchorRect.bottom - rootRect.top + 6);
    const aboveTop = Math.max(8, anchorRect.top - rootRect.top - panelHeight - 6);
    const top = belowTop + panelHeight <= rootHeight - 8 ? belowTop : aboveTop;

    this.filterPanelElement.style.left = `${left}px`;
    this.filterPanelElement.style.top = `${Math.max(8, top)}px`;
    this.filterPanelElement.style.minWidth = `${Math.min(Math.max(280, anchorRect.width + 56), Math.max(280, rootWidth - 16))}px`;
  }

  private focusFirstFilterPanelControl(): void {
    const control = this.filterPanelElement.querySelector(
      '.hgrid__filter-panel-input, .hgrid__filter-panel-select, .hgrid__filter-panel-search, .hgrid__filter-panel-mode'
    ) as HTMLElement | null;
    control?.focus();
  }

  private renderFilterPanel(): void {
    const openFilterPanelState = this.openFilterPanelState;
    if (!openFilterPanelState) {
      this.filterPanelBodyElement.replaceChildren();
      return;
    }

    const column = openFilterPanelState.context.column;
    const currentCondition = this.getColumnFilterCondition(column.id);
    const currentMode = openFilterPanelState.mode;
    const children: HTMLElement[] = [];

    const headerElement = document.createElement('div');
    headerElement.className = 'hgrid__filter-panel-header';
    const titleElement = document.createElement('div');
    titleElement.className = 'hgrid__filter-panel-title';
    titleElement.textContent = `${this.localeText.filterPanelTitle} · ${column.header}`;
    headerElement.append(titleElement);

    if (this.canSwitchTextSetFilter(column)) {
      const modeToggleElement = document.createElement('div');
      modeToggleElement.className = 'hgrid__filter-panel-mode-toggle';

      const textModeButton = document.createElement('button');
      textModeButton.type = 'button';
      textModeButton.className = 'hgrid__filter-panel-mode';
      textModeButton.dataset.filterModeTrigger = 'text';
      textModeButton.textContent = this.localeText.filterPanelTextMode;
      textModeButton.setAttribute('aria-pressed', currentMode === 'text' ? 'true' : 'false');
      textModeButton.classList.toggle('hgrid__filter-panel-mode--active', currentMode === 'text');

      const setModeButton = document.createElement('button');
      setModeButton.type = 'button';
      setModeButton.className = 'hgrid__filter-panel-mode';
      setModeButton.dataset.filterModeTrigger = 'set';
      setModeButton.textContent = this.localeText.filterPanelSetMode;
      setModeButton.setAttribute('aria-pressed', currentMode === 'set' ? 'true' : 'false');
      setModeButton.classList.toggle('hgrid__filter-panel-mode--active', currentMode === 'set');

      modeToggleElement.append(textModeButton, setModeButton);
      headerElement.append(modeToggleElement);
    }

    children.push(headerElement);

    const bodyElement = document.createElement('div');
    bodyElement.className = 'hgrid__filter-panel-form';

    if (currentMode === 'text') {
      const textConditions = this.getConditionsForFilterPanelMode(column.id, 'text');
      bodyElement.append(
        this.createFilterClauseSection(
          this.localeText.filterPanelConditionOne,
          this.createTextFilterClauseFields((textConditions[0] as Extract<ColumnFilterCondition, { kind: 'text' }> | undefined) ?? null, 0)
        )
      );
      if (this.supportsMultiConditionFilterMode(currentMode)) {
        bodyElement.append(this.createFilterClauseDivider());
        bodyElement.append(
          this.createFilterClauseSection(
            this.localeText.filterPanelConditionTwo,
            this.createTextFilterClauseFields((textConditions[1] as Extract<ColumnFilterCondition, { kind: 'text' }> | undefined) ?? null, 1)
          )
        );
      }
    } else if (currentMode === 'number') {
      const numberConditions = this.getConditionsForFilterPanelMode(column.id, 'number');
      bodyElement.append(
        this.createFilterClauseSection(
          this.localeText.filterPanelConditionOne,
          this.createNumberFilterClauseFields(
            (numberConditions[0] as Extract<ColumnFilterCondition, { kind: 'number' }> | undefined) ?? null,
            0
          )
        )
      );
      if (this.supportsMultiConditionFilterMode(currentMode)) {
        bodyElement.append(this.createFilterClauseDivider());
        bodyElement.append(
          this.createFilterClauseSection(
            this.localeText.filterPanelConditionTwo,
            this.createNumberFilterClauseFields(
              (numberConditions[1] as Extract<ColumnFilterCondition, { kind: 'number' }> | undefined) ?? null,
              1
            )
          )
        );
      }
    } else if (currentMode === 'date') {
      const dateConditions = this.getConditionsForFilterPanelMode(column.id, 'date');
      bodyElement.append(
        this.createFilterClauseSection(
          this.localeText.filterPanelConditionOne,
          this.createDateFilterClauseFields((dateConditions[0] as Extract<ColumnFilterCondition, { kind: 'date' }> | undefined) ?? null, 0)
        )
      );
      if (this.supportsMultiConditionFilterMode(currentMode)) {
        bodyElement.append(this.createFilterClauseDivider());
        bodyElement.append(
          this.createFilterClauseSection(
            this.localeText.filterPanelConditionTwo,
            this.createDateFilterClauseFields((dateConditions[1] as Extract<ColumnFilterCondition, { kind: 'date' }> | undefined) ?? null, 1)
          )
        );
      }
    } else {
      const setCondition = currentCondition?.kind === 'set' ? currentCondition : null;
      const selectedKeys = new Set<string>();
      if (setCondition) {
        for (let index = 0; index < setCondition.values.length; index += 1) {
          selectedKeys.add(normalizeFilterSetOptionKey(setCondition.values[index]));
        }
        if (setCondition.includeNull === true) {
          selectedKeys.add('null');
        }
      }

      const searchElement = this.createFilterInput('text', '');
      searchElement.className = 'hgrid__filter-panel-search';
      searchElement.placeholder = this.localeText.filterPanelSearch;
      searchElement.dataset.filterSetSearch = 'true';
      bodyElement.append(this.createFilterField(this.localeText.filterPanelSearch, searchElement));

      const listElement = document.createElement('div');
      listElement.className = 'hgrid__filter-panel-set-list';
      for (let index = 0; index < openFilterPanelState.setOptions.length; index += 1) {
        const option = openFilterPanelState.setOptions[index];
        const optionLabel = document.createElement('label');
        optionLabel.className = 'hgrid__filter-panel-set-option';
        optionLabel.dataset.filterOptionLabel = option.label.toLowerCase();

        const checkboxElement = document.createElement('input');
        checkboxElement.type = 'checkbox';
        checkboxElement.checked = selectedKeys.has(option.key);
        checkboxElement.dataset.filterOptionKey = option.key;

        const textElement = document.createElement('span');
        textElement.textContent = option.label;

        optionLabel.append(checkboxElement, textElement);
        listElement.append(optionLabel);
      }
      bodyElement.append(listElement);
    }

    children.push(bodyElement);

    const actionRowElement = document.createElement('div');
    actionRowElement.className = 'hgrid__filter-panel-actions';
    actionRowElement.append(
      this.createFilterActionButton('apply', this.localeText.filterPanelApply),
      this.createFilterActionButton('clear', this.localeText.filterPanelClear),
      this.createFilterActionButton('cancel', this.localeText.filterPanelCancel)
    );
    children.push(actionRowElement);

    this.filterPanelBodyElement.replaceChildren(...children);
  }

  private openFilterPanelForContext(context: GridContextMenuContext, source: GridMenuOpenSource): void {
    if (context.kind === 'cell') {
      return;
    }

    const headerCell = this.findVisibleHeaderCellByColumnId(context.column.id);
    if (!headerCell) {
      return;
    }

    this.closeColumnMenu();
    this.openFilterPanelState = {
      columnId: context.column.id,
      source,
      context,
      mode: this.resolveFilterPanelMode(context.column),
      setOptions: this.collectFilterSetOptions(context.column)
    };

    this.renderFilterPanel();
    this.filterPanelElement.classList.add('hgrid__filter-panel--open');
    this.filterPanelElement.style.display = 'flex';
    this.positionFilterPanel(headerCell.getBoundingClientRect());
    this.focusFirstFilterPanelControl();
  }

  private closeFilterPanel(restoreFocus = false): void {
    this.openFilterPanelState = null;
    this.filterPanelElement.classList.remove('hgrid__filter-panel--open');
    this.filterPanelElement.style.display = 'none';
    this.filterPanelElement.style.left = '';
    this.filterPanelElement.style.top = '';
    this.filterPanelElement.style.minWidth = '';
    this.filterPanelElement.style.maxWidth = '';
    this.filterPanelElement.style.maxHeight = '';
    this.filterPanelBodyElement.replaceChildren();
    if (restoreFocus) {
      this.rootElement.focus();
    }
  }

  private readFilterPanelInput(): ColumnFilterInput | null {
    const openFilterPanelState = this.openFilterPanelState;
    if (!openFilterPanelState) {
      return null;
    }

    const mode = openFilterPanelState.mode;
    if (mode === 'text') {
      const conditions = [this.readTextFilterClauseInput(0), this.readTextFilterClauseInput(1)].filter(
        (condition): condition is Extract<ColumnFilterCondition, { kind: 'text' }> => Boolean(condition)
      );
      if (conditions.length === 0) {
        return null;
      }
      return conditions.length === 1 ? conditions[0] : conditions;
    }

    if (mode === 'number') {
      const conditions = [this.readNumberFilterClauseInput(0), this.readNumberFilterClauseInput(1)].filter(
        (condition): condition is Extract<ColumnFilterCondition, { kind: 'number' }> => Boolean(condition)
      );
      if (conditions.length === 0) {
        return null;
      }
      return conditions.length === 1 ? conditions[0] : conditions;
    }

    if (mode === 'date') {
      const conditions = [this.readDateFilterClauseInput(0), this.readDateFilterClauseInput(1)].filter(
        (condition): condition is Extract<ColumnFilterCondition, { kind: 'date' }> => Boolean(condition)
      );
      if (conditions.length === 0) {
        return null;
      }
      return conditions.length === 1 ? conditions[0] : conditions;
    }

    const selectedValues: unknown[] = [];
    let includeNull = false;
    const checkboxes = this.filterPanelElement.querySelectorAll('[data-filter-option-key]') as NodeListOf<HTMLInputElement>;
    for (let index = 0; index < checkboxes.length; index += 1) {
      const checkboxElement = checkboxes[index];
      if (!checkboxElement.checked) {
        continue;
      }

      const optionKey = checkboxElement.dataset.filterOptionKey ?? '';
      const option = openFilterPanelState.setOptions.find((setOption) => setOption.key === optionKey);
      if (!option) {
        continue;
      }

      if (option.isNull) {
        includeNull = true;
      } else {
        selectedValues.push(option.value);
      }
    }

    if (selectedValues.length === 0 && !includeNull) {
      return null;
    }

    const condition: SetFilterCondition = {
      kind: 'set',
      values: selectedValues,
      includeNull
    };
    return condition;
  }

  private closeColumnMenu(restoreFocus = false): void {
    this.openColumnMenuState = null;
    this.columnMenuElement.classList.remove('hgrid__column-menu--open');
    this.columnMenuElement.style.display = 'none';
    this.columnMenuElement.style.left = '';
    this.columnMenuElement.style.top = '';
    this.columnMenuElement.style.minWidth = '';
    this.columnMenuElement.style.maxWidth = '';
    this.columnMenuElement.style.maxHeight = '';
    this.columnMenuListElement.replaceChildren();
    if (restoreFocus) {
      this.rootElement.focus();
    }
  }

  private measureAutoSizedColumnWidth(column: ColumnDef): number {
    const selector = `[data-column-id="${escapeAttributeSelectorValue(column.id)}"]`;
    const elements = this.rootElement.querySelectorAll(`.hgrid__header-cell${selector}, .hgrid__cell${selector}`);
    let maxContentWidth = estimateTextPixelWidth(column.header);

    for (let index = 0; index < elements.length; index += 1) {
      const element = elements[index] as HTMLElement;
      const measuredWidth = Math.max(
        element.scrollWidth,
        element.clientWidth,
        estimateTextPixelWidth(element.textContent?.trim() ?? '')
      );
      maxContentWidth = Math.max(maxContentWidth, measuredWidth);
    }

    const resolvedColumn = column as ResolvedColumnDef;
    const triggerPadding = this.getColumnMenuTriggerMode() === 'button' || this.getColumnMenuTriggerMode() === 'both' ? 18 : 0;
    const nextWidth = Math.ceil(maxContentWidth + 26 + triggerPadding);
    const minWidth = resolvedColumn.minWidth ?? nextWidth;
    const maxWidth = resolvedColumn.maxWidth ?? nextWidth;
    return Math.max(minWidth, Math.min(maxWidth, nextWidth));
  }

  private handleColumnMenuItemSelection(target: HTMLElement | null): boolean {
    if (!target) {
      return false;
    }

    const itemElement = target.closest('.hgrid__column-menu-item') as HTMLButtonElement | null;
    const openMenuState = this.openColumnMenuState;
    if (!itemElement || !openMenuState || itemElement.disabled) {
      return false;
    }

    const itemIndex = Number.parseInt(itemElement.dataset.menuItemIndex ?? '-1', 10);
    if (!Number.isFinite(itemIndex) || itemIndex < 0 || itemIndex >= openMenuState.items.length) {
      return false;
    }

    const item = openMenuState.items[itemIndex];
    if (!item || item.isSeparator || item.disabled) {
      return false;
    }

    this.closeColumnMenu(true);

    if (item.builtInActionId === 'autoSizeColumn') {
      this.eventBus.emit('columnResize', {
        columnId: openMenuState.columnId,
        width: this.measureAutoSizedColumnWidth(openMenuState.context.column),
        phase: 'end'
      });
      return true;
    }

    if (item.builtInActionId === 'resetColumnWidth') {
      const column = openMenuState.context.column as ResolvedColumnDef;
      this.eventBus.emit('columnResize', {
        columnId: openMenuState.columnId,
        width: column.initialWidth ?? column.width,
        phase: 'end'
      });
      return true;
    }

    if (item.builtInActionId === 'copyCell') {
      const cellText = this.resolveBodyContextCellCopyText(openMenuState.context);
      if (cellText !== null) {
        this.writeTextToClipboard(cellText);
      }
      return true;
    }

    if (item.builtInActionId === 'copyRow') {
      const rowText = this.resolveBodyContextRowCopyText(openMenuState.context);
      if (rowText !== null) {
        this.writeTextToClipboard(rowText);
      }
      return true;
    }

    if (item.builtInActionId === 'copySelection') {
      const selectionTsv = this.buildSelectionTsv();
      if (selectionTsv !== null) {
        this.writeTextToClipboard(selectionTsv);
      }
      return true;
    }

    if (item.builtInActionId === 'filterByValue') {
      const filterInput = this.resolveBodyContextFilterInput(openMenuState.context);
      if (filterInput) {
        this.eventBus.emit('filterUiApply', {
          columnId: openMenuState.context.column.id,
          filterInput
        });
      }
      return true;
    }

    if (item.builtInActionId === 'clearColumnFilter') {
      this.eventBus.emit('filterUiApply', {
        columnId: openMenuState.context.column.id,
        filterInput: null
      });
      return true;
    }

    if (item.builtInActionId && isBuiltInColumnMenuActionId(item.builtInActionId)) {
      this.eventBus.emit('columnMenuAction', {
        columnId: openMenuState.columnId,
        actionId: item.builtInActionId,
        source: openMenuState.source
      });
      return true;
    }

    item.onSelect?.(openMenuState.context);
    return true;
  }

  private handleFilterPanelClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const modeButton = target.closest('[data-filter-mode-trigger]') as HTMLButtonElement | null;
    if (modeButton && this.openFilterPanelState) {
      const nextMode = modeButton.dataset.filterModeTrigger;
      if (nextMode === 'text' || nextMode === 'set') {
        this.openFilterPanelState = {
          ...this.openFilterPanelState,
          mode: nextMode
        };
        this.renderFilterPanel();
      }
      event.preventDefault();
      return;
    }

    const actionButton = target.closest('[data-filter-action]') as HTMLButtonElement | null;
    if (!actionButton || !this.openFilterPanelState) {
      return;
    }

    const action = actionButton.dataset.filterAction;
    if (action === 'cancel') {
      this.closeFilterPanel(true);
      event.preventDefault();
      return;
    }

    if (action === 'clear') {
      this.eventBus.emit('filterUiApply', {
        columnId: this.openFilterPanelState.columnId,
        filterInput: null
      });
      this.closeFilterPanel(true);
      event.preventDefault();
      return;
    }

    if (action === 'apply') {
      this.eventBus.emit('filterUiApply', {
        columnId: this.openFilterPanelState.columnId,
        filterInput: this.readFilterPanelInput()
      });
      this.closeFilterPanel(true);
      event.preventDefault();
    }
  };

  private handleFilterPanelInput = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.dataset.filterSetSearch !== 'true') {
      return;
    }

    const searchText = target.value.trim().toLowerCase();
    const optionElements = this.filterPanelElement.querySelectorAll('.hgrid__filter-panel-set-option');
    for (let index = 0; index < optionElements.length; index += 1) {
      const optionElement = optionElements[index] as HTMLLabelElement;
      const label = optionElement.dataset.filterOptionLabel ?? '';
      optionElement.style.display = searchText.length === 0 || label.includes(searchText) ? '' : 'none';
    }
  };

  private emitGroupingToolPanelState(nextState: {
    mode?: GroupingMode;
    groupModel?: GroupModelItem[];
    aggregations?: GroupAggregationDef[];
  }): void {
    this.eventBus.emit('groupingUiApply', {
      mode: nextState.mode ?? this.getCurrentGroupingMode(),
      groupModel: nextState.groupModel ?? this.getCurrentGroupModel(),
      aggregations: nextState.aggregations ?? this.getCurrentGroupAggregations()
    });
  }

  private emitPivotToolPanelState(nextState: {
    mode?: PivotingMode;
    pivotModel?: PivotModelItem[];
    values?: PivotValueDef[];
  }): void {
    this.eventBus.emit('pivotUiApply', {
      mode: nextState.mode ?? this.getCurrentPivotingMode(),
      pivotModel: nextState.pivotModel ?? this.getCurrentPivotModel(),
      values: nextState.values ?? this.getCurrentPivotValues()
    });
  }

  private buildNextAggregationState(
    currentAggregations: GroupAggregationDef[],
    columnId: string,
    aggregateType: GroupAggregationType | null
  ): GroupAggregationDef[] {
    const nextAggregations = currentAggregations
      .filter((item) => item.columnId !== columnId)
      .map((item) => ({ ...item }));
    if (aggregateType) {
      nextAggregations.push({
        columnId,
        type: aggregateType
      });
    }

    return nextAggregations;
  }

  private buildNextPivotValueState(
    currentValues: PivotValueDef[],
    columnId: string,
    aggregateType: GroupAggregationType | null
  ): PivotValueDef[] {
    const nextValues = currentValues.filter((item) => item.columnId !== columnId).map((item) => ({ ...item }));
    if (aggregateType) {
      nextValues.push({
        columnId,
        type: aggregateType
      });
    }

    return nextValues;
  }

  private handleToolPanelRailClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const buttonElement = target.closest('[data-tool-panel-toggle]') as HTMLButtonElement | null;
    if (!buttonElement) {
      return;
    }

    if (this.openToolPanelId) {
      this.closeToolPanel();
    } else {
      const panelId = this.getPreferredToolPanelId(this.getConfiguredToolPanels());
      if (panelId) {
        this.openToolPanel(panelId);
      }
    }
    event.preventDefault();
  };

  private handleToolPanelClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const tabButton = target.closest('[data-tool-panel-tab-id]') as HTMLButtonElement | null;
    if (tabButton) {
      const panelId = tabButton.dataset.toolPanelTabId;
      if (panelId && this.isToolPanelAvailable(panelId)) {
        this.openToolPanel(panelId);
      }
      event.preventDefault();
      return;
    }

    const filterSurfaceButton = target.closest('[data-tool-panel-filter-surface]') as HTMLButtonElement | null;
    if (filterSurfaceButton) {
      const nextSurface = filterSurfaceButton.dataset.toolPanelFilterSurface;
      if (nextSurface === 'quick' || nextSurface === 'builder') {
        this.activeToolPanelFilterSurface = nextSurface;
        this.renderToolPanel();
      }
      event.preventDefault();
      return;
    }

    const columnButton = target.closest('[data-tool-panel-filter-column-id]') as HTMLButtonElement | null;
    if (columnButton) {
      const columnId = columnButton.dataset.toolPanelFilterColumnId ?? '';
      if (columnId.length > 0) {
        this.activeToolPanelFilterColumnId = columnId;
        const column = this.getActiveToolPanelFilterColumn();
        if (column) {
          this.activeToolPanelFilterMode = this.resolveFilterPanelMode(column);
        }
        this.renderToolPanel();
      }
      event.preventDefault();
      return;
    }

    const modeButton = target.closest('[data-tool-panel-filter-mode-trigger]') as HTMLButtonElement | null;
    if (modeButton) {
      const nextMode = modeButton.dataset.toolPanelFilterModeTrigger;
      const activeColumn = this.getActiveToolPanelFilterColumn();
      if (
        activeColumn &&
        (nextMode === 'text' || nextMode === 'set') &&
        this.isToolPanelFilterModeAllowed(activeColumn, nextMode)
      ) {
        this.activeToolPanelFilterMode = nextMode;
        this.renderToolPanel();
      }
      event.preventDefault();
      return;
    }

    const filterActionButton = target.closest('[data-tool-panel-filter-action]') as HTMLButtonElement | null;
    if (filterActionButton) {
      const activeColumn = this.getActiveToolPanelFilterColumn();
      if (!activeColumn) {
        return;
      }

      const action = filterActionButton.dataset.toolPanelFilterAction;
      if (action === 'clear') {
        this.eventBus.emit('filterUiApply', {
          columnId: activeColumn.id,
          filterInput: null
        });
        event.preventDefault();
        return;
      }

      if (action === 'apply') {
        this.eventBus.emit('filterUiApply', {
          columnId: activeColumn.id,
          filterInput: this.readToolPanelFilterInput()
        });
        event.preventDefault();
        return;
      }
    }

    const advancedFilterActionButton = target.closest('[data-advanced-filter-action]') as HTMLButtonElement | null;
    if (advancedFilterActionButton) {
      const action = advancedFilterActionButton.dataset.advancedFilterAction;
      if (action === 'add-rule') {
        this.appendAdvancedFilterDraftChild(
          this.parseAdvancedFilterPath(advancedFilterActionButton.dataset.advancedFilterPath),
          'rule'
        );
        this.renderToolPanel();
        event.preventDefault();
        return;
      }

      if (action === 'add-group') {
        this.appendAdvancedFilterDraftChild(
          this.parseAdvancedFilterPath(advancedFilterActionButton.dataset.advancedFilterPath),
          'group'
        );
        this.renderToolPanel();
        event.preventDefault();
        return;
      }

      if (action === 'remove-node') {
        const path = this.parseAdvancedFilterPath(advancedFilterActionButton.dataset.advancedFilterPath);
        if (path) {
          this.updateAdvancedFilterDraftNode(path, () => null);
          this.renderToolPanel();
        }
        event.preventDefault();
        return;
      }

      if (action === 'apply') {
        this.eventBus.emit('advancedFilterUiApply', {
          advancedFilterModel: this.normalizeAdvancedFilterDraft()
        });
        event.preventDefault();
        return;
      }

      if (action === 'clear') {
        this.toolPanelAdvancedFilterDraft = this.createDefaultAdvancedFilterDraft();
        this.eventBus.emit('advancedFilterUiApply', {
          advancedFilterModel: null
        });
        this.renderToolPanel();
        event.preventDefault();
        return;
      }
    }

    const advancedFilterPresetButton = target.closest('[data-advanced-filter-preset-action]') as HTMLButtonElement | null;
    if (advancedFilterPresetButton) {
      const action = advancedFilterPresetButton.dataset.advancedFilterPresetAction;
      const presetId = this.toolPanelAdvancedFilterPresetId ?? this.toolPanelAdvancedFilterPresetLabel.trim();
      const label = this.toolPanelAdvancedFilterPresetLabel.trim();
      if ((action === 'save' || action === 'apply' || action === 'delete') && presetId.length > 0) {
        if (action === 'save' || action === 'apply') {
          this.toolPanelAdvancedFilterPresetId = presetId;
        }
        this.eventBus.emit('advancedFilterPresetUiAction', {
          action,
          presetId,
          label
        });
      }
      return;
    }

    const columnLayoutPresetButton = target.closest('[data-tool-panel-columns-preset-action]') as HTMLButtonElement | null;
    if (columnLayoutPresetButton) {
      if (columnLayoutPresetButton.dataset.toolPanelColumnsPresetAction === 'apply' && this.toolPanelColumnLayoutPresetId) {
        const preset = this.getColumnLayoutPresets().find((candidate) => candidate.id === this.toolPanelColumnLayoutPresetId) ?? null;
        if (preset) {
          this.eventBus.emit('columnLayoutPresetUiApply', {
            presetId: preset.id,
            layout: cloneColumnLayoutValue(preset.layout)
          });
        }
      }
      event.preventDefault();
      return;
    }

    const orderButton = target.closest('[data-tool-panel-order-column-id]') as HTMLButtonElement | null;
    if (orderButton) {
      const columnId = orderButton.dataset.toolPanelOrderColumnId ?? '';
      const direction = orderButton.dataset.toolPanelOrderDirection;
      const kind = orderButton.dataset.toolPanelOrderKind;
      if (columnId.length > 0 && (direction === 'up' || direction === 'down')) {
        if (kind === 'columns') {
          this.moveColumnsToolPanelColumnOrder(columnId, direction);
        } else if (kind === 'group') {
          this.emitGroupingToolPanelState({
            groupModel: this.moveOrderedColumnModel(this.getCurrentGroupModel(), columnId, direction)
          });
        } else if (kind === 'pivot') {
          this.emitPivotToolPanelState({
            pivotModel: this.moveOrderedColumnModel(this.getCurrentPivotModel(), columnId, direction)
          });
        }
      }
      event.preventDefault();
      return;
    }

    const panelActionButton = target.closest('[data-tool-panel-action-kind]') as HTMLButtonElement | null;
    if (panelActionButton) {
      const action = panelActionButton.dataset.toolPanelAction;
      const kind = panelActionButton.dataset.toolPanelActionKind;
      if (action === 'clear' && kind === 'grouping') {
        this.emitGroupingToolPanelState({
          groupModel: [],
          aggregations: []
        });
        event.preventDefault();
        return;
      }

      if (action === 'clear' && kind === 'pivot') {
        this.emitPivotToolPanelState({
          pivotModel: [],
          values: []
        });
        event.preventDefault();
        return;
      }
    }

    const closeButton = target.closest('[data-tool-panel-action="close"]') as HTMLButtonElement | null;
    if (!closeButton) {
      return;
    }

    this.closeToolPanel();
    this.rootElement.focus();
    event.preventDefault();
  };

  private handleEditActionBarClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const actionButton = target.closest('[data-edit-action-bar-action]') as HTMLButtonElement | null;
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.editActionBarAction;
    if (action !== 'save' && action !== 'discard') {
      return;
    }

    event.preventDefault();
    void this.runEditActionBarAction(action);
  };

  private handleDirtyChangeEvent = (): void => {
    this.editActionBarDirty = true;
    this.scheduleRender();
  };

  private handleToolPanelChange = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.dataset.toolPanelColumnsPresetSelect === 'true') {
      this.toolPanelColumnLayoutPresetId = target.value || null;
      this.renderToolPanel();
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.advancedFilterRole === 'match') {
      this.reconcileToolPanelAdvancedFilterDraft();
      if (this.toolPanelAdvancedFilterDraft) {
        this.toolPanelAdvancedFilterDraft = {
          operator: target.value === 'or' ? 'or' : 'and',
          rules: this.toolPanelAdvancedFilterDraft.rules
            .map((rule) => this.cloneAdvancedFilterDraftNode(rule))
            .filter((rule): rule is AdvancedFilterNode => rule !== null)
        };
      }
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.advancedFilterRole === 'group-operator') {
      const path = this.parseAdvancedFilterPath(target.dataset.advancedFilterPath);
      if (path) {
        this.updateAdvancedFilterDraftNode(path, (node) => {
          if (!isAdvancedFilterGroup(node)) {
            return node;
          }

          return {
            kind: 'group',
            operator: target.value === 'or' ? 'or' : 'and',
            rules: node.rules.map((rule) => this.cloneAdvancedFilterDraftNode(rule)).filter((rule): rule is AdvancedFilterNode => rule !== null)
          };
        });
      }
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.advancedFilterRole === 'column') {
      const path = this.parseAdvancedFilterPath(target.dataset.advancedFilterPath);
      const nextColumn = this.getFilterableToolPanelColumns().find((column) => column.id === target.value);
      if (path && nextColumn) {
        this.updateAdvancedFilterDraftNode(path, () => this.createDefaultAdvancedFilterRuleNode(nextColumn));
        this.renderToolPanel();
      }
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.advancedFilterRole === 'condition-kind') {
      const path = this.parseAdvancedFilterPath(target.dataset.advancedFilterPath);
      if (path) {
        this.updateAdvancedFilterDraftNode(path, (node) => {
          if (isAdvancedFilterGroup(node)) {
            return node;
          }
          const column = this.getFilterableToolPanelColumns().find((candidate) => candidate.id === node.columnId);
          if (!column) {
            return node;
          }

          if (target.value === 'set') {
            return {
              kind: node.kind === 'rule' ? 'rule' : undefined,
              columnId: node.columnId,
              condition: {
                kind: 'set',
                values: []
              }
            };
          }

          return {
            kind: node.kind === 'rule' ? 'rule' : undefined,
            columnId: node.columnId,
            condition: this.createDefaultAdvancedFilterCondition(column)
          };
        });
        this.renderToolPanel();
      }
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.advancedFilterRole === 'condition-operator') {
      const path = this.parseAdvancedFilterPath(target.dataset.advancedFilterPath);
      if (path) {
        this.updateAdvancedFilterDraftNode(path, (node) => {
          if (isAdvancedFilterGroup(node)) {
            return node;
          }

          return {
            kind: node.kind === 'rule' ? 'rule' : undefined,
            columnId: node.columnId,
            condition: {
              ...node.condition,
              operator: target.value
            } as ColumnFilterCondition
          };
        });
      }
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.advancedFilterRole === 'set-option') {
      const path = this.parseAdvancedFilterPath(target.dataset.advancedFilterPath);
      const optionKey = target.dataset.advancedFilterSetKey ?? '';
      if (path && optionKey.length > 0) {
        this.updateAdvancedFilterDraftNode(path, (node) => {
          if (isAdvancedFilterGroup(node) || node.condition.kind !== 'set') {
            return node;
          }

          const column = this.getFilterableToolPanelColumns().find((candidate) => candidate.id === node.columnId);
          if (!column) {
            return node;
          }

          const selectedKeys = this.getSetConditionSelectedKeys(node.condition);
          if (target.checked) {
            selectedKeys.add(optionKey);
          } else {
            selectedKeys.delete(optionKey);
          }

          const setOptions = this.collectFilterSetOptions(column);
          const nextValues: unknown[] = [];
          for (let index = 0; index < setOptions.length; index += 1) {
            const option = setOptions[index];
            if (!selectedKeys.has(option.key) || option.isNull) {
              continue;
            }
            nextValues.push(option.value);
          }

          return {
            kind: node.kind === 'rule' ? 'rule' : undefined,
            columnId: node.columnId,
            condition: {
              kind: 'set',
              values: nextValues,
              includeNull: selectedKeys.has('null')
            }
          };
        });
      }
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.advancedFilterPresetSelect === 'true') {
      this.toolPanelAdvancedFilterPresetId = target.value || null;
      const preset = this.getAdvancedFilterPresets().find((candidate) => candidate.id === target.value) ?? null;
      if (preset) {
        this.toolPanelAdvancedFilterPresetLabel = preset.label;
      }
      this.renderToolPanel();
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.toolPanelVisibilityColumnId) {
      this.eventBus.emit('columnVisibilityChange', {
        columnId: target.dataset.toolPanelVisibilityColumnId,
        isVisible: target.checked
      });
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.toolPanelPinColumnId) {
      const nextPinned = target.value === 'left' || target.value === 'right' ? target.value : undefined;
      this.eventBus.emit('columnPinChange', {
        columnId: target.dataset.toolPanelPinColumnId,
        pinned: nextPinned
      });
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.toolPanelModeKind === 'grouping') {
      this.emitGroupingToolPanelState({
        mode: target.value === 'server' ? 'server' : 'client'
      });
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.toolPanelModeKind === 'pivot') {
      this.emitPivotToolPanelState({
        mode: target.value === 'server' ? 'server' : 'client'
      });
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.toolPanelGroupColumnId) {
      const columnId = target.dataset.toolPanelGroupColumnId;
      const currentGroupModel = this.getCurrentGroupModel();
      const nextGroupModel = target.checked
        ? currentGroupModel.some((item) => item.columnId === columnId)
          ? currentGroupModel
          : currentGroupModel.concat({ columnId })
        : currentGroupModel.filter((item) => item.columnId !== columnId);
      this.emitGroupingToolPanelState({
        groupModel: nextGroupModel
      });
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.toolPanelAggregateKind === 'group') {
      const columnId = target.dataset.toolPanelAggregateColumnId ?? '';
      if (columnId.length > 0) {
        this.emitGroupingToolPanelState({
          aggregations: this.buildNextAggregationState(
            this.getCurrentGroupAggregations(),
            columnId,
            target.value === 'none' ? null : (target.value as GroupAggregationType)
          )
        });
      }
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.toolPanelPivotColumnId) {
      const columnId = target.dataset.toolPanelPivotColumnId;
      const currentPivotModel = this.getCurrentPivotModel();
      const nextPivotModel = target.checked
        ? currentPivotModel.some((item) => item.columnId === columnId)
          ? currentPivotModel
          : currentPivotModel.concat({ columnId })
        : currentPivotModel.filter((item) => item.columnId !== columnId);
      this.emitPivotToolPanelState({
        pivotModel: nextPivotModel
      });
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.toolPanelAggregateKind === 'pivot') {
      const columnId = target.dataset.toolPanelAggregateColumnId ?? '';
      if (columnId.length > 0) {
        this.emitPivotToolPanelState({
          values: this.buildNextPivotValueState(
            this.getCurrentPivotValues(),
            columnId,
            target.value === 'none' ? null : (target.value as GroupAggregationType)
          )
        });
      }
    }
  };

  private handleToolPanelInput = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.toolPanelColumnsSearch === 'true') {
      const selectionStart = target.selectionStart ?? target.value.length;
      const selectionEnd = target.selectionEnd ?? target.value.length;
      this.toolPanelColumnSearchQuery = target.value;
      this.renderToolPanel();
      const nextInput = this.toolPanelElement.querySelector('[data-tool-panel-columns-search="true"]') as HTMLInputElement | null;
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(selectionStart, selectionEnd);
      }
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.advancedFilterPresetLabel === 'true') {
      this.toolPanelAdvancedFilterPresetLabel = target.value;
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.advancedFilterRole === 'set-search') {
      const path = target.dataset.advancedFilterPath ?? '';
      if (path.length > 0) {
        this.toolPanelAdvancedFilterSetSearchByPath[path] = target.value;
        this.renderToolPanel();
      }
      return;
    }

    if (target instanceof HTMLInputElement && target.dataset.advancedFilterRole) {
      const path = this.parseAdvancedFilterPath(target.dataset.advancedFilterPath);
      const role = target.dataset.advancedFilterRole;
      if (path && (role === 'value' || role === 'min' || role === 'max')) {
        this.updateAdvancedFilterDraftNode(path, (node) => {
          if (isAdvancedFilterGroup(node)) {
            return node;
          }

          return {
            kind: node.kind === 'rule' ? 'rule' : undefined,
            columnId: node.columnId,
            condition: {
              ...node.condition,
              [role]:
                node.condition.kind === 'number'
                  ? target.value === ''
                    ? undefined
                    : Number(target.value)
                  : target.value === ''
                    ? undefined
                    : target.value
            } as ColumnFilterCondition
          };
        });
      }
      return;
    }

    if (!(target instanceof HTMLInputElement) || target.dataset.toolPanelFilterSetSearch !== 'true') {
      return;
    }

    const searchText = target.value.trim().toLowerCase();
    const optionElements = this.toolPanelElement.querySelectorAll('.hgrid__tool-panel-filter-set-option');
    for (let index = 0; index < optionElements.length; index += 1) {
      const optionElement = optionElements[index] as HTMLLabelElement;
      const label = optionElement.dataset.toolPanelFilterOptionLabel ?? '';
      optionElement.style.display = searchText.length === 0 || label.includes(searchText) ? '' : 'none';
    }
  };

  private handleRootContextMenu = (event: MouseEvent): void => {
    if (event.defaultPrevented) {
      return;
    }

    if (this.editSession) {
      return;
    }

    if (this.isTargetInsideFilterPanel(event.target)) {
      event.preventDefault();
      return;
    }

    if (this.isTargetInsideColumnMenu(event.target)) {
      event.preventDefault();
      return;
    }

    if (this.isTargetInsideToolPanel(event.target)) {
      event.preventDefault();
      return;
    }

    const headerCell =
      this.resolveHeaderCellFromTarget(event.target as HTMLElement | null) ??
      this.findHeaderCellAtPoint(event.clientX, event.clientY);
    if (headerCell) {
      const columnId = headerCell.dataset.columnId;
      if (!columnId) {
        return;
      }

      const column = findVisibleColumnById(this.options.columns, columnId);
      if (!column || !this.isColumnMenuEligibleColumn(column) || !this.supportsColumnMenuOpenSource('contextmenu')) {
        return;
      }

      event.preventDefault();
      this.openColumnMenuForHeaderCell(headerCell, 'contextmenu', event.clientX, event.clientY);
      return;
    }

    const targetElement = event.target instanceof HTMLElement ? event.target : null;
    const resolvedBodyTarget = this.resolveBodyCellHitFromTarget(targetElement);
    const hit = resolvedBodyTarget ?? this.hitTestCellAtPoint(event.clientX, event.clientY);
    if (!hit) {
      this.closeColumnMenu();
      return;
    }

    const cellElement =
      resolvedBodyTarget?.cellElement ??
      (targetElement?.closest('.hgrid__cell') as HTMLDivElement | null) ??
      this.resolveCellElementBySelectionPosition(hit.rowIndex, this.getGlobalColumnIndex(hit.zone, hit.columnIndex))?.cell;
    if (!cellElement) {
      this.closeColumnMenu();
      return;
    }

    event.preventDefault();
    this.openColumnMenuForBodyCell(hit, cellElement, event.clientX, event.clientY);
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
    return getAriaCellId(this.ariaGridId, this.headerGroupRowCount, rowIndex, colIndex);
  }

  private getAccessibleHeaderRowCount(): number {
    return getAccessibleHeaderRowCount(this.headerGroupRowCount);
  }

  private getAriaRowIndexForDataRow(rowIndex: number): number {
    return getAriaRowIndexForDataRow(this.headerGroupRowCount, rowIndex);
  }

  private syncAriaGridMetrics(): void {
    const metrics = resolveAriaGridMetrics(
      this.options.rowModel.getViewRowCount(),
      this.getVisibleColumnCount(),
      this.headerGroupRowCount
    );

    if (this.ariaRowCount !== metrics.rowCount) {
      this.rootElement.setAttribute('aria-rowcount', String(metrics.rowCount));
      this.ariaRowCount = metrics.rowCount;
    }

    if (this.ariaColCount !== metrics.colCount) {
      this.rootElement.setAttribute('aria-colcount', String(metrics.colCount));
      this.ariaColCount = metrics.colCount;
    }
  }

  private syncAriaActiveDescendant(): void {
    const selection = this.selectionModel.getSelection();
    const activeCell = selection.activeCell;
    const cellEntry = activeCell ? this.resolveCellElementBySelectionPosition(activeCell.rowIndex, activeCell.colIndex) : null;
    const update = resolveAriaActiveDescendantUpdate(this.activeDescendantCellId, activeCell, cellEntry?.cell.id ?? null);
    if (!update.shouldMutate) {
      return;
    }

    if (update.nextAttributeValue === null) {
      this.rootElement.removeAttribute('aria-activedescendant');
    } else {
      this.rootElement.setAttribute('aria-activedescendant', update.nextAttributeValue);
    }
    this.activeDescendantCellId = update.nextActiveDescendantCellId;
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
    const extraClassName = this.getHeaderLeafExtraClassName(column);
    if (extraClassName.length > 0) {
      const classNames = extraClassName.split(' ');
      for (let index = 0; index < classNames.length; index += 1) {
        if (classNames[index]) {
          headerCellElement.classList.add(classNames[index]);
        }
      }
    }
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
    const filterRowHeight = this.getFilterRowHeight();
    const totalHeight = rowHeight * (normalizedGroupRowCount + 1) + filterRowHeight;
    this.rootElement.style.setProperty('--hgrid-header-row-height', `${rowHeight}px`);
    this.rootElement.style.setProperty('--hgrid-filter-row-height', `${filterRowHeight}px`);
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
    const viewRowCount = this.options.rowModel.getViewRowCount();
    if (viewRowCount <= 0) {
      return null;
    }

    const startRow = Math.max(0, Math.min(viewRowCount - 1, this.rowHeightMap.findRowIndexAtOffset(this.pendingVirtualScrollTop)));
    const viewportBottom = Math.max(0, this.pendingVirtualScrollTop + Math.max(1, this.getViewportHeight()) - 1);
    const endRow = Math.max(startRow, Math.min(viewRowCount - 1, this.rowHeightMap.findRowIndexAtOffset(viewportBottom)));

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

    if (this.isFilterRowEnabled()) {
      const filterRowElement = this.getFilterRowElement(zoneName);
      if (zoneName === 'center') {
        this.buildCenterFilterRow(filterRowElement);
      } else {
        this.buildPinnedHeaderFilterRow(filterRowElement, columns, zoneWidth, columnLeft);
      }
      zoneContainer.append(filterRowElement);
    }
  }

  private getFilterRowElement(zoneName: ColumnZoneName): HTMLDivElement {
    if (zoneName === 'left') {
      return this.filterRowLeftElement;
    }

    if (zoneName === 'right') {
      return this.filterRowRightElement;
    }

    return this.filterRowCenterElement;
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
      const cellState = createCellRenderState(false, '', 0);
      cellState.role = 'columnheader';
      cellState.left = 0;
      this.centerHeaderCellStates.push(cellState);
    }
  }

  private createFilterRowCell(column: ColumnDef): FilterRowPoolItem {
    const cellElement = document.createElement('div');
    cellElement.className = 'hgrid__filter-row-cell';
    cellElement.style.position = 'absolute';
    cellElement.style.left = '0px';
    cellElement.style.display = 'none';

    const textInputElement = document.createElement('input');
    textInputElement.type = 'text';
    textInputElement.className = 'hgrid__filter-row-input';
    textInputElement.dataset.filterRowControl = 'text';

    const booleanSelectElement = document.createElement('select');
    booleanSelectElement.className = 'hgrid__filter-row-input hgrid__filter-row-select';
    booleanSelectElement.dataset.filterRowControl = 'boolean';

    const booleanOptions: Array<{ value: string; label: string }> = [
      { value: '', label: this.localeText.filterRowBooleanAny },
      { value: 'true', label: this.localeText.filterRowBooleanTrue },
      { value: 'false', label: this.localeText.filterRowBooleanFalse },
      { value: 'null', label: this.localeText.filterRowBooleanBlank }
    ];
    for (let index = 0; index < booleanOptions.length; index += 1) {
      const option = booleanOptions[index];
      const optionElement = document.createElement('option');
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      booleanSelectElement.append(optionElement);
    }

    const setSelectElement = document.createElement('select');
    setSelectElement.className = 'hgrid__filter-row-input hgrid__filter-row-select hgrid__filter-row-set-select';
    setSelectElement.dataset.filterRowControl = 'set';
    const setAnyOptionElement = document.createElement('option');
    setAnyOptionElement.value = '';
    setAnyOptionElement.textContent = this.localeText.filterRowSetAny;
    setSelectElement.append(setAnyOptionElement);

    const dateShellElement = document.createElement('div');
    dateShellElement.className = 'hgrid__filter-row-date-shell';

    const dateOperatorElement = document.createElement('select');
    dateOperatorElement.className = 'hgrid__filter-row-date-operator';
    dateOperatorElement.dataset.filterRowControl = 'date-operator';
    for (let index = 0; index < DATE_FILTER_OPERATORS.length; index += 1) {
      const operator = DATE_FILTER_OPERATORS[index];
      const optionElement = document.createElement('option');
      optionElement.value = operator;
      optionElement.textContent = getDateFilterRowOperatorToken(operator);
      dateOperatorElement.append(optionElement);
    }

    const dateValueInputElement = document.createElement('input');
    dateValueInputElement.type = 'date';
    dateValueInputElement.className = 'hgrid__filter-row-date-input';
    dateValueInputElement.dataset.filterRowControl = 'date-value';

    const dateSecondaryInputElement = document.createElement('input');
    dateSecondaryInputElement.type = 'date';
    dateSecondaryInputElement.className = 'hgrid__filter-row-date-input';
    dateSecondaryInputElement.dataset.filterRowControl = 'date-secondary';

    dateShellElement.append(dateOperatorElement, dateValueInputElement, dateSecondaryInputElement);
    cellElement.append(textInputElement, booleanSelectElement, setSelectElement, dateShellElement);
    return {
      cellElement,
      textInputElement,
      booleanSelectElement,
      setSelectElement,
      dateShellElement,
      dateOperatorElement,
      dateValueInputElement,
      dateSecondaryInputElement
    };
  }

  private applyFilterRowCell(
    poolItem: FilterRowPoolItem,
    column: ColumnDef | null,
    left: number,
    width: number,
    isVisible: boolean
  ): void {
    const {
      cellElement,
      textInputElement,
      booleanSelectElement,
      setSelectElement,
      dateShellElement,
      dateOperatorElement,
      dateValueInputElement,
      dateSecondaryInputElement
    } = poolItem;
    if (!isVisible || !column || width <= 0) {
      cellElement.style.display = 'none';
      cellElement.dataset.filterRowColumnId = '';
      textInputElement.dataset.filterRowColumnId = '';
      textInputElement.value = '';
      booleanSelectElement.dataset.filterRowColumnId = '';
      booleanSelectElement.value = '';
      setSelectElement.dataset.filterRowColumnId = '';
      setSelectElement.value = '';
      dateShellElement.dataset.filterRowColumnId = '';
      dateOperatorElement.dataset.filterRowColumnId = '';
      dateValueInputElement.dataset.filterRowColumnId = '';
      dateValueInputElement.value = '';
      dateSecondaryInputElement.dataset.filterRowColumnId = '';
      dateSecondaryInputElement.value = '';
      return;
    }

    cellElement.style.display = 'block';
    cellElement.style.left = `${left}px`;
    cellElement.style.width = `${width}px`;
    cellElement.dataset.filterRowColumnId = column.id;
    const isDateColumn = column.type === 'date';
    const isBooleanColumn = column.type === 'boolean';

    if (isDateColumn) {
      textInputElement.style.display = 'none';
      textInputElement.dataset.filterRowColumnId = '';
      textInputElement.value = '';
      booleanSelectElement.style.display = 'none';
      booleanSelectElement.dataset.filterRowColumnId = '';
      booleanSelectElement.value = '';
      setSelectElement.style.display = 'none';
      setSelectElement.dataset.filterRowColumnId = '';
      setSelectElement.value = '';

      dateShellElement.style.display = 'grid';
      dateShellElement.dataset.filterRowColumnId = column.id;
      dateOperatorElement.dataset.filterRowColumnId = column.id;
      dateOperatorElement.setAttribute('aria-label', `${this.localeText.filterPanelOperator} ${column.header}`);
      dateValueInputElement.dataset.filterRowColumnId = column.id;
      dateValueInputElement.setAttribute('aria-label', `${this.localeText.filterPanelValue} ${column.header}`);
      dateSecondaryInputElement.dataset.filterRowColumnId = column.id;
      dateSecondaryInputElement.setAttribute('aria-label', `${this.localeText.filterPanelMax} ${column.header}`);
      this.syncDateFilterRowShell(dateShellElement, dateOperatorElement, dateValueInputElement, dateSecondaryInputElement, column);
      return;
    }

    if (isBooleanColumn) {
      textInputElement.style.display = 'none';
      textInputElement.dataset.filterRowColumnId = '';
      textInputElement.value = '';
      setSelectElement.style.display = 'none';
      setSelectElement.dataset.filterRowColumnId = '';
      setSelectElement.value = '';

      dateShellElement.style.display = 'none';
      dateShellElement.dataset.filterRowColumnId = '';
      dateOperatorElement.dataset.filterRowColumnId = '';
      dateValueInputElement.dataset.filterRowColumnId = '';
      dateValueInputElement.value = '';
      dateSecondaryInputElement.dataset.filterRowColumnId = '';
      dateSecondaryInputElement.value = '';

      booleanSelectElement.style.display = 'block';
      booleanSelectElement.dataset.filterRowColumnId = column.id;
      booleanSelectElement.setAttribute('aria-label', `${this.localeText.filterPanelTitle} ${column.header}`);
      booleanSelectElement.value = this.getFilterRowDraftValue(column);
      booleanSelectElement.classList.toggle('hgrid__filter-row-input--active', this.hasActiveColumnFilter(column.id));
      return;
    }

    if (this.usesSetFilterRowEditor(column)) {
      textInputElement.style.display = 'none';
      textInputElement.dataset.filterRowColumnId = '';
      textInputElement.value = '';
      booleanSelectElement.style.display = 'none';
      booleanSelectElement.dataset.filterRowColumnId = '';
      booleanSelectElement.value = '';
      dateShellElement.style.display = 'none';
      dateShellElement.dataset.filterRowColumnId = '';
      dateOperatorElement.dataset.filterRowColumnId = '';
      dateValueInputElement.dataset.filterRowColumnId = '';
      dateValueInputElement.value = '';
      dateSecondaryInputElement.dataset.filterRowColumnId = '';
      dateSecondaryInputElement.value = '';

      setSelectElement.style.display = 'block';
      setSelectElement.dataset.filterRowColumnId = column.id;
      setSelectElement.setAttribute('aria-label', `${this.localeText.filterPanelTitle} ${column.header}`);
      this.syncFilterRowSetSelect(setSelectElement, column, this.collectFilterSetOptions(column, 'filterRow'));
      return;
    }

    dateShellElement.style.display = 'none';
    dateShellElement.dataset.filterRowColumnId = '';
    dateOperatorElement.dataset.filterRowColumnId = '';
    dateValueInputElement.dataset.filterRowColumnId = '';
    dateValueInputElement.value = '';
    dateSecondaryInputElement.dataset.filterRowColumnId = '';
    dateSecondaryInputElement.value = '';

    booleanSelectElement.style.display = 'none';
    booleanSelectElement.dataset.filterRowColumnId = '';
    booleanSelectElement.value = '';
    setSelectElement.style.display = 'none';
    setSelectElement.dataset.filterRowColumnId = '';
    setSelectElement.value = '';

    textInputElement.style.display = 'block';
    textInputElement.dataset.filterRowColumnId = column.id;
    textInputElement.placeholder = this.getFilterRowPlaceholder(column);
    textInputElement.setAttribute('aria-label', `${this.localeText.filterPanelTitle} ${column.header}`);
    textInputElement.value = this.getFilterRowDraftValue(column);
    textInputElement.classList.toggle('hgrid__filter-row-input--active', this.hasActiveColumnFilter(column.id));
  }

  private buildPinnedHeaderFilterRow(
    rowElement: HTMLDivElement,
    columns: ColumnDef[],
    zoneWidth: number,
    columnLeft: number[]
  ): void {
    rowElement.replaceChildren();
    rowElement.style.display = 'block';
    rowElement.style.position = 'relative';
    rowElement.style.width = `${Math.max(1, zoneWidth)}px`;

    for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
      const column = columns[colIndex];
      if (this.isSystemUtilityColumnId(column.id)) {
        continue;
      }

      const poolItem = this.createFilterRowCell(column);
      this.applyFilterRowCell(poolItem, column, columnLeft[colIndex] ?? 0, column.width, true);
      rowElement.append(poolItem.cellElement);
    }
  }

  private buildCenterFilterRow(rowElement: HTMLDivElement): void {
    rowElement.replaceChildren();
    rowElement.style.display = 'block';
    rowElement.style.position = 'relative';
    rowElement.style.width = `${Math.max(1, this.centerColumnsWidth)}px`;
    this.centerFilterCellPool = [];

    for (let slotIndex = 0; slotIndex < this.centerCellCapacity; slotIndex += 1) {
      const placeholderColumn = this.columnsByZone.center[0] ?? {
        id: '',
        header: '',
        width: 0,
        type: 'text'
      };
      const poolItem = this.createFilterRowCell(placeholderColumn);
      poolItem.cellElement.style.display = 'none';
      poolItem.cellElement.dataset.filterRowColumnId = '';
      poolItem.textInputElement.dataset.filterRowColumnId = '';
      poolItem.textInputElement.value = '';
      poolItem.booleanSelectElement.dataset.filterRowColumnId = '';
      poolItem.booleanSelectElement.value = '';
      poolItem.setSelectElement.dataset.filterRowColumnId = '';
      poolItem.setSelectElement.value = '';
      poolItem.dateShellElement.dataset.filterRowColumnId = '';
      poolItem.dateOperatorElement.dataset.filterRowColumnId = '';
      poolItem.dateValueInputElement.dataset.filterRowColumnId = '';
      poolItem.dateValueInputElement.value = '';
      poolItem.dateSecondaryInputElement.dataset.filterRowColumnId = '';
      poolItem.dateSecondaryInputElement.value = '';
      rowElement.append(poolItem.cellElement);
      this.centerFilterCellPool.push(poolItem);
    }
  }

  private rebuildPool(): void {
    const desiredPoolSize = this.getPoolSize();
    const leftWidth = sumColumnWidths(this.columnsByZone.left);
    const centerWidth = this.centerColumnsWidth;
    const rightWidth = sumColumnWidths(this.columnsByZone.right);
    this.rowPool = rebuildRowPool({
      desiredPoolSize,
      rowsLayerLeftElement: this.rowsLayerLeftElement,
      rowsLayerCenterElement: this.rowsLayerCenterElement,
      rowsLayerRightElement: this.rowsLayerRightElement,
      leftColumns: this.columnsByZone.left,
      centerColumns: this.columnsByZone.center,
      rightColumns: this.columnsByZone.right,
      leftWidth,
      centerWidth,
      rightWidth,
      centerCellCapacity: this.centerCellCapacity,
      baseRowHeight: this.getBaseRowHeight(),
      isIndicatorCheckboxColumnId: (columnId) => this.isIndicatorCheckboxColumnId(columnId),
      createIndicatorCellElements: (cellElement) => this.createIndicatorCellElements(cellElement)
    });
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
    this.syncToolPanelDockLayout();
    const scrollbarPolicy = this.getResolvedScrollbarPolicy();
    const layoutMetrics = calculateZoneLayoutMetrics({
      leftColumns: this.columnsByZone.left,
      centerColumns: this.columnsByZone.center,
      rightColumns: this.columnsByZone.right,
      rowTrackHeight: this.getVirtualRowTrackHeight(),
      viewportHeight: this.getViewportHeight(),
      rootWidth: this.getGridSurfaceWidth(),
      scrollbarPolicy,
      scrollbarSize: this.scrollbarSize,
      invisibleScrollbarFallbackSize: INVISIBLE_SCROLLBAR_FALLBACK_SIZE
    });
    this.centerColumnsWidth = layoutMetrics.centerWidth;
    this.leftPinnedWidth = layoutMetrics.leftWidth;
    this.rightPinnedWidth = layoutMetrics.rightWidth;
    this.centerVisibleWidth = layoutMetrics.centerVisibleWidth;
    this.canUseVerticalScroll = layoutMetrics.shouldShowVerticalBar;
    this.canUseHorizontalScroll = layoutMetrics.shouldShowHorizontalBar;

    this.headerElement.style.gridTemplateColumns = layoutMetrics.templateColumns;
    this.rootElement.style.setProperty('--hgrid-v-scrollbar-width', `${layoutMetrics.verticalScrollbarReservedWidth}px`);
    this.rootElement.style.setProperty('--hgrid-h-scrollbar-height', `${layoutMetrics.horizontalScrollbarReservedHeight}px`);
    this.viewportElement.style.overflowY = 'hidden';
    this.verticalScrollElement.style.overflowY = toCssOverflowValue(scrollbarPolicy.vertical);
    this.horizontalScrollElement.style.overflowX = toCssOverflowValue(scrollbarPolicy.horizontal);
    this.verticalScrollElement.style.display = layoutMetrics.shouldShowVerticalBar ? 'block' : 'none';
    this.horizontalScrollElement.style.display = layoutMetrics.shouldShowHorizontalBar ? 'block' : 'none';
    this.verticalScrollElement.style.width = `${layoutMetrics.verticalScrollbarSourceWidth}px`;
    this.horizontalScrollElement.style.height = `${layoutMetrics.horizontalScrollbarSourceHeight}px`;

    this.headerRowLeftElement.style.width = `${layoutMetrics.leftWidth}px`;
    this.headerCenterViewportElement.style.width = `${layoutMetrics.centerWidth}px`;
    this.headerRowRightElement.style.width = `${layoutMetrics.rightWidth}px`;

    this.bodyLeftElement.style.left = '0px';
    this.bodyLeftElement.style.width = `${layoutMetrics.leftWidth}px`;
    this.bodyRightElement.style.right = `${layoutMetrics.verticalScrollbarReservedWidth}px`;
    this.bodyRightElement.style.width = `${layoutMetrics.rightWidth}px`;

    this.rowsViewportCenterElement.style.left = `${layoutMetrics.leftWidth}px`;
    this.rowsViewportCenterElement.style.width = `${layoutMetrics.centerWidth}px`;
    this.rowsViewportLeftElement.style.width = `${layoutMetrics.leftWidth}px`;
    this.rowsViewportRightElement.style.width = `${layoutMetrics.rightWidth}px`;

    this.rowsLayerLeftElement.style.width = `${layoutMetrics.leftWidth}px`;
    this.rowsLayerCenterElement.style.width = `${layoutMetrics.centerWidth}px`;
    this.rowsLayerRightElement.style.width = `${layoutMetrics.rightWidth}px`;

    this.horizontalScrollElement.style.left = `${layoutMetrics.leftWidth}px`;
    this.horizontalScrollElement.style.right = `${
      layoutMetrics.rightWidth + layoutMetrics.verticalScrollbarReservedWidth
    }px`;
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
    const metrics = calculateScrollScaleLayoutMetrics({
      rowCount: this.options.rowModel.getViewRowCount(),
      rowHeight: this.getBaseRowHeight(),
      virtualHeight: this.getVirtualRowTrackHeight(),
      viewportHeight: this.viewportElement.clientHeight || this.verticalScrollElement.clientHeight || this.getViewportHeight(),
      centerColumnsWidth: this.centerColumnsWidth
    });
    this.virtualScrollHeight = metrics.virtualScrollHeight;
    this.physicalScrollHeight = metrics.physicalScrollHeight;
    this.virtualMaxScrollTop = metrics.virtualMaxScrollTop;
    this.physicalMaxScrollTop = metrics.physicalMaxScrollTop;
    this.scrollScale = metrics.scrollScale;

    this.spacerElement.style.width = '1px';
    this.spacerElement.style.height = `${metrics.spacerHeight}px`;
    this.verticalSpacerElement.style.width = '1px';
    this.verticalSpacerElement.style.height = `${metrics.spacerHeight}px`;
    this.horizontalSpacerElement.style.width = `${metrics.horizontalSpacerWidth}px`;
  }

  private renderRows(scrollTop: number, scrollLeft: number): void {
    const viewRowCount = this.options.rowModel.getViewRowCount();
    const virtualScrollTop = this.pendingVirtualScrollTop;
    const startRow = this.getStartRowForScrollTop(virtualScrollTop);
    const viewportOffsetY = this.getRowTop(startRow);
    const horizontalWindow = this.getHorizontalWindow(scrollLeft);
    this.renderCenterHeader(horizontalWindow);
    this.renderCenterFilterRow(horizontalWindow);
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
    this.renderFillHandle();
    this.renderEditActionBar();
    this.renderStatusBar(false);
    this.scheduleMeasuredRowHeightPass();
    if (this.editSession) {
      const canKeepEditing = this.syncEditorOverlayPosition();
      if (!canKeepEditing) {
        this.stopEditing('detached');
      }
    }
  }

  private renderFillHandle(): void {
    const selectionRectangle = this.resolveRangeHandleSelectionRectangle();
    if (!selectionRectangle) {
      this.fillHandleElement.classList.remove('hgrid__fill-handle--visible', 'hgrid__fill-handle--dragging');
      this.fillHandleElement.style.left = '';
      this.fillHandleElement.style.top = '';
      return;
    }

    const handleCell = this.resolveCellElementBySelectionPosition(selectionRectangle.endRow, selectionRectangle.endCol);
    if (!handleCell) {
      this.fillHandleElement.classList.remove('hgrid__fill-handle--visible', 'hgrid__fill-handle--dragging');
      this.fillHandleElement.style.left = '';
      this.fillHandleElement.style.top = '';
      return;
    }

    const cellRect = handleCell.cell.getBoundingClientRect();
    const rootRect = this.rootElement.getBoundingClientRect();
    const handleOffset = Math.floor(RANGE_HANDLE_SIZE / 2);
    this.fillHandleElement.style.left = `${cellRect.right - rootRect.left - handleOffset}px`;
    this.fillHandleElement.style.top = `${cellRect.bottom - rootRect.top - handleOffset}px`;
    this.fillHandleElement.classList.add('hgrid__fill-handle--visible');
    this.fillHandleElement.classList.toggle('hgrid__fill-handle--dragging', this.fillHandleSession !== null);
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
    return prependCellContentPrefix(content, prefix);
  }

  private createNextEditTransactionId(): string {
    const timestampMs = Date.now();
    this.editTransactionSequence += 1;
    return `txn-${timestampMs}-${this.editTransactionSequence}`;
  }

  private createOriginalEditTransactionContext(
    source: Exclude<EditCommitSource, 'undo' | 'redo'>,
    transactionKind: Exclude<EditTransactionKind, 'historyReplay'>
  ): EditCommitTransactionContext {
    const transactionId = this.createNextEditTransactionId();
    return {
      source,
      transactionId,
      rootTransactionId: transactionId,
      transactionKind,
      transactionStep: 'apply'
    };
  }

  private createHistoryReplayTransactionContext(
    source: 'undo' | 'redo',
    entry: EditHistoryEntry
  ): EditCommitTransactionContext {
    return {
      source,
      transactionId: this.createNextEditTransactionId(),
      rootTransactionId: entry.rootTransactionId,
      transactionKind: 'historyReplay',
      transactionStep: source
    };
  }

  private createEditCommitEventPayload(
    payload: ClipboardCellUpdate | ClipboardCellUpdate[],
    transaction: EditCommitTransactionContext
  ): EditCommitEventPayload {
    const updates = Array.isArray(payload) ? payload : [payload];
    const changes = updates.map((update) => ({
      rowIndex: update.rowIndex,
      dataIndex: update.dataIndex,
      rowKey: update.rowKey ?? this.resolveStableRowKey(update.dataIndex),
      columnId: update.columnId,
      previousValue: update.previousValue,
      value: update.value
    }));
    const primaryChange = changes.find((change) => change.rowIndex >= 0) ?? changes[0];
    const timestampMs = Date.now();
    this.editCommitSequence += 1;
    const rowKeys = new Set<RowKey>();
    for (let index = 0; index < changes.length; index += 1) {
      rowKeys.add(changes[index].rowKey);
    }

    return {
      rowIndex: primaryChange.rowIndex,
      dataIndex: primaryChange.dataIndex,
      rowKey: primaryChange.rowKey,
      columnId: primaryChange.columnId,
      previousValue: primaryChange.previousValue,
      value: primaryChange.value,
      source: transaction.source,
      commitId: `edit-${timestampMs}-${this.editCommitSequence}`,
      transactionId: transaction.transactionId,
      rootTransactionId: transaction.rootTransactionId,
      transactionKind: transaction.transactionKind,
      transactionStep: transaction.transactionStep,
      timestampMs,
      timestamp: new Date(timestampMs).toISOString(),
      rowCount: rowKeys.size,
      cellCount: changes.length,
      changes
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
    hideZoneRow(zoneRow);
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
    applyZoneRowBindingState(zoneRow, {
      rowIndex,
      dataIndex,
      translateY: rowTranslateY,
      height: rowHeight,
      isSelected: this.selectionModel.isRowSelected(rowIndex),
      isGroupRow,
      groupLevel,
      isTreeRow,
      treeLevel,
      ariaRowIndex: zoneRow.element.getAttribute('role') === 'row' ? this.getAriaRowIndexForDataRow(rowIndex) : null
    });
  }

  private bindCell(cell: HTMLDivElement, cellState: CellRenderState, nextState: CellBindingState): void {
    bindGridCell(cell, cellState, nextState);
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

  private isUndoRedoEnabled(): boolean {
    return this.options.undoRedo?.enabled === true;
  }

  private getUndoRedoLimit(): number {
    return Math.max(1, this.options.undoRedo?.limit ?? 100);
  }

  private clearEditHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private recordEditHistoryEntry(
    transaction: EditCommitTransactionContext,
    updates: ClipboardCellUpdate[]
  ): EditHistoryEntry | null {
    const historyUpdates: EditHistoryUpdate[] = [];
    for (let index = 0; index < updates.length; index += 1) {
      const update = updates[index];
      if (Object.is(update.previousValue, update.value)) {
        continue;
      }
      historyUpdates.push({
        rowKey: update.rowKey ?? this.resolveStableRowKey(update.dataIndex),
        dataIndexHint: update.dataIndex,
        columnId: update.columnId,
        previousValue: update.previousValue,
        value: update.value
      });
    }

    if (historyUpdates.length === 0) {
      return null;
    }

    if (!this.isUndoRedoEnabled()) {
      return null;
    }

    const entry: EditHistoryEntry = {
      transactionId: transaction.transactionId,
      rootTransactionId: transaction.rootTransactionId,
      transactionKind: transaction.transactionKind as Exclude<EditTransactionKind, 'historyReplay'>,
      source: transaction.source as Exclude<EditCommitSource, 'undo' | 'redo'>,
      updates: historyUpdates
    };
    this.undoStack.push(entry);
    const limit = this.getUndoRedoLimit();
    if (this.undoStack.length > limit) {
      this.undoStack.splice(0, this.undoStack.length - limit);
    }
    this.redoStack = [];
    return entry;
  }

  private resolveDataIndexByRowKey(rowKey: RowKey, dataIndexHint: number): number {
    if (typeof this.options.dataProvider.getDataIndexByRowKey === 'function') {
      return this.options.dataProvider.getDataIndexByRowKey(rowKey, dataIndexHint);
    }

    const rowCount = this.options.dataProvider.getRowCount();
    if (dataIndexHint >= 0 && dataIndexHint < rowCount && this.options.dataProvider.getRowKey(dataIndexHint) === rowKey) {
      return dataIndexHint;
    }

    for (let dataIndex = 0; dataIndex < rowCount; dataIndex += 1) {
      if (this.options.dataProvider.getRowKey(dataIndex) === rowKey) {
        return dataIndex;
      }
    }

    return -1;
  }

  private resolveStableRowKey(dataIndex: number): RowKey {
    const providerRowKey = this.options.dataProvider.getRowKey(dataIndex);
    const row = typeof this.options.dataProvider.peekRow === 'function'
      ? this.options.dataProvider.peekRow(dataIndex)
      : this.options.dataProvider.getRow?.(dataIndex);
    return this.resolveStableRowKeyFromLoadedRow(dataIndex, row, providerRowKey);
  }

  private resolveStableRowKeyFromLoadedRow(dataIndex: number, row: GridRowData | undefined, providerRowKey?: RowKey): RowKey {
    const resolvedProviderRowKey = providerRowKey ?? this.options.dataProvider.getRowKey(dataIndex);
    if (!row || resolvedProviderRowKey !== dataIndex) {
      return resolvedProviderRowKey;
    }

    for (let index = 0; index < HISTORY_ROW_KEY_FIELD_CANDIDATES.length; index += 1) {
      const candidate = HISTORY_ROW_KEY_FIELD_CANDIDATES[index];
      const value = row[candidate];
      if ((typeof value === 'string' || typeof value === 'number') && value !== dataIndex) {
        return value;
      }
    }

    return resolvedProviderRowKey;
  }

  private applyEditHistory(direction: 'undo' | 'redo'): boolean {
    if (this.editSession || this.isEditValidationPending) {
      return false;
    }

    const sourceStack = direction === 'undo' ? this.undoStack : this.redoStack;
    const targetStack = direction === 'undo' ? this.redoStack : this.undoStack;
    const entry = sourceStack[sourceStack.length - 1];
    if (!entry) {
      return false;
    }

    const requestedUpdates: HistoryCellUpdate[] = [];
    const fallbackTransactions: DataTransaction[] = [];
    const appliedUpdates: ClipboardCellUpdate[] = [];
    for (let index = 0; index < entry.updates.length; index += 1) {
      const update = entry.updates[index];
      requestedUpdates.push({
        rowKey: update.rowKey,
        dataIndexHint: update.dataIndexHint,
        columnId: update.columnId,
        currentValue: direction === 'undo' ? update.value : update.previousValue,
        nextValue: direction === 'undo' ? update.previousValue : update.value
      });
    }

    if (typeof this.options.dataProvider.applyHistoryUpdates === 'function') {
      const providerUpdates = this.options.dataProvider.applyHistoryUpdates(requestedUpdates);
      for (let index = 0; index < providerUpdates.length; index += 1) {
        const update = providerUpdates[index];
        appliedUpdates.push({
          rowIndex: this.options.rowModel.getViewIndex(update.dataIndex),
          dataIndex: update.dataIndex,
          rowKey: update.rowKey,
          columnId: update.columnId,
          previousValue: update.previousValue,
          value: update.value
        });
      }
    } else {
      for (let index = 0; index < requestedUpdates.length; index += 1) {
        const update = requestedUpdates[index];
        const dataIndex = this.resolveDataIndexByRowKey(update.rowKey, update.dataIndexHint);
        if (dataIndex < 0) {
          continue;
        }

        const rowIndex = this.options.rowModel.getViewIndex(dataIndex);
        const currentValue = this.options.dataProvider.getValue(dataIndex, update.columnId);
        if (Object.is(currentValue, update.nextValue)) {
          continue;
        }

        fallbackTransactions.push({
          type: 'updateCell',
          index: dataIndex,
          columnId: update.columnId,
          value: update.nextValue
        });
        appliedUpdates.push({
          rowIndex,
          dataIndex,
          rowKey: update.rowKey,
          columnId: update.columnId,
          previousValue: currentValue,
          value: update.nextValue
        });
      }

      if (fallbackTransactions.length > 0) {
        this.options.dataProvider.applyTransactions(fallbackTransactions);
      }
    }

    if (appliedUpdates.length === 0) {
      sourceStack.pop();
      return false;
    }

    sourceStack.pop();
    targetStack.push(entry);
    const limit = this.getUndoRedoLimit();
    if (targetStack.length > limit) {
      targetStack.splice(0, targetStack.length - limit);
    }

    this.markDataDirty();

    const visibleUpdates = appliedUpdates.filter((update) => update.rowIndex >= 0);
    const firstVisibleUpdate = visibleUpdates[0];
    const focusCell = firstVisibleUpdate
      ? {
          rowIndex: firstVisibleUpdate.rowIndex,
          colIndex: this.resolveColumnGlobalIndex(firstVisibleUpdate.columnId)
        }
      : null;

    if (focusCell && focusCell.colIndex >= 0) {
      let minRowIndex = focusCell.rowIndex;
      let maxRowIndex = focusCell.rowIndex;
      let minColIndex = focusCell.colIndex;
      let maxColIndex = focusCell.colIndex;

      for (let index = 1; index < visibleUpdates.length; index += 1) {
        const update = visibleUpdates[index];
        const colIndex = this.resolveColumnGlobalIndex(update.columnId);
        if (colIndex < 0) {
          continue;
        }

        minRowIndex = Math.min(minRowIndex, update.rowIndex);
        maxRowIndex = Math.max(maxRowIndex, update.rowIndex);
        minColIndex = Math.min(minColIndex, colIndex);
        maxColIndex = Math.max(maxColIndex, colIndex);
      }

      const hasSelectionChanged = this.selectionModel.setSelection(
        {
          activeCell: focusCell,
          cellRanges: [
            {
              r1: minRowIndex,
              c1: minColIndex,
              r2: maxRowIndex,
              c2: maxColIndex
            }
          ],
          rowRanges: []
        },
        this.getSelectionBounds(),
        this.resolveRowKeyByRowIndex
      );
      this.keyboardRangeAnchor = { ...focusCell };
      this.rowCheckboxAnchorRowIndex = focusCell.rowIndex;
      if (hasSelectionChanged) {
        this.commitSelectionChange('api');
      }

      const hasScrolled = this.ensureSelectionCellVisible(focusCell);
      if (hasScrolled) {
        this.markScrollDirty();
      }
    }

    if (appliedUpdates.length > 0) {
      this.eventBus.emit(
        'editCommit',
        this.createEditCommitEventPayload(appliedUpdates, this.createHistoryReplayTransactionContext(direction, entry))
      );
    }

    this.scheduleRender();
    return true;
  }

  private resolveColumnGlobalIndex(columnId: string): number {
    const leftIndex = this.columnsByZone.left.findIndex((column) => column.id === columnId);
    if (leftIndex >= 0) {
      return leftIndex;
    }

    const centerIndex = this.columnsByZone.center.findIndex((column) => column.id === columnId);
    if (centerIndex >= 0) {
      return this.columnsByZone.left.length + centerIndex;
    }

    const rightIndex = this.columnsByZone.right.findIndex((column) => column.id === columnId);
    if (rightIndex >= 0) {
      return this.columnsByZone.left.length + this.columnsByZone.center.length + rightIndex;
    }

    return -1;
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

  private resolvePrimarySelectionRectangle(): SelectionRectangle | null {
    return resolvePrimarySelectionRectangle(
      this.getSelectionBounds(),
      this.selectionModel.getSelection(),
      this.getInitialActiveCell()
    );
  }

  private isRangeHandleEnabled(): boolean {
    return this.options.rangeHandle?.enabled !== false;
  }

  private getRangeHandleMode(): GridRangeHandleMode {
    return this.options.rangeHandle?.mode === 'copy' ? 'copy' : 'fill';
  }

  private canUseRangeHandleForRectangle(selectionRectangle: SelectionRectangle): boolean {
    if (!this.isRangeHandleEnabled()) {
      return false;
    }

    if (this.editSession) {
      return false;
    }

    for (let colIndex = selectionRectangle.startCol; colIndex <= selectionRectangle.endCol; colIndex += 1) {
      const columnEntry = this.resolveColumnByGlobalIndex(colIndex);
      if (!columnEntry) {
        continue;
      }

      if (columnEntry.column.editable && !this.isSystemUtilityColumnId(columnEntry.column.id)) {
        return true;
      }
    }

    return false;
  }

  private resolveRangeHandleSelectionRectangle(): SelectionRectangle | null {
    const selectionRectangle = this.fillHandleSession?.previewRectangle ?? this.resolvePrimarySelectionRectangle();
    if (!selectionRectangle) {
      return null;
    }

    return this.canUseRangeHandleForRectangle(selectionRectangle) ? selectionRectangle : null;
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

    return buildSelectionTsv(selectionRectangle, (rowIndex, colIndex) => this.readCellTextForClipboard(rowIndex, colIndex));
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
    const normalizedValue = normalizeEditorInputValue(column, inputText);
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

    const matrixMetrics = resolveClipboardMatrixMetrics(matrix, selectionRectangle);
    if (!matrixMetrics) {
      return [];
    }

    const selectionBounds = this.getSelectionBounds();

    const transactions: DataTransaction[] = [];
    const updates: ClipboardCellUpdate[] = [];

    for (let rowOffset = 0; rowOffset < matrixMetrics.destinationRowCount; rowOffset += 1) {
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

      for (let colOffset = 0; colOffset < matrixMetrics.destinationColCount; colOffset += 1) {
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

        const { sourceRow, sourceCol } = resolveClipboardSourceOffsets(
          rowOffset,
          colOffset,
          matrixMetrics.shouldFillSelection
        );
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
          rowKey: this.resolveStableRowKeyFromLoadedRow(dataIndex, row),
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

  private formatFillSourceValue(rawValue: unknown): string {
    if (rawValue === null || rawValue === undefined) {
      return '';
    }

    if (rawValue instanceof Date) {
      return rawValue.toISOString();
    }

    return String(rawValue);
  }

  private readFillSourceCell(rowIndex: number, colIndex: number): FillSourceCell | null {
    const columnEntry = this.resolveColumnByGlobalIndex(colIndex);
    if (!columnEntry) {
      return null;
    }

    const dataIndex = this.options.rowModel.getDataIndex(rowIndex);
    if (dataIndex < 0) {
      return null;
    }

    const row = this.resolveRow(dataIndex);
    if (isGroupRowData(row)) {
      return null;
    }

    const rawValue = getColumnValue(columnEntry.column, row);
    return {
      rawValue,
      textValue: this.formatFillSourceValue(rawValue)
    };
  }

  private buildFillSourceMatrix(selectionRectangle: SelectionRectangle): FillSourceCell[][] {
    const matrix: FillSourceCell[][] = [];
    for (let rowIndex = selectionRectangle.startRow; rowIndex <= selectionRectangle.endRow; rowIndex += 1) {
      const rowCells: FillSourceCell[] = [];
      for (let colIndex = selectionRectangle.startCol; colIndex <= selectionRectangle.endCol; colIndex += 1) {
        rowCells.push(
          this.readFillSourceCell(rowIndex, colIndex) ?? {
            rawValue: null,
            textValue: ''
          }
        );
      }
      matrix.push(rowCells);
    }

    return matrix;
  }

  private resolveVerticalSeriesFillValue(
    sourceRectangle: SelectionRectangle,
    previewRowIndex: number,
    sourceValues: number[]
  ): number {
    const firstValue = sourceValues[0] ?? 0;
    const lastValue = sourceValues[sourceValues.length - 1] ?? firstValue;
    const step =
      sourceValues.length > 1 ? (sourceValues[sourceValues.length - 1] ?? 0) - (sourceValues[sourceValues.length - 2] ?? 0) : 0;
    if (previewRowIndex < sourceRectangle.startRow) {
      return firstValue - step * (sourceRectangle.startRow - previewRowIndex);
    }

    return lastValue + step * (previewRowIndex - sourceRectangle.endRow);
  }

  private resolveHorizontalSeriesFillValue(
    sourceRectangle: SelectionRectangle,
    previewColIndex: number,
    sourceValues: number[]
  ): number {
    const firstValue = sourceValues[0] ?? 0;
    const lastValue = sourceValues[sourceValues.length - 1] ?? firstValue;
    const step =
      sourceValues.length > 1 ? (sourceValues[sourceValues.length - 1] ?? 0) - (sourceValues[sourceValues.length - 2] ?? 0) : 0;
    if (previewColIndex < sourceRectangle.startCol) {
      return firstValue - step * (sourceRectangle.startCol - previewColIndex);
    }

    return lastValue + step * (previewColIndex - sourceRectangle.endCol);
  }

  private applyRangeFill(sourceRectangle: SelectionRectangle, previewRectangle: SelectionRectangle): ClipboardCellUpdate[] {
    if (selectionRectanglesEqual(sourceRectangle, previewRectangle)) {
      return [];
    }

    const sourceMatrix = this.buildFillSourceMatrix(sourceRectangle);
    const sourceRowCount = getSelectionRectangleRowCount(sourceRectangle);
    const sourceColumnCount = getSelectionRectangleColumnCount(sourceRectangle);
    const numericSourceMatrix = sourceMatrix.map((rowCells) =>
      rowCells.map((cell) =>
        typeof cell.rawValue === 'number' && Number.isFinite(cell.rawValue as number) ? Number(cell.rawValue) : Number.NaN
      )
    );
    const matrixSeriesModel =
      shouldUseMatrixSeriesFill(this.getRangeHandleMode(), sourceRectangle, previewRectangle)
        ? resolveMatrixSeriesFillModel(numericSourceMatrix)
        : null;
    const useMatrixSeries = matrixSeriesModel !== null;
    const useVerticalSeries =
      !useMatrixSeries &&
      shouldUseVerticalSeriesFill(this.getRangeHandleMode(), sourceRectangle, previewRectangle) &&
      sourceColumnCount > 0 &&
      Array.from({ length: sourceColumnCount }, (_, colOffset) =>
        sourceMatrix.every((rowCells) => typeof rowCells[colOffset]?.rawValue === 'number' && Number.isFinite(rowCells[colOffset].rawValue as number))
      ).every(Boolean);
    const useHorizontalSeries =
      !useMatrixSeries &&
      shouldUseHorizontalSeriesFill(this.getRangeHandleMode(), sourceRectangle, previewRectangle) &&
      sourceRowCount > 0 &&
      sourceMatrix.every((rowCells) =>
        rowCells.every((cell) => typeof cell.rawValue === 'number' && Number.isFinite(cell.rawValue as number))
      );

    const transactions: DataTransaction[] = [];
    const updates: ClipboardCellUpdate[] = [];

    for (let rowIndex = previewRectangle.startRow; rowIndex <= previewRectangle.endRow; rowIndex += 1) {
      const dataIndex = this.options.rowModel.getDataIndex(rowIndex);
      if (dataIndex < 0) {
        continue;
      }

      const row = this.resolveRow(dataIndex);
      if (isGroupRowData(row)) {
        continue;
      }

      for (let colIndex = previewRectangle.startCol; colIndex <= previewRectangle.endCol; colIndex += 1) {
        if (isCellInsideSelectionRectangle(sourceRectangle, { rowIndex, colIndex })) {
          continue;
        }

        const columnEntry = this.resolveColumnByGlobalIndex(colIndex);
        if (!columnEntry) {
          continue;
        }

        const column = columnEntry.column;
        if (!column.editable || this.isSystemUtilityColumnId(column.id)) {
          continue;
        }

        let nextValue: unknown;
        if (useMatrixSeries && matrixSeriesModel) {
          nextValue = resolveMatrixSeriesFillValue(sourceRectangle, rowIndex, colIndex, matrixSeriesModel);
        } else if (useVerticalSeries) {
          const sourceValues = sourceMatrix.map((rowCells) => Number(rowCells[colIndex - sourceRectangle.startCol]?.rawValue ?? 0));
          nextValue = this.resolveVerticalSeriesFillValue(sourceRectangle, rowIndex, sourceValues);
        } else if (useHorizontalSeries) {
          const sourceValues = sourceMatrix[rowIndex - sourceRectangle.startRow]?.map((cell) => Number(cell.rawValue ?? 0)) ?? [];
          nextValue = this.resolveHorizontalSeriesFillValue(sourceRectangle, colIndex, sourceValues);
        } else {
          const sourceRowOffset = resolveRepeatingFillOffset(rowIndex, sourceRectangle.startRow, sourceRowCount);
          const sourceColOffset = resolveRepeatingFillOffset(colIndex, sourceRectangle.startCol, sourceColumnCount);
          const sourceCell = sourceMatrix[sourceRowOffset]?.[sourceColOffset];
          if (!sourceCell) {
            continue;
          }
          nextValue = this.resolvePasteValue(column, row, dataIndex, sourceCell.textValue);
        }

        if (column.valueSetter && (useMatrixSeries || useVerticalSeries || useHorizontalSeries)) {
          const rowForSetter = this.options.dataProvider.getRow
            ? this.options.dataProvider.getRow(dataIndex) ?? row
            : row;
          column.valueSetter(rowForSetter, nextValue, column);
          nextValue = getColumnValue(column, rowForSetter);
        }

        const previousValue = getColumnValue(column, row);
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
          rowKey: this.resolveStableRowKeyFromLoadedRow(dataIndex, row),
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

  private applyEditorOverlayState(state: EditorOverlayState): void {
    this.editorHostElement.classList.toggle('hgrid__editor-host--visible', state.isVisible);
    this.editorHostElement.classList.toggle('hgrid__editor-host--invalid', state.isInvalid);
    this.editorHostElement.classList.toggle('hgrid__editor-host--pending', state.isPending);
    this.editorInputElement.disabled = state.isDisabled;
    this.editorSelectElement.disabled = state.isDisabled;
    this.editorMessageElement.textContent = state.message;
    if (state.nextInputValue !== null) {
      this.setEditorControlValue(state.nextInputValue);
    }
  }

  private getActiveEditorDefinition(): ResolvedColumnEditor | null {
    if (!this.editSession) {
      return null;
    }

    return resolveColumnEditor(this.editSession.column);
  }

  private getActiveEditorControl(): HTMLInputElement | HTMLSelectElement {
    const activeEditor = this.getActiveEditorDefinition();
    if (activeEditor && (activeEditor.type === 'boolean' || activeEditor.type === 'select')) {
      return this.editorSelectElement;
    }

    return this.editorInputElement;
  }

  private configureEditorControl(session: EditSession): void {
    const editor = resolveColumnEditor(session.column);
    const usesSelect = editor.type === 'boolean' || editor.type === 'select';
    this.editorInputElement.style.display = usesSelect ? 'none' : '';
    this.editorSelectElement.style.display = usesSelect ? '' : 'none';
    this.editorInputElement.disabled = false;
    this.editorSelectElement.disabled = false;

    if (usesSelect) {
      this.editorSelectElement.replaceChildren();
      const emptyOption = document.createElement('option');
      emptyOption.value = '';
      emptyOption.textContent = editor.placeholder;
      this.editorSelectElement.append(emptyOption);
      for (let index = 0; index < editor.options.length; index += 1) {
        const option = editor.options[index];
        const optionElement = document.createElement('option');
        optionElement.value = String(index);
        optionElement.textContent = option.label;
        this.editorSelectElement.append(optionElement);
      }
      this.editorSelectElement.value = formatEditorInputValue(session.column, session.originalValue);
      return;
    }

    this.editorInputElement.type = editor.type === 'number' || editor.type === 'date' ? editor.type : 'text';
    this.editorInputElement.placeholder = editor.placeholder;
    this.editorInputElement.inputMode = editor.inputMode ?? '';
    this.editorInputElement.setAttribute('autocomplete', editor.autoComplete ?? 'off');
    if (editor.pattern) {
      this.editorInputElement.pattern = editor.pattern;
    } else {
      this.editorInputElement.removeAttribute('pattern');
    }
    if (typeof editor.min === 'number') {
      this.editorInputElement.min = String(editor.min);
    } else {
      this.editorInputElement.removeAttribute('min');
    }
    if (typeof editor.max === 'number') {
      this.editorInputElement.max = String(editor.max);
    } else {
      this.editorInputElement.removeAttribute('max');
    }
    if (typeof editor.step === 'number') {
      this.editorInputElement.step = String(editor.step);
    } else {
      this.editorInputElement.removeAttribute('step');
    }
    this.editorInputElement.value = formatEditorInputValue(session.column, session.originalValue);
  }

  private getEditorControlValue(): string {
    const activeControl = this.getActiveEditorControl();
    return activeControl.value;
  }

  private setEditorControlValue(value: string): void {
    const activeControl = this.getActiveEditorControl();
    activeControl.value = value;
  }

  private focusEditorControl(): void {
    const activeControl = this.getActiveEditorControl();
    activeControl.focus();
    if (activeControl instanceof HTMLInputElement) {
      activeControl.select();
    }
  }

  private getEditorControlValidationMessage(): string | null {
    const activeEditor = this.getActiveEditorDefinition();
    const activeControl = this.getActiveEditorControl();
    if (!activeEditor || activeControl instanceof HTMLSelectElement) {
      return null;
    }

    const shouldUseNativeValidation =
      activeEditor.type === 'number' ||
      Boolean(activeEditor.pattern) ||
      typeof activeEditor.min === 'number' ||
      typeof activeEditor.max === 'number' ||
      typeof activeEditor.step === 'number';
    if (!shouldUseNativeValidation) {
      return null;
    }

    if (typeof activeControl.checkValidity === 'function' && !activeControl.checkValidity()) {
      return activeControl.validationMessage || this.localeText.validationFailed;
    }

    return null;
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
        this.focusEditorControl();
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

    this.editSession = createEditSession(rowIndex, dataIndex, colIndex, column, originalValue);
    this.configureEditorControl(this.editSession);
    this.editValidationTicket += 1;
    this.isEditValidationPending = false;
    this.applyEditorOverlayState(createOpenEditorOverlayState(formatEditorInputValue(column, originalValue)));
    this.syncEditorOverlayPosition();
    this.focusEditorControl();

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
    const currentEditorValue = this.getEditorControlValue();
    this.editValidationTicket += 1;
    this.isEditValidationPending = false;
    this.editSession = null;
    this.applyEditorOverlayState(createClosedEditorOverlayState());

    if (shouldEmitCancel) {
      this.eventBus.emit('editCancel', {
        rowIndex: currentSession.rowIndex,
        dataIndex: currentSession.dataIndex,
        columnId: currentSession.column.id,
        value: currentEditorValue,
        reason
      });
    }
  }

  private async commitEditing(trigger: 'enter' | 'blur'): Promise<void> {
    const currentSession = this.editSession;
    if (!currentSession || this.isEditValidationPending) {
      return;
    }

    const rawInputValue = this.getEditorControlValue();
    const nextValue = normalizeEditorInputValue(currentSession.column, rawInputValue);
    const row = this.resolveRow(currentSession.dataIndex);
    const validateEdit = this.options.validateEdit;
    const currentValidationTicket = ++this.editValidationTicket;
    const editorValidationMessage = this.getEditorControlValidationMessage();

    if (editorValidationMessage) {
      this.applyEditorOverlayState(createInvalidEditorOverlayState(editorValidationMessage));
      if (shouldRefocusEditorAfterValidationFailure(trigger)) {
        this.focusEditorControl();
      }
      return;
    }

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
        this.applyEditorOverlayState(createPendingEditorOverlayState());
        let resolvedMessage: string | null = null;
        try {
          resolvedMessage = resolveEditValidationMessage(await validationResult);
        } catch (error) {
          resolvedMessage = error instanceof Error && error.message ? error.message : this.localeText.validationFailed;
        }
        if (currentValidationTicket !== this.editValidationTicket || this.editSession !== currentSession) {
          return;
        }

        this.isEditValidationPending = false;
        this.applyEditorOverlayState(createActiveEditorOverlayState());

        if (resolvedMessage) {
          this.applyEditorOverlayState(createInvalidEditorOverlayState(resolvedMessage));
          if (shouldRefocusEditorAfterValidationFailure(trigger)) {
            this.focusEditorControl();
          }
          return;
        }
      } else {
        const resolvedMessage = resolveEditValidationMessage(validationResult as string | EditValidationIssue | null | undefined);
        if (!resolvedMessage) {
          this.applyEditorOverlayState(createActiveEditorOverlayState());
        } else {
          this.applyEditorOverlayState(createInvalidEditorOverlayState(resolvedMessage));
          if (shouldRefocusEditorAfterValidationFailure(trigger)) {
            this.focusEditorControl();
          }
          return;
        }
      }
    } else {
      this.applyEditorOverlayState(createActiveEditorOverlayState());
    }

    let committedValue = nextValue;
    if (currentSession.column.valueSetter) {
      const rowForSetter = this.options.dataProvider.getRow
        ? this.options.dataProvider.getRow(currentSession.dataIndex) ?? row
        : row;
      currentSession.column.valueSetter(rowForSetter, nextValue, currentSession.column);
      committedValue = getColumnValue(currentSession.column, rowForSetter);
    }
    this.options.dataProvider.setValue(currentSession.dataIndex, currentSession.column.id, committedValue);
    const committedRowKey = this.resolveStableRowKeyFromLoadedRow(currentSession.dataIndex, row);
    const transaction = this.createOriginalEditTransactionContext('editor', 'singleCell');
    this.recordEditHistoryEntry(transaction, [
      {
        rowIndex: currentSession.rowIndex,
        dataIndex: currentSession.dataIndex,
        rowKey: committedRowKey,
        columnId: currentSession.column.id,
        previousValue: currentSession.originalValue,
        value: committedValue
      }
    ]);

    this.eventBus.emit(
      'editCommit',
      this.createEditCommitEventPayload(
        {
          rowIndex: currentSession.rowIndex,
          dataIndex: currentSession.dataIndex,
          rowKey: committedRowKey,
          columnId: currentSession.column.id,
          previousValue: currentSession.originalValue,
          value: committedValue
        },
        transaction
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
    const overlayRect = resolveEditorOverlayRect(cellRect, rootRect);
    this.editorHostElement.style.left = `${overlayRect.left}px`;
    this.editorHostElement.style.top = `${overlayRect.top}px`;
    this.editorHostElement.style.width = `${overlayRect.width}px`;
    this.editorHostElement.style.height = `${overlayRect.height}px`;
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
    return resolveHorizontalWindow({
      columnLeft: this.centerColumnLeft,
      columnWidth: this.centerColumnWidth,
      totalCenterColumns: this.columnsByZone.center.length,
      centerVisibleWidth: this.centerVisibleWidth,
      centerCellCapacity: this.centerCellCapacity,
      overscanCols: this.getColumnOverscan(),
      scrollLeft
    });
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
        extraClassName:
          this.getHeaderLeafExtraClassName(column),
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

  private renderCenterFilterRow(horizontalWindow: HorizontalWindow): void {
    if (!this.isFilterRowEnabled() || this.centerFilterCellPool.length === 0 || horizontalWindow.end <= horizontalWindow.start) {
      for (let slotIndex = 0; slotIndex < this.centerFilterCellPool.length; slotIndex += 1) {
        this.applyFilterRowCell(this.centerFilterCellPool[slotIndex], null, 0, 0, false);
      }
      return;
    }

    const centerColumns = this.columnsByZone.center;
    let slotIndex = 0;
    for (let colIndex = horizontalWindow.start; colIndex < horizontalWindow.end; colIndex += 1) {
      const column = centerColumns[colIndex];
      const poolItem = this.centerFilterCellPool[slotIndex];
      if (!poolItem) {
        break;
      }

      this.applyFilterRowCell(poolItem, column, this.centerColumnLeft[colIndex], column.width, !this.isSystemUtilityColumnId(column.id));
      slotIndex += 1;
    }

    for (let hiddenIndex = slotIndex; hiddenIndex < this.centerFilterCellPool.length; hiddenIndex += 1) {
      this.applyFilterRowCell(this.centerFilterCellPool[hiddenIndex], null, 0, 0, false);
    }
  }

  private applyFilterRowValue(columnId: string, rawValue: string): void {
    const column = findVisibleColumnById(this.columnCatalog, columnId);
    if (!column || this.isSystemUtilityColumnId(column.id)) {
      return;
    }

    const normalizedValue = rawValue.trim();
    if (normalizedValue.length === 0) {
      delete this.filterRowDraftByColumnId[column.id];
    } else {
      this.filterRowDraftByColumnId[column.id] = rawValue;
    }

    this.eventBus.emit('filterUiApply', {
      columnId: column.id,
      filterInput: this.parseFilterRowInput(column, rawValue)
    });
  }

  private readDateFilterRowDraftFromControlTarget(target: EventTarget | null): { columnId: string; rawValue: string } | null {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return null;
    }

    const columnId = target.dataset.filterRowColumnId ?? '';
    if (!columnId) {
      return null;
    }

    const shellElement = target.closest('.hgrid__filter-row-date-shell');
    if (!(shellElement instanceof HTMLDivElement)) {
      return null;
    }

    const operatorElement = shellElement.querySelector('.hgrid__filter-row-date-operator') as HTMLSelectElement | null;
    const valueInputElement = shellElement.querySelector(
      '.hgrid__filter-row-date-input[data-filter-row-control="date-value"]'
    ) as HTMLInputElement | null;
    const secondaryInputElement = shellElement.querySelector(
      '.hgrid__filter-row-date-input[data-filter-row-control="date-secondary"]'
    ) as HTMLInputElement | null;
    if (!operatorElement || !valueInputElement || !secondaryInputElement) {
      return null;
    }

    return {
      columnId,
      rawValue: encodeDateFilterRowDraft(
        operatorElement.value as DateFilterOperator,
        valueInputElement.value,
        secondaryInputElement.value
      )
    };
  }

  private handleHeaderInput = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.filterRowControl === 'text' && target.dataset.filterRowColumnId) {
      this.filterRowDraftByColumnId[target.dataset.filterRowColumnId] = target.value;
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.filterRowControl === 'boolean' && target.dataset.filterRowColumnId) {
      if (target.value.length === 0) {
        delete this.filterRowDraftByColumnId[target.dataset.filterRowColumnId];
      } else {
        this.filterRowDraftByColumnId[target.dataset.filterRowColumnId] = target.value;
      }
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.filterRowControl === 'set' && target.dataset.filterRowColumnId) {
      if (target.value.length === 0) {
        delete this.filterRowDraftByColumnId[target.dataset.filterRowColumnId];
      } else {
        this.filterRowDraftByColumnId[target.dataset.filterRowColumnId] = target.value;
      }
      return;
    }

    const draftState = this.readDateFilterRowDraftFromControlTarget(target);
    if (!draftState) {
      return;
    }

    if (draftState.rawValue.length === 0) {
      delete this.filterRowDraftByColumnId[draftState.columnId];
    } else {
      this.filterRowDraftByColumnId[draftState.columnId] = draftState.rawValue;
    }
  };

  private handleHeaderChange = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.filterRowControl === 'text' && target.dataset.filterRowColumnId) {
      this.applyFilterRowValue(target.dataset.filterRowColumnId, target.value);
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.filterRowControl === 'boolean' && target.dataset.filterRowColumnId) {
      this.applyFilterRowValue(target.dataset.filterRowColumnId, target.value);
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.filterRowControl === 'set' && target.dataset.filterRowColumnId) {
      this.applyFilterRowValue(target.dataset.filterRowColumnId, target.value);
      return;
    }

    const draftState = this.readDateFilterRowDraftFromControlTarget(target);
    if (!draftState) {
      return;
    }

    this.applyFilterRowValue(draftState.columnId, draftState.rawValue);
  };

  private handleHeaderKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.filterRowControl === 'text' && target.dataset.filterRowColumnId) {
      if (event.key === 'Enter') {
        this.applyFilterRowValue(target.dataset.filterRowColumnId, target.value);
        event.preventDefault();
        return;
      }

      if (event.key === 'Escape') {
        target.value = '';
        delete this.filterRowDraftByColumnId[target.dataset.filterRowColumnId];
        this.applyFilterRowValue(target.dataset.filterRowColumnId, '');
        event.preventDefault();
      }
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.filterRowControl === 'boolean' && target.dataset.filterRowColumnId) {
      if (event.key === 'Escape') {
        target.value = '';
        delete this.filterRowDraftByColumnId[target.dataset.filterRowColumnId];
        this.applyFilterRowValue(target.dataset.filterRowColumnId, '');
        event.preventDefault();
      }
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.filterRowControl === 'set' && target.dataset.filterRowColumnId) {
      if (event.key === 'Escape') {
        target.value = '';
        delete this.filterRowDraftByColumnId[target.dataset.filterRowColumnId];
        this.applyFilterRowValue(target.dataset.filterRowColumnId, '');
        event.preventDefault();
      }
      return;
    }

    const draftState = this.readDateFilterRowDraftFromControlTarget(target);
    if (!draftState) {
      return;
    }

    if (event.key === 'Enter') {
      this.applyFilterRowValue(draftState.columnId, draftState.rawValue);
      event.preventDefault();
      return;
    }

    if (event.key === 'Escape') {
      const shellElement = (target as HTMLElement).closest('.hgrid__filter-row-date-shell');
      if (shellElement instanceof HTMLDivElement) {
        const operatorElement = shellElement.querySelector('.hgrid__filter-row-date-operator') as HTMLSelectElement | null;
        const valueInputElement = shellElement.querySelector(
          '.hgrid__filter-row-date-input[data-filter-row-control="date-value"]'
        ) as HTMLInputElement | null;
        const secondaryInputElement = shellElement.querySelector(
          '.hgrid__filter-row-date-input[data-filter-row-control="date-secondary"]'
        ) as HTMLInputElement | null;
        if (operatorElement) {
          operatorElement.value = 'on';
        }
        if (valueInputElement) {
          valueInputElement.value = '';
        }
        if (secondaryInputElement) {
          secondaryInputElement.value = '';
        }
        shellElement.classList.remove('hgrid__filter-row-date-shell--between');
      }
      delete this.filterRowDraftByColumnId[draftState.columnId];
      this.applyFilterRowValue(draftState.columnId, '');
      event.preventDefault();
    }
  };

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
    this.statusBarNeedsSummaryRefresh = true;
    this.statusBarAggregateComputationId += 1;
    if (forcePoolRebuild) {
      this.shouldForcePoolRebuild = true;
    }
  }

  private markDataDirty(): void {
    this.dataDirty = true;
    this.statusBarNeedsSummaryRefresh = true;
    this.statusBarAggregateComputationId += 1;
  }

  private markSelectionDirty(): void {
    this.selectionDirty = true;
    this.statusBarNeedsSummaryRefresh = true;
    this.statusBarAggregateComputationId += 1;
  }

  private markThemeDirty(): void {
    this.themeDirty = true;
  }

  private markScrollDirty(): void {
    this.scrollDirty = true;
  }

  private hasPendingRenderWork(): boolean {
    return (
      this.layoutDirty ||
      this.dataDirty ||
      this.selectionDirty ||
      this.themeDirty ||
      this.scrollDirty ||
      this.editActionBarDirty ||
      this.statusBarDirty
    );
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
    const shouldRunActionBarOnly = this.editActionBarDirty;
    const shouldRunStatusBarOnly = this.statusBarDirty;
    const shouldForcePoolRebuild = this.shouldForcePoolRebuild;

    this.layoutDirty = false;
    this.dataDirty = false;
    this.selectionDirty = false;
    this.scrollDirty = false;
    this.editActionBarDirty = false;
    this.statusBarDirty = false;
    this.shouldForcePoolRebuild = false;

    if (shouldRunLayout) {
      this.refreshLayout(shouldForcePoolRebuild);
      return;
    }

    if (shouldRunRows) {
      this.renderRows(this.pendingScrollTop, this.pendingScrollLeft);
      return;
    }

    if (shouldRunActionBarOnly || shouldRunStatusBarOnly) {
      if (shouldRunActionBarOnly) {
        this.renderEditActionBar();
      }
      this.renderStatusBar(false);
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
    this.closeColumnMenu();
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
    this.closeColumnMenu();
    if (this.isSyncingScroll) {
      return;
    }

    const verticalScrollElement = event.currentTarget as HTMLDivElement;
    this.setVerticalScrollTop(verticalScrollElement.scrollTop);
    this.markScrollDirty();
    this.scheduleRender();
  };

  private handleHorizontalScroll = (event: Event): void => {
    this.closeColumnMenu();
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
    if (!isHeaderResizeHandleHit(clientX, clientY, cellRect, HEADER_RESIZE_HIT_SLOP_PX)) {
      return null;
    }

    const columnId = headerCell.dataset.columnId;
    if (!columnId) {
      return null;
    }

    const column = findVisibleColumnById(this.options.columns, columnId);
    if (!column) {
      return null;
    }

    return {
      columnId,
      column,
      headerCell
    };
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

  private resolveBodyCellHitFromTarget(
    target: HTMLElement | null
  ): (CellHitTestResult & { cellElement: HTMLDivElement }) | null {
    if (!target) {
      return null;
    }

    const cellElement = target.closest('.hgrid__cell') as HTMLDivElement | null;
    if (!cellElement || !this.bodyElement.contains(cellElement)) {
      return null;
    }

    const rowElement = cellElement.closest('.hgrid__row') as HTMLDivElement | null;
    if (!rowElement) {
      return null;
    }

    const rowIndex = Number.parseInt(rowElement.dataset.rowIndex ?? '-1', 10);
    const dataIndex = Number.parseInt(rowElement.dataset.dataIndex ?? '-1', 10);
    const columnId = cellElement.dataset.columnId ?? '';
    if (!Number.isFinite(rowIndex) || rowIndex < 0 || !Number.isFinite(dataIndex) || dataIndex < 0 || columnId.length === 0) {
      return null;
    }

    const findInZone = (
      zone: ColumnZoneName,
      columns: ColumnDef[]
    ): { zone: ColumnZoneName; columnIndex: number; column: ColumnDef } | null => {
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        if (column.id === columnId) {
          return {
            zone,
            columnIndex,
            column
          };
        }
      }

      return null;
    };

    const resolvedColumn =
      findInZone('left', this.columnsByZone.left) ??
      findInZone('center', this.columnsByZone.center) ??
      findInZone('right', this.columnsByZone.right);
    if (!resolvedColumn) {
      return null;
    }

    return {
      ...resolvedColumn,
      rowIndex,
      dataIndex,
      cellElement
    };
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

    const columnIndex = getVisibleColumnIndexById(this.options.columns, columnId);
    if (columnIndex === -1) {
      return null;
    }

    const cellRect = headerCell.getBoundingClientRect();
    return createHeaderDropTarget(columnId, columnIndex, clientX, cellRect);
  }

  private showHeaderDropIndicator(indicatorClientX: number): void {
    const headerRect = this.headerElement.getBoundingClientRect();
    const clampedLeft = clampHeaderDropIndicatorOffset(headerRect, indicatorClientX);
    this.headerDropIndicatorElement.style.display = 'block';
    this.headerDropIndicatorElement.style.transform = `translateX(${clampedLeft}px)`;
  }

  private hideHeaderDropIndicator(): void {
    this.headerDropIndicatorElement.style.display = 'none';
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

    const sourceIndex = getVisibleColumnIndexById(this.options.columns, sourceColumnId);
    if (sourceIndex === -1) {
      return;
    }

    this.teardownColumnReorderSession();
    this.teardownPointerSelectionSession();
    this.teardownFillHandleSession();
    this.setHeaderResizeHoverCell(null);

    this.columnReorderSession = createColumnReorderSession(pointerId, clientX, clientY, sourceColumnId, sourceIndex);
    this.columnReorderSession.pendingTarget = sourceHeaderCell;

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

    const normalizedTargetIndex = normalizeDropIndexForSource(session.currentDropIndex, session.sourceIndex);
    if (normalizedTargetIndex === session.sourceIndex) {
      return;
    }

    const nextOrder = buildReorderedColumnOrder(
      this.options.columns.map((column) => column.id),
      session.sourceIndex,
      normalizedTargetIndex
    );
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
    this.teardownFillHandleSession();

    this.columnResizeSession = createColumnResizeSession(pointerId, clientX, resizeHit);

    this.rootElement.classList.add('hgrid--column-resizing');
    this.setHeaderResizeHoverCell(null);
    this.eventBus.emit('columnResize', {
      columnId: resizeHit.columnId,
      width: this.columnResizeSession.startWidth,
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

    const nextWidth = resolveNextColumnResizeWidth(session);
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

  private handleFillHandlePointerDown = (event: PointerEvent): void => {
    if (this.editSession || event.button !== 0) {
      return;
    }

    const selectionRectangle = this.resolveRangeHandleSelectionRectangle();
    if (!selectionRectangle) {
      return;
    }

    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : 1;
    this.rootElement.focus();
    this.startFillHandleSession(pointerId, selectionRectangle);
    event.preventDefault();
    event.stopPropagation();
  };

  private startFillHandleSession(pointerId: number, sourceRectangle: SelectionRectangle): void {
    this.teardownPointerSelectionSession();
    this.teardownFillHandleSession();
    this.fillHandleSession = {
      pointerId,
      sourceRectangle: { ...sourceRectangle },
      previewRectangle: { ...sourceRectangle },
      lastCell: {
        rowIndex: sourceRectangle.endRow,
        colIndex: sourceRectangle.endCol
      },
      lastClientX: Number.NaN,
      lastClientY: Number.NaN
    };
    this.syncSelectionDragClass();
    window.addEventListener('pointermove', this.handleWindowFillHandleMove, { passive: true });
    window.addEventListener('pointerup', this.handleWindowFillHandleUp);
    window.addEventListener('pointercancel', this.handleWindowFillHandleUp);
    this.markSelectionDirty();
    this.scheduleRender();
  }

  private teardownFillHandleSession(): void {
    if (!this.fillHandleSession) {
      return;
    }

    if (this.fillHandleAutoScrollFrameId !== null) {
      cancelAnimationFrame(this.fillHandleAutoScrollFrameId);
      this.fillHandleAutoScrollFrameId = null;
    }

    this.fillHandleSession = null;
    this.syncSelectionDragClass();
    window.removeEventListener('pointermove', this.handleWindowFillHandleMove);
    window.removeEventListener('pointerup', this.handleWindowFillHandleUp);
    window.removeEventListener('pointercancel', this.handleWindowFillHandleUp);
  }

  private previewFillHandleSelection(targetCell: SelectionCellPosition): void {
    const session = this.fillHandleSession;
    if (!session) {
      return;
    }

    const nextPreviewRectangle = resolveFillPreviewRectangle(session.sourceRectangle, targetCell);
    session.lastCell = { ...targetCell };
    if (selectionRectanglesEqual(session.previewRectangle, nextPreviewRectangle)) {
      return;
    }

    session.previewRectangle = nextPreviewRectangle;
    const hasSelectionChanged = this.selectionModel.setSelection(
      {
        activeCell: targetCell,
        cellRanges: [
          {
            r1: nextPreviewRectangle.startRow,
            c1: nextPreviewRectangle.startCol,
            r2: nextPreviewRectangle.endRow,
            c2: nextPreviewRectangle.endCol
          }
        ],
        rowRanges: []
      },
      this.getSelectionBounds(),
      this.resolveRowKeyByRowIndex
    );
    if (hasSelectionChanged) {
      this.commitSelectionChange('pointer');
    } else {
      this.markSelectionDirty();
      this.scheduleRender();
    }
  }

  private getFillHandleAutoScrollBounds(): { top: number; right: number; bottom: number; left: number } | null {
    const bodyRect = this.bodyElement.getBoundingClientRect();
    const bottom = bodyRect.bottom - this.horizontalScrollElement.offsetHeight;
    const right = bodyRect.right - this.verticalScrollElement.offsetWidth;
    if (right <= bodyRect.left || bottom <= bodyRect.top) {
      return null;
    }

    return {
      top: bodyRect.top,
      right,
      bottom,
      left: bodyRect.left
    };
  }

  private previewFillHandleSelectionAtPoint(clientX: number, clientY: number): void {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
      return;
    }

    const directHit = this.hitTestCellAtPoint(clientX, clientY);
    if (directHit) {
      this.previewFillHandleSelection(this.toSelectionCellPosition(directHit));
      return;
    }

    const bounds = this.getFillHandleAutoScrollBounds();
    if (!bounds) {
      return;
    }

    const clampedClientX = Math.max(bounds.left + 1, Math.min(bounds.right - 1, clientX));
    const clampedClientY = Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, clientY));
    const clampedHit = this.hitTestCellAtPoint(clampedClientX, clampedClientY);
    if (clampedHit) {
      this.previewFillHandleSelection(this.toSelectionCellPosition(clampedHit));
    }
  }

  private scheduleFillHandleAutoScroll(): void {
    if (this.fillHandleAutoScrollFrameId !== null) {
      return;
    }

    this.fillHandleAutoScrollFrameId = requestAnimationFrame(() => {
      this.fillHandleAutoScrollFrameId = null;
      const session = this.fillHandleSession;
      if (!session) {
        return;
      }

      const bounds = this.getFillHandleAutoScrollBounds();
      if (!bounds) {
        return;
      }

      const delta = resolveFillHandleAutoScrollDelta(
        session.lastClientX,
        session.lastClientY,
        bounds,
        DEFAULT_FILL_HANDLE_AUTO_SCROLL_EDGE,
        DEFAULT_FILL_HANDLE_AUTO_SCROLL_STEP
      );

      const previousVirtualScrollTop = this.pendingVirtualScrollTop;
      const previousScrollLeft = this.pendingScrollLeft;
      if (this.canUseVerticalScroll && delta.vertical !== 0) {
        this.addVerticalScrollDelta(delta.vertical);
      }
      if (this.canUseHorizontalScroll && delta.horizontal !== 0) {
        this.setHorizontalScrollLeft(this.horizontalScrollElement.scrollLeft + delta.horizontal);
      }

      const hasScrolled =
        previousVirtualScrollTop !== this.pendingVirtualScrollTop || previousScrollLeft !== this.pendingScrollLeft;
      if (!hasScrolled) {
        return;
      }

      this.markScrollDirty();
      this.scheduleRender();
      this.previewFillHandleSelectionAtPoint(session.lastClientX, session.lastClientY);
      this.scheduleFillHandleAutoScroll();
    });
  }

  private handleWindowFillHandleMove = (event: PointerEvent): void => {
    const session = this.fillHandleSession;
    if (!session) {
      return;
    }

    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : session.pointerId;
    if (session.pointerId !== pointerId) {
      return;
    }

    session.lastClientX = event.clientX;
    session.lastClientY = event.clientY;
    this.previewFillHandleSelectionAtPoint(event.clientX, event.clientY);
    this.scheduleFillHandleAutoScroll();
  };

  private handleWindowFillHandleUp = (event: PointerEvent): void => {
    const session = this.fillHandleSession;
    if (!session) {
      return;
    }

    const pointerId = typeof event.pointerId === 'number' ? event.pointerId : session.pointerId;
    if (session.pointerId !== pointerId) {
      return;
    }

    session.lastClientX = event.clientX;
    session.lastClientY = event.clientY;
    this.previewFillHandleSelectionAtPoint(event.clientX, event.clientY);

    const finalPreviewRectangle = { ...session.previewRectangle };
    const sourceRectangle = { ...session.sourceRectangle };
    this.teardownFillHandleSession();
    const updates = this.applyRangeFill(sourceRectangle, finalPreviewRectangle);
    if (updates.length > 0) {
      const transaction = this.createOriginalEditTransactionContext('fillHandle', 'fillRange');
      this.recordEditHistoryEntry(transaction, updates);
      this.eventBus.emit('editCommit', this.createEditCommitEventPayload(updates, transaction));
    }

    this.markSelectionDirty();
    this.scheduleRender();
  };

  private handleRootPointerDown = (event: PointerEvent): void => {
    if (event.target instanceof HTMLElement && event.target.closest('[data-range-handle="true"]')) {
      return;
    }

    if (this.isTargetInsideColumnMenu(event.target)) {
      return;
    }

    if (this.isTargetInsideFilterPanel(event.target)) {
      return;
    }

    if (this.openColumnMenuState) {
      this.closeColumnMenu();
    }

    if (this.openFilterPanelState) {
      this.closeFilterPanel();
    }

    if (this.isTargetInsideToolPanel(event.target)) {
      return;
    }

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
    if (headerCell && this.isHeaderMenuTriggerHit(event.clientX, headerCell)) {
      this.openColumnMenuForHeaderCell(headerCell, 'button');
      event.preventDefault();
      return;
    }

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
    event.preventDefault();

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

    if (this.isTargetInsideToolPanel(target)) {
      return;
    }

    if (this.handleColumnMenuItemSelection(target)) {
      event.preventDefault();
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

    if (this.isTargetInsideToolPanel(event.target)) {
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
    this.syncSelectionDragClass();

    window.addEventListener('pointermove', this.handleWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', this.handleWindowPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.handleWindowPointerUp, { passive: true });
  }

  private teardownPointerSelectionSession(): void {
    if (!this.pointerSelectionSession) {
      return;
    }

    this.pointerSelectionSession = null;
    this.syncSelectionDragClass();
    window.removeEventListener('pointermove', this.handleWindowPointerMove);
    window.removeEventListener('pointerup', this.handleWindowPointerUp);
    window.removeEventListener('pointercancel', this.handleWindowPointerUp);
  }

  private syncSelectionDragClass(): void {
    const isSelectionDragging = this.pointerSelectionSession !== null || this.fillHandleSession !== null;
    this.rootElement.classList.toggle('hgrid--selection-dragging', isSelectionDragging);
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
    return resolveInitialActiveCell(this.getSelectionBounds(), this.renderedStartRow);
  }

  private getPageStepRows(): number {
    return Math.max(1, Math.floor(this.getViewportHeight() / this.getBaseRowHeight()));
  }

  private clampSelectionCell(cell: SelectionCellPosition): SelectionCellPosition {
    return clampSelectionCellToBounds(this.getSelectionBounds(), cell);
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

    if (this.isTargetInsideFilterRow(event.target)) {
      return;
    }

    if (this.openFilterPanelState) {
      if (event.key === 'Escape') {
        this.closeFilterPanel(true);
        event.preventDefault();
        return;
      }

      if (this.isTargetInsideFilterPanel(event.target)) {
        return;
      }
    }

    if (this.openColumnMenuState) {
      if (event.key === 'Escape') {
        this.closeColumnMenu(true);
        event.preventDefault();
        return;
      }

      if (this.isTargetInsideColumnMenu(event.target)) {
        return;
      }
    }

    if (this.openToolPanelId) {
      if (event.key === 'Escape') {
        this.closeToolPanel();
        this.rootElement.focus();
        event.preventDefault();
        return;
      }

      if (this.isTargetInsideToolPanel(event.target)) {
        return;
      }
    }

    if (this.editSession) {
      return;
    }

    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      const currentSelection = this.selectionModel.getSelection();
      const activeCell = currentSelection.activeCell ?? this.getInitialActiveCell();
      if (!activeCell || !this.supportsColumnMenuOpenSource('keyboard')) {
        return;
      }

      const activeColumn = this.resolveColumnByGlobalIndex(activeCell.colIndex);
      if (!activeColumn || !this.isColumnMenuEligibleColumn(activeColumn.column)) {
        return;
      }

      const headerCell = this.findVisibleHeaderCellByColumnId(activeColumn.column.id);
      if (!headerCell) {
        return;
      }

      this.openColumnMenuForHeaderCell(headerCell, 'keyboard');
      event.preventDefault();
      return;
    }

    if (this.handleClipboardCopyShortcut(event)) {
      return;
    }

    if (this.handleUndoRedoShortcut(event)) {
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
    if (this.isTargetInsideFilterRow(event.target)) {
      return false;
    }

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

  private handleUndoRedoShortcut(event: KeyboardEvent): boolean {
    const isCtrlOrMeta = event.ctrlKey || event.metaKey;
    if (!isCtrlOrMeta || event.altKey) {
      return false;
    }

    const key = event.key.toLowerCase();
    if (key === 'z') {
      const didApply = event.shiftKey ? this.redoLastEdit() : this.undoLastEdit();
      if (!didApply) {
        return false;
      }

      event.preventDefault();
      return true;
    }

    if (key === 'y' && !event.shiftKey) {
      if (!this.redoLastEdit()) {
        return false;
      }

      event.preventDefault();
      return true;
    }

    return false;
  }

  private handleRootCopy = (event: ClipboardEvent): void => {
    if (event.defaultPrevented || this.editSession || this.isTargetInsideFilterRow(event.target)) {
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
    if (event.defaultPrevented || this.editSession || this.isTargetInsideFilterRow(event.target)) {
      return;
    }

    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return;
    }

    const plainText = clipboardData.getData('text/plain');
    if (typeof plainText !== 'string' || plainText.length === 0) {
      const htmlText = clipboardData.getData('text/html');
      if (typeof htmlText === 'string' && htmlText.length > 0) {
        event.preventDefault();
      }
      return;
    }

    const matrix = parseClipboardTsv(plainText);
    const updates = this.applyClipboardMatrix(matrix);
    if (updates.length === 0) {
      return;
    }

    const transaction = this.createOriginalEditTransactionContext('clipboard', 'clipboardRange');
    this.recordEditHistoryEntry(transaction, updates);
    this.eventBus.emit('editCommit', this.createEditCommitEventPayload(updates, transaction));
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

    const activeEditor = this.getActiveEditorDefinition();
    if (activeEditor && activeEditor.type === 'masked') {
      const sanitizedValue = sanitizeEditorInputValue(this.editSession.column, this.editorInputElement.value);
      if (sanitizedValue !== this.editorInputElement.value) {
        this.editorInputElement.value = sanitizedValue;
      }
    }

    if (!this.editorHostElement.classList.contains('hgrid__editor-host--invalid')) {
      return;
    }

    this.applyEditorOverlayState(createActiveEditorOverlayState());
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
      return row ?? {};
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

    const metrics = resolveViewportTransformMetrics({
      scrollTop,
      scrollLeft,
      pendingVirtualScrollTop: this.pendingVirtualScrollTop,
      renderedStartRow: this.renderedStartRow,
      renderedScrollTop: this.renderedScrollTop,
      renderedViewportOffsetY: this.renderedViewportOffsetY,
      forceVerticalSync,
      getStartRowForScrollTop: (virtualScrollTop) => this.getStartRowForScrollTop(virtualScrollTop)
    });
    this.rowsViewportCenterElement.style.transform = metrics.centerVerticalTransform;
    this.rowsViewportLeftElement.style.transform = metrics.pinnedVerticalTransform;
    this.rowsViewportRightElement.style.transform = metrics.pinnedVerticalTransform;
  }

  private getMaxVerticalScrollTop(): number {
    const maxVertical = this.verticalScrollElement.scrollHeight - this.verticalScrollElement.clientHeight;
    const maxViewport = this.viewportElement.scrollHeight - this.viewportElement.clientHeight;
    return Math.max(0, this.physicalMaxScrollTop, maxVertical, maxViewport);
  }

  private getMaxHorizontalScrollLeft(): number {
    const maxHorizontal = this.horizontalScrollElement.scrollWidth - this.horizontalScrollElement.clientWidth;
    const leftWidth = sumColumnWidths(this.columnsByZone.left);
    const centerWidth = this.centerColumnsWidth;
    const rightWidth = sumColumnWidths(this.columnsByZone.right);
    const reservedVerticalWidth = Number.parseFloat(this.rootElement.style.getPropertyValue('--hgrid-v-scrollbar-width')) || 0;
    const rootWidth = this.rootElement.clientWidth || this.container.clientWidth || leftWidth + centerWidth + rightWidth;
    return calculateMaxHorizontalScrollLeft({
      maxHorizontalScrollLeft: maxHorizontal,
      leftWidth,
      centerWidth,
      rightWidth,
      reservedVerticalWidth,
      rootWidth
    });
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
