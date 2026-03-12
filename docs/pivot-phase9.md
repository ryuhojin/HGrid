# Phase 9.3 - Pivot

## 목표
- pivot 구성 모델(`pivotModel`, `values`)을 core 계약으로 확정한다.
- 서버 우선 pivot 경로를 제공한다.
- 로컬 pivot도 코어 executor로 동작하게 한다.

## 구현 범위
- `packages/grid-core/src/core/grid-options.ts`
  - pivot 타입/옵션 계약 추가:
    - `PivotModelItem`
    - `PivotValueDef`
    - `PivotingOptions`
    - `PivotingMode`

- `packages/grid-core/src/core/grid.ts`
  - pivot 상태:
    - `pivotModel`
    - `pivotValues`
    - `pivotingMode`
  - pivot API:
    - `getPivotModel()` / `setPivotModel()` / `clearPivotModel()`
    - `getPivotValues()` / `setPivotValues()`
    - `getPivotingMode()` / `setPivotingMode()`
  - remote provider + `pivoting.mode="server"`일 때:
    - `queryModel.pivotModel`
    - `queryModel.pivotValues`
    서버 전달
  - local provider + pivot 설정 시:
    - `groupModel(row axis)` + `pivotModel(column axis)` + `pivotValues` 기준으로 피벗 계산
    - 동적 컬럼을 생성해 렌더러에 반영

- `packages/grid-core/src/data/pivot-executor.ts`
  - row group + pivot key 조합 집계
  - 동적 컬럼 생성(가로 pivot matrix)
  - cooperative yield/cancel (Worker 호환 메시지 계약)

- `packages/grid-core/src/data/remote-data-provider.ts`
  - `RemoteQueryModel` 확장:
    - `pivotModel?: PivotModelItem[]`
    - `pivotValues?: PivotValueDef[]`
  - query clone/equality 비교/캐시 무효화 경로를 pivot 필드까지 확장

## 서버/로컬 정책
- remote provider + `pivoting.mode = "server"`:
  - Grid는 pivot 모델을 서버 query로 전달한다.
  - 실제 pivot 계산은 서버가 담당한다.
- local provider + `pivoting.mode = "client"`:
  - 코어의 pivot executor가 로컬 집계를 수행한다.
  - cancel/yield 지원으로 UI 프리즈를 완화한다.

## 검증
- unit:
  - `packages/grid-core/test/pivot-executor.spec.ts`
  - `packages/grid-core/test/grid.spec.ts` (remote pivot query 전달)
  - `packages/grid-core/test/remote-data-provider.spec.ts` (pivot query cache invalidate/forward)
- example/e2e:
  - `examples/example33.html`
  - `scripts/run-e2e.mjs` Example33

## 성능 스모크
- `scripts/run-e2e.mjs`는 `__example33.runPerfScenario` 동안 heartbeat(`setInterval(16ms)`) `maxGap`을 측정한다.
- 현재 smoke 기준은 `maxGap < 420ms`다.
