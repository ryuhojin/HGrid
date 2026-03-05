# Phase 4.3 Keyboard Navigation

## Scope
- Arrow keys: active cell movement
- PageUp/PageDown: viewport-step row movement
- Home/End:
  - without modifier: row 유지 + first/last column 이동
  - with `Ctrl/Cmd`: top-left / bottom-right edge 이동
- Shift + navigation: anchor-based range extension

## Policy
- Selection source is emitted as `keyboard` in `selectionChange`.
- Keyboard range anchor is preserved while `Shift` is pressed.
- On non-shift navigation, selection collapses to a single active cell.

## Visibility/Focus Stability
- When active cell moves out of viewport:
  - vertical scroll is adjusted to keep target row visible
  - center horizontal scroll is adjusted to keep target column visible
- Active/selected rendering is bound to pooled visible cells only.

## Validation
- Unit/integration:
  - keyboard navigation updates `activeCell`
  - shift range extension updates `{r1,c1,r2,c2}`
  - `Ctrl/Cmd + Home/End` edge jump behavior
- E2E:
  - `examples/example18.html` scripted keyboard scenarios
  - arrows/shift/page/home/end state and payload checks
