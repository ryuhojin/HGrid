## Enterprise DOM Virtualized Data Grid(HGrid) — 상세 설계 기반 개발 체크리스트

> 이 체크리스트는 “한 항목씩 체크하며 개발을 진행”하기 위한 운영 문서다.
> 규칙: 기능(feature) 단위 PR마다 반드시:
> - [ ] examples/example{N}.html 추가
> - [ ] examples/registry.json 업데이트
> - [ ] 테스트(최소 1개: unit 또는 e2e)
> - [ ] 문서(최소 registry + 짧은 md)
> - [ ] 성능 영향 분석(핫패스 변경 시)

---

# Phase 0 — 저장소/툴체인/CI 골격
## 0.1 모노레포/패키지 구성
- [x] `/packages/grid-core` 생성
- [x] `/packages/grid-react` 생성
- [x] `/packages/grid-vue` 생성
- [x] `/packages/grid-plugins/*` 구조 생성
- [x] `/examples`, `/docs`, `/scripts` 생성

## 0.2 빌드 산출물 정의(상용 필수)
- [x] grid-core build outputs:
  - [x] `dist/grid.umd.js` (ES5)
  - [x] `dist/grid.umd.min.js`
  - [x] `dist/grid.esm.js`
  - [x] `dist/index.d.ts`
  - [x] `dist/grid.css`
- [x] sourcemap 정책 결정(상용 배포 전략):
  - [x] dev: sourcemap on
  - [x] prod: sourcemap 제공 여부/보안 정책 명시

## 0.3 CI 파이프라인
- [x] typecheck
- [x] unit tests
- [x] e2e tests
- [x] `pnpm verify:examples` (예제/레지스트리 규칙 검사)
- [x] CSP smoke test 페이지 로드 검사

## 0.4 규칙 강제 스크립트
- [x] `scripts/new-example.mjs` (다음 번호 자동 생성 + registry 자동 갱신)
- [x] `scripts/verify-examples.mjs` (중복/누락/registry 누락 검사)
- [x] `scripts/check-naming.mjs` (kebab-case 파일명 검사)
- [x] `scripts/bench.mjs` (벤치 실행)

---

# Phase 1 — Core 계약(Contracts) 확정: API / Data / Models
> 여기서 흔들리면 전체가 틀어진다. “먼저 계약을 고정”한다.

## 1.1 Public API 표면(최소) 확정
- [x] `Grid` 생성/파괴
  - [x] `new Grid(container, config)`
  - [x] `destroy()`
- [x] 설정 변경 API
  - [x] `setColumns(columns)`
  - [x] `setOptions(options)`
  - [x] `setTheme(themeTokens)`
- [x] 상태 저장/복원
  - [x] `getState()`: JSON-serializable
  - [x] `setState(state)`
- [x] 이벤트
  - [x] `on(eventName, handler)`
  - [x] `off(eventName, handler)`

### 수용 기준
- [x] 레거시(UMD)에서 `<script>`로 로드 후 인스턴스 생성 가능
- [x] React/Vue 래퍼에서 동일 API로 제어 가능

## 1.2 Column 스키마 확정
- [x] `ColumnDef` 필드(필수):
  - [x] `id: string`
  - [x] `header: string`
  - [x] `width: number`
  - [x] `minWidth?: number`
  - [x] `maxWidth?: number`
  - [x] `type: "text" | "number" | "date" | "boolean"`
  - [x] `editable?: boolean`
- [x] `formatter?: (value, row) => string` (pure)
- [x] `comparator?: (a, b) => number` (optional)
- [x] `valueGetter?/valueSetter?` 정책 결정(고급)

### 수용 기준
- [x] 컬럼 폭/가시성/순서 변경이 렌더러와 독립적으로 가능

## 1.3 DataProvider 인터페이스 확정
- [x] 필수 메서드:
  - [x] `getRowCount(): number`
  - [x] `getRowKey(dataIndex): RowKey`
  - [x] `getValue(dataIndex, colId): unknown`
  - [x] `setValue(dataIndex, colId, value): void`
  - [x] `applyTransactions(tx[]): void`
- [x] LocalDataProvider 구현(객체 배열)
- [x] ColumnarDataProvider 설계 문서 작성(typed arrays / string table)
- [x] RemoteDataProvider 인터페이스 설계(블록 fetch, 캐시)

### 수용 기준
- [x] DataProvider 교체(로컬/원격/컬럼형)가 Grid API 변경 없이 가능

## 1.4 RowModel(인덱스 기반) 확정
- [x] 핵심 원칙: 데이터 이동 금지, **order/index 배열만 교체**
- [x] 최소 구조:
  - [x] `viewToData: Int32Array | number[]`
  - [x] `dataToView?: Int32Array` (옵션; 필요 시)
  - [x] filter 결과는 별도 mapping 유지
- [x] rowCount=10M에서도 mapping 생성/교체가 가능하도록 메모리 고려

### 수용 기준
- [x] 정렬/필터 후에도 DataProvider는 그대로, RowModel만 바뀐다.

---

# Phase 2 — DOM Renderer 1.0: Virtualization + Pooling + Layout
> 성능의 80%는 여기서 결정된다.

