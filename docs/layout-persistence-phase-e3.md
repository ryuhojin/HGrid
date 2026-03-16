# Phase E3.6 Layout Persistence UX

## 목표
- 사용자가 현재 컬럼 레이아웃을 저장하고 다시 복원할 수 있어야 한다.
- preset layout 전환과 사용자 저장 레시피가 모두 public API만으로 설명 가능해야 한다.
- layout은 최소 `order / visibility / pin / width`를 포함해야 한다.

## 구현 범위
- `getColumnLayout()`
- `setColumnLayout(layout)`
- `GridColumnLayout`
  - `columnOrder`
  - `hiddenColumnIds`
  - `pinnedColumns`
  - `columnWidths`
- preset layout example
- localStorage recipe 문서화
- composed workspace recipe(`layout + state`) 문서화

## 동작 정책
- column layout snapshot은 현재 column model 기준으로 생성한다.
- layout apply는 순서상 `order -> visibility -> pin -> width`를 적용한다.
- layout apply 후 renderer는 한 번만 sync한다.
- layout persistence는 `GridState`와 별도 surface로 제공한다.
  - `GridState`는 scroll/group/pivot/expansion까지 포함하는 broader state
  - `GridColumnLayout`은 업무 화면 preset/save-load용 좁은 column layout state

## 저장 레시피
```ts
const layout = grid.getColumnLayout();
localStorage.setItem('hgrid-layout', JSON.stringify(layout));

const savedLayout = localStorage.getItem('hgrid-layout');
if (savedLayout) {
  grid.setColumnLayout(JSON.parse(savedLayout));
}
```

## 넓은 workspace 레시피
```ts
const workspace = {
  layout: grid.getColumnLayout(),
  state: grid.getState()
};
localStorage.setItem('hgrid-workspace', JSON.stringify(workspace));

const savedWorkspace = localStorage.getItem('hgrid-workspace');
if (savedWorkspace) {
  const parsed = JSON.parse(savedWorkspace);
  grid.setColumnLayout(parsed.layout);
  grid.setState(parsed.state);
}
```

- 이 조합은 `scrollTop`, `groupModel`, `pivotModel`, `group/tree expansion`까지 같이 복원한다.
- `GridColumnLayout`은 width를 담당하고, `GridState`는 broader view state를 담당한다.

## 현재 한계
- sort/filter model까지 포함한 fully custom workspace schema는 앱이 추가로 compose해야 한다.
- server/user profile 동기화 transport는 앱 레이어 책임이다.

## 예제
- [example72.html](../examples/example72.html)
