import type {
  ColumnDef,
  DataProvider,
  DataTransaction,
  Grid,
  GridRowData,
  GridSelection,
  GridVisibleRowRange
} from '@hgrid/grid-core';
import * as XLSX from 'xlsx';

const SYSTEM_COLUMN_IDS = new Set<string>([
  '__indicator',
  '__indicatorRowNumber',
  '__indicatorCheckbox',
  '__indicatorStatus',
  '__state'
]);
const DEFAULT_SHEET_NAME = 'HGrid';
const DEFAULT_EXPORT_CHUNK_SIZE = 1000;
const DEFAULT_MAX_CLIENT_EXPORT_ROWS = 200_000;
const DEFAULT_EXPORT_DATE_FORMAT = 'yyyy-mm-dd hh:mm:ss';
const DEFAULT_EXPORT_NUMBER_FORMAT = '#,##0.########';
const DEFAULT_IMPORT_BATCH_SIZE = 1000;

type MaybePromise<T> = T | Promise<T>;

interface ExportRowSegment {
  startRow: number;
  endRow: number;
}

export type ExcelExportScope = 'visible' | 'selection' | 'all';
export type ExcelExportStatus = 'running' | 'completed' | 'canceled' | 'delegated';
export type ExcelHeaderMappingPolicy = 'id' | 'header' | 'auto';
export type ExcelImportValidationMode = 'skipInvalidRows' | 'rejectOnError';
export type ExcelImportIssueKind = 'mapping' | 'validation' | 'conflict';
export type ExcelImportConflictMode = 'overwrite' | 'skipConflicts' | 'reportOnly';
export type ExcelImportConflictAction = 'overwrite' | 'skip';

export interface ExcelExportProgressEvent {
  operationId: string;
  scope: ExcelExportScope;
  status: ExcelExportStatus;
  processedRows: number;
  totalRows: number;
  progress: number;
}

export interface ExcelServerExportContext {
  operationId: string;
  scope: ExcelExportScope;
  totalRows: number;
  columns: ColumnDef[];
  selection: GridSelection;
}

export interface ExcelServerExportResult {
  delegated: true;
  downloadUrl?: string;
  fileName?: string;
  meta?: Record<string, unknown>;
}

export interface ExcelExportOptions {
  scope?: ExcelExportScope;
  sheetName?: string;
  includeHeaders?: boolean;
  includeSystemColumns?: boolean;
  chunkSize?: number;
  maxClientRows?: number;
  dateFormat?: string;
  numberFormat?: string;
  signal?: AbortSignal;
  onProgress?: (event: ExcelExportProgressEvent) => void;
  serverExportHook?: (context: ExcelServerExportContext) => MaybePromise<ExcelServerExportResult>;
}

export interface ExcelExportResult {
  operationId: string;
  scope: ExcelExportScope;
  sheetName: string;
  rowCount: number;
  totalRows: number;
  canceled: boolean;
  delegated: boolean;
  workbook: XLSX.WorkBook | null;
  buffer: ArrayBuffer | null;
  serverResult?: ExcelServerExportResult;
}

export interface ExcelImportIssue {
  kind?: ExcelImportIssueKind;
  sheetRowNumber: number;
  columnId?: string;
  message: string;
  value?: unknown;
}

export interface ExcelImportConflict {
  sheetRowNumber: number;
  targetRowIndex: number;
  dataIndex: number;
  columnIds: string[];
  currentValues: Record<string, unknown>;
  incomingValues: Record<string, unknown>;
  action: ExcelImportConflictAction;
  message?: string;
}

export interface ExcelImportConflictContext {
  sheetRowNumber: number;
  targetRowIndex: number;
  dataIndex: number;
  currentValues: Record<string, unknown>;
  incomingValues: Record<string, unknown>;
  conflictingColumnIds: string[];
  defaultAction: ExcelImportConflictAction;
}

export interface ExcelImportConflictResolutionResult {
  action: ExcelImportConflictAction;
  values?: Record<string, unknown>;
  message?: string;
}

export interface ExcelImportCellContext {
  sheetRowNumber: number;
  sheetColumnIndex: number;
  column: ColumnDef;
  columnId: string;
  rawValue: unknown;
  value: unknown;
  rowValues: Record<string, unknown>;
}

export interface ExcelImportCellValidationResult {
  accept: boolean;
  value?: unknown;
  message?: string;
}

