# Enterprise DOM Virtualized Data Grid(HGrid) — Enterprise Checklist

> 목적: HGrid를 “성능 좋은 엔진”에서 “판매/배포/유지보수 가능한 엔터프라이즈 상용 그리드 제품”으로 전환하기 위한 실행 체크리스트
>
> 기준일: 2026-03-10
>
> 기준 비교군: AG Grid Enterprise / RealGrid / IBSheet

---

# 0. 운영 규칙
- [ ] 각 작업은 반드시 체크 가능한 산출물로 쪼갠다.
- [ ] 체크 완료 시 근거를 남긴다:
  - [ ] 코드
  - [ ] 테스트(unit/e2e/bench)
  - [ ] example
  - [ ] 문서
  - [ ] 성능 영향 분석(핫패스 변경 시)
- [ ] public API/옵션/이벤트 변경 시:
  - [ ] API 문서 업데이트
  - [ ] migration note 추가
  - [ ] deprecate 정책 명시
- [ ] 보안/A11y/원격 데이터/Worker 관련 변경은 기능 완료만으로 체크하지 않는다.
  - [ ] 회귀 테스트 추가
  - [ ] 운영 문서/제약사항 문서화
- [ ] 엔터프라이즈 기능 PR마다 반드시:
  - [ ] `examples/example{N}.html` 추가
  - [ ] `examples/registry.json` 업데이트
  - [ ] `pnpm verify:examples` 통과

---

# 1. 현재 상태 진단 고정
> 먼저 “무엇이 이미 됐고, 무엇이 아직 아닌지”를 저장소 기준으로 고정한다.

## 1.1 사실 기준 상태표 정리
- [x] 현재 구현 범위를 feature matrix로 문서화
- [x] “완료”와 “부분 완료”와 “미지원”을 분리 표기
- [x] README / checklist / docs 간 상태 불일치 제거
- [x] known limitation 문서 추가:
  - [x] actual Worker runtime 부재
  - [x] remote + tree 동시 미지원
  - [x] column group collapsed 미완성
  - [x] screen reader 실측 미완료
  - [x] framework adapter productization 미완료

### 산출물
- [x] `docs/enterprise-feature-matrix.md`
- [x] `docs/enterprise-known-limitations.md`
- [x] README 상태 섹션 정리
- [x] `checklist.md`와 상충 항목 정리

### 수용 기준
- [ ] 저장소 문서 어디를 봐도 현재 상태가 동일하게 보인다.
- [ ] 영업/개발/QA가 같은 기준표를 참조할 수 있다.

---

# 2. Phase E0 — Architecture Hardening
> 상용 제품으로 커지기 전에 핵심 클래스 구조를 분해한다.

## E0.1 Grid 오케스트레이터 분해
- [x] `Grid`의 책임을 service 단위로 분리
  - [x] state service
  - [x] data pipeline service
  - [x] command/event service
  - [x] export service
  - [x] remote query service
  - [x] provider lifecycle service
- [x] `Grid`는 orchestration facade 역할만 수행하도록 정리
- [x] 내부 서비스 경계 문서화

## E0.2 DomRenderer 분해
- [x] `DomRenderer`를 책임별 모듈로 분리
  - [x] layout/metrics
  - [x] row/cell pooling
  - [x] header interactions
  - [x] editor overlay
  - [x] a11y sync
  - [x] clipboard/selection render
- [x] scroll path hot function 분리 및 주석/테스트 보강
- [x] 대형 파일 분해 후 회귀 테스트 유지

## E0.3 내부 계약 정리
- [x] renderer <-> grid <-> data pipeline 내부 인터페이스 정의
- [x] private 필드 의존을 줄이는 internal contract 작성
- [x] ADR 문서 추가:
  - [x] DOM-only 유지
  - [x] pooling invariants
  - [x] virtualization invariants

