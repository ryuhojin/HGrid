# Phase E4.3 - Clipboard / Import / Export Hardening

## 목표
- clipboard paste 경로를 `text/plain` 중심으로 고정하고 `text/html` only payload의 회귀를 막는다.
- CSV/TSV/Excel export 옵션을 같은 mental model로 문서화한다.
- Excel import에서 overwrite/skip/report conflict policy를 제품 계약으로 고정한다.
- 대용량 Excel export는 server delegation UX를 명시적으로 문서화한다.

## 1. Clipboard Security Regression
- grid body paste는 편집 overlay가 열려 있지 않을 때 `text/plain`만 소비한다.
- `text/plain`이 없고 `text/html`만 있는 payload는 no-op 처리하고 `preventDefault()`로 끝낸다.
- 의미:
  - clipboard HTML markup를 grid body에 직접 주입하지 않는다.
  - rich clipboard가 들어와도 편집 모드 밖에서는 plain text pipeline만 탄다.

## 2. Shared Export Contract
CSV/TSV core export와 Excel plugin export는 아래 옵션 의미를 공유한다.

- `scope: "visible" | "selection" | "all"`
- `includeHeaders?: boolean`
- `signal?: AbortSignal`
- `onProgress?(event)`

Excel plugin export는 여기에 아래 옵션을 추가한다.

- `sheetName?: string`
- `dateFormat?: string`
- `numberFormat?: string`
- `maxClientRows?: number`
- `serverExportHook?(context)`

즉 제품 문서와 example는 아래 규칙으로 설명한다.

- `scope/includeHeaders/signal/onProgress`는 export format 공통 계약
- `date/number format`, `server delegation`은 xlsx 전용 계약

## 3. Excel Import Conflict Policy
`ExcelImportOptions`

- `conflictMode?: "overwrite" | "skipConflicts" | "reportOnly"`
- `resolveConflict?(context)`

`ExcelImportResult`

- `conflictRows: number`
- `conflicts: ExcelImportConflict[]`
- `issues: ExcelImportIssue[]`

정책:

- `overwrite`
  - conflict row도 update 적용
  - `conflicts[]`에는 기록하지만 `issues[]`는 강제하지 않는다
- `skipConflicts`
  - conflict row를 건너뛴다
  - `issues[]`에 conflict issue를 남긴다
- `reportOnly`
  - apply 없이 report만 남긴다
  - `issues[]`에 conflict issue를 남긴다
- `resolveConflict`
  - row 단위 custom overwrite/skip 결정과 override value를 줄 수 있다

## 4. Server Delegation UX
- xlsx export는 `maxClientRows` 임계치 초과 시 `serverExportHook`으로 위임할 수 있다.
- 이 경우 progress는 `status: "delegated"`를 emit하고, result는:
  - `delegated: true`
  - `serverResult.downloadUrl?`
  - `serverResult.fileName?`
  - `serverResult.meta?`

권장 UX:

- client export 버튼과 같은 위치에서 실행
- delegated면 grid가 직접 파일을 만들지 않고 “서버 export 요청 완료” 상태를 보여준다
- 다운로드 URL이 있으면 앱 toolbar/notification에서 link를 제공한다

## Example / e2e
- clipboard security regression: `examples/example34.html`
- export/import conflict + delegation smoke: `examples/example86.html`
- e2e:
  - `scripts/run-e2e.mjs` `runExample34Checks`
  - `scripts/run-e2e.mjs` `runExample86Checks`