## 2.0 분리 스크롤 셸 전환 목표(신규)
- [x] 분리 스크롤 셸 채택:
  - [x] `center viewport(overflow: hidden)` + `horizontal scroll viewport(native)` + `vertical scroll viewport(native)` 분리
  - [x] x/y 스크롤 컨테이너와 실제 렌더 뷰포트의 상태 동기화 락(`isSyncingScroll`) 도입
  - [x] pinned left/center/right는 스크롤 책임 분리(가로는 center 전용, 세로는 공통 y-source 동기화)
- [x] 스크롤 계산 기준 통일:
  - [x] `scrollTop/scrollLeft` 단일 state source
  - [x] 헤더/바디/요약(추후) 동기화 경로 문서화
- [x] 엔터프라이즈 안정성 기준:
  - [x] 고속 휠/트랙패드 입력에서 header-body 분리/출렁임 0
  - [x] pinned 영역이 스크롤 소스가 되어도 center와 불일치 0
  - [x] resize/column pin 변경 시 스크롤 영역 재계산 안정

### 수용 기준
- [x] x/y 스크롤 전용 viewport가 존재하고, 렌더 레이어는 overflow hidden을 유지
- [x] 스크롤 오케스트레이션 경로가 코드/문서/e2e로 검증됨

## 2.1 DOM 트리/레이아웃 확정
- [x] root/header/body/overlay 컨테이너 분리
- [x] pinned left/center/right 분리(선택)
- [x] 스크롤러 구조:
  - [x] center 전용 native x-scroll container + spacer 1개
  - [x] pinned 영역은 오버레이 고정, 세로 위치는 scrollTop 기반 transform 동기화
  - [x] 전용 native y-scroll viewport 분리(단일 스크롤 소스)

### 수용 기준
- [x] 스크롤 시 레이아웃/리플로우 최소화(DevTools 성능에서 forced reflow 없어야 함)

### 코어 변경 코멘트 (분리 스크롤 셸 반영, 2026-03-04)
- 네이티브 스크롤 viewport 2축 분리:
  - x축: center 전용 `.hgrid__h-scroll`
  - y축: 우측 전용 `.hgrid__v-scroll` + `.hgrid__v-spacer`
- 렌더 레이어(`.hgrid__viewport`)는 `overflow-y: hidden`으로 고정하고, row window 계산의 y 입력은 `.hgrid__v-scroll.scrollTop`으로 단일화.
- pinned left/right는 독립 y-scroll을 만들지 않고 동일 `scrollTop` 기반 transform 동기화만 수행.
- 휠 오케스트레이션:
  - header/aux 영역 휠 입력 -> x/y 전용 scroll source로 전달
  - pinned 영역 입력도 x/y scroll source로 전달(동작 정합)
- 안정성 보강 (2026-03-04, 2.0 미체크 항목 반영):
  - 즉시 transform 동기화 경로 추가(고속 입력 시 header/body x 분리 최소화)
  - `ResizeObserver`(fallback: `window.resize`) 기반 레이아웃 재계산 및 scroll clamp 적용
  - 문서: `docs/scroll-orchestration-phase2.md`, e2e: `example8` 시나리오 추가

## 2.2 Vertical Virtualization(수직 가상화)
- [x] 고정 `rowHeight` 기반(1.0 고정 높이, variable rowHeight는 3.5에서 확장)
- [x] visible range 계산:
  - [x] `firstRow = floor(virtualScrollTop / rowHeight)`
  - [x] overscanTop/Bottom 적용
- [x] RowPool 크기:
  - [x] `poolSize = visibleRows + overscanTop + overscanBottom`
- [x] 분리 스크롤 source 연동:
  - [x] y-scroll viewport의 `scrollTop`을 row window 계산 단일 입력으로 사용
  - [x] pinned/center row layer 모두 동일 window 사용
  - [x] y-scroll thumb 이동과 rowIndex 매핑 오차 누적 방지

### 수용 기준
- [x] rowCount가 1M/10M으로 커져도 DOM row 수는 poolSize로 고정

### 코어 변경 코멘트 (2.2 반영, 2026-03-04)
- 대용량 가상화 검증 추가:
  - unit: `packages/grid-core/test/grid.spec.ts` 에 1M/10M rowCount에서 pool DOM 고정 테스트 추가
  - e2e: `examples/example9.html` + `scripts/run-e2e.mjs` Example9 시나리오로 1M/10M 동작 검증
- 문서: `docs/vertical-virtualization-phase2.md` 추가

## 2.3 Horizontal Virtualization(수평 가상화)
- [x] `colLeft[]` prefix sum 계산
- [x] visible col range: binary search로 찾기
- [x] overscanCols 적용
- [x] pinned 영역은 별도 컨테이너에 고정 렌더
- [x] center-only horizontal viewport 연동:
  - [x] `scrollLeft`는 center scroll source에서만 갱신
  - [x] header center transform과 body center transform이 동일 프레임에서 동기화
  - [x] pinned 영역은 horizontal input 비소비 정책 유지

### 수용 기준
- [x] colCount가 커져도(예: 2000 컬럼) DOM cell 수는 “보이는 컬럼 수 × poolSize”로 제한

### 코어 변경 코멘트 (2.3 반영, 2026-03-04)
- center 수평 가상화 구현:
  - `colLeft[]`/width metrics + binary search visible range
  - center row/header는 slot 기반 cell pool(`centerCellCapacity`) 재사용
  - `overscanCols` 옵션 추가(`GridConfig`/`GridOptions`)
