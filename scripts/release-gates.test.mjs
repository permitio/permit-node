import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { checkGateResults } from '#scripts/check-release-gates.mjs';
import { validateReviewedVersion } from '#scripts/check-release-tag.mjs';
import { publicationBlockers } from '#scripts/check-publication-readiness.mjs';

const names = [
  'lint',
  'types',
  'unit',
  'workflow-validation',
  'codegen-guard',
  'build-candidate',
  'packed-consumers',
  'dependency-security',
];
const good = () => Object.fromEntries(names.map((name) => [name, { result: 'success' }]));

test('quality can pass while publication acceptance remains unavailable', () => {
  expect(() => checkGateResults(good(), 'candidate')).not.toThrow();
  expect(() =>
    checkGateResults(
      { candidate: { result: 'success' }, 'publication-acceptance': { result: 'failure' } },
      'publication',
    ),
  ).toThrow('did not succeed');
  expect(publicationBlockers().join(' ')).toContain('PER-16345');
  expect(publicationBlockers().join(' ')).toContain('PER-16574');
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

test('changing an unavailable label cannot fabricate accepted publication evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'permit-readiness-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'api-coverage'));
  const sources = JSON.parse(readFileSync('api-coverage/sources.json', 'utf8'));
  sources.unmeasuredCapabilities.sharedTarget.status = 'ADOPTED';
  writeFileSync(join(root, 'api-coverage/sources.json'), JSON.stringify(sources));
  expect(publicationBlockers(root).join(' ')).toContain('reviewed acceptance contract');
});
