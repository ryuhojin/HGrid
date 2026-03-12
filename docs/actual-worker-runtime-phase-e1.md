# Phase E1 - Actual Worker Runtime

## E1.1 Worker Entrypoints
### 이번 단계에서 추가한 파일
- worker entrypoint
  - `packages/grid-core/src/data/sort.worker.ts`
  - `packages/grid-core/src/data/filter.worker.ts`
  - `packages/grid-core/src/data/group.worker.ts`
  - `packages/grid-core/src/data/pivot.worker.ts`
  - `packages/grid-core/src/data/tree.worker.ts`
- 공통 entry helper
  - `packages/grid-core/src/data/worker-entry.ts`
- serializable payload adapter
  - `packages/grid-core/src/data/worker-operation-payloads.ts`

### 이번 단계에서 고정한 계약
#### 1) Worker별 독립 엔트리포인트
- 각 연산은 자기 전용 `.worker.ts` 파일을 가진다.
- worker 파일은 공통 entry helper를 통해 `message`를 구독하고, matching operation만 처리한다.

#### 2) Cancellation / unsupported operation guard
- `{ opId, type: "cancel" }` 수신 시 in-flight operation의 cancellation flag를 올린다.
- handler가 stale `ok`를 반환해도, worker entry layer에서 `canceled` 응답으로 덮어쓴다.
- 잘못된 operation type은 `WORKER_UNSUPPORTED_OPERATION` 에러로 응답한다.

#### 3) Serializable payload adapter
- 실제 Worker에서는 `DataProvider`, `valueGetter`, custom reducer, `loadChildren` 같은 함수 기반 객체를 그대로 전달할 수 없다.
- 그래서 worker payload는 `rows`, `columns`, model state만 포함하는 serializable snapshot을 사용한다.
- worker 내부에서는 snapshot rows로 `LocalDataProvider`를 재구성해 기존 cooperative executor를 재사용한다.

### 현재 제약
- 아직 `Grid`는 `new Worker(...)`나 dispatcher/pool을 사용하지 않는다.
- 따라서 실제 background compute는 아직 연결되지 않았다.
- 현재 worker payload는 함수 기반 column/custom reducer/tree loader를 지원하지 않는다.
  - `valueGetter`, `comparator`, `GroupAggregationDef.reducer`, `PivotValueDef.reducer`, `TreeDataOptions.loadChildren`
  - 이 부분은 E1.2 dispatcher와 E1.3 offload policy에서 fallback 정책으로 정리해야 한다.

### 현재 효과
- 실제 Worker 런타임이 붙을 수 있는 파일 경로와 message contract가 생겼다.
- sort/filter/group/pivot/tree 모두 같은 cancellation/response 규칙을 공유한다.
- E1.2에서 main-thread dispatcher를 붙일 때 worker 측 코드를 다시 설계할 필요가 없도록 경계를 먼저 고정했다.

### 검증
- 신규 unit:
  - `packages/grid-core/test/worker-entry.spec.ts`
  - `packages/grid-core/test/worker-entrypoints.spec.ts`
- 회귀:
  - `pnpm --filter @hgrid/grid-core typecheck`
  - `pnpm --filter @hgrid/grid-core test`

### 다음 단계
- `E1.2`에서 worker pool 또는 operation dispatcher를 설계한다.
- `Grid`의 sort/filter/group/pivot/tree 실행 경로를 worker-first dispatcher로 연결한다.
- unsupported callback 기반 옵션의 fallback 기준을 문서화한다.

## E1.2 Main-thread Dispatcher Wiring
### 이번 단계에서 추가한 파일
- dispatcher
  - `packages/grid-core/src/data/worker-operation-dispatcher.ts`
- serializer / fallback policy
  - `packages/grid-core/src/data/worker-operation-payloads.ts`

### 이번 단계에서 연결한 지점
- `packages/grid-core/src/core/grid.ts`
  - `Grid`는 이제 `Cooperative*Executor`를 직접 들지 않고, operation별 `WorkerOperationDispatcher`를 통해 실행한다.
- `packages/grid-core/src/core/grid-options.ts`
  - `workerRuntime` 공개 옵션을 추가했다.
