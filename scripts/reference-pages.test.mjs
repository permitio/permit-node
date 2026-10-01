import { execFileSync, spawnSync } from 'node:child_process';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, expect, onTestFinished, test } from 'vitest';

import { bindReference } from '#scripts/reference-pages.mjs';

const root = resolve(import.meta.dirname, '..');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
let cleanRoot;
beforeAll(() => {
  cleanRoot = realpathSync(mkdtempSync(join(tmpdir(), 'permit-pages-clean-source-')));
  execFileSync(
    'git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      'clone',
      '--quiet',
      '--shared',
      '--no-checkout',
      root,
      cleanRoot,
    ],
    { encoding: 'utf8' },
  );
  execFileSync(
    'git',
    ['-c', 'core.hooksPath=/dev/null', 'checkout', '--quiet', '--detach', commit],
    {
      cwd: cleanRoot,
      encoding: 'utf8',
    },
  );
}, 30_000);
afterAll(() => rmSync(cleanRoot, { recursive: true, force: true }));
const workflow = readFileSync(join(root, '.github/workflows/reference-pages.yaml'), 'utf8');
const guardJob = workflow.slice(workflow.indexOf('  guard:'), workflow.indexOf('  build:'));
const guard = guardJob
  .slice(guardJob.indexOf('        run: |\n') + '        run: |\n'.length)
  .trimEnd()
  .split('\n')
  .map((line) => line.slice(10))
  .join('\n');

