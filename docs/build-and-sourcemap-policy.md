# Build and Sourcemap Policy

- Development output: sourcemaps enabled for `dist/grid.umd.js` and `dist/grid.esm.js`.
- Production artifact: `dist/grid.umd.min.js` is minified without sourcemap by default.

This balances debugging needs in development and source exposure risk in production delivery.
