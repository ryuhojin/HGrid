import type { ColumnDef } from './grid-options';
import type { GridExportDataPort, GridVisibleRowRange } from './grid-internal-contracts';
import type { GridRowData } from '../data/data-provider';
import type { GridSelection } from '../interaction/selection-model';
export type { GridVisibleRowRange } from './grid-internal-contracts';

const DEFAULT_EXPORT_CHUNK_SIZE = 2000;
const DEFAULT_EXPORT_LINE_BREAK = '\n';

export type GridExportScope = 'visible' | 'selection' | 'all';
export type GridExportFormat = 'csv' | 'tsv';
export type GridExportStatus = 'running' | 'completed' | 'canceled';

export interface GridExportOptions {
  scope?: GridExportScope;
  includeHeaders?: boolean;
  includeSystemColumns?: boolean;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (event: GridExportProgressEvent) => void;
}

export interface GridExportProgressEvent {
  operationId: string;
  format: GridExportFormat;
  scope: GridExportScope;
  status: GridExportStatus;
  processedRows: number;
  totalRows: number;
  progress: number;
}

export interface GridExportResult {
  operationId: string;
  format: GridExportFormat;
  scope: GridExportScope;
  content: string;
  rowCount: number;
  canceled: boolean;
}

interface ExportRowSegment {
  startRow: number;
  endRow: number;
}

export interface GridExportDelimitedParams extends GridExportDataPort {
  format: GridExportFormat;
  delimiter: ',' | '\t';
  options: GridExportOptions;
}

export class GridExportService {
  private operationToken = 0;

  public async exportDelimited(params: GridExportDelimitedParams): Promise<GridExportResult> {
    const scope: GridExportScope =
      params.options.scope === 'visible' || params.options.scope === 'selection' ? params.options.scope : 'all';
    const includeHeaders = params.options.includeHeaders !== false;
    const includeSystemColumns = params.options.includeSystemColumns === true;
    const rawChunkSize = Number(params.options.chunkSize);
    const chunkSize = Number.isFinite(rawChunkSize) ? Math.max(1, Math.floor(rawChunkSize)) : DEFAULT_EXPORT_CHUNK_SIZE;
    const operationId = `export-${++this.operationToken}`;
    const columns = this.resolveExportColumns(
      params.rendererOrderedColumns,
      params.selection,
      scope,
      includeSystemColumns,
      params.isSystemColumn
    );
    const rowSegments = this.resolveExportRowSegments(scope, params.viewRowCount, params.visibleRowRange, params.selection);
    const totalRows = this.countExportRows(rowSegments);

    if (columns.length === 0) {
      this.emitProgress(params.options.onProgress, {
        operationId,
        format: params.format,
        scope,
        status: 'completed',
        processedRows: 0,
        totalRows,
        progress: 1
      });

      return {
        operationId,
        format: params.format,
        scope,
        content: '',
        rowCount: 0,
        canceled: false
      };
    }

    const lines: string[] = [];
    if (includeHeaders) {
      lines.push(this.serializeExportHeader(columns, params.delimiter));
    }

    let processedRows = 0;
    let canceled = params.options.signal?.aborted === true;
    if (!canceled && totalRows > 0) {
      this.emitProgress(params.options.onProgress, {
        operationId,
        format: params.format,
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
        if (params.options.signal?.aborted) {
          canceled = true;
          break outer;
        }

        lines.push(this.serializeExportRow(rowIndex, columns, params));
        processedRows += 1;

        if (processedRows % chunkSize === 0) {
          this.emitProgress(params.options.onProgress, {
            operationId,
            format: params.format,
            scope,
            status: 'running',
            processedRows,
            totalRows,
            progress: totalRows > 0 ? Math.min(1, processedRows / totalRows) : 1
          });
          await this.yieldControl(params.yieldControl);
          if (params.options.signal?.aborted) {
            canceled = true;
            break outer;
          }
        }
      }
    }

    const completedStatus: GridExportStatus = canceled ? 'canceled' : 'completed';
    this.emitProgress(params.options.onProgress, {
      operationId,
      format: params.format,
      scope,
      status: completedStatus,
      processedRows,
      totalRows,
      progress: totalRows > 0 ? Math.min(1, processedRows / totalRows) : 1
    });

    return {
      operationId,
      format: params.format,
      scope,
      content: lines.join(DEFAULT_EXPORT_LINE_BREAK),
      rowCount: processedRows,
      canceled
    };
  }

  private emitProgress(onProgress: GridExportOptions['onProgress'], event: GridExportProgressEvent): void {
    if (typeof onProgress !== 'function') {
      return;
    }

    onProgress(event);
  }

  private async yieldControl(yieldControl: GridExportDelimitedParams['yieldControl']): Promise<void> {
    if (yieldControl) {
      await yieldControl();
      return;
    }

    await new Promise<void>((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
        return;
      }

      setTimeout(resolve, 0);
    });
  }

