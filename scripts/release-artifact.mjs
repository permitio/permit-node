import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

function checked(command, args, cwd, maximum = 16 * 1024 * 1024) {
  const result = spawnSync(command, args, { cwd, maxBuffer: maximum, timeout: 120_000 });
  requireValid(
    !result.error && result.status === 0 && !result.signal,
    `${command} inspection did not complete successfully.`,
  );
  return result.stdout;
}

function boundedBytes(path, maximum) {
  requireValid(
    lstatSync(path).isFile() && lstatSync(path).size <= maximum,
    'Input exceeds its size limit.',
  );
  return readFileSync(path);
}

/** Reads package metadata without extracting files or executing code from the archive. */
export function inspectReleaseArchive(path) {
  const archive = resolve(path);
  const bytes = boundedBytes(archive, 64 * 1024 * 1024);
  const names = checked('tar', ['-tzf', archive]).toString('utf8').trimEnd().split('\n');
  const listing = checked('tar', ['-tvzf', archive]).toString('utf8').trimEnd().split('\n');
  requireValid(
    names.length === listing.length && names.length > 0,
    'Archive listing is incomplete.',
  );
  const files = [];
  for (let index = 0; index < names.length; index++) {
    const name = names[index];
    requireValid(
      (['package', 'package/'].includes(name) || /^package\/[A-Za-z0-9_.@+/-]+$/.test(name)) &&
        !name.split('/').some((part) => ['..', '.'].includes(part)),
      'Archive has an unsafe member name.',
    );
    if (listing[index].startsWith('d')) {
      requireValid(!name.includes('//'), 'Archive directory is not canonical.');
    } else {
      requireValid(
        listing[index].startsWith('-') && !name.endsWith('/'),
        'Archive contains a link or unsupported member type.',
      );
      files.push(name);
    }
  }
  requireValid(new Set(names).size === names.length, 'Archive contains duplicate members.');
  requireValid(files.includes('package/package.json'), 'Archive has no package manifest.');
  const manifestBytes = checked(
    'tar',
    ['-xOzf', archive, 'package/package.json'],
    undefined,
    1024 * 1024,
  );
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  requireValid(
    manifest.name === 'permitio' && typeof manifest.version === 'string',
    'Archive is not a versioned permitio package.',
  );
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fileCount: files.length,
    files,
    manifest,
    manifestBytes,
    integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
  };
}

const skill = 'skills/permit-node-3-migration/';
const requiredFiles = [
  'package.json',
  'build/index.js',
  'build/index.mjs',
  'build/index.d.ts',
  'build/index.d.mts',
  'README.md',
  'MIGRATION.md',
  'CHANGELOG.md',
  'LICENSE',
  ...[
    'SKILL.md',
    'package.json',
    'compiler-lock.yaml',
    'pnpm-workspace.yaml',
    'references/changes.md',
    'scripts/scan.mjs',
  ].map((path) => skill + path),
];

/** Validates the documented package surface before any consumer extracts or executes it. */
export function validatePackageSurface(archive, manifest) {
  for (const field of [
    'name',
    'version',
    'license',
    'repository',
    'type',
    'main',
    'module',
    'typings',
    'exports',
    'files',
    'dependencies',
    'engines',
  ]) {
    requireValid(
      isDeepStrictEqual(archive.manifest[field], manifest[field]),
      `Packed package metadata differs from reviewed ${field}.`,
    );
  }
  requireValid(
    manifest.name === 'permitio' &&
      manifest.type === 'commonjs' &&
      manifest.main === 'build/index.js' &&
      manifest.module === 'build/index.mjs' &&
      manifest.typings === 'build/index.d.ts' &&
      isDeepStrictEqual(manifest.exports, {
        '.': {
          import: { types: './build/index.d.mts', default: './build/index.mjs' },
          require: { types: './build/index.d.ts', default: './build/index.js' },
        },
      }),
    'Reviewed package does not expose both promised loader and declaration entry points.',
  );
  requireValid(
    Object.values(manifest.dependencies).every(
      (version) => typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version),
    ),
    'Runtime dependencies must use exact versions.',
  );
  const files = archive.files.map((path) => path.slice('package/'.length));
  for (const path of requiredFiles) {
    requireValid(files.includes(path), `Packed package is missing required ${path}.`);
  }
  for (const path of files) {
    requireValid(
      requiredFiles.includes(path) ||
        (/^build\/[\w./-]+\.d\.ts$/.test(path) && !path.startsWith('build/tests/')),
      `Packed package contains an unapproved file: ${path}.`,
    );
  }
  return archive;
}

function sourceIdentity(root) {
  requireValid(
    checked('git', ['status', '--porcelain', '--untracked-files=normal'], root).length === 0,
    'Release candidate identity requires a clean committed checkout.',
  );
  return {
    commit: checked('git', ['rev-parse', 'HEAD'], root).toString('utf8').trim(),
    tree: checked('git', ['rev-parse', 'HEAD^{tree}'], root).toString('utf8').trim(),
  };
}

/** Binds a validated archive to its reviewed source without changing its version or rebuilding. */
export function releaseIdentity({ root = process.cwd(), artifact }) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const archive = validatePackageSurface(inspectReleaseArchive(artifact), manifest);
  return {
    schema: 1,
    name: archive.manifest.name,
    version: archive.manifest.version,
    sha256: archive.sha256,
    integrity: archive.integrity,
    fileCount: archive.fileCount,
    ...sourceIdentity(root),
  };
}

/** Rejects replacement bytes, a different source revision, or changed package metadata. */
export function verifyReleaseIdentity({
  root = process.cwd(),
  artifact,
  identity,
  expectedSha256,
}) {
  const actual = releaseIdentity({ root, artifact });
  requireValid(
    isDeepStrictEqual(actual, identity),
    'Archive or reviewed source identity differs from the validated candidate.',
  );
  if (expectedSha256 !== undefined) {
    requireValid(
      /^[a-f0-9]{64}$/.test(expectedSha256) && actual.sha256 === expectedSha256,
      'Archive hash differs from the successful candidate build output.',
    );
  }
  return actual;
}

/** Command-line boundary used by candidate, scanner, consumer and publisher jobs. */
export function main(args = process.argv.slice(2)) {
  try {
    const { values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        artifact: { type: 'string' },
        identity: { type: 'string' },
        write: { type: 'boolean', default: false },
        sha256: { type: 'string' },
      },
    });
    requireValid(
      values.artifact && values.identity,
      'Use --artifact TGZ --identity JSON [--write | --sha256 EXPECTED].',
    );
    requireValid(!(values.write && values.sha256), '--write cannot accept a preexisting hash.');
    const identity = values.write
      ? releaseIdentity({ artifact: values.artifact })
      : verifyReleaseIdentity({
          artifact: values.artifact,
          identity: JSON.parse(boundedBytes(values.identity, 1024 * 1024).toString('utf8')),
          expectedSha256: values.sha256,
        });
    if (values.write) writeFileSync(values.identity, `${JSON.stringify(identity, null, 2)}\n`);
    console.log(`Validated permitio ${identity.version}: ${identity.sha256}.`);
    return 0;
  } catch (error) {
    console.error(`Release archive validation failed: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = main();
