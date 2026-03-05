# Phase 6.2 Sorting

## Scope
- sort model 지원(단일/다중)
- column comparator 우선 + 기본 comparator fallback
- 정렬 결과를 `viewToData` 매핑으로 적용(`RowModel.setBaseViewToData`)

## API
- `Grid.setSortModel(sortModel): Promise<void>`
- `Grid.getSortModel(): SortModelItem[]`
- `Grid.clearSortModel(): Promise<void>`

`SortModelItem`
```ts
{ columnId: string, direction: "asc" | "desc" }
```

## Execution Model
- 기본 실행기는 `CooperativeSortExecutor`.
- 정렬은 다음 순서로 진행한다.
  1) sort model 정규화(존재 컬럼/중복/direction)
  2) sort key precompute
  3) 안정 정렬(merge sort)로 `Int32Array` 매핑 생성
  4) `RowModel`에 매핑 반영
- 실행 중에는 주기적으로 yield(`setTimeout(0)`)하여 이벤트 루프를 양보한다.
- operation token 기반 취소를 지원하여 최신 요청만 적용한다.

## Comparator Policy
- 우선순위:
  1) `column.comparator(a, b)`
  2) column type 기반 기본 비교
- 기본 비교:
  - `number`: 숫자 비교
  - `date`: Date/ISO/epoch 정규화 후 비교
  - `boolean`: `false < true`
  - `text`: 문자열 사전 비교
  - `null/undefined`: asc 기준 뒤로 배치

## Contract Alignment
- 6.1 worker protocol과 호환되는 응답 envelope 사용:
  - `ok`: `{ opId, status: "ok", result: { opId, mapping } }`
  - `canceled`: `{ opId, status: "canceled", result: null }`
  - `error`: `{ opId, status: "error", result: { message, code } }`

## Validation
- unit:
  - `packages/grid-core/test/sort-executor.spec.ts`
  - `packages/grid-core/test/grid.spec.ts` (Grid API integration)
- e2e:
  - `examples/example21.html`
  - `scripts/run-e2e.mjs` example21 시나리오
