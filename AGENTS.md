## Enterprise DOM Virtualized Data Grid(HGrid) — Agent Rules

> 목적: 이 저장소는 “상용 엔터프라이즈급 웹 데이터 그리드”를 만든다.
> 최우선: 성능(대용량 스크롤/렌더 안정) > 유지보수성 > 호환성(레거시+React/Vue) > 보안(CSP) > 접근성(A11y) > 기능 확장성(플러그인)

---

# 0) 절대 원칙 (Hard Constraints)
아래 항목은 어떤 이유로도 깨지면 안 된다.

1. 렌더러는 **DOM-only**다. **Canvas/OffscreenCanvas/WebGL**을 core에 추가하지 않는다.
2. DOM 노드 수는 **rowCount/colCount와 무관하게**, “뷰포트 기준 상수”로 유지해야 한다.
   - 스크롤 중 **DOM 생성/삭제 금지**(풀링 재사용만 허용).
3. 정렬/필터/그룹/피벗/집계 같은 무거운 연산은:
   - **인덱스 기반(RowModel의 order 배열)**
   - **대용량에서 Worker 실행 가능 구조**(메인 스레드 블로킹 금지)
4. 레거시 JS 지원을 위해 `grid-core`는:
   - UMD(ES5) 산출물 제공 필수
   - 런타임에서 `eval`, `new Function` 금지 (CSP)
5. 기능 추가(PR)마다 반드시:
   - `examples/example{N}.html` 1개 이상 추가
   - `examples/registry.json` 업데이트
   - `pnpm verify:examples` 통과

---

# 1) 레포/패키지 경계 (Architecture Boundaries)
## 1.1 패키지 구조 (MUST)
- `packages/grid-core`: 프레임워크 비의존 코어 (렌더/가상화/데이터/이벤트/테마/접근성)
- `packages/grid-react`: React 어댑터(얇은 wrapper). core 내부를 침범 금지.
- `packages/grid-vue`: Vue 어댑터(얇은 wrapper). core 내부를 침범 금지.
- `packages/grid-plugins/*`: 플러그인 모음(엑셀/클립보드/그룹/피벗/차트/보안 등)

## 1.2 의존성 규칙 (MUST)
- `grid-core`는 원칙적으로 “무의존성(0 deps)”에 가깝게 유지.
- 새 의존성 추가는 다음 조건을 모두 만족해야 한다:
  1) 대체 불가, 2) 번들 사이즈/성능 영향 분석, 3) 보안/CSP 영향 없음, 4) 문서화.
- `grid-react`, `grid-vue`는 peerDependencies로만 프레임워크를 가진다.

---

# 2) 디렉토리/파일 명명 규칙 (Naming Conventions)
## 2.1 디렉토리명 (MUST)
- `lower-kebab-case`만 허용.
- 예: `virtualization`, `data-provider`, `dom-renderer` (단, 폴더명은 kebab)

## 2.2 파일명 (MUST)
- 소스 파일: `lower-kebab-case.ts`
- 워커 파일: `*.worker.ts`
- 테스트 파일: `*.spec.ts`
- CSS 파일: `lower-kebab-case.css`
- 예제 파일: `examples/example{N}.html` (N은 1..999, **선행 0 금지**)

## 2.3 공개 API/옵션/이벤트 명명 (MUST)
- 메서드: `camelCase` 동사형
  - `setColumns`, `setOptions`, `setTheme`, `getState`, `setState`, `destroy`
- 이벤트: `camelCase`
  - `cellClick`, `cellDblClick`, `editStart`, `editCommit`, `selectionChange`
- 옵션 키: `camelCase` (snake_case 금지)

## 2.4 변수/타입 명명 (MUST)
- 변수/함수: `camelCase`
- boolean: `is*`, `has*`, `should*`, `can*` 접두어 사용
- 클래스/타입/인터페이스: `PascalCase` (I-prefix 금지)
- 상수: `SCREAMING_SNAKE_CASE`
- private 필드: TypeScript `private` 사용(언더스코어 접두어 강제하지 않음)
- enum은 가급적 지양하고 string union type 우선

---

# 3) 레이어링 규칙 (Core Modules)
`packages/grid-core/src` 내부는 아래 레이어를 유지한다.

- `/api`: 외부 공개 API surface (여기서만 public export)
- `/core`: Grid, Controller, PluginManager, EventBus
- `/data`: DataProvider, RowModel, ColumnModel, transactions
- `/virtualization`: row/col range 계산, scroll scaling, pooling
- `/render`: DOM renderer, DOM pooling, layout engine
- `/interaction`: selection, keyboard nav, editing, pointer hit-test
- `/a11y`: ARIA grid semantics, focus strategy
- `/theme`: tokens, css variables mapping
- `/utils`: deps 없는 유틸, hot path 최적화 도구

