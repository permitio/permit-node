import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { checkGateResults } from '#scripts/check-release-gates.mjs';
import { validateReviewedVersion } from '#scripts/check-release-tag.mjs';
import { expectedReleaseInventory } from '#scripts/release-evidence.mjs';

const names = [
  'lint',
  'types',
  'docs',
  'unit',
  'workflow-validation',
  'codegen-guard',
  'build-candidate',
  'packed-consumers',
  'dependency-security',
];
const good = () => Object.fromEntries(names.map((name) => [name, { result: 'success' }]));

test('actual candidate dependencies require docs before archive and aggregate success', () => {
  const workflow = readFileSync('.github/workflows/release-candidate.yaml', 'utf8');
  const ready = workflow.slice(workflow.indexOf('  candidate-ready:'));
  const dependencies = ready
    .match(/needs:\s*\[([^\]]+)\]/)[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const results = Object.fromEntries(dependencies.map((name) => [name, { result: 'success' }]));
  expect(() => checkGateResults(results, 'candidate')).not.toThrow();
  results['docs'] = { result: 'skipped' };
  expect(() => checkGateResults(results, 'candidate')).toThrow('docs');
  const build = workflow.slice(workflow.indexOf('  build-candidate:'));
  expect(
    build
      .match(/needs:\s*\[([^\]]+)\]/)[1]
      .split(',')
      .map((name) => name.trim()),
  ).toContain('docs');
});

test('quality can pass while publication acceptance remains unavailable', () => {
  expect(() => checkGateResults(good(), 'candidate')).not.toThrow();
  expect(() =>
    checkGateResults(
      { candidate: { result: 'success' }, 'publication-acceptance': { result: 'failure' } },
      'publication',
    ),
  ).toThrow('Required publication checks did not succeed: publication-acceptance.');
  const workflow = readFileSync('.github/workflows/node_sdk_publish.yaml', 'utf8');
  const job = workflow.slice(
    workflow.indexOf('\n  publication-acceptance:\n'),
    workflow.indexOf('\n  publish_node_sdk:\n'),
  );
  const steps = [...job.matchAll(/^ {8}run: (.+)$/gmu)].map((match) => match[1]);
  expect(steps).toEqual(['node scripts/check-publication-readiness.mjs']);
  const output = mkdtempSync(join(tmpdir(), 'permit-readiness-quality-'));
  onTestFinished(() => rmSync(output, { recursive: true, force: true }));
  const { requiredGates } = JSON.parse(readFileSync('api-coverage/node-acceptance.json', 'utf8'));
  const run = spawnSync(process.execPath, [steps[0].replace(/^node /u, ''), '--output', output], {
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'permitio/permit-node',
      GITHUB_EVENT_NAME: 'release',
      GITHUB_ACTOR: 'release-maintainer',
      GITHUB_WORKFLOW_REF:
        'permitio/permit-node/.github/workflows/node_sdk_publish.yaml@refs/tags/v3.0.0',
      GITHUB_RUN_ID: '1',
      GITHUB_RUN_ATTEMPT: '1',
      GATE_RESULTS: JSON.stringify(
        Object.fromEntries(requiredGates.map((name) => [name, { result: 'success' }])),
      ),
    },
  });
  expect(run.status, run.stderr).toBe(2);
  expect(run.stderr).toContain(
    'Release evidence inspection failed. Check the reviewed inputs and CI identity.',
  );
  expect(JSON.parse(readFileSync(join(output, 'report.json'), 'utf8'))).toMatchObject({
    schema: 2,
    scope: 'permit-node',
    nodeEvidence: 'INVALID',
    exitCode: 2,
    nodeReleaseReady: false,
    releaseReady: false,
    incomplete: ['Independent input inspection failed; consult local diagnostics.'],
  });
});

for (const name of names) {
  test.each(['failure', 'skipped', 'cancelled', undefined])('%s cannot pass ' + name, (result) => {
    const results = good();
    results[name] = { result };
    expect(() => checkGateResults(results, 'candidate')).toThrow(name);
  });
  test(`a missing ${name} cannot pass`, () => {
    const results = good();
    delete results[name];
    expect(() => checkGateResults(results, 'candidate')).toThrow('Missing');
  });
}

