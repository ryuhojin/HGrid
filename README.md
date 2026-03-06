# HGrid

HGrid는 상용 엔터프라이즈 환경을 목표로 한 **DOM-only 가상화 데이터 그리드**입니다.
`Canvas/WebGL/OffscreenCanvas` 없이 대용량(10M~100M) 스크롤, pinned 컬럼, 수직/수평 가상화, 풀링 렌더를 제공합니다.

## 프로젝트 상태 (2026-03-06)

- 완료: `Phase 0`, `Phase 1`, `Phase 2`, `Phase 3.1~3.5`, `Phase 4.1~4.4`, `Phase 5.1~5.2`, `Phase 6.1~6.4`, `Phase 7.1~7.7`, `Phase 8.1~8.2`, `Phase 9.1~9.3`, `Phase 10.1~10.4`, `Phase 11.1~11.3`, `Phase 12.1~12.4`
- 다음 범위: `Phase 13+` (CSP hardening, benchmark gates)
- 상세 기준: `checklist.md`

구현 완료 핵심:

- 분리 스크롤 셸 (x/y native scroll source 분리 + sync lock)
- Vertical/Horizontal virtualization + binary search window
- Row/Cell pooling (스크롤 중 DOM create/remove 0 유지)
- rAF scheduler + dirty flags
- 100M scroll scaling (`MAX_SCROLL_PX` 기반 virtual/physical 매핑)
- RowModel 100M 메모리 최적화(lazy identity/sparse/materialized)
- Variable row height (`fixed | estimated | measured`) + row top map
- Event delegation/hit-test/wheel orchestration
- Selection model ranges + keyboard navigation
- Single overlay editor + sync/async validation
- Worker protocol 계약 + transferable 유틸
- Worker-first sorting/filtering executor + Grid API 연동
- Column feature pack (resize/reorder/pin/hide) + selection indicator columns
- Multi-level column group header
- Grouping pipeline (group model + key 기반 expand/collapse + sum/avg/min/max/count/custom aggregation)
- Tree data pipeline (parentId model + key expansion state + lazy children load)
- Pivot pipeline (로컬 pivot matrix + 동적 컬럼 생성 + 서버 pivot query model)
- Clipboard pipeline (selection copy TSV + plain text paste + HTML paste 방어)
- CSV/TSV export pipeline (visible/selection/all + progress + cancel)
- Excel(xlsx) plugin pipeline (plugin 분리, export/import, header mapping, validation)
- CSS Variables theme token pipeline (`.h-theme-light` / `.h-theme-dark` + `setTheme()` runtime override)
- SI Design Guide pipeline (토큰 매핑표 + 커스터마이징 레시피 + 고객사 테마 샘플)
- RemoteDataProvider block cache/LRU/prefetch + server-side query model(sort/filter/group/pivot)
- 성능 스모크(e2e heartbeat max gap)로 그룹/트리/피벗 UI freeze 회귀 점검
- ARIA Grid semantics pipeline (`aria-rowcount/colcount/rowindex/colindex` + `aria-activedescendant` focus strategy)
- Keyboard-only pipeline (navigation/selection/editing, `Ctrl/Cmd+A`, `F2`, editor `Tab/Shift+Tab`)
- i18n pipeline (`localeText` externalization, Intl number/date formatting, RTL direction option)

## 핵심 원칙

- DOM-only 렌더링
- 스크롤 핫패스에서 DOM churn 금지(풀 재사용)
- 이벤트 위임 + rAF 배치 렌더
- CSP 친화 (`eval`, `new Function`, `setTimeout("string")` 금지)
- 기본 셀 렌더는 `textContent` 사용

## Monorepo 구조

```text
.
├─ packages/
│  ├─ grid-core/        # 프레임워크 비의존 코어
│  ├─ grid-react/       # React 어댑터(얇은 wrapper)
│  ├─ grid-vue/         # Vue 어댑터(얇은 wrapper)
│  └─ grid-plugins/     # 플러그인 패키지 영역
├─ examples/            # example1~N 시나리오
├─ docs/                # phase별 설계/결정 문서
├─ scripts/             # 생성/검증/벤치 스크립트
└─ checklist.md         # 단계별 진행 체크리스트
```

