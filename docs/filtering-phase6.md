# Phase 6.3 Filtering

## Scope
- filter model 지원(text/number/date/set)
- core API와 header quick filter panel(E3.2) 제공
- 필터 결과를 `RowModel.setFilterViewToData`로 적용
- 정렬 결과가 있으면 정렬 순서를 source order로 유지한 상태에서 필터를 적용

## API
- `Grid.setFilterModel(filterModel): Promise<void>`
- `Grid.getFilterModel(): GridFilterModel`
- `Grid.clearFilterModel(): Promise<void>`
- `Grid.setAdvancedFilterModel(advancedFilterModel): Promise<void>`
- `Grid.getAdvancedFilterModel(): AdvancedFilterModel | null`
- `Grid.clearAdvancedFilterModel(): Promise<void>`

`GridFilterModel`
```ts
Record<string, ColumnFilterInput>
```

`ColumnFilterInput`
- 단일 clause: `ColumnFilterCondition`
- 다중 clause(AND): `ColumnFilterCondition[]`

## UI Surface (E3.2)
- header menu의 `Open filter`에서 column별 quick filter panel을 연다.
- `text` / `number` / `date`: 최대 2 clause AND
- `set`: single-condition list
- quick filter panel은 `Grid.getFilterModel()` / `Grid.setFilterModel()`과 양방향 동기화한다.
- header filter row는 header 아래에 상시 input row를 두고 single-condition expression을 적용한다.
  - text: plain contains, `=`, `!=`, `^`, `$`
  - number/date: `>`, `>=`, `<`, `<=`, `=`, `!=`, `a..b`
  - text(enum): `ColumnDef.filterMode = "set"`일 때 dedicated select
- filters tool panel은 `Quick` / `Builder` surface를 제공한다.
- builder는 nested group을 포함한 cross-column rule tree와 top-level `AND / OR`를 지원한다.
- builder는 text/boolean column에서 `condition kind(text/set)` 전환과 set-option search를 지원한다.
- advanced filter preset은 저장/적용/삭제 UI와 public API를 제공한다.
- quick filter와 advanced filter builder는 동시에 유지되고 최종 결과는 둘 다 만족해야 한다.
- filter row는 boolean dedicated select, generic set/enum select, date picker를 제공한다.

`ColumnFilterCondition`
- text: `{ kind: "text", value, operator, caseSensitive? }`
- number: `{ kind: "number", operator, value|min|max }`
- date: `{ kind: "date", operator, value|min|max }`
- set: `{ kind: "set", values, caseSensitive?, includeNull? }`

## Execution Model
- 기본 실행기: `CooperativeFilterExecutor`
- row scan은 source order 기준으로 수행하고 통과한 `dataIndex`만 `Int32Array`로 누적한다.
- 긴 루프는 주기적으로 yield(`setTimeout(0)`)하여 이벤트 루프를 양보한다.
- operation token 기반 취소를 적용해 최신 요청만 반영한다.

## Sort + Filter Composition
- sort 적용 시 base mapping(`viewToData`)이 먼저 결정된다.
- filter 적용 시 source order를 sort mapping으로 사용해 정렬된 순서를 보존한다.
- clear filter는 filter mapping만 제거하고 sort mapping은 유지한다.

## Validation
- unit:
  - `packages/grid-core/test/filter-executor.spec.ts`
  - `packages/grid-core/test/grid.spec.ts` (sort+filter composition)
- e2e:
  - `examples/example22.html`
  - `examples/example74.html`
  - `examples/example76.html`
  - `examples/example77.html`
  - `examples/example78.html`
  - `examples/example80.html`
  - `scripts/run-e2e.mjs` example22 시나리오
