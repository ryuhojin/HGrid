import type { DataProvider, DataTransaction, GridRowData, RowKey } from './data-provider';

const DEFAULT_KEY_FIELD_CANDIDATES = ['id', 'rowId', 'key'];

function cloneRows(rows: GridRowData[]): GridRowData[] {
  const nextRows: GridRowData[] = [];

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    nextRows.push({ ...rows[rowIndex] });
  }

  return nextRows;
}

function clampIndex(index: number, length: number): number {
  if (index < 0) {
    return 0;
  }

  if (index > length) {
    return length;
  }

  return index;
}

export interface LocalDataProviderOptions {
  keyField?: string;
}

export class LocalDataProvider implements DataProvider {
  private readonly keyField?: string;
  private rows: GridRowData[];

  public constructor(rows: GridRowData[] = [], options?: LocalDataProviderOptions) {
    this.rows = cloneRows(rows);
    this.keyField = options?.keyField;
  }

  public getRowCount(): number {
    return this.rows.length;
  }

  public getRowKey(dataIndex: number): RowKey {
    const row = this.rows[dataIndex];
    if (!row) {
      return dataIndex;
    }

    const keyField = this.keyField;
    if (keyField) {
      const value = row[keyField];
      if (typeof value === 'string' || typeof value === 'number') {
        return value;
      }
    }

    for (let index = 0; index < DEFAULT_KEY_FIELD_CANDIDATES.length; index += 1) {
      const candidate = DEFAULT_KEY_FIELD_CANDIDATES[index];
      const value = row[candidate];
      if (typeof value === 'string' || typeof value === 'number') {
        return value;
      }
    }

    return dataIndex;
  }

  public getRow(dataIndex: number): GridRowData | undefined {
    return this.rows[dataIndex];
  }

  public getValue(dataIndex: number, columnId: string): unknown {
    const row = this.rows[dataIndex];
    return row ? row[columnId] : undefined;
  }

  public setValue(dataIndex: number, columnId: string, value: unknown): void {
    const row = this.rows[dataIndex];
    if (!row) {
      return;
    }

    row[columnId] = value;
  }

  public applyTransactions(transactions: DataTransaction[]): void {
    for (let transactionIndex = 0; transactionIndex < transactions.length; transactionIndex += 1) {
      const transaction = transactions[transactionIndex];

      if (transaction.type === 'add') {
        const insertAt = clampIndex(transaction.index ?? this.rows.length, this.rows.length);
        const nextRows = cloneRows(transaction.rows);
        for (let rowOffset = nextRows.length - 1; rowOffset >= 0; rowOffset -= 1) {
          this.rows.splice(insertAt, 0, nextRows[rowOffset]);
        }
        continue;
      }

      if (transaction.type === 'update') {
        const row = this.rows[transaction.index];
        if (row) {
          this.rows[transaction.index] = { ...transaction.row };
        }
        continue;
      }

      if (transaction.type === 'updateCell') {
        const row = this.rows[transaction.index];
        if (row) {
          row[transaction.columnId] = transaction.value;
        }
        continue;
      }

      if (transaction.type === 'remove') {
        const count = Math.max(1, transaction.count ?? 1);
        this.rows.splice(transaction.index, count);
      }
    }
  }
}
