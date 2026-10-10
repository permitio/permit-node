import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';

import { bytesSha256 } from '#scripts/release-evidence.mjs';
import { allowlistedProof } from '#scripts/cloud-release-cli.mjs';
import { verifyReleaseIdentity } from '#scripts/release-artifact.mjs';
import {
  CLOUD_CONTRACT_SHA256,
  CLOUD_ORIGIN,
  trustedCloudIdentity,
} from '#scripts/node-acceptance.mjs';

function requireValid(value) {
  if (!value) throw new Error('Cloud execution or cleanup identity is incomplete.');
}
function exactKeys(value, keys) {
  requireValid(value && typeof value === 'object' && !Array.isArray(value));
  requireValid(isDeepStrictEqual(Object.keys(value).sort(), keys.toSorted()));
}
function fileBytes(path, maximum = 1024 * 1024) {
  const stat = lstatSync(path);
  requireValid(stat.isFile() && !stat.isSymbolicLink() && stat.size <= maximum);
  return readFileSync(path);
}

/**
 * Joins exact hosted execution and independently completed same-run ownership cleanup receipts.
 * @param options - Checked source/CI/lock identity and received public producer bytes.
 * @returns Final native report bytes and its normalized schema2 run, without readiness claims.
 * @throws With a constant diagnostic if fields, provenance, phases, cases or cleanup disagree.
 */
export function completeCloudExecution({
  identity,
  ci,
  node,
  lockBytes,
  executionBytes,
  runBytes,
  cleanupBytes,
  now = Date.now(),
}) {
  try {
    requireValid(/^[a-f0-9]{64}$/u.test(identity.sha256));
    requireValid(/^[a-f0-9]{40}$/u.test(identity.commit));
    requireValid(/^[a-f0-9]{40}$/u.test(identity.tree));
    requireValid(typeof node === 'string' && /^\d+\.\d+\.\d+$/u.test(node));
    exactKeys(ci, ['repository', 'workflowRef', 'runId', 'runAttempt', 'commit', 'tree']);
    requireValid(ci.repository === 'permitio/permit-node');
    requireValid(/^[1-9]\d*$/u.test(ci.runId) && /^[1-9]\d*$/u.test(ci.runAttempt));
    const workflow = 'permitio/permit-node/.github/workflows/';
    requireValid(typeof ci.workflowRef === 'string' && ci.workflowRef.startsWith(workflow));
    requireValid(
      /^(?:ci\.yaml|node_sdk_publish\.yaml)@refs\//u.test(ci.workflowRef.slice(workflow.length)),
    );
    const execution = JSON.parse(executionBytes),
      run = JSON.parse(runBytes);
    const cleanup = JSON.parse(cleanupBytes),
      lockSha256 = bytesSha256(lockBytes);
    exactKeys(execution, [
      'schema',
      'scope',
      'node',
      'artifactSha256',
      'source',
      'consumerLockSha256',
      'pdp',
      'phaseResults',
      'caseResults',
      'httpObservations',
    ]);
    requireValid(execution.schema === 2 && execution.scope === 'permit-node');
    requireValid(execution.node === node && execution.artifactSha256 === identity.sha256);
    requireValid(execution.consumerLockSha256 === lockSha256);
    requireValid(
      isDeepStrictEqual(execution.source, { commit: identity.commit, tree: identity.tree }),
    );
    exactKeys(execution.pdp, ['kind', 'origin', 'contractSha256', 'observedAt', 'ci']);
    requireValid(execution.pdp.kind === 'managed-cloud' && execution.pdp.origin === CLOUD_ORIGIN);
    requireValid(execution.pdp.contractSha256 === CLOUD_CONTRACT_SHA256);
    requireValid(isDeepStrictEqual(execution.pdp.ci, ci));
    requireValid(ci.commit === identity.commit && ci.tree === identity.tree);
    const observedAt = Date.parse(execution.pdp.observedAt);
    requireValid(Number.isFinite(observedAt) && now - observedAt >= -60_000);
    requireValid(now - observedAt < 86_400_000);
    const proof = allowlistedProof(execution);
    for (const key of ['phaseResults', 'caseResults', 'httpObservations'])
      requireValid(isDeepStrictEqual(execution[key], proof[key]));
    const expectedRun = {
      id: 'candidate.cloud.node' + node,
      artifactSha256: identity.sha256,
      nativeReportSha256: bytesSha256(executionBytes),
      node,
      target: 'hosted-ci',
      consumerLockSha256: lockSha256,
      pdp: execution.pdp,
      ...proof,
      cleanup: { registered: 1, completed: 0, verified: 0 },
      setupErrorCount: 0,
      cleanupErrorCount: 0,
    };
    requireValid(isDeepStrictEqual(run, expectedRun));
    exactKeys(cleanup, ['schema', 'ci', 'cleanup']);
    const { tree: _tree, ...cleanupCi } = ci;
    requireValid(cleanup.schema === 2 && isDeepStrictEqual(cleanup.ci, cleanupCi));
    requireValid(isDeepStrictEqual(cleanup.cleanup, { registered: 1, completed: 1, verified: 1 }));
    const native = {
      ...execution,
      executionReportSha256: bytesSha256(executionBytes),
      cleanupReportSha256: bytesSha256(cleanupBytes),
      cleanup: cleanup.cleanup,
      setupErrorCount: 0,
      cleanupErrorCount: 0,
    };
    const nativeBytes = Buffer.from(JSON.stringify(native, null, 2) + '\n');
    return {
      nativeBytes,
      executionBytes: Buffer.from(executionBytes),
      run: {
        ...expectedRun,
        nativeReportSha256: bytesSha256(nativeBytes),
        cleanup: cleanup.cleanup,
      },
      completeRequests: proof.httpObservations.every((row) => row.requestIdPresent),
    };
  } catch {
    throw new Error('Cloud proof completion failed; no verified execution credit is available.');
  }
}

