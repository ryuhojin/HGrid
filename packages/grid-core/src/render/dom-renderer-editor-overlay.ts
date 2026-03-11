import type { ColumnDef } from '../core/grid-options';

export interface EditSession {
  rowIndex: number;
  dataIndex: number;
  colIndex: number;
  column: ColumnDef;
  originalValue: unknown;
}

export interface EditorOverlayState {
  isVisible: boolean;
  isInvalid: boolean;
  isPending: boolean;
  isDisabled: boolean;
  message: string;
  nextInputValue: string | null;
}

export interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface EditorOverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type EditorCommitTrigger = 'enter' | 'blur';

export function createEditSession(
  rowIndex: number,
  dataIndex: number,
  colIndex: number,
  column: ColumnDef,
  originalValue: unknown
): EditSession {
  return {
    rowIndex,
    dataIndex,
    colIndex,
    column,
    originalValue
  };
}

export function normalizeEditorInputValue(column: ColumnDef, inputText: string): unknown {
  const trimmedText = inputText.trim();
  if (column.type === 'number') {
    if (trimmedText.length === 0) {
      return null;
    }

    const numericValue = Number(trimmedText);
    return Number.isFinite(numericValue) ? numericValue : inputText;
  }

  if (column.type === 'boolean') {
    const lowerCaseValue = trimmedText.toLowerCase();
    if (lowerCaseValue === 'true' || lowerCaseValue === '1' || lowerCaseValue === 'yes' || lowerCaseValue === 'on') {
      return true;
    }

    if (lowerCaseValue === 'false' || lowerCaseValue === '0' || lowerCaseValue === 'no' || lowerCaseValue === 'off') {
      return false;
    }
  }

  return inputText;
}

export function createOpenEditorOverlayState(originalValue: unknown): EditorOverlayState {
  return {
    isVisible: true,
    isInvalid: false,
    isPending: false,
    isDisabled: false,
    message: '',
    nextInputValue: originalValue === undefined || originalValue === null ? '' : String(originalValue)
  };
}

export function createActiveEditorOverlayState(): EditorOverlayState {
  return {
    isVisible: true,
    isInvalid: false,
    isPending: false,
    isDisabled: false,
    message: '',
    nextInputValue: null
  };
}

export function createPendingEditorOverlayState(): EditorOverlayState {
  return {
    isVisible: true,
    isInvalid: false,
    isPending: true,
    isDisabled: true,
    message: '',
    nextInputValue: null
  };
}

export function createInvalidEditorOverlayState(message: string): EditorOverlayState {
  return {
    isVisible: true,
    isInvalid: true,
    isPending: false,
    isDisabled: false,
    message,
    nextInputValue: null
  };
}

export function createClosedEditorOverlayState(): EditorOverlayState {
  return {
    isVisible: false,
    isInvalid: false,
    isPending: false,
    isDisabled: false,
    message: '',
    nextInputValue: null
  };
}

export function resolveEditorOverlayRect(cellRect: RectLike, rootRect: RectLike): EditorOverlayRect {
  return {
    left: Math.max(0, cellRect.left - rootRect.left),
    top: Math.max(0, cellRect.top - rootRect.top),
    width: Math.max(1, cellRect.width),
    height: Math.max(1, cellRect.height)
  };
}

export function shouldRefocusEditorAfterValidationFailure(trigger: EditorCommitTrigger): boolean {
  return trigger === 'blur';
}
