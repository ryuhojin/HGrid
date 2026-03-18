import { describe, expect, it } from 'vitest';

import { getGridLocaleTextBundle, resolveGridLocaleText } from '../src/core/grid-locale-text';

describe('grid-locale-text', () => {
  it('resolves built-in locale bundles by exact locale and language prefix', () => {
    const koBundle = getGridLocaleTextBundle('ko-KR');
    const deBundle = getGridLocaleTextBundle('de');

    expect(koBundle?.selectAllRows).toBe('모든 행 선택 ({scope})');
    expect(deBundle?.selectAllRows).toBe('Alle Zeilen auswählen ({scope})');
  });

  it('returns null for unknown built-in locale bundle keys', () => {
    expect(getGridLocaleTextBundle('fr-FR')).toBeNull();
  });

  it('resolves locale text from built-in bundle with overrides', () => {
    const localeText = resolveGridLocaleText('de-DE', {
      selectAllRows: 'Alle markieren ({scope})'
    });

    expect(localeText.selectAllRows).toBe('Alle markieren ({scope})');
    expect(localeText.columnMenuPinLeft).toBe('Links anheften');
  });
});
