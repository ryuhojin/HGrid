# Phase 7.6 Column Group Header

## Summary
- Added `ColumnGroupDef` schema:
  - `groupId`, `header`, `children`
- Added `columnGroups` option to `GridConfig/GridOptions`.
- Implemented multi-level header group rows on top of leaf header rows.
- Group rows are recalculated from visible/pinned/reordered columns per zone (`left/center/right`).

## Rendering Model
- Leaf header row keeps existing behavior (including center horizontal virtualization for leaf cells).
- Group header rows are rendered as separate rows and aligned by column metric (`left/width`) per zone.
- Header total height is dynamic:
  - `--hgrid-header-row-height`: single row height
  - `--hgrid-header-height`: `(groupRows + 1) * rowHeight`

## A11y
- Group cells:
  - `role="columnheader"`
  - `aria-colspan` set to leaf span count
- Leaf cells:
  - `role="columnheader"`
- Resize/reorder hit-test targets leaf header cells only (`.hgrid__header-cell--leaf`).

## Integration
- Pin/Hide/Reorder:
  - group row layout follows latest visible column order and zone split automatically.
- Mixed pinned zones:
  - same group can be split into multiple zone-local group cells with correct span.

## Notes
- Column group collapse UX is currently not supported.
- The public schema does not expose a no-op `collapsed` flag anymore.
