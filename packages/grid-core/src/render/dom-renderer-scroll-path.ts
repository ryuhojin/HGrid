export interface HorizontalWindow {
  start: number;
  end: number;
}

export interface ViewportTransformMetrics {
  centerVerticalTransform: string;
  pinnedVerticalTransform: string;
}

interface ResolveHorizontalWindowContext {
  columnLeft: number[];
  columnWidth: number[];
  totalCenterColumns: number;
  centerVisibleWidth: number;
  centerCellCapacity: number;
  overscanCols: number;
  scrollLeft: number;
}

interface ResolveViewportTransformMetricsContext {
  scrollTop: number;
  scrollLeft: number;
  pendingVirtualScrollTop: number;
  renderedStartRow: number;
  renderedScrollTop: number;
  renderedViewportOffsetY: number;
  forceVerticalSync: boolean;
  getStartRowForScrollTop: (virtualScrollTop: number) => number;
}

export function findFirstColumnEndingAfter(columnLeft: number[], columnWidth: number[], offset: number): number {
  let low = 0;
  let high = columnLeft.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    const columnEnd = columnLeft[mid] + columnWidth[mid];
    if (columnEnd <= offset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.min(low, columnLeft.length);
}

export function findFirstColumnStartingAtOrAfter(columnLeft: number[], offset: number): number {
  let low = 0;
  let high = columnLeft.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (columnLeft[mid] < offset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.min(low, columnLeft.length);
}

// Scroll hot path: keep horizontal window resolution on binary-searchable arrays.
export function resolveHorizontalWindow(context: ResolveHorizontalWindowContext): HorizontalWindow {
  const { columnLeft, columnWidth, totalCenterColumns, centerVisibleWidth, centerCellCapacity, overscanCols, scrollLeft } = context;
  if (totalCenterColumns === 0 || centerCellCapacity === 0) {
    return { start: 0, end: 0 };
  }

  const scrollRight = scrollLeft + Math.max(1, centerVisibleWidth);
  const firstVisible = findFirstColumnEndingAfter(columnLeft, columnWidth, scrollLeft);
  const endVisibleExclusive = findFirstColumnStartingAtOrAfter(columnLeft, scrollRight);
  const start = Math.max(0, firstVisible - overscanCols);
  const end = Math.min(totalCenterColumns, Math.max(start + 1, endVisibleExclusive + overscanCols));

  if (end - start <= centerCellCapacity) {
    return { start, end };
  }

  return {
    start,
    end: Math.min(totalCenterColumns, start + centerCellCapacity)
  };
}

// Scroll hot path: compute transforms once and let DomRenderer only apply DOM writes.
export function resolveViewportTransformMetrics(
  context: ResolveViewportTransformMetricsContext
): ViewportTransformMetrics {
  const {
    scrollTop,
    scrollLeft,
    pendingVirtualScrollTop,
    renderedStartRow,
    renderedScrollTop,
    renderedViewportOffsetY,
    forceVerticalSync,
    getStartRowForScrollTop
  } = context;

  const canSyncVertical = forceVerticalSync || getStartRowForScrollTop(pendingVirtualScrollTop) === renderedStartRow;
  const effectiveVirtualScrollTop = canSyncVertical ? pendingVirtualScrollTop : renderedScrollTop;
  const centerVerticalOffset = renderedViewportOffsetY - effectiveVirtualScrollTop + scrollTop;
  const pinnedVerticalOffset = renderedViewportOffsetY - effectiveVirtualScrollTop;

  return {
    centerVerticalTransform: `translate3d(${-scrollLeft}px, ${centerVerticalOffset}px, 0)`,
    pinnedVerticalTransform: `translate3d(0, ${pinnedVerticalOffset}px, 0)`
  };
}
