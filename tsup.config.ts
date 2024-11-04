import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    outDir: 'build/main',
    tsconfig: 'tsconfig.json',
    dts: true,
    clean: true,
  },
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    outDir: 'build/module',
    tsconfig: 'tsconfig.module.json',
    outExtension() {
      return {
        js: '.mjs',
      };
    },
    dts: true,
    clean: true,
  },
]);
