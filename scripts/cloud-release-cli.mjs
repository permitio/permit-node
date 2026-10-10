import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, parseArgs } from 'node:util';
import { setTimeout as pause } from 'node:timers/promises';

import { inspectReleaseArchive, verifyReleaseIdentity } from '#scripts/release-artifact.mjs';
import { bytesSha256 } from '#scripts/release-evidence.mjs';
import {
  CLOUD_CASES,
  CLOUD_CONTRACT_SHA256,
  CLOUD_ORIGIN,
  trustedCloudIdentity,
} from '#scripts/node-acceptance.mjs';
import { produceCloudProof } from '#scripts/cloud-release.mjs';

const workflowRefPattern =
  /^permitio\/permit-node\/\.github\/workflows\/(?:ci\.yaml|node_sdk_publish\.yaml)@refs\//u;

const diagnosticPattern = /^cloud-proof(?::[a-z0-9_-]{1,40}){2,6}$/u;

function refusal(message, code) {
  return Object.assign(new Error(message), { code });
}
function requireValid(value, message, code) {
  if (!value) throw refusal(message, code);
}
function diagnosticCode(error, fallback) {
  return typeof error?.code === 'string' && error.code.startsWith('cloud-proof:')
    ? error.code
    : fallback;
}

/**
 * Formats the single CLI failure diagnostic from a refusal's static code.
 * @param error - Any caught failure; only its `code` is read, never its message or other fields.
 * @returns The code when it has the static `cloud-proof` shape and no identifier-like hexadecimal
 * run; otherwise `unclassified`.
 */
export function cloudProofDiagnostic(error) {
  const code = error?.code;
  const safe =
    typeof code === 'string' && diagnosticPattern.test(code) && !/[a-f0-9]{12}/u.test(code);
  return `Cloud proof diagnostic: ${safe ? code : 'unclassified'}`;
}

function bytes(file, maximum = 16 * 1024 * 1024) {
  const stat = lstatSync(file);
  requireValid(stat.isFile() && stat.size <= maximum, 'Cloud proof input is not a bounded file.');
  return readFileSync(file);
}

/**
 * Loads both installed entries only after every packed file matches the checked archive bytes.
 * @param options - Independently checked candidate and frozen consumer installation paths.
 * @returns CJS/ESM constructors and SDK error classes resolved outside the source checkout.
 * @throws When package contents, resolution or the candidate archive differs, with a static code.
 */
export async function installedCloudEntries({ artifact, consumer, root }) {
  const archive = inspectReleaseArchive(artifact);
  const installation = realpathSync(consumer);
  const packageRoot = realpathSync(join(installation, 'node_modules/permitio'));
  requireValid(
    packageRoot.startsWith(installation + sep) && !packageRoot.startsWith(realpathSync(root) + sep),
    'Cloud proof must use the external installed candidate.',
    'cloud-proof:entries:external',
  );
  for (const file of archive.files) {
    const relative = file.slice('package/'.length);
    const actual = bytes(join(packageRoot, relative));
    // Archive inspection already rejects links and unsafe member names.
    const packed = execFileSync('tar', ['-xOzf', artifact, file], {
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
    });
    requireValid(
      actual.equals(packed),
      'Installed cloud candidate differs from archive bytes.',
      'cloud-proof:entries:archive-bytes',
    );
  }
  const require = createRequire(join(installation, 'package.json'));
  const commonjs = realpathSync(require.resolve('permitio'));
  requireValid(
    commonjs === join(packageRoot, 'build/index.js'),
    'Cloud CommonJS entry does not resolve the checked archive.',
    'cloud-proof:entries:resolution',
  );
  const esmPath = join(packageRoot, 'build/index.mjs');
  const esm = await import(pathToFileURL(esmPath));
  const cjs = require('permitio');
  const exported = (entry) =>
    ['Permit', 'PermitConnectionError', 'PermitPDPStatusError'].every(
      (name) => typeof entry[name] === 'function',
    );
  requireValid(
    exported(esm) && exported(cjs),
    'Cloud package entries do not expose the required constructor and error classes.',
    'cloud-proof:entries:constructors',
  );
  return [esm, cjs].map((entry, index) => ({
    name: index === 0 ? 'esm' : 'commonjs',
    Permit: entry.Permit,
    PermitConnectionError: entry.PermitConnectionError,
    PermitPDPStatusError: entry.PermitPDPStatusError,
  }));
}

/**
 * Requires the four reviewed operation oracles and observations for both installed entries.
 * `readinessFailures` counts failed requests tolerated while the first check waited for
 * readiness, so it is an integer from 0 to 29 and positive only for the check case.
 * @param proof - Producer output; unrecognized fields are dropped.
 * @returns The allowlisted phase, case and HTTP observation records.
 * @throws With a static `cloud-proof:proof:*` code when any record is incomplete or invalid.
 */
