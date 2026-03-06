import { describe, expect, it } from 'vitest';
import { ColumnModel, createColumnValueFormatContext, formatColumnValue, getColumnValue } from '../src/data/column-model';

describe('ColumnModel', () => {
  it('normalizes width bounds and visibility defaults', () => {
    const model = new ColumnModel([
      { id: 'id', header: 'ID', width: 10, minWidth: 60, maxWidth: 120, type: 'number' },
      { id: 'name', header: 'Name', width: 200, type: 'text', visible: false }
    ]);

    const columns = model.getColumns();

    expect(columns[0].width).toBe(60);
    expect(columns[0].minWidth).toBe(60);
    expect(columns[0].maxWidth).toBe(120);
    expect(columns[1].visible).toBe(false);
    expect(model.getVisibleColumns().map((column) => column.id)).toEqual(['id']);
  });

  it('updates column order, visibility, and width independent from renderer', () => {
    const model = new ColumnModel([
      { id: 'id', header: 'ID', width: 100, type: 'number' },
      { id: 'name', header: 'Name', width: 180, minWidth: 80, maxWidth: 200, type: 'text' },
      { id: 'status', header: 'Status', width: 160, type: 'text', visible: false }
    ]);

    model.setColumnOrder(['status', 'name']);
    expect(model.getColumns().map((column) => column.id)).toEqual(['status', 'name', 'id']);

    model.setColumnVisibility('status', true);
    expect(model.getVisibleColumns().map((column) => column.id)).toEqual(['status', 'name', 'id']);

    model.setColumnWidth('name', 999);
    expect(model.getColumns().find((column) => column.id === 'name')?.width).toBe(200);
  });

  it('resolves getter and formatter values', () => {
    const row = { id: 7, firstName: 'Hana', lastName: 'Kim' };
    const column = {
      id: 'fullName',
      header: 'Full Name',
      width: 220,
      type: 'text' as const,
      valueGetter: (item: Record<string, unknown>) => `${item.firstName} ${item.lastName}`,
      formatter: (value: unknown) => `@${String(value)}`
    };

    expect(getColumnValue(column, row)).toBe('Hana Kim');
    expect(formatColumnValue(column, row)).toBe('@Hana Kim');
  });

  it('throws when duplicate ids exist', () => {
    expect(
      () =>
        new ColumnModel([
          { id: 'id', header: 'ID', width: 100, type: 'number' },
          { id: 'id', header: 'Duplicate', width: 120, type: 'text' }
        ])
    ).toThrow(/Duplicate column id/);
  });

  it('formats number/date values via Intl context locale', () => {
    const row = {
      amount: 1234567.89,
      updatedAt: '2026-03-06T00:00:00.000Z'
    };
    const numberColumn = {
      id: 'amount',
      header: 'Amount',
      width: 120,
      type: 'number' as const
    };
    const dateColumn = {
      id: 'updatedAt',
      header: 'Updated At',
      width: 180,
      type: 'date' as const
    };
    const context = createColumnValueFormatContext({
      locale: 'de-DE',
      numberFormatOptions: {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      },
      dateTimeFormatOptions: {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }
    });

    expect(formatColumnValue(numberColumn, row, context)).toBe(
      new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(1234567.89)
    );
    expect(formatColumnValue(dateColumn, row, context)).toBe(
      new Intl.DateTimeFormat('de-DE', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date('2026-03-06T00:00:00.000Z'))
    );
  });
});
