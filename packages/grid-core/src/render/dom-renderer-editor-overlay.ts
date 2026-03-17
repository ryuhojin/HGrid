import type {
  ColumnDef,
  EditValidationIssue,
  GridCellEditorOption,
  GridCellEditorType,
  GridMaskedEditorMode
} from '../core/grid-options';

export type ResolvedGridCellEditorType = Exclude<GridCellEditorType, 'auto'>;

export interface EditSession {
  rowIndex: number;
  dataIndex: number;
  colIndex: number;
  column: ColumnDef;
  originalValue: unknown;
}

export interface ResolvedColumnEditor {
  type: ResolvedGridCellEditorType;
  placeholder: string;
  options: GridCellEditorOption[];
  strict: boolean;
  min?: number;
  max?: number;
  step?: number;
  inputMode?: HTMLInputElement['inputMode'];
  autoComplete?: string;
  pattern?: string;
  maskMode?: GridMaskedEditorMode;
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

const DEFAULT_BOOLEAN_EDITOR_OPTIONS: GridCellEditorOption[] = [
  {
    value: true,
    label: 'True'
  },
  {
    value: false,
    label: 'False'
  }
];

function resolveAutoEditorType(column: ColumnDef): ResolvedGridCellEditorType {
  if (column.type === 'number') {
    return 'number';
  }

  if (column.type === 'date') {
    return 'date';
  }

  if (column.type === 'boolean') {
    return 'boolean';
  }

  return 'text';
}

function coerceDateEditorValue(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return '';
    }
    const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) {
      return isoMatch[1];
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
  }

  return '';
}

function sanitizeMaskedValue(maskMode: ResolvedColumnEditor['maskMode'], inputText: string): string {
  if (typeof inputText !== 'string' || inputText.length === 0) {
    return '';
  }

  if (maskMode === 'digits') {
    return inputText.replace(/[^0-9]+/g, '');
  }

  if (maskMode === 'alphanumeric') {
    return inputText.replace(/[^0-9a-z]+/gi, '');
  }

  if (maskMode === 'uppercase') {
    return inputText.toUpperCase();
  }

  if (maskMode === 'lowercase') {
    return inputText.toLowerCase();
  }

  return inputText;
}

export function resolveColumnEditor(column: ColumnDef): ResolvedColumnEditor {
  const configuredEditor = column.editor;
  const requestedType = configuredEditor?.type;
  const type: ResolvedGridCellEditorType =
    requestedType && requestedType !== 'auto' ? requestedType : resolveAutoEditorType(column);
  const options =
    type === 'boolean'
      ? DEFAULT_BOOLEAN_EDITOR_OPTIONS.slice()
      : Array.isArray(configuredEditor?.options)
        ? configuredEditor.options.map((option) => ({
            value: option.value,
            label: option.label
          }))
        : [];

  return {
    type,
    placeholder: typeof configuredEditor?.placeholder === 'string' ? configuredEditor.placeholder : '',
    options,
    strict: configuredEditor?.strict === true,
    min: configuredEditor?.min,
    max: configuredEditor?.max,
    step: configuredEditor?.step,
    inputMode: configuredEditor?.inputMode,
    autoComplete: configuredEditor?.autoComplete,
    pattern: configuredEditor?.pattern,
    maskMode: configuredEditor?.maskMode
  };
}

export function formatEditorInputValue(column: ColumnDef, value: unknown): string {
  const editor = resolveColumnEditor(column);
  if (editor.type === 'date') {
    return coerceDateEditorValue(value);
  }

  if ((editor.type === 'boolean' || editor.type === 'select') && value !== undefined && value !== null) {
    for (let index = 0; index < editor.options.length; index += 1) {
      if (Object.is(editor.options[index].value, value)) {
        return String(index);
      }
    }

    return editor.strict ? '' : String(value);
  }

  if (editor.type === 'masked') {
    return sanitizeMaskedValue(editor.maskMode, value === undefined || value === null ? '' : String(value));
  }

  return value === undefined || value === null ? '' : String(value);
}

export function sanitizeEditorInputValue(column: ColumnDef, inputText: string): string {
  const editor = resolveColumnEditor(column);
  if (editor.type !== 'masked') {
    return inputText;
  }

  return sanitizeMaskedValue(editor.maskMode, inputText);
}

export function resolveEditValidationMessage(result: string | EditValidationIssue | null | undefined): string | null {
  if (typeof result === 'string') {
    const trimmed = result.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (result && typeof result === 'object' && typeof result.message === 'string') {
    const trimmed = result.message.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

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
  const editor = resolveColumnEditor(column);
  const trimmedText = inputText.trim();
  if (editor.type === 'number') {
    if (trimmedText.length === 0) {
      return null;
    }

    const numericValue = Number(trimmedText);
    return Number.isFinite(numericValue) ? numericValue : inputText;
  }

  if (editor.type === 'date') {
    return trimmedText.length === 0 ? null : trimmedText;
  }

  if (editor.type === 'boolean') {
    const lowerCaseValue = trimmedText.toLowerCase();
    if (lowerCaseValue === 'true' || lowerCaseValue === '1' || lowerCaseValue === 'yes' || lowerCaseValue === 'on') {
      return true;
    }

    if (lowerCaseValue === 'false' || lowerCaseValue === '0' || lowerCaseValue === 'no' || lowerCaseValue === 'off') {
      return false;
    }

    const optionIndex = Number(trimmedText);
    if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < editor.options.length) {
      return editor.options[optionIndex].value;
    }

    return inputText;
  }

  if (editor.type === 'select') {
    if (trimmedText.length === 0) {
      return null;
    }

    const optionIndex = Number(trimmedText);
    if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < editor.options.length) {
      return editor.options[optionIndex].value;
    }

    return inputText;
  }

  if (editor.type === 'masked') {
    return sanitizeMaskedValue(editor.maskMode, inputText);
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
