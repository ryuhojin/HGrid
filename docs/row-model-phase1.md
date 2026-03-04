# Phase 1.4 RowModel (Index-based)

## Core Principle
- Data rows stay in `DataProvider` and are never reordered in-place.
- View order is controlled only by index mappings in `RowModel`.

## Mapping Structure
- Base order: `viewToData: Int32Array` (length = `rowCount`)
- Optional filter order: `filterViewToData: Int32Array | null` (length <= `rowCount`)
- Optional reverse index: `dataToView?: Int32Array`

## Toggle Policy (`dataToView`)
- Default: disabled (`enableDataToViewIndex: false`) to save memory.
- Runtime toggle: `setRowModelOptions({ enableDataToViewIndex: true|false })`
- Memory note: `Int32Array(10_000_000)` is roughly 40MB.

## Public Control API
- `setRowOrder(viewToData)`
- `setFilteredRowOrder(viewToData | null)`
- `resetRowOrder()`
- `setRowModelOptions(options)`
- `getRowModelState()`

## Acceptance Alignment
- DataProvider replacement does not require Grid API change.
- Sorting/filtering can later switch mappings only, keeping provider data immutable.