### 변경 대상
- [x] `packages/grid-core/src/core/grid.ts`
- [x] `packages/grid-core/src/render/dom-renderer.ts`
- [x] `packages/grid-core/src/core/*`
- [x] `packages/grid-core/src/render/*`

### 수용 기준
- [ ] `grid.ts`, `dom-renderer.ts` 단일 파일 비대화가 해소된다.
- [x] 신규 기능 추가 시 영향 범위를 service/module 단위로 제한할 수 있다.

---

# 3. Phase E1 — Actual Worker Runtime
> 엔터프라이즈 핵심 결함. cooperative executor를 실제 Worker 런타임으로 전환한다.

## E1.1 Worker 엔트리포인트 추가
- [x] `sort.worker.ts` 추가
- [x] `filter.worker.ts` 추가
- [x] `group.worker.ts` 추가
- [x] `pivot.worker.ts` 추가
- [x] `tree.worker.ts` 추가

## E1.2 메인 스레드 런타임 연결
- [x] worker pool 또는 operation dispatcher 설계
- [x] `operationId` / `cancel` / timeout / stale response guard 구현
- [x] transferable 최적화 적용
- [x] Worker 미지원 환경 fallback 정책 정의

## E1.3 대용량 연산 정책 고정
- [x] 100k+ sort는 기본 Worker
- [x] 100k+ filter는 기본 Worker
- [x] 100k+ group/pivot/tree는 기본 Worker
- [x] main-thread fallback은 명시적 옵션 또는 저용량에서만 허용

## E1.4 검증
- [x] Worker e2e 추가
- [x] cancel race test 추가
- [x] Worker crash/retry 정책 테스트
- [x] bench에 Worker on/off 비교 추가

### 변경 대상
- [x] `packages/grid-core/src/data/*-executor.ts`
- [x] `packages/grid-core/src/data/*.worker.ts`
- [x] `packages/grid-core/src/data/worker-protocol.ts`
- [x] `packages/grid-core/src/core/grid.ts`

### 수용 기준
- [x] 고비용 연산 시 메인 스레드 long task가 제품 기준 이하로 떨어진다.
- [x] Worker cancellation이 실제로 동작한다.
- [x] README의 Worker 관련 설명이 구현과 일치한다.

> 2026-03-12 마감 bench: `sort worker-on 115.7ms / worker-off 123.9ms`, `filter worker-on 157.9ms / worker-off 70.1ms`. E1은 종료하고 남은 성능 차이는 E9 회귀/튜닝 대상으로 관리한다.

---

# 4. Phase E2 — Enterprise Server-Side Data Model
> AG Grid SSRM, RealGrid 원격 연동 수준에 대응하는 데이터 모델이 필요하다.

## E2.1 서버사이드 row model 계약 확정
- [x] block cache를 넘어선 server-side row model 계약 정의
- [x] partial store / full store 전략 결정
- [x] child count / group expansion / aggregate row metadata 계약 정의
- [x] server query schema versioning 정의

## E2.2 그룹/피벗/트리 원격 모델 완성
- [x] remote grouping row contract 정의
- [x] remote pivot result contract 정의
- [x] remote tree contract 정의
- [x] remote + tree 동시 지원
- [x] remote + grouping + pivot 조합별 정책 정의

## E2.3 캐시/동기화 고도화
- [x] block invalidation 범위 제어
- [x] query change diff 정책
- [x] optimistic refresh / background refresh 정책
- [x] remote loading / error / retry overlay 상태 체계화

## E2.4 서버모드 편집 / 변경추적
- [x] server-side edit policy 정의
- [x] leaf row edit / group row non-edit policy 정의
- [x] dirty row / dirty cell tracking
- [x] pending changes API(`hasPendingChanges`, `getPendingChanges`, `getPendingChangeSummary`) 정의
- [x] save / discard / revert API(`acceptPendingChanges`, `discardPendingChanges`, `revertPendingChange`) 정의
- [x] remote cache eviction / refetch 이후 dirty state 유지
- [x] save 실패 rollback / conflict 표시 정책 정의

