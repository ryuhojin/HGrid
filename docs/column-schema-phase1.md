# Phase 1.2 Column Schema

## ColumnDef fields
Required:
- `id: string`
- `header: string`
- `width: number`
- `type: "text" | "number" | "date" | "boolean"`

Optional:
- `minWidth?: number`
- `maxWidth?: number`
- `editable?: boolean`
- `visible?: boolean`
- `formatter?: (value, row) => string`
- `comparator?: (a, b) => number`
- `valueGetter?: (row, column) => unknown`
- `valueSetter?: (row, value, column) => void`

## Value Getter/Setter Policy
- Read precedence: `valueGetter` is used first; otherwise `row[column.id]`.
- Render output: `formatter` is applied after value resolution.
- Write contract: `valueSetter` is reserved for editing flows and must be synchronous and side-effect scoped to the provided row object.
- E4.4 scope:
  - `valueGetter` is the supported core path for row-local derived values.
  - formula / expression authoring is not supported in `grid-core`.
  - future spreadsheet-like formula support must live in a plugin or app layer.

## Renderer Independence
Column state is managed in `data/column-model.ts` and renderer receives only resolved visible columns.
The following updates are applied without renderer-coupled state mutation logic:
- `setColumnOrder(columnIds)`
- `setColumnVisibility(columnId, isVisible)`
- `setColumnWidth(columnId, width)`
