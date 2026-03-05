# Phase 3.5 Variable Row Height

## Added Contracts
- `rowHeightMode: "fixed" | "estimated" | "measured"`
- `estimatedRowHeight?: number`
- `getRowHeight?(rowIndex, dataIndex): number`
- `grid.resetRowHeights(rowIndexes?)`

## Core Strategy
- 기본 높이(`estimatedRowHeight` 또는 `rowHeight`)를 기준으로 가상 높이 축을 유지한다.
- 편차는 sparse cache로만 저장한다.
- 누적 높이 계산은 Fenwick tree 기반으로 유지한다.
  - `rowTop = rowIndex * baseHeight + prefixDelta(rowIndex)`
  - `rowIndex <- virtualTop`은 binary search + prefixDelta 질의로 O(logN).

## Rendering Path
- visible range 시작 행은 `virtualScrollTop` 기준 binary search로 계산한다.
- row 위치는 `poolIndex * rowHeight`가 아니라 `cumulativeTop` 기준 `translate3d`로 계산한다.
- pinned left/center/right는 동일 row top map을 공유한다.

## Measured Mode
- multiline 측정은 render 이후 별도 rAF에서 수행한다.
- column width/viewport 변경 시에는 visible dirty range만 invalidation 후 재측정한다.
- 측정 결과가 바뀌면:
  - 높이 캐시 갱신
  - anchor row top 보정으로 스크롤 점프를 줄임
  - layout/scroll을 다시 flush

## Scale Integration
- scroll scaling은 `virtualHeight = rowHeightMap.getTotalHeight()`를 사용한다.
- `getState().scrollTop`/`setState({scrollTop})`는 기존처럼 virtual 축 기준을 유지한다.

## Validation
- unit: `packages/grid-core/test/row-height-map.spec.ts`
- integration: `packages/grid-core/test/grid.spec.ts`
- e2e: `scripts/run-e2e.mjs` Example15
- example: `examples/example15.html` (5K mixed + 100M synthetic)
