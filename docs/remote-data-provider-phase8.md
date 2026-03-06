# Phase 8.1 - RemoteDataProvider

## 목표
- 전체 데이터를 브라우저 메모리에 올리지 않고, 서버 블록 fetch로 무한 스크롤을 지원한다.
- block cache/LRU/prefetch/queryModel(sort/filter)를 코어 계약으로 고정한다.
- 로딩 중 셀은 skeleton UI(`.hgrid__cell--loading`)로 표시한다.

## 구현 범위
- `packages/grid-core/src/data/remote-data-provider.ts`
  - `RemoteDataProvider` 클래스 구현
  - block cache:
    - `blockSize`, `maxBlocks`, `prefetchBlocks`
    - LRU eviction (in-flight block은 보호)
    - scroll 방향 기반 prefetch
  - query model:
    - `sortModel`, `filterModel`, `groupModel?` 계약
    - query 변경 시 in-flight cancel + cache invalidate
  - data 변경 이벤트:
    - `onRowsChanged(listener) => unsubscribe`
  - loading policy:
    - `loadingRowPolicy: "skeleton" | "none"`
    - `isRowLoading(dataIndex)`

- `packages/grid-core/src/core/grid.ts`
  - provider `onRowsChanged` 구독
  - Remote provider 감지 시 `setSortModel`/`setFilterModel`을 로컬 executor 대신 queryModel 위임 경로로 전환

- `packages/grid-core/src/render/dom-renderer.ts`
  - provider `isRowLoading`과 연동
  - 로딩 행은 셀 단위 skeleton class를 적용

- `packages/grid-core/src/grid.css`
  - `.hgrid__cell--loading` shimmer 스타일 추가

## 검증
- unit: `packages/grid-core/test/remote-data-provider.spec.ts`
  - block fetch + listener 통지
  - LRU eviction
  - 방향 기반 prefetch
  - query 변경 invalidate + 요청 파라미터 반영
  - loading policy
  - Grid 통합 skeleton -> data swap
- e2e: `examples/example30.html`, `scripts/run-e2e.mjs`
  - 10M remote row 시나리오
  - server sort/filter query 적용
  - bottom jump 시 tail row 접근

## 리스크 메모
- `groupModel`은 프로토콜 필드만 선반영했고 실제 그룹 연산은 Phase 9에서 구현한다.
- 로딩 skeleton은 DOM class 토글 기반이며, 스크롤 중 DOM 생성/삭제 없이 기존 pool 재사용을 유지한다.