규칙:
- `/render`는 `/data`에 직접 의존 가능하지만, `/data`는 `/render`를 모르면 된다.
- `/api`는 내부 모듈을 re-export만 한다. 내부 구현 import 금지(순환 방지).
- 플러그인은 core private 필드를 절대 접근하지 않는다.

---

# 4) 성능 규칙 (Performance Contract)
## 4.1 DOM 노드 예산 (MUST)
- Row DOM 수 = `visibleRowCount + overscanTop + overscanBottom` (상수)
- 스크롤 중 DOM 생성/삭제 0회 (풀링 재사용만)
- 이벤트 리스너는 root 위임만 (셀/행 개별 리스너 금지)

## 4.2 스크롤/렌더 예산 (MUST)
- 스크롤 이벤트 핸들러: 평균 < 1ms (메인 스레드)
- 렌더 프레임: 목표 16ms @ 60Hz (참조 디바이스 기준)
- “강제 레이아웃(forced reflow)” 금지:
  - scroll path에서 `getBoundingClientRect`, `offset*`, `client*`를 반복 호출 금지
  - 읽기/쓰기 섞지 말고 rAF에서 일괄 수행

## 4.3 초대용량 스크롤 (10M) (MUST)
- 브라우저 scrollHeight 한계 대응을 위해 `scroll scaling` 또는 `segmented mapping` 구현 필수.
- 10,000,000 행에서도:
  - 스크롤 thumb 이동이 가능하고
  - rowIndex 매핑이 안정적이며
  - UI가 멈추지 않아야 한다.

## 4.4 연산 Worker 규칙 (MUST)
- 100k+에서 정렬/필터는 메인 스레드에서 동기 실행 금지.
- Worker 메시지에는 operationId/cancel 지원 필수.

---

# 5) 보안/CSP 규칙 (Security Contract)
- `eval`, `new Function`, `setTimeout("string")` 금지.
- 기본 셀 렌더는 `textContent` 사용(HTML 주입 금지).
- HTML 렌더링이 필요하면:
  - opt-in 옵션 + 명시적 sanitize 훅 제공
  - “기본 unsafe”로 문서화
- 스타일은 class + CSS variables 중심.
- `<style>` 주입이 필요하면 `styleNonce` 옵션으로만 허용.

---

# 6) 접근성(A11y) 규칙
- DOM renderer는 ARIA grid 패턴을 따른다.
- 키보드만으로:
  - 셀 이동(화살표/페이지/홈/엔드)
  - 선택(Shift/Ctrl)
  - 편집(Enter/Esc)
  이 가능해야 한다.
- 가상화 중에도 focus가 사라지지 않도록:
  - active cell을 안정적으로 유지(aria-activedescendant 또는 roving tabindex 중 택1)
  - 스크롤로 DOM 재사용 시 id/aria 매핑이 깨지지 않게 한다.

---

# 7) Examples 규칙 (example1~999)
- 기능(feature) 추가마다 **반드시** 새 예제 1개:
  - `examples/example{N}.html`
- `examples/registry.json`에 title/tags/plugins 추가
- `scripts/new-example.mjs`로만 생성(수동 생성 금지)
- CI에서:
  - 중복 번호, 누락 번호, registry 누락, broken link 검출

---

# 8) 플러그인 규칙
- 플러그인 id: `lower-kebab-case`
- 플러그인은 public hook로만 확장:
  - command 등록
  - 이벤트 훅
  - overlay 등록
  - 렌더 훅(단, DOM 노드 예산을 깨지 않는 방식만)
- 플러그인은 core private 필드 접근 금지.

---

# 9) 문서/테스트/릴리즈 규칙
## 9.1 문서 (MUST)
새 public API/옵션/이벤트 추가 시:
- API 문서 업데이트
- 디자인/테마 가이드 반영(해당 시)
- 예제 1개 추가

## 9.2 테스트 (MUST)
- 알고리즘(가상화/매핑/정렬/필터)은 unit test 필수
- 주요 UX(선택/편집/키보드)는 e2e test 필수(Playwright 권장)
- 메모리 누수: create/destroy 반복 e2e 스모크

## 9.3 Breaking change 정책 (MUST)
- 기존 API/옵션/이벤트의 시그니처/동작 변경 금지.
- 변경이 필요하면:
  - 새 API 추가 + deprecate 공지 + 마이그레이션 문서 제공.

---

# 10) PR “완료 조건”(Definition of Done)
PR은 다음 조건이 모두 만족되어야 merge 가능:
- TypeScript build 성공
- Unit/E2E 테스트 통과
- 예제 파일 1개 이상 추가(기능 PR)
- CSP smoke test 통과
- 성능 영향(핫패스 변경 시) 벤치 결과 첨부 및 회귀 없음