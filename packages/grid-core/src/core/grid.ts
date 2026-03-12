import { EventBus } from './event-bus';
import type { GridEventMap, GridEventName } from './event-bus';
import type {
  ColumnDef,
  ColumnGroupDef,
  GroupAggregationDef,
  GridLocaleText,
  GroupModelItem,
  GroupingMode,
  PivotModelItem,
  PivotValueDef,
  PivotingMode,
  PivotingOptions,
  TreeDataMode,
  TreeDataOptions,
  ColumnPinPosition,
  GridConfig,
  GridOptions,
  GridState,
  GridTheme,
  GridWorkerRuntimeOptions,
  GridWorkerFallbackPolicy,
  RowIndicatorOptions,
  UnsafeHtmlSanitizer
} from './grid-options';
import { normalizeGridLocale } from './grid-locale-text';
import { DomRenderer } from '../render/dom-renderer';
import { ColumnModel, createColumnValueFormatContext, formatColumnValue, getColumnValue } from '../data/column-model';
import type { ColumnValueFormatContext } from '../data/column-model';
import type { ColumnFilterCondition, GridFilterModel } from '../data/filter-executor';
import { CooperativeFilterExecutor, type FilterExecutor } from '../data/filter-executor';
import type { DataProvider, GridRowData, RowKey } from '../data/data-provider';
import { LocalDataProvider } from '../data/local-data-provider';
import type { RowModelOptions, RowModelState, SparseRowOverride, ViewToDataMapping } from '../data/row-model';
import { RowModel } from '../data/row-model';
import type { RemoteDataProvider as RemoteDataProviderContract, SortModelItem } from '../data/remote-data-provider';
import { CooperativeSortExecutor, type SortExecutor } from '../data/sort-executor';
import type { GridSelection, GridSelectionInput } from '../interaction/selection-model';
import { CooperativeGroupExecutor, type GroupExecutionResult, type GroupExecutor, type GroupViewRow } from '../data/group-executor';
import { CooperativePivotExecutor, type PivotExecutionResult, type PivotExecutor } from '../data/pivot-executor';
import { GroupedDataProvider } from '../data/grouped-data-provider';
import { CooperativeTreeExecutor, toTreeNodeKeyToken, type TreeExecutionResult, type TreeExecutor } from '../data/tree-executor';
import { TreeDataProvider } from '../data/tree-data-provider';
import type { EditCommitAuditLogger } from './edit-events';
import type { GridRendererPort } from './grid-internal-contracts';
import { GridCommandEventService } from './grid-command-event-service';
import {
  GridDataPipelineService,
  type GridDataPipelineApplyResult,
  type GridDataPipelineState
} from './grid-data-pipeline-service';
import {
  GridExportService,
  type GridExportFormat,
  type GridExportOptions,
  type GridExportResult,
  type GridVisibleRowRange
} from './grid-export-service';
import {
  cloneGroupAggregations,
  cloneGroupExpansionState,
  cloneGroupModel,
  clonePivotModel,
  clonePivotValues
} from './grid-model-utils';
import { GridProviderLifecycleService } from './grid-provider-lifecycle-service';
import { GridRemoteQueryService } from './grid-remote-query-service';
import { GridStateService } from './grid-state-service';
import { WorkerOperationDispatcher } from '../data/worker-operation-dispatcher';
import {
  WORKER_TREE_LAZY_ROW_REF_FIELD,
  createWorkerTreeLazyRowRef,
  serializeFilterExecutionRequestAsync,
  serializeGroupExecutionRequestAsync,
  serializePivotExecutionRequestAsync,
  serializeSortExecutionRequestAsync,
  serializeTreeExecutionRequestAsync
} from '../data/worker-operation-payloads';
import { WorkerProjectionCache } from '../data/worker-projection-cache';
export type {
  GridExportFormat,
  GridExportOptions,
  GridExportProgressEvent,
  GridExportResult,
  GridExportScope,
  GridExportStatus,
  GridVisibleRowRange
} from './grid-export-service';

const DEFAULT_SCROLLBAR_POLICY = {
  vertical: 'auto',
  horizontal: 'auto'
} as const;
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
const DEFAULT_STATE_COLUMN_WIDTH = 108;
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_WORKER_TIMEOUT_MS = 15_000;
const DEFAULT_WORKER_LARGE_DATA_THRESHOLD = 100_000;

type CancelableExecutor<TExecutor> = TExecutor & {
  cancel(opId: string): void;
  destroy(): void;
};

type WorkerBackedExecutor<TExecutor> = CancelableExecutor<TExecutor> & {
  prewarm(): boolean;
};

function isSystemUtilityColumn(columnId: string): boolean {
  return (
    columnId === LEGACY_INDICATOR_COLUMN_ID ||
    columnId === INDICATOR_ROW_NUMBER_COLUMN_ID ||
    columnId === INDICATOR_CHECKBOX_COLUMN_ID ||
    columnId === INDICATOR_STATUS_COLUMN_ID ||
    columnId === STATE_COLUMN_ID
  );
}

function mergeScrollbarPolicy(
  currentPolicy: GridOptions['scrollbarPolicy'],
  nextPolicy: GridConfig['scrollbarPolicy']
): GridOptions['scrollbarPolicy'] {
  if (!nextPolicy) {
    return currentPolicy;
  }

  return {
    vertical: nextPolicy.vertical ?? currentPolicy?.vertical ?? DEFAULT_SCROLLBAR_POLICY.vertical,
    horizontal: nextPolicy.horizontal ?? currentPolicy?.horizontal ?? DEFAULT_SCROLLBAR_POLICY.horizontal
  };
}

function mergeRowIndicatorOptions(
  currentOptions: GridOptions['rowIndicator'],
  nextOptions: GridConfig['rowIndicator']
): GridOptions['rowIndicator'] {
  if (!nextOptions) {
    return currentOptions;
  }

  return {
    ...currentOptions,
    ...nextOptions
  };
}

function mergeStateColumnOptions(
  currentOptions: GridOptions['stateColumn'],
  nextOptions: GridConfig['stateColumn']
): GridOptions['stateColumn'] {
  if (!nextOptions) {
    return currentOptions;
  }

  return {
    ...currentOptions,
    ...nextOptions
  };
}

function cloneLocaleText(localeText?: Partial<GridLocaleText>): Partial<GridLocaleText> | undefined {
  if (!localeText || typeof localeText !== 'object') {
    return undefined;
  }

  const nextLocaleText: Partial<GridLocaleText> = {};
  const keys = Object.keys(localeText) as Array<keyof GridLocaleText>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const value = localeText[key];
    if (typeof value === 'string') {
      nextLocaleText[key] = value;
    }
  }

  return nextLocaleText;
}

function cloneNumberFormatOptions(options?: Intl.NumberFormatOptions): Intl.NumberFormatOptions | undefined {
  if (!options || typeof options !== 'object') {
    return undefined;
  }

  return { ...options };
}

function cloneDateTimeFormatOptions(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions | undefined {
  if (!options || typeof options !== 'object') {
    return undefined;
  }

  return { ...options };
}

function normalizeOptionalLocale(locale: string | undefined): string | undefined {
  if (typeof locale !== 'string') {
    return undefined;
  }

  const trimmed = locale.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStyleNonce(styleNonce: string | undefined): string | undefined {
  if (typeof styleNonce !== 'string') {
    return undefined;
  }

  const trimmed = styleNonce.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeWorkerAssetBaseUrl(assetBaseUrl: string | undefined): string | undefined {
  if (typeof assetBaseUrl !== 'string') {
    return undefined;
  }

  const trimmed = assetBaseUrl.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, '');
}

function normalizeWorkerTimeoutMs(timeoutMs: number | undefined): number | undefined {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) {
    return undefined;
  }

  return Math.max(250, Math.floor(timeoutMs));
}

function normalizeWorkerLargeDataThreshold(largeDataThreshold: number | undefined): number | undefined {
  if (typeof largeDataThreshold !== 'number' || !Number.isFinite(largeDataThreshold)) {
    return undefined;
  }

  return Math.max(1, Math.floor(largeDataThreshold));
}

function normalizeWorkerPoolSize(poolSize: number | undefined): number | undefined {
  if (typeof poolSize !== 'number' || !Number.isFinite(poolSize)) {
    return undefined;
  }

  return Math.max(1, Math.floor(poolSize));
}

function normalizeWorkerFallbackPolicy(fallbackPolicy: GridWorkerFallbackPolicy | undefined): GridWorkerFallbackPolicy | undefined {
  return fallbackPolicy === 'allowAlways' ? 'allowAlways' : fallbackPolicy === 'lowVolumeOnly' ? 'lowVolumeOnly' : undefined;
}

function normalizeWorkerPrewarm(prewarm: boolean | undefined): boolean | undefined {
  return prewarm === true ? true : prewarm === false ? false : undefined;
}

function cloneWorkerAssetUrls(
  assetUrls?: GridWorkerRuntimeOptions['assetUrls']
): GridWorkerRuntimeOptions['assetUrls'] | undefined {
  if (!assetUrls || typeof assetUrls !== 'object') {
    return undefined;
  }

  return {
    sort: normalizeOptionalLocale(assetUrls.sort),
    filter: normalizeOptionalLocale(assetUrls.filter),
    group: normalizeOptionalLocale(assetUrls.group),
    pivot: normalizeOptionalLocale(assetUrls.pivot),
    tree: normalizeOptionalLocale(assetUrls.tree)
  };
}

function cloneWorkerRuntimeOptions(workerRuntime?: GridWorkerRuntimeOptions): GridWorkerRuntimeOptions | undefined {
  if (!workerRuntime) {
    return undefined;
  }

  return {
    enabled: workerRuntime.enabled !== false,
    assetBaseUrl: normalizeWorkerAssetBaseUrl(workerRuntime.assetBaseUrl),
    assetUrls: cloneWorkerAssetUrls(workerRuntime.assetUrls),
    timeoutMs: normalizeWorkerTimeoutMs(workerRuntime.timeoutMs),
    largeDataThreshold: normalizeWorkerLargeDataThreshold(workerRuntime.largeDataThreshold),
    poolSize: normalizeWorkerPoolSize(workerRuntime.poolSize),
    fallbackPolicy: normalizeWorkerFallbackPolicy(workerRuntime.fallbackPolicy),
    prewarm: normalizeWorkerPrewarm(workerRuntime.prewarm)
  };
}

function mergeWorkerRuntimeOptions(
  currentOptions: GridWorkerRuntimeOptions | undefined,
  nextOptions: GridConfig['workerRuntime']
): GridWorkerRuntimeOptions | undefined {
  if (!nextOptions) {
    return cloneWorkerRuntimeOptions(currentOptions);
  }

  const base = cloneWorkerRuntimeOptions(currentOptions) ?? {
    enabled: true,
    assetBaseUrl: undefined,
    assetUrls: undefined,
    timeoutMs: DEFAULT_WORKER_TIMEOUT_MS,
    largeDataThreshold: DEFAULT_WORKER_LARGE_DATA_THRESHOLD,
    poolSize: 1,
    fallbackPolicy: 'lowVolumeOnly' as GridWorkerFallbackPolicy,
    prewarm: false
  };

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'enabled')) {
    base.enabled = nextOptions.enabled === true;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'assetBaseUrl')) {
    base.assetBaseUrl = normalizeWorkerAssetBaseUrl(nextOptions.assetBaseUrl);
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'assetUrls')) {
    base.assetUrls = cloneWorkerAssetUrls(nextOptions.assetUrls);
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'timeoutMs')) {
    base.timeoutMs = normalizeWorkerTimeoutMs(nextOptions.timeoutMs) ?? DEFAULT_WORKER_TIMEOUT_MS;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'largeDataThreshold')) {
    base.largeDataThreshold =
      normalizeWorkerLargeDataThreshold(nextOptions.largeDataThreshold) ?? DEFAULT_WORKER_LARGE_DATA_THRESHOLD;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'poolSize')) {
    base.poolSize = normalizeWorkerPoolSize(nextOptions.poolSize) ?? 1;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'fallbackPolicy')) {
    base.fallbackPolicy = normalizeWorkerFallbackPolicy(nextOptions.fallbackPolicy) ?? 'lowVolumeOnly';
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'prewarm')) {
    base.prewarm = normalizeWorkerPrewarm(nextOptions.prewarm) ?? false;
  }

  return base;
}

