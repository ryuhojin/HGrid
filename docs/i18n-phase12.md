# Phase 12.3 i18n

## Scope
- locale strings 외부화(`localeText`)
- built-in locale bundle helper 제공
- `Intl` 기반 number/date 기본 포맷 적용
- IME / 조합 입력과 공존하는 locale-aware editing

## Options
- `locale?: string`
  - 기본값: `en-US`
- `localeText?: Partial<GridLocaleText>`
  - 내부 접근성/상태 문자열 오버라이드
- `numberFormatOptions?: Intl.NumberFormatOptions`
- `dateTimeFormatOptions?: Intl.DateTimeFormatOptions`

## Built-in Locale Bundle Strategy
- core는 다음 built-in bundle을 제공한다.
  - `en-US`
  - `ko-KR`
  - `de-DE`
- public helper:
  - `GRID_LOCALE_TEXT_BUNDLES`
  - `getGridLocaleTextBundle(locale)`
- helper는 exact locale과 language prefix를 둘 다 지원한다.
  - 예: `de-DE`, `de`
- 고객사는 다음 패턴으로 bundle + override를 조합한다.
  - `const localeText = { ...getGridLocaleTextBundle('de-DE'), ...customerOverrides }`

## Locale Text Keys
- `selectAllRows`
- `selectRow`
- `selectRowGeneric`
- `groupingRow`
- `rowStatus`
- `rowStatusWithValue`
- `rowNumber`
- `validationFailed`
- `scopeAll` / `scopeFiltered` / `scopeViewport`

## Intl Formatting Policy
- `column.formatter`가 있으면 formatter를 우선 사용
- formatter가 없으면:
  - `type: "number"` -> `Intl.NumberFormat(locale, numberFormatOptions)`
  - `type: "date"` -> `Intl.DateTimeFormat(locale, dateTimeFormatOptions)`
  - 그 외 타입 -> 문자열 변환

## Customer Recipe
- built-in bundle과 formatting option을 조합해 고객사 recipe를 만든다.
- 참조 예제:
  - [example40.html](../examples/example40.html)
    - `bundle en-US`
    - `bundle de-DE`
    - `bundle ko-KR`
    - `recipe finance de-DE`
- finance recipe 예:
  - `locale = "de-DE"`
  - `localeText = { ...getGridLocaleTextBundle("de-DE"), selectAllRows: "Finanzzeilen auswählen ({scope})" }`
  - `numberFormatOptions = { style: "currency", currency: "EUR" }`

## IME / Direction Policy
- grid root는 항상 `ltr`로 고정한다.
- 다국어 지원 범위는 locale text와 `Intl` formatting이다.
- 조합 입력(IME) 중에는 Enter/Escape/Tab이 편집 commit/cancel과 충돌하지 않도록 별도 guard를 둔다.
- 조합 입력 종료 전에는:
  - `Enter`: commit 금지
  - `Escape`: cancel 금지
  - `Tab`: commit + focus move 금지
- 참조 예제:
  - [example98.html](../examples/example98.html)

## Verification
- unit/integration:
  - `grid-locale-text.spec.ts` built-in bundle helper 검증
  - `column-model.spec.ts` Intl 포맷 검증
  - `grid.spec.ts` locale 포맷 변경/localeText 반영 검증
  - `grid.spec.ts` editor IME composition guard 검증
- e2e:
  - `example40.html` locale bundle + customer recipe snapshot 검증
  - `example98.html` IME composition guard + locale bundle aria label 검증
