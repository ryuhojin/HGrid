# Phase 9.2 - Tree Data

## 목표
- `parentId` 모델을 코어 계약으로 확정한다.
- expand/collapse 상태를 키 기반으로 관리한다.
- 서버 지연 로딩(lazy children) 훅을 제공한다.

## 구현 범위
- `packages/grid-core/src/core/grid-options.ts`
  - `treeData` 옵션 추가:
    - `enabled`, `mode`, `idField`, `parentIdField`, `hasChildrenField`, `treeColumnId`
    - `defaultExpanded`, `rootParentValue`, `loadChildren`
  - `GridState.treeExpansionState` 추가

- `packages/grid-core/src/data/tree-executor.ts`
  - source order + parentId 기반 트리 플래튼
  - key token 기반 expansion 반영
  - lazy children batch 병합
  - cooperative yield/cancel 지원

- `packages/grid-core/src/data/tree-data-provider.ts`
  - 트리 view row를 DataProvider로 노출
  - 트리 메타 필드(`__hgrid_internal_tree_*`) 제공

- `packages/grid-core/src/core/grid.ts`
  - 트리 API:
    - `setTreeDataOptions`, `getTreeDataOptions`
    - `setTreeExpanded`, `toggleTreeExpanded`
    - `expandAllTreeNodes`, `collapseAllTreeNodes`
    - `getTreeRowsSnapshot`, `getTreeExpansionState`
  - 파이프라인 우선순위: `treeData > grouping > base`
  - `mode=server` + `loadChildren`에서 expand 시 lazy fetch 수행

- `packages/grid-core/src/render/dom-renderer.ts`, `grid.css`
  - tree depth 들여쓰기, expand glyph, tree cell class 렌더

## 동작 정책
- `treeData.enabled=true`일 때 트리 파이프라인이 그룹 파이프라인보다 우선 적용된다.
- `mode=server`는 `loadChildren` 훅 기반 lazy fetch를 의미한다.
- remote provider(`RemoteDataProvider`)와 tree 파이프라인 동시 적용은 현재 범위에서 제외한다.

## 검증
- unit:
  - `packages/grid-core/test/tree-executor.spec.ts`
  - `packages/grid-core/test/grid.spec.ts` (tree local + lazy load)
- example/e2e:
  - `examples/example32.html`
  - `scripts/run-e2e.mjs` Example32
