import type { ColumnDef } from '../core/grid-options';

export interface HeaderResizeHit {
  columnId: string;
  column: ColumnDef;
  headerCell: HTMLDivElement;
}

export interface ColumnResizeSession {
  pointerId: number;
  columnId: string;
  startClientX: number;
  startWidth: number;
  minWidth: number;
  maxWidth: number;
  pendingClientX: number;
  lastEmittedWidth: number;
}

export interface HeaderDropTarget {
  dropIndex: number;
  targetColumnId: string | null;
  indicatorClientX: number;
}

export interface ColumnReorderSession {
  pointerId: number;
  sourceColumnId: string;
  sourceIndex: number;
  pendingClientX: number;
  pendingClientY: number;
  pendingTarget: EventTarget | null;
  currentDropIndex: number;
  currentTargetColumnId: string | null;
}

export interface HeaderRectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

export function findVisibleColumnById(columns: ReadonlyArray<ColumnDef>, columnId: string): ColumnDef | null {
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const column = columns[columnIndex];
    if (column.id === columnId) {
      return column;
    }
  }

  return null;
}

export function getVisibleColumnIndexById(columns: ReadonlyArray<ColumnDef>, columnId: string): number {
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    if (columns[columnIndex].id === columnId) {
      return columnIndex;
    }
  }

  return -1;
}

export function resolveColumnWidthBounds(column: ColumnDef): { minWidth: number; maxWidth: number } {
  const rawMinWidth = Number(column.minWidth);
  const minWidth = Number.isFinite(rawMinWidth) ? Math.max(1, rawMinWidth) : 1;
  const rawMaxWidth = Number(column.maxWidth);
  const maxWidth = Number.isFinite(rawMaxWidth) ? Math.max(minWidth, rawMaxWidth) : Number.POSITIVE_INFINITY;

  return {
    minWidth,
    maxWidth
  };
}

export function clampColumnWidth(width: number, minWidth: number, maxWidth: number): number {
  return Math.min(maxWidth, Math.max(minWidth, width));
}

export function isHeaderResizeHandleHit(
  clientX: number,
  clientY: number,
  cellRect: HeaderRectLike,
  hitSlopPx: number
): boolean {
  if (clientY < cellRect.top || clientY > cellRect.bottom) {
    return false;
  }

  if (clientX < cellRect.left || clientX > cellRect.right + hitSlopPx) {
    return false;
  }

  if (cellRect.right - clientX > hitSlopPx) {
    return false;
  }

  return true;
}

export function createHeaderDropTarget(
  columnId: string,
  columnIndex: number,
  clientX: number,
  cellRect: HeaderRectLike
): HeaderDropTarget {
  const dropAfter = clientX > cellRect.left + cellRect.width * 0.5;

  return {
    dropIndex: columnIndex + (dropAfter ? 1 : 0),
    targetColumnId: columnId,
    indicatorClientX: dropAfter ? cellRect.right : cellRect.left
  };
}

export function clampHeaderDropIndicatorOffset(headerRect: HeaderRectLike, indicatorClientX: number): number {
  return Math.max(0, Math.min(headerRect.width, indicatorClientX - headerRect.left));
}

export function normalizeDropIndexForSource(dropIndex: number, sourceIndex: number): number {
  if (dropIndex > sourceIndex) {
    return dropIndex - 1;
  }

  return dropIndex;
}

export function buildReorderedColumnOrder(
  columnIds: ReadonlyArray<string>,
  sourceIndex: number,
  targetIndex: number
): string[] {
  const nextOrder = columnIds.slice();
  if (sourceIndex < 0 || sourceIndex >= nextOrder.length) {
    return nextOrder;
  }

  const [movedColumnId] = nextOrder.splice(sourceIndex, 1);
  const boundedTargetIndex = Math.max(0, Math.min(nextOrder.length, targetIndex));
  nextOrder.splice(boundedTargetIndex, 0, movedColumnId);
  return nextOrder;
}

export function createColumnResizeSession(pointerId: number, clientX: number, resizeHit: HeaderResizeHit): ColumnResizeSession {
  const { minWidth, maxWidth } = resolveColumnWidthBounds(resizeHit.column);
  const startWidth = clampColumnWidth(resizeHit.column.width, minWidth, maxWidth);

  return {
    pointerId,
    columnId: resizeHit.columnId,
    startClientX: clientX,
    startWidth,
    minWidth,
    maxWidth,
    pendingClientX: clientX,
    lastEmittedWidth: startWidth
  };
}

export function resolveNextColumnResizeWidth(session: ColumnResizeSession): number {
  const deltaX = session.pendingClientX - session.startClientX;
  return clampColumnWidth(session.startWidth + deltaX, session.minWidth, session.maxWidth);
}

export function createColumnReorderSession(
  pointerId: number,
  clientX: number,
  clientY: number,
  sourceColumnId: string,
  sourceIndex: number
): ColumnReorderSession {
  return {
    pointerId,
    sourceColumnId,
    sourceIndex,
    pendingClientX: clientX,
    pendingClientY: clientY,
    pendingTarget: null,
    currentDropIndex: sourceIndex + 1,
    currentTargetColumnId: sourceColumnId
  };
}