export interface ExcelImportRowContext {
  sheetRowNumber: number;
  values: Record<string, unknown>;
}

export interface ExcelImportRowValidationResult {
  accept: boolean;
  values?: Record<string, unknown>;
  message?: string;
}

export type ExcelImportSource = ArrayBuffer | Uint8Array | Blob | XLSX.WorkBook;

export interface ExcelImportOptions {
  sheetName?: string;
  sheetIndex?: number;
  headerRowIndex?: number;
  startRowIndex?: number;
  skipUnknownColumns?: boolean;
  headerMappingPolicy?: ExcelHeaderMappingPolicy;
  validationMode?: ExcelImportValidationMode;
  conflictMode?: ExcelImportConflictMode;
  resolveConflict?: (context: ExcelImportConflictContext) => MaybePromise<ExcelImportConflictResolutionResult | undefined>;
  validateCell?: (context: ExcelImportCellContext) => MaybePromise<ExcelImportCellValidationResult | unknown>;
  validateRow?: (context: ExcelImportRowContext) => MaybePromise<ExcelImportRowValidationResult | Record<string, unknown> | boolean>;
  batchSize?: number;
}

export interface ExcelImportResult {
  sheetName: string;
  totalRows: number;
  importedRows: number;
  updatedRows: number;
  addedRows: number;
  conflictRows: number;
  mappedColumns: string[];
  conflicts: ExcelImportConflict[];
  issues: ExcelImportIssue[];
}

export interface ExcelPluginConfig {
  defaultSheetName?: string;
  maxClientExportRows?: number;
  defaultHeaderMappingPolicy?: ExcelHeaderMappingPolicy;
}

export interface ExcelPlugin {
  exportXlsx(grid: Grid, options?: ExcelExportOptions): Promise<ExcelExportResult>;
  importXlsx(grid: Grid, source: ExcelImportSource, options?: ExcelImportOptions): Promise<ExcelImportResult>;
  download(result: ExcelExportResult, fileName?: string): void;
}

interface ResolvedImportColumn {
  sheetColumnIndex: number;
  column: ColumnDef;
}