export function allowlistedProof(proof) {
  const positive = (value) => Number.isSafeInteger(value) && value > 0 && value <= 10_000;
  requireValid(
    Array.isArray(proof?.phaseResults) &&
      proof.phaseResults.length === 4 &&
      Array.isArray(proof.caseResults) &&
      proof.caseResults.length === 4 &&
      Array.isArray(proof.httpObservations) &&
      proof.httpObservations.length === 8,
    'Cloud proof has incomplete finite observations.',
    'cloud-proof:proof:incomplete',
  );
  const phaseResults = [],
    caseResults = [],
    httpObservations = [];
  for (const definition of CLOUD_CASES) {
    const phases = proof.phaseResults.filter((row) => row.id === definition.id);
    const cases = proof.caseResults.filter((row) => row.id === definition.id);
    requireValid(
      phases.length === 1 && cases.length === 1,
      'Cloud phase or case is missing or duplicated.',
      'cloud-proof:proof:duplicate',
    );
    const phase = phases[0],
      entry = cases[0];
    requireValid(
      phase.kind === 'pdp' &&
        phase.status === 'PASSED' &&
        positive(phase.assertions) &&
        entry.phaseId === definition.id &&
        entry.level === 'pdp' &&
        entry.status === 'PASSED' &&
        positive(entry.assertions) &&
        entry.assertions <= phase.assertions &&
        isDeepStrictEqual(entry.methodNames, definition.methodNames) &&
        isDeepStrictEqual(entry.operationKeys, definition.operationKeys),
      'Cloud phase or case has invalid public links or assertions.',
      'cloud-proof:proof:case',
    );
    phaseResults.push({
      id: definition.id,
      kind: 'pdp',
      status: 'PASSED',
      assertions: phase.assertions,
    });
    caseResults.push({
      ...definition,
      phaseId: definition.id,
      status: 'PASSED',
      assertions: entry.assertions,
    });
    for (const format of ['esm', 'commonjs']) {
      const matches = proof.httpObservations.filter(
        (row) => row.caseId === definition.id && row.entry === format,
      );
      const observation = matches[0];
      const path = definition.operationKeys[0].slice('pdp-cloud POST '.length);
      requireValid(
        matches.length === 1 &&
          observation.method === 'POST' &&
          observation.path === path &&
          observation.origin === CLOUD_ORIGIN &&
          observation.status === 200 &&
          positive(observation.requests) &&
          typeof observation.requestIdPresent === 'boolean',
        'Cloud case lacks valid observations for both installed entries.',
        'cloud-proof:proof:observation',
      );
      requireValid(
        Number.isSafeInteger(observation.readinessFailures) &&
          observation.readinessFailures >= 0 &&
          observation.readinessFailures < 30 &&
          (observation.readinessFailures === 0 || definition.id === 'cloud.check'),
        'Cloud readiness failures are allowed only while the first check waits for readiness.',
        'cloud-proof:proof:readiness',
      );
      httpObservations.push({
        caseId: definition.id,
        entry: format,
        method: 'POST',
        path,
        origin: CLOUD_ORIGIN,
        status: 200,
        requests: observation.requests,
        requestIdPresent: observation.requestIdPresent,
        readinessFailures: observation.readinessFailures,
      });
    }
  }
  return { phaseResults, caseResults, httpObservations };
}

/**
 * Writes only finite public observations; arbitrary SDK failures never reach logs or artifacts.
 * @param options - Trusted source/runtime metadata and the actual cloud operation boundary.
 * @returns Zero for complete observed requests, two for absent required request-ID headers.
 * @throws With a constant message if execution or safe output persistence fails; its static
 * `code` names the first failed check.
 */
