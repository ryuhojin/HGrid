# Phase 12.1 ARIA Grid Semantics

## Scope
- ARIA role/row/column index 정책을 DOM virtualized/pinned 구조에 맞게 확정한다.
- 포커스 전략을 `aria-activedescendant`로 고정한다.
- 스크린리더 점검 매트릭스를 문서화한다.

## ARIA Policy
- Root(`.hgrid`)
  - `role="grid"`
  - `tabindex="0"`
  - `aria-multiselectable="true"`
  - `aria-rowcount = headerRowCount + dataRowCount`
  - `aria-colcount = visibleGlobalColumnCount(left+center+right)`
  - `aria-activedescendant = active cell id` (활성 셀이 뷰포트에 없으면 제거)
- Header
  - header rowgroup: `role="rowgroup"`
  - left/center/right group row / leaf row: `role="row"` + `aria-rowindex`
  - header cell: `role="columnheader"` + `aria-colindex`
  - group header는 `aria-colspan`을 사용
- Body
  - body rowgroup: `role="rowgroup"`
  - left/center/right row 모두 `role="row"` + `aria-rowindex`
  - body cell: `role="gridcell"` + `aria-rowindex` + `aria-colindex`

## Focus Strategy
- 선택 전략: `aria-activedescendant`
- 이유:
  - 가상화/풀링으로 셀 DOM이 재사용되기 때문에 셀별 tabindex 이동보다 루트 포커스 고정이 안정적이다.
  - 키보드 이동 시 active cell id만 교체하면 되어 DOM churn과 포커스 손실 리스크가 낮다.
- 동작:
  - root가 키보드 포커스를 유지
  - active cell 렌더 시 `id="{gridId}-cell-r{row}-c{col}"`를 부여
  - active cell이 비가시 영역으로 빠지면 `aria-activedescendant`를 제거

## Virtualization/Pinned Indexing Rules
- `aria-colindex`는 전체 컬럼 순서를 따른다.
  - left pinned: `1..L`
  - center: `L+1..L+C`
  - right pinned: `L+C+1..L+C+R`
- `aria-rowindex`는 헤더 행을 포함한 1-based 인덱스다.
  - group header rows: `1..G`
  - leaf header row: `G+1`
  - first data row: `G+2`

## Screen Reader Test Matrix
- 기준일: 2026-03-18
- 테스트 대상 예제: `examples/example96.html`
- runbook: [screen-reader-measurement-phase-e6.md](./screen-reader-measurement-phase-e6.md)

| Screen Reader | Browser | OS | Status | Notes |
| --- | --- | --- | --- | --- |
| NVDA 2024.4+ | Chrome stable | Windows 11 | Pass | root/group/select editor/pinned announce 정상 |
| NVDA 2024.4+ | Edge stable | Windows 11 | Pass | pinned + center 이동 announce 정상 |
| JAWS 2025+ | Chrome stable | Windows 11 | Pass | active descendant 전환과 row/col announce 정상 |
| VoiceOver | Safari stable | macOS 14+ | Pass | VO+Arrow 탐색, pinned announce, editor 종료 announce 정상 |

## Verification Checklist
- `packages/grid-core/test/grid.spec.ts`
  - grouped header + pinned zone의 ARIA row/col index 검증
  - pinned row가 accessibility tree에 남는지 검증
  - pinned cell이 `aria-activedescendant`로 addressable한지 검증
  - `aria-activedescendant` 동기화/해제 검증
  - pooled DOM 재사용 중 root focus identity 유지 검증
  - grouped / pivot / tree 상태의 active descendant 전제조건 검증
- `scripts/run-e2e.mjs`
  - `example96` fixture의 grouped header, indicator checkbox, select editor precondition 검증
  - `example97` fixture의 grouped / pivot / tree / editor cancel focus regression 검증
- 수동 점검
  - example96에서 키보드 이동(Arrow/Home/End/Page), select editor(F2), range selection announce 확인
  - 2026-03-18 manual matrix: `NVDA + Chrome`, `NVDA + Edge`, `JAWS + Chrome`, `VoiceOver + Safari` 모두 통과
