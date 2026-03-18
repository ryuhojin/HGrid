# Phase 12.3 i18n

## Scope
- locale strings 외부화(`localeText`)
- `Intl` 기반 number/date 기본 포맷 적용
- IME / 조합 입력과 공존하는 locale-aware editing

## Options
- `locale?: string`
  - 기본값: `en-US`
- `localeText?: Partial<GridLocaleText>`
  - 내부 접근성/상태 문자열 오버라이드
- `numberFormatOptions?: Intl.NumberFormatOptions`
- `dateTimeFormatOptions?: Intl.DateTimeFormatOptions`

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

## IME / Direction Policy
- grid root는 항상 `ltr`로 고정한다.
- 다국어 지원 범위는 locale text와 `Intl` formatting이다.
- 조합 입력(IME) 중에는 Enter/Escape/Tab이 편집 commit/cancel과 충돌하지 않도록 별도 guard를 둔다.

## Verification
- unit/integration:
  - `column-model.spec.ts` Intl 포맷 검증
  - `grid.spec.ts` locale 포맷 변경/localeText 반영 검증
- e2e:
  - `example40.html` locale 전환 시 UI/ARIA snapshot 검증