function normalizeHeaderToken(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeHeaderTokenInsensitive(value: unknown): string {
  return normalizeHeaderToken(value).toLowerCase();
}

function isSystemUtilityColumn(columnId: string): boolean {
  return SYSTEM_COLUMN_IDS.has(columnId);
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  const rounded = Math.floor(value);
  if (rounded < min) {
    return min;
  }

  if (rounded > max) {
    return max;
  }

  return rounded;
}

function coerceExportScope(scope: ExcelExportOptions['scope']): ExcelExportScope {
  if (scope === 'visible' || scope === 'selection') {
    return scope;
  }
  return 'all';
}

function resolveSelectionColumnIndexes(selection: GridSelection, totalColumnCount: number): number[] | null {
  if (totalColumnCount <= 0) {
    return null;
  }

  const primaryRange = selection.cellRanges[0];
  if (primaryRange) {
    const startCol = clampInteger(Math.min(primaryRange.c1, primaryRange.c2), 0, totalColumnCount - 1);
    const endCol = clampInteger(Math.max(primaryRange.c1, primaryRange.c2), 0, totalColumnCount - 1);
    const indexes: number[] = [];
    for (let index = startCol; index <= endCol; index += 1) {
      indexes.push(index);
    }
    return indexes;
  }

  if (selection.activeCell) {
    return [clampInteger(selection.activeCell.colIndex, 0, totalColumnCount - 1)];
  }

  return null;
}

function resolveExportColumns(grid: Grid, scope: ExcelExportScope, includeSystemColumns: boolean): ColumnDef[] {
  const rendererOrderedColumns = grid.getVisibleColumns();
  const baseColumns = includeSystemColumns
    ? rendererOrderedColumns
    : rendererOrderedColumns.filter((column) => !isSystemUtilityColumn(column.id));

  if (scope !== 'selection') {
    return baseColumns;
  }

  const selection = grid.getSelection();
  const selectedColumnIndexes = resolveSelectionColumnIndexes(selection, rendererOrderedColumns.length);
  if (!selectedColumnIndexes || selectedColumnIndexes.length === 0) {
    return baseColumns;
  }

  const selectedColumns: ColumnDef[] = [];
  for (let index = 0; index < selectedColumnIndexes.length; index += 1) {
    const selectedColumnIndex = selectedColumnIndexes[index];
    const column = rendererOrderedColumns[selectedColumnIndex];
    if (!column) {
      continue;
    }

    if (!includeSystemColumns && isSystemUtilityColumn(column.id)) {
      continue;
    }

    selectedColumns.push(column);
  }

  return selectedColumns.length > 0 ? selectedColumns : baseColumns;
}

function mergeRowSegments(segments: ExportRowSegment[], rowCount: number): ExportRowSegment[] {
  if (segments.length === 0 || rowCount <= 0) {
    return [];
  }

  const normalized: ExportRowSegment[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const startRow = clampInteger(Math.min(segment.startRow, segment.endRow), 0, rowCount - 1);
    const endRow = clampInteger(Math.max(segment.startRow, segment.endRow), 0, rowCount - 1);
    if (endRow < startRow) {
      continue;
    }

    normalized.push({
      startRow,
      endRow
    });
  }

  normalized.sort((left, right) => left.startRow - right.startRow || left.endRow - right.endRow);

  const merged: ExportRowSegment[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const current = normalized[index];
    const previous = merged[merged.length - 1];
    if (!previous || current.startRow > previous.endRow + 1) {
      merged.push({ ...current });
      continue;
    }

    previous.endRow = Math.max(previous.endRow, current.endRow);
  }

  return merged;
}

function resolveExportRowSegments(grid: Grid, scope: ExcelExportScope): ExportRowSegment[] {
  const rowCount = grid.getViewRowCount();
  if (rowCount <= 0) {
    return [];
  }

  if (scope === 'all') {
    return [{ startRow: 0, endRow: rowCount - 1 }];
  }

  if (scope === 'visible') {
    const visibleRange = grid.getVisibleRowRange();
    if (!visibleRange) {
      return [];
    }

    return mergeRowSegments(
      [
        {
          startRow: visibleRange.startRow,
          endRow: visibleRange.endRow
        }
      ],
      rowCount
    );
  }

  const selection = grid.getSelection();
  const primaryRange = selection.cellRanges[0];
  const segments: ExportRowSegment[] = [];

  if (primaryRange) {
    segments.push({
      startRow: Math.min(primaryRange.r1, primaryRange.r2),
      endRow: Math.max(primaryRange.r1, primaryRange.r2)
    });
  } else if (selection.rowRanges.length > 0) {
    for (let index = 0; index < selection.rowRanges.length; index += 1) {
      const range = selection.rowRanges[index];
      segments.push({
        startRow: Math.min(range.r1, range.r2),
        endRow: Math.max(range.r1, range.r2)
      });
    }
  } else if (selection.activeCell) {
    segments.push({
      startRow: selection.activeCell.rowIndex,
      endRow: selection.activeCell.rowIndex
    });
  }

  return mergeRowSegments(segments, rowCount);
}

function countSegmentRows(segments: ExportRowSegment[]): number {
  let rowCount = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    rowCount += Math.max(0, segment.endRow - segment.startRow + 1);
  }
  return rowCount;
}

function buildRowSnapshot(dataProvider: DataProvider, dataIndex: number, columns: ColumnDef[]): GridRowData {
  if (dataIndex < 0) {
    return {};
  }

  const providerRow = dataProvider.getRow?.(dataIndex);
  if (providerRow) {
    return providerRow;
  }

  const fallbackRow: GridRowData = {};
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    fallbackRow[column.id] = dataProvider.getValue(dataIndex, column.id);
  }

  return fallbackRow;
}

function resolveColumnRawValue(column: ColumnDef, row: GridRowData, dataProvider: DataProvider, dataIndex: number): unknown {
  if (typeof column.valueGetter === 'function') {
    return column.valueGetter(row, column);
  }

  if (Object.prototype.hasOwnProperty.call(row, column.id)) {
    return row[column.id];
  }

  return dataProvider.getValue(dataIndex, column.id);
}

function normalizeNumberLikeValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '');
    if (normalized.length === 0) {
      return null;
    }

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeDateLikeValue(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestampCandidate = value > 1_000_000_000 ? value : value * 1000;
    const date = new Date(timestampCandidate);
    if (Number.isFinite(date.getTime())) {
      return date;
    }
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const date = new Date(trimmed);
    if (Number.isFinite(date.getTime())) {
      return date;
    }
  }

  return null;
}

