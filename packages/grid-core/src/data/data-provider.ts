export type RowKey = string | number;
export type GridRowData = Record<string, unknown>;
export type RowsChangedListener = () => void;

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

export interface HistoryCellUpdate {
  rowKey: RowKey;
  dataIndexHint: number;
  columnId: string;
  currentValue: unknown;
  nextValue: unknown;
}

export interface AppliedHistoryCellUpdate {
  rowKey: RowKey;
  dataIndex: number;
  columnId: string;
  previousValue: unknown;
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
  peekRow?(dataIndex: number): GridRowData | undefined;
  getDataIndexByRowKey?(rowKey: RowKey, dataIndexHint?: number): number;
  applyHistoryUpdates?(updates: HistoryCellUpdate[]): AppliedHistoryCellUpdate[];
  onRowsChanged?(listener: RowsChangedListener): () => void;
  isRowLoading?(dataIndex: number): boolean;
}
