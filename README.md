# HGrid

엔터프라이즈 환경을 목표로 설계된 **DOM 기반 가상화 데이터 그리드**입니다.  
`Canvas/WebGL` 없이도 대용량 스크롤, pinned 컬럼, 수직/수평 가상화, 풀링 렌더를 안정적으로 제공하는 것을 목표로 합니다.

## 핵심 원칙

- DOM-only 렌더링 (core에 Canvas/OffscreenCanvas/WebGL 미사용)
- 스크롤 중 DOM 생성/삭제 금지 (row/cell pool 재사용)
- 이벤트 위임 + `requestAnimationFrame` 렌더 배치
- CSP 친화 (`eval`, `new Function`, `setTimeout("string")` 금지)
- 데이터/렌더 분리 아키텍처 (DataProvider, RowModel, Renderer 계약)

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
├─ scripts/             # 검증/생성/벤치 스크립트
└─ checklist.md         # 개발 체크리스트(단계별 진행 현황)
```

## 현재 진행 상태 (2026-03-04 기준)

- Phase 0: 저장소/툴체인/검증 스크립트 완료
- Phase 1: Public API / Column / DataProvider / RowModel 계약 완료
- Phase 2: AG-like 스크롤 셸 + 수직/수평 가상화 + Pooling + rAF scheduler 완료
- Phase 3+: 100M 스크롤 스케일링 및 상위 기능 진행 예정

상세 항목은 `checklist.md`를 기준으로 관리합니다.

## grid-core 산출물

`packages/grid-core/dist` 기준:

- `grid.umd.js`
- `grid.umd.min.js`
- `grid.esm.js`
- `index.d.ts`
- `grid.css`

UMD 전역 네임스페이스는 `HGrid`이며, 브라우저에서 `new HGrid.Grid(...)` 형태로 사용합니다.

## 빠른 시작

### 1) 설치

```bash
pnpm install
```

### 2) 빌드

```bash
pnpm build
```

### 3) 예제 규칙 검증

```bash
pnpm verify:examples
```

### 4) example1 실행

`examples/example1.html`을 브라우저에서 열면 UMD 기반 기본 동작을 확인할 수 있습니다.  
(빌드 후 `../packages/grid-core/dist/*` 경로를 사용)

## 사용 예시

### UMD (레거시 / script 태그)

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

const container = document.getElementById('grid') as HTMLElement;

const grid = new Grid(container, {
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

## 주요 스크립트

루트 `package.json` 기준:

- `pnpm build` : grid-core 빌드
- `pnpm typecheck` : 타입 검사
- `pnpm test` : unit test
- `pnpm test:e2e` : e2e 스모크
- `pnpm test:csp` : CSP 스모크
- `pnpm verify:examples` : examples/registry 규칙 검사
- `pnpm new:example` : 다음 번호 example 자동 생성 + registry 갱신
- `pnpm check:naming` : 파일/디렉토리 명명 규칙 검사
- `pnpm bench` : 성능 벤치 스크립트

## 예제 운영 규칙

기능 추가 시 다음을 반드시 같이 반영합니다.

1. `pnpm new:example`로 `examples/example{N}.html` 생성
2. `examples/registry.json` 반영 확인
3. `pnpm verify:examples` 통과

## 문서

- `checklist.md`: 전체 로드맵 및 완료 기준
- `docs/public-api-phase1.md`
- `docs/data-provider-phase1.md`
- `docs/row-model-phase1.md`
- `docs/dom-layout-phase2.md`
- `docs/vertical-virtualization-phase2.md`
- `docs/horizontal-virtualization-phase2.md`
- `docs/row-cell-pooling-phase2.md`
- `docs/render-scheduler-phase2.md`
- `docs/scroll-orchestration-phase2.md`

## 라이선스

내부 정책에 따릅니다. 외부 공개/배포 시 라이선스 파일과 상용 배포 정책을 함께 확정해야 합니다.
