import { describe, expect, it } from 'vitest';
import {
  findFirstColumnEndingAfter,
  findFirstColumnStartingAtOrAfter,
  resolveHorizontalWindow,
  resolveViewportTransformMetrics
} from '../src/render/dom-renderer-scroll-path';

describe('dom-renderer-scroll-path', () => {
  it('locates column boundaries with binary search helpers', () => {
    const columnLeft = [0, 100, 260, 420];
    const columnWidth = [100, 160, 160, 120];

    expect(findFirstColumnEndingAfter(columnLeft, columnWidth, 0)).toBe(0);
    expect(findFirstColumnEndingAfter(columnLeft, columnWidth, 101)).toBe(1);
    expect(findFirstColumnStartingAtOrAfter(columnLeft, 259)).toBe(2);
    expect(findFirstColumnStartingAtOrAfter(columnLeft, 999)).toBe(4);
  });

  it('resolves horizontal windows with overscan and center capacity limits', () => {
    expect(
      resolveHorizontalWindow({
        columnLeft: [0, 100, 260, 420, 560],
        columnWidth: [100, 160, 160, 140, 120],
        totalCenterColumns: 5,
        centerVisibleWidth: 280,
        centerCellCapacity: 3,
        overscanCols: 1,
        scrollLeft: 150
      })
    ).toEqual({
      start: 0,
      end: 3
    });

    expect(
      resolveHorizontalWindow({
        columnLeft: [],
        columnWidth: [],
        totalCenterColumns: 0,
        centerVisibleWidth: 280,
        centerCellCapacity: 0,
        overscanCols: 1,
        scrollLeft: 150
      })
    ).toEqual({
      start: 0,
      end: 0
    });
  });

  it('resolves viewport transforms against the currently rendered row window', () => {
    expect(
      resolveViewportTransformMetrics({
        scrollTop: 120,
        scrollLeft: 40,
        pendingVirtualScrollTop: 140,
        renderedStartRow: 5,
        renderedScrollTop: 112,
        renderedViewportOffsetY: 140,
        forceVerticalSync: false,
        getStartRowForScrollTop: () => 5
      })
    ).toEqual({
      centerVerticalTransform: 'translate3d(-40px, 120px, 0)',
      pinnedVerticalTransform: 'translate3d(0, 0px, 0)'
    });

    expect(
      resolveViewportTransformMetrics({
        scrollTop: 120,
        scrollLeft: 40,
        pendingVirtualScrollTop: 300,
        renderedStartRow: 5,
        renderedScrollTop: 112,
        renderedViewportOffsetY: 140,
        forceVerticalSync: false,
        getStartRowForScrollTop: () => 7
      })
    ).toEqual({
      centerVerticalTransform: 'translate3d(-40px, 148px, 0)',
      pinnedVerticalTransform: 'translate3d(0, 28px, 0)'
    });
  });
});