function inferWorkerAssetBaseUrl(): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const scripts = document.getElementsByTagName('script');
  const bundlePattern = /\/grid\.(?:umd(?:\.min)?|esm)\.js(?:[?#].*)?$/;
  for (let index = scripts.length - 1; index >= 0; index -= 1) {
    const script = scripts[index];
    const src = typeof script.src === 'string' ? script.src : '';
    if (!src || !bundlePattern.test(src)) {
      continue;
    }

    try {
      const baseUrl = new URL('.', src).href;
      return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function resolveWorkerAssetUrl(
  workerRuntime: GridWorkerRuntimeOptions | undefined,
  operationType: 'sort' | 'filter' | 'group' | 'pivot' | 'tree'
): string | undefined {
  const explicitUrl = workerRuntime?.assetUrls?.[operationType];
  if (typeof explicitUrl === 'string' && explicitUrl.length > 0) {
    return explicitUrl;
  }

  const assetBaseUrl = normalizeWorkerAssetBaseUrl(workerRuntime?.assetBaseUrl) ?? inferWorkerAssetBaseUrl();
  if (!assetBaseUrl) {
    return undefined;
  }

  return `${assetBaseUrl}/${operationType}.worker.js`;
}

function cloneSanitizeHtmlHook(sanitizeHtml?: UnsafeHtmlSanitizer): UnsafeHtmlSanitizer | undefined {
  return typeof sanitizeHtml === 'function' ? sanitizeHtml : undefined;
}

function cloneAuditLogHook(onAuditLog?: EditCommitAuditLogger): EditCommitAuditLogger | undefined {
  return typeof onAuditLog === 'function' ? onAuditLog : undefined;
}

function cloneGroupingOptions(grouping?: GridOptions['grouping']): GridOptions['grouping'] {
  if (!grouping) {
    return undefined;
  }

  return {
    mode: grouping.mode === 'server' ? 'server' : 'client',
    groupModel: cloneGroupModel(grouping.groupModel),
    aggregations: cloneGroupAggregations(grouping.aggregations),
    defaultExpanded: grouping.defaultExpanded !== false
  };
}

function mergeGroupingOptions(
  currentOptions: GridOptions['grouping'],
  nextOptions: GridConfig['grouping']
): GridOptions['grouping'] {
  if (!nextOptions) {
    return currentOptions ? cloneGroupingOptions(currentOptions) : undefined;
  }

  const base = cloneGroupingOptions(currentOptions) ?? {
    mode: 'client' as GroupingMode,
    groupModel: [],
    aggregations: [],
    defaultExpanded: true
  };

  if (nextOptions.mode === 'client' || nextOptions.mode === 'server') {
    base.mode = nextOptions.mode;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'groupModel')) {
    base.groupModel = cloneGroupModel(nextOptions.groupModel);
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'aggregations')) {
    base.aggregations = cloneGroupAggregations(nextOptions.aggregations);
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'defaultExpanded')) {
    base.defaultExpanded = nextOptions.defaultExpanded !== false;
  }

  return base;
}

function clonePivotingOptions(pivoting?: PivotingOptions): PivotingOptions | undefined {
  if (!pivoting) {
    return undefined;
  }

  return {
    mode: pivoting.mode === 'server' ? 'server' : 'client',
    pivotModel: clonePivotModel(pivoting.pivotModel),
    values: clonePivotValues(pivoting.values)
  };
}

function mergePivotingOptions(
  currentOptions: GridOptions['pivoting'],
  nextOptions: GridConfig['pivoting']
): GridOptions['pivoting'] {
  if (!nextOptions) {
    return currentOptions ? clonePivotingOptions(currentOptions) : undefined;
  }

  const base = clonePivotingOptions(currentOptions) ?? {
    mode: 'client' as PivotingMode,
    pivotModel: [],
    values: []
  };

  if (nextOptions.mode === 'client' || nextOptions.mode === 'server') {
    base.mode = nextOptions.mode;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'pivotModel')) {
    base.pivotModel = clonePivotModel(nextOptions.pivotModel);
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'values')) {
    base.values = clonePivotValues(nextOptions.values);
  }

  return base;
}

function getTreeFieldName(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function cloneTreeDataOptions(treeData?: TreeDataOptions): TreeDataOptions | undefined {
  if (!treeData) {
    return undefined;
  }

  return {
    enabled: treeData.enabled === true,
    mode: treeData.mode === 'server' ? 'server' : 'client',
    idField: getTreeFieldName(treeData.idField, 'id'),
    parentIdField: getTreeFieldName(treeData.parentIdField, 'parentId'),
    hasChildrenField: getTreeFieldName(treeData.hasChildrenField, 'hasChildren'),
    treeColumnId: getTreeFieldName(treeData.treeColumnId, ''),
    defaultExpanded: treeData.defaultExpanded === true,
    rootParentValue: treeData.rootParentValue === undefined ? null : treeData.rootParentValue,
    loadChildren: typeof treeData.loadChildren === 'function' ? treeData.loadChildren : undefined
  };
}

function mergeTreeDataOptions(currentOptions: TreeDataOptions | undefined, nextOptions: TreeDataOptions | undefined): TreeDataOptions {
  const base: TreeDataOptions = cloneTreeDataOptions(currentOptions) ?? {
    enabled: false,
    mode: 'client',
    idField: 'id',
    parentIdField: 'parentId',
    hasChildrenField: 'hasChildren',
    treeColumnId: '',
    defaultExpanded: false,
    rootParentValue: null,
    loadChildren: undefined
  };

  if (!nextOptions) {
    return base;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'enabled')) {
    base.enabled = nextOptions.enabled === true;
  }

  if (nextOptions.mode === 'client' || nextOptions.mode === 'server') {
    base.mode = nextOptions.mode;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'idField')) {
    base.idField = getTreeFieldName(nextOptions.idField, 'id');
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'parentIdField')) {
    base.parentIdField = getTreeFieldName(nextOptions.parentIdField, 'parentId');
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'hasChildrenField')) {
    base.hasChildrenField = getTreeFieldName(nextOptions.hasChildrenField, 'hasChildren');
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'treeColumnId')) {
    base.treeColumnId = getTreeFieldName(nextOptions.treeColumnId, '');
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'defaultExpanded')) {
    base.defaultExpanded = nextOptions.defaultExpanded === true;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'rootParentValue')) {
    base.rootParentValue = nextOptions.rootParentValue === undefined ? null : nextOptions.rootParentValue;
  }

  if (Object.prototype.hasOwnProperty.call(nextOptions, 'loadChildren')) {
    base.loadChildren = typeof nextOptions.loadChildren === 'function' ? nextOptions.loadChildren : undefined;
  }

  return base;
}

function clampIndicatorWidth(width: number): number {
  return Math.max(MIN_INDICATOR_WIDTH, Math.min(MAX_INDICATOR_WIDTH, Math.round(width)));
}

function resolveIndicatorWidth(optionWidth: number | undefined, fallbackWidth: number): number {
  const width = Number(optionWidth);
  if (Number.isFinite(width)) {
    return clampIndicatorWidth(width);
  }

  return clampIndicatorWidth(fallbackWidth);
}

function normalizeSpecialColumns(columns: ColumnDef[], rowIndicatorOptions?: RowIndicatorOptions): ColumnDef[] {
  const normalizedColumns = new Array<ColumnDef>(columns.length);

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const column = columns[columnIndex];
    if (column.id === LEGACY_INDICATOR_COLUMN_ID || column.id === INDICATOR_CHECKBOX_COLUMN_ID) {
      const indicatorWidth = resolveIndicatorWidth(rowIndicatorOptions?.width, column.width ?? DEFAULT_INDICATOR_CHECKBOX_WIDTH);
      normalizedColumns[columnIndex] = {
        ...column,
        pinned: 'left',
        width: indicatorWidth,
        minWidth: indicatorWidth,
        maxWidth: indicatorWidth
      };
      continue;
    }

    if (column.id === INDICATOR_ROW_NUMBER_COLUMN_ID) {
      const indicatorWidth = resolveIndicatorWidth(undefined, column.width ?? DEFAULT_INDICATOR_ROW_NUMBER_WIDTH);
      normalizedColumns[columnIndex] = {
        ...column,
        pinned: 'left',
        width: indicatorWidth,
        minWidth: indicatorWidth,
        maxWidth: indicatorWidth
      };
      continue;
    }

    if (column.id === INDICATOR_STATUS_COLUMN_ID) {
      const indicatorWidth = resolveIndicatorWidth(undefined, column.width ?? DEFAULT_INDICATOR_STATUS_WIDTH);
      normalizedColumns[columnIndex] = {
        ...column,
        pinned: 'left',
        width: indicatorWidth
      };
      continue;
    }

    if (column.id === STATE_COLUMN_ID) {
      const stateWidth = Number.isFinite(column.width) ? Math.max(52, Math.round(column.width)) : DEFAULT_STATE_COLUMN_WIDTH;
      normalizedColumns[columnIndex] = {
        ...column,
        pinned: 'left',
        width: stateWidth
      };
      continue;
    }

    normalizedColumns[columnIndex] = {
      ...column
    };
  }

  return normalizedColumns;
}

function cloneColumnGroup(group: ColumnGroupDef): ColumnGroupDef {
  const children = Array.isArray(group.children) ? group.children : [];
  const clonedChildren: Array<string | ColumnGroupDef> = [];
  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex];
    if (typeof child === 'string') {
      clonedChildren.push(child);
      continue;
    }

    if (child && typeof child === 'object') {
      clonedChildren.push(cloneColumnGroup(child));
    }
  }

  return {
    groupId: String(group.groupId),
    header: String(group.header),
    children: clonedChildren,
    collapsed: group.collapsed === true
  };
}

function cloneColumns(columns: ColumnDef[]): ColumnDef[] {
  const clonedColumns: ColumnDef[] = new Array<ColumnDef>(columns.length);
  for (let index = 0; index < columns.length; index += 1) {
    clonedColumns[index] = { ...columns[index] };
  }

  return clonedColumns;
}

function cloneColumnGroups(columnGroups?: ColumnGroupDef[]): ColumnGroupDef[] | undefined {
  if (!Array.isArray(columnGroups)) {
    return undefined;
  }

  const clonedGroups: ColumnGroupDef[] = [];
  for (let groupIndex = 0; groupIndex < columnGroups.length; groupIndex += 1) {
    const group = columnGroups[groupIndex];
    if (!group || typeof group !== 'object') {
      continue;
    }

    clonedGroups.push(cloneColumnGroup(group));
  }

  return clonedGroups;
}

function normalizeOptions(config?: GridConfig): GridOptions {
  const dataProvider = config?.dataProvider ?? new LocalDataProvider(config?.rowData ?? []);
  const rowModel = new RowModel(dataProvider.getRowCount(), config?.rowModelOptions);
  const rowIndicator = mergeRowIndicatorOptions(undefined, config?.rowIndicator);

  return {
    columns: normalizeSpecialColumns(config?.columns ?? [], rowIndicator),
    columnGroups: cloneColumnGroups(config?.columnGroups),
    grouping: mergeGroupingOptions(undefined, config?.grouping),
    pivoting: mergePivotingOptions(undefined, config?.pivoting),
    treeData: mergeTreeDataOptions(undefined, config?.treeData),
    dataProvider,
    rowModel,
    locale: normalizeOptionalLocale(config?.locale),
    localeText: cloneLocaleText(config?.localeText),
    styleNonce: normalizeStyleNonce(config?.styleNonce),
    sanitizeHtml: cloneSanitizeHtmlHook(config?.sanitizeHtml),
    onAuditLog: cloneAuditLogHook(config?.onAuditLog),
    rtl: config?.rtl === true,
    numberFormatOptions: cloneNumberFormatOptions(config?.numberFormatOptions),
    dateTimeFormatOptions: cloneDateTimeFormatOptions(config?.dateTimeFormatOptions),
    height: config?.height,
    rowHeight: config?.rowHeight,
    rowHeightMode: config?.rowHeightMode,
    estimatedRowHeight: config?.estimatedRowHeight,
    getRowHeight: config?.getRowHeight,
    validateEdit: config?.validateEdit,
    overscan: config?.overscan,
    overscanCols: config?.overscanCols,
    scrollbarPolicy: mergeScrollbarPolicy(DEFAULT_SCROLLBAR_POLICY, config?.scrollbarPolicy),
    rowIndicator,
    stateColumn: mergeStateColumnOptions(undefined, config?.stateColumn),
    workerRuntime: mergeWorkerRuntimeOptions(undefined, config?.workerRuntime)
  };
}

function createIdentityMapping(rowCount: number): Int32Array {
  const mapping = new Int32Array(Math.max(0, rowCount));
  for (let index = 0; index < mapping.length; index += 1) {
    mapping[index] = index;
  }
  return mapping;
}

