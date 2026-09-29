import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';

import test, { ExecutionContext } from 'ava';

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

function fixture(t: ExecutionContext) {
  const cwd = mkdtempSync(join(tmpdir(), 'permit-release-'));
  t.teardown(() => rmSync(cwd, { recursive: true, force: true }));
  const bin = join(cwd, 'bin');
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'standard-version'),
    '#!/bin/bash\nset -euo pipefail\ntouch lifecycle-ran\nexit 73\n',
    { mode: 0o755 },
  );
  const pkg = {
    ...manifest,
    scripts: {
      ...manifest.scripts,
      preversion: 'standard-version',
      postversion: 'standard-version',
    },
  };
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  const lockfile = readFileSync(join(root, 'yarn.lock'), 'utf8');
  writeFileSync(join(cwd, 'yarn.lock'), lockfile);
  const env = {
    ...process.env,
    NODE_PATH: join(root, 'node_modules'),
    PATH: bin + delimiter + process.env.PATH,
    npm_config_offline: 'true',
    npm_config_update_notifier: 'false',
  };
  const git = spawnSync('git', ['init', '--quiet'], { cwd, env, encoding: 'utf8' });
  t.is(git.status, 0, git.stderr);
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
      t.false(existsSync(join(cwd, 'lifecycle-ran')));
      t.false(existsSync(join(cwd, 'package-lock.json')));
      t.is(readFileSync(join(cwd, 'yarn.lock'), 'utf8'), lockfile);
      t.is(readFileSync(join(cwd, '.git/HEAD'), 'utf8'), gitHead);
      t.deepEqual(readdirSync(join(cwd, '.git/refs/heads')), []);
      t.deepEqual(readdirSync(join(cwd, '.git/refs/tags')), []);
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
  test(`release bump normalizes ${tag} and permits reruns`, (t) => {
    const f = fixture(t);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = f.run(bumpScript, { RELEASE_TAG: tag });
      t.is(result.status, 0, result.stderr);
      t.deepEqual(f.readPackage(), { ...f.pkg, version });
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
  test(`release bump rejects ${JSON.stringify(tag)} before changing the manifest`, (t) => {
    const f = fixture(t);
    const before = readFileSync(join(f.cwd, 'package.json'), 'utf8');
    const result = f.run(bumpScript, { RELEASE_TAG: tag });
    t.is(result.status, 1, result.stderr);
    t.regex(result.stderr, /not a valid semantic version/);
    t.is(readFileSync(join(f.cwd, 'package.json'), 'utf8'), before);
    t.false(existsSync(join(f.cwd, 'injected')));
    f.assertUnchangedState();
  });
}

test('release bump propagates npm failure', (t) => {
  const f = fixture(t);
  f.stubNpm('exit 42\n');
  const result = f.run(bumpScript, { RELEASE_TAG: 'v2.7.7' });
  t.is(result.status, 42, result.stderr);
  t.deepEqual(f.readPackage(), f.pkg);
});

test('release bump catches an npm success that leaves the wrong version', (t) => {
  const f = fixture(t);
  f.stubNpm('exit 0\n');
  const result = f.run(bumpScript, { RELEASE_TAG: 'v2.7.7' });
  t.is(result.status, 1, result.stderr);
  t.regex(result.stderr, /Version mismatch/);
});

test('release bump detects a corrupted version lifecycle script', (t) => {
  const f = fixture(t);
  f.pkg.scripts.version = '2.5.2';
  writeFileSync(join(f.cwd, 'package.json'), JSON.stringify(f.pkg));
  const result = f.run(bumpScript, { RELEASE_TAG: 'v2.7.7' });
  t.is(result.status, 1, result.stderr);
  t.regex(result.stderr, /scripts.version was corrupted/);
});

for (const prerelease of ['true', 'false']) {
  for (const status of [0, 42]) {
    test(`publish selects its dist-tag and propagates exit ${status} (${prerelease})`, (t) => {
      const f = fixture(t);
      f.stubNpm(`printf '%s\\n' "$@" > publish-args\nexit ${status}\n`);
      const result = f.run(publishScript, { IS_PRERELEASE: prerelease });
      t.is(result.status, status, result.stderr);
      const args = ['publish', '--access', 'public'];
      if (prerelease === 'true') {
        args.push('--tag', 'rc');
      }
      t.deepEqual(readFileSync(join(f.cwd, 'publish-args'), 'utf8').trim().split('\n'), args);
    });
  }
}