- 검증:
  - unit: `packages/grid-core/test/grid.spec.ts` 수평 가상화/overscanCols 테스트
  - e2e: `examples/example10.html` + `scripts/run-e2e.mjs` Example10 시나리오
  - 문서: `docs/horizontal-virtualization-phase2.md`

## 2.4 Row/Cell Pooling 구현
- [x] scroll 중 DOM create/remove 금지
- [x] row element 재사용:
  - [x] 각 row는 `transform: translate3d(0, y, 0)`
- [x] cell 업데이트 최소화:
  - [x] 이전 값 캐시 → 값이 바뀐 셀만 `textContent` 업데이트
  - [x] class 토글 최소화

### 수용 기준
- [x] 스크롤 10초 동안 DOM node count 변화 0 (DevTools 확인)
- [x] 프레임 드랍이 “렌더 업데이트 양”에만 비례하고 DOM churn이 없어야 함

### 코어 변경 코멘트 (2.4 반영, 2026-03-04)
- row/cell render-state 캐시 도입:
  - body/header center cell은 `isVisible/columnId/textContent/left/width` 캐시 비교 후 변경분만 DOM write
  - row는 `rowIndex/dataIndex/translateY/visibility` 캐시 비교 후 변경분만 DOM write
- 검증:
  - unit: `packages/grid-core/test/grid.spec.ts` pooled DOM identity 유지 + `MutationObserver(childList)` 무변화 테스트 추가
  - e2e: `examples/example11.html` + `scripts/run-e2e.mjs` Example11 스트레스 스크롤 시 node/pool delta=0 검증
  - 문서: `docs/row-cell-pooling-phase2.md`

## 2.5 Render Scheduler(rAF) + Dirty Flags
- [x] scroll/pointer/keyboard 이벤트에서는 상태만 변경
- [x] `requestAnimationFrame`에서 일괄 렌더
- [x] dirty flags:
  - [x] layoutDirty
  - [x] dataDirty
  - [x] selectionDirty
  - [x] themeDirty
- [x] 분리 스크롤 동기화 보호:
  - [x] `isSyncingScroll` 또는 동등한 재진입 방지 플래그
  - [x] scroll 이벤트 루프(header/body/x-scroll/y-scroll) 재귀 호출 차단

### 수용 기준
- [x] 동일 프레임에 중복 렌더 호출이 합쳐짐(coalescing)

### 코어 변경 코멘트 (2.5 반영, 2026-03-04)
- rAF 스케줄러 + dirty flush 파이프라인 도입:
  - `layoutDirty/dataDirty/selectionDirty/themeDirty/scrollDirty` 단일 플러시 경로
  - scroll/wheel/resize 입력은 상태 갱신 + dirty mark 후 `scheduleRender()`만 호출
- 검증:
  - unit: `packages/grid-core/test/grid.spec.ts` 동일 프레임 scroll 이벤트 다건 -> 렌더 1회
  - e2e: `examples/example12.html` + `scripts/run-e2e.mjs` burst scroll/wheel coalescing
  - 문서: `docs/render-scheduler-phase2.md`

---

# Phase 3 — 100M 대응: Scroll Scaling(필수)
## 3.1 Scroll Height 한계 감지/정의
- [x] `MAX_SCROLL_PX` 상수 정의(`16,000,000 px` 권장; 브라우저 native scroll 안정 범위 기준)
- [x] `virtualHeight = rowCount * rowHeight`
- [x] `scrollHeight = min(virtualHeight, MAX_SCROLL_PX)`
- [x] `virtualMaxScrollTop = max(0, virtualHeight - viewportHeight)`
- [x] `physicalMaxScrollTop = max(0, scrollHeight - viewportHeight)`
- [x] `scale = virtualMaxScrollTop / physicalMaxScrollTop` (`physicalMaxScrollTop == 0`이면 `scale = 1`)
- [x] y-scroll viewport 높이와 scaling 매핑 결합

### 코어 변경 코멘트 (3.1 반영, 2026-03-05)
- 스크롤 스케일 계산 유틸 분리:
  - `packages/grid-core/src/virtualization/scroll-scaling.ts`
  - 상수 `MAX_SCROLL_PX(16,000,000)` + scale metrics 계산 공식 고정
- renderer 결합:
  - `updateSpacerSize()`에서 `virtualHeight/scrollHeight/virtualMaxScrollTop/physicalMaxScrollTop/scale`를 단일 계산
  - `.hgrid__v-scroll` + `.hgrid__v-spacer`는 physical height 기준, row window 계산은 virtual scrollTop 기준 유지
- 검증:
  - unit: `packages/grid-core/test/scroll-scaling.spec.ts`
  - integration: `packages/grid-core/test/grid.spec.ts` 100M scaling metrics 검증
  - 문서: `docs/scroll-scaling-phase3.md`

