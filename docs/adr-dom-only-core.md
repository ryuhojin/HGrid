# ADR: DOM-only Core Renderer

## Status
- Accepted

## Context
- HGrid는 레거시 JS, UMD(ES5), CSP, 접근성, 프레임워크 wrapper 공존을 동시에 만족해야 한다.
- Canvas/WebGL 기반 렌더러는 텍스트 선택, 표준 ARIA grid semantics, DOM inspection, 고객 커스터마이징, CSP 대응 비용을 높인다.

## Decision
- `grid-core`의 렌더링 엔진은 DOM-only로 유지한다.
- core에 Canvas, OffscreenCanvas, WebGL 렌러더링 경로를 추가하지 않는다.
- 성능 문제는 DOM pooling, virtualization, scroll scaling, data pipeline 최적화로 해결한다.

## Invariants
- 셀/행은 실제 DOM node로 존재한다.
- 기본 렌더 경로는 표준 DOM API와 CSS variable 기반 스타일만 사용한다.
- A11y, selection, editing, clipboard, CSP 대응은 DOM 경로를 기준으로 설계한다.

## Consequences
- 장점: CSP, A11y, 디버깅, 프레임워크 wrapper, 고객 확장성이 단순해진다.
- 단점: 초고밀도 그래픽 표현보다 DOM budget 관리와 pooling 설계가 더 중요해진다.
- 후속 원칙: 성능 회귀를 해결할 때도 렌더 백엔드 전환 대신 scroll path, pooling, worker, row model을 먼저 최적화한다.
