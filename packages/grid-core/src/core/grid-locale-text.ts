import type { GridLocaleText, RowIndicatorCheckAllScope } from './grid-options';

const EN_US_LOCALE_TEXT: GridLocaleText = {
  selectAllRows: 'Select all rows ({scope})',
  selectRow: 'Select row {row}',
  selectRowGeneric: 'Select row',
  groupingRow: 'Grouping row',
  rowStatus: 'Row {row} status',
  rowStatusWithValue: 'Row {row} status {status}',
  rowNumber: 'Row {row} number',
  validationFailed: 'Validation failed',
  columnMenuSortAsc: 'Sort ascending',
  columnMenuSortDesc: 'Sort descending',
  columnMenuClearSort: 'Clear sort',
  columnMenuPinLeft: 'Pin left',
  columnMenuPinRight: 'Pin right',
  columnMenuUnpin: 'Unpin',
  columnMenuAutoSizeColumn: 'Auto-size column',
  columnMenuResetColumnWidth: 'Reset column width',
  columnMenuHideColumn: 'Hide column',
  scopeAll: 'all',
  scopeFiltered: 'filtered',
  scopeViewport: 'viewport'
};

const KO_KR_LOCALE_TEXT: GridLocaleText = {
  selectAllRows: '모든 행 선택 ({scope})',
  selectRow: '{row}행 선택',
  selectRowGeneric: '행 선택',
  groupingRow: '그룹 행',
  rowStatus: '{row}행 상태',
  rowStatusWithValue: '{row}행 상태 {status}',
  rowNumber: '{row}행 번호',
  validationFailed: '검증 실패',
  columnMenuSortAsc: '오름차순 정렬',
  columnMenuSortDesc: '내림차순 정렬',
  columnMenuClearSort: '정렬 해제',
  columnMenuPinLeft: '왼쪽 고정',
  columnMenuPinRight: '오른쪽 고정',
  columnMenuUnpin: '고정 해제',
  columnMenuAutoSizeColumn: '열 자동 너비',
  columnMenuResetColumnWidth: '열 너비 초기화',
  columnMenuHideColumn: '열 숨기기',
  scopeAll: '전체',
  scopeFiltered: '필터 결과',
  scopeViewport: '현재 뷰포트'
};

function pickLocaleTextDefaults(locale: string): GridLocaleText {
  if (locale.toLowerCase().startsWith('ko')) {
    return KO_KR_LOCALE_TEXT;
  }

  return EN_US_LOCALE_TEXT;
}

export function normalizeGridLocale(locale: string | undefined, fallback = 'en-US'): string {
  if (typeof locale !== 'string') {
    return fallback;
  }

  const trimmed = locale.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function resolveGridLocaleText(locale: string, overrides?: Partial<GridLocaleText>): GridLocaleText {
  const defaults = pickLocaleTextDefaults(locale);
  if (!overrides) {
    return { ...defaults };
  }

  const resolved: GridLocaleText = { ...defaults };
  const keys = Object.keys(defaults) as Array<keyof GridLocaleText>;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const value = overrides[key];
    if (typeof value === 'string' && value.length > 0) {
      resolved[key] = value;
    }
  }

  return resolved;
}

export function formatGridLocaleText(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null) {
      return '';
    }

    return String(value);
  });
}

export function localizeCheckAllScope(localeText: GridLocaleText, scope: RowIndicatorCheckAllScope): string {
  if (scope === 'all') {
    return localeText.scopeAll;
  }

  if (scope === 'viewport') {
    return localeText.scopeViewport;
  }

  return localeText.scopeFiltered;
}
