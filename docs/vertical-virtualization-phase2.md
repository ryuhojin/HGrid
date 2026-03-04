# Phase 2.2 Vertical Virtualization

## Core Formula
- `virtualScrollTop = mapNativeToVirtual(nativeScrollTop)`
- `firstVisibleRow = floor(virtualScrollTop / rowHeight)`
- `startRow = max(0, firstVisibleRow - overscan)`
- `poolSize = ceil(viewportHeight / rowHeight) + overscan * 2`

## Rendering Contract
- Row pool is created once per layout capacity and reused while scrolling.
- Scrolling only updates:
  - `rows viewport transform`
  - pooled row binding (`rowIndex -> dataIndex`)
  - cell `textContent`
- Pinned left/center/right zones share the same vertical window (`startRow`).

## Large Row Count Behavior
- With `rowCount` at `1,000,000` and `10,000,000`, center row DOM count stays fixed at `poolSize`.
- Vertical scroll source remains `.hgrid__v-scroll` and drives row window calculation.
- Native vertical spacer height is capped (`MAX_NATIVE_SCROLL_HEIGHT`) and mapped to virtual height.
- `Grid.getState().scrollTop` returns virtual scroll top, and `setState({ scrollTop })` accepts virtual scroll top.

## Validation
- Unit: `packages/grid-core/test/grid.spec.ts` large-row virtualization test.
- E2E: `examples/example9.html` + `scripts/run-e2e.mjs` Example 9 checks.
