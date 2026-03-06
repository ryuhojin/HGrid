import type { RowKey } from '../data/data-provider';

export type EditCommitSource = 'editor' | 'clipboard';

export interface EditCommitEventPayload {
  rowIndex: number;
  dataIndex: number;
  rowKey: RowKey;
  columnId: string;
  previousValue: unknown;
  value: unknown;
  source: EditCommitSource;
  commitId: string;
  timestampMs: number;
  timestamp: string;
}

export interface EditCommitAuditPayload extends EditCommitEventPayload {
  eventName: 'editCommit';
}

export type EditCommitAuditLogger = (payload: EditCommitAuditPayload) => void;
