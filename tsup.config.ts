import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts', '!src/tests/**'],
  format: ['cjs', 'esm'],
  dts: false,
  splitting: false,
  // Source maps are intentionally not emitted: they are not used by the test
  // suite and previously shipped ~77 MB of .map files in the published package
  // (see PER-15197). The published artifact is the self-contained build/index.*
  // bundle only; per-file outputs below exist solely so the test suite can
  // import internal modules by relative path.
  sourcemap: false,
  clean: true,
  outDir: 'build',
  target: 'node16',
});
