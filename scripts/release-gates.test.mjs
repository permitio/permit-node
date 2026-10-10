import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test, vi } from 'vitest';
import { checkGateResults } from '#scripts/check-release-gates.mjs';
import { validateReviewedVersion } from '#scripts/check-release-tag.mjs';
import { main as checkEvidence } from '#scripts/check-release-evidence.mjs';

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

test('quality can pass while publication acceptance remains unavailable', async () => {
  expect(() => checkGateResults(good(), 'candidate')).not.toThrow();
  expect(() =>
    checkGateResults(
      { candidate: { result: 'success' }, 'publication-acceptance': { result: 'failure' } },
      'publication',
    ),
  ).toThrow('did not succeed');
  const root = mkdtempSync(join(tmpdir(), 'permit-readiness-quality-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  onTestFinished(() => vi.restoreAllMocks());
  expect(await checkEvidence(['--output', join(root, 'output')], root)).toBe(2);
  const report = JSON.parse(readFileSync(join(root, 'output/report.json'), 'utf8'));
  expect(report).toMatchObject({
    schema: 2,
    scope: 'permit-node',
    nodeReleaseReady: false,
    releaseReady: false,
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

test.each([null, [], {}, { unexpected: { result: 'success' } }])(
  'rejects malformed job evidence',
  (value) => expect(() => checkGateResults(value, 'candidate')).toThrow(),
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
  mkdirSync(join(root, 'api-coverage'));
  const sources = JSON.parse(readFileSync('api-coverage/sources.json', 'utf8'));
  sources.unmeasuredCapabilities.sharedTarget.status = 'ADOPTED';
  writeFileSync(join(root, 'api-coverage/sources.json'), JSON.stringify(sources));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  onTestFinished(() => vi.restoreAllMocks());
  expect(await checkEvidence(['--output', join(root, 'output')], root)).toBe(2);
  expect(JSON.parse(readFileSync(join(root, 'output/report.json'), 'utf8')).releaseReady).toBe(
    false,
  );
});

const cloudNames = ['candidate', 'cloud-setup', 'cloud-test', 'cloud-cleanup'];
function cloudGood() {
  return Object.fromEntries(cloudNames.map((name) => [name, { result: 'success' }]));
}
test('PR cloud checks can pass without claiming full publication acceptance', () => {
  expect(() => checkGateResults(cloudGood(), 'cloud')).not.toThrow();
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
