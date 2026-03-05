export interface ScrollScaleMetrics {
  virtualHeight: number;
  scrollHeight: number;
  virtualMaxScrollTop: number;
  physicalMaxScrollTop: number;
  scale: number;
}

export const MAX_SCROLL_PX = 16_000_000;

function toFiniteOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function createScrollScaleMetrics(params: {
  rowCount: number;
  rowHeight: number;
  virtualHeight?: number;
  viewportHeight: number;
  maxScrollPx?: number;
}): ScrollScaleMetrics {
  const rowCount = Math.max(0, Math.floor(toFiniteOrFallback(params.rowCount, 0)));
  const rowHeight = Math.max(1, toFiniteOrFallback(params.rowHeight, 1));
  const viewportHeight = Math.max(0, toFiniteOrFallback(params.viewportHeight, 0));
  const maxScrollPx = Math.max(1, toFiniteOrFallback(params.maxScrollPx ?? MAX_SCROLL_PX, MAX_SCROLL_PX));

  const virtualHeight = Math.max(0, toFiniteOrFallback(params.virtualHeight ?? rowCount * rowHeight, rowCount * rowHeight));
  const scrollHeight = Math.min(virtualHeight, maxScrollPx);
  const virtualMaxScrollTop = Math.max(0, virtualHeight - viewportHeight);
  const physicalMaxScrollTop = Math.max(0, scrollHeight - viewportHeight);
  const scale = physicalMaxScrollTop > 0 ? virtualMaxScrollTop / physicalMaxScrollTop : 1;

  return {
    virtualHeight,
    scrollHeight,
    virtualMaxScrollTop,
    physicalMaxScrollTop,
    scale
  };
}

export function mapPhysicalToVirtualScrollTop(
  physicalScrollTop: number,
  physicalMaxScrollTop: number,
  virtualMaxScrollTop: number
): number {
  if (physicalMaxScrollTop <= 0 || virtualMaxScrollTop <= 0) {
    return 0;
  }

  const clampedPhysicalScrollTop = Math.max(0, Math.min(physicalMaxScrollTop, physicalScrollTop));
  return (clampedPhysicalScrollTop / physicalMaxScrollTop) * virtualMaxScrollTop;
}

export function mapVirtualToPhysicalScrollTop(
  virtualScrollTop: number,
  virtualMaxScrollTop: number,
  physicalMaxScrollTop: number
): number {
  if (virtualMaxScrollTop <= 0 || physicalMaxScrollTop <= 0) {
    return 0;
  }

  const clampedVirtualScrollTop = Math.max(0, Math.min(virtualMaxScrollTop, virtualScrollTop));
  return (clampedVirtualScrollTop / virtualMaxScrollTop) * physicalMaxScrollTop;
}