test.each([
  null,
  [],
  {},
  { unexpected: { result: 'success' } },
  { ...good(), unexpected: { result: 'success' } },
])('rejects malformed job evidence', (value) =>
  expect(() => checkGateResults(value, 'candidate')).toThrow(
    'Missing or unexpected required jobs for candidate.',
  ),
);

test.each(['3.0.0', 'v3.0.0', 'v3.0.0+reviewed'])('permits reviewed tag %s', (tag) => {
  expect(validateReviewedVersion({ version: '3.0.0', tag, prerelease: 'false' })).toBe('3.0.0');
});

test.each(['v2.7.7', 'v3.0.1', 'minor', 'v3.0.0$(touch injected)', 'v3.0.0-rc.1'])(
  'rejects tag %s before any version mutation',
  (tag) => {
    expect(() => validateReviewedVersion({ version: '3.0.0', tag, prerelease: 'false' })).toThrow();
  },
);

test('prerelease flag must match the already reviewed version', () => {
  expect(() =>
    validateReviewedVersion({ version: '3.0.0', tag: 'v3.0.0', prerelease: 'true' }),
  ).toThrow('prerelease');
  expect(() =>
    validateReviewedVersion({ version: '3.0.0-rc.1', tag: 'v3.0.0-rc.1', prerelease: 'false' }),
  ).toThrow('prerelease');
  expect(
    validateReviewedVersion({ version: '3.0.0-rc.1', tag: 'v3.0.0-rc.1', prerelease: 'true' }),
  ).toBe('3.0.0-rc.1');
  expect(validateReviewedVersion({ version: '3.0.0' })).toBe('3.0.0');
  expect(() => validateReviewedVersion({ version: 'v3.0.0' })).toThrow('normalized');
});

test('changing an unavailable label cannot fabricate accepted publication evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'permit-readiness-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  for (const folder of ['api-coverage', 'openapi'])
    cpSync(folder, join(root, folder), { recursive: true });
  const path = join(root, 'api-coverage/sources.json');
  const sources = JSON.parse(readFileSync(path, 'utf8'));
  expect(sources.unmeasuredCapabilities.sharedTarget.status).toBe('UNAVAILABLE');
  sources.unmeasuredCapabilities.sharedTarget.status = 'ADOPTED';
  writeFileSync(path, JSON.stringify(sources));
  await expect(expectedReleaseInventory(root)).rejects.toThrow(
    'Source provenance changed without a reviewed contract baseline update.',
  );
});

const cloudNames = ['candidate', 'cloud-setup', 'cloud-test', 'cloud-cleanup'];
function cloudGood() {
  return Object.fromEntries(cloudNames.map((name) => [name, { result: 'success' }]));
}
test('PR cloud checks can pass without claiming full publication acceptance', () => {
  expect(() => checkGateResults(cloudGood(), 'cloud')).not.toThrow();
  expect(() => checkGateResults({ ...cloudGood(), extra: { result: 'success' } }, 'cloud')).toThrow(
    'Missing or unexpected required jobs for cloud.',
  );
  expect(() =>
    checkGateResults(
      { candidate: { result: 'success' }, 'publication-acceptance': { result: 'skipped' } },
      'publication',
    ),
  ).toThrow('did not succeed');
});
for (const name of cloudNames) {
  test.each(['failure', 'cancelled', 'skipped', undefined])(
    '%s prevents actual cloud completion for ' + name,
    (result) => {
      const jobs = cloudGood();
      jobs[name] = { result };
      expect(() => checkGateResults(jobs, 'cloud')).toThrow(name);
    },
  );
  test('missing cloud ' + name + ' cannot gain execution or cleanup credit', () => {
    const jobs = cloudGood();
    delete jobs[name];
    expect(() => checkGateResults(jobs, 'cloud')).toThrow('Missing');
  });
}
