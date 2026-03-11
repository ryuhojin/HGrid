# ADR: Virtualization Invariants

## Status
- Accepted

## Context
- HGrid는 fixed/estimated/measured row height, center column virtualization, 10M+ scroll scaling, grouping/tree/pivot 파생 뷰를 함께 다뤄야 한다.
- 이 조합에서는 `scrollTop -> row window -> DOM transform` 경로가 흔들리면 selection, focus, edit overlay, aria mapping이 모두 같이 깨진다.

## Decision
- virtualization의 기준 좌표는 `virtual scroll top`과 `view row index`로 통일한다.
- physical scroll은 scaling 계층이고, render window 계산은 virtual 좌표 기준으로 수행한다.
- row model mapping은 renderer가 직접 변경하지 않고 data pipeline/row model contract를 통해서만 갱신한다.

## Invariants
- `pendingVirtualScrollTop`, `renderedStartRow`, `renderedViewportOffsetY` 조합으로 현재 render window를 설명할 수 있어야 한다.
- overscan 적용 후 start row와 horizontal window는 순수 계산으로 재현 가능해야 한다.
- active cell, aria row/col index, edit overlay rect는 현재 render window와 일관된 좌표를 가져야 한다.
- grouping/tree/pivot 적용 시에도 renderer는 `view index -> data index` 계약만 신뢰한다.

## Consequences
- scroll hot path 계산은 별도 helper/module로 유지하고, DOM write와 섞지 않는다.
- derived view 변경은 row model contract 경계에서 끝내고 renderer private state를 직접 조작하지 않는다.
- 회귀 테스트는 scroll scaling, horizontal virtualization, active descendant, selection window를 함께 검증해야 한다.