## grid-core 배포 산출물

`packages/grid-core/dist`:

- `grid.umd.js` (ES5)
- `grid.umd.min.js`
- `grid.esm.js`
- `index.d.ts`
- `grid.css`

UMD 전역 네임스페이스는 `HGrid`이며 브라우저에서 `new HGrid.Grid(...)`로 사용합니다.

## 빠른 시작

```bash
pnpm install
pnpm build
pnpm verify:examples
```

예제 실행:

1. `pnpm build`
2. 브라우저에서 `examples/example1.html` 열기

## 사용 예시

### UMD

```html
<link rel="stylesheet" href="../packages/grid-core/dist/grid.css" />
<div id="grid"></div>
<script src="../packages/grid-core/dist/grid.umd.js"></script>
<script>
  const grid = new HGrid.Grid(document.getElementById('grid'), {
    columns: [
      { id: 'id', header: 'ID', width: 100, type: 'number' },
      { id: 'name', header: 'Name', width: 220, type: 'text' }
    ],
    rowData: [
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' }
    ],
    height: 420,
    rowHeight: 28,
    overscan: 8,
    overscanCols: 2
  });
</script>
```

### 정렬/필터 API

```ts
await grid.setSortModel([
  { columnId: 'score', direction: 'desc' },
  { columnId: 'name', direction: 'asc' }
]);

await grid.setFilterModel({
  score: { kind: 'number', operator: 'between', min: 200, max: 800 },
  region: { kind: 'set', values: ['KR', 'US'] }
});

await grid.clearFilterModel();
await grid.clearSortModel();
```

### Grouping API

```ts
await grid.setGroupModel([
  { columnId: 'region' },
  { columnId: 'status' }
]);

await grid.setGroupAggregations([
  { columnId: 'balance', type: 'sum' },
  { columnId: 'score', type: 'avg' },
  { columnId: 'id', type: 'count' }
]);

await grid.collapseAllGroups();
await grid.expandAllGroups();
await grid.setGroupingMode('server');
```

### Tree API

```ts
await grid.setTreeDataOptions({
  enabled: true,
  mode: 'client',
  idField: 'id',
  parentIdField: 'parentId',
  hasChildrenField: 'hasChildren',
  treeColumnId: 'name',
  defaultExpanded: false
});

await grid.setTreeExpanded(100, true);
await grid.collapseAllTreeNodes();
await grid.expandAllTreeNodes();
```

### Pivot API

```ts
await grid.setPivotingMode('client');
await grid.setGroupModel([{ columnId: 'region' }]); // row axis
await grid.setPivotModel([{ columnId: 'month' }]);  // column axis
await grid.setPivotValues([{ columnId: 'sales', type: 'sum' }]);

await grid.clearPivotModel();
await grid.setPivotValues([]);
```

### Export API (CSV/TSV)

```ts
const csvVisible = await grid.exportCsv({ scope: 'visible' });
const tsvSelection = await grid.exportTsv({ scope: 'selection', includeHeaders: false });

const controller = new AbortController();
const csvAll = await grid.exportCsv({
  scope: 'all',
  chunkSize: 2000,
  signal: controller.signal,
  onProgress(event) {
    if (event.status === 'running' && event.processedRows > 100000) {
      controller.abort();
    }
  }
});
```

### Excel Plugin API (XLSX)

```ts
import { createExcelPlugin } from '@hgrid/grid-plugin-excel';

const excel = createExcelPlugin({
  defaultSheetName: 'HGrid Export',
  maxClientExportRows: 200_000
});

const xlsx = await excel.exportXlsx(grid, {
  scope: 'selection',
  dateFormat: 'yyyy-mm-dd hh:mm:ss',
  numberFormat: '#,##0.00'
});

if (!xlsx.delegated) {
  excel.download(xlsx, 'export.xlsx');
}

await excel.importXlsx(grid, file, {
  headerMappingPolicy: 'auto',
  validationMode: 'skipInvalidRows'
});
```

