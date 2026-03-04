import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const baseTsPlugin = typescript({
  tsconfig: './tsconfig.json',
  declaration: false,
  declarationMap: false,
  sourceMap: true
});

const minifyTsPlugin = typescript({
  tsconfig: './tsconfig.json',
  declaration: false,
  declarationMap: false,
  sourceMap: false
});

const baseOutput = {
  name: 'HGrid',
  exports: 'named'
};

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
    plugins: [baseTsPlugin]
  },
  {
    input: 'src/index.ts',
    output: {
      ...baseOutput,
      file: 'dist/grid.umd.min.js',
      format: 'umd',
      sourcemap: false
    },
    plugins: [minifyTsPlugin, terser()]
  }
];
