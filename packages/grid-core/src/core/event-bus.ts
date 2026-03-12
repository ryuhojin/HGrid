import type { SelectionChangeEvent } from '../interaction/selection-model';
import type { EditCommitEventPayload } from './edit-events';
import type { GridBuiltInColumnMenuActionId, GridMenuOpenSource } from './grid-options';

export type GridEventName =
  | 'cellClick'
  | 'selectionChange'
  | 'editStart'
  | 'editCommit'
  | 'editCancel'
  | 'columnResize'
  | 'columnReorder'
  | 'columnMenuAction';

export interface CellClickEvent {
  rowIndex: number;
  dataIndex: number;
  columnId: string;
  value: unknown;
}

export interface GridEventMap {
  cellClick: CellClickEvent;
  selectionChange: SelectionChangeEvent;
  editStart: EditStartEvent;
  editCommit: EditCommitEvent;
  editCancel: EditCancelEvent;
  columnResize: ColumnResizeEvent;
  columnReorder: ColumnReorderEvent;
  columnMenuAction: ColumnMenuActionEvent;
}

export interface EditStartEvent {
  rowIndex: number;
  dataIndex: number;
  columnId: string;
  value: unknown;
}

export type EditCommitEvent = EditCommitEventPayload;

export interface EditCancelEvent {
  rowIndex: number;
  dataIndex: number;
  columnId: string;
  value: unknown;
  reason: 'escape' | 'reconcile' | 'detached';
}

export interface ColumnResizeEvent {
  columnId: string;
  width: number;
  phase: 'start' | 'move' | 'end';
}

export interface ColumnReorderEvent {
  sourceColumnId: string;
  targetColumnId: string | null;
  fromIndex: number;
  toIndex: number;
  columnOrder: string[];
}

export interface ColumnMenuActionEvent {
  columnId: string;
  actionId: GridBuiltInColumnMenuActionId;
  source: GridMenuOpenSource;
}

type EventHandler<T> = (payload: T) => void;
type AnyEventHandler = (payload: unknown) => void;

export class EventBus {
  private handlers = new Map<GridEventName, Set<AnyEventHandler>>();

  public on<K extends GridEventName>(eventName: K, handler: EventHandler<GridEventMap[K]>): void {
    let handlersForEvent = this.handlers.get(eventName);
    if (!handlersForEvent) {
      handlersForEvent = new Set<AnyEventHandler>();
      this.handlers.set(eventName, handlersForEvent);
    }
    handlersForEvent.add(handler as AnyEventHandler);
  }

  public off<K extends GridEventName>(eventName: K, handler: EventHandler<GridEventMap[K]>): void {
    const handlersForEvent = this.handlers.get(eventName);
    handlersForEvent?.delete(handler as AnyEventHandler);
  }

  public emit<K extends GridEventName>(eventName: K, payload: GridEventMap[K]): void {
    const handlersForEvent = this.handlers.get(eventName);
    handlersForEvent?.forEach((handler) => handler(payload));
  }
}
