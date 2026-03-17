# Phase 11.2 — Design Guide (SI)

## 목적
이 문서는 HGrid를 고객사 디자인 시스템에 맞춰 안전하게 커스터마이징하기 위한 운영 가이드다.
핵심 원칙은 다음과 같다.

1. 구조/레이아웃 로직은 변경하지 않고 CSS Variables만 조정한다.
2. 테마 클래스(`.h-theme-light`, `.h-theme-dark`, `.h-theme-enterprise`)와 `grid.setThemePreset()/setThemeMode()/setTheme()`를 조합한다.
3. 접근성 대비(텍스트/배경 대비, 포커스 가시성)를 유지한다.

## Safe Override Boundary

고객사 CSS 커스터마이징은 아래 경계 안에서만 진행한다.

1. root selector
- `.hgrid`
- `.h-theme-mode-light`
- `.h-theme-mode-dark`
- `.h-theme-preset-enterprise`

2. app shell selector
- `.customer-ops-shell .hgrid`
- 프로젝트 wrapper class를 통해 CSS variable만 override한다.

3. 금지
- row/cell absolute positioning 변경
- viewport/pool layout class에 `display/position/overflow` 직접 override
- scroll container 크기 계산을 깨는 padding/margin 삽입

실무 기준 안전한 커스터마이징 경계는 이제 header/body 셀뿐 아니라 filter row, filter panel, side bar/tool panel, status bar, edit action bar까지 포함한다.

## 토큰 -> UI 반영 위치

| 토큰 | UI 반영 위치 | 적용 대상 셀렉터/영역 |
| --- | --- | --- |
| `--hgrid-font-family` | 전체 폰트 | `.hgrid` |
| `--hgrid-font-size` | 기본 본문 글자 크기 | `.hgrid` |
| `--hgrid-font-weight` | 기본 텍스트 두께 | `.hgrid` |
| `--hgrid-header-font-weight` | 헤더/그룹/상태 텍스트 두께 | `.hgrid__header-cell`, `.hgrid__row--group .hgrid__cell`, `.hgrid__cell--state` |
| `--hgrid-header-group-font-size` | 그룹 헤더/인디케이터 상태 텍스트 크기 | `.hgrid__header-row--group .hgrid__header-cell`, `.hgrid__cell--indicator-status` |
| `--hgrid-state-font-size` | 상태/에디터 메시지 폰트 크기 | `.hgrid__cell--state`, `.hgrid__editor-message` |
| `--hgrid-bg` | 그리드 배경 | `.hgrid`, pinned body 배경 |
| `--hgrid-text` | 기본 텍스트 색 | `.hgrid` |
| `--hgrid-muted-text` | 보조 텍스트 | row number |
| `--hgrid-border-color` | 주요 경계선 색상 | 외곽/헤더/셀/행 border |
| `--hgrid-header-bg` | 일반 헤더 배경 | `.hgrid__header`, `.hgrid__header-cell` |
| `--hgrid-header-group-bg` | 그룹 헤더 배경 | `.hgrid__header-row--group .hgrid__header-cell` |
| `--hgrid-header-group-text` | 그룹 헤더 텍스트 | `.hgrid__header-row--group .hgrid__header-cell` |
| `--hgrid-row-alt-bg` | zebra 짝수행 배경 | `.hgrid__row:nth-child(even)` |
| `--hgrid-group-row-bg` | 그룹 행 배경 | `.hgrid__row--group` |
| `--hgrid-group-row-text` | 그룹 행 텍스트 | `.hgrid__row--group .hgrid__cell` |
| `--hgrid-selection-bg` | 셀 선택 배경 | `.hgrid__cell--selected` |
| `--hgrid-row-selection-bg` | 행 선택 배경 | `.hgrid__row--selected` |
| `--hgrid-active-border` | 활성 셀 포커스 테두리 | `.hgrid__cell--active` |
| `--hgrid-header-resize-handle` | 리사이즈 핸들 하이라이트 | `.hgrid__header-cell--resize-hover::after` |
| `--hgrid-header-drag-bg` | 컬럼 드래그 중 헤더 배경 | `.hgrid__header-cell--dragging` |
| `--hgrid-drop-indicator` | reorder drop indicator | `.hgrid__header-drop-indicator` |
| `--hgrid-pinned-separator-color` | pinned 경계선 | `.hgrid__header-right::before`, `.hgrid__body-right::before` |
| `--hgrid-pinned-shadow-color` | pinned shadow 본체 | pinned 좌/우 `::after` 그라디언트 |
| `--hgrid-pinned-shadow-fade-color` | pinned shadow 페이드 | pinned 좌/우 `::after` 그라디언트 |
| `--hgrid-loading-shimmer-*` | 로딩 셀 shimmer | `.hgrid__cell--loading` |
| `--hgrid-editor-border` | 에디터 기본 테두리 | `.hgrid__editor-host` |
| `--hgrid-editor-bg` | 에디터 배경 | `.hgrid__editor-host` |
| `--hgrid-editor-shadow` | 에디터 그림자 | `.hgrid__editor-host` |
| `--hgrid-editor-invalid-border` | 에디터 검증 실패 테두리 | `.hgrid__editor-host--invalid` |
| `--hgrid-editor-message-text/bg/border` | 에러 메시지 텍스트/배경/테두리 | `.hgrid__editor-message` |
| `--hgrid-state-updated/clean/inserted/deleted/error` | 상태 컬럼 색상 | `.hgrid__cell--state-*` |
| `--hgrid-line-width` | 주요 border 두께 | 외곽/헤더/셀/행 선 |
| `--hgrid-active-outline-width` | 활성 셀 outline 두께 | `.hgrid__cell--active` |
| `--hgrid-editor-border-width` | 에디터 border 두께 | `.hgrid__editor-host`, `.hgrid__editor-message` |
| `--hgrid-editor-radius` | 에디터 메시지 radius | `.hgrid__editor-message` |
| `--hgrid-cell-padding-*` | body cell padding | `.hgrid__cell` |
| `--hgrid-header-cell-padding-*` | 일반 헤더 padding | `.hgrid__header-cell` |
| `--hgrid-header-indicator-padding-*` | 인디케이터 헤더 padding | `.hgrid__header-cell--indicator` |
| `--hgrid-header-group-padding-*` | 그룹 헤더 padding | `.hgrid__header-cell--group` |
| `--hgrid-indicator-checkbox-padding-x` | 인디케이터 체크박스 셀 좌우 여백 | `.hgrid__cell--indicator-checkbox` |
| `--hgrid-editor-input-padding-*` | 에디터 입력창 padding | `.hgrid__editor-input` |
| `--hgrid-editor-message-padding-*` | 에디터 메시지 padding | `.hgrid__editor-message` |
| `--hgrid-header-row-height`, `--hgrid-header-height` | 헤더 행 높이 | header row/viewport |
| `--hgrid-v-scrollbar-width`, `--hgrid-h-scrollbar-height` | 스크롤러 예약 영역 | header/body/viewport/h/v scroll |
| `--hgrid-pinned-shadow-size` | pinned shadow 폭 | pinned `::after` |

