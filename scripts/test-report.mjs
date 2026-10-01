import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const optionalScopes = [
  {
    title: 'environment creation with org level api key',
    variable: 'ORG_PDP_API_KEY',
    level: 'ORGANIZATION_LEVEL_API_KEY',
  },
  {
    title: 'environment creation with project level api key',
    variable: 'PROJECT_PDP_API_KEY',
    level: 'PROJECT_LEVEL_API_KEY',
  },
];

/** Discovers the current configured suites without fixing their test counts. */
export function discoverTestFiles(root, projects) {
  const files = [];
  function visit(directory) {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else files.push(path);
    }
  }
  visit('src');
  visit('scripts');
  return Object.fromEntries(
    projects.map((project) => [
      project,
      files.filter((file) => {
        switch (project) {
          case 'unit':
            return (
              (file.startsWith('src/tests/unit/') && file.endsWith('.spec.ts')) ||
              (file.startsWith('src/') && file.endsWith('.test.ts'))
            );
          case 'module-imports':
            return file.startsWith('src/tests/module-imports/') && file.endsWith('.spec.ts');
          case 'integration':
            return file.startsWith('src/tests/endpoints/') && file.endsWith('.spec.ts');
          case 'e2e':
            return file.startsWith('src/tests/e2e/') && file.endsWith('.spec.ts');
          case 'codegen':
            return (
              file === 'scripts/check-codegen.spec.mjs' || /^scripts\/[^/]+\.test\.mjs$/.test(file)
            );
          default:
            throw new Error(`Unknown test project: ${project}`);
        }
      }),
    ]),
  );
}

function allowedSkip(file, test, env) {
  if (
    test.fullName !== test.title ||
    !Array.isArray(test.ancestorTitles) ||
    test.ancestorTitles.length !== 0
  ) {
    return undefined;
  }
  let reason;
  let status = 'UNAVAILABLE';
  if (file === 'src/tests/endpoints/test-environments.spec.ts') {
    const scope = optionalScopes.find((entry) => entry.title === test.title);
    if (scope && !env[scope.variable]?.trim()) {
      reason = `${scope.variable} is not set; ${scope.level} coverage unavailable`;
    }
  }
  if (
    file === 'src/tests/e2e/condition-sets.e2e.spec.ts' &&
    test.title === 'ABAC decisions (pending PER-16553)'
  ) {
    reason = 'PER-16553: condition-set policy does not reliably reach the PDP';
    status = 'BLOCKED';
  }
  if (
    file === 'src/tests/e2e/rbac.e2e.spec.ts' &&
    test.title === 'useOpa checks go to OPA directly (PERMIT_RUN_OPA_E2E=true)' &&
    env['PERMIT_RUN_OPA_E2E'] !== 'true'
  ) {
    reason = 'PERMIT_RUN_OPA_E2E is not true; direct OPA coverage unavailable';
  }
  return reason && test.meta?.coverageUnavailable === reason
    ? { file, test: test.title, status, reason }
    : undefined;
}

/**
 * Checks a native Vitest JSON report for actual execution and explicitly named limitations.
 * Missing files, empty reports, unexpected skips and inconsistent counts fail the gate.
 */
export function evaluateTestReport(report, { root, expectedFiles, env = {} }) {
  const errors = [];
  const limitations = [];
  const executedByProject = Object.fromEntries(Object.keys(expectedFiles).map((name) => [name, 0]));
  let executed = 0;
  let total = 0;
  let skipped = 0;
  const seen = new Set();
  const approvedSkips = new Set();
  const required = new Set(Object.values(expectedFiles).flat());
  if (!report || report.success !== true || !Array.isArray(report.testResults)) {
    errors.push('Missing or unsuccessful native Vitest report');
  }
  for (const result of Array.isArray(report?.testResults) ? report.testResults : []) {
    if (typeof result.name !== 'string' || !Array.isArray(result.assertionResults)) {
      errors.push('Malformed test file result');
      continue;
    }
    const file = relative(root, result.name).replaceAll('\\', '/');
    if (!required.has(file) || seen.has(file))
      errors.push(`Unexpected or duplicate test file: ${file}`);
    seen.add(file);
    if (result.status !== 'passed') errors.push(`Test file did not pass: ${file}`);
    if (result.assertionResults.length === 0) errors.push(`No tests collected in ${file}`);
    const project = Object.keys(expectedFiles).find((name) => expectedFiles[name].includes(file));
    for (const test of result.assertionResults) {
      total++;
      if (test.status === 'passed') {
        executed++;
        if (project) executedByProject[project]++;
      } else if (test.status === 'skipped') {
        skipped++;
        const limitation = allowedSkip(file, test, env);
        const identity = `${file}: ${test.fullName}`;
        if (!limitation) errors.push(`Unexpected or unreasoned skip: ${identity}`);
        else if (approvedSkips.has(identity)) errors.push(`Duplicate approved skip: ${identity}`);
        else {
          approvedSkips.add(identity);
          limitations.push(limitation);
        }
      } else {
        errors.push(`Test did not execute successfully: ${file}: ${test.title} (${test.status})`);
      }
    }
  }
  for (const file of required) {
    if (!seen.has(file)) errors.push(`Missing test file: ${file}`);
  }
  for (const [project, count] of Object.entries(executedByProject)) {
    if (count === 0) errors.push(`No tests executed in ${project}`);
  }
  if (executed === 0) errors.push('No tests executed');
  if (
    report?.numTotalTests !== total ||
    report?.numPassedTests !== executed ||
    report?.numPendingTests !== skipped ||
    report?.numFailedTests !== 0 ||
    report?.numTodoTests !== 0 ||
    report?.numFailedTestSuites !== 0 ||
    report?.numPendingTestSuites !== 0
  ) {
    errors.push('Native report counts are missing or inconsistent');
  }
  return {
    status: errors.length ? 'FAIL' : limitations.length ? 'PARTIAL' : 'PASS',
    executed,
    executedByProject,
    limitations,
    errors,
  };
}
