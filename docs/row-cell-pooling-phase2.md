# Phase 2.4 Row/Cell Pooling

## Pooling Contract
- Row pool size is fixed by viewport capacity and overscan.
- Scroll path does not create or remove row/cell DOM nodes.
- Pooled rows are rebound by index (`rowIndex -> dataIndex`) and moved by transform.

## Row Reuse
- Every pooled row uses `transform: translate3d(0, y, 0)` for vertical placement.
- Hidden rows are toggled only with `display` and later reused in-place.

## Cell Update Minimization
- Each pooled cell keeps render-state cache:
  - `isVisible`
  - `columnId`
  - `textContent`
  - positional properties (`left`, `width`) for center virtual cells
- DOM writes run only when cached state differs from next state.
- Scroll path does not toggle CSS classes for pooled rows/cells.

## Validation
- Unit: `packages/grid-core/test/grid.spec.ts`
  - pooled row/cell identity stays stable across stress scrolling
  - no `childList` mutation under row layers during scroll
- E2E: `examples/example11.html` + `scripts/run-e2e.mjs` Example 11 checks
  - node counts and pool sizes remain constant after stress scrolling
