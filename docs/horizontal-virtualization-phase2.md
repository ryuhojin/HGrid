# Phase 2.3 Horizontal Virtualization

## Core Data
- `centerColumnLeft[]`: center 영역 prefix sum (`colLeft[]`)
- `centerColumnWidth[]`: center column widths
- `centerColumnsWidth`: 전체 center width

## Visible Range
- `firstVisible = first column where columnEnd > scrollLeft`
- `endVisibleExclusive = first column where columnStart >= scrollLeft + centerVisibleWidth`
- overscan 적용:
  - `start = max(0, firstVisible - overscanCols)`
  - `end = min(colCount, endVisibleExclusive + overscanCols)`
- 검색은 binary search로 수행.

## Pooling Contract
- center row는 `centerCellCapacity` 슬롯만 생성.
- 스크롤 중에는 슬롯 수를 변경하지 않고:
  - 슬롯에 바인딩되는 `columnId/left/width/textContent`만 갱신.
- pinned left/right는 기존 고정 컨테이너 렌더를 유지.

## Sync Contract
- `scrollLeft` source는 `.hgrid__h-scroll` 단일화.
- header center transform과 body center transform은 동일 프레임에서 동기화.

## Validation
- unit: `packages/grid-core/test/grid.spec.ts`
  - fixed center cell pool during horizontal scroll
  - `overscanCols` 반영 확인
- e2e: `examples/example10.html` + `scripts/run-e2e.mjs` Example 10 checks
