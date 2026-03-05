export interface RowHeightEntry {
  rowIndex: number;
  height: number;
}

function normalizeRowCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeHeight(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.round(value));
}

class SparseFenwickTree {
  private size: number;
  private readonly tree = new Map<number, number>();

  public constructor(size: number) {
    this.size = normalizeRowCount(size);
  }

  public reset(size: number): void {
    this.size = normalizeRowCount(size);
    this.tree.clear();
  }

  public add(rowIndex: number, delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) {
      return;
    }

    const normalizedRowIndex = Math.floor(rowIndex);
    if (normalizedRowIndex < 0 || normalizedRowIndex >= this.size) {
      return;
    }

    let index = normalizedRowIndex + 1;
    while (index <= this.size) {
      const currentValue = this.tree.get(index) ?? 0;
      const nextValue = currentValue + delta;
      if (Math.abs(nextValue) < 0.000001) {
        this.tree.delete(index);
      } else {
        this.tree.set(index, nextValue);
      }
      index += index & -index;
    }
  }

  public prefix(indexExclusive: number): number {
    if (this.size === 0) {
      return 0;
    }

    let index = Math.max(0, Math.min(this.size, Math.floor(indexExclusive)));
    let sum = 0;

    while (index > 0) {
      sum += this.tree.get(index) ?? 0;
      index -= index & -index;
    }

    return sum;
  }
}

export class RowHeightMap {
  private rowCount: number;
  private baseHeight: number;
  private readonly fenwick: SparseFenwickTree;
  private readonly overrides = new Map<number, number>();

  public constructor(rowCount: number, baseHeight: number) {
    this.rowCount = normalizeRowCount(rowCount);
    this.baseHeight = normalizeHeight(baseHeight, 1);
    this.fenwick = new SparseFenwickTree(this.rowCount);
  }

  public getRowCount(): number {
    return this.rowCount;
  }

  public getBaseHeight(): number {
    return this.baseHeight;
  }

  public reset(rowCount: number, baseHeight: number): void {
    this.rowCount = normalizeRowCount(rowCount);
    this.baseHeight = normalizeHeight(baseHeight, 1);
    this.overrides.clear();
    this.fenwick.reset(this.rowCount);
  }

  public hasRowHeight(rowIndex: number): boolean {
    const normalizedRowIndex = Math.floor(rowIndex);
    if (normalizedRowIndex < 0 || normalizedRowIndex >= this.rowCount) {
      return false;
    }

    return this.overrides.has(normalizedRowIndex);
  }

  public getRowHeight(rowIndex: number): number {
    const normalizedRowIndex = Math.floor(rowIndex);
    if (normalizedRowIndex < 0 || normalizedRowIndex >= this.rowCount) {
      return this.baseHeight;
    }

    return this.overrides.get(normalizedRowIndex) ?? this.baseHeight;
  }

  public getRowTop(rowIndex: number): number {
    const normalizedRowIndex = Math.max(0, Math.min(this.rowCount, Math.floor(rowIndex)));
    return normalizedRowIndex * this.baseHeight + this.fenwick.prefix(normalizedRowIndex);
  }

  public getTotalHeight(): number {
    return this.getRowTop(this.rowCount);
  }

  public setRowHeight(rowIndex: number, height: number): boolean {
    const normalizedRowIndex = Math.floor(rowIndex);
    if (normalizedRowIndex < 0 || normalizedRowIndex >= this.rowCount) {
      return false;
    }

    const nextHeight = normalizeHeight(height, this.baseHeight);
    const previousHeight = this.overrides.get(normalizedRowIndex) ?? this.baseHeight;

    if (previousHeight === nextHeight) {
      return false;
    }

    const previousDelta = previousHeight - this.baseHeight;
    const nextDelta = nextHeight - this.baseHeight;
    this.fenwick.add(normalizedRowIndex, nextDelta - previousDelta);

    if (nextHeight === this.baseHeight) {
      this.overrides.delete(normalizedRowIndex);
    } else {
      this.overrides.set(normalizedRowIndex, nextHeight);
    }

    return true;
  }

  public setRowHeights(entries: RowHeightEntry[]): boolean {
    let hasChanged = false;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (this.setRowHeight(entry.rowIndex, entry.height)) {
        hasChanged = true;
      }
    }

    return hasChanged;
  }

  public clearRows(rowIndexes?: number[]): boolean {
    if (!rowIndexes || rowIndexes.length === 0) {
      if (this.overrides.size === 0) {
        return false;
      }

      this.overrides.clear();
      this.fenwick.reset(this.rowCount);
      return true;
    }

    let hasChanged = false;
    for (let index = 0; index < rowIndexes.length; index += 1) {
      const normalizedRowIndex = Math.floor(rowIndexes[index]);
      if (normalizedRowIndex < 0 || normalizedRowIndex >= this.rowCount) {
        continue;
      }

      const previousHeight = this.overrides.get(normalizedRowIndex);
      if (previousHeight === undefined) {
        continue;
      }

      const previousDelta = previousHeight - this.baseHeight;
      this.fenwick.add(normalizedRowIndex, -previousDelta);
      this.overrides.delete(normalizedRowIndex);
      hasChanged = true;
    }

    return hasChanged;
  }

  public findRowIndexAtOffset(offset: number): number {
    if (this.rowCount <= 0) {
      return 0;
    }

    const totalHeight = this.getTotalHeight();
    if (totalHeight <= 0) {
      return 0;
    }

    const clampedOffset = Math.max(0, Math.min(totalHeight - 1, offset));
    let low = 0;
    let high = this.rowCount;

    while (low < high) {
      const mid = (low + high) >> 1;
      const midTop = this.getRowTop(mid);
      if (midTop <= clampedOffset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return Math.max(0, low - 1);
  }
}
