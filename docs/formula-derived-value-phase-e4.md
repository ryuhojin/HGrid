# Phase E4.4 - Formula / Derived Value Strategy

## 결정
- core는 **사용자 작성 formula language / expression engine**를 지원하지 않는다.
- core가 현재 지원하는 계산 모델은 **row-local derived value**다.
  - 읽기: `ColumnDef.valueGetter(row, column)`
  - 쓰기: `ColumnDef.valueSetter(row, value, column)`는 편집 흐름에서만 사용
- 따라서 E4 기준 제품 범위는:
  - 지원: row-local computed column
  - 미지원: formula bar, cell reference formula, cross-row dependency graph, cross-sheet formula, volatile spreadsheet function

## 이유
- DOM-only core의 우선순위는 성능/가상화/유지보수성이다.
- general-purpose formula engine은 parsing, dependency graph, cycle detection, recalc scheduler, import/export bridge, formula UI까지 요구한다.
- 이 책임은 `grid-core`의 hot path와 public API surface를 불필요하게 무겁게 만든다.

## Core 권장 패턴
- 같은 row 안에서 파생 값이 필요하면 `valueGetter`를 사용한다.
- 편집 가능한 원본 컬럼만 실제 data field로 유지한다.
- 저장 payload는 원본 field만 서버로 보낸다.
- derived column은:
  - export 시 이미 계산된 값을 읽을 수 있고
  - sort/filter worker path에서도 projected column 형태로 사용할 수 있다.

## Future Plugin Boundary
공식 formula support가 필요하면 **future plugin**으로 분리한다.

- package target: `packages/grid-plugins/formula`
- plugin responsibilities:
  - expression parser / validator
  - dependency graph build
  - recalc scheduler
  - cycle detection
  - formula-specific editor / formula bar / audit metadata
  - import/export bridge
- core responsibilities remain:
  - row model / selection / editing / dirty tracking / undo-redo
  - derived value render slot(`valueGetter`) and edit surface

현재 저장소에는 공식 plugin SDK가 없으므로, formula plugin은 우선 설계 문서 범위에 두고 실제 구현은 E8 이후 plugin platform 정리 뒤로 미룬다.

## Dependency / Cycle Policy
미래 formula plugin이 들어오더라도 v1 정책은 아래로 제한한다.

- 기본 단위: **same-row dependency**
- 허용:
  - 같은 row 안의 field reference
  - acyclic dependency graph
- 불허:
  - cross-row reference
  - cross-sheet reference
  - self-reference / cycle
  - volatile function(`NOW()`, `RAND()`) 같은 frame-sensitive 계산

cycle이 발견되면:

- edit/apply를 reject
- validation issue를 surface에 노출
- 기존 committed value는 유지

## Product Scope Statement
- HGrid core는 spreadsheet product가 아니다.
- formula editing이 필요하면 future plugin 또는 app-layer 계산 서비스로 분리해야 한다.
- 현재 엔터프라이즈 권장 경로는 `valueGetter` 기반 derived column + server/app-layer 계산 orchestration이다.

## Example / e2e
- example: `examples/example87.html`
- e2e: `scripts/run-e2e.mjs` `runExample87Checks`
- smoke 내용:
  - editable base field 변경 후 derived column 즉시 재계산
  - core policy snapshot(`formulaSupport: "plugin-only"`) 노출
