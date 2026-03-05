# Phase 7.3 - Column Pin/Hide

## 목표
- 런타임에서 컬럼 pin(left/right) 변경을 지원한다.
- 런타임에서 컬럼 visibility 토글을 지원한다.
- state 저장/복원 시 pin/visibility가 함께 복원되도록 한다.

## 구현 요약
- `Grid.setColumnPin(columnId, pinned?)` API를 추가했다.
  - `pinned`: `"left" | "right" | undefined`
- 기존 `setColumnVisibility(columnId, isVisible)`와 결합해 pin/hide를 독립적으로 제어한다.
- `GridState` 확장:
  - `columnOrder?: string[]`
  - `hiddenColumnIds?: string[]`
  - `pinnedColumns?: Record<string, "left" | "right">`
- `getState()`는 현재 pin/hide/order 상태를 직렬화하고,
  `setState()`는 order -> visibility -> pin 순으로 복원한 후 scrollTop을 적용한다.

## 성능/안정성 포인트
- pin/hide는 스크롤 경로가 아니라 설정 변경 경로에서만 반영된다.
- 스크롤 중 DOM 풀링 정책은 그대로 유지된다.

## 검증
- unit: `packages/grid-core/test/grid.spec.ts`
  - runtime pin/hide 반영
  - state 저장/복원 시 pin/hide 복구
- e2e: `examples/example26.html` + `scripts/run-e2e.mjs`
  - pin-left/right, hide/show, state save/mutate/restore 시나리오 검증
  - 1M provider에서 120회 컬럼 변경(stress) 수행 시 DOM pool 고정 + frame gap 상한 검증
