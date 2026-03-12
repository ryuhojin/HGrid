# HGrid Enterprise Feature Matrix

> 기준일: 2026-03-12
>
> 기준: 저장소 전체 소스, 테스트, examples, docs, scripts, 로컬 품질 게이트 실행 결과

## 상태 기준
- `완료`: 현재 저장소 기준으로 기능과 검증 체계가 모두 의미 있게 갖춰져 있음
- `부분 완료`: 기능의 뼈대는 있으나 엔터프라이즈 기준에서 범위/운영/검증/제품 surface가 부족함
- `미지원`: 엔터프라이즈 비교군에서 일반적으로 기대되는 기능이 아직 없음

## 요약
- HGrid는 현재 `고성능 DOM 가상화 엔진` 영역은 강하다.
- 반면 `엔터프라이즈 제품 surface`, `완성된 서버사이드 row model`, `확장 SDK`, `상용 운영 체계`는 부족하다.
- 따라서 현재 평가는 `엔터프라이즈 상용 제품 준비 완료`가 아니라 `엔터프라이즈 전환이 가능한 강한 엔진 기반`이다.

## Feature Matrix

| 영역 | 상태 | 현재 수준 | 주요 격차 | 근거 |
| --- | --- | --- | --- | --- |
| DOM-only 렌더링 / 가상화 / 풀링 | 완료 | DOM churn 없이 row/cell pool 재사용, 수평/수직 가상화, pinned zone 동작 | 제품 surface 부족과 별개로 엔진 강점 | [grid.ts](../packages/grid-core/src/core/grid.ts), [dom-renderer.ts](../packages/grid-core/src/render/dom-renderer.ts), [row-cell-pooling-phase2.md](./row-cell-pooling-phase2.md) |
| 100M 스크롤 스케일링 | 완료 | `MAX_SCROLL_PX` 기반 mapping, bench 및 spec 존재 | OS/browser 실측 기록은 보강 필요 | [scroll-scaling.ts](../packages/grid-core/src/virtualization/scroll-scaling.ts), [scroll-scaling.spec.ts](../packages/grid-core/test/scroll-scaling.spec.ts), [bench.mjs](../scripts/bench.mjs) |
| RowModel 메모리 전략 | 완료 | identity/sparse/materialized 전략과 상태 추적 제공 | server-side model과 별도 체계화 필요 | [row-model.ts](../packages/grid-core/src/data/row-model.ts), [row-model-memory-phase3.md](./row-model-memory-phase3.md) |
| Selection / Keyboard Navigation | 완료 | range selection, active cell, keyboard navigation, keyboard-only e2e 존재 | 제품형 status UX는 부족 | [selection-model.ts](../packages/grid-core/src/interaction/selection-model.ts), [keyboard-navigation-phase4.md](./keyboard-navigation-phase4.md), [keyboard-only-phase12.md](./keyboard-only-phase12.md) |
| Editing 1.0 | 부분 완료 | single overlay editor, sync/async validation, audit payload 존재. E2.4 기준 remote/server mode도 즉시 편집 UX + pending change 추적 + save/discard/revert payload를 제공 | editor 종류 확장, batch edit, undo/redo, dirty badge/status UX 부재 | [editing-policy-phase5.md](./editing-policy-phase5.md), [grid.ts](../packages/grid-core/src/core/grid.ts), [dom-renderer.ts](../packages/grid-core/src/render/dom-renderer.ts), [server-side-row-model-phase-e2.md](./server-side-row-model-phase-e2.md) |
| Client Sort / Filter | 부분 완료 | 100k+ serializable path는 worker-first, 저용량은 cooperative, sort/filter는 low-overhead columnar payload 적용, `valueGetter` 선택 컬럼과 custom comparator sort도 projected worker path 지원, 반복 요청은 projection cache로 재사용, first-hit도 필요한 derived prefix만 평가, 테스트 존재 | first-hit comparator/valueGetter callback 자체는 여전히 main thread에 남음 | [sort-executor.ts](../packages/grid-core/src/data/sort-executor.ts), [filter-executor.ts](../packages/grid-core/src/data/filter-executor.ts), [worker-operation-payloads.ts](../packages/grid-core/src/data/worker-operation-payloads.ts) |
| Grouping | 부분 완료 | 100k+ serializable path는 worker-first, group model/aggregation/expand/collapse 제공, low-overhead columnar payload 적용, custom reducer도 worker structure + main-thread hydration 경로 존재 | 메모리 비용, product UI 부족 | [group-executor.ts](../packages/grid-core/src/data/group-executor.ts), [grouping-phase9.md](./grouping-phase9.md), [worker-operation-payloads.ts](../packages/grid-core/src/data/worker-operation-payloads.ts) |
| Tree Data | 부분 완료 | parentId 기반 트리와 lazy children load 제공, worker compact payload 적용, remote provider + server tree contract(`serverSide.tree`, `rowMetadata.tree*`) 동시 지원 | remote global expand/collapse-all, mature tree store scheduling 부족 | [tree-executor.ts](../packages/grid-core/src/data/tree-executor.ts), [tree-data-phase9.md](./tree-data-phase9.md), [worker-operation-payloads.ts](../packages/grid-core/src/data/worker-operation-payloads.ts) |
| Pivot | 부분 완료 | 100k+ serializable path는 worker-first, 로컬 pivot matrix와 remote query model 존재, low-overhead columnar payload 적용, custom reducer도 worker structure + main-thread hydration 경로 존재, remote server pivot result columns contract 반영 | enterprise pivot panel, full SSRM store scheduling 부족 | [pivot-executor.ts](../packages/grid-core/src/data/pivot-executor.ts), [pivot-phase9.md](./pivot-phase9.md), [worker-operation-payloads.ts](../packages/grid-core/src/data/worker-operation-payloads.ts) |
| Remote Data Provider | 부분 완료 | block cache, prefetch, LRU, query model 제공. E2 기준으로 `serverSide` envelope(schema version, route, partial/full store strategy), grouping/tree query contract, row metadata, pivot result columns, targeted invalidate, query diff summary, background refresh/retry block state, rowKey 기반 pending change/save-discard API까지 고정 | AG Grid SSRM 수준의 store hierarchy, grid-owned save transport, conflict UI를 포함한 full commercial sync policy는 아직 아님 | [remote-data-provider.ts](../packages/grid-core/src/data/remote-data-provider.ts), [remote-data-provider-phase8.md](./remote-data-provider-phase8.md), [server-side-row-model-phase-e2.md](./server-side-row-model-phase-e2.md) |
| Worker Runtime | 완료 | protocol, `.worker.ts`, dispatcher, `Grid` 연결, dist worker asset, `100k+` default worker policy, optional prewarm, configurable `poolSize`, dedicated e2e/bench comparison, async payload serialization, all operations low-overhead payload 경로, tree lazy batch compact payload + hydration, group/pivot custom reducer hydration, `valueGetter`/comparator projected worker path, projection cache, selective prefix evaluation까지 반영. 최신 bench 기준 sort worker-on `115.7ms`, worker-off `123.9ms`, filter worker-on `157.9ms`, worker-off `70.1ms` | callback-heavy first-hit과 filter flat-view apply/refresh는 지속 튜닝 여지 | [worker-protocol.ts](../packages/grid-core/src/data/worker-protocol.ts), [worker-operation-dispatcher.ts](../packages/grid-core/src/data/worker-operation-dispatcher.ts), [actual-worker-runtime-phase-e1.md](./actual-worker-runtime-phase-e1.md) |
| Product UI Surface | 부분 완료 | E3.1 기준 header-scoped column menu / context menu, built-in column actions, custom item hook이 들어왔다 | filter builder, sidebar, tool panel, status bar, fill handle, chart, formula, master-detail 부재 | [column-menu-phase-e3.md](./column-menu-phase-e3.md), [example62.html](../examples/example62.html), [public-api-phase1.md](./public-api-phase1.md) |
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
- `아직 아님`: enterprise product surface, mature SSRM, framework product packages, plugin platform, commercial operations
- 즉시 우선순위:
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