function fixture() {
  mkdirSync(join(cleanRoot, '.test-results'), { recursive: true });
  const directory = mkdtempSync(join(cleanRoot, '.test-results/pages-test-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, 'reference');
  mkdirSync(output);
  writeFileSync(join(output, 'index.html'), '<a href="asset.txt">Reference</a>');
  writeFileSync(join(output, 'asset.txt'), 'Public bytes');
  return {
    root: cleanRoot,
    output,
    commit,
    repository: 'permitio/permit-node',
    runId: '12345',
    runAttempt: '2',
  };
}

function dispatch(env = {}) {
  const directory = mkdtempSync(join(root, '.test-results/pages-guard-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, 'github-output');
  writeFileSync(output, '');
  const result = spawnSync('bash', ['--noprofile', '--norc', '-c', guard], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'],
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REPOSITORY: 'permitio/permit-node',
      GITHUB_REF: 'refs/heads/main',
      GITHUB_SHA: commit,
      EXPECTED_COMMIT: commit,
      GITHUB_OUTPUT: output,
      ...env,
    },
    timeout: 5_000,
  });
  return { ...result, output: readFileSync(output, 'utf8') };
}

test('actual pre-checkout dispatch guard accepts only the intended trusted main source', () => {
  mkdirSync(join(root, '.test-results'), { recursive: true });
  const result = dispatch();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.output).toBe(`commit=${commit}\n`);
});

test.each([
  ['pull request', { GITHUB_EVENT_NAME: 'pull_request' }],
  ['another repository', { GITHUB_REPOSITORY: 'fork/permit-node' }],
  ['another branch', { GITHUB_REF: 'refs/heads/unreviewed' }],
  ['a tag', { GITHUB_REF: 'refs/tags/v3.0.0' }],
  ['empty commit', { EXPECTED_COMMIT: '' }],
  ['short commit', { EXPECTED_COMMIT: commit.slice(0, 7) }],
  ['uppercase commit', { EXPECTED_COMMIT: commit.toUpperCase() }],
  ['another full commit', { EXPECTED_COMMIT: 'f'.repeat(40) }],
  ['shell expansion', { EXPECTED_COMMIT: '$(echo injected)' }],
  ['multiline commit', { EXPECTED_COMMIT: commit + '\n' }],
])('actual dispatch guard actively fails %s without exporting a source', (_name, env) => {
  mkdirSync(join(root, '.test-results'), { recursive: true });
  const result = dispatch(env);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('::error::');
  expect(result.output).toBe('');
  expect(result.stdout).toBe('');
});

test('binds real files to actual HEAD/run and excludes the marker from its own digest', () => {
  const options = fixture();
  const identity = bindReference({ ...options, write: true });
  expect(identity.commit).toBe(commit);
  expect(identity.fileCount).toBe(2);
  expect(identity.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(bindReference(options)).toEqual(identity);
  expect(bindReference({ ...options, write: true })).toEqual(identity);
});

test.each(['modified', 'added', 'removed'])('rejects %s built artifact bytes', (change) => {
  const options = fixture();
  bindReference({ ...options, write: true });
  if (change === 'modified') writeFileSync(join(options.output, 'asset.txt'), 'Changed');
  if (change === 'added') writeFileSync(join(options.output, '.nojekyll'), '');
  if (change === 'removed') rmSync(join(options.output, 'asset.txt'));
  expect(() => bindReference(options)).toThrow('differs from its source/content identity');
});

test.each(['commit', 'runId', 'runAttempt', 'contentSha256', 'fileCount'])(
  'rejects an altered marker %s',
  (field) => {
    const options = fixture();
    const marker = join(options.output, 'reference-source.json');
    bindReference({ ...options, write: true });
    const identity = JSON.parse(readFileSync(marker));
    identity[field] = 'wrong';
    writeFileSync(marker, JSON.stringify(identity));
    expect(() => bindReference(options)).toThrow('differs from its source/content identity');
  },
);

test('rejects a mismatched actual checkout and a missing binding', () => {
  const options = fixture();
  expect(() => bindReference({ ...options, commit: 'f'.repeat(40), write: true })).toThrow(
    'source differs from the intended commit',
  );
  expect(() => bindReference(options)).toThrow('Missing reference-source.json');
});

test.each([
  ['repository', 'fork/permit-node'],
  ['commit', 'short'],
  ['runId', '0'],
  ['runAttempt', 'unknown'],
])('rejects malformed reference identity %s', (field, value) => {
  const options = fixture();
  expect(() => bindReference({ ...options, [field]: value, write: true })).toThrow(
    'trusted repository, full commit and run identity',
  );
});

test('rejects incomplete documentation without an index', () => {
  const options = fixture();
  rmSync(join(options.output, 'index.html'));
  expect(() => bindReference({ ...options, write: true })).toThrow('no index.html');
});

test.each(['staged', 'unstaged', 'untracked'])(
  'rejects %s source changes while ignored generated output remains valid',
  (kind) => {
    const options = fixture();
    const file = join(cleanRoot, kind === 'untracked' ? 'src/pages-untracked.ts' : 'package.json');
    if (kind === 'untracked') {
      writeFileSync(file, 'export const unreviewed = true;');
      onTestFinished(() => rmSync(file));
    } else {
      const original = readFileSync(file);
      onTestFinished(() => {
        writeFileSync(file, original);
        execFileSync('git', ['reset', '--quiet', 'HEAD', '--', 'package.json'], { cwd: cleanRoot });
      });
      writeFileSync(file, original.toString() + '\n');
      if (kind === 'staged') execFileSync('git', ['add', 'package.json'], { cwd: cleanRoot });
    }
    expect(() => bindReference({ ...options, write: true })).toThrow('checkout is dirty');
  },
);

test.each(['file', 'directory', 'output'])('rejects a symbolic %s path', (kind) => {
  const options = fixture();
  const target = join(options.output, kind === 'file' ? 'asset.txt' : '.');
  const link = join(options.output, 'symbolic');
  symlinkSync(target, link, kind === 'file' ? 'file' : 'dir');
  expect(() =>
    bindReference({ ...options, output: kind === 'output' ? link : options.output, write: true }),
  ).toThrow(/symbolic path|real directory/);
});

test('rejects a hard link before the official uploader dereferences it', () => {
  const options = fixture();
  linkSync(join(options.output, 'asset.txt'), join(options.output, 'linked.txt'));
  expect(() => bindReference({ ...options, write: true })).toThrow('without hard links');
});

test.each(['.git', '.github'])('rejects uploader-excluded %s paths', (name) => {
  const options = fixture();
  mkdirSync(join(options.output, name));
  writeFileSync(join(options.output, name, 'metadata'), 'Excluded');
  expect(() => bindReference({ ...options, write: true })).toThrow('excluded');
});

test('rejects an output directory outside the source checkout', () => {
  const options = fixture();
  expect(() => bindReference({ ...options, output: '/private/tmp', write: true })).toThrow(
    'inside the checked-out repository',
  );
});
