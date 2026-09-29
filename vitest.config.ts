import { defineConfig } from 'vitest/config';

// Backend suites (integration + e2e) mutate shared Permit backend state, so they
// run one file at a time (replicating AVA's separate sequential processes).
//
// IMPORTANT: `fileParallelism: false` / `maxWorkers: 1` only serialize files
// WITHIN a single project. They do NOT make the `integration` and `e2e`
// projects mutually exclusive. Cross-project isolation relies on each suite
// running in its OWN `vitest run` invocation. A bare `vitest run` (all projects)
// or `vitest run --project integration --project e2e` would schedule both
// backend suites together and let them interleave on the shared environment,
// corrupting state. Run them only via the supported entry points, which invoke
// each project separately: `yarn test:integration`, `yarn test:e2e`, or
// `yarn test:ci:full` (which chains the separate invocations).
const serialBackend = {
  // Vitest 4 removed `poolOptions`; `singleFork` is replaced by the top-level
  // `fileParallelism: false` (which pins this project to a single worker), so
  // these backend files run one at a time in one forked process.
  fileParallelism: false,
  sequence: { concurrent: false },
  pool: 'forks' as const,
  maxWorkers: 1,
  isolate: true,
  testTimeout: 300_000,
  hookTimeout: 300_000,
};

export default defineConfig({
  test: {
    globals: true,
    include: ['src/tests/**/*.spec.ts'],
    projects: [
      { test: { name: 'unit', globals: true, include: ['src/tests/unit/**/*.spec.ts'] } },
      {
        test: {
          name: 'module-imports',
          globals: true,
          include: ['src/tests/module-imports/**/*.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          globals: true,
          include: ['src/tests/endpoints/**/*.spec.ts'],
          ...serialBackend,
        },
      },
      {
        test: {
          name: 'e2e',
          globals: true,
          include: ['src/tests/e2e/**/*.spec.ts'],
          ...serialBackend,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/utils/retry.ts', 'src/utils/retry-interceptor.ts'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
