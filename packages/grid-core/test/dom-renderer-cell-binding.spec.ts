import { describe, expect, it } from 'vitest';
import { bindCell, prependCellContentPrefix } from '../src/render/dom-renderer-cell-binding';
import { createCellRenderState } from '../src/render/dom-renderer-row-pool';

describe('dom-renderer-cell-binding', () => {
  it('prepends text and html content without losing render mode', () => {
    expect(
      prependCellContentPrefix(
        {
          textContent: 'Alpha',
          contentMode: 'text',
          htmlContent: ''
        },
        '▾'
      )
    ).toEqual({
      textContent: '▾ Alpha',
      contentMode: 'text',
      htmlContent: ''
    });

    expect(
      prependCellContentPrefix(
        {
          textContent: 'Beta',
          contentMode: 'html',
          htmlContent: '<strong>Beta</strong>'
        },
        '<'
      )
    ).toEqual({
      textContent: '< Beta',
      contentMode: 'html',
      htmlContent: '&lt; <strong>Beta</strong>'
    });
  });

  it('applies text cell DOM state and aria/class diffs', () => {
    const cell = document.createElement('div');
    const cellState = createCellRenderState(false, '', Number.NaN);

    bindCell(cell, cellState, {
      isVisible: true,
      columnId: 'name',
      textContent: 'Alpha',
      role: 'gridcell',
      left: 120,
      width: 180,
      isSelected: true,
      isActive: true,
      extraClassName: 'hgrid__cell--tree',
      titleText: 'Title',
      ariaLabel: 'Row 1 Name',
      ariaRowIndex: 3,
      ariaColIndex: 2,
      cellId: 'cell-r3-c2'
    });

    expect(cell.style.display).toBe('');
    expect(cell.dataset.columnId).toBe('name');
    expect(cell.textContent).toBe('Alpha');
    expect(cell.style.left).toBe('120px');
    expect(cell.style.width).toBe('180px');
    expect(cell.classList.contains('hgrid__cell--selected')).toBe(true);
    expect(cell.classList.contains('hgrid__cell--active')).toBe(true);
    expect(cell.classList.contains('hgrid__cell--tree')).toBe(true);
    expect(cell.title).toBe('Title');
    expect(cell.getAttribute('aria-label')).toBe('Row 1 Name');
    expect(cell.getAttribute('aria-rowindex')).toBe('3');
    expect(cell.getAttribute('aria-colindex')).toBe('2');
    expect(cell.id).toBe('cell-r3-c2');
  });

  it('switches from text to html content and clears stale state when hidden', () => {
    const cell = document.createElement('div');
    const cellState = createCellRenderState(true, 'name', 160);

    bindCell(cell, cellState, {
      isVisible: true,
      columnId: 'name',
      textContent: 'Alpha',
      role: 'gridcell'
    });

    bindCell(cell, cellState, {
      isVisible: true,
      columnId: 'name',
      textContent: 'Beta',
      contentMode: 'html',
      htmlContent: '<strong>Beta</strong>',
      extraClassName: 'hgrid__cell--state',
      titleText: 'State'
    });

    expect(cell.innerHTML).toBe('<strong>Beta</strong>');
    expect(cell.classList.contains('hgrid__cell--state')).toBe(true);

    bindCell(cell, cellState, {
      isVisible: false,
      columnId: '',
      textContent: '',
      isSelected: false,
      isActive: false
    });

    expect(cell.style.display).toBe('none');
    expect(cell.classList.contains('hgrid__cell--selected')).toBe(false);
    expect(cell.classList.contains('hgrid__cell--active')).toBe(false);
  });

  it('uses trustedTypes policy when trustedTypesPolicyName is provided', () => {
    const originalTrustedTypes = (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes;
    const createPolicyCalls: string[] = [];
    try {
      (globalThis as typeof globalThis & { trustedTypes?: { createPolicy(name: string, rules: { createHTML(value: string): string }): { createHTML(value: string): string } } }).trustedTypes = {
        createPolicy(name, rules) {
          createPolicyCalls.push(name);
          return {
            createHTML(value: string) {
              return rules.createHTML(value);
            }
          };
        }
      };

      const cell = document.createElement('div');
      const cellState = createCellRenderState(true, 'name', 160);

      bindCell(cell, cellState, {
        isVisible: true,
        columnId: 'name',
        textContent: 'Beta',
        contentMode: 'html',
        htmlContent: '<strong>Beta</strong>',
        trustedTypesPolicyName: 'hgrid-test-policy'
      });

      expect(createPolicyCalls).toEqual(['hgrid-test-policy']);
      expect(cell.innerHTML).toBe('<strong>Beta</strong>');
    } finally {
      if (originalTrustedTypes === undefined) {
        delete (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes;
      } else {
        (globalThis as typeof globalThis & { trustedTypes?: unknown }).trustedTypes = originalTrustedTypes;
      }
    }
  });
});
