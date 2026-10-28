import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import {
  inspectReleaseArchive,
  releaseIdentity,
  validatePackageSurface,
  verifyReleaseIdentity,
} from '#scripts/release-artifact.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'permit-package-gate-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'source');
  const packed = join(directory, 'package');
  mkdirSync(root);
  mkdirSync(packed);
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
  const files = [
    'package.json',
    'build/index.js',
    'build/index.mjs',
    'build/index.d.ts',
    'build/index.d.mts',
    'README.md',
    'MIGRATION.md',
    'CHANGELOG.md',
    'LICENSE',
    ...[
      'SKILL.md',
      'package.json',
      'compiler-lock.yaml',
      'pnpm-workspace.yaml',
      'references/changes.md',
      'scripts/scan.mjs',
    ].map((path) => 'skills/permit-node-3-migration/' + path),
  ];
  for (const file of files) {
    const path = join(packed, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file === 'package.json' ? JSON.stringify(manifest) : 'fixture');
  }
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '--quiet');
  git('add', 'package.json');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '--no-gpg-sign',
    '-m',
    'Fixture source',
  );
  const artifact = join(directory, 'candidate.tgz');
  const pack = () => execFileSync('tar', ['-czf', artifact, '-C', directory, 'package']);
  pack();
  return { root, manifest, artifact, packed, pack };
}

test('validates both entrypoints and the whole shipped customer skill', () => {
  const f = fixture();
  expect(validatePackageSurface(inspectReleaseArchive(f.artifact), f.manifest).fileCount).toBe(15);
  const identity = releaseIdentity(f);
  expect(verifyReleaseIdentity({ ...f, identity, expectedSha256: identity.sha256 })).toEqual(
    identity,
  );
});

test.each(['build/index.d.mts', 'skills/permit-node-3-migration/compiler-lock.yaml'])(
  'rejects missing promised file %s',
  (file) => {
    const f = fixture();
    rmSync(join(f.packed, file));
    f.pack();
    expect(() => validatePackageSurface(inspectReleaseArchive(f.artifact), f.manifest)).toThrow(
      'missing required',
    );
  },
);

test.each([
  '.npmrc',
  '.env',
  'src/index.ts',
  'build/tests/private.d.ts',
  'node_modules/x/index.js',
])('rejects unapproved archive member %s', (file) => {
  const f = fixture();
  const path = join(f.packed, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, 'private fixture');
  f.pack();
  expect(() => validatePackageSurface(inspectReleaseArchive(f.artifact), f.manifest)).toThrow(
    'unapproved file',
  );
});

test('rejects wrong loader declaration metadata even when both files are present', () => {
  const f = fixture();
  const wrong = structuredClone(f.manifest);
  wrong.exports['.'].require.types = './build/index.d.mts';
  writeFileSync(join(f.packed, 'package.json'), JSON.stringify(wrong));
  f.pack();
  expect(() => validatePackageSurface(inspectReleaseArchive(f.artifact), wrong)).toThrow(
    'both promised loader',
  );
});

test('rejects replacement bytes and a different expected source hash', () => {
  const f = fixture();
  const identity = releaseIdentity(f);
  expect(() => verifyReleaseIdentity({ ...f, identity, expectedSha256: '0'.repeat(64) })).toThrow(
    'successful candidate build',
  );
  writeFileSync(join(f.packed, 'build/index.js'), 'replacement');
  f.pack();
  expect(() => verifyReleaseIdentity({ ...f, identity })).toThrow('differs');
});

test('refuses an uncommitted source change before assigning archive identity', () => {
  const f = fixture();
  writeFileSync(join(f.root, 'unexpected.txt'), 'changed source');
  expect(() => releaseIdentity(f)).toThrow('clean committed');
});
