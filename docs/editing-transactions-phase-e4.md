# Phase E4.2 Undo/Redo / Transaction UX

## Scope
- 목적:
  - undo/redo를 단순 history stack이 아니라 transaction-aware edit workflow로 고정
  - clipboard paste / fill handle / single editor commit을 같은 transaction contract로 본다
  - audit payload가 undo/redo와 어떤 관계인지 추적 가능하게 만든다
- 이번 단계 범위:
  - transaction metadata를 `editCommit` / `onAuditLog` payload에 추가
  - clipboard paste undo 범위를 명시적으로 1-transaction 단위로 고정
  - rollback policy를 local transaction 기준으로 문서화

## Transaction Model
- 원본 편집 transaction은 다음 source에서 생성된다.
  - `editor`
  - `clipboard`
  - `fillHandle`
- 원본 transaction payload:
  - `transactionId`
  - `rootTransactionId`
  - `transactionKind`
    - `"singleCell"`
    - `"clipboardRange"`
    - `"fillRange"`
  - `transactionStep = "apply"`
- 원본 편집에서는 `transactionId === rootTransactionId`다.

## Undo / Redo Semantics
- undo/redo는 새로운 `editCommit` event를 다시 만든다.
- 이때 payload는:
  - `source: "undo" | "redo"`
  - `transactionKind: "historyReplay"`
  - `transactionStep: "undo" | "redo"`
  - `transactionId`: 현재 replay action의 새 id
  - `rootTransactionId`: 원본 편집 transaction id
- 의미:
  - audit/log consumer는 `rootTransactionId`로 원본 편집과 replay를 묶을 수 있다.
  - 같은 원본 transaction을 여러 번 undo/redo해도 logical root는 유지된다.

## Clipboard Paste Undo Scope
- 한 번의 paste action은 하나의 transaction이다.
- 2x2, 10x50처럼 여러 셀을 바꾸더라도:
  - `editCommit`은 1회 emit
  - `rowCount` / `cellCount` / `changes[]`는 전체 batch를 담는다.
  - `undo()` 1회로 전체 paste batch가 같이 되돌아간다.
  - `redo()` 1회로 같은 batch가 다시 적용된다.

## Rollback Policy
- E4.2 기준 rollback은 `undo()`가 담당한다.
- 범위:
  - local data provider 편집
  - remote provider의 아직 저장되지 않은 pending change replay
- 비범위:
  - 임의 transaction id를 골라 rollback하는 public API
  - 서버에 이미 저장된 mutation의 distributed rollback
  - conflict merge UI
- 즉 현재 제품 정책은:
  - local transaction rollback = `undo()`
  - persisted server rollback = app / server orchestration 책임

## Audit Relation
- `GridOptions.onAuditLog(payload)`는 기존처럼 `changes[]` fan-out을 유지한다.
- 각 audit payload는 이제 다음 transaction metadata를 함께 가진다.
  - `transactionId`
  - `rootTransactionId`
  - `transactionKind`
  - `transactionStep`
  - `changeIndex`
- 권장 소비 방식:
  - `rootTransactionId` 기준으로 하나의 업무 transaction 묶기
  - `transactionStep`으로 apply / undo / redo를 구분
  - `changeIndex`로 batch transaction 안의 개별 셀 audit를 정렬

## Verification
- unit / integration:
  - [grid.spec.ts](../packages/grid-core/test/grid.spec.ts)
  - [grid-command-event-service.spec.ts](../packages/grid-core/test/grid-command-event-service.spec.ts)
- examples:
  - [example83.html](../examples/example83.html)
  - [example85.html](../examples/example85.html)
- e2e:
  - [run-e2e.mjs](../scripts/run-e2e.mjs)

## Current Limits
- arbitrary transaction rollback API는 아직 없다.
- save/discard action bar는 E4 close-out에서 들어갔지만, distributed transaction rollback과 conflict merge dialog는 여전히 범위 밖이다.
- audit payload는 transaction metadata까지 올라왔지만, domain-specific audit schema versioning은 E5/E9 운영 범위다.
