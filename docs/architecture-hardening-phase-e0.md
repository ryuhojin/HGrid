# Phase E0 - Architecture Hardening

## E0.1 Grid Orchestrator Hardening
### 목표
- `Grid`가 모든 상태 직렬화/복원, 원격 query 동기화 책임을 직접 들고 있지 않도록 첫 분해를 시작한다.
- 기능 동작을 바꾸지 않고 service 단위 경계를 먼저 고정한다.

### 이번 단계에서 분리한 책임

### 1) State Service
- 파일: `packages/grid-core/src/core/grid-state-service.ts`
- 역할:
  - `GridState` snapshot 생성
  - `GridState` apply 처리
  - column order / hidden / pinning 적용
  - grouping / pivoting state 반영 결과 계산

### 2) Remote Query Service
- 파일: `packages/grid-core/src/core/grid-remote-query-service.ts`
- 역할:
  - remote query model 생성
  - remote provider에 query 동기화
  - remote row count 기준 `RowModel` 동기화

### 3) Shared Model Utils
- 파일: `packages/grid-core/src/core/grid-model-utils.ts`
- 역할:
  - group/pivot model clone 공통화
  - expansion state clone 공통화

### 4) Data Pipeline Service
- 파일: `packages/grid-core/src/core/grid-data-pipeline-service.ts`
- 역할:
  - flat/group/pivot/tree 파생 뷰 결과를 `RowModel`과 derived provider에 반영
  - grouped/tree provider 재사용 정책 고정
  - `Grid`에서 data pipeline state mutation을 분리

### 5) Command/Event Service
- 파일: `packages/grid-core/src/core/grid-command-event-service.ts`
- 역할:
  - `EventBus` 기본 subscription / cleanup 통합
  - column resize / reorder command 처리
  - group/tree click toggle dispatch
  - edit commit 시 derived view refresh + audit log dispatch

### 6) Export Service
- 파일: `packages/grid-core/src/core/grid-export-service.ts`
- 역할:
  - CSV/TSV scope 해석(`all`/`visible`/`selection`)
  - row/column segment 계산
  - progress / cancellation / chunked yield 처리
  - header/cell serialization 및 escaping

### 7) Provider Lifecycle Service
- 파일: `packages/grid-core/src/core/grid-provider-lifecycle-service.ts`
- 역할:
  - data provider 교체 시 reset/rebind 규칙 계산
  - `rowsChanged` 이벤트 수명주기 관리
  - active derived view / remote provider 여부에 따른 refresh 경로 결정

### Grid에 남겨둔 책임
- data pipeline orchestration
- renderer coordination
- mode 판단 및 executor 선택

즉, 이번 단계에서 `Grid`는 개별 기능 구현보다 service 조합과 실행 순서를 관리하는 orchestration facade에 가깝게 정리됐다.
현재 `Grid`는 executor 호출, mode 판단, renderer와 service 간 연결만 담당하고, service들은 state/remote/data pipeline/event/export/provider lifecycle을 맡는다.

### 다음 분해 후보
- renderer coordination 세분화
- executor orchestration 보조 모듈화

### 검증
- 기존 `grid.spec.ts` 회귀
- 신규 unit:
  - `packages/grid-core/test/grid-export-service.spec.ts`
  - `packages/grid-core/test/grid-command-event-service.spec.ts`
  - `packages/grid-core/test/grid-data-pipeline-service.spec.ts`
  - `packages/grid-core/test/grid-provider-lifecycle-service.spec.ts`
  - `packages/grid-core/test/grid-state-service.spec.ts`
  - `packages/grid-core/test/grid-remote-query-service.spec.ts`

## E0.2 DomRenderer Hardening
### 이번 단계에서 분리한 책임

#### 1) Layout / Metrics Module
- 파일: `packages/grid-core/src/render/dom-renderer-layout-metrics.ts`
- 역할:
  - pinned/center zone width 계산
  - scrollbar source / reserved extent 계산
  - viewport 대비 center visible width 계산
  - scroll scale / spacer metrics 계산
  - horizontal max scroll 계산

#### 2) Header Interactions Module
- 파일: `packages/grid-core/src/render/dom-renderer-header-interactions.ts`
- 역할:
  - header resize hit 판정
  - column width bounds / resize width 계산
  - reorder drop target / indicator offset 계산
  - reorder session / next column order 계산

현재 `DomRenderer`는 계산 결과를 DOM에 반영하는 쪽에 집중하고, 레이아웃 숫자 계산은 별도 모듈이 담당한다.
header pointer event wiring은 `DomRenderer`에 남겨두되, resize/reorder 계산과 session 생성은 별도 모듈이 담당한다.

### 이번 단계에서 `DomRenderer`에 남겨둔 책임
- row/cell pooling
- header DOM event wiring
- editor overlay
- selection / clipboard rendering
- scroll sync와 transform 적용

### 다음 분해 후보
- editor overlay
- clipboard / selection rendering

### 검증
- 기존 `packages/grid-core/test/grid.spec.ts` 회귀
- 신규 unit:
  - `packages/grid-core/test/dom-renderer-header-interactions.spec.ts`
  - `packages/grid-core/test/dom-renderer-layout-metrics.spec.ts`
