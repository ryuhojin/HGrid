export type RowKey = string | number;
export type GridRowData = Record<string, unknown>;

export type DataTransaction = AddRowsTransaction | UpdateRowTransaction | UpdateCellTransaction | RemoveRowsTransaction;

export interface AddRowsTransaction {
  type: 'add';
  rows: GridRowData[];
  index?: number;
}

export interface UpdateRowTransaction {
  type: 'update';
  index: number;
  row: GridRowData;
}

export interface UpdateCellTransaction {
  type: 'updateCell';
  index: number;
  columnId: string;
  value: unknown;
}

export interface RemoveRowsTransaction {
  type: 'remove';
  index: number;
  count?: number;
}

export interface DataProvider {
  getRowCount(): number;
  getRowKey(dataIndex: number): RowKey;
  getValue(dataIndex: number, columnId: string): unknown;
  setValue(dataIndex: number, columnId: string, value: unknown): void;
  applyTransactions(transactions: DataTransaction[]): void;
  getRow?(dataIndex: number): GridRowData | undefined;
}
