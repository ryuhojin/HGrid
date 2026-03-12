# Phase 9.1 - Grouping

## 목표
- `groupModel` 기반 그룹 뷰를 core 계약으로 고정한다.
- expand/collapse 상태를 key 기반으로 유지한다.
- 집계(sum/avg/min/max/count/custom reducer)를 지원한다.
- 대용량에서 로컬 그룹은 cooperative 실행(Worker 호환 메시지 계약)으로 UI 프리즈를 줄인다.
- remote datasource에서는 `groupModel`을 서버 query로 전달할 수 있어야 한다.

## 구현 범위
- `packages/grid-core/src/core/grid.ts`
  - 그룹 상태: `groupModel`, `groupExpansionState`, `groupAggregations`, `groupingMode`
  - 그룹 API:
    - `getGroupModel()` / `setGroupModel()` / `clearGroupModel()`
    - `getGroupAggregations()` / `setGroupAggregations()`
    - `getGroupExpansionState()`
    - `setGroupExpanded()` / `toggleGroupExpanded()`
    - `expandAllGroups()` / `collapseAllGroups()`
    - `getGroupingMode()` / `setGroupingMode()`
    - `getGroupedRowsSnapshot()`
  - 파이프라인:
    - 로컬: `sort -> filter -> grouping -> grouped view provider`
    - 원격 + server mode: `queryModel.groupModel` 서버 전달

- `packages/grid-core/src/data/group-executor.ts`
  - 계층 그룹 트리 빌드 + key 생성
  - expand/collapse flatten
  - aggregation: `sum/avg/min/max/count/custom`
  - cooperative yield + cancel(`isCanceled`) 지원

- `packages/grid-core/src/data/grouped-data-provider.ts`
  - 그룹 행/데이터 행 혼합 view 제공
  - 그룹 메타 필드 제공:
    - `__hgrid_internal_row_kind`
    - `__hgrid_internal_group_key`
    - `__hgrid_internal_group_level`
    - `__hgrid_internal_group_column_id`
    - `__hgrid_internal_group_leaf_count`
    - `__hgrid_internal_group_expanded`

- `packages/grid-core/src/render/dom-renderer.ts`, `packages/grid-core/src/grid.css`
  - group row 스타일, 들여쓰기, expand glyph 표시
  - group row 편집 방지

## 서버/로컬 모드 정책
- remote provider + `grouping.mode = "server"`:
  - Grid는 `queryModel.groupModel`을 provider에 전달한다.
  - 실제 그룹 계산/집계는 서버가 담당한다.
  - 서버 응답은 `rowMetadata.kind="group" | "aggregate" | "leaf"`와 `aggregateValues`, `childCount`, `isExpanded`를 통해 remote group row를 렌더링할 수 있다.
  - remote pivot이 같이 활성화된 경우에도 grouping metadata는 유지되고, 컬럼은 `pivotResult.columns`를 사용한다.
- remote provider + `grouping.mode = "client"`:
  - 전체 데이터가 로컬에 없을 수 있어 정확한 그룹 계산이 어려우므로 비권장이다.
  - 현재 코어는 remote를 항상 query 우선으로 처리한다.
- local provider:
  - `grouping.mode` 값과 무관하게 로컬 grouping 경로를 사용한다.

## 검증
- unit:
  - `packages/grid-core/test/group-executor.spec.ts`
  - `packages/grid-core/test/grid.spec.ts` (local grouping + remote groupModel query)
- example/e2e:
  - `examples/example31.html`
  - `scripts/run-e2e.mjs` Example31

## 리스크 메모
- local grouping은 grouped rows 배열을 생성하므로 그룹 수/row 수가 매우 큰 경우 메모리 사용량이 증가할 수 있다.
- cooperative 실행은 작업을 분할하지만 진짜 Worker offload가 아니므로, 100k+ 고비용 grouping은 Worker 런타임 연결을 후속 단계에서 권장한다.

## 성능 스모크
- `scripts/run-e2e.mjs`는 `__example31.runPerfScenario` 동안 heartbeat(`setInterval(16ms)`) `maxGap`을 측정한다.
- 현재 smoke 기준은 `maxGap < 420ms`다.
