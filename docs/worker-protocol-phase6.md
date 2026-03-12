# Phase 6.1 Worker Protocol

## Goal
- sort/filter 연산을 Worker 우선 구조로 분리할 때, 메인 스레드와 Worker 간 메시지 계약을 고정한다.
- 취소(`cancel`) 및 대용량 배열 transfer(transferable) 규칙을 표준화한다.

## Message Envelope
### Request
- operation request:
```ts
{ opId: string, type: string, payload: unknown }
```
- cancel request:
```ts
{ opId: string, type: "cancel" }
```

### Response
```ts
{ opId: string, status: "ok" | "canceled" | "error", result: unknown }
```

## Contract Rules
- `opId`
  - 메인 스레드가 생성한 operation 식별자다.
  - Worker 응답은 반드시 요청과 동일한 `opId`를 반환한다.
- `type`
  - `"cancel"`은 제어 메시지다.
  - 그 외 문자열은 operation 종류(`sort`, `filter`, `group`, `pivot`, `tree`)를 나타낸다.
- `status`
  - `ok`: 정상 완료, `result`는 연산 결과
  - `canceled`: 취소 완료, `result`는 `null`
  - `error`: 실패, `result.message` 필수

## Cancellation Semantics
- 메인 스레드는 동일 `opId`로 `{opId, type:"cancel"}`를 보낸다.
- Worker는 연산 루프 내 취소 플래그를 확인하고 가능한 빠르게 중단한다.
- 중단 시 `{opId, status:"canceled", result:null}`를 반환한다.
- 취소 응답 이후 동일 `opId`에 대한 추가 `ok/error` 응답은 무시한다.

## Transferable Policy
- 대용량 인덱스 결과(`Int32Array`, `Float64Array`)는 가능한 한 복사 대신 transfer를 사용한다.
- 기본 정책:
  - request: `payload` 내부의 transferable 자동 탐지
  - response: `result` 내부의 transferable 자동 탐지
- 현재 자동 탐지 대상:
  - `ArrayBuffer`
  - typed array view의 `buffer`
  - `MessagePort`
- 중복 buffer는 dedupe한다.

## Implemented Utilities (`data/worker-protocol.ts`)
- envelope 생성
  - `createWorkerRequest`
  - `createWorkerCancelRequest`
  - `createWorkerOkResponse`
  - `createWorkerCanceledResponse`
  - `createWorkerErrorResponse`
- 타입 가드
  - `isWorkerRequestMessage`
  - `isWorkerResponseMessage`
- transferable 처리
  - `collectTransferables`
  - `resolveWorkerTransferables`
  - `postWorkerMessage`

## Entrypoint Layer (`data/worker-entry.ts`, `data/*.worker.ts`)
- 공통 worker entry helper
  - `createWorkerEntrypointListener`
  - `registerWorkerEntrypoint`
- 실제 worker files
  - `sort.worker.ts`
  - `filter.worker.ts`
  - `group.worker.ts`
  - `pivot.worker.ts`
  - `tree.worker.ts`
- payload adapter
  - `worker-operation-payloads.ts`
  - serializable snapshot rows를 `LocalDataProvider` 기반 executor request로 변환

## Validation
- unit: `packages/grid-core/test/worker-protocol.spec.ts`
  - request/cancel/response envelope validation
  - type guard validation
  - nested typed-array transferable 수집 + dedupe
  - auto-detect + explicit transfer merge/post 동작
- unit: `packages/grid-core/test/worker-entry.spec.ts`
  - unsupported operation error
  - cancel 이후 stale `ok`를 `canceled`로 치환하는 guard
- unit: `packages/grid-core/test/worker-entrypoints.spec.ts`
  - sort/filter/group/pivot/tree worker wiring 검증
- example: `examples/example20.html`
  - protocol envelope + cancel + transferables 시각화
