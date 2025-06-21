import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';

/**
 * @type {import('rollup').RollupOptions}
 */
export default {
  input: 'src/index.ts',
  output: {
    dir: 'build/module',
    format: 'esm',
    entryFileNames: '[name].mjs',
    preserveModules: true,
    preserveModulesRoot: 'src',
    sourcemap: true,
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.module.json',
      outDir: 'build/module',
      declaration: true,
      declarationDir: 'build/module',
      outputToFilesystem: true
    }),
    nodeResolve()
  ],
  external: [/node_modules/]
};