export async function saveCloudRun({ execute, identity, ci, lockSha256, node, output }) {
  let stage = 'cloud-proof:run:execute';
  try {
    requireValid(
      /^[a-f0-9]{64}$/u.test(identity?.sha256) &&
        /^[a-f0-9]{40}$/u.test(identity.commit) &&
        /^[a-f0-9]{40}$/u.test(identity.tree) &&
        /^[a-f0-9]{64}$/u.test(lockSha256) &&
        /^\d+\.\d+\.\d+$/u.test(node),
      'Cloud source/runtime/lock identity is invalid.',
      'cloud-proof:identity:metadata',
    );
    requireValid(
      ci &&
        isDeepStrictEqual(Object.keys(ci).sort(), [
          'commit',
          'repository',
          'runAttempt',
          'runId',
          'tree',
          'workflowRef',
        ]) &&
        ci.repository === 'permitio/permit-node' &&
        ci.commit === identity.commit &&
        ci.tree === identity.tree &&
        /^[1-9]\d*$/u.test(ci.runId) &&
        /^[1-9]\d*$/u.test(ci.runAttempt) &&
        workflowRefPattern.test(ci.workflowRef),
      'Cloud CI metadata differs from the checked source.',
      'cloud-proof:ci:metadata',
    );
    const proof = allowlistedProof(await execute());
    const native = {
      schema: 2,
      scope: 'permit-node',
      node,
      artifactSha256: identity.sha256,
      source: { commit: identity.commit, tree: identity.tree },
      consumerLockSha256: lockSha256,
      pdp: {
        kind: 'managed-cloud',
        origin: CLOUD_ORIGIN,
        contractSha256: CLOUD_CONTRACT_SHA256,
        observedAt: new Date().toISOString(),
        ci,
      },
      phaseResults: proof.phaseResults,
      caseResults: proof.caseResults,
      httpObservations: proof.httpObservations,
    };
    const nativeBytes = Buffer.from(JSON.stringify(native, null, 2) + '\n');
    const run = {
      id: 'candidate.cloud.node' + node,
      artifactSha256: identity.sha256,
      nativeReportSha256: bytesSha256(nativeBytes),
      node,
      target: 'hosted-ci',
      consumerLockSha256: lockSha256,
      pdp: native.pdp,
      phaseResults: proof.phaseResults,
      caseResults: proof.caseResults,
      httpObservations: proof.httpObservations,
      cleanup: { registered: 1, completed: 0, verified: 0 },
      setupErrorCount: 0,
      cleanupErrorCount: 0,
    };
    stage = 'cloud-proof:output:write';
    mkdirSync(output, { recursive: true, mode: 0o700 });
    writeFileSync(join(output, 'native.json'), nativeBytes, { flag: 'wx', mode: 0o600 });
    writeFileSync(join(output, 'run.json'), JSON.stringify(run, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    return proof.httpObservations.every((row) => row.requestIdPresent) ? 0 : 2;
  } catch (error) {
    throw refusal(
      'Cloud SDK proof failed; no complete cloud execution credit is available.',
      diagnosticCode(error, stage),
    );
  }
}

/**
 * Runs only in trusted CI against exact source/archive/lock bytes and an owned environment key.
 * On failure it prints one static `Cloud proof diagnostic:` line before the constant message.
 */
export async function main(
  args = process.argv.slice(2),
  root = resolve(import.meta.dirname, '..'),
) {
  let stage = 'cloud-proof:cli:arguments';
  try {
    const { values } = parseArgs({
      args,
      strict: true,
      allowPositionals: false,
      options: {
        artifact: { type: 'string' },
        identity: { type: 'string' },
        consumer: { type: 'string' },
        fixture: { type: 'string' },
        output: { type: 'string' },
      },
    });
    requireValid(
      ['artifact', 'identity', 'consumer', 'fixture', 'output'].every((key) => values[key]),
      'Cloud proof requires artifact, identity, consumer, fixture and output paths.',
      stage,
    );
    stage = 'cloud-proof:identity:file';
    const identity = JSON.parse(bytes(values.identity, 64 * 1024));
    stage = 'cloud-proof:identity:archive';
    const checked = verifyReleaseIdentity({ root, artifact: values.artifact, identity });
    stage = 'cloud-proof:ci:trusted';
    const ci = trustedCloudIdentity(process.env, checked);
    stage = 'cloud-proof:runtime:matrix';
    const nodes = JSON.parse(bytes(join(root, 'api-coverage/release-matrix.json'))).nodes;
    requireValid(
      nodes.includes(process.versions.node),
      'Unreviewed actual cloud Node runtime.',
      'cloud-proof:runtime:unreviewed',
    );
    stage = 'cloud-proof:lock:file';
    const lockSha256 = bytesSha256(bytes(join(values.consumer, 'pnpm-lock.yaml')));
    stage = 'cloud-proof:fixture:file';
    const fixture = JSON.parse(bytes(values.fixture, 64 * 1024));
    stage = 'cloud-proof:entries:installed';
    const entries = await installedCloudEntries({
      artifact: values.artifact,
      consumer: values.consumer,
      root,
    });
    const token = process.env['PERMIT_API_KEY'];
    const result = await saveCloudRun({
      identity: checked,
      ci,
      lockSha256,
      node: process.versions.node,
      output: values.output,
      execute: () => produceCloudProof({ entries, token, fixture, pause }),
    });
    console.log(
      result === 0
        ? 'Cloud SDK observations passed; owned cleanup remains required.'
        : 'Cloud SDK requests omitted required X-Request-ID; publication remains unavailable.',
    );
    return result;
  } catch (error) {
    console.error(cloudProofDiagnostic({ code: diagnosticCode(error, stage) }));
    console.error('Cloud proof failed. Check candidate identity, trusted CI and owned setup.');
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = await main();
