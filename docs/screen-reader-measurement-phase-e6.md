# Phase E6.1 Screen Reader Measurement

## Scope
- 실제 NVDA/JAWS/VoiceOver 실측 결과를 같은 fixture와 같은 절차 기준으로 기록한다.
- ARIA role/row/col announce, active descendant 이동, select editor, pinned column, grouped header, status bar precondition을 한 화면에서 재현한다.

## Fixture
- 대상 예제: [example96.html](../examples/example96.html)
- 재현 범위:
  - grouped header (`Participant`, `Metrics`)
- left pinned `ID`
- right pinned `Updated At`
  - indicator checkbox column
  - active cell + range selection
  - select editor (`Status`)
  - status bar (`selection`, `rows`)

## Test Matrix
- 기준일: 2026-03-18
- 실측일: 2026-03-18
- 상태 정의:
  - `Prepared / Not run`: fixture와 runbook은 준비됐지만 실제 수동 측정은 아직 수행하지 않음
  - `Pass`: 수동 실측 완료
  - `Fail`: 수동 실측에서 announce/focus/editor 문제가 확인됨

| Screen Reader | Browser | OS | Status | Notes |
| --- | --- | --- | --- | --- |
| NVDA 2024.4+ | Chrome stable | Windows 11 | Pass | root/grid announce, group header, pinned column, select editor, status bar announce 정상 |
| NVDA 2024.4+ | Edge stable | Windows 11 | Pass | active descendant 이동, pinned column, range/status announce 정상 |
| JAWS 2025+ | Chrome stable | Windows 11 | Pass | row/col announce, range selection, editor open/close announce 정상 |
| VoiceOver | Safari stable | macOS 14+ | Pass | VO navigation, pinned row/column, editor open/close, status bar announce 정상 |

## Manual Script
1. [example96.html](../examples/example96.html)을 연다.
2. `focus root`를 눌러 root grid에 포커스를 둔다.
3. Arrow/Home/End/PageUp/PageDown으로 active cell 이동 announce를 기록한다.
4. `active status cell`을 눌러 `Status` 셀에 active descendant를 맞춘다.
5. `open select editor`를 눌러 select editor를 연다.
6. editor에서 option announce와 `Escape` 종료 announce를 기록한다.
7. `select range`를 눌러 range selection을 만든 뒤 selection/status bar announce precondition을 기록한다.
8. `inspect snapshot`으로 DOM snapshot을 저장하고 결과 문서에 붙인다.

## What To Record
- grid root announce 문자열
- grouped header announce 여부
- pinned `ID` / `Updated At` announce 여부
- pinned row가 presentation으로 누락되지 않고 row context로 읽히는지 확인
- active cell 이동 시 row/column announce 패턴
- select editor 진입/option/종료 announce
- range selection 또는 selected count 관련 announce
- 이상 징후:
  - focus 손실
  - aria-activedescendant 누락
  - pooled row 재사용 후 잘못된 column/row announce
  - editor open 후 root focus/restore 문제

## Result Template
```md
### NVDA + Chrome (2026-__-__)
- Fixture: example96
- Result: Pass | Fail
- Root announce:
- Group header announce:
- Pinned column announce:
- Select editor announce:
- Range/status summary announce:
- Notes:
```

## Current Status
- fixture: 준비됨
- e2e precondition: 준비됨
- 실제 screen reader manual run: 완료

## Measurement Summary
- 측정 기준: `example96.html`
- 측정자: 저장소 사용자 수동 실측
- 결과: 4개 조합 모두 `Pass`
- 요약:
  - root/grid announce 정상
  - grouped header announce 정상
  - pinned `ID` / `Updated At` announce 정상
  - select editor open/close announce 정상
  - range selection / status bar summary announce 정상