/** Completes the five same-run cloud cells after the independent always-cleanup job succeeds. */
export function main(args = process.argv.slice(2), root = resolve(import.meta.dirname, '..')) {
  try {
    const { values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        artifact: { type: 'string' },
        identity: { type: 'string' },
        cloud: { type: 'string' },
        cleanup: { type: 'string' },
        output: { type: 'string' },
      },
    });
    requireValid(['artifact', 'identity', 'cloud', 'cleanup', 'output'].every((k) => values[k]));
    const identity = verifyReleaseIdentity({
      root,
      artifact: values.artifact,
      identity: JSON.parse(fileBytes(values.identity, 64 * 1024)),
    });
    const ci = trustedCloudIdentity(process.env, identity);
    const nodes = JSON.parse(fileBytes(join(root, 'api-coverage/release-matrix.json'))).nodes;
    const cleanupBytes = fileBytes(values.cleanup);
    requireValid(
      isDeepStrictEqual(
        readdirSync(values.cloud).toSorted(),
        nodes.map((node) => `candidate-cloud-${node}`).toSorted(),
      ),
    );
    const cells = nodes.map((node) => {
      const directory = join(values.cloud, `candidate-cloud-${node}`);
      requireValid(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink());
      requireValid(
        isDeepStrictEqual(readdirSync(directory).toSorted(), [
          'consumer-lock.yaml',
          'native.json',
          'run.json',
        ]),
      );
      const lockBytes = fileBytes(join(directory, 'consumer-lock.yaml'), 4 * 1024 * 1024);
      return {
        node,
        lockBytes,
        ...completeCloudExecution({
          identity,
          ci,
          node,
          lockBytes,
          cleanupBytes,
          executionBytes: fileBytes(join(directory, 'native.json')),
          runBytes: fileBytes(join(directory, 'run.json')),
        }),
      };
    });
    requireValid(cells.length === 5 && new Set(cells.map((x) => x.node)).size === 5);
    for (const cell of cells) {
      const directory = join(values.output, `candidate-cloud-${cell.node}`);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      for (const [name, bytes] of Object.entries({
        'native.json': cell.nativeBytes,
        'execution.json': cell.executionBytes,
        'run.json': Buffer.from(JSON.stringify(cell.run, null, 2) + '\n'),
        'consumer-lock.yaml': cell.lockBytes,
        'cleanup.json': cleanupBytes,
      }))
        writeFileSync(join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
    }
    console.log(
      'Cloud execution and owned cleanup bytes match; publication proof remains separate.',
    );
    return cells.every((row) => row.completeRequests) ? 0 : 2;
  } catch {
    console.error('Cloud proof completion failed. Check source, same-run reports and cleanup.');
    return 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = main();
