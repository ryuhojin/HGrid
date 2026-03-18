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
  columnMenuOpenFilter: 'Open filter',
  contextMenuCopyCell: 'Copy cell',
  contextMenuCopyRow: 'Copy row',
  contextMenuCopySelection: 'Copy selection',
  contextMenuFilterByValue: 'Filter by this value',
  contextMenuClearColumnFilter: 'Clear column filter',
  filterPanelTitle: 'Filter',
  filterPanelQuickMode: 'Quick',
  filterPanelBuilderMode: 'Builder',
  filterPanelOperator: 'Operator',
  filterPanelValue: 'Value',
  filterPanelMin: 'Min',
  filterPanelMax: 'Max',
  filterPanelSearch: 'Search values',
  filterPanelConditionOne: 'Condition 1',
  filterPanelConditionTwo: 'Condition 2',
  filterPanelAnd: 'AND',
  filterPanelTextMode: 'Text',
  filterPanelSetMode: 'Set',
  filterPanelColumn: 'Column',
  filterPanelMatch: 'Match',
  filterPanelAddRule: 'Add rule',
  filterPanelAddGroup: 'Add group',
  filterPanelGroup: 'Group',
  filterPanelRemoveRule: 'Remove',
  filterPanelNoRules: 'No advanced rules yet',
  filterPanelApply: 'Apply',
  filterPanelClear: 'Clear',
  filterPanelCancel: 'Cancel',
  filterPanelConditionKind: 'Type',
  filterPanelPresetsTitle: 'Presets',
  filterPanelPresetName: 'Preset name',
  filterPanelPresetSave: 'Save preset',
  filterPanelPresetApply: 'Apply preset',
  filterPanelPresetDelete: 'Delete preset',
  filterPanelPresetEmpty: 'No saved presets',
  filterRowPlaceholderText: 'Filter text',
  filterRowPlaceholderNumber: '>=10 / 10..20',
  filterRowPlaceholderDate: '2026-03-16 or 2026-03-01..2026-03-31',
  filterRowBooleanAny: 'Any',
  filterRowBooleanTrue: 'True',
  filterRowBooleanFalse: 'False',
  filterRowBooleanBlank: 'Blank',
  filterRowSetAny: 'Any',
  filterRowSetBlank: 'Blank',
  toolPanelColumnsTitle: 'Columns',
  toolPanelFiltersTitle: 'Filters',
  toolPanelGroupingTitle: 'Grouping',
  toolPanelPivotTitle: 'Pivot',
  toolPanelToggle: 'Panels',
  toolPanelClose: 'Close',
  toolPanelSearchColumns: 'Search columns',
  toolPanelNoColumns: 'No columns match the current search',
  toolPanelMoveColumnUp: 'Move column up',
  toolPanelMoveColumnDown: 'Move column down',
  toolPanelLayoutPresets: 'Layout presets',
  toolPanelApplyLayoutPreset: 'Apply preset',
  toolPanelNoLayoutPresets: 'No saved presets',
  editActionBarDirtySummary: '{rows} rows / {cells} cells edited',
  editActionBarSave: 'Save',
  editActionBarDiscard: 'Discard',
  editActionBarSaving: 'Saving...',
  editActionBarDiscarding: 'Discarding...',
  editActionBarSaved: 'Changes saved',
  editActionBarDiscarded: 'Changes discarded',
  editActionBarSaveFailed: 'Save failed',
  editActionBarDiscardFailed: 'Discard failed',
  statusBarSelectionCells: '{count} cells selected',
  statusBarSelectionRows: '{count} rows selected',
  statusBarVisibleRows: 'Visible {count}',
  statusBarRows: 'Rows {count}',
  statusBarFilteredRows: 'Filtered {filtered} / {total}',
  statusBarAggregatesCalculating: 'Calculating {percent}%',
  statusBarSum: 'Sum {value}',
  statusBarAvg: 'Avg {value}',
  statusBarMin: 'Min {value}',
  statusBarMax: 'Max {value}',
  statusBarRemoteSynced: 'Remote synced',
  statusBarRemoteLoading: 'Loading {count}',
  statusBarRemoteRefreshing: 'Refreshing {count}',
  statusBarRemoteError: 'Errors {count}',
  statusBarRemotePending: 'Pending {rows} rows / {cells} cells',
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
  columnMenuOpenFilter: '필터 열기',
  contextMenuCopyCell: '셀 복사',
  contextMenuCopyRow: '행 복사',
  contextMenuCopySelection: '선택 영역 복사',
  contextMenuFilterByValue: '이 값으로 필터',
  contextMenuClearColumnFilter: '이 열 필터 해제',
  filterPanelTitle: '필터',
  filterPanelQuickMode: '빠른 필터',
  filterPanelBuilderMode: '빌더',
  filterPanelOperator: '연산자',
  filterPanelValue: '값',
  filterPanelMin: '최소값',
  filterPanelMax: '최대값',
  filterPanelSearch: '값 검색',
  filterPanelConditionOne: '조건 1',
  filterPanelConditionTwo: '조건 2',
  filterPanelAnd: '그리고',
  filterPanelTextMode: '텍스트',
  filterPanelSetMode: '집합',
  filterPanelColumn: '열',
  filterPanelMatch: '결합',
  filterPanelAddRule: '조건 추가',
  filterPanelAddGroup: '그룹 추가',
  filterPanelGroup: '그룹',
  filterPanelRemoveRule: '삭제',
  filterPanelNoRules: '고급 필터 조건이 없습니다',
  filterPanelApply: '적용',
  filterPanelClear: '초기화',
  filterPanelCancel: '닫기',
  filterPanelConditionKind: '조건 유형',
  filterPanelPresetsTitle: '프리셋',
  filterPanelPresetName: '프리셋 이름',
  filterPanelPresetSave: '프리셋 저장',
  filterPanelPresetApply: '프리셋 적용',
  filterPanelPresetDelete: '프리셋 삭제',
  filterPanelPresetEmpty: '저장된 프리셋이 없습니다',
  filterRowPlaceholderText: '텍스트 필터',
  filterRowPlaceholderNumber: '>=10 / 10..20',
  filterRowPlaceholderDate: '2026-03-16 또는 2026-03-01..2026-03-31',
  filterRowBooleanAny: '전체',
  filterRowBooleanTrue: '참',
  filterRowBooleanFalse: '거짓',
  filterRowBooleanBlank: '빈 값',
  filterRowSetAny: '전체',
  filterRowSetBlank: '빈 값',
  toolPanelColumnsTitle: '열',
  toolPanelFiltersTitle: '필터',
  toolPanelGroupingTitle: '그룹',
  toolPanelPivotTitle: '피벗',
  toolPanelToggle: '패널',
  toolPanelClose: '닫기',
  toolPanelSearchColumns: '열 검색',
  toolPanelNoColumns: '검색과 일치하는 열이 없습니다',
  toolPanelMoveColumnUp: '열 위로 이동',
  toolPanelMoveColumnDown: '열 아래로 이동',
  toolPanelLayoutPresets: '레이아웃 프리셋',
  toolPanelApplyLayoutPreset: '프리셋 적용',
  toolPanelNoLayoutPresets: '저장된 프리셋이 없습니다',
  editActionBarDirtySummary: '{rows}행 / {cells}셀 변경',
  editActionBarSave: '저장',
  editActionBarDiscard: '되돌리기',
  editActionBarSaving: '저장 중...',
  editActionBarDiscarding: '되돌리는 중...',
  editActionBarSaved: '변경사항을 저장했습니다',
  editActionBarDiscarded: '변경사항을 되돌렸습니다',
  editActionBarSaveFailed: '저장 실패',
  editActionBarDiscardFailed: '되돌리기 실패',
  statusBarSelectionCells: '{count}개 셀 선택',
  statusBarSelectionRows: '{count}개 행 선택',
  statusBarVisibleRows: '표시 {count}',
  statusBarRows: '행 {count}',
  statusBarFilteredRows: '필터 {filtered} / 전체 {total}',
  statusBarAggregatesCalculating: '집계 계산 중 {percent}%',
  statusBarSum: '합계 {value}',
  statusBarAvg: '평균 {value}',
  statusBarMin: '최소 {value}',
  statusBarMax: '최대 {value}',
  statusBarRemoteSynced: '원격 동기화 완료',
  statusBarRemoteLoading: '로딩 {count}',
  statusBarRemoteRefreshing: '새로고침 {count}',
  statusBarRemoteError: '오류 {count}',
  statusBarRemotePending: '대기 {rows}행 / {cells}셀',
  scopeAll: '전체',
  scopeFiltered: '필터 결과',
  scopeViewport: '현재 뷰포트'
};

