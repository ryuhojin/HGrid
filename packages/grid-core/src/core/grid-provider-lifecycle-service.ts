import type { DataProvider, RowsChangedListener } from '../data/data-provider';

export interface GridProviderReplacementResult {
  dataProvider: DataProvider;
  rowCount: number;
  shouldRebind: boolean;
  shouldResetDerivedArtifacts: boolean;
  shouldResetExpansionState: boolean;
  shouldResetTreeCaches: boolean;
  shouldResetMappings: boolean;
  shouldResetOperationTokens: boolean;
}

export interface GridProviderRowsChangedResolution {
  nextRowCount: number;
  shouldSetRowCount: boolean;
  shouldResetRemoteMappings: boolean;
  shouldRebuildDerivedView: boolean;
  shouldSyncRemoteQueryState: boolean;
  shouldRefreshRenderer: boolean;
}

export interface GridProviderRowsChangedParams {
  dataProvider: DataProvider;
  currentRowCount: number;
  hasActiveDerivedView: boolean;
  isRemoteDataProvider: boolean;
  shouldSyncRemoteQueryState: boolean;
}

export interface GridProviderRebindParams {
  dataProvider: DataProvider;
  currentUnsubscribe: (() => void) | null;
  onRowsChanged: RowsChangedListener;
}

export class GridProviderLifecycleService {
  public replaceDataProvider(currentDataProvider: DataProvider, nextDataProvider: DataProvider): GridProviderReplacementResult {
    return {
      dataProvider: nextDataProvider,
      rowCount: nextDataProvider.getRowCount(),
      shouldRebind: currentDataProvider !== nextDataProvider,
      shouldResetDerivedArtifacts: true,
      shouldResetExpansionState: true,
      shouldResetTreeCaches: true,
      shouldResetMappings: true,
      shouldResetOperationTokens: true
    };
  }

  public resolveRowsChanged(params: GridProviderRowsChangedParams): GridProviderRowsChangedResolution {
    const nextRowCount = params.dataProvider.getRowCount();
    const shouldSetRowCount = params.currentRowCount !== nextRowCount;
    const shouldResetRemoteMappings = shouldSetRowCount && params.isRemoteDataProvider;

    if (params.hasActiveDerivedView) {
      return {
        nextRowCount,
        shouldSetRowCount,
        shouldResetRemoteMappings,
        shouldRebuildDerivedView: true,
        shouldSyncRemoteQueryState: false,
        shouldRefreshRenderer: false
      };
    }

    return {
      nextRowCount,
      shouldSetRowCount,
      shouldResetRemoteMappings,
      shouldRebuildDerivedView: false,
      shouldSyncRemoteQueryState: params.shouldSyncRemoteQueryState,
      shouldRefreshRenderer: true
    };
  }

  public rebindRowsChangedListener(params: GridProviderRebindParams): (() => void) | null {
    this.disconnectRowsChangedListener(params.currentUnsubscribe);
    if (typeof params.dataProvider.onRowsChanged !== 'function') {
      return null;
    }

    return params.dataProvider.onRowsChanged(params.onRowsChanged);
  }

  public disconnectRowsChangedListener(currentUnsubscribe: (() => void) | null): null {
    if (currentUnsubscribe) {
      currentUnsubscribe();
    }

    return null;
  }
}