## 3.2 매핑 함수 구현
- [x] `virtualScrollTop = (physicalScrollTop / physicalMaxScrollTop) * virtualMaxScrollTop`
- [x] `physicalScrollTop = (virtualScrollTop / virtualMaxScrollTop) * physicalMaxScrollTop`
- [x] rowIndex 계산 규칙 고정: `firstVisibleRow = floor(virtualScrollTop / rowHeight)`
- [ ] thumb 드래그/휠 UX 보정:
  - [x] wheel delta는 virtual 축 기준으로 누적/클램프
  - [x] page up/down 이동량은 `viewportHeight`(virtual px) 기준으로 고정
- [x] `getState()/setState()`의 `scrollTop`은 virtual 값으로 일관
- [x] pinned 영역 스크롤 입력도 동일 매핑 함수를 사용

### 코어 변경 코멘트 (3.2 반영, 2026-03-05)
- 매핑 함수 고정:
  - `mapPhysicalToVirtualScrollTop`, `mapVirtualToPhysicalScrollTop`를 렌더러 scroll path에 단일 적용
- virtual 축 누적 보강:
  - `pendingVirtualScrollTop` 도입으로 고배율 스케일(100M)에서 sub-pixel physical delta 손실 없이 휠 스크롤 누적
- 입력 규칙:
  - body/pinned 휠 입력은 virtual delta 기준으로 동일 처리
  - root keydown의 `PageUp/PageDown`은 `viewportHeight`만큼 virtual scroll 이동
- 검증:
  - unit/integration: `packages/grid-core/test/grid.spec.ts` 100M wheel + page up/down 케이스 추가

### 수용 기준
- [x] rowCount=100,000,000, rowHeight=28 기준에서:
  - [x] `virtualHeight = 2,800,000,000 px`에서도 스크롤 동작/매핑이 유지
  - [x] 스크롤 thumb로 최상/최하 이동 가능
  - [x] jump bottom 후 가시 rowIndex가 하단 범위(>99,000,000)로 이동
  - [x] top -> bottom -> top 왕복 후 rowIndex 드리프트가 `±1` row 이내

## 3.3 예제 추가
- [x] `example{N}.html`(권장: `example13.html`): 100M row model 스크롤 매핑 데모
- [x] e2e 시나리오 추가(최상/최하 jump + 왕복 drift 검증)
- [x] registry 업데이트

### 코어 변경 코멘트 (3.3 반영, 2026-03-05)
- 예제:
  - `examples/example13.html`에 100M 기준 `jump-top`, `jump-bottom`, `roundtrip drift`, `inspect` 제어 추가
  - 로그 payload(`label`, `firstVisibleId`, `scrollTopVirtual`, `scrollTopNative`, `virtualMaxScrollTop`)를 JSON으로 표준화
- e2e:
  - `scripts/run-e2e.mjs`에 Example13 시나리오 추가
  - 검증 항목: 100M 초기 상태, bottom jump 심도, roundtrip drift(<=1 row)
- registry:
  - `examples/registry.json`에 `example13` 등록/태그(`phase3`, `scroll-scaling`) 반영

## 3.4 RowModel 메모리 최적화(100M 대응)
- [x] identity view에서는 full `Int32Array`를 즉시 생성하지 않는 lazy mapping 모드
- [x] 정렬/필터 적용 시에만 mapping materialize 또는 segmented mapping 생성
- [x] 대용량 transaction 적용을 위한 sparse override 구조(기본 identity + 변경분)
- [x] `setRowCount(100_000_000)` 시 초기화 경로 메모리 예산 문서화
- [x] 100M 스모크 예제/벤치(초기 마운트, jump bottom, restore state) 추가

### 코어 변경 코멘트 (3.4 반영, 2026-03-05)
- RowModel:
  - `BaseMappingMode = identity | sparse | materialized` 추가
  - `setBaseSparseOverrides` / `clearBaseSparseOverrides`로 identity + 변경분(sparse) 저장 경로 추가
  - `RowModelState`에 materialized/sparse 바이트 지표 추가 (`estimatedMappingBytes` 포함)
  - `setRowCount(100_000_000)` 시 materialized/filter/dataToView 매핑을 모두 해제하고 lazy identity로 복귀
- Grid API:
  - `setSparseRowOverrides` / `clearSparseRowOverrides` 공개 API 추가
- 문서:
  - `docs/row-model-memory-phase3.md`에 100M 초기화 메모리 예산/검증 범위 명시
- 예제/검증:
  - `examples/example14.html` (100M mount/jump bottom/restore + sparse swap + materialize loop)
  - `scripts/run-e2e.mjs` Example14 시나리오 추가
  - `tests/fixtures/bench-100m.html`, `tests/fixtures/bench-100m.js`, `scripts/bench.mjs`로 100M 벤치 경로 추가

### 수용 기준
- [x] rowCount=100,000,000(identity)에서 초기화 시 브라우저 메모리 급증 없이 마운트 가능
- [x] 100M에서 jump bottom 후 가시 rowIndex가 하단 범위(>99,000,000)로 이동
- [x] 정렬/필터 on/off 반복 시 mapping 생성/해제가 누수 없이 동작

## 3.5 Variable Row Height(멀티라인 텍스트 대응, 신규)
- [x] 목표: row별 상이 높이에서도 스크롤/가상화/핀 동기화를 안정적으로 유지
- [x] 높이 전략 확정:
  - [x] `rowHeightMode: \"fixed\" | \"estimated\" | \"measured\"`
  - [x] `estimatedRowHeight` 옵션 정의
  - [x] `getRowHeight?(rowIndex, dataIndex) => number` 계약 확정
