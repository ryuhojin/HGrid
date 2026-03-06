# Phase 12.3 i18n

## Scope
- locale strings 외부화(`localeText`)
- `Intl` 기반 number/date 기본 포맷 적용
- `rtl` 옵션으로 루트 방향 제어

## Options
- `locale?: string`
  - 기본값: `en-US`
- `localeText?: Partial<GridLocaleText>`
  - 내부 접근성/상태 문자열 오버라이드
- `numberFormatOptions?: Intl.NumberFormatOptions`
- `dateTimeFormatOptions?: Intl.DateTimeFormatOptions`
- `rtl?: boolean`
  - `true`일 때 root에 `dir="rtl"`, `.hgrid--rtl` 적용

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

## RTL Policy
- 지원 범위:
  - root direction 토글
  - 셀/헤더 텍스트 정렬 전환
  - group/tree indentation 방향 전환
- 비고:
  - pinned zone의 논리적 left/right 모델은 유지한다.

## Verification
- unit/integration:
  - `column-model.spec.ts` Intl 포맷 검증
  - `grid.spec.ts` locale 포맷 변경/localeText/rtl 반영 검증
- e2e:
  - `example40.html` locale/rtl 전환 시 UI/ARIA snapshot 검증