function reuseViewToDataMapping(mapping: ViewToDataMapping): Int32Array {
  return mapping instanceof Int32Array ? mapping : Int32Array.from(mapping);
}

export class Grid {
  private options: GridOptions;
  private sourceDataProvider: GridOptions['dataProvider'];
  private groupedDataProvider: GroupedDataProvider | null = null;
  private pivotDataProvider: LocalDataProvider | null = null;
  private treeDataProvider: TreeDataProvider | null = null;
  private readonly columnModel: ColumnModel;
  private readonly rowModel: RowModel;
  private readonly eventBus: EventBus;
  private readonly renderer: GridRendererPort;
  private readonly sortExecutor: WorkerBackedExecutor<SortExecutor>;
  private readonly filterExecutor: WorkerBackedExecutor<FilterExecutor>;
  private readonly groupExecutor: WorkerBackedExecutor<GroupExecutor>;
  private readonly pivotExecutor: WorkerBackedExecutor<PivotExecutor>;
  private readonly treeExecutor: WorkerBackedExecutor<TreeExecutor>;
  private readonly commandEventService = new GridCommandEventService();
  private readonly dataPipelineService = new GridDataPipelineService();
  private readonly exportService = new GridExportService();
  private readonly providerLifecycleService = new GridProviderLifecycleService();
  private readonly stateService = new GridStateService();
  private readonly remoteQueryService = new GridRemoteQueryService();
  private sortModel: SortModelItem[] = [];
  private filterModel: GridFilterModel = {};
  private groupModel: GroupModelItem[] = [];
  private groupAggregations: GroupAggregationDef[] = [];
  private groupingMode: GroupingMode = 'client';
  private groupDefaultExpanded = true;
  private groupExpansionState: Record<string, boolean> = {};
  private groupRows: GroupViewRow[] = [];
  private groupKeys: string[] = [];
  private pivotModel: PivotModelItem[] = [];
  private pivotValues: PivotValueDef[] = [];
  private pivotingMode: PivotingMode = 'client';
  private pivotColumns: ColumnDef[] = [];
  private baseColumnsBeforeClientPivot: ColumnDef[] | null = null;
  private treeDataOptions: TreeDataOptions = mergeTreeDataOptions(undefined, undefined);
  private treeMode: TreeDataMode = 'client';
  private treeExpansionState: Record<string, boolean> = {};
  private treeRows: TreeExecutionResult['rows'] = [];
  private treeNodeKeys: RowKey[] = [];
  private treeNodeKeyTokens: string[] = [];
  private treeLazyChildrenByParent = new Map<string, { parentNodeKey: RowKey; rows: GridRowData[] }>();
  private treeLazyRowsByRef = new Map<string, GridRowData>();
  private treeLoadingParents = new Set<string>();
  private treeLoadOperationToken = 0;
  private sortOperationToken = 0;
  private filterOperationToken = 0;
  private groupOperationToken = 0;
  private pivotOperationToken = 0;
  private treeOperationToken = 0;
  private sortMapping: Int32Array | null = null;
  private filterMapping: Int32Array | null = null;
  private dataProviderUnsubscribe: (() => void) | null = null;
  private commandEventUnsubscribe: (() => void) | null = null;
  private columnValueFormatContext: ColumnValueFormatContext | null = null;
  private readonly workerProjectionCache = new WorkerProjectionCache();

  public constructor(container: HTMLElement, config?: GridConfig) {
    const normalizedOptions = normalizeOptions(config);
    this.rowModel = normalizedOptions.rowModel;
    this.columnModel = new ColumnModel(normalizedOptions.columns);
    this.sourceDataProvider = normalizedOptions.dataProvider;
    this.options = {
      ...normalizedOptions,
      columns: this.columnModel.getColumns()
    };
    this.rebuildColumnValueFormatContext();
    this.eventBus = new EventBus();
    this.commandEventUnsubscribe = this.commandEventService.register({
      eventBus: this.eventBus,
      hasColumn: (columnId) => this.columnModel.getColumns().some((column) => column.id === columnId),
      setColumnWidth: (columnId, width) => {
        this.columnModel.setColumnWidth(columnId, width);
      },
      setColumnOrder: (columnOrder) => {
        this.columnModel.setColumnOrder(columnOrder);
      },
      syncColumnsToRenderer: () => {
        this.syncColumnsToRenderer();
      },
      isTreeDataActive: () => this.hasActiveTreeData(),
      isClientGroupingActive: () => this.hasActiveClientGrouping(),
      getDataProvider: () => this.options.dataProvider,
      getTreeColumnId: () => this.treeDataOptions.treeColumnId ?? '',
      toggleGroupExpanded: (groupKey) => this.toggleGroupExpanded(groupKey),
      toggleTreeExpanded: (nodeKey) => this.toggleTreeExpanded(nodeKey),
      applyGroupingView: () => this.applyGroupingViewInternal(),
      applyTreeView: () => this.applyTreeViewInternal(),
      invalidateWorkerProjectionCache: () => {
        this.invalidateWorkerProjectionCache();
      },
      getAuditLogHook: () => this.options.onAuditLog
    });
    this.sortExecutor = new WorkerOperationDispatcher({
      operationType: 'sort',
      fallbackExecutor: new CooperativeSortExecutor(),
      serializeRequest: (request) =>
        serializeSortExecutionRequestAsync(request, {
          projectionCache: this.workerProjectionCache
        }),
      getRuntimeOptions: () => ({
        enabled: this.options.workerRuntime?.enabled,
        assetUrl: resolveWorkerAssetUrl(this.options.workerRuntime, 'sort'),
        timeoutMs: this.options.workerRuntime?.timeoutMs,
        largeDataThreshold: this.options.workerRuntime?.largeDataThreshold,
        poolSize: this.options.workerRuntime?.poolSize,
        allowMainThreadFallback: this.options.workerRuntime?.fallbackPolicy === 'allowAlways'
      })
    });
    this.filterExecutor = new WorkerOperationDispatcher({
      operationType: 'filter',
      fallbackExecutor: new CooperativeFilterExecutor(),
      serializeRequest: (request) =>
        serializeFilterExecutionRequestAsync(request, {
          projectionCache: this.workerProjectionCache
        }),
      getRuntimeOptions: () => ({
        enabled: this.options.workerRuntime?.enabled,
        assetUrl: resolveWorkerAssetUrl(this.options.workerRuntime, 'filter'),
        timeoutMs: this.options.workerRuntime?.timeoutMs,
        largeDataThreshold: this.options.workerRuntime?.largeDataThreshold,
        poolSize: this.options.workerRuntime?.poolSize,
        allowMainThreadFallback: this.options.workerRuntime?.fallbackPolicy === 'allowAlways'
      })
    });
    this.groupExecutor = new WorkerOperationDispatcher({
      operationType: 'group',
      fallbackExecutor: new CooperativeGroupExecutor(),
      serializeRequest: (request) =>
        serializeGroupExecutionRequestAsync(request, {
          projectionCache: this.workerProjectionCache
        }),
      getRuntimeOptions: () => ({
        enabled: this.options.workerRuntime?.enabled,
        assetUrl: resolveWorkerAssetUrl(this.options.workerRuntime, 'group'),
        timeoutMs: this.options.workerRuntime?.timeoutMs,
        largeDataThreshold: this.options.workerRuntime?.largeDataThreshold,
        poolSize: this.options.workerRuntime?.poolSize,
        allowMainThreadFallback: this.options.workerRuntime?.fallbackPolicy === 'allowAlways'
      })
    });
    this.pivotExecutor = new WorkerOperationDispatcher({
      operationType: 'pivot',
      fallbackExecutor: new CooperativePivotExecutor(),
      serializeRequest: (request) =>
        serializePivotExecutionRequestAsync(request, {
          projectionCache: this.workerProjectionCache
        }),
      getRuntimeOptions: () => ({
        enabled: this.options.workerRuntime?.enabled,
        assetUrl: resolveWorkerAssetUrl(this.options.workerRuntime, 'pivot'),
        timeoutMs: this.options.workerRuntime?.timeoutMs,
        largeDataThreshold: this.options.workerRuntime?.largeDataThreshold,
        poolSize: this.options.workerRuntime?.poolSize,
        allowMainThreadFallback: this.options.workerRuntime?.fallbackPolicy === 'allowAlways'
      })
    });
    this.treeExecutor = new WorkerOperationDispatcher({
      operationType: 'tree',
      fallbackExecutor: new CooperativeTreeExecutor(),
      serializeRequest: serializeTreeExecutionRequestAsync,
      getRuntimeOptions: () => ({
        enabled: this.options.workerRuntime?.enabled,
        assetUrl: resolveWorkerAssetUrl(this.options.workerRuntime, 'tree'),
        timeoutMs: this.options.workerRuntime?.timeoutMs,
        largeDataThreshold: this.options.workerRuntime?.largeDataThreshold,
        poolSize: this.options.workerRuntime?.poolSize,
        allowMainThreadFallback: this.options.workerRuntime?.fallbackPolicy === 'allowAlways'
      })
    });
    this.groupModel = this.normalizeGroupModel(this.options.grouping?.groupModel ?? []);
    this.groupAggregations = this.normalizeGroupAggregations(this.options.grouping?.aggregations ?? []);
    this.groupingMode = this.options.grouping?.mode === 'server' ? 'server' : 'client';
    this.groupDefaultExpanded = this.options.grouping?.defaultExpanded !== false;
    this.pivotModel = this.normalizePivotModel(this.options.pivoting?.pivotModel ?? []);
    this.pivotValues = this.normalizePivotValues(this.options.pivoting?.values ?? []);
    this.pivotingMode = this.options.pivoting?.mode === 'server' ? 'server' : 'client';
    this.treeDataOptions = this.normalizeTreeDataOptions(mergeTreeDataOptions(undefined, this.options.treeData));
    this.treeMode = this.treeDataOptions.mode === 'server' ? 'server' : 'client';
    this.renderer = new DomRenderer(container, this.getRendererOptions(), this.eventBus);
    this.prewarmWorkerExecutors();
    this.dataProviderUnsubscribe = this.providerLifecycleService.rebindRowsChangedListener({
      dataProvider: this.sourceDataProvider,
      currentUnsubscribe: this.dataProviderUnsubscribe,
      onRowsChanged: this.handleDataProviderRowsChanged
    });
    void this.rebuildDerivedView();
  }

  public setColumns(columns: ColumnDef[]): void {
    this.invalidateWorkerProjectionCache();
    const normalizedColumns = normalizeSpecialColumns(columns, this.options.rowIndicator);
    if (this.hasActiveClientPivot()) {
      this.baseColumnsBeforeClientPivot = cloneColumns(normalizedColumns);
    } else {
      this.columnModel.setColumns(normalizedColumns);
      this.syncColumnsToRenderer();
      this.baseColumnsBeforeClientPivot = null;
      this.pivotColumns = [];
    }

    this.groupModel = this.normalizeGroupModel(this.groupModel);
    this.groupAggregations = this.normalizeGroupAggregations(this.groupAggregations);
    this.pivotModel = this.normalizePivotModel(this.pivotModel);
    this.pivotValues = this.normalizePivotValues(this.pivotValues);
    this.treeDataOptions = this.normalizeTreeDataOptions(this.treeDataOptions);
    this.options = {
      ...this.options,
      pivoting: {
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      },
      treeData: this.treeDataOptions
    };
    void this.rebuildDerivedView();
  }