- [x] 높이 캐시/인덱스 구조:
  - [x] row별 measured height cache
  - [x] prefix-sum 또는 Fenwick tree로 누적 높이 관리
  - [x] `rowIndex <-> virtualTop` 매핑 O(logN) 보장
- [x] 렌더링 파이프라인 변경:
  - [x] visible range 계산을 binary search(virtualScrollTop) 기반으로 전환
  - [x] row translateY를 `poolIndex * rowHeight`가 아닌 cumulative top 기준으로 갱신
  - [x] overscan 정책을 `rows` + `px` 혼합으로 정의
- [x] 측정/재측정 규칙:
  - [x] multiline wrapping 측정은 rAF 배치(읽기/쓰기 분리)
  - [x] column width/viewport width 변경 시 dirty range만 재측정
  - [x] 측정 중 스크롤 점프 방지를 위한 anchor row 보정
- [x] 스크롤 스케일링 결합:
  - [x] 3.1/3.2의 virtual/physical 매핑을 variable height virtualTop 기준으로 유지
  - [x] pinned left/center/right가 동일 row top map을 공유
- [x] API/상태:
  - [x] `resetRowHeights(rowIndexes?)` API 추가
  - [x] `getState()/setState()`가 variable height에서도 scrollTop 안정 복원
- [x] 검증:
  - [x] unit/integration: prefix-sum/search + anchor 보정
  - [x] e2e: multiline + mixed heights + pinned + 100M synthetic
  - [x] example: variable row height demo 추가 + registry 업데이트

### 코어 변경 코멘트 (3.5 반영, 2026-03-05)
- 계약/API:
  - `GridConfig/GridOptions`에 `rowHeightMode`, `estimatedRowHeight`, `getRowHeight` 추가
  - `Grid.resetRowHeights(rowIndexes?)` 공개 API 추가
- 자료구조:
  - `packages/grid-core/src/virtualization/row-height-map.ts` 추가
  - sparse Fenwick + override cache로 누적 높이/offset 매핑 처리
- 렌더러:
  - variable 모드에서 startRow를 binary search 기반으로 계산
  - row translateY를 cumulative top 기준으로 계산
  - measured 모드에서 rAF 측정 pass + anchor 보정 적용
  - measured 모드에서 column width/viewport 변경 시 visible dirty range만 invalidation 후 재측정
  - scroll scaling의 virtualHeight를 row height map totalHeight와 결합
- 예제/검증:
  - `examples/example15.html` 추가 (fixed/estimated/measured + 100M synthetic + resetRowHeights)
  - `scripts/run-e2e.mjs` Example15 시나리오 추가
  - unit/integration: `packages/grid-core/test/row-height-map.spec.ts`, `packages/grid-core/test/grid.spec.ts`

### 수용 기준
- [x] 1~6줄 혼합 데이터에서 center/pinned 행 정렬 오차 0
- [x] 고속 휠/트랙패드 입력 중 행 겹침/출렁임 없음
- [x] 100M(identity)에서 초기 마운트/스크롤 입력 프리즈 없음
- [x] top -> bottom -> top 왕복 후 rowIndex drift가 ±1 row 이내
- [x] 스크롤 중 DOM create/remove 0 유지(pooling 유지)

---

# Phase 4 — Interaction 1.0: Hit-test / Selection / Keyboard
## 4.1 이벤트 위임(Event Delegation)
- [x] root 1~2개 리스너로 pointer/keydown 처리
- [x] 셀/행에 리스너 금지
- [x] hit-test:
  - [x] y → rowIndex O(1)
  - [x] x → colIndex binary search O(logN)
- [x] wheel 오케스트레이션:
  - [x] header wheel -> center x/y scroll source 전달
  - [x] pinned wheel -> y-only 전달, x 차단
  - [x] inertial scroll(트랙패드)에서 프레임 드롭/역방향 튐 방지

### 수용 기준
- [x] col/row 수 증가해도 이벤트 비용이 일정

### 코어 변경 코멘트 (4.1 반영, 2026-03-05)
- root 이벤트 위임을 `pointerdown` + `keydown`으로 고정하고 셀/행 개별 리스너를 제거했다.
- hit-test를 zone별(left/center/right)로 분리하고 row는 y 매핑, col은 binary search로 계산한다.
- wheel 오케스트레이션을 단일 정책으로 통일하여 header는 x/y 전달, pinned는 y-only 전달로 고정했다.
- 검증: `example16` 추가 + `scripts/run-e2e.mjs` 시나리오 보강으로 pointer/wheel 회귀를 자동화했다.

## 4.2 Selection Model (대용량 친화)
- [x] 셀 범위 선택은 “ranges”로 저장(개별 셀 boolean 금지)
  - [x] 예: `{r1,c1,r2,c2}` 목록
- [x] row selection: rowKey 기반 + ranges 지원
- [x] selection change 이벤트 payload 규격 확정

### 수용 기준
- [x] 1M에서도 선택 드래그 시 UI 멈춤 없음

