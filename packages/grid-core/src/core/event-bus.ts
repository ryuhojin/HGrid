import type { SelectionChangeEvent } from '../interaction/selection-model';
import type { EditCommitEventPayload } from './edit-events';
import type {
  ColumnPinPosition,
  GridDirtyChangeSummary,
  GridBuiltInColumnMenuActionId,
  GridColumnLayout,
  GridMenuOpenSource,
  GroupAggregationDef,
  GroupModelItem,
  GroupingMode,
  PivotModelItem,
  PivotValueDef,
  PivotingMode
} from './grid-options';
import type { AdvancedFilterModel, ColumnFilterInput } from '../data/filter-executor';

export type GridEventName =
  | 'cellClick'
  | 'selectionChange'
  | 'editStart'
  | 'editCommit'
  | 'editCancel'
  | 'dirtyChange'
  | 'columnResize'
  | 'columnReorder'
  | 'columnMenuAction'
  | 'filterUiApply'
  | 'advancedFilterUiApply'
  | 'advancedFilterPresetUiAction'
  | 'columnLayoutPresetUiApply'
  | 'columnVisibilityChange'
  | 'columnPinChange'
  | 'groupingUiApply'
  | 'pivotUiApply';

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
  dirtyChange: DirtyChangeEvent;
  columnResize: ColumnResizeEvent;
  columnReorder: ColumnReorderEvent;
  columnMenuAction: ColumnMenuActionEvent;
  filterUiApply: FilterUiApplyEvent;
  advancedFilterUiApply: AdvancedFilterUiApplyEvent;
  advancedFilterPresetUiAction: AdvancedFilterPresetUiActionEvent;
  columnLayoutPresetUiApply: ColumnLayoutPresetUiApplyEvent;
  columnVisibilityChange: ColumnVisibilityChangeEvent;
  columnPinChange: ColumnPinChangeEvent;
  groupingUiApply: GroupingUiApplyEvent;
  pivotUiApply: PivotUiApplyEvent;
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

export interface DirtyChangeEvent {
  hasDirtyChanges: boolean;
  summary: GridDirtyChangeSummary;
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

export interface FilterUiApplyEvent {
  columnId: string;
  filterInput: ColumnFilterInput | null;
}

export interface AdvancedFilterUiApplyEvent {
  advancedFilterModel: AdvancedFilterModel | null;
}

export interface AdvancedFilterPresetUiActionEvent {
  action: 'save' | 'apply' | 'delete';
  presetId: string;
  label?: string;
}

export interface ColumnLayoutPresetUiApplyEvent {
  presetId: string;
  layout: GridColumnLayout;
}

export interface ColumnVisibilityChangeEvent {
  columnId: string;
  isVisible: boolean;
}

export interface ColumnPinChangeEvent {
  columnId: string;
  pinned?: ColumnPinPosition;
}

export interface GroupingUiApplyEvent {
  mode: GroupingMode;
  groupModel: GroupModelItem[];
  aggregations: GroupAggregationDef[];
}

export interface PivotUiApplyEvent {
  mode: PivotingMode;
  pivotModel: PivotModelItem[];
  values: PivotValueDef[];
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
