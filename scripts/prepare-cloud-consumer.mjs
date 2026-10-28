import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { trustedCloudRun } from '#scripts/cloud-lifecycle.mjs';

function checked(command, args, options) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal)
    throw new Error('Locked cloud consumer preparation failed; no dependency output is reported.');
}

/**
 * Installs only supplied archive bytes outside source, with audited frozen locks and scripts
 * disabled.
 * @param options - Checked source/archive, new external directory and package-manager boundary.
 * @returns The actual external consumer directory; its generated lock is required evidence input.
 * @throws With a constant diagnostic if inputs, credential separation, audit or install differs.
 */
export function prepareCloudConsumer({
  root,
  artifact,
  directory,
  env = process.env,
  execute = checked,
}) {
  try {
    if (Object.hasOwn(env, 'PROJECT_API_KEY') || Object.hasOwn(env, 'PERMIT_API_KEY'))
      throw new Error('Credential-bearing consumer preparation is forbidden.');
    const source = realpathSync(root),
      input = lstatSync(artifact);
    if (
      !input.isFile() ||
      input.isSymbolicLink() ||
      input.size > 64 * 1024 * 1024 ||
      !isAbsolute(directory) ||
      resolve(directory) !== directory ||
      realpathSync(dirname(directory)).startsWith(source + sep) ||
      realpathSync(dirname(directory)) === source
    )
      throw new Error('External cloud consumer input is invalid.');
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    if (manifest.packageManager !== 'pnpm@12.8.1') throw new Error('Unreviewed package manager.');
    mkdirSync(directory, { mode: 0o700 });
    if (realpathSync(directory) !== directory) throw new Error('Consumer directory alias.');
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({
        private: true,
        dependencies: { permitio: `file:${realpathSync(artifact)}` },
        packageManager: manifest.packageManager,
      }) + '\n',
      { mode: 0o600, flag: 'wx' },
    );
    writeFileSync(
      join(directory, 'pnpm-workspace.yaml'),
      'packages: []\nignoreScripts: true\nminimumReleaseAge: 1440\nautoInstallPeers: false\n',
      { mode: 0o600, flag: 'wx' },
    );
    const options = { cwd: directory, env };
    execute(
      'pnpm',
      ['install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'],
      options,
    );
    execute('pnpm', ['audit', '--audit-level=moderate'], options);
    execute('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], options);
    const lock = lstatSync(join(directory, 'pnpm-lock.yaml'));
    if (!lock.isFile() || lock.isSymbolicLink() || lock.size > 4 * 1024 * 1024)
      throw new Error('Consumer lock is not a bounded regular file.');
    return directory;
  } catch {
    throw new Error('Cloud consumer preparation failed; checked installation is unavailable.');
  }
}

/**
 * Runs customer installation only in the trusted hosted CI context, before setting its scoped key.
 */
export function main(args = process.argv.slice(2), root = resolve(import.meta.dirname, '..')) {
  try {
    trustedCloudRun(process.env);
    const { values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        artifact: { type: 'string' },
        directory: { type: 'string' },
      },
    });
    if (!values.artifact || !values.directory) throw new Error('Missing consumer inputs.');
    prepareCloudConsumer({ root, artifact: values.artifact, directory: values.directory });
    console.log('Checked cloud consumer prepared with audited frozen dependencies.');
    return 0;
  } catch {
    console.error('Cloud consumer preparation failed; no runtime proof was produced.');
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = main();
