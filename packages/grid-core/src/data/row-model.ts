export type ViewToDataMapping = Int32Array | number[];

export interface SparseRowOverride {
  viewIndex: number;
  dataIndex: number;
}

export interface RowModelOptions {
  enableDataToViewIndex?: boolean;
}

export type BaseMappingMode = 'identity' | 'sparse' | 'materialized';

export interface RowModelState {
  rowCount: number;
  viewRowCount: number;
  hasFilterMapping: boolean;
  hasDataToViewIndex: boolean;
  isBaseIdentityMapping: boolean;
  isDataToViewIdentity: boolean;
  isDataToViewSparse: boolean;
  baseMappingMode: BaseMappingMode;
  sparseOverrideCount: number;
  materializedBaseBytes: number;
  materializedFilterBytes: number;
  materializedDataToViewBytes: number;
  sparseBytes: number;
  estimatedMappingBytes: number;
}

interface ResolvedRowModelOptions {
  enableDataToViewIndex: boolean;
}

interface SparseOverridesStorage {
  viewIndexes: Int32Array;
  dataIndexes: Int32Array;
  dataToViewLookup: Record<string, number>;
}

const BYTES_PER_INT32 = 4;
export const MATERIALIZED_MAPPING_LIMIT = 5_000_000;

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

function binarySearchInt32(values: Int32Array, target: number): number {
  let low = 0;
  let high = values.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const currentValue = values[mid];
    if (currentValue === target) {
      return mid;
    }

    if (currentValue < target) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return -1;
}

function buildSparseOverrides(overrides: SparseRowOverride[], rowCount: number): SparseOverridesStorage | null {
  if (!Array.isArray(overrides)) {
    throw new Error('Sparse overrides must be an array');
  }

  if (overrides.length === 0) {
    return null;
  }

  const seenViews: Record<string, true> = {};
  const seenData: Record<string, true> = {};
  const touchedViews: Record<string, true> = {};
  const canonical: SparseRowOverride[] = [];

  for (let index = 0; index < overrides.length; index += 1) {
    const override = overrides[index];
    const viewIndex = override.viewIndex;
    const dataIndex = override.dataIndex;

    if (!Number.isInteger(viewIndex) || !Number.isInteger(dataIndex)) {
      throw new Error(`Sparse override must use integer indices at index=${index}`);
    }

    if (viewIndex < 0 || viewIndex >= rowCount) {
      throw new Error(`Sparse override viewIndex out of range at index=${index}`);
    }

    if (dataIndex < 0 || dataIndex >= rowCount) {
      throw new Error(`Sparse override dataIndex out of range at index=${index}`);
    }

    const viewKey = String(viewIndex);
    if (seenViews[viewKey]) {
      throw new Error(`Duplicate sparse override viewIndex=${viewIndex}`);
    }
    seenViews[viewKey] = true;

    if (dataIndex === viewIndex) {
      continue;
    }

    const dataKey = String(dataIndex);
    if (seenData[dataKey]) {
      throw new Error(`Duplicate sparse override dataIndex=${dataIndex}`);
    }
    seenData[dataKey] = true;
    touchedViews[viewKey] = true;
    canonical.push({
      viewIndex,
      dataIndex
    });
  }

  if (canonical.length === 0) {
    return null;
  }

  const touchedViewValues = Object.keys(touchedViews)
    .map((value) => Number(value))
    .sort((left, right) => left - right);

  const assignedDataValues = Object.keys(seenData)
    .map((value) => Number(value))
    .sort((left, right) => left - right);

  if (touchedViewValues.length !== assignedDataValues.length) {
    throw new Error('Sparse overrides must preserve permutation (view/data cardinality mismatch)');
  }

  for (let index = 0; index < touchedViewValues.length; index += 1) {
    if (touchedViewValues[index] !== assignedDataValues[index]) {
      throw new Error('Sparse overrides must preserve permutation (assigned data set must equal touched view set)');
    }
  }

  canonical.sort((left, right) => left.viewIndex - right.viewIndex);

  const viewIndexes = new Int32Array(canonical.length);
  const dataIndexes = new Int32Array(canonical.length);
  const dataToViewLookup: Record<string, number> = {};

  for (let index = 0; index < canonical.length; index += 1) {
    const entry = canonical[index];
    viewIndexes[index] = entry.viewIndex;
    dataIndexes[index] = entry.dataIndex;
    dataToViewLookup[String(entry.dataIndex)] = entry.viewIndex;
  }

  return {
    viewIndexes,
    dataIndexes,
    dataToViewLookup
  };
}