  public setOptions(options: GridConfig): void {
    const nextRowIndicator = mergeRowIndicatorOptions(this.options.rowIndicator, options.rowIndicator);
    const nextStateColumn = mergeStateColumnOptions(this.options.stateColumn, options.stateColumn);
    const nextGrouping = mergeGroupingOptions(this.options.grouping, options.grouping);
    const nextPivoting = mergePivotingOptions(this.options.pivoting, options.pivoting);
    const nextWorkerRuntime = mergeWorkerRuntimeOptions(this.options.workerRuntime, options.workerRuntime);
    const mergedTreeData = mergeTreeDataOptions(this.treeDataOptions, options.treeData);
    const hasLocaleOption = Object.prototype.hasOwnProperty.call(options, 'locale');
    const hasLocaleTextOption = Object.prototype.hasOwnProperty.call(options, 'localeText');
    const hasStyleNonceOption = Object.prototype.hasOwnProperty.call(options, 'styleNonce');
    const hasSanitizeHtmlOption = Object.prototype.hasOwnProperty.call(options, 'sanitizeHtml');
    const hasAuditLogHookOption = Object.prototype.hasOwnProperty.call(options, 'onAuditLog');
    const hasRtlOption = Object.prototype.hasOwnProperty.call(options, 'rtl');
    const hasNumberFormatOption = Object.prototype.hasOwnProperty.call(options, 'numberFormatOptions');
    const hasDateTimeFormatOption = Object.prototype.hasOwnProperty.call(options, 'dateTimeFormatOptions');
    const nextLocale = hasLocaleOption ? normalizeOptionalLocale(options.locale) : this.options.locale;
    const nextLocaleText = hasLocaleTextOption ? cloneLocaleText(options.localeText) : cloneLocaleText(this.options.localeText);
    const nextStyleNonce = hasStyleNonceOption ? normalizeStyleNonce(options.styleNonce) : this.options.styleNonce;
    const nextSanitizeHtml = hasSanitizeHtmlOption
      ? cloneSanitizeHtmlHook(options.sanitizeHtml)
      : cloneSanitizeHtmlHook(this.options.sanitizeHtml);
    const nextAuditLogHook = hasAuditLogHookOption
      ? cloneAuditLogHook(options.onAuditLog)
      : cloneAuditLogHook(this.options.onAuditLog);
    const nextRtl = hasRtlOption ? options.rtl === true : this.options.rtl;
    const nextNumberFormatOptions = hasNumberFormatOption
      ? cloneNumberFormatOptions(options.numberFormatOptions)
      : cloneNumberFormatOptions(this.options.numberFormatOptions);
    const nextDateTimeFormatOptions = hasDateTimeFormatOption
      ? cloneDateTimeFormatOptions(options.dateTimeFormatOptions)
      : cloneDateTimeFormatOptions(this.options.dateTimeFormatOptions);

    if (options.columns || options.rowIndicator) {
      this.invalidateWorkerProjectionCache();
      const sourceColumns = options.columns ?? (this.baseColumnsBeforeClientPivot ?? this.columnModel.getColumns());
      const normalizedColumns = normalizeSpecialColumns(sourceColumns, nextRowIndicator);
      if (this.hasActiveClientPivot()) {
        this.baseColumnsBeforeClientPivot = cloneColumns(normalizedColumns);
      } else {
        this.columnModel.setColumns(normalizedColumns);
      }
    }

    const hasProviderOption = Boolean(options.dataProvider || options.rowData);
    const nextDataProvider = hasProviderOption
      ? options.dataProvider ?? new LocalDataProvider(options.rowData ?? [])
      : this.sourceDataProvider;

    if (hasProviderOption) {
      this.invalidateWorkerProjectionCache();
      const providerReplacement = this.providerLifecycleService.replaceDataProvider(
        this.sourceDataProvider,
        nextDataProvider
      );
      if (providerReplacement.shouldResetOperationTokens) {
        this.sortOperationToken += 1;
        this.filterOperationToken += 1;
        this.groupOperationToken += 1;
        this.pivotOperationToken += 1;
        this.treeOperationToken += 1;
      }
      if (providerReplacement.shouldResetMappings) {
        this.sortMapping = null;
        this.filterMapping = null;
      }
      if (providerReplacement.shouldResetDerivedArtifacts) {
        this.clearDerivedViewArtifacts();
      }
      if (providerReplacement.shouldResetExpansionState) {
        this.groupExpansionState = {};
        this.treeExpansionState = {};
      }
      if (providerReplacement.shouldResetTreeCaches) {
        this.clearTreeLazyCaches();
      }
      this.sourceDataProvider = providerReplacement.dataProvider;
      this.rowModel.setRowCount(providerReplacement.rowCount);
      if (providerReplacement.shouldRebind) {
        this.dataProviderUnsubscribe = this.providerLifecycleService.rebindRowsChangedListener({
          dataProvider: this.sourceDataProvider,
          currentUnsubscribe: this.dataProviderUnsubscribe,
          onRowsChanged: this.handleDataProviderRowsChanged
        });
      }
    }

    if (options.rowModelOptions) {
      this.rowModel.setOptions(options.rowModelOptions);
    }

    this.groupingMode = nextGrouping?.mode === 'server' ? 'server' : 'client';
    this.groupDefaultExpanded = nextGrouping?.defaultExpanded !== false;
    this.groupModel = this.normalizeGroupModel(nextGrouping?.groupModel ?? this.groupModel);
    this.groupAggregations = this.normalizeGroupAggregations(nextGrouping?.aggregations ?? this.groupAggregations);
    this.pivotingMode = nextPivoting?.mode === 'server' ? 'server' : 'client';
    this.pivotModel = this.normalizePivotModel(nextPivoting?.pivotModel ?? this.pivotModel);
    this.pivotValues = this.normalizePivotValues(nextPivoting?.values ?? this.pivotValues);
    this.treeDataOptions = this.normalizeTreeDataOptions(mergedTreeData);
    this.treeMode = this.treeDataOptions.mode === 'server' ? 'server' : 'client';

    this.options = {
      ...this.options,
      locale: nextLocale,
      localeText: nextLocaleText,
      styleNonce: nextStyleNonce,
      sanitizeHtml: nextSanitizeHtml,
      onAuditLog: nextAuditLogHook,
      rtl: nextRtl,
      numberFormatOptions: nextNumberFormatOptions,
      dateTimeFormatOptions: nextDateTimeFormatOptions,
      height: options.height ?? this.options.height,
      rowHeight: options.rowHeight ?? this.options.rowHeight,
      rowHeightMode: options.rowHeightMode ?? this.options.rowHeightMode,
      estimatedRowHeight: options.estimatedRowHeight ?? this.options.estimatedRowHeight,
      getRowHeight: options.getRowHeight ?? this.options.getRowHeight,
      validateEdit: options.validateEdit ?? this.options.validateEdit,
      overscan: options.overscan ?? this.options.overscan,
      overscanCols: options.overscanCols ?? this.options.overscanCols,
      scrollbarPolicy: mergeScrollbarPolicy(this.options.scrollbarPolicy, options.scrollbarPolicy),
      rowIndicator: nextRowIndicator,
      stateColumn: nextStateColumn,
      columnGroups: options.columnGroups ? cloneColumnGroups(options.columnGroups) : this.options.columnGroups,
      grouping: nextGrouping,
      pivoting: {
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      },
      treeData: this.treeDataOptions,
      workerRuntime: nextWorkerRuntime,
      dataProvider: this.sourceDataProvider,
      rowModel: this.rowModel,
      columns: this.columnModel.getColumns()
    };
    this.rebuildColumnValueFormatContext();
    this.prewarmWorkerExecutors();

    void this.rebuildDerivedView();
  }

  public setRowOrder(viewToData: ViewToDataMapping): void {
    this.rowModel.setBaseViewToData(viewToData);
    this.renderer.refreshDataView();
  }

  public setFilteredRowOrder(viewToData: ViewToDataMapping | null): void {
    this.rowModel.setFilterViewToData(viewToData);
    this.renderer.refreshDataView();
  }

  public resetRowOrder(): void {
    this.rowModel.resetToIdentity(this.sourceDataProvider.getRowCount());
    this.renderer.refreshDataView();
  }

  public setSparseRowOverrides(overrides: SparseRowOverride[]): void {
    this.rowModel.setBaseSparseOverrides(overrides);
    this.renderer.setOptions(this.getRendererOptions());
  }

  public clearSparseRowOverrides(): void {
    this.rowModel.clearBaseSparseOverrides();
    this.renderer.setOptions(this.getRendererOptions());
  }

  public setRowModelOptions(options: RowModelOptions): void {
    this.rowModel.setOptions(options);
  }

  public getRowModelState(): RowModelState {
    return this.rowModel.getState();
  }

  public getSortModel(): SortModelItem[] {
    return this.sortModel.map((item) => ({
      columnId: item.columnId,
      direction: item.direction
    }));
  }

  public async setSortModel(sortModel: SortModelItem[]): Promise<void> {
    const normalizedSortModel = this.normalizeSortModel(sortModel);
    this.sortModel = normalizedSortModel;
    if (this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider)) {
      this.sortOperationToken += 1;
      this.filterOperationToken += 1;
      this.groupOperationToken += 1;
      this.pivotOperationToken += 1;
      this.sortMapping = null;
      this.filterMapping = null;
      this.syncRemoteProviderQueryState();
      this.clearDerivedViewArtifacts();
      this.renderer.setOptions(this.getRendererOptions());
      return;
    }

    const rowCount = this.sourceDataProvider.getRowCount();
    this.filterOperationToken += 1;
    this.groupOperationToken += 1;
    this.pivotOperationToken += 1;
    const operationToken = ++this.sortOperationToken;
    const opId = `sort-${operationToken}`;

    if (normalizedSortModel.length === 0 || rowCount <= 0) {
      this.sortMapping = null;
      if (this.hasActiveFilterModel() && rowCount > 0) {
        await this.applyFilterModelInternal();
      } else {
        this.filterMapping = null;
        if (this.canUseLightweightFlatRendererRefresh()) {
          this.applyFlatViewAndRefreshRenderer();
        } else {
          await this.applyDerivedViewToRenderer();
        }
      }
      return;
    }

    const response = await this.sortExecutor.execute(
      {
        opId,
        rowCount,
        sortModel: normalizedSortModel,
        columns: this.getSchemaColumnsForModelNormalization(),
        dataProvider: this.sourceDataProvider
      },
      {
        isCanceled: () => operationToken !== this.sortOperationToken
      }
    );

    if (operationToken !== this.sortOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.sortMapping = reuseViewToDataMapping(response.result.mapping);
    if (this.hasActiveFilterModel()) {
      await this.applyFilterModelInternal();
    } else {
      this.filterMapping = null;
      await this.yieldAfterLargeWorkerResult(rowCount);
      if (this.canUseLightweightFlatRendererRefresh()) {
        this.applyFlatViewAndRefreshRenderer();
      } else {
        await this.applyDerivedViewToRenderer();
      }
    }
  }

  public async clearSortModel(): Promise<void> {
    await this.setSortModel([]);
  }

  public getFilterModel(): GridFilterModel {
    return this.cloneFilterModel(this.filterModel);
  }

  public async setFilterModel(filterModel: GridFilterModel): Promise<void> {
    this.filterModel = this.normalizeFilterModel(filterModel);
    if (this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider)) {
      this.sortMapping = null;
      this.filterMapping = null;
      this.sortOperationToken += 1;
      this.filterOperationToken += 1;
      this.groupOperationToken += 1;
      this.pivotOperationToken += 1;
      this.syncRemoteProviderQueryState();
      this.clearDerivedViewArtifacts();
      this.renderer.setOptions(this.getRendererOptions());
      return;
    }

