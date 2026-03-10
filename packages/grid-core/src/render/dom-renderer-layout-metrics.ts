import type { ColumnDef, ScrollbarPolicy, ScrollbarVisibility } from '../core/grid-options';
import { MAX_SCROLL_PX, createScrollScaleMetrics } from '../virtualization/scroll-scaling';

export interface ScrollbarSize {
  vertical: number;
  horizontal: number;
}

export interface DomRendererZoneLayoutMetricsParams {
  leftColumns: ColumnDef[];
  centerColumns: ColumnDef[];
  rightColumns: ColumnDef[];
  rowTrackHeight: number;
  viewportHeight: number;
  rootWidth: number;
  scrollbarPolicy: Required<ScrollbarPolicy>;
  scrollbarSize: ScrollbarSize;
  invisibleScrollbarFallbackSize: number;
}

export interface DomRendererZoneLayoutMetrics {
  leftWidth: number;
  centerWidth: number;
  rightWidth: number;
  centerVisibleWidth: number;
  verticalScrollbarSourceWidth: number;
  horizontalScrollbarSourceHeight: number;
  verticalScrollbarReservedWidth: number;
  horizontalScrollbarReservedHeight: number;
  shouldShowVerticalBar: boolean;
  shouldShowHorizontalBar: boolean;
  templateColumns: string;
}

export interface DomRendererScrollScaleLayoutMetricsParams {
  rowCount: number;
  rowHeight: number;
  virtualHeight: number;
  viewportHeight: number;
  centerColumnsWidth: number;
}

export interface DomRendererScrollScaleLayoutMetrics {
  virtualScrollHeight: number;
  physicalScrollHeight: number;
  virtualMaxScrollTop: number;
  physicalMaxScrollTop: number;
  scrollScale: number;
  spacerHeight: number;
  horizontalSpacerWidth: number;
}

export interface DomRendererHorizontalScrollLimitParams {
  maxHorizontalScrollLeft: number;
  leftWidth: number;
  centerWidth: number;
  rightWidth: number;
  reservedVerticalWidth: number;
  rootWidth: number;
}

export function sumColumnWidths(columns: ReadonlyArray<Pick<ColumnDef, 'width'>>): number {
  let totalWidth = 0;

  for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
    totalWidth += columns[colIndex].width;
  }

  return totalWidth;
}

export function resolveScrollbarSourceExtent(
  visibility: ScrollbarVisibility,
  hasOverflow: boolean,
  measuredSize: number,
  invisibleScrollbarFallbackSize: number
): number {
  if (visibility === 'hidden') {
    return 0;
  }

  if (visibility === 'always' || hasOverflow) {
    if (measuredSize > 0) {
      return measuredSize;
    }

    return invisibleScrollbarFallbackSize;
  }

  return 0;
}

export function resolveReservedScrollbarExtent(
  visibility: ScrollbarVisibility,
  hasOverflow: boolean,
  measuredSize: number,
  sourceSize: number
): number {
  if (sourceSize === 0 || visibility === 'hidden') {
    return 0;
  }

  if (measuredSize > 0) {
    return sourceSize;
  }

  if (visibility === 'always') {
    return sourceSize;
  }

  if (hasOverflow && visibility === 'auto') {
    return 0;
  }

  return 0;
}

export function toCssOverflowValue(visibility: ScrollbarVisibility): 'auto' | 'scroll' | 'hidden' {
  if (visibility === 'hidden') {
    return 'hidden';
  }

  if (visibility === 'always') {
    return 'scroll';
  }

  return 'auto';
}

export function calculateZoneLayoutMetrics(params: DomRendererZoneLayoutMetricsParams): DomRendererZoneLayoutMetrics {
  const leftWidth = sumColumnWidths(params.leftColumns);
  const centerWidth = sumColumnWidths(params.centerColumns);
  const rightWidth = sumColumnWidths(params.rightColumns);

  let verticalScrollbarSourceWidth = 0;
  let horizontalScrollbarSourceHeight = 0;
  let verticalScrollbarReservedWidth = 0;
  let horizontalScrollbarReservedHeight = 0;
  let centerVisibleWidth = 0;
  let hasVerticalOverflow = false;
  let hasHorizontalOverflow = false;

  for (let pass = 0; pass < 2; pass += 1) {
    const viewportVisibleHeight = Math.max(1, params.viewportHeight - horizontalScrollbarReservedHeight);
    hasVerticalOverflow = params.rowTrackHeight > viewportVisibleHeight;
    verticalScrollbarSourceWidth = resolveScrollbarSourceExtent(
      params.scrollbarPolicy.vertical,
      hasVerticalOverflow,
      params.scrollbarSize.vertical,
      params.invisibleScrollbarFallbackSize
    );
    verticalScrollbarReservedWidth = resolveReservedScrollbarExtent(
      params.scrollbarPolicy.vertical,
      hasVerticalOverflow,
      params.scrollbarSize.vertical,
      verticalScrollbarSourceWidth
    );

    centerVisibleWidth = Math.max(0, params.rootWidth - leftWidth - rightWidth - verticalScrollbarReservedWidth);
    hasHorizontalOverflow = centerWidth > centerVisibleWidth;
    horizontalScrollbarSourceHeight = resolveScrollbarSourceExtent(
      params.scrollbarPolicy.horizontal,
      hasHorizontalOverflow,
      params.scrollbarSize.horizontal,
      params.invisibleScrollbarFallbackSize
    );
    horizontalScrollbarReservedHeight = resolveReservedScrollbarExtent(
      params.scrollbarPolicy.horizontal,
      hasHorizontalOverflow,
      params.scrollbarSize.horizontal,
      horizontalScrollbarSourceHeight
    );
  }

  return {
    leftWidth,
    centerWidth,
    rightWidth,
    centerVisibleWidth: Math.max(1, centerVisibleWidth),
    verticalScrollbarSourceWidth,
    horizontalScrollbarSourceHeight,
    verticalScrollbarReservedWidth,
    horizontalScrollbarReservedHeight,
    shouldShowVerticalBar: verticalScrollbarSourceWidth > 0,
    shouldShowHorizontalBar: horizontalScrollbarSourceHeight > 0,
    templateColumns: `${leftWidth}px minmax(0, 1fr) ${rightWidth}px`
  };
}

export function calculateScrollScaleLayoutMetrics(
  params: DomRendererScrollScaleLayoutMetricsParams
): DomRendererScrollScaleLayoutMetrics {
  const metrics = createScrollScaleMetrics({
    rowCount: params.rowCount,
    rowHeight: params.rowHeight,
    virtualHeight: params.virtualHeight,
    viewportHeight: params.viewportHeight,
    maxScrollPx: MAX_SCROLL_PX
  });

  return {
    virtualScrollHeight: metrics.virtualHeight,
    physicalScrollHeight: metrics.scrollHeight,
    virtualMaxScrollTop: metrics.virtualMaxScrollTop,
    physicalMaxScrollTop: metrics.physicalMaxScrollTop,
    scrollScale: metrics.scale,
    spacerHeight: metrics.scrollHeight,
    horizontalSpacerWidth: Math.max(1, params.centerColumnsWidth)
  };
}

export function calculateMaxHorizontalScrollLeft(params: DomRendererHorizontalScrollLimitParams): number {
  const centerVisibleWidth = Math.max(
    1,
    params.rootWidth - params.leftWidth - params.rightWidth - params.reservedVerticalWidth
  );
  const modelMax = params.centerWidth - centerVisibleWidth;

  return Math.max(0, params.maxHorizontalScrollLeft, modelMax);
}
