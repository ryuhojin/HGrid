import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '../src/core/grid-options';
import {
  createActiveEditorOverlayState,
  createClosedEditorOverlayState,
  createEditSession,
  createInvalidEditorOverlayState,
  createOpenEditorOverlayState,
  createPendingEditorOverlayState,
  normalizeEditorInputValue,
  resolveEditorOverlayRect,
  shouldRefocusEditorAfterValidationFailure
} from '../src/render/dom-renderer-editor-overlay';

function createColumn(type: ColumnDef['type']): ColumnDef {
  return {
    id: `${type}-column`,
    header: type.toUpperCase(),
    width: 160,
    type
  };
}

describe('dom-renderer-editor-overlay', () => {
  it('creates edit sessions with stable coordinate metadata', () => {
    const column = createColumn('text');

    expect(createEditSession(3, 8, 2, column, 'alpha')).toEqual({
      rowIndex: 3,
      dataIndex: 8,
      colIndex: 2,
      column,
      originalValue: 'alpha'
    });
  });

  it('normalizes number editor values and preserves invalid text input', () => {
    const numberColumn = createColumn('number');

    expect(normalizeEditorInputValue(numberColumn, '')).toBeNull();
    expect(normalizeEditorInputValue(numberColumn, ' 42.5 ')).toBe(42.5);
    expect(normalizeEditorInputValue(numberColumn, 'not-a-number')).toBe('not-a-number');
  });

  it('normalizes boolean editor values but preserves unknown text', () => {
    const booleanColumn = createColumn('boolean');

    expect(normalizeEditorInputValue(booleanColumn, 'true')).toBe(true);
    expect(normalizeEditorInputValue(booleanColumn, ' YES ')).toBe(true);
    expect(normalizeEditorInputValue(booleanColumn, '0')).toBe(false);
    expect(normalizeEditorInputValue(booleanColumn, 'off')).toBe(false);
    expect(normalizeEditorInputValue(booleanColumn, 'pending')).toBe('pending');
  });

  it('leaves text and date editor values untouched', () => {
    expect(normalizeEditorInputValue(createColumn('text'), ' raw text ')).toBe(' raw text ');
    expect(normalizeEditorInputValue(createColumn('date'), '2026-03-11')).toBe('2026-03-11');
  });

  it('creates overlay states for open, active, pending, invalid, and closed transitions', () => {
    expect(createOpenEditorOverlayState(123)).toEqual({
      isVisible: true,
      isInvalid: false,
      isPending: false,
      isDisabled: false,
      message: '',
      nextInputValue: '123'
    });
    expect(createOpenEditorOverlayState(null).nextInputValue).toBe('');
    expect(createActiveEditorOverlayState()).toEqual({
      isVisible: true,
      isInvalid: false,
      isPending: false,
      isDisabled: false,
      message: '',
      nextInputValue: null
    });
    expect(createPendingEditorOverlayState()).toEqual({
      isVisible: true,
      isInvalid: false,
      isPending: true,
      isDisabled: true,
      message: '',
      nextInputValue: null
    });
    expect(createInvalidEditorOverlayState('validation failed')).toEqual({
      isVisible: true,
      isInvalid: true,
      isPending: false,
      isDisabled: false,
      message: 'validation failed',
      nextInputValue: null
    });
    expect(createClosedEditorOverlayState()).toEqual({
      isVisible: false,
      isInvalid: false,
      isPending: false,
      isDisabled: false,
      message: '',
      nextInputValue: null
    });
  });

  it('resolves overlay rect relative to the root and clamps size to a visible minimum', () => {
    expect(
      resolveEditorOverlayRect(
        {
          left: 88,
          top: 54,
          width: 0,
          height: -12
        },
        {
          left: 100,
          top: 20,
          width: 640,
          height: 480
        }
      )
    ).toEqual({
      left: 0,
      top: 34,
      width: 1,
      height: 1
    });
  });

  it('only refocuses the editor after blur-triggered validation failures', () => {
    expect(shouldRefocusEditorAfterValidationFailure('blur')).toBe(true);
    expect(shouldRefocusEditorAfterValidationFailure('enter')).toBe(false);
  });
});
