# Phase E6.2 Focus Regression Hardening

## Scope
- pooled DOM 재사용 중에도 root focus identity가 흔들리지 않도록 고정한다.
- grouped / pivot / tree 상태에서 `aria-activedescendant` 전제조건이 유지되는지 회귀로 막는다.
- editor overlay가 닫힐 때 root focus와 active descendant가 일관되게 복원되는지 검증한다.

## Focus Contract
- root(`.hgrid`)는 keyboard focus owner다.
- active cell이 가시 영역에 있으면 `aria-activedescendant`를 유지한다.
- active cell이 뷰포트 밖으로 나가면 `aria-activedescendant`를 제거하고, 다시 가시 영역에 들어오면 복원한다.
- editor overlay는 편집 중에만 editor control이 focus를 가진다.
- `Escape` cancel 또는 `Enter` commit으로 editor가 닫히면 root focus를 다시 가져오고 active descendant를 복원한다.

## Regression Coverage
- pooled row reuse
  - 스크롤로 DOM pool이 재사용되어도 `document.activeElement === root`가 유지된다.
  - offscreen active cell일 때는 `aria-activedescendant`가 제거되고, 복귀 시 다시 설정된다.
- grouped / pivot / tree
  - grouped row, pivoted header expansion, tree cell 렌더 상태에서도 root focus + active descendant 전제조건이 유지된다.
- editor cancel
  - select editor를 포함한 overlay editor에서 `Escape` 취소 후 root focus가 복원된다.

## Fixture
- 대상 예제: [example97.html](../examples/example97.html)
- 재현 범위:
  - grouped mode
  - pivot mode
  - tree mode
  - select editor open/cancel
  - snapshot inspection

## Verification
- Unit / integration
  - [packages/grid-core/test/grid.spec.ts](../packages/grid-core/test/grid.spec.ts)
    - pooled DOM focus identity
    - grouped / pivot / tree active descendant precondition
    - editor cancel 후 root focus 복원
- E2E
  - [scripts/run-e2e.mjs](../scripts/run-e2e.mjs)
    - `example97` grouped / pivot / tree / editor cancel smoke

## Current Status
- fixture: 준비됨
- unit / e2e regression: 준비됨
- known blocker: 없음
