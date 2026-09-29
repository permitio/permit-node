import { defineConfig } from 'tsup';

export default defineConfig({
  // The published artifact is the self-contained build/index.* bundle plus the
  // declarations that `tsc` emits (build:types). Tests import from src/, and the
  // module-import tests load only build/index.js and build/index.mjs.
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false,
  splitting: false,
  // Source maps are intentionally not emitted: they are not used by the test
  // suite and previously shipped ~77 MB of .map files in the published package
  // (see PER-15197).
  sourcemap: false,
  clean: true,
  outDir: 'build',
  target: 'node16',
});
