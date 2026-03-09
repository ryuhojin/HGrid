# Phase 14.2 - Benchmark Scenarios

## 범위

`scripts/bench.mjs` + `tests/fixtures/bench-phase14.*` 기준으로 아래 시나리오를 자동 측정한다.

## 자동 시나리오

1. initial render
- 100k rows
- 1M rows

2. scroll FPS (1M)
- 조건: `rowHeight=24`, `overscan=10`
- 산출: `avgFps`, `frameTimeP95Ms`, `longTaskCount`, `longTaskRate`, `domNodeCountFixed`

3. 100M row model mapping
- `virtualHeight` 기반 점프 매핑 샘플(0/25/50/75/100%)
- `top -> bottom -> top` 왕복 드리프트 측정

4. sort 1M (UI freeze)
- `setSortModel()` 실행 중 UI gap(max gap ms) 측정

5. filter 1M (UI freeze)
- `setFilterModel()` 실행 중 UI gap(max gap ms) 측정

6. create/destroy 200
- 200회 반복 생성/파괴 스모크
- 잔존 `.hgrid`/row DOM, window listener add/remove 통계 기록

7. scroll regressions
- 고속 가로 왕복 10초 동안 header/body transform mismatch 카운트
- pinned 상태에서 wheel 5000회 입력 후 scroll source mismatch 카운트
- 스크롤바 가시성/overflow/rect 기록(`scrollbarRecord`)

## 14.3 게이트 기준 (적용값)

- 스크롤 long-task(`>50ms`) 발생률: `longTaskRate <= 0.03`
- 스크롤 프레임 타임: `frameTimeP95Ms < 20`
- DOM 노드 풀 고정: `domNodeCountFixed === true`  
  (`poolRowsMin == poolRowsMax`, `poolCellsMin == poolCellsMax`)

위 기준은 `scripts/bench.mjs`에서 assert gate로 강제된다.

## 실행

```bash
pnpm build
pnpm bench
```

결과 JSON 파일로 저장:

```bash
pnpm bench -- --out tests/fixtures/generated/bench-phase14-result.json
```

## OS 기록(운영 가이드)

`scrollbarRecord`는 실행 OS의 브라우저 스크롤 동작 정보를 포함한다.  
14.2의 "macOS/Windows 각 1종 기록"은 아래처럼 각 OS에서 1회씩 실행해 결과 파일 2개를 보관한다.

```bash
# macOS
pnpm bench -- --out tests/fixtures/generated/bench-phase14-macos.json

# Windows
pnpm bench -- --out tests/fixtures/generated/bench-phase14-windows.json
```
