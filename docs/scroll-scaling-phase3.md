# Phase 3.1 Scroll Height Limit Definition

## Constants and Formulas
- `MAX_SCROLL_PX = 16,000,000`
- `virtualHeight = rowCount * rowHeight`
- `scrollHeight = min(virtualHeight, MAX_SCROLL_PX)`
- `virtualMaxScrollTop = max(0, virtualHeight - viewportHeight)`
- `physicalMaxScrollTop = max(0, scrollHeight - viewportHeight)`
- `scale = virtualMaxScrollTop / physicalMaxScrollTop` (`physicalMaxScrollTop == 0`이면 `1`)

## Applied Location
- Core utility: `packages/grid-core/src/virtualization/scroll-scaling.ts`
- Renderer integration: `packages/grid-core/src/render/dom-renderer.ts`
  - `updateSpacerSize()`에서 scale metrics 계산/적용
  - y-scroll source `.hgrid__v-scroll` + `.hgrid__v-spacer`에 physical track 적용
- RowModel precondition: `packages/grid-core/src/data/row-model.ts`
  - identity 모드에서 full `Int32Array`를 즉시 생성하지 않는 lazy mapping으로 100M 초기화 비용을 제한

## Mapping Notes
- Renderer state는 `virtualMaxScrollTop`/`physicalMaxScrollTop`을 항상 유지한다.
- `getState().scrollTop`은 virtual scrollTop으로 직렬화된다.
- `setState({ scrollTop })`은 virtual scrollTop을 physical track으로 매핑 후 적용한다.

## Validation
- Unit: `packages/grid-core/test/scroll-scaling.spec.ts`
- Integration: `packages/grid-core/test/grid.spec.ts`
