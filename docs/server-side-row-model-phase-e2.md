# Phase E2 - Server-Side Row Model

## 목표
- `RemoteDataProvider`를 단순 block fetch 계약에서 `server-side row model` 계약으로 확장할 준비를 끝낸다.
- `partial/full store`, `query schema version`, `route`, `group/aggregate metadata`를 serializable contract로 고정한다.
- remote grouping / pivot / tree 구현이 같은 envelope 위에서 쌓이도록 만든다.

## E2.1에서 고정한 계약

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

## E2.1 효과
- `RemoteDataProvider.fetchBlock(request)`는 이제 sort/filter/group/pivot 외에도 `serverSide` envelope을 서버에 전달할 수 있다.
- response에서 내려온 row metadata는 provider block cache에 함께 저장되고, `getRowMetadata()`로 읽을 수 있다.
- remote grouping/pivot/tree를 붙일 때 request/response format을 다시 깨지 않고 이어갈 수 있다.

## E2.2에서 추가한 계약

### 1) remote grouping contract
- `RemoteQueryModel.serverSide.grouping?`를 추가했다.
- shape:
  - `expandedGroupKeys?: string[]`
  - `defaultExpanded?: boolean`
  - `aggregations?: Array<{ columnId, type? }>`
- `RemoteBlockResponse.rowMetadata`의 `kind: "group" | "aggregate" | "leaf"`와
  `groupColumnId`, `groupKey`, `aggregateValues`, `childCount`, `isExpanded`를 이용해
  remote provider 응답을 실제 group row view로 렌더링한다.

### 2) remote pivot result contract
- `RemoteBlockResponse.pivotResult?`를 추가했다.
- shape:
  - `columns?: ColumnDef[]`
- `RemoteDataProvider`는 `getPivotResult()` / `getPivotResultColumns()`를 제공한다.
- `Grid`는 remote + `pivoting.mode="server"`일 때 서버가 준 pivot result columns를 바로 렌더 컬럼으로 적용한다.

### 3) remote tree contract
- `RemoteQueryModel.serverSide.tree?`를 추가했다.
- shape:
  - `idField?`
  - `parentIdField?`
  - `hasChildrenField?`
  - `treeColumnId?`
  - `expandedNodeKeys?: Array<string | number>`
- `RemoteBlockResponse.rowMetadata`는 tree row에 대해 다음 필드를 담을 수 있다.
  - `treeNodeKey`
  - `treeParentNodeKey`
  - `treeDepth`
  - `treeHasChildren`
  - `treeExpanded`
  - `treeColumnId`
- `Grid`는 remote provider + `treeData.enabled=true` + `treeData.mode="server"` 조합에서
  local tree executor 대신 remote server tree view adapter를 사용한다.

### 4) 조합 정책
- remote grouping + remote pivot:
  - 동시 지원한다.
  - query는 `groupModel`, `pivotModel`, `pivotValues`, `serverSide.grouping`을 함께 전달한다.
  - row rendering은 grouping metadata를 기준으로 하고, 컬럼은 `pivotResult.columns`를 사용한다.
- remote tree + grouping/pivot:
  - 현재는 tree가 우선이다.
  - `requestKind`는 `tree`가 되고, `groupModel`/`pivotModel`/`pivotValues` server query는 제외한다.
  - 이유: 현재 구조에서는 remote tree와 server grouping/pivot을 같은 request cycle에 동시에 설명하지 않는다.
- remote expand/collapse-all:
  - visible row toggle은 지원한다.
  - 전체 서버 keyspace를 모르는 상태의 global expand-all/collapse-all은 완전한 엔터프라이즈 store 정책으로는 아직 미완성이다.

## 현재 효과
- remote grouping row metadata가 group row DOM 계약으로 바로 연결된다.
- remote pivot result columns가 renderer column model로 바로 반영된다.
- remote tree metadata가 tree row DOM 계약으로 바로 연결된다.
- remote + grouping + pivot, remote + tree를 같은 `serverSide` envelope 위에서 설명할 수 있다.

## E2.3에서 추가한 운영 계약

### 1) query diff policy
- `RemoteDataProvider`는 `setQueryModel()`에서 마지막 query change를 분류한다.
- shape:
  - `scope: "none" | "sort" | "filter" | "group" | "pivot" | "serverSide" | "mixed"`
  - `changedKeys`
  - `invalidationPolicy: "none" | "full"`
- 현재 정책은 데이터 정렬/필터/그룹/피벗/server-side envelope이 바뀌면 full invalidation이다.

### 2) targeted cache invalidation / refresh / retry
- `invalidateBlocks(range?)`
  - 지정 block range만 cache에서 제거한다.
- `refreshBlocks({ startIndex?, endIndex?, blockIndexes?, background? })`
  - 지정 block만 다시 fetch한다.
  - `background: true`이면 stale row를 유지한 채 `refreshing` 상태로 갱신한다.
- `retryFailedBlocks(range?)`
  - `error` 상태 block만 다시 요청한다.

