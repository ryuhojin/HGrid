# Phase 1.3 DataProvider Contract

## Core DataProvider Interface
Required methods:
- `getRowCount(): number`
- `getRowKey(dataIndex): RowKey`
- `getValue(dataIndex, colId): unknown`
- `setValue(dataIndex, colId, value): void`
- `applyTransactions(tx[]): void`

Optional helper:
- `getRow(dataIndex): GridRowData | undefined`
- `peekRow(dataIndex): GridRowData | undefined`
- `getDataIndexByRowKey(rowKey, dataIndexHint?): number`

Grid uses this contract only, so provider replacement does not require Grid API changes.

## LocalDataProvider
`LocalDataProvider` is the default provider for object-array data.
- Constructor: `new LocalDataProvider(rows, options?)`
- Supports add/update/remove/updateCell transactions.
- `rowKey` resolution order: configured `keyField` -> `id|rowId|key` -> fallback index.

## ColumnarDataProvider Design (typed arrays / string table)
- Storage model: column-oriented fields (`id`, `kind`, `values`, optional `stringTable`).
- `kind: "string-table"` resolves dictionary code to string value.
- `rowCount` is fixed at provider construction for predictable memory footprint.
- Transaction scope in Phase 1.3: updateCell only (add/remove require reallocation strategy and are deferred).

## RemoteDataProvider Interface Design (block fetch + cache)
- Query model: `{ sortModel, filterModel }`
- Block request: `{ startIndex, endIndex, operationId, queryModel }`
- Data source interface: `fetchBlock(request) -> Promise<{ rows, rowKeys?, totalRowCount? }>`
- Cache config: `{ blockSize, maxBlocks, prefetchBlocks? }`
- Remote provider control API:
  - `setQueryModel(partialQueryModel)`
  - `setDataSource(dataSource)`
  - `invalidateCache()`
  - `cancelOperation(operationId)`
  - `getCacheConfig()`
