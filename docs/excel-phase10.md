# Phase 10.3 — Excel(xlsx) Plugin

## 목표
- xlsx 기능을 `grid-core`에서 분리해 `packages/grid-plugins/excel`에서 제공
- export: 기본 시트/헤더 + number/date formatting + progress/cancel
- import: 헤더 매핑 정책 + validation pipeline + conflict policy
- 대용량은 server export hook으로 위임 가능

## 패키지
- package: `@hgrid/grid-plugin-excel`
- build outputs:
  - `dist/hgrid-excel.umd.js`
  - `dist/hgrid-excel.umd.min.js`
  - `dist/hgrid-excel.esm.js`
  - `dist/index.d.ts`

## Core 공개 훅 (plugin 연동용)
`Grid`에 아래 읽기/리프레시 API가 추가되었다.
- `getColumns()`
- `getVisibleColumns()`
- `getDataProvider()`
- `getViewRowCount()`
- `getDataIndex(rowIndex)`
- `getVisibleRowRange()`
- `refresh()`

## Export API
```ts
import { createExcelPlugin } from '@hgrid/grid-plugin-excel';

const excel = createExcelPlugin({
  defaultSheetName: 'HGrid Export',
  maxClientExportRows: 200_000
});

const result = await excel.exportXlsx(grid, {
  scope: 'selection', // visible | selection | all
  includeHeaders: true,
  dateFormat: 'yyyy-mm-dd hh:mm:ss',
  numberFormat: '#,##0.00',
  onProgress(event) {
    console.log(event.status, event.processedRows, event.totalRows);
  },
  signal: abortController.signal,
  serverExportHook: async (context) => {
    // 대용량은 서버로 위임
    return {
      delegated: true,
      downloadUrl: '/api/export/xlsx?op=' + encodeURIComponent(context.operationId)
    };
  }
});

if (!result.delegated) {
  excel.download(result, 'export.xlsx');
}
```

## Import API
```ts
const importResult = await excel.importXlsx(grid, fileOrArrayBuffer, {
  sheetName: 'Import',
  headerMappingPolicy: 'auto', // id | header | auto
  validationMode: 'skipInvalidRows', // skipInvalidRows | rejectOnError
  conflictMode: 'skipConflicts', // overwrite | skipConflicts | reportOnly
  validateCell(context) {
    if (context.columnId === 'score' && Number(context.value) < 0) {
      return { accept: false, message: 'score must be >= 0' };
    }
    return { accept: true, value: context.value };
  },
  validateRow(context) {
    if (!context.values.name) {
      return { accept: false, message: 'name is required' };
    }
    return { accept: true };
  }
});

console.log(importResult.updatedRows, importResult.issues);
```

## Shared Export Options
CSV/TSV core export와 Excel plugin export는 아래 옵션 의미를 공유한다.

- `scope`
- `includeHeaders`
- `signal`
- `onProgress`

Excel plugin만의 추가 옵션:

- `sheetName`
- `dateFormat`
- `numberFormat`
- `maxClientRows`
- `serverExportHook`

## 헤더 매핑 정책
- `id`: 엑셀 헤더를 `column.id` 기준으로 매핑
- `header`: 엑셀 헤더를 `column.header` 기준으로 매핑
- `auto`: `id` 우선 후 `header` fallback

매핑은 대소문자 비민감 fallback을 포함한다.

## Validation Pipeline
- Cell 단계: `validateCell`
- Row 단계: `validateRow`
- 실패 처리:
  - `skipInvalidRows`: 실패 row를 건너뛰고 `issues` 누적
  - `rejectOnError`: 첫 실패에서 throw

## Conflict Pipeline
- `conflictMode`:
  - `overwrite`: 충돌 row도 update 적용
  - `skipConflicts`: 충돌 row는 건너뛰고 `issues`에 conflict 기록
  - `reportOnly`: 적용 없이 conflict만 기록
- `resolveConflict(context)`:
  - row 단위로 `overwrite`/`skip` 결정 가능
  - override values를 반환해 merge 가능
- `ExcelImportResult`:
  - `conflictRows`
  - `conflicts[]`
  - `issues[]`

## 대용량 전략
- 클라이언트 export는 `maxClientRows` 임계치 내에서만 수행 권장
- 임계치 초과 시 `serverExportHook`으로 위임
- 이유:
  - xlsx 직렬화는 한 번에 큰 메모리/CPU 부하를 유발할 수 있음
  - 서버 스트리밍/백그라운드 작업으로 안정성 확보 가능
- 권장 UX:
  - delegated export면 result의 `serverResult.downloadUrl`을 notification/toolbar에서 노출
  - progress는 `status: "delegated"`를 기준으로 상태 문구를 전환

## Example / e2e
- example: `examples/example36.html`
- example: `examples/example86.html`
- e2e: `scripts/run-e2e.mjs` `runExample36Checks`
- e2e: `scripts/run-e2e.mjs` `runExample86Checks`