### 3) runtime block state contract
- `RemoteBlockState`를 추가했다.
- shape:
  - `blockIndex`
  - `startIndex`
  - `endIndex`
  - `status: "loading" | "ready" | "refreshing" | "error"`
  - `hasData`
  - `errorMessage`
- `RemoteDataProvider.getBlockStates()`와 `getDebugState()`는 이 상태를 반환한다.
- 의미:
  - overlay/status bar/debug panel이 loading/error/retry/background refresh를 같은 모델로 해석할 수 있다.

## 현재 효과
- query change가 어떤 이유로 cache를 날렸는지 설명 가능하다.
- 특정 range만 invalidate/refresh/retry 할 수 있다.
- background refresh 동안 stale row를 유지하면서 runtime 상태는 `refreshing`으로 노출된다.
- retry는 실패 block만 다시 요청하는 명시적 경로를 가진다.

## E2.4에서 추가한 서버모드 편집 계약

### 1) server-side edit policy
- 편집 UX는 client mode와 같게 유지한다.
  - 셀 편집 시작/커밋/즉시 화면 반영은 동일하다.
- 차이는 `RemoteDataProvider` 내부 상태다.
  - client mode는 원본 row 수정으로 끝난다.
  - server mode는 loaded cache row를 즉시 갱신하면서도, 별도 pending change store를 유지한다.

### 2) pending change model
- `RemoteDataProvider`는 rowKey 기준으로 pending row change를 저장한다.
- public type:
  - `RemotePendingCellChange`: `{ columnId, originalValue, value }`
  - `RemotePendingRowChange`: `{ rowKey, changes[] }`
  - `RemotePendingChangeSummary`: `{ rowCount, cellCount, rowKeys }`
- public API:
  - `hasPendingChanges()`
  - `getPendingChanges()`
  - `getPendingChangeSummary()`
  - `acceptPendingChanges({ rowKeys? })`
  - `discardPendingChanges({ rowKeys? })`
  - `revertPendingChange(rowKey, columnId?)`

### 3) editability policy
- leaf row는 편집 가능하다.
- remote grouping `kind: "group" | "aggregate"` row는 편집하지 않는다.
- remote tree는 metadata가 `leaf`인 row만 편집한다.
- 의미:
  - group/aggregate row는 summary row로 보고, 실제 저장 대상은 leaf row만 허용한다.

### 4) cache eviction / refetch merge
- pending change는 cache block에만 붙어 있지 않고 provider-level store에 유지된다.
- 그래서:
  - block eviction 후 재로딩
  - `invalidateBlocks()`
  - `refreshBlocks()`
  - query 변경 후 refetch
  에서도 같은 rowKey가 다시 오면 pending value를 row에 재적용한다.

### 5) save / rollback policy
- save 버튼을 누르는 앱 코드는 `getPendingChanges()` payload를 서버로 보낸다.
- save success:
  - 앱이 서버 반영을 끝낸 뒤 `acceptPendingChanges()`를 호출한다.
  - 필요하면 해당 block range를 `invalidateBlocks()` 또는 `refreshBlocks()`로 다시 읽는다.
- save failure:
  - provider는 pending change를 그대로 유지한다.
  - 앱은 `discardPendingChanges()` 또는 `revertPendingChange()`를 호출해 롤백할 수 있다.
- conflict 표시:
  - E2.4에서는 데이터 계약과 rollback policy만 고정한다.
  - 시각적인 conflict badge / dirty badge / toolbar UX는 E3 product surface 범위다.

## 아직 하지 않은 것
- partial/full store의 실제 fetch scheduling과 store hierarchy 자체는 아직 더 필요하다.
- remote global expand-all/collapse-all을 server keyspace 전체 기준으로 완성하지는 않았다.
- save transport 자체(`saveChanges()` 같은 grid-owned network hook)는 아직 없다.
- save conflict 표시 UI와 batch toolbar UX는 아직 없다.

## 검증
- unit:
  - `packages/grid-core/test/remote-data-provider.spec.ts`
    - server-side query envelope forwarding
    - row metadata storage
    - helper API update/clear
    - grid remote query sync 시 server-side envelope 보존
    - remote grouping row render
    - remote tree row render + expanded node query sync
    - remote pivot result column apply
    - targeted block invalidation
    - query diff summary
    - background refresh stale-data 유지
    - failed block retry
- example:
  - `examples/example55.html`
  - `examples/example56.html`
  - `examples/example57.html`
  - `examples/example58.html`
  - `examples/example59.html`
  - `examples/example60.html`
  - `examples/example61.html`

## E2.5 예제 세트
- `example55`: fake server SSRM envelope / sort / filter / route / metadata smoke
- `example56`: grouping + pivot + tree contract combination smoke
- `example57`: query diff / targeted invalidate / background refresh / retry smoke
- `example58`: server-mode pending change / save-discard smoke
- `example59`: dedicated server grouping example
- `example60`: dedicated server pivot example
- `example61`: dedicated server tree example

## 다음 단계
- E2는 현재 예제 세트까지 마감했고, 이후 E3에서 dirty badge / save-discard UI surface와 제품형 서버 편집 UX를 올린다.
