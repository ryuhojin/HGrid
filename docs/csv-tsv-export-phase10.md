# Phase 10.2 CSV/TSV Export

## Public API
- `grid.exportCsv(options?)`
- `grid.exportTsv(options?)`

Both methods return `Promise<GridExportResult>`.

## `GridExportOptions`
- `scope?: "visible" | "selection" | "all"` (default: `"all"`)
- `includeHeaders?: boolean` (default: `true`)
- `includeSystemColumns?: boolean` (default: `false`)
- `chunkSize?: number` (default: `2000`)
- `signal?: AbortSignal`
- `onProgress?(event: GridExportProgressEvent)`

## `GridExportProgressEvent`
- `operationId: string`
- `format: "csv" | "tsv"`
- `scope: "visible" | "selection" | "all"`
- `status: "running" | "completed" | "canceled"`
- `processedRows: number`
- `totalRows: number`
- `progress: number` (`0..1`)

## `GridExportResult`
- `operationId: string`
- `format: "csv" | "tsv"`
- `scope: "visible" | "selection" | "all"`
- `content: string`
- `rowCount: number`
- `canceled: boolean`

## Scope Behavior
- `visible`: current viewport range (renderer row window 기준)
- `selection`:
  - cell range가 있으면 첫 range의 row/col 범위를 export
  - row range만 있으면 선택 row 전체를 export
  - activeCell만 있으면 단일 row export
- `all`: 현재 view row 전체 export

## Performance/Cancel
- all export는 chunk 단위(`chunkSize`)로 진행되며 chunk마다 progress callback을 호출한다.
- `AbortSignal`로 취소할 수 있으며 취소 시 `GridExportResult.canceled === true`로 반환된다.
- 동기 루프를 피하기 위해 chunk 사이에 rAF yield를 수행한다.
