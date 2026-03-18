# HGrid

HGrid는 상용 엔터프라이즈 환경을 목표로 한 **DOM-only 가상화 데이터 그리드**입니다.
`Canvas/WebGL/OffscreenCanvas` 없이 대용량(10M~100M) 스크롤, pinned 컬럼, 수직/수평 가상화, 풀링 렌더를 제공합니다.

## 프로젝트 상태 (2026-03-18)

- 코어 베이스라인: `Phase 0` ~ `Phase 14.3` 범위의 핵심 엔진/테스트/벤치 파이프라인은 구현됨
- 남은 핵심 범위: framework/package productization, plugin SDK, `Phase 15` (commercial readiness)
- 정확한 현재 평가는 `checklist.md`, `docs/enterprise-feature-matrix.md`, `docs/enterprise-known-limitations.md` 기준으로 확인

현재 구현된 핵심 기반:

- 분리 스크롤 셸 (x/y native scroll source 분리 + sync lock)
- Vertical/Horizontal virtualization + binary search window
- Row/Cell pooling (스크롤 중 DOM create/remove 0 유지)
- rAF scheduler + dirty flags
- 100M scroll scaling (`MAX_SCROLL_PX` 기반 virtual/physical 매핑)
- RowModel 100M 메모리 최적화(lazy identity/sparse/materialized)
- Variable row height (`fixed | estimated | measured`) + row top map
- Event delegation/hit-test/wheel orchestration
- Selection model ranges + keyboard navigation
- Single overlay editor + sync/async validation + typed editor policy(select/date/number/masked) + grid-owned dirty tracking summary/accept/discard API + built-in save/discard action bar + transaction-aware undo/redo metadata(root transaction relation + audit fan-out)
- Worker protocol 계약 + transferable 유틸 + per-operation worker entrypoint
- Worker dispatcher + dist worker asset + 100k+ worker-first policy + optional prewarm + configurable poolSize
- Sort/filter/group/pivot low-overhead columnar worker payload fast path + tree compact key-field payload
- Worker e2e smoke + cancel/crash recovery test + worker on/off bench comparison + async payload serialization + custom group/pivot reducer hydration + valueGetter/comparator projection + repeated projection cache + selective projection prefix evaluation
- Cooperative sorting/filtering executor + Grid API 연동
- Column feature pack (resize/reorder/pin/hide) + selection indicator columns
- Header column menu + header/body context menu + body built-in copy/filter actions + header filter panel(text/number/date 2-clause AND, set) + nested advanced filter builder + advanced filter preset save/apply/delete + header filter row(text expression + number/date operator parser + boolean select + generic set/enum select + date picker) + configurable set distinct source(sampled/full/getValues) + docked columns/filters/grouping/pivot tool panels + columns panel search/reorder + preset apply + custom panel registry + custom panel mutation actions(filter/layout) + status bar(selection/aggregate/rows/remote summary + custom item registry + large selection chunked async aggregate) + fill handle(range fill/copy + numeric series fill + body-edge auto-scroll + 2D affine matrix trend) + shared undo/redo(editor/clipboard/fill handle) + layout persistence(order/visibility/pin/width snapshot + composed workspace recipe)
- Multi-level column group header
- Grouping pipeline (client grouping + key 기반 expand/collapse + sum/avg/min/max/count/custom aggregation)
- Tree data pipeline (client tree model + key expansion state + lazy children load)
- Pivot pipeline (client pivot matrix + 동적 컬럼 생성 + server query model)
- Clipboard pipeline (selection copy TSV + plain text paste + HTML-only paste no-op 회귀 포함)
- CSV/TSV export pipeline (visible/selection/all + progress + cancel)
- Excel(xlsx) plugin pipeline (plugin 분리, export/import, header mapping, validation, conflict mode, server delegation UX)
- CSS Variables theme token pipeline (`default` / `enterprise` preset, light/dark/system mode, `setTheme()` runtime override, filter/tool-panel/status surfaces 포함)
- SI Design Guide pipeline (토큰 매핑표 + 커스터마이징 레시피 + 고객사 테마 샘플)
- RemoteDataProvider block cache/LRU/prefetch + server query model(sort/filter/group/pivot/tree) + remote grouping/tree row metadata + server pivot result columns + targeted invalidate/query diff/background refresh/retry + rowKey 기반 pending change/save-discard API
- 성능 스모크(e2e heartbeat max gap)로 그룹/트리/피벗 UI freeze 회귀 점검
- ARIA Grid semantics pipeline (`aria-rowcount/colcount/rowindex/colindex` + `aria-activedescendant` focus strategy)
- Keyboard-only pipeline (navigation/selection/editing, `Ctrl/Cmd+A`, `F2`, editor `Tab/Shift+Tab`)
- i18n pipeline (built-in locale bundles, `localeText` externalization, Intl number/date formatting, IME-safe editing)
- Security/CSP baseline (`unsafeHtml` opt-in + secure-by-default HTML policy + sanitize hook + Trusted Types opt-in, `editCommit` audit payload 표준화, CSP/정적 보안 스캔)
- Performance baseline policy (`Phase 14.1` 참조 환경 문서화 + 벤치 데이터 생성 스크립트)
- Performance scenarios (`Phase 14.2` initial render/FPS/100M mapping/sort/filter/create-destroy/scroll regression)
- Performance gates (`Phase 14.3` long-task rate/p95/dom-pool 고정 기준 강제)

