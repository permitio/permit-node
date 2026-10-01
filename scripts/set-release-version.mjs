import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

import semver from 'semver';
import { validateReviewedVersion } from '#scripts/check-release-tag.mjs';

const tag = process.env['RELEASE_TAG'];
const version = semver.valid(tag);
if (!version) {
  console.error('Release tag', JSON.stringify(tag), 'is not a valid semantic version');
  process.exitCode = 1;
} else {
  const before = JSON.parse(readFileSync('package.json', 'utf8'));
  validateReviewedVersion({
    version: before.version,
    tag,
    prerelease: process.env['IS_PRERELEASE'],
  });
  const result = spawnSync(
    'npm',
    ['version', tag, '--no-git-tag-version', '--allow-same-version', '--ignore-scripts'],
    { stdio: 'inherit' },
  );
  if (result.error) throw new Error('Could not run npm version.', { cause: result.error });
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else {
    const after = JSON.parse(readFileSync('package.json', 'utf8'));
    if (after.version !== version) {
      console.error('Version mismatch: expected', version, 'got', after.version);
      process.exitCode = 1;
    } else if (!isDeepStrictEqual(after, { ...before, version })) {
      console.error('npm version changed package metadata beyond the release version.');
      process.exitCode = 1;
    }
  }
}