## E2.5 서버 연동 예제
- [x] fake server SSRM example 추가
- [x] server grouping example 추가
- [x] server pivot example 추가
- [x] server tree example 추가

### 변경 대상
- [x] `packages/grid-core/src/data/remote-data-provider.ts`
- [x] `packages/grid-core/src/core/grid.ts`
- [x] `docs/remote-data-provider-phase8.md`
- [x] 신규 SSRM 문서

### 수용 기준
- [x] remote provider가 단순 block fetch가 아니라 엔터프라이즈 row model 역할을 한다.
- [x] grouping / pivot / tree / sort / filter 조합이 서버 계약으로 설명 가능하다.

---

# 5. Phase E3 — Enterprise Product Surface
> 지금 HGrid는 엔진 중심이다. 이제 실제 사용자가 만지는 제품 surface를 만든다.

## E3.1 Column Menu / Context Menu
### E3.1.1 Header Menu
- [x] column header menu 추가
- [x] sort / pin / hide / auto-size / reset 메뉴 추가
- [x] header context menu hook 추가
- [x] custom menu item 확장 포인트 설계

### E3.1.2 Body Cell Context Menu
- [x] body cell 우클릭 context menu 추가
- [x] selection / editing / clipboard 와 body context menu 상호작용 정책 정의
- [x] cell / row context payload 설계
- [x] body context menu example + e2e 추가

## E3.2 Filter UI
- [x] text/number/date/set filter panel UI 추가
- [x] multi-condition filter UI 추가
- [x] advanced filter builder 범위 결정
- [x] nested advanced filter group 지원
- [x] header filter row 1차 UI 추가
- [x] advanced filter preset save/apply/delete 추가
- [x] builder set/boolean editor 추가
- [x] filter row boolean/date 전용 editor 정리
- [x] filter row generic set/enum editor 추가
- [x] set filter distinct source(sampled/full/custom) 정리
- [x] filter model <-> UI 양방향 동기화

## E3.3 Side Bar / Tool Panels
- [x] columns panel
- [x] columns panel search / reorder
- [x] columns panel preset action
- [x] filters panel
- [x] grouping panel
- [x] pivot panel
- [x] panel registry/extension hook 추가
- [x] custom panel mutation action API(filter/layout) 추가

## E3.4 Status Bar / Summary UX
- [x] selection count
- [x] sum/avg/min/max quick aggregate
- [x] large selection aggregate async policy
- [x] visible row count / filtered row count
- [x] remote loading / sync status 표시
- [x] custom status bar item registry

## E3.5 Drag/Fill/Range UX
- [x] fill handle 정책 정의
- [x] auto fill / series fill 범위 정의
- [x] drag-to-copy UX 정의
- [x] fill handle drag auto-scroll 추가
- [x] multi-axis numeric trend fill 추가
- [x] editor / clipboard / fillHandle shared undo/redo 연동
- [x] range handle / clipboard 상호작용 회귀 테스트

## E3.6 Layout Persistence UX
- [x] save/load column layout API 정리
- [x] preset layout example 추가
- [x] layout / workspace storage recipe 문서화
- [x] support matrix에 persistence 포함

## E3.7 Theme / Design System / Dark Mode
- [x] CSS variable token surface 재검토 및 누락 토큰 확장
- [x] CSS override safe boundary(selector/token/class) 가이드 정리
- [x] built-in theme 제공(light / dark / enterprise preset)
- [x] dark mode toggle + system preference 대응 전략 정리
- [x] runtime theme switching example + 고객사 브랜딩 example 추가
- [x] adapter/framework theme recipe 문서화
- [x] theme 변경 시 layout/contrast/focus/a11y 회귀 테스트 추가

### 경쟁 제품 parity 최소 범위
- [x] column menu
- [x] filter panel
- [x] side bar / tool panel
- [x] status bar
- [x] layout persistence
- [x] built-in theme / dark mode / CSS skinning