function coerceExportCellValue(column: ColumnDef, rawValue: unknown): string | number | boolean | Date {
  if (column.type === 'number') {
    const numberValue = normalizeNumberLikeValue(rawValue);
    if (numberValue !== null) {
      return numberValue;
    }
  }

  if (column.type === 'date') {
    const dateValue = normalizeDateLikeValue(rawValue);
    if (dateValue) {
      return dateValue;
    }
  }

  if (column.type === 'boolean') {
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }

    if (typeof rawValue === 'number') {
      return rawValue !== 0;
    }

    if (typeof rawValue === 'string') {
      const token = rawValue.trim().toLowerCase();
      if (token === 'true' || token === 'y' || token === 'yes' || token === '1') {
        return true;
      }
      if (token === 'false' || token === 'n' || token === 'no' || token === '0') {
        return false;
      }
    }
  }

  if (rawValue === null || rawValue === undefined) {
    return '';
  }

  if (typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
    return rawValue;
  }

  if (rawValue instanceof Date && Number.isFinite(rawValue.getTime())) {
    return rawValue;
  }

  return String(rawValue);
}

async function yieldFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(() => resolve(), 0);
  });
}

function emitProgress(onProgress: ExcelExportOptions['onProgress'], event: ExcelExportProgressEvent): void {
  if (typeof onProgress === 'function') {
    onProgress(event);
  }
}

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function applySheetFormats(
  worksheet: XLSX.WorkSheet,
  columns: ColumnDef[],
  rowCount: number,
  includeHeaders: boolean,
  dateFormat: string,
  numberFormat: string
): void {
  const rowOffset = includeHeaders ? 1 : 0;
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const column = columns[columnIndex];
      const address = XLSX.utils.encode_cell({ r: rowIndex + rowOffset, c: columnIndex });
      const cell = worksheet[address];
      if (!cell) {
        continue;
      }

      if (column.type === 'number' && typeof cell.v === 'number') {
        cell.t = 'n';
        cell.z = numberFormat;
        continue;
      }

      if (column.type === 'date') {
        cell.z = dateFormat;
      }
    }
  }
}