## SI 커스터마이징 레시피

### 레시피 1: 색상 브랜딩
```ts
grid.setTheme({
  '--hgrid-header-bg': '#f8fafc',
  '--hgrid-header-group-bg': '#eef2ff',
  '--hgrid-border-color': '#cbd5e1',
  '--hgrid-selection-bg': 'rgba(30, 64, 175, 0.20)',
  '--hgrid-row-selection-bg': 'rgba(30, 64, 175, 0.10)',
  '--hgrid-active-border': 'rgba(30, 64, 175, 0.95)'
});
```
운영 팁:
1. 선택색(`selection`)은 본문 가독성을 해치지 않도록 alpha 0.08~0.28 범위를 권장한다.
2. `active-border`는 선택색보다 진한 톤으로 설정해 키보드 포커스 가시성을 유지한다.

### 레시피 2: 폰트/밀도 조정
```ts
grid.setTheme({
  '--hgrid-font-family': '"Pretendard", "Noto Sans KR", sans-serif',
  '--hgrid-font-size': '12px',
  '--hgrid-cell-padding-y': '3px',
  '--hgrid-cell-padding-x': '8px',
  '--hgrid-header-cell-padding-y': '6px',
  '--hgrid-header-cell-padding-x': '8px'
});
```
운영 팁:
1. 본문 글자 크기를 줄이면 `rowHeight` 옵션도 함께 조정해 줄바꿈/클리핑을 방지한다.
2. 숫자 가독성이 중요하면 상태/인디케이터 폰트는 기본값 유지가 안전하다.

