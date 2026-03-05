import { describe, expect, it } from 'vitest';
import { RowHeightMap } from '../src/virtualization/row-height-map';

describe('RowHeightMap', () => {
  it('uses base height mapping by default', () => {
    const map = new RowHeightMap(10, 28);

    expect(map.getTotalHeight()).toBe(280);
    expect(map.getRowTop(0)).toBe(0);
    expect(map.getRowTop(1)).toBe(28);
    expect(map.getRowTop(10)).toBe(280);
    expect(map.findRowIndexAtOffset(0)).toBe(0);
    expect(map.findRowIndexAtOffset(27)).toBe(0);
    expect(map.findRowIndexAtOffset(28)).toBe(1);
    expect(map.findRowIndexAtOffset(279)).toBe(9);
  });

  it('updates prefix sums and offset lookup after sparse height overrides', () => {
    const map = new RowHeightMap(8, 28);

    expect(map.setRowHeight(2, 56)).toBe(true);
    expect(map.setRowHeight(5, 14)).toBe(true);

    expect(map.getRowHeight(2)).toBe(56);
    expect(map.getRowHeight(5)).toBe(14);

    expect(map.getRowTop(3)).toBe(112);
    expect(map.getRowTop(6)).toBe(182);
    expect(map.getTotalHeight()).toBe(238);

    expect(map.findRowIndexAtOffset(111)).toBe(2);
    expect(map.findRowIndexAtOffset(112)).toBe(3);
    expect(map.findRowIndexAtOffset(181)).toBe(5);
    expect(map.findRowIndexAtOffset(182)).toBe(6);
  });

  it('clears row overrides by range or full reset', () => {
    const map = new RowHeightMap(6, 30);

    map.setRowHeights([
      { rowIndex: 1, height: 45 },
      { rowIndex: 3, height: 20 }
    ]);

    expect(map.getTotalHeight()).toBe(185);
    expect(map.clearRows([1])).toBe(true);
    expect(map.getRowHeight(1)).toBe(30);
    expect(map.getTotalHeight()).toBe(170);

    expect(map.clearRows()).toBe(true);
    expect(map.getTotalHeight()).toBe(180);
    expect(map.clearRows()).toBe(false);
  });

  it('supports 100M sparse updates without full materialization', () => {
    const rowCount = 100_000_000;
    const map = new RowHeightMap(rowCount, 28);

    map.setRowHeight(0, 84);
    map.setRowHeight(rowCount - 1, 14);

    const expectedTotal = rowCount * 28 + 56 - 14;
    expect(map.getTotalHeight()).toBe(expectedTotal);
    expect(map.findRowIndexAtOffset(0)).toBe(0);
    expect(map.findRowIndexAtOffset(27)).toBe(0);
    expect(map.findRowIndexAtOffset(84)).toBe(1);

    const nearBottomOffset = expectedTotal - 2;
    expect(map.findRowIndexAtOffset(nearBottomOffset)).toBe(rowCount - 1);
  });
});
