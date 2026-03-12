# Phase E2.1 - Server-Side Row Model Contract

## 목표
- `RemoteDataProvider`를 단순 block fetch 계약에서 `server-side row model` 계약으로 확장할 준비를 끝낸다.
- `partial/full store`, `query schema version`, `route`, `group/aggregate metadata`를 serializable contract로 고정한다.
- E2.2 이후 remote grouping / pivot / tree 구현이 같은 envelope 위에서 쌓이도록 만든다.

## 이번 단계에서 고정한 계약

### 1) server-side query envelope
- `RemoteQueryModel.serverSide?`를 추가했다.
- shape:
  - `schemaVersion: string`
  - `requestKind: "root" | "children" | "pivot" | "tree"`
  - `route: Array<{ columnId, key }>`
  - `rootStoreStrategy: "partial" | "full"`
  - `childStoreStrategy: "partial" | "full"`
- 의미:
  - query schema versioning
  - root/child store 전략
  - route 기반 child store fetch
  - request kind 분기
  를 같은 contract에서 표현한다.

### 2) response row metadata
- `RemoteBlockResponse.rowMetadata?`를 추가했다.
- row metadata shape:
  - `kind: "leaf" | "group" | "aggregate"`
  - `level?`
  - `childCount?`
  - `isExpandedByDefault?`
  - `groupColumnId?`
  - `groupKey?`
  - `route?`
  - `aggregateValues?`
- 의미:
  - child count
  - group expansion default
  - aggregate row payload
  - row route
  를 forward-compatible하게 담을 수 있다.

### 3) provider API
- `RemoteDataProvider`에 다음 메서드를 추가했다.
  - `setServerSideQueryModel(partialOrUndefined)`
  - `getServerSideQueryModel()`
  - `getRowMetadata(dataIndex)`
- `Grid`가 remote sort/filter/group/pivot query를 동기화할 때도 기존 `serverSide` envelope은 유지된다.

## 현재 효과
- `RemoteDataProvider.fetchBlock(request)`는 이제 sort/filter/group/pivot 외에도 `serverSide` envelope을 서버에 전달할 수 있다.
- response에서 내려온 row metadata는 provider block cache에 함께 저장되고, `getRowMetadata()`로 읽을 수 있다.
- E2.2에서 remote grouping/pivot/tree를 붙일 때 request/response format을 다시 깨지 않고 이어갈 수 있다.

## 아직 하지 않은 것
- remote grouping row를 실제로 group row DOM으로 렌더링하지는 않는다.
- remote pivot result matrix / remote tree row contract은 아직 E2.2 범위다.
- partial/full store의 실제 fetch scheduling 정책과 invalidation diff는 아직 E2.3 범위다.

## 검증
- unit:
  - `packages/grid-core/test/remote-data-provider.spec.ts`
    - server-side query envelope forwarding
    - row metadata storage
    - helper API update/clear
    - grid remote query sync 시 server-side envelope 보존
- example:
  - `examples/example55.html`

## 다음 단계
- E2.2에서 remote grouping row contract / pivot result contract / tree contract을 이 envelope 위에 확정한다.
- E2.3에서 store invalidation/query diff/background refresh 정책을 붙인다.
