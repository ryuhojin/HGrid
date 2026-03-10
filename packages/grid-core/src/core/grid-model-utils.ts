import type { GroupAggregationDef, GroupModelItem, PivotModelItem, PivotValueDef } from './grid-options';

export function cloneGroupModel(groupModel?: GroupModelItem[]): GroupModelItem[] {
  if (!Array.isArray(groupModel) || groupModel.length === 0) {
    return [];
  }

  const cloned: GroupModelItem[] = [];
  for (let index = 0; index < groupModel.length; index += 1) {
    const item = groupModel[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0) {
      continue;
    }

    cloned.push({ columnId });
  }

  return cloned;
}

export function cloneGroupAggregations(aggregations?: GroupAggregationDef[]): GroupAggregationDef[] {
  if (!Array.isArray(aggregations) || aggregations.length === 0) {
    return [];
  }

  const cloned: GroupAggregationDef[] = [];
  for (let index = 0; index < aggregations.length; index += 1) {
    const item = aggregations[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0) {
      continue;
    }

    cloned.push({
      columnId,
      type: item.type,
      reducer: typeof item.reducer === 'function' ? item.reducer : undefined
    });
  }

  return cloned;
}

export function cloneGroupExpansionState(groupExpansionState?: Record<string, boolean>): Record<string, boolean> {
  if (!groupExpansionState || typeof groupExpansionState !== 'object') {
    return {};
  }

  const cloned: Record<string, boolean> = {};
  const keys = Object.keys(groupExpansionState);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const value = groupExpansionState[key];
    if (value === true || value === false) {
      cloned[key] = value;
    }
  }

  return cloned;
}

export function clonePivotModel(pivotModel?: PivotModelItem[]): PivotModelItem[] {
  if (!Array.isArray(pivotModel) || pivotModel.length === 0) {
    return [];
  }

  const cloned: PivotModelItem[] = [];
  for (let index = 0; index < pivotModel.length; index += 1) {
    const item = pivotModel[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0) {
      continue;
    }

    cloned.push({ columnId });
  }

  return cloned;
}

export function clonePivotValues(values?: PivotValueDef[]): PivotValueDef[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const cloned: PivotValueDef[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item || typeof item.columnId !== 'string') {
      continue;
    }

    const columnId = item.columnId.trim();
    if (columnId.length === 0) {
      continue;
    }

    cloned.push({
      columnId,
      type: item.type,
      reducer: typeof item.reducer === 'function' ? item.reducer : undefined
    });
  }

  return cloned;
}
