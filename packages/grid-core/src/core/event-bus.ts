export type GridEventName = 'cellClick';

export interface CellClickEvent {
  rowIndex: number;
  dataIndex: number;
  columnId: string;
  value: unknown;
}

export interface GridEventMap {
  cellClick: CellClickEvent;
}

type EventHandler<T> = (payload: T) => void;

export class EventBus {
  private handlers: { [K in GridEventName]?: Set<EventHandler<GridEventMap[K]>> } = {};

  public on<K extends GridEventName>(eventName: K, handler: EventHandler<GridEventMap[K]>): void {
    if (!this.handlers[eventName]) {
      this.handlers[eventName] = new Set();
    }
    this.handlers[eventName]?.add(handler as EventHandler<GridEventMap[K]>);
  }

  public off<K extends GridEventName>(eventName: K, handler: EventHandler<GridEventMap[K]>): void {
    this.handlers[eventName]?.delete(handler as EventHandler<GridEventMap[K]>);
  }

  public emit<K extends GridEventName>(eventName: K, payload: GridEventMap[K]): void {
    this.handlers[eventName]?.forEach((handler) => handler(payload));
  }
}
