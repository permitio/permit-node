import { fileURLToPath } from 'node:url';

import {
  defineConfig,
  type TestProjectInlineConfiguration,
  type TestUserConfig,
} from 'vitest/config';

type ProjectOptions = NonNullable<TestProjectInlineConfiguration['test']>;

// The integration and e2e suites share one Permit environment. A project with `isolate: true`,
// `maxWorkers: 1` and the default `sequence.groupOrder` has its files placed in Vitest's single
// sequential group, which runs one file at a time, so the backend files never overlap, even when
// both projects run in the same `vitest run`. `bail: 1` stops the run at the first failure, so
// later files don't wait out their propagation budgets against an environment left in an
// unknown state. afterAll hooks still run after a bail or a test timeout.
const serialBackend: ProjectOptions = {
  globals: true,
  pool: 'forks',
  isolate: true,
  maxWorkers: 1,
  fileParallelism: false,
  bail: 1,
  testTimeout: 300_000,
  hookTimeout: 300_000,
};

const projects: TestProjectInlineConfiguration[] = [
  { test: { name: 'codegen', include: ['scripts/check-codegen.spec.mjs', 'scripts/*.test.mjs'] } },
  {
    test: {
      name: 'unit',
      globals: true,
      include: ['src/tests/unit/**/*.spec.ts', 'src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'module-imports',
      globals: true,
      include: ['src/tests/module-imports/**/*.spec.ts'],
    },
  },
  {
    test: { name: 'integration', include: ['src/tests/endpoints/**/*.spec.ts'], ...serialBackend },
  },
  { test: { name: 'e2e', include: ['src/tests/e2e/**/*.spec.ts'], ...serialBackend } },
];

// Inline projects don't inherit root test options, so only run-wide settings belong here.
const test: TestUserConfig = {
  projects: projects.map((project) => ({
    ...project,
    resolve: {
      alias: {
        '#src': fileURLToPath(new URL('./src', import.meta.url)),
        '#scripts': fileURLToPath(new URL('./scripts', import.meta.url)),
      },
    },
  })),
  coverage: {
    provider: 'v8',
    include: ['src/utils/retry.ts', 'src/utils/retry-interceptor.ts'],
    reporter: ['text', 'html', 'lcov'],
  },
};

export default defineConfig({ test });
