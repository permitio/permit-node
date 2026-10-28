import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { prepareCloudConsumer } from '#scripts/prepare-cloud-consumer.mjs';

function fixture() {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), 'public-consumer-prepare-')));
  const root = join(temp, 'source');
  mkdirSync(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@12.8.1' }));
  const artifact = join(temp, 'candidate.tgz');
  writeFileSync(artifact, 'fake archive boundary');
  const directory = join(temp, 'consumer'),
    calls = [];
  return {
    root,
    artifact,
    directory,
    env: {},
    calls,
    execute: (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      if (args.includes('--lockfile-only'))
        writeFileSync(join(directory, 'pnpm-lock.yaml'), 'actual-boundary-lock');
    },
  };
}

test('audits the resolved graph before an immutable installation with scripts disabled', () => {
  const f = fixture();
  expect(prepareCloudConsumer(f)).toBe(f.directory);
  expect(f.calls.map((row) => row.args)).toEqual([
    ['install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'],
    ['audit', '--audit-level=moderate'],
    ['install', '--frozen-lockfile', '--ignore-scripts'],
  ]);
  expect(readFileSync(join(f.directory, 'pnpm-workspace.yaml'), 'utf8')).toContain(
    'minimumReleaseAge: 1440',
  );
  expect(JSON.parse(readFileSync(join(f.directory, 'package.json'))).dependencies).toEqual({
    permitio: `file:${f.artifact}`,
  });
});

test.each(['PROJECT_API_KEY', 'PERMIT_API_KEY'])(
  'credential name %s prevents dependency execution',
  (key) => {
    const f = fixture();
    f.env[key] = 'synthetic-only-canary';
    expect(() => prepareCloudConsumer(f)).toThrow('checked installation is unavailable');
    expect(f.calls).toEqual([]);
  },
);

test('a failed audit prevents installation and never projects arbitrary error details', () => {
  const f = fixture();
  const execute = f.execute;
  f.execute = (command, args, options) => {
    execute(command, args, options);
    if (args[0] === 'audit') throw new Error('RESPONSE_ONLY_CANARY');
  };
  expect(() => prepareCloudConsumer(f)).toThrow(
    /^Cloud consumer preparation failed; checked installation is unavailable\.$/u,
  );
  expect(f.calls).toHaveLength(2);
});

test.each(['source', 'existing', 'artifact-link'])(
  'refuses %s alias before dependency execution',
  (fault) => {
    const f = fixture();
    if (fault === 'source') f.directory = join(f.root, 'consumer');
    if (fault === 'existing') mkdirSync(f.directory);
    if (fault === 'artifact-link') {
      symlinkSync(f.artifact, f.artifact + '.link');
      f.artifact += '.link';
    }
    expect(() => prepareCloudConsumer(f)).toThrow('checked installation is unavailable');
    expect(f.calls).toEqual([]);
  },
);