### 코어 변경 코멘트 (4.2 반영, 2026-03-05)
- `SelectionModel`을 도입해 셀 선택을 `{r1,c1,r2,c2}` range 배열로 저장하고, row 선택은 `{r1,r2,rowKeyStart,rowKeyEnd}`로 관리한다.
- `selectionChange` 이벤트 payload를 `source + activeCell + cellRanges + rowRanges`로 고정했다.
- `Grid`/`ReactGridAdapter`/`VueGridAdapter`에 `getSelection`, `setSelection`, `clearSelection` API를 추가했다.
- 렌더러는 풀링된 visible row/cell에만 선택 클래스(`hgrid__row--selected`, `hgrid__cell--selected`, `hgrid__cell--active`)를 반영한다.
- 검증: `example17` + e2e 시나리오(1M 범위 갱신 루프) + unit/integration 테스트 추가.

## 4.3 Keyboard Navigation
- [x] arrows / page up/down / home/end
- [x] shift 확장 선택
- [x] ctrl/cmd 이동 정책 정의
- [x] focus 유지 규칙(가상화 중 active cell 유지)

### 수용 기준
- [x] 키보드만으로 탐색/선택 가능

### 코어 변경 코멘트 (4.3 반영, 2026-03-05)
- `handleRootKeyDown`에서 `Arrow/PageUp/PageDown/Home/End`를 active-cell 이동으로 통합 처리했다.
- `Ctrl/Cmd + Home/End/Arrow` edge 이동 정책을 추가하고, `Shift` 입력 시 anchor 기반 range 확장을 적용했다.
- active cell 이동 시 row/column 가시영역 보장을 위해 y/x 스크롤 소스를 함께 조정한다.
- `selectionChange.source = "keyboard"`를 도입해 입력 출처를 구분한다.
- 검증: `example18` + e2e keyboard 시나리오 + unit/integration 테스트 추가.

## 4.4 예제
- [x] `example{N}.html`: range selection + keyboard demo

---

# Phase 5 — Editing 1.0: Single Overlay Editor
## 5.1 편집기 정책
- [x] 셀마다 input 생성 금지
- [x] overlay에 editor 1개만 띄움
- [ ] editor lifecycle:
  - [x] start: dblclick/enter
  - [x] commit: enter/blur
  - [x] cancel: esc
- [ ] validation:
  - [x] sync validator
  - [x] async validator(promise) + pending UI

### 수용 기준
- [x] 편집 시작/종료가 스크롤/가상화와 충돌하지 않음

### 코어 변경 코멘트 (5.1 반영, 2026-03-05)
- 단일 editor overlay(`.hgrid__editor-host/input/message`)를 초기화 시 1회 생성하고 재사용한다.
- lifecycle은 `dblclick`/`Enter` 시작, `Enter`/`blur` 커밋, `Escape` 취소로 고정했다.
- `validateEdit` 옵션을 추가해 sync/async 검증을 통합했고, async는 pending UI + stale-result ticket guard로 보호한다.
- 이벤트 `editStart`/`editCommit`/`editCancel`를 공개하고 payload 스키마를 고정했다.
- 검증: `packages/grid-core/test/grid.spec.ts` 편집 라이프사이클/검증 테스트 + `examples/example19.html` + `scripts/run-e2e.mjs` 시나리오.

## 5.2 예제
- [x] `example{N}.html`: text/number/date editing + validation

---

# Phase 6 — Data Ops 1.0: Sort/Filter (Worker-first)
## 6.1 Worker 프로토콜 설계(문서 포함)
- [x] message:
  - [x] `{opId, type, payload}`
  - [x] cancel: `{opId, type:"cancel"}`
- [x] response:
  - [x] `{opId, status:"ok"|"canceled"|"error", result}`
- [x] large arrays는 transferable 고려

### 코어 변경 코멘트 (6.1 반영, 2026-03-05)
- `packages/grid-core/src/data/worker-protocol.ts`에 request/cancel/response 타입과 생성 헬퍼를 추가했다.
- 런타임 타입가드(`isWorkerRequestMessage`, `isWorkerResponseMessage`)로 worker 메시지 경계 검증 규칙을 고정했다.
- transferable 유틸(`collectTransferables`, `resolveWorkerTransferables`, `postWorkerMessage`)을 추가해 typed-array/ArrayBuffer 기반 대용량 결과 전달 시 복사 비용을 줄일 수 있게 했다.
- 문서: `docs/worker-protocol-phase6.md`, 예제: `examples/example20.html`, 테스트: `packages/grid-core/test/worker-protocol.spec.ts`.

## 6.2 Sorting
- [x] sort model(단일/다중)
- [x] comparator 정책(기본 + column comparator)
- [x] 결과는 `viewToData` 인덱스 배열 교체

### 수용 기준
- [x] 1M sort 중에도 스크롤/입력 반응 유지(메인 thread 프리즈 금지)

### 코어 변경 코멘트 (6.2 반영, 2026-03-05)
- `Grid.setSortModel/getSortModel/clearSortModel` API를 추가하고 정렬 결과를 `RowModel.setBaseViewToData`로 반영한다.
- `packages/grid-core/src/data/sort-executor.ts`에 `CooperativeSortExecutor`를 추가해 sort model 단일/다중 정렬을 안정 정렬(merge sort)로 처리한다.
- comparator 정책은 `column.comparator` 우선, 미지정 시 column type 기반 기본 comparator로 처리한다.
- 실행 경로는 yield 기반 협력 스케줄링 + operation token 취소로 구성해 긴 정렬에서도 입력 반응성을 유지한다.
- 검증: `packages/grid-core/test/sort-executor.spec.ts`, `packages/grid-core/test/grid.spec.ts`, `examples/example21.html`, `scripts/run-e2e.mjs` Example21 시나리오.

