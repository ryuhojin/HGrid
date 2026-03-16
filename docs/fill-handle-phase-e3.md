# Phase E3.5 Drag / Fill / Range UX

## 목표
- selection range를 Excel/AG Grid 계열 사용자 기대에 맞게 fill handle로 확장할 수 있어야 한다.
- single-cell drag copy와 numeric series fill을 같은 interaction surface에서 처리한다.
- drag 결과 selection과 clipboard export가 일관되게 유지돼야 한다.

## 구현 범위
- `rangeHandle`
  - `enabled`
  - `mode: "fill" | "copy"`
- overlay fill handle
- drag preview range
- drag-to-copy
- 1D numeric series fill
- body edge drag auto-scroll
- 2D affine numeric matrix trend fill
- shared undo/redo integration(editor / clipboard / fillHandle)
- `editCommit.source = "fillHandle"`

## 동작 정책
- primary selection의 우하단 셀에만 fill handle을 노출한다.
- `editable` 일반 컬럼이 selection 안에 하나도 없으면 fill handle을 숨긴다.
- single-cell source는 `mode`와 무관하게 drag-to-copy로 반복한다.
- `mode: "fill"`에서만 1D numeric source를 arithmetic series로 확장한다.
  - vertical: `Nx1` numeric source를 같은 column width로 drag
  - horizontal: `1xN` numeric source를 같은 row height로 drag
- `mode: "fill"`에서 `NxM` numeric source가 affine matrix(`base + rowStep + columnStep`)를 만족하면 row/column을 동시에 trend로 확장한다.
- 2D source 또는 non-numeric source는 pattern repeat(copy)로 처리한다.
- drag pointer가 body edge 밖으로 나가면 auto-scroll을 계속 유지하고, preview selection은 clamp된 edge cell 기준으로 따라간다.
- drag 중에는 preview selection이 확장되고, pointer up 시점에만 실제 cell update를 적용한다.
- drag 후 selection은 preview rectangle을 유지하므로 copy/export가 같은 range를 본다.

## 현재 한계
- affine matrix가 아닌 복합 패턴, custom fill series builder는 아직 없다.
- dirty badge / save workflow와 묶인 richer editing product UX는 E4 범위다.

## 예제
- [example71.html](../examples/example71.html)
- [example81.html](../examples/example81.html)
- [example83.html](../examples/example83.html)
