import type { DataProvider, DataTransaction, GridRowData, RowKey } from './data-provider';

export type ColumnarStorageKind = 'number' | 'date' | 'boolean' | 'string-table' | 'raw';

export interface ColumnarField {
  id: string;
  kind: ColumnarStorageKind;
  values: ArrayLike<number | string | boolean | null>;
  stringTable?: string[];
}

export interface ColumnarDataProviderConfig {
  rowCount: number;
  rowKeys?: RowKey[];
  fields: ColumnarField[];
}

function assertFieldLength(values: ArrayLike<number | string | boolean | null>, rowCount: number, fieldId: string): void {
  if (values.length !== rowCount) {
    throw new Error(`Columnar field length mismatch: ${fieldId}`);
  }
}

function mapFields(fields: ColumnarField[], rowCount: number): Map<string, ColumnarField> {
  const mapped = new Map<string, ColumnarField>();

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    assertFieldLength(field.values, rowCount, field.id);

    if (mapped.has(field.id)) {
      throw new Error(`Duplicate column id in columnar provider: ${field.id}`);
    }

    mapped.set(field.id, field);
  }

  return mapped;
}

export class ColumnarDataProvider implements DataProvider {
  private readonly rowCount: number;
  private readonly rowKeys?: RowKey[];
  private readonly fieldsById: Map<string, ColumnarField>;

  public constructor(config: ColumnarDataProviderConfig) {
    this.rowCount = config.rowCount;
    this.rowKeys = config.rowKeys;
    this.fieldsById = mapFields(config.fields, config.rowCount);
  }

  public getRowCount(): number {
    return this.rowCount;
  }

  public getRowKey(dataIndex: number): RowKey {
    if (this.rowKeys && this.rowKeys[dataIndex] !== undefined) {
      return this.rowKeys[dataIndex];
    }

    return dataIndex;
  }

  public getValue(dataIndex: number, columnId: string): unknown {
    const field = this.fieldsById.get(columnId);
    if (!field) {
      return undefined;
    }

    const rawValue = field.values[dataIndex];

    if (field.kind === 'string-table') {
      const code = Number(rawValue);
      if (!field.stringTable || !Number.isFinite(code)) {
        return undefined;
      }
      return field.stringTable[code];
    }

    return rawValue;
  }

  public setValue(dataIndex: number, columnId: string, value: unknown): void {
    const field = this.fieldsById.get(columnId);
    if (!field) {
      return;
    }

    const mutableValues = field.values as number[] | string[] | boolean[] | null[];
    if (typeof mutableValues.length !== 'number' || !Array.isArray(mutableValues)) {
      throw new Error(`Column ${columnId} is not mutable in this columnar provider`);
    }

    mutableValues[dataIndex] = value as never;
  }

  public applyTransactions(transactions: DataTransaction[]): void {
    for (let index = 0; index < transactions.length; index += 1) {
      const transaction = transactions[index];
      if (transaction.type !== 'updateCell') {
        throw new Error('ColumnarDataProvider currently supports only updateCell transactions');
      }

      this.setValue(transaction.index, transaction.columnId, transaction.value);
    }
  }

  public getRow(dataIndex: number): GridRowData {
    const row: GridRowData = {};

    this.fieldsById.forEach((field, columnId) => {
      row[columnId] = this.getValue(dataIndex, columnId);
    });

    return row;
  }

  public peekRow(dataIndex: number): GridRowData {
    return this.getRow(dataIndex);
  }

  public getDataIndexByRowKey(rowKey: RowKey, dataIndexHint?: number): number {
    if (
      Number.isInteger(dataIndexHint) &&
      dataIndexHint !== undefined &&
      dataIndexHint >= 0 &&
      dataIndexHint < this.rowCount &&
      this.getRowKey(dataIndexHint) === rowKey
    ) {
      return dataIndexHint;
    }

    for (let dataIndex = 0; dataIndex < this.rowCount; dataIndex += 1) {
      if (this.getRowKey(dataIndex) === rowKey) {
        return dataIndex;
      }
    }

    return -1;
  }
}