const DE_DE_LOCALE_TEXT: GridLocaleText = {
  ...EN_US_LOCALE_TEXT,
  selectAllRows: 'Alle Zeilen auswählen ({scope})',
  selectRow: 'Zeile {row} auswählen',
  selectRowGeneric: 'Zeile auswählen',
  groupingRow: 'Gruppierungszeile',
  rowStatus: 'Zeile {row} Status',
  rowStatusWithValue: 'Zeile {row} Status {status}',
  rowNumber: 'Zeile {row} Nummer',
  validationFailed: 'Validierung fehlgeschlagen',
  columnMenuSortAsc: 'Aufsteigend sortieren',
  columnMenuSortDesc: 'Absteigend sortieren',
  columnMenuClearSort: 'Sortierung löschen',
  columnMenuPinLeft: 'Links anheften',
  columnMenuPinRight: 'Rechts anheften',
  columnMenuUnpin: 'Lösen',
  columnMenuAutoSizeColumn: 'Spalte automatisch anpassen',
  columnMenuResetColumnWidth: 'Spaltenbreite zurücksetzen',
  columnMenuHideColumn: 'Spalte ausblenden',
  columnMenuOpenFilter: 'Filter öffnen',
  contextMenuCopyCell: 'Zelle kopieren',
  contextMenuCopyRow: 'Zeile kopieren',
  contextMenuCopySelection: 'Auswahl kopieren',
  contextMenuFilterByValue: 'Nach diesem Wert filtern',
  contextMenuClearColumnFilter: 'Spaltenfilter löschen',
  filterPanelTitle: 'Filter',
  filterPanelQuickMode: 'Schnell',
  filterPanelBuilderMode: 'Builder',
  filterPanelOperator: 'Operator',
  filterPanelValue: 'Wert',
  filterPanelMin: 'Min',
  filterPanelMax: 'Max',
  filterPanelSearch: 'Werte suchen',
  filterPanelConditionOne: 'Bedingung 1',
  filterPanelConditionTwo: 'Bedingung 2',
  filterPanelAnd: 'UND',
  filterPanelTextMode: 'Text',
  filterPanelSetMode: 'Menge',
  filterPanelColumn: 'Spalte',
  filterPanelMatch: 'Verknüpfung',
  filterPanelAddRule: 'Regel hinzufügen',
  filterPanelAddGroup: 'Gruppe hinzufügen',
  filterPanelGroup: 'Gruppe',
  filterPanelRemoveRule: 'Entfernen',
  filterPanelNoRules: 'Noch keine erweiterten Regeln',
  filterPanelApply: 'Anwenden',
  filterPanelClear: 'Zurücksetzen',
  filterPanelCancel: 'Schließen',
  filterPanelConditionKind: 'Typ',
  filterPanelPresetsTitle: 'Voreinstellungen',
  filterPanelPresetName: 'Name der Voreinstellung',
  filterPanelPresetSave: 'Voreinstellung speichern',
  filterPanelPresetApply: 'Voreinstellung anwenden',
  filterPanelPresetDelete: 'Voreinstellung löschen',
  filterPanelPresetEmpty: 'Keine gespeicherten Voreinstellungen',
  filterRowPlaceholderText: 'Text filtern',
  filterRowPlaceholderDate: '2026-03-16 oder 2026-03-01..2026-03-31',
  filterRowBooleanAny: 'Alle',
  filterRowBooleanTrue: 'Wahr',
  filterRowBooleanFalse: 'Falsch',
  filterRowBooleanBlank: 'Leer',
  filterRowSetAny: 'Alle',
  filterRowSetBlank: 'Leer',
  toolPanelColumnsTitle: 'Spalten',
  toolPanelFiltersTitle: 'Filter',
  toolPanelGroupingTitle: 'Gruppierung',
  toolPanelPivotTitle: 'Pivot',
  toolPanelToggle: 'Paneele',
  toolPanelClose: 'Schließen',
  toolPanelSearchColumns: 'Spalten suchen',
  toolPanelNoColumns: 'Keine passenden Spalten',
  toolPanelMoveColumnUp: 'Spalte nach oben',
  toolPanelMoveColumnDown: 'Spalte nach unten',
  toolPanelLayoutPresets: 'Layout-Voreinstellungen',
  toolPanelApplyLayoutPreset: 'Voreinstellung anwenden',
  toolPanelNoLayoutPresets: 'Keine gespeicherten Voreinstellungen',
  editActionBarDirtySummary: '{rows} Zeilen / {cells} Zellen geändert',
  editActionBarSave: 'Speichern',
  editActionBarDiscard: 'Verwerfen',
  editActionBarSaving: 'Speichert...',
  editActionBarDiscarding: 'Verwirft...',
  editActionBarSaved: 'Änderungen gespeichert',
  editActionBarDiscarded: 'Änderungen verworfen',
  editActionBarSaveFailed: 'Speichern fehlgeschlagen',
  editActionBarDiscardFailed: 'Verwerfen fehlgeschlagen',
  statusBarSelectionCells: '{count} Zellen ausgewählt',
  statusBarSelectionRows: '{count} Zeilen ausgewählt',
  statusBarVisibleRows: 'Sichtbar {count}',
  statusBarRows: 'Zeilen {count}',
  statusBarFilteredRows: 'Gefiltert {filtered} / {total}',
  statusBarAggregatesCalculating: 'Berechne {percent}%',
  statusBarSum: 'Summe {value}',
  statusBarAvg: 'Mittelwert {value}',
  statusBarMin: 'Min {value}',
  statusBarMax: 'Max {value}',
  statusBarRemoteSynced: 'Remote synchronisiert',
  statusBarRemoteLoading: 'Lädt {count}',
  statusBarRemoteRefreshing: 'Aktualisiert {count}',
  statusBarRemoteError: 'Fehler {count}',
  statusBarRemotePending: 'Ausstehend {rows} Zeilen / {cells} Zellen',
  scopeAll: 'alle',
  scopeFiltered: 'gefiltert',
  scopeViewport: 'Viewport'
};

