# Phase 7.6 Column Group Header

## Summary
- Added `ColumnGroupDef` schema:
  - `groupId`, `header`, `children`, `collapsed?`
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
- `collapsed` is included in schema and visual state class (`.hgrid__header-cell--group-collapsed`) but does not yet toggle child visibility.
