# ADR: Pooling Invariants

## Status
- Accepted

## Context
- HGrid의 핵심 성능 계약은 스크롤 중 DOM 생성/삭제를 피하고, 뷰포트 기준 상수 개수의 row/cell만 유지하는 것이다.
- 기능이 늘수록 selection, indicator, group/tree glyph, editor overlay가 pooling 계약을 우회하기 쉽다.

## Decision
- row/cell DOM은 pool로만 생성하고 스크롤 중 재사용한다.
- visible window 변화는 DOM node 교체가 아니라 state rebinding으로 처리한다.
- indicator checkbox, center column virtualization, pinned zone row도 같은 pooling 규칙을 따른다.

## Invariants
- row pool 크기는 `visible + overscan (+ variable row height extra)` 범위를 넘지 않는다.
- center cell pool은 `horizontal window capacity`를 기준으로 고정된다.
- 스크롤 path에서는 `append/remove/replaceChildren`가 발생하지 않는다.
- pooled row hide는 DOM 제거가 아니라 `display/rowState reset`으로 처리한다.

## Consequences
- 새 기능은 pool 외부에 임시 row/cell DOM을 만들 수 없다.
- row/cell state는 `DOM 생성`보다 `payload diff`와 `row binding state`로 표현해야 한다.
- 테스트는 pool size 유지, childList churn 부재, checkbox DOM 재사용을 계속 회귀 검증해야 한다.