- `packages/grid-core/rollup.config.mjs`
  - `sort/filter/group/pivot/tree` worker를 각각 `dist/*.worker.js`로 빌드한다.

### Dispatcher 계약
#### 1) runtime option
- `workerRuntime.enabled`
  - worker runtime 강제 off 여부를 제어한다. 기본값은 `true`다.
- `workerRuntime.assetBaseUrl`
  - `dist/sort.worker.js` 같은 기본 경로를 조합할 base URL
- `workerRuntime.assetUrls`
  - operation별 명시 URL override
- `workerRuntime.timeoutMs`
  - worker timeout 기준
- `workerRuntime.largeDataThreshold`
  - worker-first 정책이 적용되는 rowCount 기준. 기본값은 `100_000`
- `workerRuntime.fallbackPolicy`
  - `lowVolumeOnly` 또는 `allowAlways`
- `workerRuntime.prewarm`
  - `true`면 grid 생성 또는 workerRuntime 갱신 시 sort/filter/group/pivot/tree worker를 미리 생성한다.
- `workerRuntime.poolSize`
  - operation별 worker slot 수. `2` 이상이면 pending operation을 분산하고 slot 단위 crash를 격리한다.

#### 2) fallback policy
- 아래 경우는 cooperative executor로 fallback한다.
  - `Worker` 미지원 환경
  - asset URL 미설정
  - serializer가 request를 snapshot payload로 만들 수 없는 경우
  - worker 생성 실패
- 현재 serializer fallback 대상:
  - sort + custom `comparator`
  - 일부 dynamic callback cost가 큰 `valueGetter` 시나리오

#### 3) cancellation / timeout / stale response guard
- `opId` 단위 pending map을 유지한다.
- `context.isCanceled()`가 true가 되면 `{ opId, type: "cancel" }`를 worker로 보낸다.
- timeout 시 `WORKER_TIMEOUT` 에러 응답으로 resolve하고, 늦게 도착한 응답은 무시한다.
- worker error/crash 시 pending operations를 `WORKER_RUNTIME_ERROR`로 정리한다.

#### 4) transferable 최적화
- dispatcher는 request 전송 시 `postWorkerMessage()`를 사용한다.
- 따라서 `sourceOrder` 같은 `Int32Array` payload는 자동으로 transferable buffer가 감지된다.

### 현재 효과
- `Grid`에서 worker runtime이 실제로 동작한다.
- sort/filter/group/pivot/tree 각각 별도 worker asset을 사용한다.
- callback 기반 enterprise 옵션이 섞인 경우는 기능을 깨뜨리지 않고 main-thread executor로 자동 fallback한다.

### 현재 제약
- 아직 worker pool은 없다. operation type별 single worker reuse 수준이다.
- `100k+ 기본 Worker` 정책과 explicit fallback 정책은 아직 넣지 않았다.
- benchmark와 e2e는 worker-first 정책까지는 아직 반영되지 않았다.

### 검증
- 신규 unit:
  - `packages/grid-core/test/worker-operation-dispatcher.spec.ts`
  - `packages/grid-core/test/worker-operation-payloads.spec.ts`
  - `packages/grid-core/test/grid-worker-runtime.spec.ts`
- example:
  - `examples/example44.html`
- 회귀:
  - `pnpm --filter @hgrid/grid-core typecheck`
  - `pnpm --filter @hgrid/grid-core test`
  - `pnpm --filter @hgrid/grid-core build`

### 다음 단계
- `E1.3`에서 대용량 offload policy를 고정한다.
- `100k+ default worker`, callback 옵션 fallback 기준, worker on/off bench를 문서와 코드에 일치시킨다.

## E1.3 Large-data Worker Policy
### 이번 단계에서 고정한 정책
#### 1) 100k+ default worker
- `workerRuntime.largeDataThreshold` 기본값은 `100_000`이다.
- `rowCount >= 100_000`이면 sort/filter/group/pivot/tree는 기본적으로 worker를 요구한다.
- `rowCount < 100_000`이면 cooperative executor가 기본 경로다.

