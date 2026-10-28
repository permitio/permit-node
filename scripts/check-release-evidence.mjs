#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';

import { inspectReleaseArchive } from '#scripts/release-artifact.mjs';
import {
  NODE_DEFERRALS,
  readNodeAcceptance,
  trustedCloudIdentity,
} from '#scripts/node-acceptance.mjs';

export { inspectReleaseArchive } from '#scripts/release-artifact.mjs';

import {
  bytesSha256,
  expectedReleaseInventory,
  validateReleaseEvidence,
} from '#scripts/release-evidence.mjs';

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

/** Rebuilds and packs clean source with pinned pnpm and disabled package lifecycle hooks. */
export function prepareReleaseReference(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const pnpm = checked('pnpm', ['--version'], root).toString('utf8').trim();
  requireValid(
    manifest.packageManager === `pnpm@${pnpm}`,
    'Use the repository-pinned pnpm version.',
  );
  checked('pnpm', ['run', 'build'], root);
  const directory = mkdtempSync(join(tmpdir(), 'permit-release-reference-'));
  try {
    checked('pnpm', ['pack', '--ignore-scripts', '--pack-destination', directory], root);
    const entries = readdirSync(directory, { withFileTypes: true });
    requireValid(
      entries.length === 1 && entries[0].isFile() && entries[0].name.endsWith('.tgz'),
      'Reference packing did not produce exactly one regular archive.',
    );
    return inspectReleaseArchive(join(directory, entries[0].name));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Requires exact bytes from a freshly rebuilt package, including every file boundary. */
export function verifyCandidateArchive(candidate, reference) {
  requireValid(
    candidate.sha256 === reference.sha256 &&
      candidate.fileCount === reference.fileCount &&
      isDeepStrictEqual(candidate.manifest, reference.manifest),
    'Candidate differs from the freshly built reference package.',
  );
}

/** Builds independent local inputs; baseline identity comes from reviewed official npm metadata. */
export async function inspectReleaseInputs({
  root,
  artifact,
  baseline,
  candidateLock,
  baselineLock,
  cloudLocks,
  env = process.env,
}) {
  const status = checked(
    'git',
    ['status', '--porcelain', '--untracked-files=normal'],
    root,
  ).toString('utf8');
  requireValid(status.length === 0, 'Release evidence requires a clean committed SDK checkout.');
  const tree = checked('git', ['rev-parse', 'HEAD^{tree}'], root).toString('utf8').trim();
  const requirements = JSON.parse(
    readFileSync(join(root, 'api-coverage/release-matrix.json'), 'utf8'),
  );
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const candidate = inspectReleaseArchive(artifact);
  const released = inspectReleaseArchive(baseline);
  const reference = prepareReleaseReference(root);
  verifyCandidateArchive(candidate, reference);
  requireValid(
    checked('git', ['status', '--porcelain', '--untracked-files=normal'], root).length === 0 &&
      checked('git', ['rev-parse', 'HEAD^{tree}'], root).toString('utf8').trim() === tree,
    'SDK source changed during independent package inspection.',
  );
  requireValid(
    released.manifest.version === requirements.baseline.version &&
      released.sha256 === requirements.baseline.sha256 &&
      released.integrity === requirements.baseline.integrity,
    'Baseline differs from the reviewed official npm release.',
  );
  requireValid(
    candidate.sha256 !== released.sha256,
    'Candidate and baseline artifacts are identical.',
  );
  const { inventory, methodLevels } = await expectedReleaseInventory(root);
  const { acceptance } = readNodeAcceptance(root);
  const commit = checked('git', ['rev-parse', 'HEAD'], root).toString('utf8').trim();
  const ci = trustedCloudIdentity(env, { commit, tree });
  const locks = Object.fromEntries(
    requirements.nodes.map((node) => [
      node,
      bytesSha256(
        boundedBytes(
          join(cloudLocks, `candidate-cloud-${node}`, 'consumer-lock.yaml'),
          16 * 1024 * 1024,
        ),
      ),
    ]),
  );
  const gateResults = JSON.parse(env['GATE_RESULTS'] ?? 'null');
  return {
    tree,
    inventory,
    methodLevels,
    requirements,
    acceptance,
    ci,
    cloudLocks: locks,
    gateResults,
    artifact: {
      name: 'permitio',
      version: manifest.version,
      sha256: candidate.sha256,
      fileCount: candidate.fileCount,
      lockSha256: bytesSha256(boundedBytes(candidateLock, 16 * 1024 * 1024)),
    },
    baseline: {
      version: released.manifest.version,
      sha256: released.sha256,
      fileCount: released.fileCount,
      lockSha256: bytesSha256(boundedBytes(baselineLock, 16 * 1024 * 1024)),
      kind: 'released-npm',
      integrity: released.integrity,
    },
  };
}

/**
 * Validates one allowlisted schema2 bundle against archive, source, locks and trusted CI inputs.
 */
export async function main(
  args = process.argv.slice(2),
  root = resolve(import.meta.dirname, '..'),
) {
  let output = resolve(root, 'coverage/release-evidence');
  let report;
  try {
    const { values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        evidence: { type: 'string' },
        artifact: { type: 'string' },
        baseline: { type: 'string' },
        'candidate-lock': { type: 'string' },
        'baseline-lock': { type: 'string' },
        'cloud-locks': { type: 'string' },
        output: { type: 'string' },
      },
    });
    if (values.output) output = resolve(values.output);
    requireValid(
      ['evidence', 'artifact', 'baseline', 'candidate-lock', 'baseline-lock', 'cloud-locks'].every(
        (key) => values[key],
      ),
      'Use --evidence FILE --artifact TGZ --baseline TGZ ' +
        '--candidate-lock FILE --baseline-lock FILE --cloud-locks DIRECTORY.',
    );
    const expected = await inspectReleaseInputs({
      root,
      artifact: values.artifact,
      baseline: values.baseline,
      candidateLock: values['candidate-lock'],
      baselineLock: values['baseline-lock'],
      cloudLocks: values['cloud-locks'],
    });
    const evidence = JSON.parse(boundedBytes(values.evidence, 16 * 1024 * 1024).toString('utf8'));
    report = validateReleaseEvidence(evidence, expected);
  } catch {
    console.error('Release evidence inspection failed. Check the reviewed inputs and CI identity.');
    report = {
      schema: 2,
      scope: 'permit-node',
      nodeEvidence: 'INVALID',
      nodeReleaseReady: false,
      exitCode: 2,
      releaseReady: false,
      ...NODE_DEFERRALS,
      incomplete: ['Independent input inspection failed; consult local diagnostics.'],
      failures: [],
    };
  }
  try {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  } catch {
    console.error('Cannot save release evidence. Check the output directory permissions.');
    return 2;
  }
  console.log(
    `Node release evidence: ${report.nodeEvidence}; release ready: ${report.releaseReady}.`,
  );
  return report.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await main();
