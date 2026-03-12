# Phase E3.1 Column Menu / Context Menu

## 목표
- 헤더에서 바로 정렬/고정/숨김/auto-size/reset을 실행할 수 있는 제품형 menu surface를 제공한다.
- header right-click과 keyboard(`Shift+F10`, `ContextMenu`)에서도 같은 action surface를 연다.
- custom menu item hook을 public API로 제공하되 core private field에 의존하지 않게 유지한다.

## 구현 범위
- `columnMenu`
  - `enabled`
  - `trigger: "button" | "contextmenu" | "both"`
  - `getItems(context)`
- `contextMenu`
  - `enabled`
  - `getItems(context)`
- built-in action
  - `sortAsc`
  - `sortDesc`
  - `clearSort`
  - `pinLeft`
  - `pinRight`
  - `unpin`
  - `autoSizeColumn`
  - `resetColumnWidth`
  - `hideColumn`

## 동작 정책
- 헤더 오른쪽 trigger zone 클릭 시 column menu를 연다.
- 헤더 right-click 시 built-in menu와 `contextMenu.getItems()`를 함께 노출한다.
- keyboard open은 현재 active cell의 column header를 anchor로 사용한다.
- system utility column(`__indicator*`, `__state`)은 menu 대상에서 제외한다.
- `hideColumn`은 마지막 일반 컬럼 한 개만 남는 경우 disabled 처리한다.
- `autoSizeColumn`은 현재 보이는 header/body DOM을 측정해서 width를 산출한다.
- `resetColumnWidth`는 `ResolvedColumnDef.initialWidth` 기준으로 복원한다.

## 현재 한계
- body cell context menu는 아직 없다. 현재 범위는 header-scoped menu다.
- sort 상태 checkmark는 아직 제공하지 않는다. clear/sort action만 제공한다.
- multi-level group header 자체에는 menu를 붙이지 않았다. leaf header만 대상이다.
- menu 위치/충돌 정책은 grid overlay 내부 기준이고, portal/viewport escape는 아직 없다.

## 예제
- [example62.html](../examples/example62.html)
