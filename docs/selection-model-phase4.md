# Phase 4.2 Selection Model

## Purpose
- Store cell selection as compact ranges (`{r1,c1,r2,c2}`) instead of per-cell flags.
- Keep row selection as range objects with row-key boundaries.
- Emit a stable `selectionChange` payload for large-scale integrations.

## Data Shape
- `cellRanges`: `Array<{ r1, c1, r2, c2 }>`
- `rowRanges`: `Array<{ r1, r2, rowKeyStart, rowKeyEnd }>`
- `activeCell`: `{ rowIndex, colIndex } | null`

The renderer never materializes full row/column selection bitmaps.

## API
- `grid.getSelection()`
- `grid.setSelection({ activeCell?, cellRanges?, rowRanges? })`
- `grid.clearSelection()`

`setSelection` keeps current state for omitted fields and normalizes/clamps out-of-range indexes.

## Event Contract
- Event: `selectionChange`
- Payload:
  - `source`: `"pointer" | "api" | "clear" | "reconcile"`
  - `activeCell`
  - `cellRanges`
  - `rowRanges`

## Interaction
- Pointer down on a cell starts a range.
- Pointer move/up updates the focused end of the range.
- Selection rendering is applied only to pooled visible rows/cells.

## Performance Notes
- Selection rendering uses the existing pooled row/cell update path.
- Drag input coalesces through the existing rAF scheduler.
- At 1M rows, selected DOM node count remains bounded by viewport pool size.
