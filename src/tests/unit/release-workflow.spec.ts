import { spawnSync } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';

import { expect, onTestFinished, test } from 'vitest';

const root = process.cwd();
const workflow = readFileSync(join(root, '.github/workflows/node_sdk_publish.yaml'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function stepScript(name: string): string {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name: ')[0];
  const script = step?.split('        run: |\n')[1];
  if (!script) {
    throw new Error(`Cannot find the run block for release workflow step: ${name}`);
  }
  return script.replace(/^ {10}/gm, '');
}

const bumpScript = stepScript('Bump version at package.json');
const publishScript = stepScript('Publish package to NPM');

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'permit-release-'));
  onTestFinished(() => rmSync(cwd, { recursive: true, force: true }));
  const bin = join(cwd, 'bin');
  mkdirSync(bin);
  mkdirSync(join(cwd, 'scripts'));
  copyFileSync(
    join(root, 'scripts/set-release-version.mjs'),
    join(cwd, 'scripts/set-release-version.mjs'),
  );
  symlinkSync(join(root, 'node_modules'), join(cwd, 'node_modules'), 'dir');
  writeFileSync(
    join(cwd, 'scripts/audit-dependencies.mjs'),
    'process.exitCode = Number(process.env.AUDIT_STATUS ?? 0);',
  );
  writeFileSync(
    join(bin, 'standard-version'),
    '#!/bin/bash\nset -euo pipefail\ntouch lifecycle-ran\nexit 73\n',
    { mode: 0o755 },
  );
  const pkg = {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      version: 'standard-version',
      preversion: 'standard-version',
      postversion: 'standard-version',
    },
  };
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
  writeFileSync(join(cwd, 'pnpm-lock.yaml'), lockfile);
  const env = {
    ...process.env,
    NODE_PATH: join(root, 'node_modules'),
    PATH: bin + delimiter + process.env['PATH'],
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
  };
  const git = spawnSync('git', ['init', '--quiet'], { cwd, env, encoding: 'utf8' });
  expect(git.status, git.stderr).toBe(0);
  const gitHead = readFileSync(join(cwd, '.git/HEAD'), 'utf8');
  return {
    cwd,
    pkg,
    run(script: string, variables: NodeJS.ProcessEnv) {
      return spawnSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
        cwd,
        env: { ...env, ...variables },
        encoding: 'utf8',
      });
    },
    stubNpm(script: string) {
      writeFileSync(join(bin, 'npm'), '#!/bin/bash\nset -euo pipefail\n' + script, {
        mode: 0o755,
      });
    },
    readPackage() {
      return JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    },
    assertUnchangedState() {
      expect(existsSync(join(cwd, 'lifecycle-ran'))).toBe(false);
      expect(existsSync(join(cwd, 'package-lock.json'))).toBe(false);
      expect(readFileSync(join(cwd, 'pnpm-lock.yaml'), 'utf8')).toBe(lockfile);
      expect(readFileSync(join(cwd, '.git/HEAD'), 'utf8')).toBe(gitHead);
      expect(readdirSync(join(cwd, '.git/refs/heads'))).toStrictEqual([]);
      expect(readdirSync(join(cwd, '.git/refs/tags'))).toStrictEqual([]);
    },
  };
}

for (const [tag, version] of [
  ['v2.7.7', '2.7.7'],
  ['2.7.7', '2.7.7'],
  ['v2.7.7-rc', '2.7.7-rc'],
  ['2.7.7-rc.1', '2.7.7-rc.1'],
  [manifest.version, manifest.version],
  [`v${manifest.version}`, manifest.version],
  ['v2.7.7+build.1', '2.7.7'],
  ['2.7.7-rc.1+build.1', '2.7.7-rc.1'],
]) {
  test(`release bump normalizes ${tag} and permits reruns`, () => {
    const f = fixture();
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = f.run(bumpScript, { RELEASE_TAG: tag });
      expect(result.status, result.stderr).toBe(0);
      expect(f.readPackage()).toStrictEqual({ ...f.pkg, version });
      f.assertUnchangedState();
    }
  });
}

for (const tag of [
  '',
  'minor',
  'patch',
  'major',
  'prepatch',
  'preminor',
  'premajor',
  'prerelease',
  'from-git',
  'release-2.7.7',
  'vv2.7.7',
  '2.7.7-01',
  '2.7',
  'v2.7.7$(touch${IFS}injected)',
  'v2.7.7`touch${IFS}injected`',
]) {
  test(`release bump rejects ${JSON.stringify(tag)} before changing the manifest`, () => {
    const f = fixture();
    const before = readFileSync(join(f.cwd, 'package.json'), 'utf8');
    const result = f.run(bumpScript, { RELEASE_TAG: tag });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toMatch(/not a valid semantic version/);
    expect(readFileSync(join(f.cwd, 'package.json'), 'utf8')).toBe(before);
    expect(existsSync(join(f.cwd, 'injected'))).toBe(false);
    f.assertUnchangedState();
  });
}

test('release bump propagates npm failure', () => {
  const f = fixture();
  f.stubNpm('exit 42\n');
  const result = f.run(bumpScript, { RELEASE_TAG: 'v2.7.7' });
  expect(result.status, result.stderr).toBe(42);
  expect(f.readPackage()).toStrictEqual(f.pkg);
});

test('release bump catches an npm success that leaves the wrong version', () => {
  const f = fixture();
  f.stubNpm('exit 0\n');
  const result = f.run(bumpScript, { RELEASE_TAG: 'v2.7.7' });
  expect(result.status, result.stderr).toBe(1);
  expect(result.stderr).toMatch(/Version mismatch/);
});

test('release bump detects npm corruption of unrelated package metadata', () => {
  const f = fixture();
  f.stubNpm(
    `node <<'NODE'
const fs = require('fs');
const p = require('./package.json');
p.version = '2.7.7';
p.scripts.version = 'corrupted';
fs.writeFileSync('package.json', JSON.stringify(p));
NODE`,
  );
  const result = f.run(bumpScript, { RELEASE_TAG: 'v2.7.7' });
  expect(result.status, result.stderr).toBe(1);
  expect(result.stderr).toMatch(/changed package metadata/);
});

for (const status of ['1', '2']) {
  test(`dependency audit exit ${status} makes publication unreachable`, () => {
    const f = fixture();
    f.stubNpm('touch published\n');
    const result = f.run(publishScript, { AUDIT_STATUS: status, IS_PRERELEASE: 'false' });
    expect(result.status, result.stderr).toBe(Number(status));
    expect(existsSync(join(f.cwd, 'published'))).toBe(false);
  });
}

for (const prerelease of ['true', 'false']) {
  for (const status of [0, 42]) {
    test(`publish selects its dist-tag and propagates exit ${status} (${prerelease})`, () => {
      const f = fixture();
      f.stubNpm(`printf '%s\\n' "$@" > publish-args\nexit ${status}\n`);
      const result = f.run(publishScript, { IS_PRERELEASE: prerelease });
      expect(result.status, result.stderr).toBe(status);
      const args = ['publish', 'release.tgz', '--ignore-scripts', '--access', 'public'];
      if (prerelease === 'true') {
        args.push('--tag', 'rc');
      }
      expect(readFileSync(join(f.cwd, 'publish-args'), 'utf8').trim().split('\n')).toStrictEqual(
        args,
      );
    });
  }
}
