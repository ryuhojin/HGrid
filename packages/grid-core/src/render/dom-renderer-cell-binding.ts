import type { CellRenderState } from './dom-renderer-row-pool';

export interface CellContentResult {
  textContent: string;
  contentMode: 'text' | 'html';
  htmlContent: string;
}

export interface CellBindingState {
  isVisible: boolean;
  columnId: string;
  textContent: string;
  contentMode?: 'text' | 'html';
  htmlContent?: string;
  role?: string;
  left?: number;
  width?: number;
  isSelected?: boolean;
  isActive?: boolean;
  extraClassName?: string;
  titleText?: string;
  ariaLabel?: string;
  ariaRowIndex?: number;
  ariaColIndex?: number;
  cellId?: string;
}

export function prependCellContentPrefix(content: CellContentResult, prefix: string): CellContentResult {
  if (prefix.length === 0) {
    return content;
  }

  if (content.contentMode === 'html') {
    return {
      textContent: `${prefix} ${content.textContent}`,
      contentMode: 'html',
      htmlContent: `${escapeHtmlText(prefix)} ${content.htmlContent}`
    };
  }

  return {
    textContent: `${prefix} ${content.textContent}`,
    contentMode: 'text',
    htmlContent: ''
  };
}

export function bindCell(cell: HTMLDivElement, cellState: CellRenderState, nextState: CellBindingState): void {
  const role = nextState.role ?? cellState.role;
  const isSelected = nextState.isSelected ?? false;
  const isActive = nextState.isActive ?? false;
  const extraClassName = nextState.extraClassName ?? '';
  const titleText = nextState.titleText ?? '';
  const ariaLabel = nextState.ariaLabel ?? '';
  const ariaRowIndex = nextState.ariaRowIndex ?? -1;
  const ariaColIndex = nextState.ariaColIndex ?? -1;
  const cellId = nextState.cellId ?? '';
  const contentMode = nextState.contentMode ?? 'text';
  const htmlContent = nextState.htmlContent ?? '';

  if (cellState.isVisible !== nextState.isVisible) {
    cell.style.display = nextState.isVisible ? '' : 'none';
    cellState.isVisible = nextState.isVisible;
  }

  if (nextState.left !== undefined && cellState.left !== nextState.left) {
    cell.style.left = `${nextState.left}px`;
    cellState.left = nextState.left;
  }

  if (nextState.width !== undefined && cellState.width !== nextState.width) {
    cell.style.width = `${nextState.width}px`;
    cellState.width = nextState.width;
  }

  if (cellState.columnId !== nextState.columnId) {
    cell.dataset.columnId = nextState.columnId;
    cellState.columnId = nextState.columnId;
  }

  if (cellState.role !== role) {
    if (role.length > 0) {
      cell.setAttribute('role', role);
    } else {
      cell.removeAttribute('role');
    }
    cellState.role = role;
  }

  if (cellState.contentMode !== contentMode) {
    if (contentMode === 'html') {
      cell.innerHTML = htmlContent;
      cellState.htmlContent = htmlContent;
    } else {
      cell.textContent = nextState.textContent;
      cellState.htmlContent = '';
    }
    cellState.textContent = nextState.textContent;
    cellState.contentMode = contentMode;
  } else if (contentMode === 'html') {
    if (cellState.htmlContent !== htmlContent) {
      cell.innerHTML = htmlContent;
      cellState.htmlContent = htmlContent;
    }
    if (cellState.textContent !== nextState.textContent) {
      cellState.textContent = nextState.textContent;
    }
  } else {
    if (cellState.textContent !== nextState.textContent) {
      cell.textContent = nextState.textContent;
      cellState.textContent = nextState.textContent;
    }
    if (cellState.htmlContent.length > 0) {
      cellState.htmlContent = '';
    }
  }

  if (cellState.extraClassName !== extraClassName) {
    if (cellState.extraClassName.length > 0) {
      const previousClasses = cellState.extraClassName.split(' ');
      for (let classIndex = 0; classIndex < previousClasses.length; classIndex += 1) {
        const previousClassName = previousClasses[classIndex];
        if (previousClassName) {
          cell.classList.remove(previousClassName);
        }
      }
    }

    if (extraClassName.length > 0) {
      const nextClasses = extraClassName.split(' ');
      for (let classIndex = 0; classIndex < nextClasses.length; classIndex += 1) {
        const nextClassName = nextClasses[classIndex];
        if (nextClassName) {
          cell.classList.add(nextClassName);
        }
      }
    }

    cellState.extraClassName = extraClassName;
  }

  if (cellState.titleText !== titleText) {
    if (titleText.length > 0) {
      cell.title = titleText;
    } else {
      cell.removeAttribute('title');
    }
    cellState.titleText = titleText;
  }

  if (cellState.ariaLabel !== ariaLabel) {
    if (ariaLabel.length > 0) {
      cell.setAttribute('aria-label', ariaLabel);
    } else {
      cell.removeAttribute('aria-label');
    }
    cellState.ariaLabel = ariaLabel;
  }

  if (cellState.ariaRowIndex !== ariaRowIndex) {
    if (ariaRowIndex > 0) {
      cell.setAttribute('aria-rowindex', String(ariaRowIndex));
    } else {
      cell.removeAttribute('aria-rowindex');
    }
    cellState.ariaRowIndex = ariaRowIndex;
  }

  if (cellState.ariaColIndex !== ariaColIndex) {
    if (ariaColIndex > 0) {
      cell.setAttribute('aria-colindex', String(ariaColIndex));
    } else {
      cell.removeAttribute('aria-colindex');
    }
    cellState.ariaColIndex = ariaColIndex;
  }

  if (cellState.cellId !== cellId) {
    if (cellId.length > 0) {
      cell.id = cellId;
    } else {
      cell.removeAttribute('id');
    }
    cellState.cellId = cellId;
  }

  if (cellState.isSelected !== isSelected) {
    cell.classList.toggle('hgrid__cell--selected', isSelected);
    cellState.isSelected = isSelected;
  }

  if (cellState.isActive !== isActive) {
    cell.classList.toggle('hgrid__cell--active', isActive);
    cellState.isActive = isActive;
  }
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
