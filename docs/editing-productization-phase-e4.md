# Phase E4.1 Editing Policy Productization

## Scope
- 목적:
  - editor type 정책을 `ColumnDef.editor`로 고정
  - validation 결과 shape와 dirty tracking API를 grid-owned surface로 올림
  - local/remote edit commit 이후 dirty summary를 같은 방식으로 읽게 함
- 이번 단계 범위:
  - `text / number / date / boolean / select / masked`
  - validation issue object
  - dirty tracking summary / accept / discard API
  - save / discard action bar
  - state column dirty/commit tone 연동

## Column Editor Policy
- `ColumnDef.editor?: GridCellEditorOptions`
- `type?: "auto" | "text" | "number" | "date" | "boolean" | "select" | "masked"`
- `auto`는 column `type`에서 추론한다.
  - `number -> number`
  - `date -> date`
  - `boolean -> boolean`
  - 그 외 `text`
- `select`
  - `editor.options: Array<{ value, label }>`
  - body cell edit는 single overlay 안의 `<select>` reuse 정책을 따른다.
- `date`
  - overlay `<input type="date">`
  - 기존 ISO-like 값은 `YYYY-MM-DD`로 normalize해서 보여준다.
- `number`
  - overlay `<input type="number">`
  - `min/max/step`를 attribute로 반영한다.
- `masked`
  - 현재는 dedicated mask widget이 아니라 text input normalization 정책이다.
  - `maskMode`
    - `digits`
    - `alphanumeric`
    - `uppercase`
    - `lowercase`
  - `pattern`이 있으면 native validity와 함께 사용한다.

## Validation Policy
- `validateEdit(context)`는 아래를 모두 허용한다.
  - `string | null | undefined`
  - `{ message: string; code?: string } | null | undefined`
  - `Promise<...>`
- validation failure UX:
  - overlay는 열린 상태 유지
  - message는 inline bubble로 표준화
  - async validator는 pending UI로 전환하고 stale result는 ticket guard로 무시
- native validity는 현재 아래 경우에만 사용한다.
  - `number`
  - `pattern`
  - `min/max/step`

## Dirty Tracking Policy
- `GridOptions.editPolicy?.dirtyTracking?.enabled === true`일 때만 grid-owned dirty tracking이 활성화된다.
- dirty tracking source:
  - single editor commit
  - clipboard paste
  - fill handle
  - undo / redo
- public API:
  - `grid.hasDirtyChanges()`
  - `grid.getDirtyChanges()`
  - `grid.getDirtyChangeSummary()`
  - `grid.acceptDirtyChanges({ rowKeys? })`
  - `grid.discardDirtyChanges({ rowKeys? })`
- `dirtyChange` event:
  - `{ hasDirtyChanges, summary }`
- state column / row status tone:
  - dirty row -> `updated` => state cell text `dirty`
  - accepted row -> `clean` => state cell text `commit`

## Action Bar Policy
- `GridOptions.editPolicy?.actionBar?.enabled === true`면 grid footer 영역에 built-in action bar를 그린다.
- action bar는 아래 정보를 한 줄에서 묶는다.
  - dirty row / cell summary
  - remote pending / error summary
  - save / discard action
- default behavior:
  - `Save` -> `grid.acceptDirtyChanges()`
  - `Discard` -> `grid.discardDirtyChanges()`
- custom behavior:
  - `editPolicy.actionBar.onSave(context)`
  - `editPolicy.actionBar.onDiscard(context)`
  - handler return:
    - `false` 또는 `{ completed: false }` -> built-in accept/discard를 수행하지 않음
    - `void | true | { completed?: true }` -> built-in accept/discard 수행
    - `message` / `tone` -> action bar recovery message에 반영
- 목표:
  - validation 이후 dirty 상태를 사용자가 눈으로 확인
  - save failure 메시지를 그리드 안에서 바로 확인
  - discard를 통해 local/remote pending을 즉시 되돌림

## Remote Provider Interop
- remote/server mode는 기존 `pending change` contract를 유지한다.
- `grid.acceptDirtyChanges()`는 grid-owned dirty tracking을 clear한 뒤,
  current/source provider가 `acceptPendingChanges()`를 제공하면 같이 호출한다.
- `grid.discardDirtyChanges()`는 grid-owned dirty tracking을 clear하고,
  current/source provider가 `discardPendingChanges()`를 제공하면 같이 호출한다.

## Verification
- unit:
  - [dom-renderer-editor-overlay.spec.ts](../packages/grid-core/test/dom-renderer-editor-overlay.spec.ts)
  - [grid.spec.ts](../packages/grid-core/test/grid.spec.ts)
- remote integration:
  - [remote-data-provider.spec.ts](../packages/grid-core/test/remote-data-provider.spec.ts)
- example:
  - [example84.html](../examples/example84.html)
  - [example88.html](../examples/example88.html)

## Current Limits
- masked editor는 현재 normalization 정책이지 dedicated formatter/mask cursor engine은 아니다.
- native date picker commit behavior는 브라우저에서 확인되며, jsdom integration은 open/format 중심으로 검증한다.
- 서버 transport / refetch orchestration / conflict merge dialog는 여전히 앱 또는 이후 phase 책임이다.
