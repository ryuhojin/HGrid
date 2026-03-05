export type ViewToDataMapping = Int32Array | number[];

export interface RowModelOptions {
  enableDataToViewIndex?: boolean;
}

export interface RowModelState {
  rowCount: number;
  viewRowCount: number;
  hasFilterMapping: boolean;
  hasDataToViewIndex: boolean;
  isBaseIdentityMapping: boolean;
  isDataToViewIdentity: boolean;
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

const MATERIALIZED_MAPPING_LIMIT = 5_000_000;

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
  private baseViewToData: Int32Array | null = null;
  private isBaseIdentityMapping = true;
  private filterViewToData: Int32Array | null = null;
  private options: ResolvedRowModelOptions;
  private dataToView: Int32Array | null = null;
  private isDataToViewIdentity = false;

  public constructor(rowCount: number, options?: RowModelOptions) {
    this.rowCount = Math.max(0, rowCount);
    this.options = resolveOptions(options);
    this.isBaseIdentityMapping = true;
    this.baseViewToData = null;
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

    this.baseViewToData = null;
    this.isBaseIdentityMapping = true;
    this.filterViewToData = null;
    this.rebuildDataToViewIndex();
  }

  public setBaseViewToData(mapping: ViewToDataMapping): void {
    if (mapping.length !== this.rowCount) {
      throw new Error(`Base row order length must equal rowCount (${this.rowCount})`);
    }

    validateMapping(mapping, this.rowCount);
    this.baseViewToData = normalizeMapping(mapping);
    this.isBaseIdentityMapping = false;
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
    return this.getActiveViewLength();
  }

  public getDataIndex(viewIndex: number): number {
    const viewRowCount = this.getActiveViewLength();
    if (viewIndex < 0 || viewIndex >= viewRowCount) {
      return -1;
    }

    if (this.filterViewToData) {
      return this.filterViewToData[viewIndex];
    }

    if (this.isBaseIdentityMapping) {
      return viewIndex;
    }

    if (!this.baseViewToData) {
      return -1;
    }

    return this.baseViewToData[viewIndex];
  }

  public getViewIndex(dataIndex: number): number {
    if (dataIndex < 0 || dataIndex >= this.rowCount) {
      return -1;
    }

    if (this.isDataToViewIdentity) {
      return dataIndex;
    }

    if (this.dataToView) {
      return this.dataToView[dataIndex];
    }

    if (this.filterViewToData) {
      for (let viewIndex = 0; viewIndex < this.filterViewToData.length; viewIndex += 1) {
        if (this.filterViewToData[viewIndex] === dataIndex) {
          return viewIndex;
        }
      }

      return -1;
    }

    if (this.isBaseIdentityMapping) {
      return dataIndex;
    }

    if (!this.baseViewToData) {
      return -1;
    }

    for (let viewIndex = 0; viewIndex < this.baseViewToData.length; viewIndex += 1) {
      if (this.baseViewToData[viewIndex] === dataIndex) {
        return viewIndex;
      }
    }

    return -1;
  }

  public getActiveViewToData(): Int32Array {
    if (this.filterViewToData) {
      return this.filterViewToData;
    }

    if (!this.isBaseIdentityMapping) {
      if (!this.baseViewToData) {
        throw new Error('Missing base mapping in non-identity mode');
      }
      return this.baseViewToData;
    }

    if (this.rowCount > MATERIALIZED_MAPPING_LIMIT) {
      throw new Error(
        `Materialized identity mapping exceeds limit (${MATERIALIZED_MAPPING_LIMIT}). Use getDataIndex(viewIndex) instead.`
      );
    }

    return createIdentityMapping(this.rowCount);
  }

  public getState(): RowModelState {
    return {
      rowCount: this.rowCount,
      viewRowCount: this.getViewRowCount(),
      hasFilterMapping: this.filterViewToData !== null,
      hasDataToViewIndex: this.dataToView !== null || this.isDataToViewIdentity,
      isBaseIdentityMapping: this.isBaseIdentityMapping,
      isDataToViewIdentity: this.isDataToViewIdentity
    };
  }

  public getBaseViewToDataSnapshot(): number[] {
    if (this.isBaseIdentityMapping) {
      if (this.rowCount > MATERIALIZED_MAPPING_LIMIT) {
        throw new Error(
          `Base identity snapshot exceeds limit (${MATERIALIZED_MAPPING_LIMIT}). Use getDataIndex(viewIndex) instead.`
        );
      }

      const snapshot = new Array<number>(this.rowCount);
      for (let viewIndex = 0; viewIndex < this.rowCount; viewIndex += 1) {
        snapshot[viewIndex] = viewIndex;
      }
      return snapshot;
    }

    if (!this.baseViewToData) {
      return [];
    }

    return toNumberArray(this.baseViewToData);
  }

  public getFilterViewToDataSnapshot(): number[] | null {
    return this.filterViewToData ? toNumberArray(this.filterViewToData) : null;
  }

  private rebuildDataToViewIndex(): void {
    if (!this.options.enableDataToViewIndex) {
      this.dataToView = null;
      this.isDataToViewIdentity = false;
      return;
    }

    if (this.filterViewToData === null && this.isBaseIdentityMapping) {
      this.dataToView = null;
      this.isDataToViewIdentity = true;
      return;
    }

    const activeMapping = this.filterViewToData ?? this.baseViewToData;
    if (!activeMapping) {
      this.dataToView = null;
      this.isDataToViewIdentity = false;
      return;
    }

    const nextDataToView = new Int32Array(this.rowCount);
    nextDataToView.fill(-1);

    for (let viewIndex = 0; viewIndex < activeMapping.length; viewIndex += 1) {
      const dataIndex = activeMapping[viewIndex];
      nextDataToView[dataIndex] = viewIndex;
    }

    this.dataToView = nextDataToView;
    this.isDataToViewIdentity = false;
  }

  private getActiveViewLength(): number {
    if (this.filterViewToData) {
      return this.filterViewToData.length;
    }

    if (this.isBaseIdentityMapping) {
      return this.rowCount;
    }

    return this.baseViewToData ? this.baseViewToData.length : 0;
  }
}
