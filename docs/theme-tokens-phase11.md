# Phase 11.1 — CSS Variables Tokens

## 목표
- 테마 토큰을 CSS Variables로 표준화
- light/dark 테마 클래스 제공
- `setTheme()` API로 런타임 오버라이드 지원

## 테마 클래스
- `.h-theme-light`
- `.h-theme-dark`

적용 방식:
- 부모 컨테이너에 클래스 적용: `<div class="h-theme-dark"><div id="grid"></div></div>`
- 또는 grid root에 직접 적용: `<div class="hgrid h-theme-dark">...</div>`

## 토큰 카테고리

### 1) Typography
- `--hgrid-font-family`
- `--hgrid-font-size`
- `--hgrid-font-weight`
- `--hgrid-header-font-weight`
- `--hgrid-header-group-font-size`
- `--hgrid-state-font-size`

### 2) Color
- base:
  - `--hgrid-bg`, `--hgrid-text`, `--hgrid-muted-text`
  - `--hgrid-border-color`
- header:
  - `--hgrid-header-bg`
  - `--hgrid-header-group-bg`
  - `--hgrid-header-group-text`
  - `--hgrid-header-resize-handle`
  - `--hgrid-header-drag-bg`
  - `--hgrid-drop-indicator`
- rows/selection:
  - `--hgrid-row-alt-bg`
  - `--hgrid-group-row-bg`
  - `--hgrid-group-row-text`
  - `--hgrid-selection-bg`
  - `--hgrid-row-selection-bg`
  - `--hgrid-active-border`
- pinned/loading:
  - `--hgrid-pinned-separator-color`
  - `--hgrid-pinned-shadow-color`
  - `--hgrid-pinned-shadow-fade-color`
  - `--hgrid-loading-shimmer-start`
  - `--hgrid-loading-shimmer-mid`
  - `--hgrid-loading-shimmer-end`
- editor:
  - `--hgrid-editor-border`
  - `--hgrid-editor-bg`
  - `--hgrid-editor-shadow`
  - `--hgrid-editor-invalid-border`
  - `--hgrid-editor-message-text`
  - `--hgrid-editor-message-bg`
  - `--hgrid-editor-message-border`
- state:
  - `--hgrid-state-updated`
  - `--hgrid-state-clean`
  - `--hgrid-state-inserted`
  - `--hgrid-state-deleted`
  - `--hgrid-state-error`

### 3) Line
- `--hgrid-line-width`
- `--hgrid-active-outline-width`
- `--hgrid-editor-border-width`
- `--hgrid-editor-radius`

### 4) Padding
- `--hgrid-cell-padding-y`, `--hgrid-cell-padding-x`
- `--hgrid-header-cell-padding-y`, `--hgrid-header-cell-padding-x`
- `--hgrid-header-indicator-padding-y`, `--hgrid-header-indicator-padding-x`
- `--hgrid-header-group-padding-y`, `--hgrid-header-group-padding-x`
- `--hgrid-indicator-checkbox-padding-x`
- `--hgrid-editor-input-padding-y`, `--hgrid-editor-input-padding-x`
- `--hgrid-editor-message-padding-y`, `--hgrid-editor-message-padding-x`

### 5) Layout/Dynamic
- `--hgrid-header-row-height`
- `--hgrid-header-height`
- `--hgrid-v-scrollbar-width`
- `--hgrid-h-scrollbar-height`
- `--hgrid-pinned-shadow-size`

## API
```ts
grid.setTheme({
  '--hgrid-header-bg': '#fffbeb',
  '--hgrid-border-color': '#fcd34d',
  '--hgrid-active-border': 'rgba(217, 119, 6, 0.95)'
});
```

`setTheme()`은 root `.hgrid`에 inline CSS variable을 적용한다.

## 참고 예제
- `examples/example37.html`