### 수용 기준
- [x] 코드 API만 아는 개발자가 아니라 일반 업무 사용자가 UI만으로 주요 기능을 쓸 수 있다.
- [x] examples가 “엔진 데모”에서 “업무 시나리오 데모”로 확장된다.
- [x] 고객사가 CSS variables와 override CSS만으로 제품 스킨을 안전하게 바꿀 수 있다.
- [x] built-in light/dark theme와 runtime switching, dark mode 대응 예제가 존재한다.

---

# 6. Phase E4 — Data Workflow / Editing Productization
> 편집 기능이 존재하는 것과 현업이 신뢰할 수 있는 편집 제품인 것은 다르다.

## E4.1 편집 정책 고도화
- [x] cell editor type 확장 전략 정의
- [x] select/date/number/masked editor 정책 정의
- [x] validation error UX 표준화
- [x] batch edit / dirty tracking 정책 정의
- [x] `discardDirtyChanges()` API 추가
- [x] save/discard action bar 추가

## E4.2 Undo/Redo / Transaction UX
- [x] transaction-grade edit undo/redo semantics 고도화
- [x] clipboard paste undo 범위 정의
- [x] transaction rollback 정책 정의
- [x] audit log와 undo/redo 관계 문서화

## E4.3 Clipboard / Import / Export 강화
- [x] clipboard security regression 추가
- [x] CSV/TSV/Excel export 옵션 일관화
- [x] Excel import conflict UX 정의
- [x] 대용량 export server delegation UX 문서화

## E4.4 Formula / Derived Value 전략
- [x] formula 지원 여부 결정
- [x] 지원 시 plugin 분리 설계
- [x] 계산 dependency / cycle 정책 정의
- [x] 미지원 시 명확한 제품 범위 선언

### 수용 기준
- [x] 현업 편집 워크플로우에서 “입력-검증-오류-복구-감사” 흐름이 닫힌다.

---

# 7. Phase E5 — Security / CSP / Compliance
> 보안은 “기본 안전”이어야 한다.

## E5.1 HTML 렌더 보안 정책 재설계
- [x] `unsafeHtml` 기본 정책 재검토
- [x] sanitizer 미제공 시 raw HTML 허용 여부 결정
- [x] secure-by-default 정책으로 전환 여부 결정
- [x] sanitizer reference implementation 문서화

## E5.2 CSP / Trusted Types
- [x] strict CSP 지원 범위 문서화
- [x] Trusted Types 대응 여부 결정
- [x] `styleNonce` 실제 적용 경로가 필요한지 결정
- [x] 플러그인 CSP 규칙 작성

## E5.3 보안 검증 체계
- [x] static scan 규칙 확대
- [x] dependency scan 도입
- [x] XSS regression fixture 확대
- [x] clipboard / paste / import 경로 fuzz test 검토

## E5.4 감사 / 운영 보안
- [x] audit payload schema versioning
- [x] security incident 대응 로그 포인트 정의
- [x] 개인정보/민감정보 masking 가이드 추가

### 수용 기준
- [x] “옵션을 잘 주면 안전”이 아니라 “기본이 안전” 상태가 된다.
- [x] 보안 정책이 core, adapter, plugin 전체에 일관 적용된다.

---

# 8. Phase E6 — Accessibility / i18n
> 선언형 ARIA만으로는 부족하다. 실제 사용성과 검증 기록이 필요하다.

## E6.1 스크린리더 실측 완료
- [ ] NVDA + Chrome
- [ ] NVDA + Edge
- [ ] JAWS + Chrome
- [ ] VoiceOver + Safari
- [ ] 결과를 문서에 실제 상태로 기록

## E6.2 키보드/포커스 회귀 보강
- [ ] pooled DOM 재사용 시 focus identity 회귀 테스트 추가
- [ ] grouped/pivoted/tree 상태에서 announce 검증
- [ ] editor overlay와 aria-activedescendant 충돌 검증

