import type { ColumnDef, GroupAggregationType } from '../core/grid-options';
import type { RowKey } from './data-provider';

export type RemoteServerSideStoreStrategy = 'partial' | 'full';
export type RemoteServerSideRequestKind = 'root' | 'children' | 'pivot' | 'tree';
export type RemoteServerSideRowKind = 'leaf' | 'group' | 'aggregate';

export interface RemoteServerSideRouteItem {
  columnId: string;
  key: RowKey;
}

export interface RemoteServerSideGroupingAggregation {
  columnId: string;
  type?: GroupAggregationType;
}

export interface RemoteServerSideGroupingQuery {
  expandedGroupKeys?: string[];
  defaultExpanded?: boolean;
  aggregations?: RemoteServerSideGroupingAggregation[];
}

export interface RemoteServerSideTreeQuery {
  idField?: string;
  parentIdField?: string;
  hasChildrenField?: string;
  treeColumnId?: string;
  expandedNodeKeys?: RowKey[];
}

export interface RemoteServerSidePivotResult {
  columns: ColumnDef[];
}

export interface RemoteServerSideQueryModel {
  schemaVersion: string;
  requestKind: RemoteServerSideRequestKind;
  route: RemoteServerSideRouteItem[];
  rootStoreStrategy: RemoteServerSideStoreStrategy;
  childStoreStrategy: RemoteServerSideStoreStrategy;
  grouping?: RemoteServerSideGroupingQuery;
  tree?: RemoteServerSideTreeQuery;
}

export interface RemoteServerSideRowMetadata {
  kind: RemoteServerSideRowKind;
  level?: number;
  childCount?: number;
  isExpanded?: boolean;
  isExpandedByDefault?: boolean;
  groupColumnId?: string;
  groupKey?: RowKey;
  route?: RemoteServerSideRouteItem[];
  aggregateValues?: Record<string, unknown>;
  treeNodeKey?: RowKey;
  treeParentNodeKey?: RowKey | null;
  treeDepth?: number;
  treeHasChildren?: boolean;
  treeExpanded?: boolean;
  treeColumnId?: string;
}

const DEFAULT_SERVER_SIDE_SCHEMA_VERSION = 'v1';

function cloneRouteItem(routeItem: RemoteServerSideRouteItem | undefined): RemoteServerSideRouteItem | null {
  if (!routeItem || typeof routeItem.columnId !== 'string' || routeItem.columnId.length === 0) {
    return null;
  }

  const key = routeItem.key;
  if (typeof key !== 'string' && typeof key !== 'number') {
    return null;
  }

  return {
    columnId: routeItem.columnId,
    key
  };
}

export function cloneRemoteServerSideRoute(route: RemoteServerSideRouteItem[] | undefined): RemoteServerSideRouteItem[] {
  if (!Array.isArray(route) || route.length === 0) {
    return [];
  }

  const normalizedRoute: RemoteServerSideRouteItem[] = [];
  for (let index = 0; index < route.length; index += 1) {
    const clonedRouteItem = cloneRouteItem(route[index]);
    if (!clonedRouteItem) {
      continue;
    }

    normalizedRoute.push(clonedRouteItem);
  }

  return normalizedRoute;
}

function normalizeStoreStrategy(value: unknown): RemoteServerSideStoreStrategy {
  return value === 'full' ? 'full' : 'partial';
}

function normalizeRequestKind(value: unknown): RemoteServerSideRequestKind {
  if (value === 'children' || value === 'pivot' || value === 'tree') {
    return value;
  }

  return 'root';
}

function cloneColumn(column: ColumnDef | undefined): ColumnDef | null {
  if (!column || typeof column.id !== 'string' || column.id.length === 0) {
    return null;
  }

  return { ...column };
}

function cloneColumns(columns: ColumnDef[] | undefined): ColumnDef[] {
  if (!Array.isArray(columns) || columns.length === 0) {
    return [];
  }

  const clonedColumns: ColumnDef[] = [];
  for (let index = 0; index < columns.length; index += 1) {
    const clonedColumn = cloneColumn(columns[index]);
    if (clonedColumn) {
      clonedColumns.push(clonedColumn);
    }
  }

  return clonedColumns;
}

function cloneStringArray(values: string[] | undefined): string[] | undefined {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }

  const clonedValues = values.filter((value) => typeof value === 'string' && value.length > 0);
  return clonedValues.length > 0 ? clonedValues : undefined;
}