export async function exportGridToExcel(grid: Grid, options: ExcelExportOptions = {}): Promise<ExcelExportResult> {
  const scope = coerceExportScope(options.scope);
  const includeHeaders = options.includeHeaders !== false;
  const includeSystemColumns = options.includeSystemColumns === true;
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? DEFAULT_EXPORT_CHUNK_SIZE));
  const maxClientRows = Math.max(1, Math.floor(options.maxClientRows ?? DEFAULT_MAX_CLIENT_EXPORT_ROWS));
  const dateFormat = options.dateFormat ?? DEFAULT_EXPORT_DATE_FORMAT;
  const numberFormat = options.numberFormat ?? DEFAULT_EXPORT_NUMBER_FORMAT;
  const sheetName = (options.sheetName ?? DEFAULT_SHEET_NAME).trim() || DEFAULT_SHEET_NAME;
  const operationId = `xlsx-export-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  const columns = resolveExportColumns(grid, scope, includeSystemColumns);
  const rowSegments = resolveExportRowSegments(grid, scope);
  const totalRows = countSegmentRows(rowSegments);

  if (totalRows > maxClientRows && typeof options.serverExportHook === 'function') {
    const serverResult = await options.serverExportHook({
      operationId,
      scope,
      totalRows,
      columns,
      selection: grid.getSelection()
    });

    emitProgress(options.onProgress, {
      operationId,
      scope,
      status: 'delegated',
      processedRows: 0,
      totalRows,
      progress: 0
    });

    return {
      operationId,
      scope,
      sheetName,
      rowCount: 0,
      totalRows,
      canceled: false,
      delegated: true,
      workbook: null,
      buffer: null,
      serverResult
    };
  }

  const allColumns = grid.getColumns();
  const dataProvider = grid.getDataProvider();
  const rows: Array<Array<string | number | boolean | Date>> = [];

  if (includeHeaders) {
    rows.push(columns.map((column) => column.header));
  }

  let canceled = options.signal?.aborted === true;
  let processedRows = 0;

  if (!canceled && totalRows > 0) {
    emitProgress(options.onProgress, {
      operationId,
      scope,
      status: 'running',
      processedRows: 0,
      totalRows,
      progress: 0
    });
  }

  outer: for (let segmentIndex = 0; segmentIndex < rowSegments.length; segmentIndex += 1) {
    const segment = rowSegments[segmentIndex];
    for (let rowIndex = segment.startRow; rowIndex <= segment.endRow; rowIndex += 1) {
      if (options.signal?.aborted) {
        canceled = true;
        break outer;
      }

      const dataIndex = grid.getDataIndex(rowIndex);
      if (dataIndex < 0) {
        continue;
      }

      const rowSnapshot = buildRowSnapshot(dataProvider, dataIndex, allColumns);
      const rowValues = new Array<string | number | boolean | Date>(columns.length);
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        const rawValue = resolveColumnRawValue(column, rowSnapshot, dataProvider, dataIndex);
        rowValues[columnIndex] = coerceExportCellValue(column, rawValue);
      }

      rows.push(rowValues);
      processedRows += 1;

      if (processedRows % chunkSize === 0) {
        emitProgress(options.onProgress, {
          operationId,
          scope,
          status: 'running',
          processedRows,
          totalRows,
          progress: totalRows > 0 ? Math.min(1, processedRows / totalRows) : 1
        });
        await yieldFrame();
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });
  applySheetFormats(worksheet, columns, processedRows, includeHeaders, dateFormat, numberFormat);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const buffer = toArrayBuffer(
    XLSX.write(workbook, {
      bookType: 'xlsx',
      compression: true,
      type: 'array'
    }) as ArrayBuffer | Uint8Array
  );

  emitProgress(options.onProgress, {
    operationId,
    scope,
    status: canceled ? 'canceled' : 'completed',
    processedRows,
    totalRows,
    progress: totalRows > 0 ? Math.min(1, processedRows / totalRows) : 1
  });

  return {
    operationId,
    scope,
    sheetName,
    rowCount: processedRows,
    totalRows,
    canceled,
    delegated: false,
    workbook,
    buffer
  };
}

export function downloadExcelFile(result: ExcelExportResult, fileName = 'hgrid-export.xlsx'): void {
  if (result.delegated) {
    if (result.serverResult?.downloadUrl) {
      window.open(result.serverResult.downloadUrl, '_blank', 'noopener');
      return;
    }

    throw new Error('Delegated export result does not include downloadUrl.');
  }

  if (!result.buffer) {
    throw new Error('No client-side workbook buffer to download.');
  }

  const blob = new Blob([result.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function parseExcelSerialDate(rawValue: number): Date | null {
  if (!Number.isFinite(rawValue)) {
    return null;
  }

  const utcMilliseconds = Math.round((rawValue - 25569) * 86400 * 1000);
  const date = new Date(utcMilliseconds);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return date;
}

function coerceImportedCellValue(value: unknown, columnType: ColumnDef['type']): unknown {
  if (columnType === 'number') {
    const numberValue = normalizeNumberLikeValue(value);
    if (numberValue !== null) {
      return numberValue;
    }
    return value;
  }

  if (columnType === 'date') {
    if (value instanceof Date && Number.isFinite(value.getTime())) {
      return value;
    }

    if (typeof value === 'number') {
      const serialDate = parseExcelSerialDate(value);
      if (serialDate) {
        return serialDate;
      }
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return null;
      }

      const date = new Date(trimmed);
      if (Number.isFinite(date.getTime())) {
        return date;
      }
    }

    return value;
  }

  if (columnType === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value !== 0;
    }

    if (typeof value === 'string') {
      const token = value.trim().toLowerCase();
      if (token === 'true' || token === 'y' || token === 'yes' || token === '1') {
        return true;
      }
      if (token === 'false' || token === 'n' || token === 'no' || token === '0') {
        return false;
      }
    }

    return value;
  }

  if (value === null || value === undefined) {
    return '';
  }

  return typeof value === 'string' ? value : String(value);
}

function isWorkbookLike(source: ExcelImportSource): source is XLSX.WorkBook {
  const candidate = source as XLSX.WorkBook;
  return Boolean(
    candidate &&
      Array.isArray(candidate.SheetNames) &&
      typeof candidate.Sheets === 'object' &&
      candidate.Sheets !== null
  );
}

async function resolveWorkbook(source: ExcelImportSource): Promise<XLSX.WorkBook> {
  if (isWorkbookLike(source)) {
    return source;
  }

  if (source instanceof Blob) {
    const buffer = await source.arrayBuffer();
    return XLSX.read(buffer, {
      type: 'array',
      cellDates: true
    });
  }

  return XLSX.read(source, {
    type: 'array',
    cellDates: true
  });
}

function resolveSheet(workbook: XLSX.WorkBook, options: ExcelImportOptions): { sheetName: string; sheet: XLSX.WorkSheet } {
  const byName = options.sheetName;
  if (byName && workbook.Sheets[byName]) {
    return {
      sheetName: byName,
      sheet: workbook.Sheets[byName]
    };
  }

  const sheetIndex = clampInteger(options.sheetIndex ?? 0, 0, Math.max(0, workbook.SheetNames.length - 1));
  const sheetName = workbook.SheetNames[sheetIndex];
  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error('Excel sheet not found.');
  }

  return {
    sheetName,
    sheet: workbook.Sheets[sheetName]
  };
}

function resolveImportColumnMappings(
  headerRow: unknown[],
  columns: ColumnDef[],
  policy: ExcelHeaderMappingPolicy,
  skipUnknownColumns: boolean,
  issues: ExcelImportIssue[]
): ResolvedImportColumn[] {
  const idExact = new Map<string, ColumnDef>();
  const idInsensitive = new Map<string, ColumnDef>();
  const headerExact = new Map<string, ColumnDef>();
  const headerInsensitive = new Map<string, ColumnDef>();

  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    idExact.set(column.id, column);
    idInsensitive.set(column.id.toLowerCase(), column);
    headerExact.set(column.header, column);
    headerInsensitive.set(column.header.toLowerCase(), column);
  }

  const mappings: ResolvedImportColumn[] = [];
  const mappedColumnIds = new Set<string>();

  for (let sheetColumnIndex = 0; sheetColumnIndex < headerRow.length; sheetColumnIndex += 1) {
    const rawHeader = headerRow[sheetColumnIndex];
    const headerToken = normalizeHeaderToken(rawHeader);
    const headerTokenInsensitive = normalizeHeaderTokenInsensitive(rawHeader);
    if (headerToken.length === 0) {
      continue;
    }

    let column: ColumnDef | undefined;
    if (policy === 'id') {
      column = idExact.get(headerToken) ?? idInsensitive.get(headerTokenInsensitive);
    } else if (policy === 'header') {
      column = headerExact.get(headerToken) ?? headerInsensitive.get(headerTokenInsensitive);
    } else {
      column =
        idExact.get(headerToken) ??
        idInsensitive.get(headerTokenInsensitive) ??
        headerExact.get(headerToken) ??
        headerInsensitive.get(headerTokenInsensitive);
    }

    if (!column) {
      if (!skipUnknownColumns) {
        issues.push({
          kind: 'mapping',
          sheetRowNumber: 1,
          message: `Unknown header: ${headerToken}`,
          value: rawHeader
        });
      }
      continue;
    }

    if (mappedColumnIds.has(column.id)) {
      issues.push({
        kind: 'mapping',
        sheetRowNumber: 1,
        columnId: column.id,
        message: `Duplicate mapped header for column: ${column.id}`,
        value: rawHeader
      });
      continue;
    }

    mappedColumnIds.add(column.id);
    mappings.push({
      sheetColumnIndex,
      column
    });
  }

  return mappings;
}

function isEmptyRow(values: unknown[]): boolean {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      continue;
    }

    return false;
  }

  return true;
}

async function applyCellValidator(
  validator: ExcelImportOptions['validateCell'],
  context: ExcelImportCellContext
): Promise<ExcelImportCellValidationResult | undefined> {
  if (typeof validator !== 'function') {
    return {
      accept: true,
      value: context.value
    };
  }

  const result = await validator(context);
  if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'accept')) {
    const validationResult = result as ExcelImportCellValidationResult;
    return {
      accept: validationResult.accept !== false,
      value: Object.prototype.hasOwnProperty.call(validationResult, 'value') ? validationResult.value : context.value,
      message: validationResult.message
    };
  }

  if (result === undefined) {
    return {
      accept: true,
      value: context.value
    };
  }

  return {
    accept: true,
    value: result
  };
}

async function applyRowValidator(
  validator: ExcelImportOptions['validateRow'],
  context: ExcelImportRowContext
): Promise<ExcelImportRowValidationResult> {
  if (typeof validator !== 'function') {
    return {
      accept: true,
      values: context.values
    };
  }

  const result = await validator(context);
  if (typeof result === 'boolean') {
    return {
      accept: result,
      values: context.values
    };
  }

  if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'accept')) {
    const validationResult = result as ExcelImportRowValidationResult;
    return {
      accept: validationResult.accept !== false,
      values: validationResult.values ?? context.values,
      message: validationResult.message
    };
  }

  if (result && typeof result === 'object') {
    return {
      accept: true,
      values: {
        ...context.values,
        ...(result as Record<string, unknown>)
      }
    };
  }

  return {
    accept: true,
    values: context.values
  };
}

function flushImportTransactions(dataProvider: DataProvider, transactions: DataTransaction[]): void {
  if (transactions.length === 0) {
    return;
  }

  dataProvider.applyTransactions(transactions.splice(0, transactions.length));
}

export async function importExcelToGrid(
  grid: Grid,
  source: ExcelImportSource,
  options: ExcelImportOptions = {}
): Promise<ExcelImportResult> {
  const workbook = await resolveWorkbook(source);
  const { sheetName, sheet } = resolveSheet(workbook, options);
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false
  }) as unknown[][];

  const headerRowIndex = Math.max(0, Math.floor(options.headerRowIndex ?? 0));
  const startRowIndex = Math.max(0, Math.floor(options.startRowIndex ?? 0));
  const policy = options.headerMappingPolicy ?? 'auto';
  const skipUnknownColumns = options.skipUnknownColumns !== false;
  const validationMode = options.validationMode ?? 'skipInvalidRows';
  const conflictMode = options.conflictMode ?? 'overwrite';
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? DEFAULT_IMPORT_BATCH_SIZE));
  const issues: ExcelImportIssue[] = [];

  const gridColumns = grid.getColumns().filter((column) => !isSystemUtilityColumn(column.id));
  const headerRow = matrix[headerRowIndex] ?? [];
  const mappings = resolveImportColumnMappings(headerRow, gridColumns, policy, skipUnknownColumns, issues);

  const mappedColumns = mappings.map((mapping) => mapping.column.id);
  const dataProvider = grid.getDataProvider();
  const viewRowCount = grid.getViewRowCount();
  const transactions: DataTransaction[] = [];

  let importedRows = 0;
  let updatedRows = 0;
  let addedRows = 0;
  let conflictRows = 0;
  const conflicts: ExcelImportConflict[] = [];

  for (let sheetRowIndex = headerRowIndex + 1; sheetRowIndex < matrix.length; sheetRowIndex += 1) {
    const sheetRow = matrix[sheetRowIndex] ?? [];
    if (isEmptyRow(sheetRow)) {
      continue;
    }

    const sheetRowNumber = sheetRowIndex + 1;
    let rejectRow = false;
    const rowValues: Record<string, unknown> = {};

    for (let mappingIndex = 0; mappingIndex < mappings.length; mappingIndex += 1) {
      const mapping = mappings[mappingIndex];
      const rawValue = sheetRow[mapping.sheetColumnIndex];
      const coercedValue = coerceImportedCellValue(rawValue, mapping.column.type);

      const validation = await applyCellValidator(options.validateCell, {
        sheetRowNumber,
        sheetColumnIndex: mapping.sheetColumnIndex,
        column: mapping.column,
        columnId: mapping.column.id,
        rawValue,
        value: coercedValue,
        rowValues
      });

      if (!validation || validation.accept === false) {
        issues.push({
          kind: 'validation',
          sheetRowNumber,
          columnId: mapping.column.id,
          message: validation?.message ?? 'Cell validation failed.',
          value: rawValue
        });
        rejectRow = true;
        if (validationMode === 'rejectOnError') {
          throw new Error(`Import rejected at row ${sheetRowNumber}, column ${mapping.column.id}`);
        }
        continue;
      }

      rowValues[mapping.column.id] = validation.value;
    }

    if (rejectRow) {
      continue;
    }

    const rowValidation = await applyRowValidator(options.validateRow, {
      sheetRowNumber,
      values: rowValues
    });

    if (rowValidation.accept === false) {
      issues.push({
        kind: 'validation',
        sheetRowNumber,
        message: rowValidation.message ?? 'Row validation failed.'
      });
      if (validationMode === 'rejectOnError') {
        throw new Error(`Import rejected at row ${sheetRowNumber}`);
      }
      continue;
    }

    const validatedValues = rowValidation.values ?? rowValues;
    const targetViewRowIndex = startRowIndex + importedRows;

    if (targetViewRowIndex < viewRowCount) {
      const dataIndex = grid.getDataIndex(targetViewRowIndex);
      if (dataIndex >= 0) {
        const currentRow = buildRowSnapshot(dataProvider, dataIndex, gridColumns);
        let nextValues = validatedValues;
        const conflictingColumnIds = Object.keys(validatedValues).filter((columnId) => !Object.is(currentRow[columnId], validatedValues[columnId]));
        if (conflictingColumnIds.length > 0) {
          let action: ExcelImportConflictAction = conflictMode === 'overwrite' ? 'overwrite' : 'skip';
          let message: string | undefined;

          if (typeof options.resolveConflict === 'function') {
            const resolution = await options.resolveConflict({
              sheetRowNumber,
              targetRowIndex: targetViewRowIndex,
              dataIndex,
              currentValues: { ...currentRow },
              incomingValues: { ...validatedValues },
              conflictingColumnIds: [...conflictingColumnIds],
              defaultAction: action
            });
            if (resolution) {
              action = resolution.action === 'overwrite' ? 'overwrite' : 'skip';
              if (resolution.values && typeof resolution.values === 'object') {
                nextValues = {
                  ...nextValues,
                  ...resolution.values
                };
              }
              message = resolution.message;
            }
          }

          conflicts.push({
            sheetRowNumber,
            targetRowIndex: targetViewRowIndex,
            dataIndex,
            columnIds: conflictingColumnIds,
            currentValues: Object.fromEntries(conflictingColumnIds.map((columnId) => [columnId, currentRow[columnId]])),
            incomingValues: Object.fromEntries(conflictingColumnIds.map((columnId) => [columnId, nextValues[columnId]])),
            action,
            message
          });
          conflictRows += 1;

          if (action === 'skip') {
            issues.push({
              kind: 'conflict',
              sheetRowNumber,
              message:
                message ??
                `Conflict on row ${targetViewRowIndex + 1}: ${conflictingColumnIds.join(', ')}`
            });
            continue;
          }
        }

        transactions.push({
          type: 'update',
          index: dataIndex,
          row: {
            ...currentRow,
            ...nextValues
          }
        });
        updatedRows += 1;
      }
    } else {
      transactions.push({
        type: 'add',
        rows: [{ ...validatedValues }]
      });
      addedRows += 1;
    }

    importedRows += 1;

    if (transactions.length >= batchSize) {
      flushImportTransactions(dataProvider, transactions);
      await yieldFrame();
    }
  }

  flushImportTransactions(dataProvider, transactions);
  grid.refresh();

  return {
    sheetName,
    totalRows: Math.max(0, matrix.length - (headerRowIndex + 1)),
    importedRows,
    updatedRows,
    addedRows,
    conflictRows,
    mappedColumns,
    conflicts,
    issues
  };
}

export function createExcelPlugin(config: ExcelPluginConfig = {}): ExcelPlugin {
  const defaultSheetName = (config.defaultSheetName ?? DEFAULT_SHEET_NAME).trim() || DEFAULT_SHEET_NAME;
  const maxClientExportRows = Math.max(1, Math.floor(config.maxClientExportRows ?? DEFAULT_MAX_CLIENT_EXPORT_ROWS));
  const defaultHeaderMappingPolicy = config.defaultHeaderMappingPolicy ?? 'auto';

  return {
    exportXlsx(grid, options = {}) {
      return exportGridToExcel(grid, {
        ...options,
        sheetName: options.sheetName ?? defaultSheetName,
        maxClientRows: options.maxClientRows ?? maxClientExportRows
      });
    },
    importXlsx(grid, source, options = {}) {
      return importExcelToGrid(grid, source, {
        ...options,
        headerMappingPolicy: options.headerMappingPolicy ?? defaultHeaderMappingPolicy
      });
    },
    download(result, fileName) {
      downloadExcelFile(result, fileName);
    }
  };
}
