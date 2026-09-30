import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, onTestFinished, test } from 'vitest';

import { installHooks } from '#scripts/hooks.mjs';

test('installs a working hook without changing the shared hook path or a sibling worktree', () => {
  const root = mkdtempSync(join(tmpdir(), 'permit hooks '));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const primary = join(root, 'primary');
  const sibling = join(root, 'sibling');
  mkdirSync(primary);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git(primary, 'init', '--quiet');
  git(primary, 'config', 'user.email', 'test@example.invalid');
  git(primary, 'config', 'user.name', 'Hook test');
  writeFileSync(join(primary, 'README.md'), 'Hook fixture\n');
  git(primary, 'add', 'README.md');
  git(primary, 'commit', '--quiet', '-m', 'Create fixture');
  git(primary, 'config', '--local', 'core.hooksPath', '.husky');
  git(primary, 'worktree', 'add', '--quiet', '--detach', sibling);
  writeFileSync(
    join(sibling, 'hook-fixture.cjs'),
    `require('node:fs').writeFileSync('hook-ran', 'yes');`,
  );
  const command = `${JSON.stringify(process.execPath)} hook-fixture.cjs`;
  writeFileSync(
    join(sibling, '.pre-commit-config.yaml'),
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
  installHooks(sibling);
  expect(git(primary, 'config', '--local', '--get', 'core.hooksPath')).toBe('.husky');
  expect(git(primary, 'config', '--get', 'core.hooksPath')).toBe('.husky');
  const hooks = git(sibling, 'config', '--get', 'core.hooksPath');
  expect(hooks).toBe(join(git(sibling, 'rev-parse', '--absolute-git-dir'), 'hooks'));
  git(sibling, 'add', '.pre-commit-config.yaml', 'hook-fixture.cjs');
  execFileSync(join(hooks, 'pre-commit'), [], { cwd: sibling, stdio: 'pipe' });
  expect(readFileSync(join(sibling, 'hook-ran'), 'utf8')).toBe('yes');
});
