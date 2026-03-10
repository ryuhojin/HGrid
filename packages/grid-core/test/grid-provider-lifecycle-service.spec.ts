import { describe, expect, it, vi } from 'vitest';
import type { RowsChangedListener } from '../src/data/data-provider';
import { LocalDataProvider } from '../src/data/local-data-provider';
import { GridProviderLifecycleService } from '../src/core/grid-provider-lifecycle-service';

class RowsChangedProvider extends LocalDataProvider {
  private listener: RowsChangedListener | null = null;

  public onRowsChanged(listener: RowsChangedListener): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) {
        this.listener = null;
      }
    };
  }

  public emitRowsChanged(): void {
    this.listener?.();
  }
}

describe('GridProviderLifecycleService', () => {
  it('rebinds rowsChanged listeners and disconnects previous subscriptions', () => {
    const service = new GridProviderLifecycleService();
    const provider = new RowsChangedProvider([{ id: 1 }]);
    const previousUnsubscribe = vi.fn();
    const onRowsChanged = vi.fn();

    const nextUnsubscribe = service.rebindRowsChangedListener({
      dataProvider: provider,
      currentUnsubscribe: previousUnsubscribe,
      onRowsChanged
    });

    expect(previousUnsubscribe).toHaveBeenCalledTimes(1);
    provider.emitRowsChanged();
    expect(onRowsChanged).toHaveBeenCalledTimes(1);

    const disconnected = service.disconnectRowsChangedListener(nextUnsubscribe ?? null);
    expect(disconnected).toBeNull();
    provider.emitRowsChanged();
    expect(onRowsChanged).toHaveBeenCalledTimes(1);
  });

  it('resolves provider replacement state for provider swap', () => {
    const service = new GridProviderLifecycleService();
    const currentProvider = new LocalDataProvider([{ id: 1 }]);
    const nextProvider = new LocalDataProvider([{ id: 10 }, { id: 20 }]);

    const result = service.replaceDataProvider(currentProvider, nextProvider);

    expect(result.dataProvider).toBe(nextProvider);
    expect(result.rowCount).toBe(2);
    expect(result.shouldRebind).toBe(true);
    expect(result.shouldResetDerivedArtifacts).toBe(true);
    expect(result.shouldResetExpansionState).toBe(true);
    expect(result.shouldResetTreeCaches).toBe(true);
    expect(result.shouldResetMappings).toBe(true);
    expect(result.shouldResetOperationTokens).toBe(true);
  });

  it('requests derived view rebuild when rows change under active derived state', () => {
    const service = new GridProviderLifecycleService();
    const provider = new LocalDataProvider([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const resolution = service.resolveRowsChanged({
      dataProvider: provider,
      currentRowCount: 2,
      hasActiveDerivedView: true,
      isRemoteDataProvider: false,
      shouldSyncRemoteQueryState: false
    });

    expect(resolution).toEqual({
      nextRowCount: 3,
      shouldSetRowCount: true,
      shouldResetRemoteMappings: false,
      shouldRebuildDerivedView: true,
      shouldSyncRemoteQueryState: false,
      shouldRefreshRenderer: false
    });
  });

  it('requests renderer refresh and remote query sync for passive remote changes', () => {
    const service = new GridProviderLifecycleService();
    const provider = new LocalDataProvider([{ id: 1 }, { id: 2 }]);

    const resolution = service.resolveRowsChanged({
      dataProvider: provider,
      currentRowCount: 1,
      hasActiveDerivedView: false,
      isRemoteDataProvider: true,
      shouldSyncRemoteQueryState: true
    });

    expect(resolution).toEqual({
      nextRowCount: 2,
      shouldSetRowCount: true,
      shouldResetRemoteMappings: true,
      shouldRebuildDerivedView: false,
      shouldSyncRemoteQueryState: true,
      shouldRefreshRenderer: true
    });
  });
});
