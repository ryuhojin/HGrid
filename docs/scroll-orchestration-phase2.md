# Phase 2.0 Scroll Orchestration

## Purpose
- Keep one authoritative scroll state (`scrollTop`, `scrollLeft`) while preserving AG-like split scroll shell.
- Prevent header/body desync during high-frequency wheel and trackpad input.
- Keep pin/resize changes stable without scroll jump or invalid ranges.

## Scroll Sources
- Vertical source: `.hgrid__v-scroll`
- Horizontal source: `.hgrid__h-scroll`
- Render viewport `.hgrid__viewport` remains `overflow: hidden` and is not used as the primary source when y-scroll source is enabled.

## Event Orchestration
- `wheel` on body/header/h-scroll is routed to source scroll elements.
- Source `scroll` events update pending state:
  - `pendingScrollTop`
  - `pendingScrollLeft`
- `isSyncingScroll` prevents re-entrant loops when syncing source elements programmatically.

## Render Path
- Immediate sync path (before rAF):
  - Header center x-transform is applied immediately.
  - Center viewport x-transform is applied immediately.
  - Pinned vertical transform is applied immediately when the current row window can be reused.
- Deferred path (`requestAnimationFrame`):
  - Recompute row window start index from `scrollTop`.
  - Rebind pooled rows for new data indices.
  - Commit final transforms for left/center/right viewports.

## Resize and Pin Stability
- Container resize triggers layout refresh via `ResizeObserver` (fallback: `window.resize`).
- Layout refresh sequence:
  - recalc zone widths/scroll source extents
  - refresh spacer sizes
  - rebuild pool when viewport row capacity changes
  - clamp and restore `scrollTop/scrollLeft`
  - render with clamped state
- Pin changes use the same path, so scroll positions are preserved and revalidated.

## Validation Coverage
- e2e includes:
  - rapid wheel input stress (header-body transform sync)
  - pinned-origin wheel forwarding to center x/y sources
  - resize + pin swap stability with scroll clamp verification
