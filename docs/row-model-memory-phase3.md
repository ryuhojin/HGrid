# Phase 3.4 RowModel Memory Budget (100M)

## Goal
- `setRowCount(100_000_000)`에서 초기 마운트 시 full `Int32Array`를 만들지 않고 identity lazy mapping으로 시작한다.
- 정렬/필터/트랜잭션이 필요할 때만 mapping을 materialize하거나 sparse override로 변경분만 저장한다.

## Memory Policy
- default(identity):
  - base mapping 미할당 (`materializedBaseBytes = 0`)
  - filter mapping 미할당 (`materializedFilterBytes = 0`)
  - dataToView는 `enableDataToViewIndex=true`여도 identity shortcut 사용 (`materializedDataToViewBytes = 0`)
- sparse override:
  - `Int32Array(viewIndexes)` + `Int32Array(dataIndexes)` 사용
  - typed array 기준 비용: `8 * overrideCount` bytes
  - 예: 2개 override = `16 bytes` (+ lookup 오브젝트 오버헤드)
- materialized mapping:
  - base `Int32Array(rowCount)` = `rowCount * 4 bytes`
  - 100M일 때 약 `400,000,000 bytes` (약 `381.47 MiB`)
  - filter는 `filteredCount * 4 bytes`

## 100M Initialization Budget
- 필수 전제:
  - `baseMappingMode = "identity"`
  - `hasFilterMapping = false`
  - `estimatedMappingBytes = 0`
- 이 상태에서 스크롤/점프/상태복원은 virtual scroll mapping으로 처리하며 RowModel mapping 메모리를 증가시키지 않는다.

## Validation Coverage
- unit:
  - `packages/grid-core/test/row-model.spec.ts`
  - 검증: 100M lazy identity, sparse override, materialize/release 반복, `setRowCount(100_000_000)` reset budget
- integration:
  - `packages/grid-core/test/grid.spec.ts`
  - 검증: sparse override가 materialized base 없이 동작
- e2e:
  - `scripts/run-e2e.mjs` Example14 시나리오
  - 검증: 초기 mount, jump bottom, restore state, sparse swap, materialize loop release
- bench:
  - `tests/fixtures/bench-100m.html`
  - `tests/fixtures/bench-100m.js`
  - `scripts/bench.mjs`
  - 검증: 100M mount/jump/restore 성능 및 identity memory 유지
