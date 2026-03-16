# Phase E3.1 Column Menu / Context Menu

## 목표
- 헤더에서 바로 정렬/고정/숨김/auto-size/reset을 실행할 수 있는 제품형 menu surface를 제공한다.
- header right-click과 keyboard(`Shift+F10`, `ContextMenu`)에서도 같은 action surface를 연다.
- custom menu item hook을 public API로 제공하되 core private field에 의존하지 않게 유지한다.
- body cell right-click에도 row/cell payload 기반 context menu를 연다.

## 구현 범위
- `columnMenu`
  - `enabled`
  - `trigger: "button" | "contextmenu" | "both"`
  - `getItems(context)`
- `contextMenu`
  - `enabled`
  - `builtInActions`
  - `getItems(context)`
- body payload
  - `context.kind === "cell"`
  - `rowIndex`, `dataIndex`, `rowKey`
  - `row`, `value`, `selection`
- built-in action
  - `sortAsc`
  - `sortDesc`
  - `clearSort`
  - `Open filter`
  - `pinLeft`
  - `pinRight`
  - `unpin`
  - `autoSizeColumn`
  - `resetColumnWidth`
  - `hideColumn`
- body built-in action(opt-in)
  - `copyCell`
  - `copyRow`
  - `copySelection`
  - `filterByValue`
  - `clearColumnFilter`

## 동작 정책
- 헤더 오른쪽 trigger zone 클릭 시 column menu를 연다.
- 헤더 right-click 시 built-in menu와 `contextMenu.getItems()`를 함께 노출한다.
- body cell right-click 시 `contextMenu.getItems()`만 노출한다.
- `contextMenu.builtInActions`가 설정된 body cell right-click은 generic copy/filter action을 custom item 앞에 같이 노출한다.
- keyboard open은 현재 active cell의 column header를 anchor로 사용한다.
- system utility column(`__indicator*`, `__state`)은 menu 대상에서 제외한다.
- `hideColumn`은 마지막 일반 컬럼 한 개만 남는 경우 disabled 처리한다.
- `Open filter`는 E3.2 single-condition filter panel을 연다.
- `autoSizeColumn`은 현재 보이는 header/body DOM을 측정해서 width를 산출한다.
- `resetColumnWidth`는 `ResolvedColumnDef.initialWidth` 기준으로 복원한다.
- low-height grid에서는 menu를 root 내부에 clamp하고, 공간이 부족하면 위로 뒤집거나 내부 scroll을 사용한다.
- body context menu policy:
  - 우클릭한 셀이 현재 selection 밖이면 single-cell selection으로 승격한다.
  - 이미 선택된 셀을 우클릭하면 기존 range를 유지하고 active cell만 target으로 이동한다.
  - 편집 중에는 body context menu를 열지 않는다.
  - custom action만 쓸 때는 clipboard state를 자동 변경하지 않는다.
  - built-in `copy*` action은 clipboard text를 직접 갱신한다.
  - built-in `filterByValue`는 현재 column에 set filter를 바로 적용한다.

## 현재 한계
- sort 상태 checkmark는 아직 제공하지 않는다. clear/sort action만 제공한다.
- multi-level group header 자체에는 menu를 붙이지 않았다. leaf header만 대상이다.
- body context menu built-in은 generic copy/filter action까지이고, domain-specific row action set은 여전히 앱이 붙여야 한다.
- menu 위치/충돌 정책은 grid overlay 내부 기준이고, portal/viewport escape는 아직 없다.
- filter panel 자체의 multi-condition builder는 [filter-ui-phase-e3.md](./filter-ui-phase-e3.md) 범위로 남겨 둔다.

## 예제
- [example62.html](../examples/example62.html)
- [example63.html](../examples/example63.html)
- [example64.html](../examples/example64.html)
- [example73.html](../examples/example73.html)
