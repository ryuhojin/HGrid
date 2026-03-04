export type ViewToDataMapping = Int32Array | number[];

export interface RowModelOptions {
  enableDataToViewIndex?: boolean;
}

export interface RowModelState {
  rowCount: number;
  viewRowCount: number;
  hasFilterMapping: boolean;
  hasDataToViewIndex: boolean;
}

interface ResolvedRowModelOptions {
  enableDataToViewIndex: boolean;
}

function resolveOptions(options?: RowModelOptions): ResolvedRowModelOptions {
  return {
    enableDataToViewIndex: options?.enableDataToViewIndex === true
  };
}

function createIdentityMapping(rowCount: number): Int32Array {
  const mapping = new Int32Array(rowCount);

  for (let viewIndex = 0; viewIndex < rowCount; viewIndex += 1) {
    mapping[viewIndex] = viewIndex;
  }

  return mapping;
}

function toNumberArray(mapping: ViewToDataMapping): number[] {
  if (Array.isArray(mapping)) {
    return mapping.slice();
  }

  return Array.prototype.slice.call(mapping);
}

function normalizeMapping(mapping: ViewToDataMapping): Int32Array {
  if (mapping instanceof Int32Array) {
    return new Int32Array(mapping);
  }

  return Int32Array.from(mapping);
}

function validateMapping(mapping: ViewToDataMapping, rowCount: number): void {
  for (let viewIndex = 0; viewIndex < mapping.length; viewIndex += 1) {
    const dataIndex = mapping[viewIndex];

    if (!Number.isInteger(dataIndex)) {
      throw new Error(`Invalid data index in row mapping at viewIndex=${viewIndex}`);
    }

    if (dataIndex < 0 || dataIndex >= rowCount) {
      throw new Error(`Out-of-range data index in row mapping at viewIndex=${viewIndex}`);
    }
  }
}

export class RowModel {
  private rowCount: number;
  private baseViewToData: Int32Array;
  private filterViewToData: Int32Array | null = null;
  private options: ResolvedRowModelOptions;
  private dataToView: Int32Array | null = null;

  public constructor(rowCount: number, options?: RowModelOptions) {
    this.rowCount = Math.max(0, rowCount);
    this.options = resolveOptions(options);
    this.baseViewToData = createIdentityMapping(this.rowCount);
    this.rebuildDataToViewIndex();
  }

  public setOptions(options: RowModelOptions): void {
    this.options = {
      ...this.options,
      ...resolveOptions(options)
    };

    this.rebuildDataToViewIndex();
  }

  public setRowCount(rowCount: number): void {
    this.rowCount = Math.max(0, rowCount);
    this.resetToIdentity(this.rowCount);
  }

  public resetToIdentity(rowCount?: number): void {
    if (typeof rowCount === 'number') {
      this.rowCount = Math.max(0, rowCount);
    }

    this.baseViewToData = createIdentityMapping(this.rowCount);
    this.filterViewToData = null;
    this.rebuildDataToViewIndex();
  }

  public setBaseViewToData(mapping: ViewToDataMapping): void {
    if (mapping.length !== this.rowCount) {
      throw new Error(`Base row order length must equal rowCount (${this.rowCount})`);
    }

    validateMapping(mapping, this.rowCount);
    this.baseViewToData = normalizeMapping(mapping);
    this.rebuildDataToViewIndex();
  }

  public setFilterViewToData(mapping: ViewToDataMapping | null): void {
    if (mapping === null) {
      this.filterViewToData = null;
      this.rebuildDataToViewIndex();
      return;
    }

    if (mapping.length > this.rowCount) {
      throw new Error(`Filter row order length must be <= rowCount (${this.rowCount})`);
    }

    validateMapping(mapping, this.rowCount);
    this.filterViewToData = normalizeMapping(mapping);
    this.rebuildDataToViewIndex();
  }

  public getViewRowCount(): number {
    return this.getActiveViewToData().length;
  }

  public getDataIndex(viewIndex: number): number {
    const activeMapping = this.getActiveViewToData();
    if (viewIndex < 0 || viewIndex >= activeMapping.length) {
      return -1;
    }

    return activeMapping[viewIndex];
  }

  public getViewIndex(dataIndex: number): number {
    if (dataIndex < 0 || dataIndex >= this.rowCount) {
      return -1;
    }

    if (this.dataToView) {
      return this.dataToView[dataIndex];
    }

    const activeMapping = this.getActiveViewToData();
    for (let viewIndex = 0; viewIndex < activeMapping.length; viewIndex += 1) {
      if (activeMapping[viewIndex] === dataIndex) {
        return viewIndex;
      }
    }

    return -1;
  }

  public getActiveViewToData(): Int32Array {
    return this.filterViewToData ?? this.baseViewToData;
  }

  public getState(): RowModelState {
    return {
      rowCount: this.rowCount,
      viewRowCount: this.getViewRowCount(),
      hasFilterMapping: this.filterViewToData !== null,
      hasDataToViewIndex: this.dataToView !== null
    };
  }

  public getBaseViewToDataSnapshot(): number[] {
    return toNumberArray(this.baseViewToData);
  }

  public getFilterViewToDataSnapshot(): number[] | null {
    return this.filterViewToData ? toNumberArray(this.filterViewToData) : null;
  }

  private rebuildDataToViewIndex(): void {
    if (!this.options.enableDataToViewIndex) {
      this.dataToView = null;
      return;
    }

    const activeMapping = this.getActiveViewToData();
    const nextDataToView = new Int32Array(this.rowCount);
    nextDataToView.fill(-1);

    for (let viewIndex = 0; viewIndex < activeMapping.length; viewIndex += 1) {
      const dataIndex = activeMapping[viewIndex];
      nextDataToView[dataIndex] = viewIndex;
    }

    this.dataToView = nextDataToView;
  }
}
