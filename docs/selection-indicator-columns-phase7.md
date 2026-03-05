# Phase 7.5 Selection/Indicator Columns

## Summary
- Added reserved column ids:
  - `__indicatorRowNumber`: row number column (pinned-left, fixed width)
  - `__indicatorCheckbox`: row checkbox column (pinned-left, fixed width)
  - `__indicatorStatus`: row status column (pinned-left)
  - `__indicator` (legacy): checkbox column alias for backward compatibility
  - `__state`: optional external state column (pinned-left) with render hook support
- Added `rowIndicator` and `stateColumn` options in `GridOptions`.
- Implemented indicator checkbox interactions with event delegation:
  - row checkbox toggle
  - header checkAll (checked / indeterminate / disabled)
  - keyboard `Space` toggle on active indicator cell
- Selection state remains range-based (`rowRanges`) to keep memory stable at large row counts.

## `rowIndicator` Options
- `width?: number`
- `showCheckbox?: boolean`
- `checkAllScope?: "all" | "filtered" | "viewport"`
- `getRowStatus?: (context) => "inserted" | "updated" | "deleted" | "invalid" | "error" | "clean" | null`

## `stateColumn` Options
- `render?: (context) => string | { text?, ariaLabel?, tooltip?, tone? }`
- `tone` supports:
  - `"inserted" | "updated" | "deleted" | "invalid" | "error" | "clean" | "dirty" | "commit"`

## Scope Note
- Current row selection model is view-index based.
- Therefore `checkAllScope: "all"` and `"filtered"` both operate on the current view range.
- `checkAllScope: "viewport"` targets only the currently rendered viewport row range.

## CSP / DOM Notes
- No `eval` / `new Function` / string-timer usage.
- Default text rendering still uses `textContent`.
- Indicator/status/state cell UI are created once in pool rows and reused during scroll (no scroll-time DOM churn).
