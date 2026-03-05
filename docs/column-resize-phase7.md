# Phase 7.1 - Column Resize

## 목표
- 헤더 경계 drag로 컬럼 폭을 변경한다.
- `minWidth`/`maxWidth`를 항상 보장한다.
- 드래그 중 입력 폭주(pointermove)를 `requestAnimationFrame`으로 coalescing 한다.

## 구현 요약
- `DomRenderer`에 헤더 경계 hit-test를 추가했다.
  - 대상: `.hgrid__header-cell` 우측 `6px` 영역
  - 기본 선택/편집 pointer 흐름보다 먼저 resize 세션을 시작한다.
- resize 세션은 `window` 레벨 pointer 이벤트로 추적한다.
  - `pointermove`는 마지막 좌표만 저장하고 rAF에서 1회 처리
  - `pointerup/pointercancel`에서 최종 폭을 `end` phase로 커밋
- 폭 계산은 항상 clamp 한다.
  - `width = clamp(startWidth + deltaX, minWidth, maxWidth)`
- 이벤트 버스에 `columnResize` 이벤트를 추가했다.
  - `phase: start | move | end`
  - `Grid`는 `move/end`를 받아 `ColumnModel.setColumnWidth` + 렌더 동기화 수행

## 성능/안정성 포인트
- 스크롤 가상화/풀링 경로와 분리된 헤더 drag 입력만 처리한다.
- 드래그 중에도 per-cell 리스너를 만들지 않고 root/윈도우 위임만 사용한다.
- DOM-only이며 Canvas/WebGL/eval/new Function 경로는 추가하지 않았다.

## 검증
- unit: `packages/grid-core/test/grid.spec.ts`
  - header-edge drag로 min/max clamp 동작
  - pointermove burst 시 move 이벤트가 rAF coalescing 되는지 확인
- e2e: `examples/example24.html` + `scripts/run-e2e.mjs`
  - min/max/mid 리사이즈 시나리오
  - resize 이벤트 phase와 폭 반영 확인