아직 엔터프라이즈 상용 제품으로 완료되지 않은 범위:

- framework/package productization
- plugin SDK / extension platform
- release/commercial readiness (`Phase 15`)
- column group collapse/expand UX

`Phase E1` actual Worker runtime은 현재 기준으로 마감했다. 다만 callback-heavy first-hit과 일부 filter/lazy hydration 경로는 지속 튜닝 여지가 남아 있다.

## 핵심 원칙

- DOM-only 렌더링
- 스크롤 핫패스에서 DOM churn 금지(풀 재사용)
- 이벤트 위임 + rAF 배치 렌더
- CSP 친화 (`eval`, `new Function`, `setTimeout("string")` 금지)
- 기본 셀 렌더는 `textContent` 사용
- HTML 렌더는 컬럼 opt-in(`unsafeHtml`) + secure-by-default 정책으로 동작하며, sanitizer가 없으면 literal text fallback이다.

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

### Security/CSP API

```ts
const grid = new HGrid.Grid(container, {
  columns: [
    { id: 'name', header: 'Name', width: 220, type: 'text' },
    { id: 'bioHtml', header: 'Bio', width: 320, type: 'text', unsafeHtml: true }
  ],
  rowData,
  htmlRendering: {
    unsafeHtmlPolicy: 'sanitizedOnly',
    trustedTypesPolicyName: 'hgrid-html'
  },
  styleNonce: 'nonce-from-server',
  sanitizeHtml(unsafeHtml, context) {
    // 기본은 secure-by-default이며, sanitizer가 없으면 literal text fallback이다.
    // unsafeHtml=true 컬럼 + sanitizedOnly policy에서만 safe HTML을 반환한다.
    return unsafeHtml
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  },
  onAuditLog(payload) {
    // schemaVersion=1 audit payload. 값 masking은 app-owned consumer에서 수행한다.
    console.log(payload.schemaVersion, payload.eventName, payload.rowKey, payload.source, payload.commitId);
  }
});
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
  numberFormat: '#,##0.00',
  serverExportHook: async (context) => ({
    delegated: true,
    downloadUrl: '/api/export/xlsx?op=' + encodeURIComponent(context.operationId)
  })
});

if (!xlsx.delegated) {
  excel.download(xlsx, 'export.xlsx');
}

await excel.importXlsx(grid, file, {
  headerMappingPolicy: 'auto',
  validationMode: 'skipInvalidRows',
  conflictMode: 'skipConflicts'
});
```

## 루트 스크립트

- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm test:csp`
- `pnpm test:security`
- `pnpm verify:examples`
- `pnpm new:example`
- `pnpm check:naming`
- `pnpm bench:data`
- `pnpm bench`
- `pnpm ci:phase0`

벤치 결과 파일 저장:

```bash
pnpm bench -- --out tests/fixtures/generated/bench-phase14-result.json
```

## Examples (현재 1~84)

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
- `example34`: clipboard copy/paste(text/plain only + html-only regression)
- `example35`: CSV/TSV export(visible/selection/all + progress/cancel)
- `example36`: Excel(xlsx) import/export(header mapping + validation)
- `example37`: CSS variable theme switching(light/dark/custom setTheme)
- `example92`: theme preset + system dark mode + customer CSS shell override
- `example93`: operations work queue(filter row + filters/columns panel + status bar + context menu)
- `example94`: remote save/discard workflow(server mode editing + action bar + save failure recovery)
- `example95`: analyst workspace presets(theme + layout + state + personal workspace save/load)
- `example38`: ARIA grid semantics(role/row/col index + active descendant)
- `example39`: keyboard-only flow(navigation/selection/editing)
- `example40`: i18n(localeText/Intl formatting)
- `example96`: screen reader measurement fixture(grouped header + pinned + select editor + status bar precondition)
- `example97`: focus regression fixture(grouped/pivot/tree + editor cancel + root focus restore)
- `example98`: locale bundle helper + IME composition guard fixture
- `example41`: security/csp hardening(strict fallback + sanitizer + legacy raw migration + audit payload snapshot)
- `example89`: HTML render security policy matrix(strict default / sanitized / legacy raw)
- `example90`: Trusted Types HTML rendering(`trustedTypesPolicyName` + sanitizer)
- `example91`: audit schema version + masking-aware audit consumer
- `example42`: E0 orchestrator split smoke(state/provider/query/export)
- `example43`: E0 renderer hardening smoke(pooling/a11y/selection/export)
- `example44`: E1 worker dispatcher smoke(sort/filter/group/pivot/tree worker path)
- `example45`: E1 worker policy smoke(threshold/fallback policy)
- `example46`: E1 worker prewarm smoke(cold vs prewarmed first-offload behavior)
- `example47`: E1 custom group reducer worker smoke(group structure worker + reducer hydration)
- `example48`: E1 custom pivot reducer worker smoke(pivot structure worker + reducer hydration)
- `example49`: E1 valueGetter worker projection smoke(sort/filter on derived column without full-row worker snapshot)
- `example50`: E1 comparator worker projection smoke(custom comparator sort without worker serialization error)
- `example51`: E1 worker pool smoke(prewarm wiring + parallel sort queue growth)
- `example52`: E1 worker projection cache smoke(repeated valueGetter/comparator offload reuse + invalidation)
- `example53`: E1 worker projection prefix smoke(needed derived prefix only, trailing derived getter skip)
- `example54`: async payload serialization + cancel-before-post smoke
- `example55~61`: E2 enterprise server-side row model(fake server, grouping/tree/pivot, cache sync, server edit, example set)
- `example62~68`: E3 column menu/body context menu, filter panel, docked side bar, custom tool panel surface
- `example69`: side bar initial open/closed option
- `example70`: status bar / summary UX
- `example71`: fill handle range/fill/copy smoke
- `example72`: layout persistence / workspace recipe
- `example73`: body context menu built-in actions
- `example74~78`: advanced filter builder / preset / filter row / saved preset smoke
- `example79`: columns preset apply + custom status bar item registry
- `example80`: filter row enum + full distinct strategy
- `example81`: fill handle auto-scroll + matrix trend
- `example82`: large selection async aggregate
- `example83`: undo/redo editing
- `example84`: E4.1 editing policy productization(select/date/number/masked editor policy + validation issue + dirty tracking summary)
- `example85`: E4.2 undo/redo transaction semantics(root transaction id + clipboard rollback scope + audit relation)
- `example86`: E4.3 clipboard/import/export hardening(shared export contract + xlsx conflict mode + delegated export UX)
- `example87`: E4.4 derived value strategy(valueGetter-based row-local derived columns + core formula policy)
- `example88`: E4 close-out editing workflow(save/discard action bar + save failure recovery + audit snapshot)

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
- `docs/screen-reader-measurement-phase-e6.md`
- `docs/keyboard-only-phase12.md`
- `docs/focus-regression-phase-e6.md`
- `docs/i18n-phase12.md`
- `docs/security-csp-phase13.md`
- `docs/perf-reference-env-phase14.md`
- `docs/perf-bench-scenarios-phase14.md`

## 라이선스

내부 정책에 따릅니다. 외부 배포 시 라이선스/상용 배포 정책을 별도 확정합니다.