## E6.3 i18n 제품화
- [ ] locale bundle 제공 전략
- [ ] date/number formatting 고객사 recipe 추가
- [ ] IME / 조합 입력 회귀 확인

### 수용 기준
- [ ] A11y 문서가 “Planned”가 아니라 실측 기록을 가진다.
- [ ] 다국어/IME 환경에서 제품 사용 가이드가 존재한다.

---

# 9. Phase E7 — Framework Packages Productization
> React/Vue 패키지는 단순 adapter가 아니라 제품 패키지여야 한다.

## E7.1 React package
- [ ] idiomatic React component 설계
- [ ] controlled/uncontrolled props 정책 정의
- [ ] event binding / ref API 정리
- [ ] React example 및 테스트 추가

## E7.2 Vue package
- [ ] idiomatic Vue component 설계
- [ ] prop / emit / expose 정책 정의
- [ ] Composition API 사용 예제 추가
- [ ] Vue example 및 테스트 추가

## E7.3 품질 게이트 편입
- [ ] root build에 React/Vue 포함
- [ ] root typecheck에 React/Vue 포함
- [ ] root test에 adapter 테스트 포함
- [ ] browser/framework version support matrix 작성

### 수용 기준
- [ ] framework package가 core에 기대어만 사는 wrapper가 아니다.
- [ ] 고객이 React/Vue에서 별도 glue code 없이 제품처럼 사용할 수 있다.

---

# 10. Phase E8 — Plugin SDK / Extension Platform
> 상용 제품은 “기능 추가”보다 “확장 가능성”이 중요하다.

## E8.1 공식 plugin contract
- [ ] plugin lifecycle 정의
- [ ] command registry 정의
- [ ] event hook registry 정의
- [ ] overlay / panel registry 정의
- [ ] render hook 범위 정의

## E8.2 SDK 문서화
- [ ] plugin author guide 작성
- [ ] security boundary 문서화
- [ ] performance budget 문서화
- [ ] example plugin 추가

## E8.3 기존 plugin 정리
- [ ] excel plugin 테스트 추가
- [ ] excel plugin public contract 정리
- [ ] 향후 plugin 후보 분리:
  - [ ] charts
  - [ ] formula
  - [ ] clipboard advanced
  - [ ] security/compliance

### 수용 기준
- [ ] 신규 기능을 core hack 없이 plugin으로 얹을 수 있다.
- [ ] 플러그인이 DOM budget / CSP / private field 원칙을 깨지 않는다.

---

# 11. Phase E9 — QA / Bench / Regression / Observability
> 엔터프라이즈 제품은 기능보다 “회귀를 얼마나 빨리 잡는가”가 더 중요하다.

## E9.1 테스트 확장
- [ ] adapter test 추가
- [ ] plugin test 추가
- [ ] Worker e2e 추가
- [ ] remote SSRM e2e 추가
- [ ] create/destroy memory smoke 강화

## E9.2 벤치 확장
- [ ] Worker on/off 비교 벤치
- [ ] remote dataset 시나리오 벤치
- [ ] group/pivot/tree 대용량 벤치
- [ ] OS/browser 기록 보강

## E9.3 운영 관측성
- [ ] error telemetry hook
- [ ] performance telemetry hook
- [ ] long task / dropped frame callback 검토
- [ ] customer support용 debug snapshot API 검토

## E9.4 nightly/CI 전략
- [ ] nightly perf benchmark job
- [ ] flaky test quarantine 정책
- [ ] release candidate gate 정의

### 수용 기준
- [ ] 상용 배포 후 문제를 재현/관측/회귀 검증할 수 있다.

---

# 12. Phase E10 — Documentation / Release / Support System
> 여기까지 와야 제품을 팔 수 있다.

