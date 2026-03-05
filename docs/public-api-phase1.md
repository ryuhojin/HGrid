# Phase 1.1 Public API Contract

## Core API (`@hgrid/grid-core`)
- `new Grid(container, config)`
- `destroy()`
- `setColumns(columns)`
- `setOptions(options)`
- `setColumnOrder(columnIds)`
- `setColumnVisibility(columnId, isVisible)`
- `setColumnWidth(columnId, width)`
- `setRowOrder(viewToData)`
- `setFilteredRowOrder(viewToData | null)`
- `resetRowOrder()`
- `setRowModelOptions(options)`
- `getRowModelState()`
- `resetRowHeights(rowIndexes?)`
- `setTheme(themeTokens)`
- `getState()`
- `setState(state)`
- `on(eventName, handler)`
- `off(eventName, handler)`

## Config/State Types
- `GridConfig`: partial runtime configuration for constructor and incremental updates.
- `GridOptions`: normalized runtime option shape.
- `GridState`: serializable view state.
  - `scrollTop` is logical (virtual) vertical offset, not raw native scrollbar offset.
- `ColumnDef`: includes formatter/comparator/valueGetter/valueSetter hooks.
- `DataProvider`: pluggable row access abstraction (`LocalDataProvider` default).
- `RowModelOptions`: row-model runtime options (`enableDataToViewIndex` can be toggled at runtime).
- `GridConfig` runtime virtualization options:
  - `overscan`: vertical row overscan count
  - `overscanCols`: horizontal center-column overscan count
  - `rowHeightMode`: `"fixed" | "estimated" | "measured"`
  - `estimatedRowHeight`: base row height used by variable-height mapping
  - `getRowHeight(rowIndex, dataIndex)`: estimated height resolver (optional)
- `ScrollbarPolicy`: scrollbar visibility contract for each axis.
  - `vertical: "auto" | "always" | "hidden"`
  - `horizontal: "auto" | "always" | "hidden"`

## Wrapper Contract
`@hgrid/grid-react` and `@hgrid/grid-vue` expose thin adapters with the same control API:
- `new ReactGridAdapter(container, config)` / `new VueGridAdapter(container, config)`
- `setColumns`, `setOptions`, `setColumnOrder`, `setColumnVisibility`, `setColumnWidth`
- `setRowOrder`, `setFilteredRowOrder`, `resetRowOrder`, `setRowModelOptions`, `getRowModelState`, `resetRowHeights`
- `setTheme`, `getState`, `setState`, `on`, `off`, `destroy`

These wrappers only delegate to `@hgrid/grid-core` and do not access core private internals.