#### 2) explicit fallback only
- 기본 `fallbackPolicy`는 `lowVolumeOnly`다.
- 즉, 대용량 연산에서 worker asset / worker 지원 / serializer 조건이 만족되지 않으면 자동 main-thread fallback을 하지 않는다.
- 이 경우 에러 코드를 반환한다.
  - `WORKER_ASSET_URL_REQUIRED`
  - `WORKER_ENVIRONMENT_UNSUPPORTED`
  - `WORKER_SERIALIZATION_UNSUPPORTED`
  - `WORKER_CREATE_FAILED`
- main-thread fallback을 대용량에서도 허용하려면 `fallbackPolicy: "allowAlways"`를 명시해야 한다.
- worker runtime 전체를 끄는 것도 `enabled: false`라는 명시 옵션으로만 허용된다.

#### 3) default asset resolution
- `workerRuntime.assetUrls`가 있으면 operation별 URL을 우선 사용한다.
- 없으면 `workerRuntime.assetBaseUrl`을 사용한다.
- 그것도 없으면 브라우저의 `<script src=".../grid.umd.js">` 또는 `grid.esm.js` 경로에서 worker base URL을 추론한다.

### 현재 효과
- UMD dist를 함께 배포하는 기본 사용 경로에서는 100k+ 연산이 별도 설정 없이 worker-first로 동작할 수 있다.
- callback-heavy path는 조용히 main-thread로 내려가지 않고, 저용량이거나 명시 fallback일 때만 cooperative executor를 허용한다.
- 제품 설명 기준으로 “worker dispatcher가 있다” 수준이 아니라 “대용량에서는 worker를 기본으로 요구한다” 수준까지 올라왔다.

### 남은 제약
- custom comparator sort도 numeric rank projection으로 worker path를 탈 수 있지만, comparator callback 실행과 rank 생성 비용은 메인 스레드에 남아 있다.
- worker pool은 들어갔지만, browser smoke 기준 prewarm visibility와 scheduling 효과는 operation 패턴에 따라 다르게 보일 수 있다.
- `valueGetter` 자체는 projected columnar path로 보낼 수 있지만 callback 평가 비용은 메인 스레드에 남아 있다.
- 아직 large-data snapshot / hydration 일부는 메인 스레드에서 비싸다.
- E2E/bench comparison과 crash recovery는 다음 단계 범위다.

### 검증
- 신규/확장 unit:
  - `packages/grid-core/test/worker-operation-dispatcher.spec.ts`
  - `packages/grid-core/test/worker-operation-payloads.spec.ts`
  - `packages/grid-core/test/grid-worker-runtime.spec.ts`
- example:
  - `examples/example45.html`

### 다음 단계
- `E1.4`에서 worker e2e, cancel race, crash/retry, worker on/off bench를 추가한다.

## E1.4 Verification and Recovery
### 이번 단계에서 보강한 지점
#### 1) cancel race guard
- dispatcher는 이제 cancel 요청 이후 늦게 도착한 worker `ok` 응답을 그대로 성공 처리하지 않는다.
- `pending.cancelRequested === true` 상태에서 `status: "ok"`가 오면 `canceled`로 강제 정규화한다.

#### 2) crash recovery policy
- worker crash 시 in-flight operations는 `WORKER_RUNTIME_ERROR`로 정리한다.
- 그 다음 operation에서 dispatcher는 worker를 새로 생성해 재시도할 수 있다.
- 즉, 자동 replay는 아니지만 `next-operation recreate` 정책은 생겼다.

#### 3) dedicated worker e2e
- `scripts/run-e2e.mjs`에 worker dist asset 존재 확인을 추가했다.
- `example44`는 실제 worker offload가 일어나도록 threshold를 낮추고, sort/filter/group/pivot/tree smoke를 e2e에 포함했다.
- `example45`는 worker policy, comparator projection path, explicit fallback, main-thread path를 e2e에 포함했다.
- `example46`은 cold grid와 prewarmed grid를 재생성하면서 first-offload 전에 worker가 준비되는지 확인한다.
- `example47`은 custom group reducer가 worker structure + main-thread hydration 경로로 동작하는지 확인한다.
- `example48`은 custom pivot reducer가 worker structure + main-thread hydration 경로로 동작하는지 확인한다.
- `example49`는 `valueGetter` derived column sort/filter가 full-row snapshot 없이 projected worker payload로 동작하는지 확인한다.
- `example50`은 custom comparator sort가 serialization error 없이 projected worker payload로 동작하는지 확인한다.
- `example51`은 `poolSize + prewarm` 설정과 병렬 sort queue에서 추가 sort worker slot이 잡히는지 확인한다.
- `example52`는 repeated `valueGetter`/comparator worker request가 projection cache를 재사용하고, row replacement 후 cache가 무효화되는지 확인한다.
- `example53`은 hidden derived target만 필요할 때 trailing derived getter를 평가하지 않고, 필요한 derived prefix만 계산하는지 확인한다.
- `example54`는 120k+ hidden derived column sort/filter에서 async payload serialization 동안 heartbeat와 worker message flow가 유지되는지 확인한다.
- 기존 worker-first examples(`example21`~`example23`, `example31`~`example33`)도 explicit `workerRuntime` 설정으로 정리했다.

