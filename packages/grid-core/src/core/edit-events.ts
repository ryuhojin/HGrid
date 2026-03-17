import type { RowKey } from '../data/data-provider';

export type EditCommitSource = 'editor' | 'clipboard' | 'fillHandle' | 'undo' | 'redo';
export type EditTransactionKind = 'singleCell' | 'clipboardRange' | 'fillRange' | 'historyReplay';
export type EditTransactionStep = 'apply' | 'undo' | 'redo';

export interface EditCommitChangePayload {
  rowIndex: number;
  dataIndex: number;
  rowKey: RowKey;
  columnId: string;
  previousValue: unknown;
  value: unknown;
}

export interface EditCommitEventPayload extends EditCommitChangePayload {
  source: EditCommitSource;
  commitId: string;
  transactionId: string;
  rootTransactionId: string;
  transactionKind: EditTransactionKind;
  transactionStep: EditTransactionStep;
  timestampMs: number;
  timestamp: string;
  rowCount: number;
  cellCount: number;
  changes: EditCommitChangePayload[];
}

export interface EditCommitAuditPayload extends EditCommitEventPayload {
  eventName: 'editCommit';
  changeIndex?: number;
}

export type EditCommitAuditLogger = (payload: EditCommitAuditPayload) => void;