    await this.applyFilterModelInternal();
  }

  public async clearFilterModel(): Promise<void> {
    await this.setFilterModel({});
  }

  public getGroupModel(): GroupModelItem[] {
    return cloneGroupModel(this.groupModel);
  }

  public async setGroupModel(groupModel: GroupModelItem[]): Promise<void> {
    this.groupModel = this.normalizeGroupModel(groupModel);
    this.groupExpansionState = {};
    this.options = {
      ...this.options,
      grouping: {
        ...(this.options.grouping ?? {}),
        mode: this.groupingMode,
        groupModel: cloneGroupModel(this.groupModel),
        aggregations: cloneGroupAggregations(this.groupAggregations),
        defaultExpanded: this.groupDefaultExpanded
      }
    };
    await this.rebuildDerivedView();
  }

  public async clearGroupModel(): Promise<void> {
    await this.setGroupModel([]);
  }

  public getGroupAggregations(): GroupAggregationDef[] {
    return cloneGroupAggregations(this.groupAggregations);
  }

  public async setGroupAggregations(aggregations: GroupAggregationDef[]): Promise<void> {
    this.groupAggregations = this.normalizeGroupAggregations(aggregations);
    this.options = {
      ...this.options,
      grouping: {
        ...(this.options.grouping ?? {}),
        mode: this.groupingMode,
        groupModel: cloneGroupModel(this.groupModel),
        aggregations: cloneGroupAggregations(this.groupAggregations),
        defaultExpanded: this.groupDefaultExpanded
      }
    };
    await this.rebuildDerivedView();
  }

  public getGroupExpansionState(): Record<string, boolean> {
    return cloneGroupExpansionState(this.groupExpansionState);
  }

  public async setGroupExpanded(groupKey: string, expanded: boolean): Promise<void> {
    if (typeof groupKey !== 'string' || groupKey.length === 0) {
      return;
    }

    const nextExpanded = expanded === true;
    const currentExpanded = this.groupExpansionState[groupKey];
    if (currentExpanded === nextExpanded) {
      return;
    }

    this.groupExpansionState[groupKey] = nextExpanded;
    await this.applyGroupingViewInternal();
  }

  public async toggleGroupExpanded(groupKey: string): Promise<void> {
    if (typeof groupKey !== 'string' || groupKey.length === 0) {
      return;
    }

    const currentExpanded = this.groupExpansionState[groupKey];
    const defaultExpanded = this.groupDefaultExpanded;
    await this.setGroupExpanded(groupKey, currentExpanded === undefined ? !defaultExpanded : !currentExpanded);
  }

  public async expandAllGroups(): Promise<void> {
    const nextState: Record<string, boolean> = {};
    for (let index = 0; index < this.groupKeys.length; index += 1) {
      nextState[this.groupKeys[index]] = true;
    }
    this.groupExpansionState = nextState;
    await this.applyGroupingViewInternal();
  }

  public async collapseAllGroups(): Promise<void> {
    const nextState: Record<string, boolean> = {};
    for (let index = 0; index < this.groupKeys.length; index += 1) {
      nextState[this.groupKeys[index]] = false;
    }
    this.groupExpansionState = nextState;
    await this.applyGroupingViewInternal();
  }

  public getGroupingMode(): GroupingMode {
    return this.groupingMode;
  }

  public async setGroupingMode(mode: GroupingMode): Promise<void> {
    const nextMode: GroupingMode = mode === 'server' ? 'server' : 'client';
    if (nextMode === this.groupingMode) {
      return;
    }

    this.groupingMode = nextMode;
    this.options = {
      ...this.options,
      grouping: {
        ...(this.options.grouping ?? {}),
        mode: this.groupingMode,
        groupModel: cloneGroupModel(this.groupModel),
        aggregations: cloneGroupAggregations(this.groupAggregations),
        defaultExpanded: this.groupDefaultExpanded
      }
    };
    await this.rebuildDerivedView();
  }

  public getPivotModel(): PivotModelItem[] {
    return clonePivotModel(this.pivotModel);
  }

  public async setPivotModel(pivotModel: PivotModelItem[]): Promise<void> {
    this.pivotModel = this.normalizePivotModel(pivotModel);
    this.options = {
      ...this.options,
      pivoting: {
        ...(this.options.pivoting ?? {}),
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      }
    };
    await this.rebuildDerivedView();
  }

  public async clearPivotModel(): Promise<void> {
    await this.setPivotModel([]);
  }

  public getPivotValues(): PivotValueDef[] {
    return clonePivotValues(this.pivotValues);
  }

  public async setPivotValues(values: PivotValueDef[]): Promise<void> {
    this.pivotValues = this.normalizePivotValues(values);
    this.options = {
      ...this.options,
      pivoting: {
        ...(this.options.pivoting ?? {}),
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      }
    };
    await this.rebuildDerivedView();
  }

  public getPivotingMode(): PivotingMode {
    return this.pivotingMode;
  }

  public async setPivotingMode(mode: PivotingMode): Promise<void> {
    const nextMode: PivotingMode = mode === 'server' ? 'server' : 'client';
    if (nextMode === this.pivotingMode) {
      return;
    }

    this.pivotingMode = nextMode;
    this.options = {
      ...this.options,
      pivoting: {
        ...(this.options.pivoting ?? {}),
        mode: this.pivotingMode,
        pivotModel: clonePivotModel(this.pivotModel),
        values: clonePivotValues(this.pivotValues)
      }
    };
    await this.rebuildDerivedView();
  }

  public getGroupedRowsSnapshot(): GroupViewRow[] {
    const snapshot = new Array<GroupViewRow>(this.groupRows.length);
    for (let index = 0; index < this.groupRows.length; index += 1) {
      const row = this.groupRows[index];
      if (row.kind === 'data') {
        snapshot[index] = {
          kind: 'data',
          dataIndex: row.dataIndex
        };
        continue;
      }

      snapshot[index] = {
        kind: 'group',
        groupKey: row.groupKey,
        level: row.level,
        columnId: row.columnId,
        value: row.value,
        leafCount: row.leafCount,
        isExpanded: row.isExpanded,
        values: { ...row.values }
      };
    }
    return snapshot;
  }

  public getTreeDataOptions(): TreeDataOptions {
    return mergeTreeDataOptions(undefined, this.treeDataOptions);
  }

  public async setTreeDataOptions(treeData: TreeDataOptions): Promise<void> {
    this.treeDataOptions = this.normalizeTreeDataOptions(mergeTreeDataOptions(this.treeDataOptions, treeData));
    this.treeMode = this.treeDataOptions.mode === 'server' ? 'server' : 'client';
    this.treeExpansionState = {};
    this.clearTreeLazyCaches();
    this.treeDataProvider = null;
    this.options = {
      ...this.options,
      treeData: this.treeDataOptions
    };
    await this.rebuildDerivedView();
  }

  public getTreeExpansionState(): Record<string, boolean> {
    return cloneGroupExpansionState(this.treeExpansionState);
  }

  public async setTreeExpanded(nodeKey: RowKey, expanded: boolean): Promise<void> {
    const nodeToken = toTreeNodeKeyToken(nodeKey);
    const currentExpanded = this.treeExpansionState[nodeToken];
    const nextExpanded = expanded === true;
    if (currentExpanded === nextExpanded) {
      return;
    }

    this.treeExpansionState[nodeToken] = nextExpanded;
    await this.applyTreeViewInternal(nodeKey, nextExpanded);
  }

  public async toggleTreeExpanded(nodeKey: RowKey): Promise<void> {
    const nodeToken = toTreeNodeKeyToken(nodeKey);
    const currentExpanded = this.treeExpansionState[nodeToken];
    const defaultExpanded = this.treeDataOptions.defaultExpanded === true;
    await this.setTreeExpanded(nodeKey, currentExpanded === undefined ? !defaultExpanded : !currentExpanded);
  }

  public async expandAllTreeNodes(): Promise<void> {
    const nextState: Record<string, boolean> = {};
    for (let index = 0; index < this.treeNodeKeyTokens.length; index += 1) {
      nextState[this.treeNodeKeyTokens[index]] = true;
    }
    this.treeExpansionState = nextState;
    await this.applyTreeViewInternal();
  }

  public async collapseAllTreeNodes(): Promise<void> {
    const nextState: Record<string, boolean> = {};
    for (let index = 0; index < this.treeNodeKeyTokens.length; index += 1) {
      nextState[this.treeNodeKeyTokens[index]] = false;
    }
    this.treeExpansionState = nextState;
    await this.applyTreeViewInternal();
  }

  public getTreeRowsSnapshot(): TreeExecutionResult['rows'] {
    return this.treeRows.map((row) => ({
      kind: 'tree',
      nodeKey: row.nodeKey,
      parentNodeKey: row.parentNodeKey,
      sourceDataIndex: row.sourceDataIndex,
      depth: row.depth,
      hasChildren: row.hasChildren,
      isExpanded: row.isExpanded,
      localRow: row.localRow ? { ...row.localRow } : null
    }));
  }

  public setColumnOrder(columnIds: string[]): void {
    this.columnModel.setColumnOrder(columnIds);
    this.syncColumnsToRenderer();
  }

  public setColumnVisibility(columnId: string, isVisible: boolean): void {
    this.columnModel.setColumnVisibility(columnId, isVisible);
    this.syncColumnsToRenderer();
  }

  public setColumnWidth(columnId: string, width: number): void {
    this.columnModel.setColumnWidth(columnId, width);
    this.syncColumnsToRenderer();
  }

  public setColumnPin(columnId: string, pinned?: ColumnPinPosition): void {
    this.columnModel.setColumnPin(columnId, pinned);
    this.syncColumnsToRenderer();
  }

  public setTheme(themeTokens: GridTheme): void {
    this.renderer.setTheme(themeTokens);
  }

  public getState(): GridState {
    const rendererState = this.renderer.getState();
    return this.stateService.createState({
      columns: this.getSchemaColumnsForModelNormalization(),
      columnOrder: this.getColumnOrder(),
      scrollTop: rendererState.scrollTop,
      groupModel: this.groupModel,
      pivotModel: this.pivotModel,
      groupExpansionState: this.groupExpansionState,
      treeExpansionState: this.treeExpansionState
    });
  }

  public setState(state: GridState): void {
    const appliedState = this.stateService.applyState({
      state,
      columnModel: this.columnModel,
      syncColumnsToRenderer: () => this.syncColumnsToRenderer(),
      normalizeGroupModel: (groupModel) => this.normalizeGroupModel(groupModel),
      normalizePivotModel: (pivotModel) => this.normalizePivotModel(pivotModel),
      groupModel: this.groupModel,
      pivotModel: this.pivotModel,
      groupAggregations: this.groupAggregations,
      pivotValues: this.pivotValues,
      groupExpansionState: this.groupExpansionState,
      treeExpansionState: this.treeExpansionState,
      options: this.options,
      groupingMode: this.groupingMode,
      pivotingMode: this.pivotingMode,
      groupDefaultExpanded: this.groupDefaultExpanded
    });

    this.groupModel = appliedState.nextGroupModel;
    this.pivotModel = appliedState.nextPivotModel;
    this.groupExpansionState = appliedState.nextGroupExpansionState;
    this.treeExpansionState = appliedState.nextTreeExpansionState;
    this.options = appliedState.nextOptions;
    this.renderer.setState({
      scrollTop: appliedState.scrollTop
    });

    if (appliedState.shouldRefreshDerivedView) {
      if (this.hasActiveTreeData()) {
        void this.applyTreeViewInternal();
      } else {
        void this.applyGroupingViewInternal();
      }
    }
  }

  public getSelection(): GridSelection {
    return this.renderer.getSelection();
  }

  public setSelection(selection: GridSelectionInput): void {
    this.renderer.setSelection(selection);
  }

  public clearSelection(): void {
    this.renderer.clearSelection();
  }

  public getColumns(): ColumnDef[] {
    return this.columnModel.getColumns().map((column) => ({ ...column }));
  }

  public getVisibleColumns(): ColumnDef[] {
    return this.getVisibleColumnsInRendererOrder().map((column) => ({ ...column }));
  }

  public getDataProvider(): DataProvider {
    return this.options.dataProvider;
  }

  public getViewRowCount(): number {
    return this.rowModel.getViewRowCount();
  }

  public getDataIndex(rowIndex: number): number {
    return this.rowModel.getDataIndex(rowIndex);
  }

  public getVisibleRowRange(): GridVisibleRowRange | null {
    return this.renderer.getVisibleRowRange();
  }

  public refresh(): void {
    this.renderer.setOptions(this.getRendererOptions());
  }

  public async exportCsv(options: GridExportOptions = {}): Promise<GridExportResult> {
    return this.exportDelimited('csv', ',', options);
  }

  public async exportTsv(options: GridExportOptions = {}): Promise<GridExportResult> {
    return this.exportDelimited('tsv', '\t', options);
  }

  public resetRowHeights(rowIndexes?: number[]): void {
    this.renderer.resetRowHeights(rowIndexes);
  }

  public on<K extends GridEventName>(eventName: K, handler: (payload: GridEventMap[K]) => void): void {
    this.eventBus.on(eventName, handler);
  }

  public off<K extends GridEventName>(eventName: K, handler: (payload: GridEventMap[K]) => void): void {
    this.eventBus.off(eventName, handler);
  }

  public destroy(): void {
    this.dataProviderUnsubscribe = this.providerLifecycleService.disconnectRowsChangedListener(this.dataProviderUnsubscribe);
    this.commandEventUnsubscribe?.();
    this.commandEventUnsubscribe = null;
    this.invalidateWorkerProjectionCache();
    this.sortExecutor.destroy();
    this.filterExecutor.destroy();
    this.groupExecutor.destroy();
    this.pivotExecutor.destroy();
    this.treeExecutor.destroy();
    this.renderer.destroy();
  }

  private prewarmWorkerExecutors(): void {
    if (this.options.workerRuntime?.prewarm !== true) {
      return;
    }

    this.sortExecutor.prewarm();
    this.filterExecutor.prewarm();
    this.groupExecutor.prewarm();
    this.pivotExecutor.prewarm();
    this.treeExecutor.prewarm();
  }

  private canUseLightweightFlatRendererRefresh(): boolean {
    return !this.hasActiveTreeData() && !this.hasActiveClientPivot() && !this.hasActiveClientGrouping();
  }

  private applyFlatViewAndRefreshRenderer(): void {
    this.restoreColumnsAfterClientPivot();
    this.pivotColumns = [];
    this.commitDataPipelineResult(
      this.dataPipelineService.applyFlatView({
        sourceDataProvider: this.sourceDataProvider,
        rowModel: this.rowModel,
        sortMapping: this.sortMapping,
        filterMapping: this.filterMapping
      })
    );
    this.renderer.refreshDataView();
  }

  private getWorkerLargeDataThreshold(): number {
    const largeDataThreshold = this.options.workerRuntime?.largeDataThreshold;
    if (typeof largeDataThreshold !== 'number' || !Number.isFinite(largeDataThreshold)) {
      return DEFAULT_WORKER_LARGE_DATA_THRESHOLD;
    }

    return Math.max(1, Math.floor(largeDataThreshold));
  }

  private async yieldAfterLargeWorkerResult(rowCount: number): Promise<void> {
    if (rowCount < this.getWorkerLargeDataThreshold()) {
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  private requireRemoteDataProvider(): RemoteDataProviderContract {
    if (!this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider)) {
      throw new Error('Remote data provider is required for this operation');
    }

    return this.sourceDataProvider;
  }

  private clearDerivedViewArtifacts(): void {
    this.applyDataPipelineState(this.dataPipelineService.clearState());
    this.pivotColumns = [];
  }

  private invalidateWorkerProjectionCache(): void {
    this.workerProjectionCache.clear();
  }

  private syncRemoteProviderQueryState(): void {
    const remoteDataProvider = this.requireRemoteDataProvider();
    this.remoteQueryService.syncProviderState({
      dataProvider: remoteDataProvider,
      rowModel: this.rowModel,
      sortModel: this.sortModel,
      filterModel: this.filterModel,
      groupModel: this.groupModel,
      pivotModel: this.pivotModel,
      pivotValues: this.pivotValues,
      useServerGrouping: this.shouldUseServerGrouping(),
      useServerPivot: this.shouldUseServerPivot()
    });
    this.options = {
      ...this.options,
      dataProvider: remoteDataProvider
    };
  }

  private getDataPipelineState(): GridDataPipelineState {
    return {
      groupRows: this.groupRows,
      groupKeys: this.groupKeys,
      groupedDataProvider: this.groupedDataProvider,
      pivotDataProvider: this.pivotDataProvider,
      treeRows: this.treeRows,
      treeNodeKeys: this.treeNodeKeys,
      treeNodeKeyTokens: this.treeNodeKeyTokens,
      treeDataProvider: this.treeDataProvider
    };
  }

  private applyDataPipelineState(nextState: GridDataPipelineState): void {
    this.groupRows = nextState.groupRows;
    this.groupKeys = nextState.groupKeys;
    this.groupedDataProvider = nextState.groupedDataProvider;
    this.pivotDataProvider = nextState.pivotDataProvider;
    this.treeRows = nextState.treeRows;
    this.treeNodeKeys = nextState.treeNodeKeys;
    this.treeNodeKeyTokens = nextState.treeNodeKeyTokens;
    this.treeDataProvider = nextState.treeDataProvider;
  }

  private commitDataPipelineResult(result: GridDataPipelineApplyResult): void {
    this.applyDataPipelineState(result.nextState);
    this.options = {
      ...this.options,
      dataProvider: result.dataProvider
    };
  }

  private syncColumnsToRenderer(): void {
    this.invalidateWorkerProjectionCache();
    this.options = {
      ...this.options,
      columns: this.columnModel.getColumns()
    };
    this.renderer.setColumns(this.columnModel.getVisibleColumns());
  }

  private async exportDelimited(
    format: GridExportFormat,
    delimiter: ',' | '\t',
    options: GridExportOptions
  ): Promise<GridExportResult> {
    return this.exportService.exportDelimited({
      format,
      delimiter,
      options,
      rendererOrderedColumns: this.getVisibleColumnsInRendererOrder(),
      selection: this.renderer.getSelection(),
      visibleRowRange: this.renderer.getVisibleRowRange(),
      viewRowCount: this.rowModel.getViewRowCount(),
      getDataIndex: (rowIndex) => this.rowModel.getDataIndex(rowIndex),
      getRow: (dataIndex) => this.options.dataProvider.getRow?.(dataIndex),
      getValue: (dataIndex, columnId) => this.options.dataProvider.getValue(dataIndex, columnId),
      formatCell: (column, row) => formatColumnValue(column, row, this.columnValueFormatContext ?? undefined),
      isSystemColumn: isSystemUtilityColumn
    });
  }

  private getVisibleColumnsInRendererOrder(): ColumnDef[] {
    const visibleColumns = this.columnModel.getVisibleColumns();
    const leftColumns: ColumnDef[] = [];
    const centerColumns: ColumnDef[] = [];
    const rightColumns: ColumnDef[] = [];

    for (let index = 0; index < visibleColumns.length; index += 1) {
      const column = visibleColumns[index];
      if (column.pinned === 'left') {
        leftColumns.push(column);
      } else if (column.pinned === 'right') {
        rightColumns.push(column);
      } else {
        centerColumns.push(column);
      }
    }

    return [...leftColumns, ...centerColumns, ...rightColumns];
  }

  private captureBaseColumnsForClientPivot(): void {
    if (this.baseColumnsBeforeClientPivot) {
      return;
    }

    this.baseColumnsBeforeClientPivot = cloneColumns(this.columnModel.getColumns());
  }

  private buildPivotRenderColumns(pivotColumns: ColumnDef[]): ColumnDef[] {
    const baseColumns = this.baseColumnsBeforeClientPivot ?? this.columnModel.getColumns();
    const specialColumns = baseColumns.filter((column) => isSystemUtilityColumn(column.id)).map((column) => ({ ...column }));
    const seenColumnIds = new Set<string>();
    for (let index = 0; index < specialColumns.length; index += 1) {
      seenColumnIds.add(specialColumns[index].id);
    }

    const mergedColumns: ColumnDef[] = [...specialColumns];
    for (let index = 0; index < pivotColumns.length; index += 1) {
      const column = pivotColumns[index];
      if (seenColumnIds.has(column.id)) {
        continue;
      }

      seenColumnIds.add(column.id);
      mergedColumns.push({ ...column });
    }

    return normalizeSpecialColumns(mergedColumns, this.options.rowIndicator);
  }

  private applyClientPivotColumns(pivotColumns: ColumnDef[]): void {
    this.captureBaseColumnsForClientPivot();
    const columns = this.buildPivotRenderColumns(pivotColumns);
    this.columnModel.setColumns(columns);
    this.pivotColumns = cloneColumns(columns);
    this.syncColumnsToRenderer();
  }

  private restoreColumnsAfterClientPivot(): void {
    if (!this.baseColumnsBeforeClientPivot) {
      return;
    }

    const columns = normalizeSpecialColumns(cloneColumns(this.baseColumnsBeforeClientPivot), this.options.rowIndicator);
    this.columnModel.setColumns(columns);
    this.syncColumnsToRenderer();
    this.baseColumnsBeforeClientPivot = null;
    this.pivotColumns = [];
  }

  private handleDataProviderRowsChanged = (): void => {
    this.invalidateWorkerProjectionCache();
    const rowsChangedResolution = this.providerLifecycleService.resolveRowsChanged({
      dataProvider: this.sourceDataProvider,
      currentRowCount: this.rowModel.getState().rowCount,
      hasActiveDerivedView:
        this.sortModel.length > 0 ||
        this.hasActiveFilterModel() ||
        this.hasActiveClientGrouping() ||
        this.hasActiveTreeData() ||
        this.hasActivePivotModel(),
      isRemoteDataProvider: this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider),
      shouldSyncRemoteQueryState:
        (this.shouldUseServerGrouping() || this.shouldUseServerPivot()) &&
        this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider)
    });

    if (rowsChangedResolution.shouldSetRowCount) {
      this.rowModel.setRowCount(rowsChangedResolution.nextRowCount);
    }

    if (rowsChangedResolution.shouldResetRemoteMappings) {
      this.sortMapping = null;
      this.filterMapping = null;
    }

    if (rowsChangedResolution.shouldRebuildDerivedView) {
      void this.rebuildDerivedView();
      return;
    }

    if (rowsChangedResolution.shouldSyncRemoteQueryState) {
      this.syncRemoteProviderQueryState();
    }

    if (rowsChangedResolution.shouldRefreshRenderer) {
      this.options = {
        ...this.options,
        dataProvider: this.sourceDataProvider
      };
      this.renderer.setOptions(this.getRendererOptions());
    }
  };

  private getColumnOrder(): string[] {
    return this.columnModel.getColumns().map((column) => column.id);
  }

  private getRendererOptions(): GridOptions {
    return {
      ...this.options,
      rowModel: this.rowModel,
      columns: this.columnModel.getVisibleColumns()
    };
  }

  private rebuildColumnValueFormatContext(): void {
    const hasExplicitLocale = typeof this.options.locale === 'string' && this.options.locale.trim().length > 0;
    const hasNumberFormatOptions = Boolean(this.options.numberFormatOptions);
    const hasDateTimeFormatOptions = Boolean(this.options.dateTimeFormatOptions);
    const shouldUseIntlFormatting = hasExplicitLocale || hasNumberFormatOptions || hasDateTimeFormatOptions;

    if (!shouldUseIntlFormatting) {
      this.columnValueFormatContext = null;
      return;
    }

    this.columnValueFormatContext = createColumnValueFormatContext({
      locale: normalizeGridLocale(this.options.locale, DEFAULT_LOCALE),
      numberFormatOptions: this.options.numberFormatOptions,
      dateTimeFormatOptions: this.options.dateTimeFormatOptions
    });
  }

  private hasActiveFilterModel(): boolean {
    return Object.keys(this.filterModel).length > 0;
  }

  private hasActiveGroupModel(): boolean {
    return this.groupModel.length > 0;
  }

  private hasActivePivotModel(): boolean {
    return this.pivotModel.length > 0 && this.pivotValues.length > 0;
  }

  private hasActiveClientPivot(): boolean {
    return this.hasActivePivotModel() && !this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider) && !this.hasActiveTreeData();
  }

  private hasActiveTreeData(): boolean {
    return this.treeDataOptions.enabled === true && !this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider);
  }

  private hasActiveClientGrouping(): boolean {
    return (
      this.hasActiveGroupModel() &&
      !this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider) &&
      !this.hasActiveTreeData() &&
      !this.hasActivePivotModel()
    );
  }

  private shouldUseServerGrouping(): boolean {
    return this.groupingMode === 'server' && this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider);
  }

  private shouldUseServerPivot(): boolean {
    return (
      this.pivotingMode === 'server' &&
      this.hasActivePivotModel() &&
      this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider)
    );
  }

  private shouldUseServerTreeMode(): boolean {
    return this.treeMode === 'server' && typeof this.treeDataOptions.loadChildren === 'function';
  }

  private getCurrentSourceOrder(rowCount: number): Int32Array {
    if (this.filterMapping) {
      return this.filterMapping;
    }

    if (this.sortMapping) {
      return this.sortMapping;
    }

    return createIdentityMapping(rowCount);
  }

  private getSchemaColumnsForModelNormalization(): ColumnDef[] {
    if (this.baseColumnsBeforeClientPivot && this.baseColumnsBeforeClientPivot.length > 0) {
      return this.baseColumnsBeforeClientPivot;
    }

    return this.columnModel.getColumns();
  }

  private normalizeGroupModel(groupModel: GroupModelItem[]): GroupModelItem[] {
    if (!Array.isArray(groupModel) || groupModel.length === 0) {
      return [];
    }

    const knownColumnIds = new Set<string>();
    const columns = this.getSchemaColumnsForModelNormalization();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const seen = new Set<string>();
    const normalized: GroupModelItem[] = [];
    for (let index = 0; index < groupModel.length; index += 1) {
      const item = groupModel[index];
      if (!item || typeof item.columnId !== 'string') {
        continue;
      }

      const columnId = item.columnId.trim();
      if (columnId.length === 0 || !knownColumnIds.has(columnId) || seen.has(columnId)) {
        continue;
      }

      seen.add(columnId);
      normalized.push({ columnId });
    }

    return normalized;
  }

  private normalizeGroupAggregations(aggregations: GroupAggregationDef[]): GroupAggregationDef[] {
    if (!Array.isArray(aggregations) || aggregations.length === 0) {
      return [];
    }

    const knownColumnIds = new Set<string>();
    const columns = this.getSchemaColumnsForModelNormalization();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const seen = new Set<string>();
    const normalized: GroupAggregationDef[] = [];
    for (let index = 0; index < aggregations.length; index += 1) {
      const item = aggregations[index];
      if (!item || typeof item.columnId !== 'string') {
        continue;
      }

      const columnId = item.columnId.trim();
      if (columnId.length === 0 || !knownColumnIds.has(columnId) || seen.has(columnId)) {
        continue;
      }

      const hasReducer = typeof item.reducer === 'function';
      const type = item.type ?? (hasReducer ? undefined : 'count');
      normalized.push({
        columnId,
        type,
        reducer: hasReducer ? item.reducer : undefined
      });
      seen.add(columnId);
    }

    return normalized;
  }

  private normalizePivotModel(pivotModel: PivotModelItem[]): PivotModelItem[] {
    if (!Array.isArray(pivotModel) || pivotModel.length === 0) {
      return [];
    }

    const knownColumnIds = new Set<string>();
    const columns = this.getSchemaColumnsForModelNormalization();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const seen = new Set<string>();
    const normalized: PivotModelItem[] = [];
    for (let index = 0; index < pivotModel.length; index += 1) {
      const item = pivotModel[index];
      if (!item || typeof item.columnId !== 'string') {
        continue;
      }

      const columnId = item.columnId.trim();
      if (columnId.length === 0 || !knownColumnIds.has(columnId) || seen.has(columnId)) {
        continue;
      }

      seen.add(columnId);
      normalized.push({ columnId });
    }

    return normalized;
  }

  private normalizePivotValues(values: PivotValueDef[]): PivotValueDef[] {
    if (!Array.isArray(values) || values.length === 0) {
      return [];
    }

    const knownColumnIds = new Set<string>();
    const columns = this.getSchemaColumnsForModelNormalization();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const seen = new Set<string>();
    const normalized: PivotValueDef[] = [];
    for (let index = 0; index < values.length; index += 1) {
      const item = values[index];
      if (!item || typeof item.columnId !== 'string') {
        continue;
      }

      const columnId = item.columnId.trim();
      if (columnId.length === 0 || !knownColumnIds.has(columnId) || seen.has(columnId)) {
        continue;
      }

      seen.add(columnId);
      const hasReducer = typeof item.reducer === 'function';
      const type = item.type ?? (hasReducer ? undefined : 'count');
      normalized.push({
        columnId,
        type,
        reducer: hasReducer ? item.reducer : undefined
      });
    }

    return normalized;
  }

  private normalizeTreeDataOptions(treeDataOptions: TreeDataOptions): TreeDataOptions {
    const normalized = mergeTreeDataOptions(this.treeDataOptions, treeDataOptions);
    const columns = this.getSchemaColumnsForModelNormalization();
    const knownColumnIds = new Set<string>();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const treeColumnId = normalized.treeColumnId ?? '';
    const resolvedTreeColumnId =
      treeColumnId.length > 0 && knownColumnIds.has(treeColumnId)
        ? treeColumnId
        : columns.length > 0
          ? columns[0].id
          : '';

    return {
      ...normalized,
      mode: normalized.mode === 'server' ? 'server' : 'client',
      idField: getTreeFieldName(normalized.idField, 'id'),
      parentIdField: getTreeFieldName(normalized.parentIdField, 'parentId'),
      hasChildrenField: getTreeFieldName(normalized.hasChildrenField, 'hasChildren'),
      treeColumnId: resolvedTreeColumnId,
      enabled: normalized.enabled === true,
      defaultExpanded: normalized.defaultExpanded === true,
      rootParentValue: normalized.rootParentValue === undefined ? null : normalized.rootParentValue
    };
  }

  private normalizeFilterModel(filterModel: GridFilterModel): GridFilterModel {
    if (!filterModel || typeof filterModel !== 'object') {
      return {};
    }

    const normalized: GridFilterModel = {};
    const keys = Object.keys(filterModel);
    for (let index = 0; index < keys.length; index += 1) {
      const columnId = keys[index];
      if (!columnId) {
        continue;
      }

      const value = filterModel[columnId];
      if (!value) {
        continue;
      }

      if (Array.isArray(value)) {
        const copiedArray = value
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({ ...(item as ColumnFilterCondition) }));
        if (copiedArray.length > 0) {
          normalized[columnId] = copiedArray;
        }
        continue;
      }

      if (typeof value === 'object') {
        normalized[columnId] = { ...(value as ColumnFilterCondition) };
      }
    }

    return normalized;
  }

  private cloneFilterModel(filterModel: GridFilterModel): GridFilterModel {
    return this.normalizeFilterModel(filterModel);
  }

  private async applyFilterModelInternal(): Promise<void> {
    const rowCount = this.sourceDataProvider.getRowCount();
    const operationToken = ++this.filterOperationToken;
    const opId = `filter-${operationToken}`;

    if (!this.hasActiveFilterModel() || rowCount <= 0) {
      this.filterMapping = null;
      if (this.canUseLightweightFlatRendererRefresh()) {
        this.applyFlatViewAndRefreshRenderer();
      } else {
        await this.applyDerivedViewToRenderer();
      }
      return;
    }

    const response = await this.filterExecutor.execute(
      {
        opId,
        rowCount,
        filterModel: this.filterModel,
        columns: this.getSchemaColumnsForModelNormalization(),
        dataProvider: this.sourceDataProvider,
        sourceOrder: this.sortMapping ?? undefined
      },
      {
        isCanceled: () => operationToken !== this.filterOperationToken
      }
    );

    if (operationToken !== this.filterOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.filterMapping = reuseViewToDataMapping(response.result.mapping);
    await this.yieldAfterLargeWorkerResult(rowCount);
    if (this.canUseLightweightFlatRendererRefresh()) {
      this.applyFlatViewAndRefreshRenderer();
    } else {
      await this.applyDerivedViewToRenderer();
    }
  }

  private async rebuildDerivedView(): Promise<void> {
    if (this.remoteQueryService.isRemoteDataProvider(this.sourceDataProvider)) {
      this.sortOperationToken += 1;
      this.filterOperationToken += 1;
      this.groupOperationToken += 1;
      this.pivotOperationToken += 1;
      this.treeOperationToken += 1;
      this.sortMapping = null;
      this.filterMapping = null;
      this.clearDerivedViewArtifacts();
      this.restoreColumnsAfterClientPivot();
      this.syncRemoteProviderQueryState();
      this.renderer.setOptions(this.getRendererOptions());
      return;
    }

    const sourceRowCount = this.sourceDataProvider.getRowCount();
    if (this.sortModel.length > 0 && sourceRowCount > 0) {
      const operationToken = ++this.sortOperationToken;
      const response = await this.sortExecutor.execute(
        {
          opId: `sort-${operationToken}`,
          rowCount: sourceRowCount,
          sortModel: this.sortModel,
          columns: this.getSchemaColumnsForModelNormalization(),
          dataProvider: this.sourceDataProvider
        },
        {
          isCanceled: () => operationToken !== this.sortOperationToken
        }
      );

      if (operationToken !== this.sortOperationToken) {
        return;
      }

      if (response.status === 'error') {
        throw new Error(response.result.message);
      }

      if (response.status === 'ok') {
        this.sortMapping = reuseViewToDataMapping(response.result.mapping);
      } else {
        this.sortMapping = null;
      }
    } else {
      this.sortMapping = null;
    }

    if (this.hasActiveFilterModel() && sourceRowCount > 0) {
      const operationToken = ++this.filterOperationToken;
      const response = await this.filterExecutor.execute(
        {
          opId: `filter-${operationToken}`,
          rowCount: sourceRowCount,
          filterModel: this.filterModel,
          columns: this.getSchemaColumnsForModelNormalization(),
          dataProvider: this.sourceDataProvider,
          sourceOrder: this.sortMapping ?? createIdentityMapping(sourceRowCount)
        },
        {
          isCanceled: () => operationToken !== this.filterOperationToken
        }
      );

      if (operationToken !== this.filterOperationToken) {
        return;
      }

      if (response.status === 'error') {
        throw new Error(response.result.message);
      }

      if (response.status === 'ok') {
        this.filterMapping = reuseViewToDataMapping(response.result.mapping);
      } else {
        this.filterMapping = null;
      }
    } else {
      this.filterMapping = null;
    }

    if ((this.sortMapping || this.filterMapping) && sourceRowCount >= this.getWorkerLargeDataThreshold()) {
      await this.yieldAfterLargeWorkerResult(sourceRowCount);
    }
    await this.applyDerivedViewToRenderer();
  }

  private async applyDerivedViewToRenderer(): Promise<void> {
    if (this.hasActiveTreeData()) {
      this.restoreColumnsAfterClientPivot();
      await this.applyTreeViewInternal();
      return;
    }

    if (this.hasActiveClientPivot()) {
      await this.applyPivotViewInternal();
      return;
    }

    if (this.hasActiveClientGrouping()) {
      this.restoreColumnsAfterClientPivot();
      await this.applyGroupingViewInternal();
      return;
    }

    this.restoreColumnsAfterClientPivot();
    this.pivotColumns = [];
    this.commitDataPipelineResult(
      this.dataPipelineService.applyFlatView({
        sourceDataProvider: this.sourceDataProvider,
        rowModel: this.rowModel,
        sortMapping: this.sortMapping,
        filterMapping: this.filterMapping
      })
    );
    this.renderer.setOptions(this.getRendererOptions());
  }

  private async applyPivotViewInternal(): Promise<void> {
    if (!this.hasActiveClientPivot()) {
      await this.applyDerivedViewToRenderer();
      return;
    }

    const sourceRowCount = this.sourceDataProvider.getRowCount();
    const operationToken = ++this.pivotOperationToken;
    const opId = `pivot-${operationToken}`;
    const response = await this.pivotExecutor.execute(
      {
        opId,
        rowCount: sourceRowCount,
        columns: this.getSchemaColumnsForModelNormalization(),
        dataProvider: this.sourceDataProvider,
        sourceOrder: this.getCurrentSourceOrder(sourceRowCount),
        rowGroupModel: this.groupModel,
        pivotModel: this.pivotModel,
        pivotValues: this.pivotValues
      },
      {
        isCanceled: () => operationToken !== this.pivotOperationToken
      }
    );

    if (operationToken !== this.pivotOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.applyPivotResult(this.hydrateCustomPivotValues(response.result));
    this.renderer.setOptions(this.getRendererOptions());
  }

  private applyPivotResult(result: PivotExecutionResult): void {
    this.applyClientPivotColumns(result.columns);
    this.commitDataPipelineResult(
      this.dataPipelineService.applyPivotResult({
        rowModel: this.rowModel,
        result
      })
    );
  }

  private buildPivotAggregationRow(columns: ColumnDef[], dataIndex: number): GridRowData {
    const row: GridRowData = {};
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      row[column.id] = this.sourceDataProvider.getValue(dataIndex, column.id);
    }
    return row;
  }

  private getPivotAggregationValue(column: ColumnDef, columns: ColumnDef[], dataIndex: number): unknown {
    if (!column.valueGetter) {
      return this.sourceDataProvider.getValue(dataIndex, column.id);
    }

    const row = this.sourceDataProvider.getRow
      ? this.sourceDataProvider.getRow(dataIndex) ?? this.buildPivotAggregationRow(columns, dataIndex)
      : this.buildPivotAggregationRow(columns, dataIndex);

    return getColumnValue(column, row);
  }

  private hydrateCustomPivotValues(result: PivotExecutionResult): PivotExecutionResult {
    const customPivotValues = this.pivotValues.filter((item) => typeof item.reducer === 'function');
    if (customPivotValues.length === 0 || !Array.isArray(result.customValueDataIndexesByCell) || result.customValueDataIndexesByCell.length === 0) {
      return result;
    }

    const columns = this.getSchemaColumnsForModelNormalization();
    const columnById = new Map<string, ColumnDef>();
    for (let index = 0; index < columns.length; index += 1) {
      columnById.set(columns[index].id, columns[index]);
    }

    const customPivotValueByColumnId = new Map<string, PivotValueDef>();
    for (let index = 0; index < customPivotValues.length; index += 1) {
      customPivotValueByColumnId.set(customPivotValues[index].columnId, customPivotValues[index]);
    }

    const rowIndexByKey = new Map<string, number>();
    for (let rowIndex = 0; rowIndex < result.rows.length; rowIndex += 1) {
      const rowKey = result.rows[rowIndex]?.__pivot_row_key;
      if (typeof rowKey === 'string' && rowKey.length > 0) {
        rowIndexByKey.set(rowKey, rowIndex);
      }
    }

    let changed = false;
    const rows = result.rows.map((row) => ({ ...row }));
    for (let index = 0; index < result.customValueDataIndexesByCell.length; index += 1) {
      const cell = result.customValueDataIndexesByCell[index];
      const rowIndex = rowIndexByKey.get(cell.rowKey);
      const pivotValue = customPivotValueByColumnId.get(cell.valueColumnId);
      const column = columnById.get(cell.valueColumnId);
      const reducer = pivotValue?.reducer;
      if (rowIndex === undefined || !column || typeof reducer !== 'function') {
        continue;
      }

      const reducerValues = new Array<unknown>(cell.dataIndexes.length);
      for (let dataIndexPosition = 0; dataIndexPosition < cell.dataIndexes.length; dataIndexPosition += 1) {
        reducerValues[dataIndexPosition] = this.getPivotAggregationValue(column, columns, cell.dataIndexes[dataIndexPosition]);
      }

      rows[rowIndex][cell.columnId] = reducer(reducerValues, {
        groupKey: cell.rowKey,
        level: 0,
        columnId: cell.valueColumnId,
        groupValue: cell.pivotLabel,
        rowCount: cell.dataIndexes.length
      });
      changed = true;
    }

    if (!changed) {
      return result;
    }

    return {
      opId: result.opId,
      columns: result.columns,
      rows,
      rowGroupColumnIds: result.rowGroupColumnIds,
      pivotColumnCount: result.pivotColumnCount,
      pivotKeyCount: result.pivotKeyCount,
      sourceRowCount: result.sourceRowCount,
      customValueDataIndexesByCell: result.customValueDataIndexesByCell
    };
  }

  private async applyGroupingViewInternal(): Promise<void> {
    if (!this.hasActiveClientGrouping()) {
      await this.applyDerivedViewToRenderer();
      return;
    }

    const sourceRowCount = this.sourceDataProvider.getRowCount();
    const operationToken = ++this.groupOperationToken;
    const opId = `group-${operationToken}`;
    const response = await this.groupExecutor.execute(
      {
        opId,
        rowCount: sourceRowCount,
        groupModel: this.groupModel,
        aggregations: this.groupAggregations,
        columns: this.getSchemaColumnsForModelNormalization(),
        dataProvider: this.sourceDataProvider,
        sourceOrder: this.getCurrentSourceOrder(sourceRowCount),
        groupExpansionState: this.groupExpansionState,
        defaultExpanded: this.groupDefaultExpanded
      },
      {
        isCanceled: () => operationToken !== this.groupOperationToken
      }
    );

    if (operationToken !== this.groupOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.applyGroupingResult(this.hydrateCustomGroupingValues(response.result));
    this.renderer.setOptions(this.getRendererOptions());
  }

  private applyGroupingResult(result: GroupExecutionResult): void {
    this.pivotColumns = [];
    this.commitDataPipelineResult(
      this.dataPipelineService.applyGroupingResult({
        state: this.getDataPipelineState(),
        sourceDataProvider: this.sourceDataProvider,
        rowModel: this.rowModel,
        result
      })
    );
  }

  private buildGroupingAggregationRow(columns: ColumnDef[], dataIndex: number): GridRowData {
    const row: GridRowData = {};
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      row[column.id] = this.sourceDataProvider.getValue(dataIndex, column.id);
    }
    return row;
  }

  private getGroupingAggregationValue(column: ColumnDef, columns: ColumnDef[], dataIndex: number): unknown {
    if (!column.valueGetter) {
      return this.sourceDataProvider.getValue(dataIndex, column.id);
    }

    const row = this.sourceDataProvider.getRow
      ? this.sourceDataProvider.getRow(dataIndex) ?? this.buildGroupingAggregationRow(columns, dataIndex)
      : this.buildGroupingAggregationRow(columns, dataIndex);

    return getColumnValue(column, row);
  }

  private hydrateCustomGroupingValues(result: GroupExecutionResult): GroupExecutionResult {
    const customAggregations = this.groupAggregations.filter((aggregation) => typeof aggregation.reducer === 'function');
    if (customAggregations.length === 0 || !result.groupLeafDataIndexesByKey) {
      return result;
    }

    const columns = this.getSchemaColumnsForModelNormalization();
    const columnById = new Map<string, ColumnDef>();
    for (let index = 0; index < columns.length; index += 1) {
      columnById.set(columns[index].id, columns[index]);
    }

    let changed = false;
    const rows = result.rows.map((row) => {
      if (row.kind !== 'group') {
        return row;
      }

      const dataIndexes = result.groupLeafDataIndexesByKey?.[row.groupKey];
      if (!Array.isArray(dataIndexes) || dataIndexes.length === 0) {
        return row;
      }

      let rowChanged = false;
      const values = { ...row.values };
      for (let index = 0; index < customAggregations.length; index += 1) {
        const aggregation = customAggregations[index];
        const reducer = aggregation.reducer;
        const column = columnById.get(aggregation.columnId);
        if (
          typeof reducer !== 'function' ||
          !column ||
          Object.prototype.hasOwnProperty.call(values, aggregation.columnId)
        ) {
          continue;
        }

        const reducerValues = new Array<unknown>(dataIndexes.length);
        for (let dataIndexPosition = 0; dataIndexPosition < dataIndexes.length; dataIndexPosition += 1) {
          reducerValues[dataIndexPosition] = this.getGroupingAggregationValue(
            column,
            columns,
            dataIndexes[dataIndexPosition]
          );
        }

        values[aggregation.columnId] = reducer(reducerValues, {
          groupKey: row.groupKey,
          level: row.level,
          columnId: row.columnId,
          groupValue: row.value,
          rowCount: row.leafCount
        });
        rowChanged = true;
      }

      if (!rowChanged) {
        return row;
      }

      changed = true;
      return {
        ...row,
        values
      };
    });

    if (!changed) {
      return result;
    }

    return {
      opId: result.opId,
      rows,
      groupKeys: result.groupKeys,
      groupLeafDataIndexesByKey: result.groupLeafDataIndexesByKey
    };
  }

  private async applyTreeViewInternal(expandNodeKey?: RowKey, nextExpanded?: boolean): Promise<void> {
    if (!this.hasActiveTreeData()) {
      await this.applyDerivedViewToRenderer();
      return;
    }

    if (nextExpanded === true && expandNodeKey !== undefined) {
      await this.ensureTreeLazyChildrenLoaded(expandNodeKey);
    }

    const sourceRowCount = this.sourceDataProvider.getRowCount();
    const operationToken = ++this.treeOperationToken;
    const opId = `tree-${operationToken}`;
    const response = await this.treeExecutor.execute(
      {
        opId,
        rowCount: sourceRowCount,
        sourceOrder: this.getCurrentSourceOrder(sourceRowCount),
        dataProvider: this.sourceDataProvider,
        treeData: this.treeDataOptions,
        treeExpansionState: this.treeExpansionState,
        lazyChildrenBatches: Array.from(this.treeLazyChildrenByParent.values())
      },
      {
        isCanceled: () => operationToken !== this.treeOperationToken
      }
    );

    if (operationToken !== this.treeOperationToken) {
      return;
    }

    if (response.status === 'canceled') {
      return;
    }

    if (response.status === 'error') {
      throw new Error(response.result.message);
    }

    this.applyTreeResult(this.hydrateTreeLazyRows(response.result));
    this.renderer.setOptions(this.getRendererOptions());
  }

  private applyTreeResult(result: TreeExecutionResult): void {
    this.pivotColumns = [];
    this.commitDataPipelineResult(
      this.dataPipelineService.applyTreeResult({
        state: this.getDataPipelineState(),
        sourceDataProvider: this.sourceDataProvider,
        rowModel: this.rowModel,
        result,
        treeColumnId: this.treeDataOptions.treeColumnId ?? ''
      })
    );
  }

  private hydrateTreeLazyRows(result: TreeExecutionResult): TreeExecutionResult {
    if (result.rows.length === 0 || this.treeLazyRowsByRef.size === 0) {
      return result;
    }

    let changed = false;
    const hydratedRows = new Array<TreeExecutionResult['rows'][number]>(result.rows.length);
    for (let index = 0; index < result.rows.length; index += 1) {
      const row = result.rows[index];
      if (row.sourceDataIndex !== null || !row.localRow) {
        hydratedRows[index] = row;
        continue;
      }

      const lazyRowRef = row.localRow[WORKER_TREE_LAZY_ROW_REF_FIELD];
      if (typeof lazyRowRef !== 'string' || lazyRowRef.length === 0) {
        hydratedRows[index] = row;
        continue;
      }

      changed = true;
      const lazyRow = this.treeLazyRowsByRef.get(lazyRowRef);
      if (lazyRow) {
        hydratedRows[index] = {
          ...row,
          localRow: lazyRow
        };
        continue;
      }

      const nextLocalRow = { ...row.localRow };
      delete nextLocalRow[WORKER_TREE_LAZY_ROW_REF_FIELD];
      hydratedRows[index] = {
        ...row,
        localRow: nextLocalRow
      };
    }

    if (!changed) {
      return result;
    }

    return {
      opId: result.opId,
      rows: hydratedRows,
      nodeKeys: result.nodeKeys,
      nodeKeyTokens: result.nodeKeyTokens
    };
  }

  private clearTreeLazyCaches(): void {
    this.treeLazyChildrenByParent.clear();
    this.treeLazyRowsByRef.clear();
    this.treeLoadingParents.clear();
  }

  private async ensureTreeLazyChildrenLoaded(nodeKey: RowKey): Promise<void> {
    if (!this.shouldUseServerTreeMode()) {
      return;
    }

    const parentToken = toTreeNodeKeyToken(nodeKey);
    if (this.treeLazyChildrenByParent.has(parentToken) || this.treeLoadingParents.has(parentToken)) {
      return;
    }

    const treeRow = this.findTreeRowByNodeToken(parentToken);
    if (!treeRow || !treeRow.hasChildren) {
      return;
    }

    const loadChildren = this.treeDataOptions.loadChildren;
    if (typeof loadChildren !== 'function') {
      return;
    }

    const parentRow = this.resolveTreeParentRow(treeRow);
    if (!parentRow) {
      return;
    }

    this.treeLoadingParents.add(parentToken);
    const loadToken = ++this.treeLoadOperationToken;
    try {
      const loaded = await loadChildren({
        parentNodeKey: nodeKey,
        parentRow,
        depth: treeRow.depth
      });

      if (loadToken !== this.treeLoadOperationToken) {
        return;
      }

      const loadedRows = Array.isArray(loaded) ? loaded : loaded?.rows;
      if (!Array.isArray(loadedRows) || loadedRows.length === 0) {
        this.treeLazyChildrenByParent.set(parentToken, {
          parentNodeKey: nodeKey,
          rows: []
        });
        return;
      }

      const nextRows = loadedRows.map((row) => ({ ...row }));
      this.treeLazyChildrenByParent.set(parentToken, {
        parentNodeKey: nodeKey,
        rows: nextRows
      });
      for (let rowIndex = 0; rowIndex < nextRows.length; rowIndex += 1) {
        this.treeLazyRowsByRef.set(createWorkerTreeLazyRowRef(nodeKey, rowIndex), nextRows[rowIndex]);
      }
    } finally {
      this.treeLoadingParents.delete(parentToken);
    }
  }

  private findTreeRowByNodeToken(nodeToken: string): TreeExecutionResult['rows'][number] | null {
    for (let index = 0; index < this.treeRows.length; index += 1) {
      const treeRow = this.treeRows[index];
      if (toTreeNodeKeyToken(treeRow.nodeKey) === nodeToken) {
        return treeRow;
      }
    }

    return null;
  }

  private resolveTreeParentRow(treeRow: TreeExecutionResult['rows'][number]): GridRowData | null {
    if (treeRow.localRow) {
      return { ...treeRow.localRow };
    }

    if (treeRow.sourceDataIndex !== null) {
      const row = this.sourceDataProvider.getRow?.(treeRow.sourceDataIndex);
      if (row) {
        return { ...row };
      }
    }

    return null;
  }

  private normalizeSortModel(sortModel: SortModelItem[]): SortModelItem[] {
    if (!Array.isArray(sortModel) || sortModel.length === 0) {
      return [];
    }

    const columns = this.columnModel.getColumns();
    const knownColumnIds = new Set<string>();
    for (let index = 0; index < columns.length; index += 1) {
      knownColumnIds.add(columns[index].id);
    }

    const normalized: SortModelItem[] = [];
    const seenColumnIds = new Set<string>();
    for (let index = 0; index < sortModel.length; index += 1) {
      const item = sortModel[index];
      if (!item || typeof item.columnId !== 'string' || item.columnId.length === 0) {
        continue;
      }

      if (!knownColumnIds.has(item.columnId) || seenColumnIds.has(item.columnId)) {
        continue;
      }

      seenColumnIds.add(item.columnId);
      normalized.push({
        columnId: item.columnId,
        direction: item.direction === 'desc' ? 'desc' : 'asc'
      });
    }

    return normalized;
  }
}
