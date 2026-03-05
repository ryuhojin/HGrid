import { describe, expect, it } from 'vitest';
import {
  MAX_SCROLL_PX,
  createScrollScaleMetrics,
  mapPhysicalToVirtualScrollTop,
  mapVirtualToPhysicalScrollTop
} from '../src/virtualization/scroll-scaling';

describe('scroll scaling metrics', () => {
  it('uses identity scale when virtual height does not exceed max scroll range', () => {
    const metrics = createScrollScaleMetrics({
      rowCount: 1_000,
      rowHeight: 28,
      viewportHeight: 280
    });

    expect(metrics.virtualHeight).toBe(28_000);
    expect(metrics.scrollHeight).toBe(28_000);
    expect(metrics.virtualMaxScrollTop).toBe(27_720);
    expect(metrics.physicalMaxScrollTop).toBe(27_720);
    expect(metrics.scale).toBe(1);
  });

  it('caps physical scroll height at MAX_SCROLL_PX for very large row count', () => {
    const metrics = createScrollScaleMetrics({
      rowCount: 100_000_000,
      rowHeight: 28,
      viewportHeight: 280
    });

    expect(metrics.virtualHeight).toBe(2_800_000_000);
    expect(metrics.scrollHeight).toBe(MAX_SCROLL_PX);
    expect(metrics.virtualMaxScrollTop).toBe(2_799_999_720);
    expect(metrics.physicalMaxScrollTop).toBe(15_999_720);
    expect(metrics.scale).toBeGreaterThan(100);
    expect(metrics.scale).toBeCloseTo(metrics.virtualMaxScrollTop / metrics.physicalMaxScrollTop, 10);
  });

  it('maps physical and virtual scrollTop with clamp', () => {
    const metrics = createScrollScaleMetrics({
      rowCount: 100_000_000,
      rowHeight: 28,
      viewportHeight: 280
    });

    const virtualTopAtBottom = mapPhysicalToVirtualScrollTop(
      metrics.physicalMaxScrollTop + 10_000,
      metrics.physicalMaxScrollTop,
      metrics.virtualMaxScrollTop
    );
    expect(virtualTopAtBottom).toBe(metrics.virtualMaxScrollTop);

    const physicalTopAtBottom = mapVirtualToPhysicalScrollTop(
      metrics.virtualMaxScrollTop + 10_000,
      metrics.virtualMaxScrollTop,
      metrics.physicalMaxScrollTop
    );
    expect(physicalTopAtBottom).toBe(metrics.physicalMaxScrollTop);

    const midwayPhysical = Math.floor(metrics.physicalMaxScrollTop / 2);
    const midwayVirtual = mapPhysicalToVirtualScrollTop(
      midwayPhysical,
      metrics.physicalMaxScrollTop,
      metrics.virtualMaxScrollTop
    );
    const roundTripPhysical = mapVirtualToPhysicalScrollTop(
      midwayVirtual,
      metrics.virtualMaxScrollTop,
      metrics.physicalMaxScrollTop
    );

    expect(roundTripPhysical).toBeCloseTo(midwayPhysical, 3);
  });

  it('respects explicit virtualHeight for variable row height mode', () => {
    const metrics = createScrollScaleMetrics({
      rowCount: 1_000,
      rowHeight: 28,
      virtualHeight: 40_000,
      viewportHeight: 280
    });

    expect(metrics.virtualHeight).toBe(40_000);
    expect(metrics.scrollHeight).toBe(40_000);
    expect(metrics.virtualMaxScrollTop).toBe(39_720);
    expect(metrics.physicalMaxScrollTop).toBe(39_720);
    expect(metrics.scale).toBe(1);
  });
});
