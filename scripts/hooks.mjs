import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Installs pinned prek hooks in a private directory for this checkout.
 *
 * @param cwd - Checkout whose hook should change; sibling worktrees keep their configuration.
 */
export function installHooks(cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const gitDir = git('rev-parse', '--absolute-git-dir');
  const installation = join(gitDir, 'permit-hooks');
  execFileSync(
    fileURLToPath(new URL('../node_modules/.bin/prek', import.meta.url)),
    ['install', '--git-dir', installation],
    { cwd, stdio: 'inherit' },
  );
  git('config', '--local', 'extensions.worktreeConfig', 'true');
  git('config', '--worktree', 'core.hooksPath', join(installation, 'hooks'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installHooks();
}
