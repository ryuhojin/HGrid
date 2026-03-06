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

export default [
  {
    input: 'src/index.ts',
    external: ['xlsx'],
    output: [
      {
        file: 'dist/hgrid-excel.umd.js',
        format: 'umd',
        name: 'HGridExcel',
        exports: 'named',
        sourcemap: true,
        globals: {
          xlsx: 'XLSX'
        }
      },
      {
        file: 'dist/hgrid-excel.esm.js',
        format: 'esm',
        sourcemap: true
      }
    ],
    plugins: [baseTsPlugin]
  },
  {
    input: 'src/index.ts',
    external: ['xlsx'],
    output: {
      file: 'dist/hgrid-excel.umd.min.js',
      format: 'umd',
      name: 'HGridExcel',
      exports: 'named',
      sourcemap: false,
      globals: {
        xlsx: 'XLSX'
      }
    },
    plugins: [minifyTsPlugin, terser()]
  }
];
