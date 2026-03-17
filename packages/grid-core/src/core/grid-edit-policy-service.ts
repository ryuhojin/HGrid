import type { EventBus, GridEventMap } from './event-bus';
import type {
  GridDirtyCellChange,
  GridDirtyChangeOptions,
  GridDirtyChangeSummary,
  GridDirtyRowChange
} from './grid-options';
import type { RowKey } from '../data/data-provider';

interface InternalDirtyCellChange extends GridDirtyCellChange {}

interface InternalDirtyRowChange {
  rowKey: RowKey;
  dataIndexHint: number;
  changes: Map<string, InternalDirtyCellChange>;
}

export interface GridEditPolicyServiceParams {
  eventBus: EventBus;
  isDirtyTrackingEnabled: () => boolean;
}

function cloneDirtyRowChange(rowChange: InternalDirtyRowChange): GridDirtyRowChange {
  return {
    rowKey: rowChange.rowKey,
    dataIndexHint: rowChange.dataIndexHint,
    changes: Array.from(rowChange.changes.values()).map((change) => ({
      columnId: change.columnId,
      originalValue: change.originalValue,
      value: change.value
    }))
  };
}

function createEmptyDirtyChangeSummary(): GridDirtyChangeSummary {
  return {
    rowCount: 0,
    cellCount: 0,
    rowKeys: []
  };
}

export class GridEditPolicyService {
  private readonly dirtyChanges = new Map<RowKey, InternalDirtyRowChange>();
  private readonly committedRowKeys = new Set<RowKey>();
  private eventBus: EventBus | null = null;

  public register(params: GridEditPolicyServiceParams): () => void {
    this.eventBus = params.eventBus;
    const handleEditCommit = (event: GridEventMap['editCommit']): void => {
      if (!params.isDirtyTrackingEnabled()) {
        return;
      }

      this.handleEditCommit(event);
    };

    params.eventBus.on('editCommit', handleEditCommit);

    return () => {
      params.eventBus.off('editCommit', handleEditCommit);
      if (this.eventBus === params.eventBus) {
        this.eventBus = null;
      }
    };
  }

  public reset(): void {
    if (this.dirtyChanges.size === 0 && this.committedRowKeys.size === 0) {
      return;
    }

    this.dirtyChanges.clear();
    this.committedRowKeys.clear();
    this.emitDirtyChange();
  }

  public hasDirtyChanges(): boolean {
    return this.dirtyChanges.size > 0;
  }

  public getDirtyChanges(): GridDirtyRowChange[] {
    return Array.from(this.dirtyChanges.values()).map((rowChange) => cloneDirtyRowChange(rowChange));
  }

  public getDirtyChangeSummary(): GridDirtyChangeSummary {
    if (this.dirtyChanges.size === 0) {
      return createEmptyDirtyChangeSummary();
    }

    const rowKeys = Array.from(this.dirtyChanges.keys());
    let cellCount = 0;
    for (let index = 0; index < rowKeys.length; index += 1) {
      const rowChange = this.dirtyChanges.get(rowKeys[index]);
      if (!rowChange) {
        continue;
      }
      cellCount += rowChange.changes.size;
    }

    return {
      rowCount: rowKeys.length,
      cellCount,
      rowKeys
    };
  }

  public acceptDirtyChanges(options?: GridDirtyChangeOptions): void {
    const targetRowKeys = this.resolveTargetRowKeys(options);
    if (targetRowKeys.length === 0) {
      return;
    }

    for (let index = 0; index < targetRowKeys.length; index += 1) {
      const rowKey = targetRowKeys[index];
      this.dirtyChanges.delete(rowKey);
      this.committedRowKeys.add(rowKey);
    }

    this.emitDirtyChange();
  }

  public discardDirtyChanges(options?: GridDirtyChangeOptions): GridDirtyRowChange[] {
    const targetRowKeys = this.resolveTargetRowKeys(options);
    if (targetRowKeys.length === 0) {
      return [];
    }

    const discardedChanges: GridDirtyRowChange[] = [];
    for (let index = 0; index < targetRowKeys.length; index += 1) {
      const rowKey = targetRowKeys[index];
      const rowChange = this.dirtyChanges.get(rowKey);
      if (!rowChange) {
        continue;
      }

      discardedChanges.push(cloneDirtyRowChange(rowChange));
      this.dirtyChanges.delete(rowKey);
      this.committedRowKeys.delete(rowKey);
    }

    if (discardedChanges.length > 0) {
      this.emitDirtyChange();
    }

    return discardedChanges;
  }

  public isRowDirty(rowKey: RowKey): boolean {
    return this.dirtyChanges.has(rowKey);
  }

  public isRowCommitted(rowKey: RowKey): boolean {
    return !this.dirtyChanges.has(rowKey) && this.committedRowKeys.has(rowKey);
  }

  private handleEditCommit(event: GridEventMap['editCommit']): void {
    const changes = Array.isArray(event.changes) && event.changes.length > 0
      ? event.changes
      : [
          {
            rowIndex: event.rowIndex,
            dataIndex: event.dataIndex,
            rowKey: event.rowKey,
            columnId: event.columnId,
            previousValue: event.previousValue,
            value: event.value
          }
        ];

    let hasChanged = false;
    for (let index = 0; index < changes.length; index += 1) {
      const change = changes[index];
      this.committedRowKeys.delete(change.rowKey);

      let rowChange = this.dirtyChanges.get(change.rowKey);
      if (!rowChange) {
        rowChange = {
          rowKey: change.rowKey,
          dataIndexHint: change.dataIndex,
          changes: new Map()
        };
        this.dirtyChanges.set(change.rowKey, rowChange);
      } else {
        rowChange.dataIndexHint = change.dataIndex;
      }

      const existingCellChange = rowChange.changes.get(change.columnId);
      if (!existingCellChange) {
        if (Object.is(change.previousValue, change.value)) {
          if (rowChange.changes.size === 0) {
            this.dirtyChanges.delete(change.rowKey);
          }
          continue;
        }

        rowChange.changes.set(change.columnId, {
          columnId: change.columnId,
          originalValue: change.previousValue,
          value: change.value
        });
        hasChanged = true;
        continue;
      }

      if (Object.is(change.value, existingCellChange.originalValue)) {
        rowChange.changes.delete(change.columnId);
        if (rowChange.changes.size === 0) {
          this.dirtyChanges.delete(change.rowKey);
        }
        hasChanged = true;
        continue;
      }

      if (!Object.is(existingCellChange.value, change.value)) {
        existingCellChange.value = change.value;
        hasChanged = true;
      }
    }

    if (hasChanged) {
      this.emitDirtyChange();
    }
  }

  private resolveTargetRowKeys(options?: GridDirtyChangeOptions): RowKey[] {
    if (!Array.isArray(options?.rowKeys) || options.rowKeys.length === 0) {
      return Array.from(this.dirtyChanges.keys());
    }

    const rowKeys: RowKey[] = [];
    for (let index = 0; index < options.rowKeys.length; index += 1) {
      const rowKey = options.rowKeys[index];
      if (this.dirtyChanges.has(rowKey)) {
        rowKeys.push(rowKey);
      }
    }

    return rowKeys;
  }

  private emitDirtyChange(): void {
    this.eventBus?.emit('dirtyChange', {
      hasDirtyChanges: this.hasDirtyChanges(),
      summary: this.getDirtyChangeSummary()
    });
  }
}
