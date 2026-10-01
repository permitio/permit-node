import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';

/** Requires the tag to identify the committed version without rewriting reviewed metadata. */
export function validateReviewedVersion({ version, tag, prerelease }) {
  if (semver.valid(version) !== version)
    throw new Error('Commit a valid normalized package version before validating a candidate.');
  if (tag === undefined || tag === '') return version;
  if (semver.valid(tag) !== version)
    throw new Error(
      'Release tag must match the committed package version; review the version first.',
    );
  if (
    !['true', 'false'].includes(prerelease) ||
    (semver.prerelease(version) !== null) !== (prerelease === 'true')
  )
    throw new Error('Release prerelease setting must match the committed semantic version.');
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  validateReviewedVersion({
    version: manifest.version,
    tag: process.env['RELEASE_TAG'],
    prerelease: process.env['IS_PRERELEASE'],
  });
}
