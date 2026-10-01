import { spawnSync } from 'node:child_process';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, onTestFinished, test, vi } from 'vitest';

import {
  inspectReleaseArchive,
  main,
  verifyCandidateArchive,
  prepareReleaseReference,
} from '#scripts/check-release-evidence.mjs';

function directory() {
  const root = mkdtempSync(join(tmpdir(), 'permit-release-evidence-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function archiveFixture(change) {
  const root = directory();
  const packageRoot = join(root, 'package');
  mkdirSync(join(packageRoot, 'build'), { recursive: true });
  writeFileSync(
    join(packageRoot, 'package.json'),
    JSON.stringify({ name: 'permitio', version: '3.0.0' }),
  );
  writeFileSync(join(packageRoot, 'build/index.js'), 'module.exports = { Permit: class {} };\n');
  writeFileSync(join(packageRoot, 'build/index.mjs'), 'export class Permit {}\n');
  change?.(packageRoot);
  const artifact = join(root, 'permitio.tgz');
  const packed = spawnSync('tar', ['-czf', artifact, '-C', root, 'package'], { encoding: 'utf8' });
  expect(packed.status, packed.stderr).toBe(0);
  return { root: packageRoot, artifact };
}

test('inspects actual archive bytes and matches every member against the local build', () => {
  const { artifact } = archiveFixture();
  const inspected = inspectReleaseArchive(artifact);
  expect(inspected).toMatchObject({
    fileCount: 3,
    manifest: { name: 'permitio', version: '3.0.0' },
  });
  expect(inspected.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(inspected.integrity).toMatch(/^sha512-/);
  expect(() => verifyCandidateArchive(inspected, inspected)).not.toThrow();
  const other = archiveFixture((path) =>
    writeFileSync(join(path, 'build/index.js'), 'module.exports = {};\n'),
  );
  expect(() => verifyCandidateArchive(inspectReleaseArchive(other.artifact), inspected)).toThrow(
    'differs from the freshly built',
  );
});

test('rejects a different package even if its filename looks correct', () => {
  const { artifact } = archiveFixture((root) => {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'other', version: '3.0.0' }));
  });
  expect(() => inspectReleaseArchive(artifact)).toThrow('not a versioned permitio package');
});

test.each(['symbolic', 'hard'])('rejects %s archive links without extracting them', (kind) => {
  const { artifact } = archiveFixture((root) => {
    if (kind === 'symbolic') symlinkSync('/etc/passwd', join(root, 'outside'));
    else linkSync(join(root, 'build/index.js'), join(root, 'duplicate'));
  });
  expect(() => inspectReleaseArchive(artifact)).toThrow('link or unsupported');
});

test('rejects extra private members and missing runtime files with the same manifest', () => {
  const reference = inspectReleaseArchive(archiveFixture().artifact);
  const extra = archiveFixture((path) => {
    writeFileSync(join(path, '.env'), 'private');
  });
  expect(() => verifyCandidateArchive(inspectReleaseArchive(extra.artifact), reference)).toThrow();
  const subset = archiveFixture((path) => {
    rmSync(join(path, 'build'), { recursive: true });
  });
  expect(() => verifyCandidateArchive(inspectReleaseArchive(subset.artifact), reference)).toThrow();
});

test('rejects changed file boundaries even when concatenated content is unchanged', () => {
  const reference = inspectReleaseArchive(archiveFixture().artifact);
  const changed = archiveFixture((path) => {
    const a = join(path, 'build/index.js');
    const b = join(path, 'build/index.mjs');
    writeFileSync(a, Buffer.concat([readFileSync(a), readFileSync(b)]));
    writeFileSync(b, '');
  });
  expect(() =>
    verifyCandidateArchive(inspectReleaseArchive(changed.artifact), reference),
  ).toThrow();
});

test('rejects corrupted archive input and does not execute archive content', () => {
  const root = directory();
  const artifact = join(root, 'invalid.tgz');
  writeFileSync(artifact, 'not a tarball');
  expect(() => inspectReleaseArchive(artifact)).toThrow('inspection did not complete');
  const packed = archiveFixture((path) => {
    writeFileSync(
      join(path, 'package.json'),
      JSON.stringify({ name: 'permitio', version: '3.0.0', scripts: { preinstall: 'exit 99' } }),
    );
  });
  expect(inspectReleaseArchive(packed.artifact).manifest.scripts.preinstall).toBe('exit 99');
});

test('does not accept a symlink as an independently supplied artifact', () => {
  const { artifact } = archiveFixture();
  const link = join(directory(), 'link.tgz');
  symlinkSync(artifact, link);
  expect(() => inspectReleaseArchive(link)).toThrow();
});

test('invalid CLI inputs exit 2 and redact filesystem diagnostics', async () => {
  const root = directory();
  const output = join(root, 'evidence');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => vi.restoreAllMocks());
  expect(await main(['--output', output], root)).toBe(2);
  const report = readFileSync(join(output, 'report.json'), 'utf8');
  expect(JSON.parse(report)).toMatchObject({ localEvidence: 'INVALID', releaseReady: false });
  expect(report).not.toContain(root);
  expect(await main(['--unrecognized'], root)).toBe(2);
});

test('reference packaging rebuilds from source and disables package lifecycle scripts', () => {
  const { root } = archiveFixture();
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'permitio',
      version: '3.0.0',
      packageManager: 'pnpm@12.8.1',
      type: 'module',
      files: ['build'],
      scripts: { build: 'node compile.mjs', prepack: 'node -e "process.exit(99)"' },
    }),
  );
  writeFileSync(
    join(root, 'compile.mjs'),
    "import {writeFileSync} from 'node:fs'; writeFileSync('build/index.js', 'freshly built');",
  );
  const reference = prepareReleaseReference(root);
  expect(reference.manifest.version).toBe('3.0.0');
  expect(reference.manifest.packageManager).toBeUndefined();
  expect(reference.files).toEqual(
    expect.arrayContaining(['package/build/index.js', 'package/build/index.mjs']),
  );
  expect(readFileSync(join(root, 'build/index.js'), 'utf8')).toBe('freshly built');
}, 30_000);