function materializeSparseIdentityMapping(rowCount: number, sparse: SparseOverridesStorage | null): Int32Array {
  const mapping = createIdentityMapping(rowCount);

  if (!sparse) {
    return mapping;
  }

  for (let index = 0; index < sparse.viewIndexes.length; index += 1) {
    const viewIndex = sparse.viewIndexes[index];
    mapping[viewIndex] = sparse.dataIndexes[index];
  }

  return mapping;
}

export class RowModel {
  private rowCount: number;
  private baseViewToData: Int32Array | null = null;
  private sparseOverrides: SparseOverridesStorage | null = null;
  private baseMappingMode: BaseMappingMode = 'identity';
  private filterViewToData: Int32Array | null = null;
  private options: ResolvedRowModelOptions;
  private dataToView: Int32Array | null = null;
  private isDataToViewIdentity = false;
  private isDataToViewSparse = false;

  public constructor(rowCount: number, options?: RowModelOptions) {
    this.rowCount = Math.max(0, rowCount);
    this.options = resolveOptions(options);
    this.resetToIdentity(this.rowCount);
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
    this.sparseOverrides = null;
    this.baseMappingMode = 'identity';
    this.filterViewToData = null;
    this.rebuildDataToViewIndex();
  }

  public setBaseViewToData(mapping: ViewToDataMapping): void {
    if (mapping.length !== this.rowCount) {
      throw new Error(`Base row order length must equal rowCount (${this.rowCount})`);
    }

    validateMapping(mapping, this.rowCount);
    this.baseViewToData = normalizeMapping(mapping);
    this.sparseOverrides = null;
    this.baseMappingMode = 'materialized';
    this.rebuildDataToViewIndex();
  }

  public setBaseIdentityMapping(): void {
    this.baseViewToData = null;
    this.sparseOverrides = null;
    this.baseMappingMode = 'identity';
    this.rebuildDataToViewIndex();
  }

  public setBaseSparseOverrides(overrides: SparseRowOverride[]): void {
    this.baseViewToData = null;
    this.sparseOverrides = buildSparseOverrides(overrides, this.rowCount);
    this.baseMappingMode = this.sparseOverrides ? 'sparse' : 'identity';
    this.rebuildDataToViewIndex();
  }