### 레시피 3: 헤더 강조/구조감 강화
```ts
grid.setTheme({
  '--hgrid-header-font-weight': '700',
  '--hgrid-header-group-font-size': '12px',
  '--hgrid-line-width': '1px',
  '--hgrid-header-resize-handle': 'rgba(99, 102, 241, 0.85)',
  '--hgrid-drop-indicator': '#4f46e5'
});
```
운영 팁:
1. 헤더 강조 시 본문 대비가 과해지지 않도록 border 명도는 1단계 낮춘다.
2. reordering drop indicator 색상은 선택색 계열과 통일하면 UX 일관성이 높다.

### 레시피 4: 선택/포커스 접근성 강화
```ts
grid.setTheme({
  '--hgrid-selection-bg': 'rgba(22, 163, 74, 0.22)',
  '--hgrid-row-selection-bg': 'rgba(22, 163, 74, 0.12)',
  '--hgrid-active-border': 'rgba(21, 128, 61, 0.98)',
  '--hgrid-active-outline-width': '2px'
});
```
운영 팁:
1. 키보드 중심 사용자 비중이 높다면 outline 두께를 `2px`로 올린다.
2. 선택색과 포커스색 hue를 동일 계열로 맞추되 명암 대비를 충분히 둔다.

## 고객사 테마 샘플

### 샘플 A: 공공기관(고대비 라이트)
```ts
const themePublic = {
  '--hgrid-font-family': '"Noto Sans KR", sans-serif',
  '--hgrid-bg': '#ffffff',
  '--hgrid-text': '#111827',
  '--hgrid-header-bg': '#f3f4f6',
  '--hgrid-header-group-bg': '#e5e7eb',
  '--hgrid-border-color': '#9ca3af',
  '--hgrid-selection-bg': 'rgba(37, 99, 235, 0.22)',
  '--hgrid-active-border': 'rgba(29, 78, 216, 0.98)'
};
```

### 샘플 B: 금융사(딥 다크)
```ts
const themeFinanceDark = {
  '--hgrid-bg': '#0b1220',
  '--hgrid-text': '#dbe7ff',
  '--hgrid-header-bg': '#111827',
  '--hgrid-header-group-bg': '#1f2937',
  '--hgrid-border-color': '#334155',
  '--hgrid-selection-bg': 'rgba(56, 189, 248, 0.24)',
  '--hgrid-row-selection-bg': 'rgba(56, 189, 248, 0.12)',
  '--hgrid-active-border': 'rgba(125, 211, 252, 0.95)',
  '--hgrid-editor-bg': '#0f172a',
  '--hgrid-editor-border': '#38bdf8'
};
```

### 샘플 C: 물류/운영(앰버 포커스)
```ts
const themeOpsAmber = {
  '--hgrid-font-family': '"Pretendard", "Noto Sans KR", sans-serif',
  '--hgrid-header-bg': '#fffbeb',
  '--hgrid-header-group-bg': '#fef3c7',
  '--hgrid-header-group-text': '#92400e',
  '--hgrid-border-color': '#fcd34d',
  '--hgrid-selection-bg': 'rgba(245, 158, 11, 0.25)',
  '--hgrid-row-selection-bg': 'rgba(245, 158, 11, 0.14)',
  '--hgrid-active-border': 'rgba(217, 119, 6, 0.96)',
  '--hgrid-drop-indicator': '#d97706'
};
```

## 적용 순서 권장
1. 기본 테마 클래스 선택(`.h-theme-light` 또는 `.h-theme-dark`).
2. built-in preset/mode를 먼저 고른다.
3. 고객사 브랜드 토큰을 `setTheme()` 또는 wrapper CSS variable로 오버라이드한다.
3. Selection/Focus 대비 확인.
4. 헤더 높이/패딩 변경 시 rowHeight 및 예제 화면에서 셀 클리핑 확인.

## 검증 체크 포인트
1. pinned left/right 경계선과 shadow가 배경과 구분되는지.
2. selection + active cell 동시 표시가 충분히 식별되는지.
3. 편집 상태(invalid/pending) 메시지 대비가 접근성 기준을 충족하는지.
4. 다크 테마에서 상태 컬럼(`updated/error`) 색이 서로 구분되는지.

## 연계 문서
- `docs/theme-tokens-phase11.md`
- `examples/example37.html`
- `examples/example92.html`
