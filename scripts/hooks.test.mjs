import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, onTestFinished, test } from 'vitest';

import { installHooks } from '#scripts/hooks.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function fixture(sharedPath) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'permit hooks ')));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const primary = join(root, 'primary');
  const sibling = join(root, 'sibling');
  mkdirSync(primary);
  git(primary, 'init', '--quiet');
  git(primary, 'config', 'user.email', 'test@example.invalid');
  git(primary, 'config', 'user.name', 'Hook test');
  writeFileSync(join(primary, 'README.md'), 'Hook fixture\n');
  git(primary, 'add', 'README.md');
  git(primary, 'commit', '--quiet', '-m', 'Create fixture');
  git(primary, 'worktree', 'add', '--quiet', '--detach', sibling);
  if (sharedPath !== 'unset') {
    const path = sharedPath === 'relative' ? '.husky' : join(root, 'shared hooks');
    git(primary, 'config', '--local', 'core.hooksPath', path);
  }
  const hooks = new Map();
  const directories = new Set([join(git(primary, 'rev-parse', '--absolute-git-dir'), 'hooks')]);
  for (const cwd of [primary, sibling]) {
    directories.add(git(cwd, 'rev-parse', '--path-format=absolute', '--git-path', 'hooks'));
  }
  for (const directory of directories) {
    mkdirSync(directory, { recursive: true });
    const file = join(directory, 'pre-commit');
    const text = '#!/bin/sh\nprintf shared > shared-hook-ran\n';
    writeFileSync(file, text, { mode: 0o755 });
    hooks.set(file, { text, names: readdirSync(directory).sort() });
  }
  return { primary, sibling, hooks };
}

function configureHook(cwd) {
  writeFileSync(
    join(cwd, 'hook-fixture.cjs'),
    "require('node:fs').writeFileSync('hook-ran', 'yes');",
  );
  const command = `${JSON.stringify(process.execPath)} hook-fixture.cjs`;
  writeFileSync(
    join(cwd, '.pre-commit-config.yaml'),
    `repos:
  - repo: local
    hooks:
      - id: fixture
        name: Hook fixture
        language: system
        entry: ${JSON.stringify(command)}
        pass_filenames: false
        always_run: true
`,
  );
}

for (const target of ['primary', 'sibling']) {
  test.each(['unset', 'relative', 'absolute'])(
    `isolates ${target} installation from shared %s hooks, including repeated commits`,
    (sharedPath) => {
      const state = fixture(sharedPath);
      const cwd = state[target];
      const other = state[target === 'primary' ? 'sibling' : 'primary'];
      const sharedConfig = git(state.primary, 'config', '--local', '--list')
        .split('\n')
        .filter((line) => line.startsWith('core.hookspath='));
      const otherHooks = git(other, 'rev-parse', '--path-format=absolute', '--git-path', 'hooks');
      configureHook(cwd);
      git(cwd, 'add', '.pre-commit-config.yaml', 'hook-fixture.cjs');
      for (let iteration = 0; iteration < 2; iteration += 1) {
        installHooks(cwd);
        expect(
          git(state.primary, 'config', '--local', '--list')
            .split('\n')
            .filter((line) => line.startsWith('core.hookspath=')),
        ).toEqual(sharedConfig);
        expect(git(other, 'rev-parse', '--path-format=absolute', '--git-path', 'hooks')).toBe(
          otherHooks,
        );
        for (const [file, original] of state.hooks) {
          expect(readFileSync(file, 'utf8')).toBe(original.text);
          expect(readdirSync(dirname(file)).sort()).toEqual(original.names);
        }
        writeFileSync(join(cwd, 'hook-ran'), 'not yet');
        git(cwd, 'commit', '--quiet', '--allow-empty', '-m', `Run hook ${iteration}`);
        expect(readFileSync(join(cwd, 'hook-ran'), 'utf8')).toBe('yes');
        expect(existsSync(join(cwd, 'shared-hook-ran'))).toBe(false);
      }
      git(other, 'commit', '--quiet', '--allow-empty', '-m', 'Keep existing hook');
      expect(readFileSync(join(other, 'shared-hook-ran'), 'utf8')).toBe('shared');
    },
  );
}

test('leaves configuration and existing hooks intact when shim installation fails', () => {
  const state = fixture('relative');
  const gitDir = git(state.primary, 'rev-parse', '--absolute-git-dir');
  const before = git(state.primary, 'config', '--local', '--list');
  writeFileSync(join(gitDir, 'permit-hooks'), 'Owned obstruction, not a directory');
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./hooks.mjs', import.meta.url))],
    { cwd: state.primary, encoding: 'utf8' },
  );
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('permit-hooks');
  expect(git(state.primary, 'config', '--local', '--list')).toBe(before);
  expect(existsSync(join(gitDir, 'config.worktree'))).toBe(false);
  for (const [file, original] of state.hooks) {
    expect(readFileSync(file, 'utf8')).toBe(original.text);
    expect(readdirSync(dirname(file)).sort()).toEqual(original.names);
  }
});
