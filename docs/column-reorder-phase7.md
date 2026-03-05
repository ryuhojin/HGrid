# Phase 7.2 - Column Reorder

## 목표
- 헤더 drag로 컬럼 순서를 변경한다.
- drag 중 drop indicator를 표시한다.
- `getState()/setState()`에 컬럼 순서를 포함해 복원 가능하게 한다.

## 구현 요약
- `DomRenderer`에 헤더 drag reorder 세션을 추가했다.
  - pointerdown: 헤더 셀에서 reorder 세션 시작(리사이즈 히트 영역 제외)
  - pointermove: drop target 계산 + indicator 위치 갱신(rAF coalescing)
  - pointerup: column order 계산 후 `columnReorder` 이벤트 emit
- drop indicator
  - `.hgrid__header-drop-indicator`를 header 레이어에 추가
  - target 셀의 before/after 경계 기준으로 indicator 위치를 표시
- Grid 연동
  - `columnReorder` 이벤트를 수신해 `ColumnModel.setColumnOrder()`로 반영
  - `GridState`에 `columnOrder?: string[]`를 추가
  - `getState()`는 `scrollTop + columnOrder`를 반환하고, `setState()`는 order 복원 후 scrollTop을 적용

## 범위/제약
- 현재 reorder는 "현재 보이는 컬럼 목록" 기준으로 수행된다.
- hidden 컬럼은 `ColumnModel.setColumnOrder`의 기존 정책(누락 id 뒤에 유지)에 따라 자동 보존된다.

## 검증
- unit: `packages/grid-core/test/grid.spec.ts`
  - drag reorder 동작, drop indicator 표시, 이벤트 payload 검증
  - state save/restore 시 column order 복원 검증
- e2e: `examples/example25.html` + `scripts/run-e2e.mjs`
  - drag 시나리오 + state 저장/복원 자동 검증
