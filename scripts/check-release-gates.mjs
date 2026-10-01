import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const stages = {
  candidate: [
    'lint',
    'types',
    'unit',
    'workflow-validation',
    'codegen-guard',
    'build-candidate',
    'packed-consumers',
    'dependency-security',
  ],
  ci: ['candidate', 'test', 'cleanup'],
  publication: ['candidate', 'publication-acceptance'],
};

/** Requires every named dependency to succeed; skipped and cancelled jobs fail the gate. */
export function checkGateResults(results, stage) {
  const expected = stages[stage];
  if (
    !expected ||
    results === null ||
    typeof results !== 'object' ||
    Array.isArray(results) ||
    Object.keys(results).length !== expected.length ||
    expected.some((name) => !Object.hasOwn(results, name))
  )
    throw new Error(`Missing or unexpected required jobs for ${stage}.`);
  const failed = expected.filter((name) => results[name]?.result !== 'success');
  if (failed.length)
    throw new Error(`Required ${stage} checks did not succeed: ${failed.join(', ')}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  checkGateResults(JSON.parse(process.env['GATE_RESULTS'] ?? 'null'), process.env['GATE_STAGE']);
  console.log(`Required ${process.env['GATE_STAGE']} checks passed.`);
}
