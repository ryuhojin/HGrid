import type { RowKey } from './data-provider';

export type RemoteServerSideStoreStrategy = 'partial' | 'full';
export type RemoteServerSideRequestKind = 'root' | 'children' | 'pivot' | 'tree';
export type RemoteServerSideRowKind = 'leaf' | 'group' | 'aggregate';

export interface RemoteServerSideRouteItem {
  columnId: string;
  key: RowKey;
}

export interface RemoteServerSideQueryModel {
  schemaVersion: string;
  requestKind: RemoteServerSideRequestKind;
  route: RemoteServerSideRouteItem[];
  rootStoreStrategy: RemoteServerSideStoreStrategy;
  childStoreStrategy: RemoteServerSideStoreStrategy;
}

export interface RemoteServerSideRowMetadata {
  kind: RemoteServerSideRowKind;
  level?: number;
  childCount?: number;
  isExpandedByDefault?: boolean;
  groupColumnId?: string;
  groupKey?: RowKey;
  route?: RemoteServerSideRouteItem[];
  aggregateValues?: Record<string, unknown>;
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
    childStoreStrategy: normalizeStoreStrategy(input.childStoreStrategy)
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

  return cloned;
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

  return true;
}
