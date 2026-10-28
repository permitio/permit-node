import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The publish job installs no dependencies, so this script uses only Node builtins.
//
// npm dist-tag policy:
// - A stable version is tagged `latest` only when it is greater than the registry's current
//   `latest` (or nothing has been published yet). Any other stable version is a maintenance
//   release of an older line and is tagged `latest-<major>`, e.g. `latest-2` for a 2.x fix
//   published after 3.0.0, so `npm install permitio` keeps resolving to the newest line.
// - A prerelease is tagged with its first prerelease identifier: 3.1.0-beta.2 -> `beta`,
//   3.1.0-alpha.1 -> `alpha`, 3.1.0-rc.1 -> `rc`. Other identifiers are refused, so a typo
//   cannot create a new public dist-tag.
const PRERELEASE_TAGS = new Set(['alpha', 'beta', 'rc']);
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

/** Parses a normalized semantic version, or returns undefined. */
export function parseVersion(version) {
  const match = typeof version === 'string' ? SEMVER.exec(version) : null;
  if (!match) return undefined;
  const core = match.slice(1, 4).map(BigInt);
  return { core, prerelease: match[4] === undefined ? [] : match[4].split('.') };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/u.test(left),
    rightNumeric = /^\d+$/u.test(right);
  if (leftNumeric && rightNumeric) {
    const a = BigInt(left),
      b = BigInt(right);
    return a === b ? 0 : a < b ? -1 : 1;
  }
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left === right ? 0 : left < right ? -1 : 1;
}

/** Compares two versions by SemVer 2.0.0 precedence; build metadata is ignored. */
export function compareVersions(left, right) {
  const a = parseVersion(left),
    b = parseVersion(right);
  if (!a || !b) throw new Error('Cannot compare invalid semantic versions.');
  for (let index = 0; index < 3; index++)
    if (a.core[index] !== b.core[index]) return a.core[index] < b.core[index] ? -1 : 1;
  // A version without a prerelease ranks above the same core with one.
  if (!a.prerelease.length || !b.prerelease.length)
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index++) {
    if (a.prerelease[index] === undefined) return -1;
    if (b.prerelease[index] === undefined) return 1;
    const order = compareIdentifiers(a.prerelease[index], b.prerelease[index]);
    if (order) return order;
  }
  return 0;
}

/**
 * Chooses the npm dist-tag for a release under the policy above.
 * @param options - The version being published and the registry's current `latest`, if any.
 * @returns The dist-tag to pass to `npm publish --tag`.
 * @throws When the version is not a normalized semantic version, the prerelease identifier is
 * not one of alpha, beta or rc, or the registry's `latest` is not a semantic version.
 */
export function chooseDistTag({ version, latest }) {
  const parsed = parseVersion(version);
  if (!parsed || version.includes('+'))
    throw new Error('The release version must be a normalized semantic version.');
  if (parsed.prerelease.length) {
    const [identifier] = parsed.prerelease;
    if (!PRERELEASE_TAGS.has(identifier))
      throw new Error(
        `Prerelease identifier must be one of ${[...PRERELEASE_TAGS].join(', ')}; ` +
          `got ${JSON.stringify(identifier)}.`,
      );
    return identifier;
  }
  if (latest === undefined) return 'latest';
  if (!parseVersion(latest))
    throw new Error('The registry latest dist-tag is not a semantic version.');
  return compareVersions(version, latest) > 0 ? 'latest' : `latest-${parsed.core[0]}`;
}

/**
 * Reads the package's current `latest` dist-tag with a read-only `npm view`.
 * @param options - Package name and an injectable process runner for tests.
 * @returns The `latest` version, or undefined when the package or tag does not exist yet.
 * @throws When the registry cannot be read; an unknown state never defaults to `latest`.
 */
export function registryLatest({ name, run = spawnSync }) {
  const result = run('npm', ['view', name, 'dist-tags', '--json'], {
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error) throw new Error('Could not run npm view.', { cause: result.error });
  if (result.status !== 0) {
    if (/\bE404\b/u.test(`${result.stdout}\n${result.stderr}`)) return undefined;
    throw new Error('npm view failed; the current latest dist-tag is unknown.');
  }
  let tags;
  try {
    tags = JSON.parse(result.stdout);
  } catch {
    tags = undefined;
  }
  if (!tags || typeof tags !== 'object' || Array.isArray(tags))
    throw new Error('npm view returned malformed dist-tags.');
  if (tags.latest !== undefined && typeof tags.latest !== 'string')
    throw new Error('npm view returned a malformed latest dist-tag.');
  return tags.latest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const version = process.env['RELEASE_VERSION'];
    const prerelease = process.env['IS_PRERELEASE'];
    const parsed = parseVersion(version);
    if (!parsed || !['true', 'false'].includes(prerelease))
      throw new Error('RELEASE_VERSION and IS_PRERELEASE must be set.');
    if (parsed.prerelease.length > 0 !== (prerelease === 'true'))
      throw new Error('The release prerelease setting does not match the version.');
    const latest = registryLatest({ name: 'permitio' });
    const tag = chooseDistTag({ version, latest });
    const output = process.env['GITHUB_OUTPUT'];
    if (output) appendFileSync(output, `tag=${tag}\n`);
    console.log(`npm dist-tag for ${version}: ${tag} (registry latest: ${latest ?? 'none'}).`);
  } catch (error) {
    console.error(`Cannot choose the npm dist-tag: ${error.message}`);
    process.exitCode = 1;
  }
}