function cloneRowKeyArray(values: RowKey[] | undefined): RowKey[] | undefined {
  if (!Array.isArray(values) || values.length === 0) {
    return undefined;
  }

  const clonedValues = values.filter((value) => typeof value === 'string' || typeof value === 'number');
  return clonedValues.length > 0 ? clonedValues : undefined;
}

function cloneGroupingAggregations(
  aggregations: RemoteServerSideGroupingAggregation[] | undefined
): RemoteServerSideGroupingAggregation[] | undefined {
  if (!Array.isArray(aggregations) || aggregations.length === 0) {
    return undefined;
  }

  const cloned: RemoteServerSideGroupingAggregation[] = [];
  for (let index = 0; index < aggregations.length; index += 1) {
    const aggregation = aggregations[index];
    if (!aggregation || typeof aggregation.columnId !== 'string' || aggregation.columnId.length === 0) {
      continue;
    }

    cloned.push({
      columnId: aggregation.columnId,
      type: aggregation.type
    });
  }

  return cloned.length > 0 ? cloned : undefined;
}

function cloneGroupingQuery(grouping: RemoteServerSideGroupingQuery | undefined): RemoteServerSideGroupingQuery | undefined {
  if (!grouping || typeof grouping !== 'object') {
    return undefined;
  }

  const cloned: RemoteServerSideGroupingQuery = {};
  const expandedGroupKeys = cloneStringArray(grouping.expandedGroupKeys);
  if (expandedGroupKeys) {
    cloned.expandedGroupKeys = expandedGroupKeys;
  }

  if (grouping.defaultExpanded === true) {
    cloned.defaultExpanded = true;
  } else if (grouping.defaultExpanded === false) {
    cloned.defaultExpanded = false;
  }

  const aggregations = cloneGroupingAggregations(grouping.aggregations);
  if (aggregations) {
    cloned.aggregations = aggregations;
  }

  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function cloneTreeQuery(tree: RemoteServerSideTreeQuery | undefined): RemoteServerSideTreeQuery | undefined {
  if (!tree || typeof tree !== 'object') {
    return undefined;
  }

  const cloned: RemoteServerSideTreeQuery = {};
  if (typeof tree.idField === 'string' && tree.idField.length > 0) {
    cloned.idField = tree.idField;
  }
  if (typeof tree.parentIdField === 'string' && tree.parentIdField.length > 0) {
    cloned.parentIdField = tree.parentIdField;
  }
  if (typeof tree.hasChildrenField === 'string' && tree.hasChildrenField.length > 0) {
    cloned.hasChildrenField = tree.hasChildrenField;
  }
  if (typeof tree.treeColumnId === 'string' && tree.treeColumnId.length > 0) {
    cloned.treeColumnId = tree.treeColumnId;
  }

  const expandedNodeKeys = cloneRowKeyArray(tree.expandedNodeKeys);
  if (expandedNodeKeys) {
    cloned.expandedNodeKeys = expandedNodeKeys;
  }

  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function normalizeRowKind(value: unknown): RemoteServerSideRowKind {
  if (value === 'group' || value === 'aggregate') {
    return value;
  }

  return 'leaf';
}

export function cloneRemoteServerSideQueryModel(
  input: Partial<RemoteServerSideQueryModel> | RemoteServerSideQueryModel | undefined
): RemoteServerSideQueryModel | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const schemaVersion =
    typeof input.schemaVersion === 'string' && input.schemaVersion.trim().length > 0
      ? input.schemaVersion.trim()
      : DEFAULT_SERVER_SIDE_SCHEMA_VERSION;

  return {
    schemaVersion,
    requestKind: normalizeRequestKind(input.requestKind),
    route: cloneRemoteServerSideRoute(input.route),
    rootStoreStrategy: normalizeStoreStrategy(input.rootStoreStrategy),
    childStoreStrategy: normalizeStoreStrategy(input.childStoreStrategy),
    grouping: cloneGroupingQuery(input.grouping),
    tree: cloneTreeQuery(input.tree)
  };
}

function cloneAggregateValues(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!values || typeof values !== 'object') {
    return undefined;
  }

  const cloned: Record<string, unknown> = {};
  const keys = Object.keys(values);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    cloned[key] = values[key];
  }

  return cloned;
}

