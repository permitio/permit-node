import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import semver from 'semver';

/** Rejects runtimes that cannot authenticate npm Trusted Publishing with OIDC. */
export function checkPublishingRuntime({ node, npm }) {
  // https://docs.npmjs.com/trusted-publishers/ (verified 2026-09-30).
  if (
    !semver.valid(node) ||
    !semver.gte(node, '22.14.0') ||
    !semver.valid(npm) ||
    !semver.gte(npm, '11.5.1')
  ) {
    throw new Error(
      `Trusted Publishing needs Node >=22.14.0 and npm >=11.5.1; got Node ${node}, npm ${npm}.`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error('Cannot verify bundled npm for Trusted Publishing.', { cause: result.error });
  }
  const versions = { node: process.versions.node, npm: result.stdout.trim() };
  checkPublishingRuntime(versions);
  console.log(`Trusted Publishing runtime: Node ${versions.node}, npm ${versions.npm}.`);
}
