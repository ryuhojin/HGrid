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

## 2. 완성된 서버사이드 row model 아님
- 현재 `RemoteDataProvider`는 block cache/LRU/prefetch/query model 중심이다.
- grouping/pivot/tree의 enterprise-grade server-side store 모델은 완성되지 않았다.
- 의미:
  - 복합 서버 데이터 시나리오에서 제품 설명 범위를 신중히 제한해야 한다.

## 3. `RemoteDataProvider` + Tree 동시 미지원
- 문서 기준으로 remote provider와 tree pipeline 동시 적용은 범위에서 제외되어 있다.
- 의미:
  - 원격 계층형 데이터 제품 요구사항을 바로 충족하지 못한다.

## 4. Column Group `collapsed` 미완성
- column group schema에 `collapsed`가 존재하지만 실제 child visibility 토글은 구현되지 않았다.
- 의미:
  - 다단 헤더는 렌더되지만 enterprise column group UX 완성이라고 보기 어렵다.

## 5. 제품형 UI surface 부족
- 현재 저장소에는 다음이 없다:
  - column menu
  - filter builder/panel UI
  - sidebar/tool panels
  - status bar
  - fill handle/range handle UX
  - integrated charts
  - formula editing
  - master-detail
- 의미:
  - 엔터프라이즈 업무 사용자가 UI만으로 기능을 탐색/설정하는 수준이 아니다.

## 6. 보안 정책이 secure-by-default로 닫히지 않음
- `unsafeHtml` 컬럼에서 sanitizer가 없으면 raw HTML이 렌더된다.
- `styleNonce`는 현재 예약 상태다.
- 의미:
  - “기본이 안전”보다는 “옵션을 올바르게 써야 안전”한 상태다.

## 7. 접근성 실측 미완료
- ARIA semantics와 keyboard path는 구현되어 있다.
- 하지만 NVDA/JAWS/VoiceOver 실측 매트릭스는 아직 `Planned` 상태다.
- 의미:
  - 접근성 주장은 코드 정책 수준이지 실사용 검증 수준은 아니다.

## 8. React / Vue 패키지 제품화 미완료
- 현재 adapter는 thin wrapper 수준이다.
- root build/test/typecheck 범위에 fully 포함되지 않는다.
- adapter 자체 테스트도 없다.
- 의미:
  - 프레임워크 제품 패키지로 바로 판매/지원하기에는 부족하다.

## 9. Plugin SDK 부재
- excel plugin은 존재하지만 공식 plugin lifecycle / command registry / overlay registry 체계는 없다.
- 의미:
  - 기능 확장을 core 수정 없이 안정적으로 쌓는 플랫폼 단계는 아니다.

## 10. Release / Commercial Readiness 부재
- 다음 항목이 아직 미완료다:
  - semver / deprecation policy
  - changelog automation
  - API docs generation
  - support matrix
  - licensing/distribution policy
  - telemetry hook
- 의미:
  - 기술 데모를 넘어 상용 배포/업그레이드/지원 체계가 아직 없다.

## 11. 문서 상태 표시 불일치 가능성
- README에는 강하게 완료로 표현된 항목이 있으나, 상세 docs/checklist에는 제한 또는 후속 작업이 남아 있다.
- 의미:
  - 외부 커뮤니케이션 전에 상태 정합성 정리가 필요하다.

## 운영 원칙
- 이 제한사항 문서에 적힌 내용이 해소되기 전에는 marketing/README에서 과장된 완료 표현을 쓰지 않는다.
- 기능이 “존재”하는 것과 “엔터프라이즈 상용 수준으로 완료”된 것은 분리해서 표현한다.