## 6.3 Filtering
- [x] filter model(text/number/date/set)
- [x] filter UI는 plugin로 분리 가능(기본은 API만)
- [x] 결과는 mapping 교체

### 수용 기준
- [x] 1M filter 적용/해제 시 UI 반응 유지

### 코어 변경 코멘트 (6.3 반영, 2026-03-05)
- `Grid.setFilterModel/getFilterModel/clearFilterModel` API를 추가하고 filter 결과를 `RowModel.setFilterViewToData`로 반영한다.
- `packages/grid-core/src/data/filter-executor.ts`에 `CooperativeFilterExecutor`를 추가해 text/number/date/set 모델을 처리한다.
- filter 실행은 source order를 지원해 sort 결과 위에서 필터를 적용할 수 있게 했고, clear filter 시 sort mapping은 유지한다.
- 실행 경로는 yield 기반 협력 스케줄링 + operation token 취소로 구성해 1M에서도 메인 스레드 장시간 점유를 줄였다.
- 검증: `packages/grid-core/test/filter-executor.spec.ts`, `packages/grid-core/test/grid.spec.ts`, `examples/example22.html`, `scripts/run-e2e.mjs` Example22 시나리오.

## 6.4 예제
- [x] `example{N}.html`: worker sort + worker filter 데모

### 코어 변경 코멘트 (6.4 반영, 2026-03-05)
- `examples/example23.html`에 worker-first 정렬+필터 통합 데모를 추가했다.
- 데모는 sort-only/filter-only/sort+filter/clear/synthetic 1M 시나리오를 포함한다.
- `scripts/run-e2e.mjs` Example23 시나리오를 추가해 모델 적용/해제 및 1M 경로를 자동 검증한다.

---

# Phase 7 — Column Features: Resize/Reorder/Pin/Hide
## 7.1 Resize
- [ ] drag 리사이저(헤더)
- [ ] min/max width
- [ ] 리사이즈 중 렌더 업데이트 최적화

## 7.2 Reorder
- [ ] drag header reorder
- [ ] drop indicator
- [ ] state 저장/복원 포함

## 7.3 Pin/Hide
- [ ] pinned left/right
- [ ] column visibility toggle

### 수용 기준
- [ ] 컬럼 변경이 대용량에서도 stutter 없이 동작

## 7.4 예제
- [ ] `example{N}.html`: column resize/reorder/pin/hide

---

# Phase 8 — Remote Data: Server-side Row Model(엔터프라이즈 필수)
## 8.1 RemoteDataProvider
- [ ] block cache:
  - [ ] blockSize 정의(예: 500~2000 rows)
  - [ ] LRU 캐시
  - [ ] prefetch 정책(스크롤 방향 기반)
- [ ] server query model:
  - [ ] sortModel
  - [ ] filterModel
  - [ ] groupModel(추후)
- [ ] loading row / skeleton 정책

### 수용 기준
- [ ] “천만 행”을 실제로 보유하지 않아도 서버에서 무한 스크롤 가능

## 8.2 예제
- [ ] `example{N}.html`: remote datasource + cache + server sort/filter

---

# Phase 9 — Enterprise Features: Group/Tree/Pivot/Aggregation
> 대용량일수록 서버 옵션을 1급으로 제공해야 한다.

## 9.1 Grouping
- [ ] group model
- [ ] expand/collapse 상태 관리(키 기반)
- [ ] aggregation(sum/avg/min/max/count/custom)
- [ ] worker 로컬 그룹(제한 및 문서화)
- [ ] 서버 그룹 지원

## 9.2 Tree Data
- [ ] parentId model
- [ ] lazy load children(서버)

## 9.3 Pivot
- [ ] pivot config model
- [ ] 서버 pivot 우선(로컬은 제한 명시)

### 수용 기준
- [ ] 그룹/트리/피벗이 “UI thread 프리즈 없이” 동작

## 9.4 예제
- [ ] `example{N}.html`: grouping
- [ ] `example{N}.html`: tree
- [ ] `example{N}.html`: pivot(서버/로컬)

---

# Phase 10 — Import/Export: Clipboard/CSV/Excel
## 10.1 Clipboard
- [ ] copy selected range → TSV
- [ ] paste TSV → range update
- [ ] sanitize(HTML paste 방어)

## 10.2 CSV/TSV Export
- [ ] visible rows
- [ ] selection only
- [ ] all rows(대용량 시 progress + cancel)

## 10.3 Excel(xlsx)
- [ ] export:
  - [ ] 기본 시트/헤더
  - [ ] number/date formatting
  - [ ] 대용량 한계 문서화 + 서버 export hook 제공
- [ ] import:
  - [ ] 헤더 매핑 정책
  - [ ] validation pipeline

### 수용 기준
- [ ] 엑셀/CSV 기능이 core 성능을 오염시키지 않음(플러그인 분리)

