import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, onTestFinished, test } from 'vitest';

import { evaluateTestReport } from '#scripts/test-report.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const boundary = 'src/api/http-boundary.test.ts';
const scopeFile = 'src/tests/endpoints/test-environments.spec.ts';
const scopeTitle = 'environment creation with org level api key';
const scopeReason = 'ORG_PDP_API_KEY is not set; ORGANIZATION_LEVEL_API_KEY coverage unavailable';

function result(file, assertions) {
  return {
    name: join(root, file),
    status: 'passed',
    assertionResults: assertions.map((assertion) => ({
      meta: {},
      ancestorTitles: [],
      fullName: assertion.title,
      ...assertion,
    })),
  };
}

function report(results) {
  const tests = results.flatMap((entry) => entry.assertionResults);
  return {
    success: true,
    numTotalTests: tests.length,
    numPassedTests: tests.filter((entry) => entry.status === 'passed').length,
    numFailedTests: tests.filter((entry) => entry.status === 'failed').length,
    numPendingTests: tests.filter((entry) => entry.status === 'skipped').length,
    numTodoTests: 0,
    numFailedTestSuites: 0,
    numPendingTestSuites: 0,
    testResults: results,
  };
}

function evaluate(raw, expectedFiles = { unit: [boundary] }, env = {}) {
  return evaluateTestReport(raw, { root, expectedFiles, env });
}

test('accepts executed tests without fixing the total count', () => {
  for (const count of [1, 7]) {
    const raw = report([
      result(
        boundary,
        Array.from({ length: count }, (_, index) => ({
          title: `boundary ${index}`,
          status: 'passed',
        })),
      ),
    ]);
    expect(evaluate(raw)).toMatchObject({ status: 'PASS', executed: count, errors: [] });
  }
});

test.each([
  ['missing', undefined],
  ['empty', report([])],
  ['unsuccessful', { ...report([]), success: false }],
  ['no assertions', report([result(boundary, [])])],
  ['missing counts', { success: true, testResults: [result(boundary, [])] }],
])('rejects %s native reports', (_name, raw) => {
  expect(evaluate(raw).status).toBe('FAIL');
});

test.each(['failed', 'pending', 'todo', 'disabled', 'skipped'])(
  'rejects unexpected %s tests',
  (status) => {
    const raw = report([result(boundary, [{ title: 'boundary', status }])]);
    expect(evaluate(raw).status).toBe('FAIL');
  },
);

test('requires each selected project and its files to execute', () => {
  const raw = report([result(boundary, [{ title: 'boundary', status: 'passed' }])]);
  const expected = { unit: [boundary], 'module-imports': ['src/tests/module-imports/cjs.spec.ts'] };
  expect(evaluate(raw, expected).errors).toEqual(
    expect.arrayContaining([
      'Missing test file: src/tests/module-imports/cjs.spec.ts',
      'No tests executed in module-imports',
    ]),
  );
});

test('rejects duplicate files and inconsistent native counts', () => {
  const file = result(boundary, [{ title: 'boundary', status: 'passed' }]);
  expect(evaluate(report([file, file])).status).toBe('FAIL');
  expect(evaluate({ ...report([file]), numPassedTests: 2 }).status).toBe('FAIL');
});

test('reports an absent optional scope as UNAVAILABLE alongside actual execution', () => {
  const raw = report([
    result(boundary, [{ title: 'boundary', status: 'passed' }]),
    result(scopeFile, [
      {
        title: scopeTitle,
        status: 'skipped',
        meta: {
          coverageUnavailable: scopeReason,
        },
      },
    ]),
  ]);
  const summary = evaluate(raw, { integration: [boundary, scopeFile] });
  expect(summary).toMatchObject({ status: 'PARTIAL', executed: 1, errors: [] });
  expect(summary.limitations).toStrictEqual([
    { file: scopeFile, test: scopeTitle, status: 'UNAVAILABLE', reason: scopeReason },
  ]);
});

test('rejects all-skipped projects even when every skip has a known reason', () => {
  const raw = report([
    result(scopeFile, [
      {
        title: scopeTitle,
        status: 'skipped',
        meta: {
          coverageUnavailable: scopeReason,
        },
      },
    ]),
  ]);
  expect(evaluate(raw, { integration: [scopeFile] }).status).toBe('FAIL');
});

test.each([
  [
    'nested suite',
    { ancestorTitles: ['unapproved suite'], fullName: `unapproved suite ${scopeTitle}` },
  ],
  ['missing ancestors', { ancestorTitles: undefined }],
  ['missing full name', { fullName: undefined }],
  ['inconsistent full name', { fullName: `another ${scopeTitle}` }],
])('rejects an approved leaf title with %s', (_name, qualification) => {
  const raw = report([
    result(scopeFile, [
      { title: 'executed control', status: 'passed' },
      {
        title: scopeTitle,
        status: 'skipped',
        meta: { coverageUnavailable: scopeReason },
        ...qualification,
      },
    ]),
  ]);
  expect(evaluate(raw, { integration: [scopeFile] }).status).toBe('FAIL');
});

