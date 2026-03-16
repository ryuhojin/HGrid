export type TextFilterOperator = 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'notEquals';

export interface TextFilterCondition {
  kind: 'text';
  value: string;
  operator?: TextFilterOperator;
  caseSensitive?: boolean;
}

export type NumberFilterOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'between';

export interface NumberFilterCondition {
  kind: 'number';
  operator?: NumberFilterOperator;
  value?: number;
  min?: number;
  max?: number;
}

export type DateFilterOperator = 'on' | 'before' | 'after' | 'onOrBefore' | 'onOrAfter' | 'between' | 'notOn';

export interface DateFilterCondition {
  kind: 'date';
  operator?: DateFilterOperator;
  value?: string | number | Date;
  min?: string | number | Date;
  max?: string | number | Date;
}

export interface SetFilterCondition {
  kind: 'set';
  values: unknown[];
  caseSensitive?: boolean;
  includeNull?: boolean;
}

export type ColumnFilterCondition = TextFilterCondition | NumberFilterCondition | DateFilterCondition | SetFilterCondition;
export type ColumnFilterInput = ColumnFilterCondition | ColumnFilterCondition[];
export type GridFilterModel = Record<string, ColumnFilterInput | undefined>;

export type AdvancedFilterOperator = 'and' | 'or';

export interface AdvancedFilterRule {
  kind?: 'rule';
  columnId: string;
  condition: ColumnFilterCondition;
}

export interface AdvancedFilterGroup {
  kind: 'group';
  operator: AdvancedFilterOperator;
  rules: AdvancedFilterNode[];
}

export type AdvancedFilterNode = AdvancedFilterRule | AdvancedFilterGroup;

export interface AdvancedFilterModel {
  operator: AdvancedFilterOperator;
  rules: AdvancedFilterNode[];
}

export function cloneColumnFilterCondition(condition: ColumnFilterCondition): ColumnFilterCondition {
  return { ...condition };
}

export function cloneColumnFilterInput(filterInput: ColumnFilterInput | null | undefined): ColumnFilterInput | null {
  if (!filterInput) {
    return null;
  }

  if (Array.isArray(filterInput)) {
    const clonedItems = filterInput
      .filter((item): item is ColumnFilterCondition => Boolean(item && typeof item === 'object'))
      .map((item) => cloneColumnFilterCondition(item));
    return clonedItems.length > 0 ? clonedItems : null;
  }

  if (typeof filterInput !== 'object') {
    return null;
  }

  return cloneColumnFilterCondition(filterInput as ColumnFilterCondition);
}

export function normalizeGridFilterModel(filterModel: GridFilterModel | null | undefined): GridFilterModel {
  if (!filterModel || typeof filterModel !== 'object') {
    return {};
  }

  const normalized: GridFilterModel = {};
  const keys = Object.keys(filterModel);
  for (let index = 0; index < keys.length; index += 1) {
    const columnId = keys[index];
    if (!columnId) {
      continue;
    }

    const clonedInput = cloneColumnFilterInput(filterModel[columnId]);
    if (clonedInput) {
      normalized[columnId] = clonedInput;
    }
  }

  return normalized;
}

export function cloneGridFilterModel(filterModel: GridFilterModel | null | undefined): GridFilterModel {
  return normalizeGridFilterModel(filterModel);
}

export function isAdvancedFilterGroup(node: AdvancedFilterNode | null | undefined): node is AdvancedFilterGroup {
  return Boolean(node && typeof node === 'object' && (node as AdvancedFilterGroup).kind === 'group');
}

export function cloneAdvancedFilterNode(node: AdvancedFilterNode | null | undefined): AdvancedFilterNode | null {
  if (!node || typeof node !== 'object') {
    return null;
  }

  if (isAdvancedFilterGroup(node)) {
    const clonedRules = cloneAdvancedFilterNodes(node.rules);
    if (clonedRules.length === 0) {
      return null;
    }

    return {
      kind: 'group',
      operator: node.operator === 'or' ? 'or' : 'and',
      rules: clonedRules
    };
  }

  if (typeof node.columnId !== 'string' || node.columnId.length === 0) {
    return null;
  }

  const clonedCondition = cloneColumnFilterInput(node.condition);
  if (!clonedCondition || Array.isArray(clonedCondition)) {
    return null;
  }

  return {
    columnId: node.columnId,
    condition: clonedCondition
  };
}

export function cloneAdvancedFilterNodes(nodes: ReadonlyArray<AdvancedFilterNode> | null | undefined): AdvancedFilterNode[] {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [];
  }

  const clonedNodes: AdvancedFilterNode[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const clonedNode = cloneAdvancedFilterNode(nodes[index]);
    if (clonedNode) {
      clonedNodes.push(clonedNode);
    }
  }
  return clonedNodes;
}

export function cloneAdvancedFilterModel(advancedFilterModel: AdvancedFilterModel | null | undefined): AdvancedFilterModel | null {
  if (!advancedFilterModel || typeof advancedFilterModel !== 'object') {
    return null;
  }

  const clonedRules = cloneAdvancedFilterNodes(advancedFilterModel.rules);
  if (clonedRules.length === 0) {
    return null;
  }

  return {
    operator: advancedFilterModel.operator === 'or' ? 'or' : 'and',
    rules: clonedRules
  };
}

export function hasActiveAdvancedFilterModel(advancedFilterModel: AdvancedFilterModel | null | undefined): boolean {
  return Boolean(cloneAdvancedFilterModel(advancedFilterModel));
}

export function visitAdvancedFilterRules(
  nodes: ReadonlyArray<AdvancedFilterNode> | null | undefined,
  visitor: (rule: AdvancedFilterRule) => void
): void {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return;
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node || typeof node !== 'object') {
      continue;
    }

    if (isAdvancedFilterGroup(node)) {
      visitAdvancedFilterRules(node.rules, visitor);
      continue;
    }

    visitor(node);
  }
}
