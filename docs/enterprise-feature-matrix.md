# HGrid Enterprise Feature Matrix

> 기준일: 2026-03-10
>
> 기준: 저장소 전체 소스, 테스트, examples, docs, scripts, 로컬 품질 게이트 실행 결과

## 상태 기준
- `완료`: 현재 저장소 기준으로 기능과 검증 체계가 모두 의미 있게 갖춰져 있음
- `부분 완료`: 기능의 뼈대는 있으나 엔터프라이즈 기준에서 범위/운영/검증/제품 surface가 부족함
- `미지원`: 엔터프라이즈 비교군에서 일반적으로 기대되는 기능이 아직 없음

## 요약
- HGrid는 현재 `고성능 DOM 가상화 엔진` 영역은 강하다.
- 반면 `엔터프라이즈 제품 surface`, `실제 Worker 런타임`, `완성된 서버사이드 row model`, `확장 SDK`, `상용 운영 체계`는 부족하다.
- 따라서 현재 평가는 `엔터프라이즈 상용 제품 준비 완료`가 아니라 `엔터프라이즈 전환이 가능한 강한 엔진 기반`이다.

## Feature Matrix

| 영역 | 상태 | 현재 수준 | 주요 격차 | 근거 |
| --- | --- | --- | --- | --- |
| DOM-only 렌더링 / 가상화 / 풀링 | 완료 | DOM churn 없이 row/cell pool 재사용, 수평/수직 가상화, pinned zone 동작 | 제품 surface 부족과 별개로 엔진 강점 | [grid.ts](../packages/grid-core/src/core/grid.ts), [dom-renderer.ts](../packages/grid-core/src/render/dom-renderer.ts), [row-cell-pooling-phase2.md](./row-cell-pooling-phase2.md) |
| 100M 스크롤 스케일링 | 완료 | `MAX_SCROLL_PX` 기반 mapping, bench 및 spec 존재 | OS/browser 실측 기록은 보강 필요 | [scroll-scaling.ts](../packages/grid-core/src/virtualization/scroll-scaling.ts), [scroll-scaling.spec.ts](../packages/grid-core/test/scroll-scaling.spec.ts), [bench.mjs](../scripts/bench.mjs) |
| RowModel 메모리 전략 | 완료 | identity/sparse/materialized 전략과 상태 추적 제공 | server-side model과 별도 체계화 필요 | [row-model.ts](../packages/grid-core/src/data/row-model.ts), [row-model-memory-phase3.md](./row-model-memory-phase3.md) |
| Selection / Keyboard Navigation | 완료 | range selection, active cell, keyboard navigation, keyboard-only e2e 존재 | 제품형 status UX는 부족 | [selection-model.ts](../packages/grid-core/src/interaction/selection-model.ts), [keyboard-navigation-phase4.md](./keyboard-navigation-phase4.md), [keyboard-only-phase12.md](./keyboard-only-phase12.md) |
| Editing 1.0 | 부분 완료 | single overlay editor, sync/async validation, audit payload 존재 | editor 종류 확장, batch edit, undo/redo, dirty tracking 부재 | [editing-policy-phase5.md](./editing-policy-phase5.md), [grid.ts](../packages/grid-core/src/core/grid.ts), [dom-renderer.ts](../packages/grid-core/src/render/dom-renderer.ts) |
| Client Sort / Filter | 부분 완료 | 실제 동작과 테스트는 있음 | 실제 Worker offload가 없고 main-thread cooperative executor 수준 | [sort-executor.ts](../packages/grid-core/src/data/sort-executor.ts), [filter-executor.ts](../packages/grid-core/src/data/filter-executor.ts), [worker-protocol.ts](../packages/grid-core/src/data/worker-protocol.ts) |
| Grouping | 부분 완료 | group model, aggregation, expand/collapse, remote query pass-through 제공 | 메모리 비용이 크고 Worker runtime 없음, product UI 없음 | [group-executor.ts](../packages/grid-core/src/data/group-executor.ts), [grouping-phase9.md](./grouping-phase9.md) |
| Tree Data | 부분 완료 | parentId 기반 트리와 lazy children load 제공 | `RemoteDataProvider`와 동시 적용 미지원 | [tree-executor.ts](../packages/grid-core/src/data/tree-executor.ts), [tree-data-phase9.md](./tree-data-phase9.md) |
| Pivot | 부분 완료 | 로컬 pivot matrix, 동적 컬럼 생성, remote query model 존재 | enterprise pivot panel, server pivot result model, Worker runtime 부족 | [pivot-executor.ts](../packages/grid-core/src/data/pivot-executor.ts), [pivot-phase9.md](./pivot-phase9.md) |
| Remote Data Provider | 부분 완료 | block cache, prefetch, LRU, query model 제공 | AG Grid SSRM 수준의 server-side row model은 아님 | [remote-data-provider.ts](../packages/grid-core/src/data/remote-data-provider.ts), [remote-data-provider-phase8.md](./remote-data-provider-phase8.md) |
| Worker Runtime | 미지원 | protocol/response helper만 존재 | 실제 `.worker.ts`, dispatcher, pool, runtime 연결 부재 | [worker-protocol.ts](../packages/grid-core/src/data/worker-protocol.ts), [grid.ts](../packages/grid-core/src/core/grid.ts) |
| Product UI Surface | 미지원 | examples 중심 API 데모만 다수 존재 | column menu, filter builder, sidebar, tool panel, status bar, fill handle, chart, formula, master-detail 부재 | [examples/registry.json](../examples/registry.json), [run-e2e.mjs](../scripts/run-e2e.mjs) |
| Column Group Header | 부분 완료 | multi-level group header 렌더 지원 | `collapsed`가 실제 child visibility를 토글하지 않음 | [column-group-header-phase7.md](./column-group-header-phase7.md) |
| Security / CSP 기본선 | 부분 완료 | 기본 text 렌더, CSP smoke, 정적 scan, sanitize hook 제공 | sanitizer 없으면 raw HTML 허용, Trusted Types/플러그인 정책 부재 | [security-csp-phase13.md](./security-csp-phase13.md), [dom-renderer.ts](../packages/grid-core/src/render/dom-renderer.ts) |
| Accessibility | 부분 완료 | ARIA grid semantics, aria-activedescendant, keyboard path 존재 | screen reader 실측이 아직 `Planned` 상태 | [aria-grid-semantics-phase12.md](./aria-grid-semantics-phase12.md) |
| i18n / RTL | 부분 완료 | localeText, Intl formatting, RTL 옵션 존재 | locale bundle 운영, IME 회귀, 고객 레시피 강화 필요 | [i18n-phase12.md](./i18n-phase12.md), [grid-locale-text.ts](../packages/grid-core/src/core/grid-locale-text.ts) |
| React / Vue Packages | 부분 완료 | thin adapter 존재 | idiomatic component, root CI, 테스트 부재 | [packages/grid-react/package.json](../packages/grid-react/package.json), [packages/grid-react/src/index.ts](../packages/grid-react/src/index.ts), [packages/grid-vue/package.json](../packages/grid-vue/package.json), [packages/grid-vue/src/index.ts](../packages/grid-vue/src/index.ts) |
| Plugin Platform | 미지원 | excel plugin이 읽기 API를 통해 연동 | plugin lifecycle, command registry, overlay registry, public hook 체계 부재 | [public-api.ts](../packages/grid-core/src/api/public-api.ts), [excel-phase10.md](./excel-phase10.md) |
| Excel Plugin | 부분 완료 | import/export, validation, server delegation hook 제공 | 테스트 부재, 대용량은 서버 위임 권장, plugin SDK 기반 아님 | [packages/grid-plugins/excel/package.json](../packages/grid-plugins/excel/package.json), [excel-plugin.ts](../packages/grid-plugins/excel/src/excel-plugin.ts) |
| Core 테스트 / e2e / bench | 완료 | unit, example-driven e2e, CSP scan, security scan, bench gate 존재 | adapter/plugin/nightly/perf history는 아직 부족 | [package.json](../package.json), [bench.mjs](../scripts/bench.mjs), [run-e2e.mjs](../scripts/run-e2e.mjs) |
| Release / Commercial Readiness | 미지원 | phase 정의만 존재 | semver, changelog, support matrix, licensing, telemetry hook 부재 | [checklist.md](../checklist.md) |

## 현재 결론
- `강함`: virtualization, pooling, scroll scaling, row model, core regression discipline
- `아직 아님`: enterprise product surface, actual Worker runtime, mature SSRM, framework product packages, plugin platform, commercial operations
- 즉시 우선순위:
  - 실제 Worker 런타임
  - 엔터프라이즈 서버사이드 row model
  - 제품형 UI surface
  - 보안/A11y 실측 마감
  - framework/plugin/release 체계 정비

## 이번 판정에 포함한 검증
- 저장소 전체 소스, tests, examples, docs, scripts line-by-line 검토
- 로컬에서 `pnpm ci:phase0` 실행
- 결과:
  - typecheck/build/test/e2e/verify-examples/CSP/security/naming/bench 통과
  - core 엔진 기초체력은 확인됨
  - 다만 상용 제품 완성도와는 별개 항목으로 판단함
