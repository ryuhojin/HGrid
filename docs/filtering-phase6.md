# Phase 6.3 Filtering

## Scope
- filter model 지원(text/number/date/set)
- UI는 core 내장하지 않고 API 중심으로 제공
- 필터 결과를 `RowModel.setFilterViewToData`로 적용
- 정렬 결과가 있으면 정렬 순서를 source order로 유지한 상태에서 필터를 적용

## API
- `Grid.setFilterModel(filterModel): Promise<void>`
- `Grid.getFilterModel(): GridFilterModel`
- `Grid.clearFilterModel(): Promise<void>`

`GridFilterModel`
```ts
Record<string, ColumnFilterInput>
```

`ColumnFilterInput`
- 단일 clause: `ColumnFilterCondition`
- 다중 clause(AND): `ColumnFilterCondition[]`

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
  - `scripts/run-e2e.mjs` example22 시나리오
