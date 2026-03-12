import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

function createTypescriptPlugin(sourceMap) {
  return typescript({
    tsconfig: './tsconfig.json',
    declaration: false,
    declarationMap: false,
    sourceMap
  });
}

const baseOutput = {
  name: 'HGrid',
  exports: 'named'
};

const workerEntries = [
  ['src/data/sort.worker.ts', 'dist/sort.worker.js', 'HGridSortWorker'],
  ['src/data/filter.worker.ts', 'dist/filter.worker.js', 'HGridFilterWorker'],
  ['src/data/group.worker.ts', 'dist/group.worker.js', 'HGridGroupWorker'],
  ['src/data/pivot.worker.ts', 'dist/pivot.worker.js', 'HGridPivotWorker'],
  ['src/data/tree.worker.ts', 'dist/tree.worker.js', 'HGridTreeWorker']
];

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        ...baseOutput,
        file: 'dist/grid.umd.js',
        format: 'umd',
        sourcemap: true
      },
      {
        file: 'dist/grid.esm.js',
        format: 'esm',
        sourcemap: true
      }
    ],
    plugins: [createTypescriptPlugin(true)]
  },
  {
    input: 'src/index.ts',
    output: {
      ...baseOutput,
      file: 'dist/grid.umd.min.js',
      format: 'umd',
      sourcemap: false
    },
    plugins: [createTypescriptPlugin(false), terser()]
  },
  ...workerEntries.map(([input, file, name]) => ({
    input,
    output: {
      file,
      format: 'iife',
      sourcemap: true,
      name
    },
    plugins: [createTypescriptPlugin(true)]
  }))
];