## E10.1 API / Guide / Examples
- [ ] API 문서 자동 생성
- [ ] example catalog를 기능군 기준으로 재정리
- [ ] quick start / migration / cookbook 작성
- [ ] remote / Worker / security / theme / framework 가이드 정리

## E10.2 Release Engineering
- [ ] semver 정책 확정
- [ ] changelog 자동화
- [ ] deprecation policy 작성
- [ ] release checklist 작성
- [ ] support matrix 작성

## E10.3 Commercial Packaging
- [ ] 라이선스 정책 확정
- [ ] core / enterprise / plugin SKU 전략 정의
- [ ] 배포 아티팩트 정책 정리
- [ ] 소스맵/보안 배포 정책 정리

## E10.4 Support Readiness
- [ ] issue template 정리
- [ ] bug reproduction template 정리
- [ ] SLA/지원 범위 문서 초안 작성
- [ ] customer onboarding 문서 작성

### 수용 기준
- [ ] 제품 설명, 배포, 업그레이드, 지원 절차가 문서화되어 있다.
- [ ] 개발팀 외 인력도 같은 문서를 기준으로 운영할 수 있다.

---

# 13. Phase E11 — GA Gate
> 아래 조건을 모두 만족해야 “엔터프라이즈 상용 출시 가능”으로 본다.

## E11.1 기술 게이트
- [ ] 실제 Worker runtime 적용
- [ ] server-side row model 계약 완료
- [ ] core architecture 분해 완료
- [ ] plugin SDK 계약 완료
- [ ] React/Vue package를 루트 품질 게이트에 편입

## E11.2 제품 게이트
- [ ] column menu
- [ ] filter UI
- [ ] side bar / tool panels
- [ ] status bar
- [ ] layout persistence UX

## E11.3 품질 게이트
- [ ] unit / e2e / bench / CSP / security scan 통과
- [ ] adapter/plugin test 통과
- [ ] A11y screen reader 실측 기록 완료
- [ ] support matrix 공개 가능 수준

## E11.4 상용 게이트
- [ ] semver / changelog / migration 정책 정리
- [ ] 라이선스/배포 정책 정리
- [ ] 고객 지원/온보딩 문서 준비
- [ ] known limitation 공개 문서 준비

### 최종 수용 기준
- [ ] HGrid를 “고성능 그리드 엔진”이 아니라 “도입 가능한 엔터프라이즈 상용 제품”으로 설명할 수 있다.

---

# 14. 권장 수행 순서
- [x] Step 1: `1. 현재 상태 진단 고정`
- [x] Step 2: `2. Phase E0 — Architecture Hardening`
- [x] Step 3: `3. Phase E1 — Actual Worker Runtime`
- [x] Step 4: `4. Phase E2 — Enterprise Server-Side Data Model`
- [x] Step 5: `5. Phase E3 — Enterprise Product Surface`
- [x] Step 6: `6. Phase E4 — Data Workflow / Editing Productization`
- [x] Step 7: `7. Phase E5 — Security / CSP / Compliance`
- [ ] Step 8: `8. Phase E6 — Accessibility / i18n`
- [ ] Step 9: `9. Phase E7 — Framework Packages Productization`
- [ ] Step 10: `10. Phase E8 — Plugin SDK / Extension Platform`
- [ ] Step 11: `11. Phase E9 — QA / Bench / Regression / Observability`
- [ ] Step 12: `12. Phase E10 — Documentation / Release / Support System`
- [ ] Step 13: `13. Phase E11 — GA Gate`

---

# 15. 매 PR 공통 체크
- [ ] 이 PR이 enterprise-checklist의 어떤 체크박스를 닫는지 명시했다.
- [ ] 관련 example / test / docs / registry를 함께 갱신했다.
- [ ] hot path 영향이 있으면 bench 근거를 남겼다.
- [ ] known limitation / migration note 반영 여부를 검토했다.
- [ ] README 또는 고객 노출 문서에 반영이 필요한지 확인했다.