#### 4) bench on/off comparison
- `tests/fixtures/bench-phase14.js`는 이제 기존 phase14 gate와 별도로 `workerComparison1m` 결과를 기록한다.
- `sort1m`, `filter1m`는 기존 cooperative baseline gate를 유지한다.
- `workerComparison1m.sort/filter.workerOn`은 실제 worker 생성 여부와 max gap을 기록한다.
- sort/filter/group/pivot는 full row snapshot 대신 필요한 컬럼 배열만 보내는 low-overhead columnar payload fast path를 사용한다.
- tree는 `id/parentId/hasChildren`만 보내는 compact key-field payload fast path를 사용한다.

### 현재 측정 결과
- `2026-03-12` 기준 `pnpm bench`에서 `workerComparison1m`은 sort/filter 모두 actual worker 생성(`workerCreatedCount = 1`)을 확인했다.
- 최신 1M 비교 수치는 다음과 같다.
  - sort worker-on: `115.7ms`
  - sort worker-off: `123.9ms`
  - sort delta: `-8.2ms`
  - filter worker-on: `157.9ms`
  - filter worker-off: `70.1ms`
  - filter delta: `+87.8ms`
- 즉, sort는 worker path가 cooperative baseline과 사실상 동급까지 내려왔고, filter는 아직 baseline보다 높지만 제품 gate(`1000ms`) 안에 들어온다.

### 현재 결론
- E1.4의 검증 항목뿐 아니라 E1 전체 수용 기준도 현재 기준으로 닫는다.
- actual worker runtime은 이제 “연결 예정”이 아니라 실제 제품 동작 경로다.
  - dedicated `.worker.ts`
  - dispatcher / `operationId` / cancel / timeout / stale response guard
  - dist worker asset / default asset resolution
  - `100k+` default worker policy
  - `poolSize`, optional prewarm
  - sort/filter/group/pivot/tree low-overhead payload path
  - group/pivot custom reducer hydration
  - `valueGetter` / comparator projected worker path
  - projection cache / selective prefix evaluation
  - dedicated e2e / crash-recovery / on-off bench
- group/pivot/tree smoke도 tighter gate 안으로 들어와 worker path의 coarse regression risk는 낮아졌다.
- 따라서 E1은 마감하고, 남은 성능 이슈는 “phase blocker”가 아니라 지속 튜닝/회귀 관리 항목으로 본다.

### 남은 제약
- first-hit comparator / `valueGetter` callback 실행 자체는 여전히 main thread 비용이다.
- filter worker path는 최신 수치상 `157.9ms`로 cooperative baseline(`70.1ms`)보다 높다.
- async payload serialization은 payload build stop-the-world를 줄이지만, worker 결과 반영과 flat view apply/refresh는 별도 main-thread 비용을 가진다.
- tree lazy children batch는 structure-only payload와 cached ref hydration으로 줄였지만, 최종 row hydration은 main thread에 남는다.
- `poolSize`는 slot 분산과 crash isolation 수준까지 닫았고, throughput/latency 튜닝은 후속 영역이다.

### 다음 단계
- E2로 넘어가고, E1의 남은 성능 항목은 E9 bench/regression 관리 대상으로 유지한다.
- 후속 튜닝이 필요하면 filter flat-view apply/refresh와 callback-heavy first-hit 비용을 우선 본다.