  public clearBaseSparseOverrides(): void {
    if (this.baseMappingMode !== 'sparse') {
      return;
    }

    this.sparseOverrides = null;
    this.baseMappingMode = 'identity';
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

    if (this.baseMappingMode === 'materialized') {
      return this.baseViewToData ? this.baseViewToData[viewIndex] : -1;
    }

    if (this.baseMappingMode === 'sparse') {
      return this.resolveSparseDataIndex(viewIndex);
    }

    return viewIndex;
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

    if (this.isDataToViewSparse) {
      return this.resolveSparseViewIndex(dataIndex);
    }

    if (this.filterViewToData) {
      for (let viewIndex = 0; viewIndex < this.filterViewToData.length; viewIndex += 1) {
        if (this.filterViewToData[viewIndex] === dataIndex) {
          return viewIndex;
        }
      }

      return -1;
    }

    if (this.baseMappingMode === 'materialized') {
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

    return this.resolveSparseViewIndex(dataIndex);
  }

  public getActiveViewToData(): Int32Array {
    if (this.filterViewToData) {
      return this.filterViewToData;
    }

    if (this.baseMappingMode === 'materialized') {
      if (!this.baseViewToData) {
        throw new Error('Missing base mapping in materialized mode');
      }
      return this.baseViewToData;
    }

    if (this.rowCount > MATERIALIZED_MAPPING_LIMIT) {
      throw new Error(
        `Materialized identity mapping exceeds limit (${MATERIALIZED_MAPPING_LIMIT}). Use getDataIndex(viewIndex) instead.`
      );
    }

    if (this.baseMappingMode === 'sparse') {
      return materializeSparseIdentityMapping(this.rowCount, this.sparseOverrides);
    }

    return createIdentityMapping(this.rowCount);
  }

  public getState(): RowModelState {
    const materializedBaseBytes = this.baseViewToData ? this.baseViewToData.byteLength : 0;
    const materializedFilterBytes = this.filterViewToData ? this.filterViewToData.byteLength : 0;
    const materializedDataToViewBytes = this.dataToView ? this.dataToView.byteLength : 0;
    const sparseBytes = this.sparseOverrides
      ? this.sparseOverrides.viewIndexes.byteLength + this.sparseOverrides.dataIndexes.byteLength
      : 0;

    return {
      rowCount: this.rowCount,
      viewRowCount: this.getViewRowCount(),
      hasFilterMapping: this.filterViewToData !== null,
      hasDataToViewIndex: this.dataToView !== null || this.isDataToViewIdentity || this.isDataToViewSparse,
      isBaseIdentityMapping: this.baseMappingMode === 'identity',
      isDataToViewIdentity: this.isDataToViewIdentity,
      isDataToViewSparse: this.isDataToViewSparse,
      baseMappingMode: this.baseMappingMode,
      sparseOverrideCount: this.sparseOverrides ? this.sparseOverrides.viewIndexes.length : 0,
      materializedBaseBytes,
      materializedFilterBytes,
      materializedDataToViewBytes,
      sparseBytes,
      estimatedMappingBytes: materializedBaseBytes + materializedFilterBytes + materializedDataToViewBytes + sparseBytes
    };
  }

  public getBaseViewToDataSnapshot(): number[] {
    if (this.baseMappingMode === 'materialized') {
      return this.baseViewToData ? toNumberArray(this.baseViewToData) : [];
    }

    if (this.rowCount > MATERIALIZED_MAPPING_LIMIT) {
      throw new Error(
        `Base identity snapshot exceeds limit (${MATERIALIZED_MAPPING_LIMIT}). Use getDataIndex(viewIndex) instead.`
      );
    }

    const mapping =
      this.baseMappingMode === 'sparse'
        ? materializeSparseIdentityMapping(this.rowCount, this.sparseOverrides)
        : createIdentityMapping(this.rowCount);
    return toNumberArray(mapping);
  }

  public getFilterViewToDataSnapshot(): number[] | null {
    return this.filterViewToData ? toNumberArray(this.filterViewToData) : null;
  }

  private resolveSparseDataIndex(viewIndex: number): number {
    if (!this.sparseOverrides) {
      return viewIndex;
    }

    const overrideIndex = binarySearchInt32(this.sparseOverrides.viewIndexes, viewIndex);
    if (overrideIndex === -1) {
      return viewIndex;
    }

    return this.sparseOverrides.dataIndexes[overrideIndex];
  }

  private resolveSparseViewIndex(dataIndex: number): number {
    if (!this.sparseOverrides) {
      return dataIndex;
    }

    const overriddenViewIndex = this.sparseOverrides.dataToViewLookup[String(dataIndex)];
    if (overriddenViewIndex === undefined) {
      return dataIndex;
    }

    return overriddenViewIndex;
  }

  private rebuildDataToViewIndex(): void {
    if (!this.options.enableDataToViewIndex) {
      this.dataToView = null;
      this.isDataToViewIdentity = false;
      this.isDataToViewSparse = false;
      return;
    }

    if (this.filterViewToData === null) {
      if (this.baseMappingMode === 'identity') {
        this.dataToView = null;
        this.isDataToViewIdentity = true;
        this.isDataToViewSparse = false;
        return;
      }

      if (this.baseMappingMode === 'sparse') {
        this.dataToView = null;
        this.isDataToViewIdentity = false;
        this.isDataToViewSparse = true;
        return;
      }
    }

    const activeMapping = this.filterViewToData ?? this.baseViewToData;
    if (!activeMapping) {
      this.dataToView = null;
      this.isDataToViewIdentity = false;
      this.isDataToViewSparse = false;
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
    this.isDataToViewSparse = false;
  }

  private getActiveViewLength(): number {
    if (this.filterViewToData) {
      return this.filterViewToData.length;
    }

    if (this.baseMappingMode === 'materialized') {
      return this.baseViewToData ? this.baseViewToData.length : 0;
    }

    return this.rowCount;
  }
}
