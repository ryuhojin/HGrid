import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '../src/core/grid-options';
import { GridExportService } from '../src/core/grid-export-service';
import type { GridRowData } from '../src/data/data-provider';
import type { GridSelection } from '../src/interaction/selection-model';

function createSelection(selection?: Partial<GridSelection>): GridSelection {
  return {
    activeCell: null,
    cellRanges: [],
    rowRanges: [],
    ...selection
  };
}

describe('GridExportService', () => {
  it('exports all rows as CSV and escapes delimited values', async () => {
    const service = new GridExportService();
    const columns: ColumnDef[] = [
      { id: '__indicator', header: '#', width: 40, type: 'text' },
      { id: 'id', header: 'ID', width: 80, type: 'number' },
      { id: 'name', header: 'Name', width: 140, type: 'text' }
    ];
    const rows: GridRowData[] = [
      { __indicator: '*', id: 1, name: 'Alpha, "One"' },
      { __indicator: '*', id: 2, name: 'Beta' }
    ];

    const result = await service.exportDelimited({
      format: 'csv',
      delimiter: ',',
      options: {},
      rendererOrderedColumns: columns,
      selection: createSelection(),
      visibleRowRange: null,
      viewRowCount: rows.length,
      getDataIndex: (rowIndex) => rowIndex,
      getRow: (dataIndex) => rows[dataIndex],
      getValue: (dataIndex, columnId) => rows[dataIndex]?.[columnId],
      formatCell: (column, row) => String(row[column.id] ?? ''),
      isSystemColumn: (columnId) => columnId.startsWith('__'),
      yieldControl: async () => undefined
    });

    expect(result.format).toBe('csv');
    expect(result.scope).toBe('all');
    expect(result.rowCount).toBe(2);
    expect(result.content).toBe('ID,Name\n1,"Alpha, ""One"""\n2,Beta');
  });

  it('exports selection scope using selected rows and columns', async () => {
    const service = new GridExportService();
    const columns: ColumnDef[] = [
      { id: 'id', header: 'ID', width: 80, type: 'number' },
      { id: 'name', header: 'Name', width: 140, type: 'text' },
      { id: 'status', header: 'Status', width: 120, type: 'text' }
    ];
    const rows: GridRowData[] = [
      { id: 1, name: 'Alpha', status: 'active' },
      { id: 2, name: 'Beta', status: 'idle' },
      { id: 3, name: 'Gamma', status: 'hold' }
    ];

    const result = await service.exportDelimited({
      format: 'tsv',
      delimiter: '\t',
      options: {
        scope: 'selection',
        includeHeaders: false
      },
      rendererOrderedColumns: columns,
      selection: createSelection({
        activeCell: { rowIndex: 0, colIndex: 1 },
        cellRanges: [{ r1: 0, c1: 1, r2: 1, c2: 2 }]
      }),
      visibleRowRange: null,
      viewRowCount: rows.length,
      getDataIndex: (rowIndex) => rowIndex,
      getRow: (dataIndex) => rows[dataIndex],
      getValue: (dataIndex, columnId) => rows[dataIndex]?.[columnId],
      formatCell: (column, row) => String(row[column.id] ?? ''),
      isSystemColumn: () => false,
      yieldControl: async () => undefined
    });

    expect(result.format).toBe('tsv');
    expect(result.scope).toBe('selection');
    expect(result.rowCount).toBe(2);
    expect(result.content).toBe('Alpha\tactive\nBeta\tidle');
  });

  it('reports progress and supports cancellation', async () => {
    const service = new GridExportService();
    const columns: ColumnDef[] = [{ id: 'id', header: 'ID', width: 80, type: 'number' }];
    const rows: GridRowData[] = Array.from({ length: 5 }, (_value, index) => ({ id: index + 1 }));
    const controller = new AbortController();
    const progressEvents: Array<{ status: string; processedRows: number; totalRows: number }> = [];

    const result = await service.exportDelimited({
      format: 'csv',
      delimiter: ',',
      options: {
        scope: 'all',
        chunkSize: 2,
        signal: controller.signal,
        onProgress(event) {
          progressEvents.push({
            status: event.status,
            processedRows: event.processedRows,
            totalRows: event.totalRows
          });
          if (event.status === 'running' && event.processedRows >= 2 && !controller.signal.aborted) {
            controller.abort();
          }
        }
      },
      rendererOrderedColumns: columns,
      selection: createSelection(),
      visibleRowRange: null,
      viewRowCount: rows.length,
      getDataIndex: (rowIndex) => rowIndex,
      getRow: (dataIndex) => rows[dataIndex],
      getValue: (dataIndex, columnId) => rows[dataIndex]?.[columnId],
      formatCell: (column, row) => String(row[column.id] ?? ''),
      isSystemColumn: () => false,
      yieldControl: async () => undefined
    });

    expect(result.canceled).toBe(true);
    expect(result.rowCount).toBe(2);
    expect(result.content).toBe('ID\n1\n2');
    expect(progressEvents[0]).toEqual({
      status: 'running',
      processedRows: 0,
      totalRows: 5
    });
    expect(progressEvents[progressEvents.length - 1]).toEqual({
      status: 'canceled',
      processedRows: 2,
      totalRows: 5
    });
  });
});
