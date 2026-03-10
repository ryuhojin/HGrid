import { describe, expect, it } from 'vitest';
import type { ScrollbarPolicy } from '../src';
import type { ColumnDef } from '../src/core/grid-options';
import {
  calculateMaxHorizontalScrollLeft,
  calculateScrollScaleLayoutMetrics,
  calculateZoneLayoutMetrics,
  resolveReservedScrollbarExtent,
  resolveScrollbarSourceExtent,
  sumColumnWidths,
  toCssOverflowValue
} from '../src/render/dom-renderer-layout-metrics';

function createColumn(id: string, width: number): ColumnDef {
  return {
    id,
    header: id.toUpperCase(),
    width,
    type: 'text'
  };
}

describe('dom-renderer-layout-metrics', () => {
  it('sums column widths for pinned and center zones', () => {
    expect(sumColumnWidths([{ width: 100 }, { width: 220 }, { width: 80 }] as Array<{ width: number }>)).toBe(400);
  });

  it('calculates reserved zone layout metrics when both scrollbars overflow', () => {
    const scrollbarPolicy: Required<ScrollbarPolicy> = {
      vertical: 'auto',
      horizontal: 'auto'
    };

    const metrics = calculateZoneLayoutMetrics({
      leftColumns: [createColumn('left', 120)],
      centerColumns: [createColumn('centerA', 300), createColumn('centerB', 260)],
      rightColumns: [createColumn('right', 90)],
      rowTrackHeight: 1200,
      viewportHeight: 320,
      rootWidth: 700,
      scrollbarPolicy,
      scrollbarSize: {
        vertical: 14,
        horizontal: 12
      },
      invisibleScrollbarFallbackSize: 16
    });

    expect(metrics.leftWidth).toBe(120);
    expect(metrics.centerWidth).toBe(560);
    expect(metrics.rightWidth).toBe(90);
    expect(metrics.verticalScrollbarReservedWidth).toBe(14);
    expect(metrics.horizontalScrollbarReservedHeight).toBe(12);
    expect(metrics.centerVisibleWidth).toBe(476);
    expect(metrics.shouldShowVerticalBar).toBe(true);
    expect(metrics.shouldShowHorizontalBar).toBe(true);
    expect(metrics.templateColumns).toBe('120px minmax(0, 1fr) 90px');
  });

  it('keeps overlay scrollbar reservation at zero when measured size is unavailable', () => {
    expect(resolveScrollbarSourceExtent('auto', true, 0, 16)).toBe(16);
    expect(resolveReservedScrollbarExtent('auto', true, 0, 16)).toBe(0);
    expect(toCssOverflowValue('auto')).toBe('auto');
    expect(toCssOverflowValue('always')).toBe('scroll');
    expect(toCssOverflowValue('hidden')).toBe('hidden');
  });

  it('calculates scroll scale metrics and spacer sizes', () => {
    const metrics = calculateScrollScaleLayoutMetrics({
      rowCount: 100,
      rowHeight: 28,
      virtualHeight: 2800,
      viewportHeight: 280,
      centerColumnsWidth: 640
    });

    expect(metrics.virtualScrollHeight).toBe(2800);
    expect(metrics.physicalScrollHeight).toBe(2800);
    expect(metrics.virtualMaxScrollTop).toBe(2520);
    expect(metrics.physicalMaxScrollTop).toBe(2520);
    expect(metrics.scrollScale).toBe(1);
    expect(metrics.spacerHeight).toBe(2800);
    expect(metrics.horizontalSpacerWidth).toBe(640);
  });

  it('calculates max horizontal scroll left from DOM and model widths', () => {
    expect(
      calculateMaxHorizontalScrollLeft({
        maxHorizontalScrollLeft: 180,
        leftWidth: 120,
        centerWidth: 820,
        rightWidth: 90,
        reservedVerticalWidth: 14,
        rootWidth: 700
      })
    ).toBe(344);
  });
});
