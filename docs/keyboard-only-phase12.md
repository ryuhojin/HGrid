# Phase 12.2 Keyboard-only Complete Flow

## Scope
- 내비게이션, 선택, 편집 경로를 마우스 없이 키보드로 수행할 수 있도록 확정한다.
- `aria-activedescendant` 전략과 충돌 없이 동작하도록 root focus를 유지한다.

## Keyboard Policy
- Navigation
  - `ArrowUp/Down/Left/Right`: active cell 이동
  - `PageUp/PageDown`: 뷰포트 단위 row 이동
  - `Home/End`: 행 기준 first/last column 이동
  - `Ctrl/Cmd + Home/End`: 전체 첫/끝 셀 이동
  - `Tab/Shift+Tab`(non-edit): 다음/이전 셀 이동(경계에서는 기본 tab out 허용)
- Selection
  - `Shift + Arrow`: anchor 기반 range 확장
  - `Ctrl/Cmd + A`: 전체 셀 범위 선택
  - `Space`(indicator checkbox active cell): row 토글
- Editing
  - `Enter` 또는 `F2`: 편집 시작
  - `Enter`(editor): 커밋
  - `Escape`(editor): 취소
  - `Tab/Shift+Tab`(editor): 커밋 후 다음/이전 editable cell로 이동 및 편집 지속

## Focus/ARIA Behavior
- root(`.hgrid`)가 keyboard focus를 유지하고 active cell은 `aria-activedescendant`로 추적한다.
- 편집 시작 시 input focus로 전환, 편집 종료 후 grid focus/selection 상태를 복원한다.
- 편집 중 validation 실패 시 editor를 유지하고 이동을 차단한다.

## Verification
- Unit/integration (`grid.spec.ts`)
  - `Ctrl/Cmd+A` 전체 선택 범위 검증
  - `F2` + `Tab/Shift+Tab` 편집 이동/커밋 검증
  - editor `Escape` cancel 후 root focus / `aria-activedescendant` 복원 검증
- E2E (`scripts/run-e2e.mjs`)
  - `example39.html` keyboard-only 시나리오 검증
  - `example38.html` ARIA snapshot 경로 점검
  - `example97.html` grouped / pivot / tree / editor cancel focus regression 검증

## E6.2 Focus Regression
- pooled DOM 재사용 중에도 root focus identity가 흔들리지 않아야 한다.
- grouped / pivot / tree 상태에서도 `aria-activedescendant` 전제조건이 유지되어야 한다.
- editor overlay가 닫힐 때 root focus와 active descendant가 일관되게 복원되어야 한다.
- 상세 회귀 범위: [focus-regression-phase-e6.md](./focus-regression-phase-e6.md)
