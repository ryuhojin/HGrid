# HGrid Enterprise Known Limitations

> 기준일: 2026-03-12
>
> 이 문서는 “현재 제품이 아직 아닌 부분”을 숨기지 않고 고정하기 위한 제한사항 문서다.

## 1. Worker runtime phase는 마감됐지만 callback-heavy path는 추가 튜닝 여지가 있음
- 현재 정렬/필터/그룹/피벗/트리 연산은 `100k+`에서 worker를 기본으로 요구한다.
- `worker-protocol`, `.worker.ts`, dispatcher, `Grid` 연결, dist worker asset, threshold policy, worker e2e, crash/cancel test, on/off bench comparison까지는 반영됐다.
- 의미:
  - latest `pnpm bench` 기준 1M max gap은 sort worker-on `115.7ms`, worker-off `123.9ms`, filter worker-on `157.9ms`, worker-off `70.1ms`다.
  - 즉 sort는 cooperative baseline과 사실상 동급까지 내려왔고, filter는 여전히 baseline보다 높지만 coarse gate(`1000ms`) 안에 있다.
  - group/pivot도 columnar payload fast path가 들어가서 example smoke 기준 `~154ms / ~164ms` 수준으로 내려왔다.
  - tree도 compact key-field payload가 들어가서 example smoke 기준 `~161ms` 수준으로 내려왔다.
  - callback 기반 comparator sort도 numeric rank projection으로 worker path를 탈 수 있고, 반복 요청은 projection cache로 재사용되지만, first-hit comparator callback 실행과 rank 생성 비용은 아직 main thread에 남아 있다.
  - `valueGetter` 선택 컬럼도 columnar projection으로 worker path를 탈 수 있고 반복 요청은 projection cache로 재사용되며 unrelated trailing derived getter는 건너뛰지만, first-hit callback 평가 비용 자체는 아직 main thread에 남아 있다.
  - `poolSize` 기반 worker pool과 repeated projection cache, selective prefix evaluation, cached tree lazy hydration lookup은 들어갔지만, first-hit callback 실행 비용과 일부 hydration 비용은 여전히 main thread에 남아 있다.
  - retry는 자동 replay가 아니라 next-operation recreate 수준이다.
  - tree lazy children batch는 structure-only payload로 줄였지만, 렌더용 full row는 main thread hydration으로 다시 붙인다.
  - 따라서 E1 phase 자체는 닫았지만, callback-heavy path 튜닝은 계속 필요하다.

## 2. 완성된 서버사이드 store scheduling 모델 아님
- 현재 `RemoteDataProvider`는 block cache/LRU/prefetch/query model 중심이고, E2.3에서 query diff, targeted invalidate, background refresh/retry block state까지 고정됐다.
- 그래도 grouping/pivot/tree 전체를 아우르는 enterprise-grade store hierarchy와 partial/full store scheduling은 아직 완성되지 않았다.
- 의미:
  - 복합 서버 데이터 시나리오에서 제품 설명 범위를 신중히 제한해야 한다.

## 3. Remote global expand/collapse-all은 아직 제한적
- remote grouping/tree의 visible row toggle은 지원하지만, 서버 전체 keyspace를 모르는 상태의 global expand-all/collapse-all은 아직 완전하지 않다.
- 현재 정책상 remote tree가 활성화되면 server grouping/pivot보다 우선하며, 같은 request cycle에 동시 적용하지 않는다.
- 의미:
  - SSRM 제품 완성도 관점에서는 store-aware expand policy가 더 필요하다.

## 4. 서버모드 dirty tracking은 1차 구현됐지만 save orchestration은 앱 책임이다
- E2.4 기준으로 remote/server mode는 rowKey 기반 pending change tracking과 `getPendingChanges()` / `acceptPendingChanges()` / `discardPendingChanges()` / `revertPendingChange()`를 제공한다.
- 하지만 다음은 아직 grid-owned 기능이 아니다.
  - 서버 mutation transport
  - 저장 성공 후 refetch orchestration
  - conflict badge / dirty badge / save toolbar 같은 product UI
- 의미:
  - 엔터프라이즈 업무형 “편집 후 저장”의 데이터 계약은 생겼지만, 최종 제품 UX는 아직 완성 전이다.
## 5. Column Group `collapsed` 미완성
- column group schema에 `collapsed`가 존재하지만 실제 child visibility 토글은 구현되지 않았다.
- 의미:
  - 다단 헤더는 렌더되지만 enterprise column group UX 완성이라고 보기 어렵다.

## 6. 제품형 UI surface 부족
- 현재 저장소에는 다음이 아직 부족하다:
  - filter builder/panel UI
  - sidebar/tool panels
  - status bar
  - fill handle/range handle UX
  - integrated charts
  - formula editing
  - master-detail
- 현재 들어간 범위:
  - header-scoped column menu / context menu
- 의미:
  - 첫 제품형 menu surface는 생겼지만, 사용자가 UI만으로 전체 feature를 탐색/조작하는 수준까지는 아니다.

## 7. 보안 정책이 secure-by-default로 닫히지 않음
- `unsafeHtml` 컬럼에서 sanitizer가 없으면 raw HTML이 렌더된다.
- `styleNonce`는 현재 예약 상태다.
- 의미:
  - “기본이 안전”보다는 “옵션을 올바르게 써야 안전”한 상태다.

## 8. 접근성 실측 미완료
- ARIA semantics와 keyboard path는 구현되어 있다.
- 하지만 NVDA/JAWS/VoiceOver 실측 매트릭스는 아직 `Planned` 상태다.
- 의미:
  - 접근성 주장은 코드 정책 수준이지 실사용 검증 수준은 아니다.

## 9. React / Vue 패키지 제품화 미완료
- 현재 adapter는 thin wrapper 수준이다.
- root build/test/typecheck 범위에 fully 포함되지 않는다.
- adapter 자체 테스트도 없다.
- 의미:
  - 프레임워크 제품 패키지로 바로 판매/지원하기에는 부족하다.

## 10. Plugin SDK 부재
- excel plugin은 존재하지만 공식 plugin lifecycle / command registry / overlay registry 체계는 없다.
- 의미:
  - 기능 확장을 core 수정 없이 안정적으로 쌓는 플랫폼 단계는 아니다.

## 11. Release / Commercial Readiness 부재
- 다음 항목이 아직 미완료다:
  - semver / deprecation policy
  - changelog automation
  - API docs generation
  - support matrix
  - licensing/distribution policy
  - telemetry hook
- 의미:
  - 기술 데모를 넘어 상용 배포/업그레이드/지원 체계가 아직 없다.

## 12. 문서 상태 표시 불일치 가능성
- README에는 강하게 완료로 표현된 항목이 있으나, 상세 docs/checklist에는 제한 또는 후속 작업이 남아 있다.
- 의미:
  - 외부 커뮤니케이션 전에 상태 정합성 정리가 필요하다.

## 운영 원칙
- 이 제한사항 문서에 적힌 내용이 해소되기 전에는 marketing/README에서 과장된 완료 표현을 쓰지 않는다.
- 기능이 “존재”하는 것과 “엔터프라이즈 상용 수준으로 완료”된 것은 분리해서 표현한다.
