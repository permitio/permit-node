import {
  appendFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { cloudControlRequest } from '#scripts/cloud-http.mjs';
import {
  captureCloudClosure,
  settleCloudClosure,
  verifyCloudClosure,
} from '#scripts/cloud-closure.mjs';
import {
  provisionCloudEnvironment,
  fetchCloudEnvironmentCredential,
  cleanupCloudEnvironment,
} from '#scripts/cloud-environment.mjs';
import {
  cloudFixtureNames,
  seedCloudFixture,
  verifyCloudFixtureSettled,
} from '#scripts/cloud-fixture.mjs';

const diagnosticPattern = /^[a-z]+(?::[a-z0-9_-]{1,40}){1,4}$/u;

function requireValid(value, code) {
  if (!value)
    throw Object.assign(new Error('Trusted cloud lifecycle input or ownership is invalid.'), {
      code,
    });
}

/**
 * Formats the single setup or cleanup diagnostic line from a refusal's static code.
 * @param error - Any caught failure; only its `code` is read, never its message or other fields.
 * @returns The code when it has the static shape and contains no identifier-like hexadecimal run;
 * otherwise `unclassified`.
 */
function diagnosticLine(error) {
  const code = error?.code;
  const safe =
    typeof code === 'string' && diagnosticPattern.test(code) && !/[a-f0-9]{12}/u.test(code);
  return `Cloud lifecycle diagnostic: ${safe ? code : 'unclassified'}`;
}

/**
 * Binds no-checkout steps to this repository, source commit, trusted event and exact run attempt.
 */
export function trustedCloudRun(env) {
  requireValid(
    env.GITHUB_ACTIONS === 'true' &&
      env.GITHUB_REPOSITORY === 'permitio/permit-node' &&
      /^[1-9]\d*$/u.test(env.GITHUB_RUN_ID) &&
      /^[1-9]\d*$/u.test(env.GITHUB_RUN_ATTEMPT) &&
      /^[a-f0-9]{40}$/u.test(env.GITHUB_SHA) &&
      env.GITHUB_ACTOR !== 'dependabot[bot]' &&
      /^permitio\/permit-node\/\.github\/workflows\/ci\.yaml@refs\/(heads|pull)\//u.test(
        env.GITHUB_WORKFLOW_REF,
      ) &&
      ((env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main') ||
        (env.GITHUB_EVENT_NAME === 'pull_request' &&
          env.PR_HEAD_REPOSITORY === env.GITHUB_REPOSITORY)),
    'lifecycle:trusted-run',
  );
  return {
    repository: env.GITHUB_REPOSITORY,
    workflowRef: env.GITHUB_WORKFLOW_REF,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    commit: env.GITHUB_SHA,
  };
}

function cloudDirectory({ directory, env }) {
  requireValid(
    typeof directory === 'string' &&
      isAbsolute(directory) &&
      typeof env.RUNNER_TEMP === 'string' &&
      isAbsolute(env.RUNNER_TEMP),
    'lifecycle:directory',
  );
  const base = realpathSync(env.RUNNER_TEMP);
  const absolute = resolve(directory);
  requireValid(absolute.startsWith(base + sep), 'lifecycle:directory');
  mkdirSync(absolute, { recursive: true, mode: 0o700 });
  requireValid(
    realpathSync(absolute) === absolute && !lstatSync(absolute).isSymbolicLink(),
    'lifecycle:directory',
  );
  return absolute;
}

function regularBytes(file) {
  const stat = lstatSync(file);
  requireValid(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 64 * 1024, 'lifecycle:file');
  return readFileSync(file, 'utf8');
}

function savePrivateState(file, value, first = false) {
  const encoded = JSON.stringify(value) + '\n';
  requireValid(Buffer.byteLength(encoded) <= 64 * 1024, 'lifecycle:state-size');
  if (first) {
    writeFileSync(file, encoded, { mode: 0o600, flag: 'wx' });
    return;
  }
  regularBytes(file);
  const pending = file + '.next';
  writeFileSync(pending, encoded, { mode: 0o600, flag: 'wx' });
  renameSync(pending, file);
}

function readLifecycleState({ directory, env }) {
  const ci = trustedCloudRun(env);
  const folder = cloudDirectory({ directory, env });
  const state = JSON.parse(regularBytes(join(folder, 'state.json')));
  requireValid(
    state &&
      isDeepStrictEqual(Object.keys(state).sort(), [
        'ci',
        'closure',
        'fixture',
        'owner',
        'schema',
      ]) &&
      state.schema === 1 &&
      isDeepStrictEqual(state.ci, ci),
    'lifecycle:state',
  );
  const key = `node-acceptance-${ci.runId}-${ci.runAttempt}`;
  requireValid(
    state.owner &&
      isDeepStrictEqual(Object.keys(state.owner).sort(), [
        'attempted',
        'capture',
        'identity',
        'key',
        'marker',
        'project',
        'schema',
      ]) &&
      state.owner.schema === 1 &&
      state.owner.key === key &&
      state.owner.marker === `permit-node:release-acceptance:${key}` &&
      state.owner.project === env.PROJECT_ID &&
      typeof state.owner.attempted === 'boolean' &&
      ['verified', 'unverified'].includes(state.owner.capture),
    'lifecycle:owner',
  );
  return { state, folder, ci };
}

/**
 * Creates and seeds one environment without executing candidate code or writing a credential
 * artifact.
 * @param options - Trusted Actions metadata, step credential, state directory, HTTP boundary and
 * the line writer for the single static failure diagnostic.
 * @returns A finite setup summary; operational state contains only owned identifiers and
 * timestamps.
 * @throws With a constant message after reporting one static diagnostic code; unresolved writes
 * remain durable and block later deletion.
 */
export async function setupTrustedCloud({
  directory,
  env = process.env,
  request,
  report = (line) => console.error(line),
}) {
  try {
    const ci = trustedCloudRun(env);
    const folder = cloudDirectory({ directory, env });
    const http = request ?? cloudControlRequest({ credential: env.PROJECT_API_KEY });
    const key = `node-acceptance-${ci.runId}-${ci.runAttempt}`;
    const state = { schema: 1, ci, owner: null, fixture: null, closure: null };
    const file = join(folder, 'state.json');
    let first = true;
    const scoped = await provisionCloudEnvironment({
      request: http,
      project: env.PROJECT_ID,
      key,
      marker: `permit-node:release-acceptance:${key}`,
      save: async (owner) => {
        state.owner = owner;
        savePrivateState(file, state, first);
        first = false;
      },
    });
    const context = {
      organization: scoped.organization,
      project: env.PROJECT_ID,
      environment: scoped.state.identity.id,
      createdAt: scoped.state.identity.createdAt,
    };
    const childRequest = (input) => http({ ...input, credential: scoped.credential });
    state.closure = await captureCloudClosure({
      request: childRequest,
      projectRequest: http,
      context,
    });
    savePrivateState(file, state);
    const fixture = await seedCloudFixture({
      context: {
        organization: scoped.organization,
        project: env.PROJECT_ID,
        environment: scoped.state.identity.id,
        key,
        marker: state.owner.marker,
      },
      request: childRequest,
      save: async (captured) => {
        state.fixture = captured;
        savePrivateState(file, state);
      },
    });
    state.closure = await settleCloudClosure({
      request: childRequest,
      projectRequest: http,
      closure: state.closure,
      fixture: state.fixture,
    });
    savePrivateState(file, state);
    writeFileSync(join(folder, 'fixture.json'), JSON.stringify(fixture) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    return { schema: 2, status: 'PASS', fixtureWriteCount: state.fixture.records.length };
  } catch (error) {
    report(diagnosticLine(error));
    throw new Error('Trusted cloud setup failed; inspect retained ownership state privately.');
  }
}

/**
 * Hands a verified environment key through a masked same-job step output before any checkout.
 * @param options - Same-run state, step-only broad key and runner output/masking boundaries.
 * @returns No credential; it writes only the scoped step output after masking.
 * @throws With a constant diagnostic if source, ownership, scope or output storage differs.
 */
export async function handoffTrustedCloud({
  directory,
  env = process.env,
  request,
  mask = (line) => console.log(line),
}) {
  try {
    requireValid(env.CLOUD_SETUP_RESULT === 'success', 'lifecycle:setup-result');
    const { state } = readLifecycleState({ directory, env });
    verifyCloudFixtureSettled(state.fixture, state.owner);
    requireValid(state.fixture.records.length === 7, 'lifecycle:fixture-count');
    const http = request ?? cloudControlRequest({ credential: env.PROJECT_API_KEY });
    const scoped = await fetchCloudEnvironmentCredential({ request: http, state: state.owner });
    const output = env.GITHUB_OUTPUT;
    requireValid(
      typeof output === 'string' &&
        isAbsolute(output) &&
        realpathSync(output).startsWith(realpathSync(env.RUNNER_TEMP) + sep),
      'lifecycle:output',
    );
    regularBytes(output);
    mask('::add-mask::' + scoped.credential.replaceAll('%', '%25'));
    appendFileSync(output, `api_key=${scoped.credential}\n`);
  } catch {
    throw new Error('Trusted cloud credential handoff failed; no candidate execution is allowed.');
  }
}

/**
 * Performs independent immutable ownership checks and verified absence in the always-cleanup job.
 * @param options - Same-run durable state, step-only broader key, explicit HTTP boundary and the
 * line writer for the single static failure diagnostic.
 * @returns A finite cleanup receipt; failed or unresolved fixture writes cannot authorize a
 * cascade.
 * @throws With a constant message after reporting one static diagnostic code, instead of received
 * bodies, exceptions or credentials.
 */
export async function cleanupTrustedCloud({
  directory,
  env = process.env,
  request,
  report = (line) => console.error(line),
}) {
  try {
    const { state, folder, ci } = readLifecycleState({ directory, env });
    requireValid(
      ['success', 'failure', 'cancelled'].includes(env.CLOUD_SETUP_RESULT),
      'lifecycle:setup-result',
    );
    if (state.fixture !== null) verifyCloudFixtureSettled(state.fixture, state.owner);
    else requireValid(env.CLOUD_SETUP_RESULT !== 'success', 'lifecycle:fixture-missing');
    if (env.CLOUD_SETUP_RESULT === 'success')
      requireValid(
        state.fixture.records.length === 7 &&
          isDeepStrictEqual(
            JSON.parse(regularBytes(join(folder, 'fixture.json'))),
            cloudFixtureNames(state.owner.key),
          ),
        'lifecycle:fixture-names',
      );
    const http = request ?? cloudControlRequest({ credential: env.PROJECT_API_KEY });
    requireValid(
      state.closure &&
        state.closure.context.project === state.owner.project &&
        state.closure.context.environment === state.owner.identity?.id &&
        state.closure.context.createdAt === state.owner.identity?.createdAt,
      'lifecycle:closure-context',
    );
    const scoped = await fetchCloudEnvironmentCredential({ request: http, state: state.owner });
    requireValid(
      scoped.organization === state.closure.context.organization,
      'lifecycle:organization',
    );
    await verifyCloudClosure({
      request: (input) => http({ ...input, credential: scoped.credential }),
      projectRequest: http,
      closure: state.closure,
      fixture: state.fixture,
    });
    const cleanup = await cleanupCloudEnvironment({ request: http, state: state.owner });
    const receipt = { schema: 2, ci, cleanup };
    writeFileSync(join(folder, 'cleanup.json'), JSON.stringify(receipt) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    return receipt;
  } catch (error) {
    report(diagnosticLine(error));
    throw new Error('Trusted cloud cleanup failed; ownership or verified absence is incomplete.');
  }
}