export const GRID_LOCALE_TEXT_BUNDLES: Readonly<Record<string, GridLocaleText>> = Object.freeze({
  'en-US': EN_US_LOCALE_TEXT,
  'ko-KR': KO_KR_LOCALE_TEXT,
  'de-DE': DE_DE_LOCALE_TEXT
});

function resolveGridLocaleBundleKey(locale: string | undefined): string | null {
  const normalizedLocale = normalizeGridLocale(locale, '');
  if (normalizedLocale.length === 0) {
    return null;
  }

  const exactKeys = Object.keys(GRID_LOCALE_TEXT_BUNDLES);
  for (let index = 0; index < exactKeys.length; index += 1) {
    const key = exactKeys[index];
    if (key.toLowerCase() === normalizedLocale.toLowerCase()) {
      return key;
    }
  }

  const language = normalizedLocale.split('-')[0]?.toLowerCase();
  if (!language) {
    return null;
  }

  for (let index = 0; index < exactKeys.length; index += 1) {
    const key = exactKeys[index];
    if (key.toLowerCase().startsWith(`${language}-`)) {
      return key;
    }
  }

  return null;
}

export function getGridLocaleTextBundle(locale: string | undefined): GridLocaleText | null {
  const bundleKey = resolveGridLocaleBundleKey(locale);
  if (!bundleKey) {
    return null;
  }

  return { ...GRID_LOCALE_TEXT_BUNDLES[bundleKey] };
}

function pickLocaleTextDefaults(locale: string): GridLocaleText {
  const bundle = getGridLocaleTextBundle(locale);
  if (bundle) {
    return bundle;
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
