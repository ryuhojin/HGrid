# HGrid

HGrid는 상용 엔터프라이즈 환경을 목표로 한 **DOM-only 가상화 데이터 그리드**입니다.  
`Canvas/WebGL/OffscreenCanvas` 없이 대용량(10M~100M) 스크롤, pinned 컬럼, 수직/수평 가상화, 풀링 렌더를 제공합니다.

## 프로젝트 상태 (2026-03-05)

- 완료: `Phase 0`, `Phase 1`, `Phase 2`, `Phase 3.1~3.5`, `Phase 4.1~4.3`
- 진행 예정: `Phase 4.2+` (selection/keyboard/editing/worker data ops 등)
- 상세 기준: `checklist.md`

구현 완료된 핵심 항목:

- 분리 스크롤 셸 (x/y native scroll source 분리 + sync lock)
- Vertical/Horizontal virtualization + binary search window
- Row/Cell pooling (스크롤 중 DOM create/remove 0 유지)
- rAF scheduler + dirty flags
- 100M scroll scaling (`MAX_SCROLL_PX` 기반 virtual/physical 매핑)
- RowModel 100M 메모리 최적화(lazy identity/sparse/materialized)
- Variable row height (`fixed | estimated | measured`) + row top map
- Event delegation/hit-test/wheel orchestration (Phase 4.1)
- Selection model ranges + `selectionChange` contract (Phase 4.2)
- Keyboard navigation (`arrows/page/home/end` + shift range) (Phase 4.3)

## 핵심 원칙

- DOM-only 렌더링
- 스크롤 핫패스에서 DOM churn 금지(풀 재사용)
- 이벤트 위임 + rAF 배치 렌더
- CSP 친화 (`eval`, `new Function`, `setTimeout("string")` 금지)
- 기본 셀 렌더는 `textContent` 사용

## Monorepo 구조

```text
.
├─ packages/
│  ├─ grid-core/        # 프레임워크 비의존 코어
│  ├─ grid-react/       # React 어댑터(얇은 wrapper)
│  ├─ grid-vue/         # Vue 어댑터(얇은 wrapper)
│  └─ grid-plugins/     # 플러그인 패키지 영역
├─ examples/            # example1~N 시나리오
├─ docs/                # phase별 설계/결정 문서
├─ scripts/             # 생성/검증/벤치 스크립트
└─ checklist.md         # 단계별 진행 체크리스트
```

## grid-core 배포 산출물

`packages/grid-core/dist`:

- `grid.umd.js` (ES5)
- `grid.umd.min.js`
- `grid.esm.js`
- `index.d.ts`
- `grid.css`

UMD 전역 네임스페이스는 `HGrid`이며, 브라우저에서 `new HGrid.Grid(...)`로 사용합니다.

## 빠른 시작

```bash
pnpm install
pnpm build
pnpm verify:examples
```

예제 실행:

1. `pnpm build`
2. 브라우저에서 `examples/example1.html` 열기

## 사용 예시

### UMD

```html
<link rel="stylesheet" href="../packages/grid-core/dist/grid.css" />
<div id="grid"></div>
<script src="../packages/grid-core/dist/grid.umd.js"></script>
<script>
  const grid = new HGrid.Grid(document.getElementById('grid'), {
    columns: [
      { id: 'id', header: 'ID', width: 100, type: 'number' },
      { id: 'name', header: 'Name', width: 220, type: 'text' }
    ],
    rowData: [
      { id: 1, name: 'Alpha' },
      { id: 2, name: 'Beta' }
    ],
    height: 420,
    rowHeight: 28,
    overscan: 8,
    overscanCols: 2
  });
</script>
```

### ESM/TypeScript

```ts
import { Grid } from '@hgrid/grid-core';
import '@hgrid/grid-core/grid.css';

const grid = new Grid(document.getElementById('grid') as HTMLElement, {
  columns: [
    { id: 'id', header: 'ID', width: 100, type: 'number' },
    { id: 'name', header: 'Name', width: 220, type: 'text' }
  ],
  rowData: [
    { id: 1, name: 'Alpha' },
    { id: 2, name: 'Beta' }
  ]
});
```

## 루트 스크립트

- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm test:csp`
- `pnpm verify:examples`
- `pnpm new:example`
- `pnpm check:naming`
- `pnpm bench`
- `pnpm ci:phase0`

## Examples (현재 1~18)

- `example1`: 기본 UMD 마운트
- `example2~5`: Public API / Column / DataProvider / RowModel
- `example6~12`: 분리 스크롤 layout/scroll/orchestration/virtualization/pooling/scheduler
- `example13`: 100M scroll scaling
- `example14`: RowModel memory optimization (100M)
- `example15`: variable row height
- `example16`: event delegation + hit-test + wheel orchestration
- `example17`: selection model ranges + 1M selection update smoke
- `example18`: keyboard navigation + shift range + edge jump

기능 추가 시 규칙:

1. `pnpm new:example`로 `example{N}.html` 생성
2. `examples/registry.json` 갱신 확인
3. `pnpm verify:examples` 통과

## 문서

- `checklist.md`
- `docs/build-and-sourcemap-policy.md`
- `docs/public-api-phase1.md`
- `docs/column-schema-phase1.md`
- `docs/data-provider-phase1.md`
- `docs/row-model-phase1.md`
- `docs/dom-layout-phase2.md`
- `docs/vertical-virtualization-phase2.md`
- `docs/horizontal-virtualization-phase2.md`
- `docs/row-cell-pooling-phase2.md`
- `docs/render-scheduler-phase2.md`
- `docs/scroll-orchestration-phase2.md`
- `docs/scroll-scaling-phase3.md`
- `docs/row-model-memory-phase3.md`
- `docs/variable-row-height-phase3.md`
- `docs/selection-model-phase4.md`
- `docs/keyboard-navigation-phase4.md`

## 라이선스

내부 정책에 따릅니다. 외부 배포 시 라이선스/상용 배포 정책을 별도 확정합니다.
