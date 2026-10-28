import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import semver from 'semver';
import { expect, onTestFinished, test } from 'vitest';

import { chooseDistTag, compareVersions, registryLatest } from '#scripts/npm-dist-tag.mjs';

test.each([
  ['3.0.0', undefined, 'latest'],
  ['3.0.0', '2.7.7', 'latest'],
  ['3.0.1', '3.0.0', 'latest'],
  ['3.0.0', '3.0.0-rc.4', 'latest'],
  ['2.7.8', '3.0.0', 'latest-2'],
  ['3.0.0', '3.0.0', 'latest-3'],
  ['3.0.1', '3.1.0', 'latest-3'],
  ['3.1.0-beta.2', '3.0.0', 'beta'],
  ['3.1.0-alpha.1', '3.0.0', 'alpha'],
  ['3.1.0-rc.1', '3.0.0', 'rc'],
  ['3.1.0-rc.1', undefined, 'rc'],
])('%s with registry latest %s publishes as %s', (version, latest, tag) => {
  expect(chooseDistTag({ version, latest })).toBe(tag);
});

test.each([
  ['3.1.0-next.1', undefined],
  ['3.1.0-1', undefined],
  ['v3.0.0', undefined],
  ['3.0.0+build', undefined],
  ['03.0.0', undefined],
  ['3.0.0', 'not-a-version'],
])('refuses %s with registry latest %s', (version, latest) => {
  expect(() => chooseDistTag({ version, latest })).toThrow();
});

test('precedence matches the semver package across prerelease and numeric edge cases', () => {
  const versions = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
    '1.0.0+build.5',
    '1.0.1',
    '1.2.0',
    '1.10.0',
    '2.0.0-rc.1',
    '2.0.0',
    '10.0.0',
  ];
  for (const left of versions)
    for (const right of versions)
      expect([left, right, compareVersions(left, right)]).toEqual([
        left,
        right,
        semver.compare(left, right),
      ]);
  // Beyond Number.MAX_SAFE_INTEGER, where the semver package refuses to parse.
  expect(compareVersions('9007199254740993.0.0', '9007199254740992.0.0')).toBe(1);
});

test('reads latest with a read-only npm view and treats a missing package as unpublished', () => {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    return { status: 0, stdout: '{"latest":"2.7.7","rc":"3.0.0-rc.4"}', stderr: '' };
  };
  expect(registryLatest({ name: 'permitio', run })).toBe('2.7.7');
  expect(calls).toEqual([['npm', 'view', 'permitio', 'dist-tags', '--json']]);
  expect(
    registryLatest({
      name: 'permitio',
      run: () => ({ status: 1, stdout: '', stderr: 'npm error code E404' }),
    }),
  ).toBeUndefined();
  expect(
    registryLatest({ name: 'permitio', run: () => ({ status: 0, stdout: '{}', stderr: '' }) }),
  ).toBeUndefined();
});

test.each([
  ['a registry failure', { status: 1, stdout: '', stderr: 'npm error code ETIMEDOUT' }],
  ['a spawn error', { error: new Error('ENOENT') }],
  ['malformed output', { status: 0, stdout: 'not json', stderr: '' }],
  ['a non-string latest', { status: 0, stdout: '{"latest":3}', stderr: '' }],
])('%s never defaults to latest', (_name, result) => {
  expect(() => registryLatest({ name: 'permitio', run: () => result })).toThrow();
});

test('the publish workflow passes the chosen tag to npm publish', () => {
  const workflow = readFileSync('.github/workflows/node_sdk_publish.yaml', 'utf8');
  expect(workflow).toContain('node scripts/npm-dist-tag.mjs');
  expect(workflow).toContain('--tag "$DIST_TAG"');
  expect(workflow).not.toMatch(/--tag rc\b/u);
});

test('the CLI refuses a prerelease flag that disagrees with the version before any npm call', () => {
  const directory = mkdtempSync(join(tmpdir(), 'permit-dist-tag-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const npm = join(directory, 'npm');
  writeFileSync(npm, '#!/bin/sh\necho called >> "$0.log"\nexit 1\n', { mode: 0o700 });
  const result = spawnSync(process.execPath, [resolve('scripts/npm-dist-tag.mjs')], {
    encoding: 'utf8',
    env: {
      PATH: `${directory}:${process.env.PATH}`,
      RELEASE_VERSION: '3.0.0',
      IS_PRERELEASE: 'true',
    },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('prerelease setting does not match');
  expect(() => readFileSync(`${npm}.log`)).toThrow();
});