  private resolveSelectionColumnIndexes(totalColumnCount: number, selection: GridSelection): number[] | null {
    if (totalColumnCount <= 0) {
      return null;
    }

    const primaryRange = selection.cellRanges[0];
    if (primaryRange) {
      const startCol = Math.max(0, Math.min(totalColumnCount - 1, Math.min(primaryRange.c1, primaryRange.c2)));
      const endCol = Math.max(0, Math.min(totalColumnCount - 1, Math.max(primaryRange.c1, primaryRange.c2)));
      const indexes: number[] = [];
      for (let colIndex = startCol; colIndex <= endCol; colIndex += 1) {
        indexes.push(colIndex);
      }
      return indexes;
    }

    if (selection.activeCell) {
      const clampedCol = Math.max(0, Math.min(totalColumnCount - 1, selection.activeCell.colIndex));
      return [clampedCol];
    }

    return null;
  }

  private resolveExportColumns(
    rendererOrderedColumns: ColumnDef[],
    selection: GridSelection,
    scope: GridExportScope,
    includeSystemColumns: boolean,
    isSystemColumn: (columnId: string) => boolean
  ): ColumnDef[] {
    const baseColumns = includeSystemColumns
      ? rendererOrderedColumns
      : rendererOrderedColumns.filter((column) => !isSystemColumn(column.id));

    if (scope !== 'selection') {
      return baseColumns;
    }

    const selectedColumnIndexes = this.resolveSelectionColumnIndexes(rendererOrderedColumns.length, selection);
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

      if (!includeSystemColumns && isSystemColumn(column.id)) {
        continue;
      }

      selectedColumns.push(column);
    }

    return selectedColumns.length > 0 ? selectedColumns : baseColumns;
  }

  private resolveExportRowSegments(
    scope: GridExportScope,
    rowCount: number,
    visibleRowRange: GridVisibleRowRange | null,
    selection: GridSelection
  ): ExportRowSegment[] {
    if (rowCount <= 0) {
      return [];
    }

    if (scope === 'all') {
      return [{ startRow: 0, endRow: rowCount - 1 }];
    }

    if (scope === 'visible') {
      if (!visibleRowRange) {
        return [];
      }

      return this.mergeExportRowSegments(
        [
          {
            startRow: visibleRowRange.startRow,
            endRow: visibleRowRange.endRow
          }
        ],
        rowCount
      );
    }

    const segments: ExportRowSegment[] = [];
    const primaryRange = selection.cellRanges[0];
    if (primaryRange) {
      segments.push({
        startRow: Math.min(primaryRange.r1, primaryRange.r2),
        endRow: Math.max(primaryRange.r1, primaryRange.r2)
      });
    } else if (selection.rowRanges.length > 0) {
      for (let rangeIndex = 0; rangeIndex < selection.rowRanges.length; rangeIndex += 1) {
        const range = selection.rowRanges[rangeIndex];
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

    return this.mergeExportRowSegments(segments, rowCount);
  }

  private mergeExportRowSegments(segments: ExportRowSegment[], rowCount: number): ExportRowSegment[] {
    if (segments.length === 0 || rowCount <= 0) {
      return [];
    }

    const normalized: ExportRowSegment[] = [];
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const startRow = Math.max(0, Math.min(rowCount - 1, Math.min(segment.startRow, segment.endRow)));
      const endRow = Math.max(0, Math.min(rowCount - 1, Math.max(segment.startRow, segment.endRow)));
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

  private countExportRows(segments: ExportRowSegment[]): number {
    let rowCount = 0;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      rowCount += Math.max(0, segment.endRow - segment.startRow + 1);
    }
    return rowCount;
  }

  private serializeExportHeader(columns: ColumnDef[], delimiter: ',' | '\t'): string {
    const cells = new Array<string>(columns.length);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      cells[columnIndex] = this.escapeDelimitedValue(columns[columnIndex].header, delimiter);
    }

    return cells.join(delimiter);
  }

  private serializeExportRow(rowIndex: number, columns: ColumnDef[], params: GridExportDelimitedParams): string {
    const dataIndex = params.getDataIndex(rowIndex);
    const row = this.buildExportRowData(dataIndex, columns, params);
    const cells = new Array<string>(columns.length);
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      cells[columnIndex] = this.escapeDelimitedValue(params.formatCell(columns[columnIndex], row), params.delimiter);
    }

    return cells.join(params.delimiter);
  }

  private buildExportRowData(
    dataIndex: number,
    columns: ColumnDef[],
    params: GridExportDelimitedParams
  ): GridRowData {
    if (dataIndex < 0) {
      return {};
    }

    const providerRow = params.getRow(dataIndex);
    if (providerRow) {
      return providerRow;
    }

    const fallbackRow: GridRowData = {};
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      const columnId = columns[columnIndex].id;
      fallbackRow[columnId] = params.getValue(dataIndex, columnId);
    }

    return fallbackRow;
  }

  private escapeDelimitedValue(value: string, delimiter: ',' | '\t'): string {
    if (value.length === 0) {
      return '';
    }

    const shouldQuote =
      value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r');
    if (!shouldQuote) {
      return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
  }
}
