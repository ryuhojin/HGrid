# Phase 2.1 DOM Tree and Layout

## DOM Tree
- `root`: `.hgrid`
- `header`: `.hgrid__header`
  - `.hgrid__header-left`
  - `.hgrid__header-center`
    - `.hgrid__header-viewport`
      - `.hgrid__header-row`
  - `.hgrid__header-right`
- `body`: `.hgrid__body`
  - `.hgrid__body-center`
    - `.hgrid__viewport` (render viewport, overflow hidden)
      - `.hgrid__spacer` (single vertical spacer)
      - `.hgrid__rows-viewport--center`
        - `.hgrid__rows-layer--center`
  - `.hgrid__body-left`
    - `.hgrid__rows-viewport--left`
      - `.hgrid__rows-layer--left`
  - `.hgrid__body-right`
    - `.hgrid__rows-viewport--right`
      - `.hgrid__rows-layer--right`
  - `.hgrid__v-scroll` (single native y-scroll source)
    - `.hgrid__v-spacer`
  - `.hgrid__h-scroll` (center-only native x-scroll source)
    - `.hgrid__h-spacer`
- `overlay`: `.hgrid__overlay`

## Layout Strategy
- Vertical and horizontal scroll sources are split:
  - y: `.hgrid__v-scroll`
  - x: `.hgrid__h-scroll`
- Header is never a scroll source; header center only receives transform sync.
- Pinned left/right zones never own x-scroll and are synchronized from center/y source.
- Scrollbar policy:
  - `scrollbarPolicy.vertical`: `auto | always | hidden`
  - `scrollbarPolicy.horizontal`: `auto | always | hidden`

## Transform Mapping
- Header center: `translate3d(-scrollLeft, 0, 0)`
- Center rows viewport: `translate3d(-scrollLeft, viewportOffsetY - virtualScrollTop + nativeScrollTop, 0)`
- Pinned rows viewports: `translate3d(0, viewportOffsetY - virtualScrollTop, 0)`

## Reflow Risk Control
- Scroll path uses only `scrollTop/scrollLeft` reads.
- DOM writes are batched into transform/text updates.
- `isSyncingScroll` guards source sync re-entry loops.

## Related
- Scroll orchestration details: `docs/scroll-orchestration-phase2.md`
- Horizontal virtualization details: `docs/horizontal-virtualization-phase2.md`
- Vertical virtualization details: `docs/vertical-virtualization-phase2.md`
- Row/cell pooling details: `docs/row-cell-pooling-phase2.md`
- Render scheduler details: `docs/render-scheduler-phase2.md`
