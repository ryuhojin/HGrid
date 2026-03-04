# Phase 2.5 Render Scheduler (rAF) + Dirty Flags

## Dirty Flags
- `layoutDirty`
- `dataDirty`
- `selectionDirty`
- `themeDirty`
- `scrollDirty`

All flags are merged into a single `requestAnimationFrame` flush cycle.

## Scheduler Contract
- Input handlers (`scroll`, `wheel`) update state only and mark dirty flags.
- DOM work is deferred to `flushRender()` in a scheduled rAF callback.
- Re-entrancy is guarded by existing `isSyncingScroll`.

## Flush Order
1. Apply pending theme tokens (`themeDirty`)
2. Run layout refresh if `layoutDirty` (optionally force pool rebuild)
3. Otherwise run row rendering when `scrollDirty | dataDirty | selectionDirty`
4. Clear dirty flags in one place

## Coalescing
- Repeated events within the same frame must trigger one render pass.
- Verified by:
  - unit: `packages/grid-core/test/grid.spec.ts` (multiple scroll events -> 1 render pass per frame)
  - e2e: `examples/example12.html` + `scripts/run-e2e.mjs` (burst scroll/wheel before/after rAF counters)
