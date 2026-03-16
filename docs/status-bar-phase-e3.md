# Phase E3.4 - Status Bar / Summary UX

## 목표
- footer status bar에서 selection/aggregate/rows/remote sync 상태를 바로 읽을 수 있게 한다.
- grid layout과 같은 톤의 product footer로 정리하고, side bar가 열려 있어도 width 계산이 깨지지 않게 한다.

## 공개 옵션
- `statusBar.enabled?: boolean`
- `statusBar.items?: Array<"selection" | "aggregates" | "rows" | "remote">`
- `statusBar.customItems?: Array<{ id, align?, render(context) }>`

기본 정책:
- `enabled` 기본값은 `false`
- `items`를 생략하면 `selection`, `aggregates`, `rows`, `remote` 뒤에 custom item을 선언 순서대로 붙인다.

## 현재 구현 범위
- `selection`
  - cell range면 `N cells selected`
  - indicator row selection이면 `N rows selected`
- `aggregates`
  - 선택 범위의 numeric column만 대상으로 `sum/avg/min/max`
  - system utility column은 제외
  - `aggregateAsyncThreshold`를 넘는 큰 selection은 chunked async 계산으로 내려가고, 진행 중에는 `Calculating {percent}%`를 표시한다.
- `rows`
  - `Visible N`
  - current view row count와 source row count가 다르면 `Filtered X / Y`
  - 같으면 `Rows X`
  - remote query 결과는 provider `rowCount` 자체가 현재 query total이므로 보통 `Rows X`로 보인다
- `remote`
  - `Remote synced`
  - `Loading N`
  - `Refreshing N`
  - `Errors N`
  - `Pending R rows / C cells`
- `custom`
  - `render({ state }) => string | { text, tone?, align? }`
  - state는 `selection`, `aggregates`, `rows`, `remote`, `filterModel`, `advancedFilterModel`, `columnLayout`, `visibleColumnCount`, `totalColumnCount`를 제공한다.

## 구현 메모
- renderer footer는 `.hgrid__status-bar`로 추가했다.
- footer width는 `calc(100% - var(--hgrid-side-bar-space-right))`로 side bar dock과 같이 줄어든다.
- visible row count는 overscan pool이 아니라 actual viewport row range 기준으로 계산한다.
- remote summary는:
  - `RemoteDataProvider`
  - `RemoteServerSideViewDataProvider -> getSourceDataProvider()`
  경로 둘 다 지원한다.
- custom item은 text-only surface로 렌더해서 HTML injection 없이 status bar 확장을 허용한다.
- large selection aggregate는 worker까지는 쓰지 않고, status bar 전용 chunked async 계산으로 메인 스레드 long task를 줄인다.

## 예제
- [example70.html](../examples/example70.html)
  - selection/aggregate
  - set filter
  - remote refresh/invalidate/sync
  - pending edit
- [example79.html](../examples/example79.html)
  - custom filter count
  - visible column count
  - columns panel preset apply와 연동
- [example82.html](../examples/example82.html)
  - large selection aggregate async
  - `Calculating...` progress -> final summary

## 알려진 후속 범위
- worker-backed selection aggregate나 page-scale background stats는 아직 없다.
- dirty badge/save button 같은 editing UX는 E4/E5 성격이다.