test('rejects repeated approved omissions despite actual execution', () => {
  const skip = {
    title: scopeTitle,
    status: 'skipped',
    meta: { coverageUnavailable: scopeReason },
  };
  const raw = report([
    result(scopeFile, [{ title: 'executed control', status: 'passed' }, skip, skip]),
  ]);
  const summary = evaluate(raw, { integration: [scopeFile] });
  expect(summary.status).toBe('FAIL');
  expect(summary.errors).toContain(`Duplicate approved skip: ${scopeFile}: ${scopeTitle}`);
  expect(summary.limitations).toHaveLength(1);
});

test.each([
  ['wrong file', boundary, scopeTitle, scopeReason, {}],
  ['wrong title', scopeFile, 'another scope', scopeReason, {}],
  ['missing reason', scopeFile, scopeTitle, undefined, {}],
  ['wrong reason', scopeFile, scopeTitle, 'network failed', {}],
  ['supplied key', scopeFile, scopeTitle, scopeReason, { ORG_PDP_API_KEY: 'supplied-key' }],
])('rejects optional skips with %s', (_name, file, title, reason, env) => {
  const raw = report([
    result(boundary, [{ title: 'executed boundary', status: 'passed' }]),
    result(file, [{ title, status: 'skipped', meta: { coverageUnavailable: reason } }]),
  ]);
  expect(evaluate(raw, { integration: [...new Set([boundary, file])] }, env).status).toBe('FAIL');
});

test('keeps PER-16553 blocked and OPA availability distinct from passed coverage', () => {
  const abac = 'src/tests/e2e/condition-sets.e2e.spec.ts';
  const rbac = 'src/tests/e2e/rbac.e2e.spec.ts';
  const raw = report([
    result(abac, [
      { title: 'condition set persistence', status: 'passed' },
      {
        title: 'ABAC decisions (pending PER-16553)',
        status: 'skipped',
        meta: {
          coverageUnavailable: 'PER-16553: condition-set policy does not reliably reach the PDP',
        },
      },
    ]),
    result(rbac, [
      {
        title: 'useOpa checks go to OPA directly (PERMIT_RUN_OPA_E2E=true)',
        status: 'skipped',
        meta: {
          coverageUnavailable: 'PERMIT_RUN_OPA_E2E is not true; direct OPA coverage unavailable',
        },
      },
    ]),
  ]);
  const expected = { e2e: [abac, rbac] };
  expect(evaluate(raw, expected).limitations.map((entry) => entry.status)).toStrictEqual([
    'BLOCKED',
    'UNAVAILABLE',
  ]);
  expect(evaluate(raw, expected, { PERMIT_RUN_OPA_E2E: 'true' }).status).toBe('FAIL');
});

test('missing primary credentials exit nonzero without starting any backend tests', () => {
  const env = { ...process.env };
  delete env['PDP_API_KEY'];
  const run = spawnSync(process.execPath, ['scripts/run-tests.mjs', 'integration'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(run.status, run.stderr).toBe(2);
  expect(JSON.parse(run.stdout)).toMatchObject({ status: 'UNAVAILABLE', executed: 0 });
  expect(run.stdout).not.toContain('RUN ');
});

test('uses the real pinned JSON reporter metadata and skip status', () => {
  const directory = mkdtempSync(join(tmpdir(), 'permit-report-'));
  onTestFinished(() => {
    for (const file of ['node_modules', 'vitest.config.mjs', 'report.test.mjs', 'report.json']) {
      unlinkSync(join(directory, file));
    }
    rmdirSync(directory);
  });
  symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
  writeFileSync(
    join(directory, 'vitest.config.mjs'),
    "export default { test: { include: ['*.test.mjs'] } };\n",
  );
  writeFileSync(
    join(directory, 'report.test.mjs'),
    `
import { test, expect } from 'vitest';
test('executed', () => expect(1).toBe(1));
test.skip('known limitation', { meta: { coverageUnavailable: 'known reason' } }, () => {});
`,
  );
  const output = join(directory, 'report.json');
  const run = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--reporter=json',
      `--outputFile=${output}`,
      '--maxWorkers=1',
    ],
    { cwd: directory, encoding: 'utf8', timeout: 15_000 },
  );
  expect(run.status, run.stderr).toBe(0);
  const native = JSON.parse(readFileSync(output, 'utf8'));
  expect(native).toMatchObject({ success: true, numPassedTests: 1, numPendingTests: 1 });
  expect(native.testResults[0].assertionResults[1]).toMatchObject({
    status: 'skipped',
    meta: { coverageUnavailable: 'known reason' },
  });
});