export function cloneRemoteServerSideRowMetadata(
  metadata: RemoteServerSideRowMetadata | undefined
): RemoteServerSideRowMetadata | undefined {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const cloned: RemoteServerSideRowMetadata = {
    kind: normalizeRowKind(metadata.kind)
  };

  if (typeof metadata.level === 'number' && Number.isFinite(metadata.level)) {
    cloned.level = Math.max(0, Math.floor(metadata.level));
  }

  if (typeof metadata.childCount === 'number' && Number.isFinite(metadata.childCount)) {
    cloned.childCount = Math.max(0, Math.floor(metadata.childCount));
  }

  if (metadata.isExpanded === true) {
    cloned.isExpanded = true;
  } else if (metadata.isExpanded === false) {
    cloned.isExpanded = false;
  }

  if (metadata.isExpandedByDefault === true) {
    cloned.isExpandedByDefault = true;
  }

  if (typeof metadata.groupColumnId === 'string' && metadata.groupColumnId.length > 0) {
    cloned.groupColumnId = metadata.groupColumnId;
  }

  if (typeof metadata.groupKey === 'string' || typeof metadata.groupKey === 'number') {
    cloned.groupKey = metadata.groupKey;
  }

  const route = cloneRemoteServerSideRoute(metadata.route);
  if (route.length > 0) {
    cloned.route = route;
  }

  const aggregateValues = cloneAggregateValues(metadata.aggregateValues);
  if (aggregateValues) {
    cloned.aggregateValues = aggregateValues;
  }

  if (typeof metadata.treeNodeKey === 'string' || typeof metadata.treeNodeKey === 'number') {
    cloned.treeNodeKey = metadata.treeNodeKey;
  }

  if (
    metadata.treeParentNodeKey === null ||
    typeof metadata.treeParentNodeKey === 'string' ||
    typeof metadata.treeParentNodeKey === 'number'
  ) {
    cloned.treeParentNodeKey = metadata.treeParentNodeKey;
  }

  if (typeof metadata.treeDepth === 'number' && Number.isFinite(metadata.treeDepth)) {
    cloned.treeDepth = Math.max(0, Math.floor(metadata.treeDepth));
  }

  if (metadata.treeHasChildren === true) {
    cloned.treeHasChildren = true;
  } else if (metadata.treeHasChildren === false) {
    cloned.treeHasChildren = false;
  }

  if (metadata.treeExpanded === true) {
    cloned.treeExpanded = true;
  } else if (metadata.treeExpanded === false) {
    cloned.treeExpanded = false;
  }

  if (typeof metadata.treeColumnId === 'string' && metadata.treeColumnId.length > 0) {
    cloned.treeColumnId = metadata.treeColumnId;
  }

  return cloned;
}

export function cloneRemoteServerSidePivotResult(
  result: RemoteServerSidePivotResult | undefined
): RemoteServerSidePivotResult | undefined {
  if (!result || typeof result !== 'object') {
    return undefined;
  }

  const columns = cloneColumns(result.columns);
  if (columns.length === 0) {
    return undefined;
  }

  return {
    columns
  };
}

export function cloneRemoteServerSideRowMetadataList(
  metadataList: Array<RemoteServerSideRowMetadata | undefined> | undefined,
  expectedLength: number
): Array<RemoteServerSideRowMetadata | undefined> {
  const normalizedLength = Math.max(0, Math.floor(expectedLength));
  const clonedList: Array<RemoteServerSideRowMetadata | undefined> = new Array(normalizedLength);
  for (let index = 0; index < normalizedLength; index += 1) {
    clonedList[index] = cloneRemoteServerSideRowMetadata(metadataList?.[index]);
  }

  return clonedList;
}

export function isSameRemoteServerSideQueryModel(
  left: RemoteServerSideQueryModel | undefined,
  right: RemoteServerSideQueryModel | undefined
): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (left.schemaVersion !== right.schemaVersion) {
    return false;
  }

  if (left.requestKind !== right.requestKind) {
    return false;
  }

  if (left.rootStoreStrategy !== right.rootStoreStrategy || left.childStoreStrategy !== right.childStoreStrategy) {
    return false;
  }

  if (left.route.length !== right.route.length) {
    return false;
  }

  for (let index = 0; index < left.route.length; index += 1) {
    if (left.route[index].columnId !== right.route[index].columnId || left.route[index].key !== right.route[index].key) {
      return false;
    }
  }

  if (JSON.stringify(left.grouping) !== JSON.stringify(right.grouping)) {
    return false;
  }

  if (JSON.stringify(left.tree) !== JSON.stringify(right.tree)) {
    return false;
  }

  return true;
}
