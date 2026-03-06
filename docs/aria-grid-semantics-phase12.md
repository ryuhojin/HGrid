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
  - center group row / leaf row: `role="row"` + `aria-rowindex`
  - header cell: `role="columnheader"` + `aria-colindex`
  - group header는 `aria-colspan`을 사용
- Body
  - body rowgroup: `role="rowgroup"`
  - center row만 `role="row"` + `aria-rowindex`
  - pinned(left/right) row는 `role="presentation"`
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
- 기준일: 2026-03-06
- 테스트 대상 예제: `examples/example38.html`

| Screen Reader | Browser | OS | Status | Notes |
| --- | --- | --- | --- | --- |
| NVDA 2024.4+ | Chrome stable | Windows 11 | Planned | grid role/row, column announce 확인 |
| NVDA 2024.4+ | Edge stable | Windows 11 | Planned | pinned + center 이동 announce 확인 |
| JAWS 2025+ | Chrome stable | Windows 11 | Planned | active descendant 전환 announce 확인 |
| VoiceOver | Safari stable | macOS 14+ | Planned | VO+Arrow 탐색 시 row/col announce 확인 |

## Verification Checklist
- `packages/grid-core/test/grid.spec.ts`
  - grouped header + pinned zone의 ARIA row/col index 검증
  - `aria-activedescendant` 동기화/해제 검증
- 수동 점검
  - example38에서 키보드 이동(Arrow/Home/End/Page) 시 스크린리더 announce 확인
