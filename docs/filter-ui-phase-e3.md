# Phase E3.2 Filter UI

## 목표
- 헤더 menu에서 바로 여는 multi-condition filter panel을 제공한다.
- `Grid.getFilterModel()` / `Grid.setFilterModel()`과 panel state를 양방향으로 동기화한다.
- text / number / date는 2-clause AND panel, set은 single-condition panel로 제공한다.
- filters tool panel 안에서 cross-column advanced filter builder를 제공한다.
- header 아래에서 빠르게 값을 넣는 filter row를 제공한다.

## 구현 범위
- built-in header menu item: `Open filter`
- filters tool panel (`sideBar.panels = ["filters"]`, docked shell)
- filters tool panel sub-surface
  - `Quick`
  - `Builder`
- multi-condition filter panel
  - `text` (최대 2 clause, AND)
  - `number` (최대 2 clause, AND)
  - `date` (최대 2 clause, AND)
- single-condition filter panel
  - `set`
- text 컬럼에서 `text <-> set` mode toggle
- advanced filter builder
  - top-level `AND / OR`
  - nested group
  - text / number / date / boolean rule
  - text / boolean `condition kind(text/set)` toggle
  - saved preset save/apply/delete
- header filter row
  - text: plain contains, `=`, `!=`, `^`, `$`
  - number: `=`, `!=`, `>`, `>=`, `<`, `<=`, `a..b`
  - date: `=`, `!=`, `>`, `>=`, `<`, `<=`, `a..b`
  - boolean: `Any / True / False / Blank`
  - text(enum): `ColumnDef.filterMode = "set"`일 때 dedicated select editor
- filtered header visual state
- panel action
  - `Apply`
  - `Clear`
  - `Cancel`

## 동작 정책
- filter panel은 leaf header에서만 연다.
- panel apply는 `filterUiApply` 내부 이벤트를 통해 `Grid.setFilterModel()`로 내려간다.
- panel clear는 해당 column filter만 제거한다.
- `Grid.setFilterModel()`이 외부에서 호출되면 header filtered state와 open panel draft를 다시 동기화한다.
- filters tool panel이 열려 있으면 active column editor도 다시 동기화한다.
- advanced filter builder apply는 `advancedFilterUiApply` 내부 이벤트를 통해 `Grid.setAdvancedFilterModel()`로 내려간다.
- quick filter와 advanced filter는 동시에 유지되고 최종 결과는 둘 다 만족해야 한다.
- body context menu에서는 filter panel을 열지 않는다.
- header filter panel은 side bar shell 위로 뜰 수 있어야 하며, grid 높이를 넘기면 panel 내부 scroll로 처리한다.
- set filter option은 `setFilter.valueSource = "sampled" | "full"`로 수집 전략을 고를 수 있다.
- `setFilter.maxScanRows`, `setFilter.maxDistinctValues`, `setFilter.getValues(context)`로 distinct source를 제어할 수 있다.
- clause 배열은 `ColumnFilterCondition[]`로 내려가며 의미는 `AND`다.
- builder model은 `AdvancedFilterModel = { operator, rules[] }` 형식으로 노출한다.
- builder rule은 group 안에 다시 group을 중첩할 수 있다.
- builder rule은 text/boolean column에서 `text <-> set` condition kind 전환을 지원한다.
- advanced filter preset은 `Grid.getAdvancedFilterPresets()` / `setAdvancedFilterPresets()` / `saveAdvancedFilterPreset()` / `applyAdvancedFilterPreset()` / `deleteAdvancedFilterPreset()`으로 관리한다.
- remote provider query model도 `advancedFilterModel`을 같이 보존한다.
- filter row는 `Grid.getFilterModel()` / `Grid.setFilterModel()`과 양방향 동기화된다.
- filter row는 `Enter` 또는 blur/change 시 현재 값을 적용하고, `Escape`는 현재 열 filter를 지운다.
- date filter row는 native date picker를 사용하고, `between`은 2-input range shell로 표현한다.
- text enum column은 filter row에서 select editor를 사용하고, 선택값은 `set` filter condition으로 내려간다.
- `full`은 provider가 이미 읽을 수 있는 row만 대상으로 distinct를 모은다. remote provider가 `peekRow()`를 지원하면 unloaded block fetch를 강제로 일으키지 않는다.
- server-wide/full-dataset distinct가 필요하면 `setFilter.getValues()`로 외부 enum/distinct source를 주입하는 것이 권장 경로다.

## 현재 한계
- operator label locale bundle은 아직 raw token 기반이다.
- body quick filter action은 아직 없다.
- preset은 grid-owned API와 tool panel UI까지 있지만, user profile/server persistence transport는 앱 레이어가 조합해야 한다.

## 예제
- [example64.html](../examples/example64.html)
- [example66.html](../examples/example66.html)
- [example74.html](../examples/example74.html)
- [example76.html](../examples/example76.html)
- [example77.html](../examples/example77.html)
- [example78.html](../examples/example78.html)
- [example80.html](../examples/example80.html)
