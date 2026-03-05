# Phase 5.1 Editing Policy

## Scope
- Single overlay editor only.
- No per-cell input creation.
- Editor lifecycle:
  - start: `dblclick` or `Enter`
  - commit: `Enter` or `blur`
  - cancel: `Escape`

## Policy
- Editor DOM is created once under `.hgrid__overlay` and reused for every editable cell.
- Scroll/virtualization does not allocate editor nodes; the same overlay instance is repositioned.
- On layout/column/data reconcile, active editing session is safely canceled (`reason: reconcile`).

## Validation
- `validateEdit(context)` is optional and supports both:
  - sync return: `string | null | undefined`
  - async return: `Promise<string | null | undefined>`
- Non-empty string means invalid and keeps editor open with error message.
- Async validation sets pending UI (`--pending`, input disabled) and ignores stale results with validation ticket guard.

## Events
- `editStart`: `{rowIndex, dataIndex, columnId, value}`
- `editCommit`: `{rowIndex, dataIndex, columnId, previousValue, value}`
- `editCancel`: `{rowIndex, dataIndex, columnId, value, reason}`

## Validation Coverage
- Unit/integration:
  - enter/dblclick start paths
  - enter commit and escape cancel paths
  - sync invalid and async pending/invalid/valid paths
  - async rejection fallback message path
- E2E:
  - `examples/example19.html` scripted lifecycle + validation checks