## 루트 스크립트

- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm test:csp`
- `pnpm verify:examples`
- `pnpm new:example`
- `pnpm check:naming`
- `pnpm bench`
- `pnpm ci:phase0`

## Examples (현재 1~40)

- `example1`: 기본 UMD 마운트
- `example2~5`: Public API / Column / DataProvider / RowModel
- `example6~12`: 분리 스크롤 layout/scroll/orchestration/virtualization/pooling/scheduler
- `example13`: 100M scroll scaling
- `example14`: RowModel memory optimization (100M)
- `example15`: variable row height
- `example16`: event delegation + hit-test + wheel orchestration
- `example17`: selection model ranges + 1M selection update
- `example18`: keyboard navigation
- `example19`: editing policy (single overlay + validation)
- `example20`: worker protocol contract
- `example21`: worker-first sorting
- `example22`: worker-first filtering
- `example23`: worker-first sort + filter 통합
- `example24`: column resize
- `example25`: column reorder
- `example26`: column pin/hide + stress
- `example27`: column feature pack integration
- `example28`: selection indicator + state column
- `example29`: multi-level column group header
- `example30`: remote datasource + block cache + server sort/filter
- `example31`: grouping + aggregation + expand/collapse + mode 전환
- `example32`: tree data(parentId) + expand/collapse + server lazy children
- `example33`: local pivot matrix(가로 집계 컬럼) + server pivot query model
- `example34`: clipboard copy/paste(sanitize 포함)
- `example35`: CSV/TSV export(visible/selection/all + progress/cancel)
- `example36`: Excel(xlsx) import/export(header mapping + validation)
- `example37`: CSS variable theme switching(light/dark/custom setTheme)
- `example38`: ARIA grid semantics(role/row/col index + active descendant)
- `example39`: keyboard-only flow(navigation/selection/editing)
- `example40`: i18n(localeText/Intl formatting/RTL)

기능 추가 시 규칙:

1. `pnpm new:example`로 `example{N}.html` 생성
2. `examples/registry.json` 갱신 확인
3. `pnpm verify:examples` 통과

## 문서

- `checklist.md`
- `docs/build-and-sourcemap-policy.md`
- `docs/public-api-phase1.md`
- `docs/column-schema-phase1.md`
- `docs/data-provider-phase1.md`
- `docs/row-model-phase1.md`
- `docs/dom-layout-phase2.md`
- `docs/vertical-virtualization-phase2.md`
- `docs/horizontal-virtualization-phase2.md`
- `docs/row-cell-pooling-phase2.md`
- `docs/render-scheduler-phase2.md`
- `docs/scroll-orchestration-phase2.md`
- `docs/scroll-scaling-phase3.md`
- `docs/row-model-memory-phase3.md`
- `docs/variable-row-height-phase3.md`
- `docs/selection-model-phase4.md`
- `docs/keyboard-navigation-phase4.md`
- `docs/editing-policy-phase5.md`
- `docs/worker-protocol-phase6.md`
- `docs/sorting-phase6.md`
- `docs/filtering-phase6.md`
- `docs/column-resize-phase7.md`
- `docs/column-reorder-phase7.md`
- `docs/column-pin-hide-phase7.md`
- `docs/selection-indicator-columns-phase7.md`
- `docs/column-group-header-phase7.md`
- `docs/remote-data-provider-phase8.md`
- `docs/grouping-phase9.md`
- `docs/tree-data-phase9.md`
- `docs/pivot-phase9.md`
- `docs/csv-tsv-export-phase10.md`
- `docs/excel-phase10.md`
- `docs/theme-tokens-phase11.md`
- `docs/design-guide-phase11.md`
- `docs/aria-grid-semantics-phase12.md`
- `docs/keyboard-only-phase12.md`
- `docs/i18n-phase12.md`

## 라이선스

내부 정책에 따릅니다. 외부 배포 시 라이선스/상용 배포 정책을 별도 확정합니다.
