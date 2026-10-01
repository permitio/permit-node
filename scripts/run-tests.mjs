import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { discoverTestFiles, evaluateTestReport } from '#scripts/test-report.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const selections = {
  offline: ['unit', 'module-imports'],
  verify: ['unit', 'module-imports', 'codegen'],
  unit: ['unit'],
  coverage: ['unit'],
  'module-imports': ['module-imports'],
  codegen: ['codegen'],
  integration: ['integration'],
  e2e: ['e2e'],
};
const selection = process.argv[2];
const projects = Object.hasOwn(selections, selection) ? selections[selection] : undefined;
if (!projects || process.argv.length !== 3) {
  throw new Error(`Usage: node scripts/run-tests.mjs ${Object.keys(selections).join('|')}`);
}
const output = join(root, '.test-results');
mkdirSync(output, { recursive: true });
const reportPath = join(output, `${selection}.json`);
const summaryPath = join(output, `${selection}-summary.json`);
for (const path of [reportPath, summaryPath]) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function saveSummary(summary) {
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

if (projects.some((project) => ['integration', 'e2e'].includes(project))) {
  if (!process.env['PDP_API_KEY']?.trim()) {
    saveSummary({
      status: 'UNAVAILABLE',
      executed: 0,
      reason: 'PDP_API_KEY is not set; backend tests were not started',
    });
    process.exitCode = 2;
  }
}
if (!process.exitCode) {
  const expectedFiles = discoverTestFiles(root, projects);
  const child = spawn(
    process.execPath,
    [
      join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      ...projects.flatMap((project) => ['--project', project]),
      ...(selection === 'coverage' ? ['--coverage'] : []),
      '--reporter=default',
      '--reporter=json',
      `--outputFile=${reportPath}`,
    ],
    { cwd: root, stdio: 'inherit' },
  );
  const exit = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  let summary;
  try {
    summary = evaluateTestReport(JSON.parse(readFileSync(reportPath, 'utf8')), {
      root,
      expectedFiles,
      env: process.env,
    });
  } catch (error) {
    summary = {
      status: 'FAIL',
      executed: 0,
      errors: [`Native report unavailable: ${error.message}`],
    };
  }
  if (exit.code !== 0 || exit.signal) {
    summary.status = 'FAIL';
    summary.errors.push(`Vitest exited with ${exit.signal ?? exit.code}`);
  }
  saveSummary(summary);
  process.exitCode = summary.status === 'FAIL' ? 1 : 0;
}