## 10.4 예제
- [ ] `example{N}.html`: clipboard
- [ ] `example{N}.html`: csv export
- [ ] `example{N}.html`: excel import/export

---

# Phase 11 — Theming & Design Guide (SI 필수)
## 11.1 CSS Variables 기반 토큰
- [ ] 토큰 목록 확정(폰트/색/라인/패딩/상태색)
- [ ] `.eg-theme-light`, `.eg-theme-dark` 제공
- [ ] 테마 스위칭 API: `setTheme()`

## 11.2 Design Guide 문서
- [ ] “토큰→UI 반영 위치” 표
- [ ] SI 커스터마이징 레시피(색/폰트/헤더/선택/포커스)
- [ ] 고객사 테마 샘플 2~3개

## 11.3 예제
- [ ] `example{N}.html`: theme switching

---

# Phase 12 — Accessibility(A11y) & i18n
## 12.1 ARIA Grid semantics
- [ ] role/aria-rowcount/aria-colcount/aria-rowindex/aria-colindex 정책 확정
- [ ] focus strategy 선택:
  - [ ] aria-activedescendant OR roving tabindex
- [ ] 스크린리더 테스트 매트릭스 문서화

## 12.2 Keyboard-only 완전 동작
- [ ] 내비게이션/선택/편집 전부 키보드 지원

## 12.3 i18n
- [ ] locale strings 외부화
- [ ] Intl 기반 number/date formatting
- [ ] RTL 옵션(필요 시)

## 12.4 예제
- [ ] `example{N}.html`: a11y demo
- [ ] `example{N}.html`: i18n + RTL demo(옵션)

---

# Phase 13 — Security/CSP Hardening
- [ ] CSP strict 페이지에서 동작:
  - [ ] no unsafe-eval
  - [ ] no inline script required
  - [ ] styleNonce 옵션(필요 시)
- [ ] XSS 방어 기본값:
  - [ ] textContent 기본
  - [ ] unsafe HTML 렌더 opt-in + sanitize 훅
- [ ] 감사 로그 훅(엔터프라이즈 옵션):
  - [ ] edit commit 로그 payload 표준화

---

# Phase 14 — Performance Benchmarks & Regression Gates (반드시 CI에 포함)
## 14.1 참조 디바이스/브라우저 정의(내부 기준)
- [ ] 기준 환경 문서화(예: Chrome 최신 / Windows 11 / i5급 또는 Mac M1급)
- [ ] 벤치 데이터 생성 스크립트 제공

## 14.2 벤치 시나리오
- [ ] initial render: 100k / 1M
- [ ] scroll FPS: 1M (rowHeight=24, overscan=10)
- [ ] 100M row model: scroll scaling 매핑 정확성 + 반응성
- [ ] sort 1M (worker): UI freeze 없는지
- [ ] filter 1M (worker): UI freeze 없는지
- [ ] create/destroy 200회: 메모리 누수/이벤트 누수 없음
- [ ] 스크롤 회귀:
  - [ ] 고속 가로 왕복 스크롤 10초 동안 header/body transform mismatch 0
  - [ ] pinned 상태에서 휠 스크롤 5천회 입력 후 scroll source 불일치 0
  - [ ] macOS/Windows 각 1종에서 스크롤바 가시성/클릭 이동 동작 기록

## 14.3 게이트 기준(예시 — 팀 상황에 맞게 숫자 조정 가능)
- [ ] 스크롤 중 long task(>50ms) 발생률 임계치 이하
- [ ] 프레임 타임 p95 < 20ms (참조 환경)
- [ ] DOM node count 고정(풀 크기 변동 없음)

---

# Phase 15 — Release/Commercial Readiness
- [ ] 버저닝/디프리케이션 정책(semver)
- [ ] changelog 자동화
- [ ] API 문서 자동 생성(typedoc 등)
- [ ] support matrix (브라우저/OS)
- [ ] 라이선스/배포 정책(플러그인 분리 판매 가능 구조)
- [ ] 에러/성능 텔레메트리 훅(옵션)

---

# 매 PR 공통 체크(필수)
- [ ] Agents.md 규칙 위반 없음
- [ ] 새 기능이면 example{N}.html 추가 + registry 업데이트
- [ ] unit/e2e 중 최소 1개 추가 또는 보강
- [ ] CSP smoke test 통과
- [ ] (핫패스 변경 시) 벤치 결과 첨부 및 회귀 없음

---

# 분리 스크롤 셸 전환 작업 순서(실행용)
- [ ] Step A: `2.0/2.1` scroll shell 분리 + sync lock + e2e 보강
- [ ] Step B: `2.2` vertical virtualization 안정화(풀링/윈도우 고정)
- [ ] Step C: `2.3` horizontal virtualization(binary search) + pinned 분리 고도화
- [ ] Step D: `2.5` scheduler/dirty flags/scroll loop 방어
- [ ] Step E: `3.1~3.2` 100M scroll scaling 결합
- [x] Step F: `4.1` interaction/wheel 오케스트레이션 최종화
- [ ] Step G: `14.2` 스크롤 회귀 벤치/게이트 확정
- [ ] Step H: `3.5` variable row height 확장(prefix-sum + anchor remeasure + e2e)

---

# 1차 버전 이후(Deferred)
- [ ] (선택) perf benchmark job (nightly 또는 PR label)
