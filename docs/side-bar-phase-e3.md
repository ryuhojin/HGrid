# Phase E3.3 Side Bar / Tool Panels

## 목표
- 일반 업무 사용자가 header menu를 거치지 않고도 열 구성 상태와 column filter를 UI로 조정할 수 있게 한다.
- side bar shell을 먼저 고정하고, `columns`, `filters`, `grouping`, `pivot` tool panel을 제공한다.
- `columns` panel은 current visible columns가 아니라 full column catalog를 기준으로 그려져서 hidden column도 복구할 수 있어야 한다.
- `filters` panel은 기존 filter model 계약을 그대로 사용하면서 sidebar 안에서 quick filter surface를 제공해야 한다.
- `grouping`, `pivot` panel은 모델과 집계를 UI만으로 조정할 수 있어야 한다.

## 구현 범위
- `sideBar`
  - `enabled`
  - `panels`
  - `defaultPanel`
  - `initialOpen`
  - `width`
- `customPanels`
- slim toggle + docked tabbed tool panel shell
- `columns` panel
  - column visibility toggle
  - pin left / right / none
  - hidden column restore
  - saved layout preset apply
- `filters` panel
  - filter column list
  - embedded filter editor
  - text / number / date 2-clause AND
  - set filter + search
- `grouping` panel
  - grouping mode(client/server)
  - grouped column selection + order move
  - aggregation selection
- `pivot` panel
  - pivot mode(client/server)
  - pivot column selection + order move
  - value aggregation selection
- custom panel registry
  - `sideBar.customPanels`
  - custom title + render callback + official mutation actions

## 동작 정책
- side bar는 overlay가 아니라 grid 폭을 실제로 줄이는 docked shell로 구현한다.
- panel open 시 외부 rail은 숨기고 panel 폭만큼 header/body/overlay usable width를 줄인다.
- panel close 시 slim edge handle만 남고, usable width는 handle 폭만 reserve한다.
- panel이 여러 개일 때 전환은 shell 바깥 button 목록이 아니라 panel header tab에서 처리한다.
- shell/header/section/card는 dense 업무 화면에서도 과도하게 흩어져 보이지 않도록 단일 visual system으로 정리한다.
- `initialOpen: false`면 first render는 닫힌 edge handle 상태로 시작하고, toggle 시 `defaultPanel` 또는 첫 panel이 열린다.
- `columns` panel은 full column catalog를 사용하므로 hidden column도 항상 목록에 남는다.
- `columns` panel은 header/id 기준 search input을 제공하고, 검색 결과 범위에서 열 순서를 up/down control로 재배치할 수 있다.
- `columns` panel은 `sideBar.columnLayoutPresets`가 있으면 panel 안에서 바로 preset을 선택/적용할 수 있다.
- 마지막 일반 컬럼 1개만 visible인 상태에서는 그 컬럼을 숨기는 체크박스를 비활성화한다.
- `filters` panel은 column별 단일 editor surface를 제공하고, apply / clear는 현재 선택 column filter만 바꾼다.
- `filters` panel은 `Grid.getFilterModel()` / `Grid.setFilterModel()`과 양방향으로 동기화된다.
- `filters` panel은 `Quick` / `Builder` sub-surface를 제공하며, builder는 nested group을 포함한 cross-column `AND / OR` advanced filter를 편집한다.
- `grouping` panel은 group model과 aggregation을 즉시 적용한다.
- `pivot` panel은 pivot model과 value aggregation을 즉시 적용한다.
- custom panel render callback은 `{ container, state, actions }`를 받고, `actions`는 `closePanel()`, `setFilterModel()`, `clearFilterModel()`, `setAdvancedFilterModel()`, `setColumnLayout()`를 제공한다.
- panel interaction은 selection/editing hit-test에 간섭하지 않도록 별도 event guard를 둔다.
- `Escape`는 open tool panel을 닫는다.

## 현재 한계
- `filters` builder preset은 들어왔지만, user profile/server persistence transport는 아직 앱 레이어가 조합해야 한다.

## 예제
- [example65.html](../examples/example65.html)
- [example66.html](../examples/example66.html)
- [example67.html](../examples/example67.html)
- [example68.html](../examples/example68.html)
- [example69.html](../examples/example69.html)
- [example74.html](../examples/example74.html)
- [example75.html](../examples/example75.html)
- [example76.html](../examples/example76.html)
- [example79.html](../examples/example79.html)
- [example80.html](../examples/example80.html)
