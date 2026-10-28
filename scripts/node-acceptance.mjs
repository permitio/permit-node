import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { digest } from '#scripts/api-contracts.mjs';

const workflowRefPattern =
  /^permitio\/permit-node\/\.github\/workflows\/(?:ci\.yaml|node_sdk_publish\.yaml)@refs\//u;

export const CLOUD_ORIGIN = 'https://cloudpdp.api.permit.io';
export const CLOUD_CONTRACT_SHA256 =
  '8fb3ad79b93679b24ddd90596e17b7f6baa6b662e2c09a96f1a3ffc938292a29';
export const CLOUD_CASES = [
  ['check', '/allowed'],
  ['bulkCheck', '/allowed/bulk'],
  ['getAuthorizedUsers', '/authorized_users'],
  ['getUserPermissions', '/user-permissions'],
].map(([method, path]) => ({
  id: `cloud.${method}`,
  level: 'pdp',
  methodNames: [`permit.${method}`],
  operationKeys: [`pdp-cloud POST ${path}`],
}));
export const INLINE_ROLE_CASES = [
  ['wire.api.users.inline-roles.esm', 'wire'],
  ['wire.api.users.inline-roles.commonjs', 'wire'],
  ['api.users.inline-roles-persisted', 'api'],
].map(([id, level]) => ({
  id,
  level,
  methodNames: ['permit.api.users.create'],
  operationKeys: ['control-plane POST /v2/facts/{proj_id}/{env_id}/users'],
}));
export const ASYNC_COPY_CASES = [
  {
    id: 'wire.api.environments.copyAsync.esm',
    level: 'wire',
    methodNames: ['permit.api.environments.copyAsync'],
    operationKeys: ['control-plane POST /v2/projects/{proj_id}/envs/{env_id}/copy/async'],
  },
  {
    id: 'wire.api.environments.copyAsync.commonjs',
    level: 'wire',
    methodNames: ['permit.api.environments.copyAsync'],
    operationKeys: ['control-plane POST /v2/projects/{proj_id}/envs/{env_id}/copy/async'],
  },
  {
    id: 'wire.api.environments.getCopyResult.esm',
    level: 'wire',
    methodNames: ['permit.api.environments.getCopyResult'],
    operationKeys: [
      'control-plane GET /v2/projects/{proj_id}/envs/{env_id}/copy/async/{task_id}/result',
    ],
  },
  {
    id: 'wire.api.environments.getCopyResult.commonjs',
    level: 'wire',
    methodNames: ['permit.api.environments.getCopyResult'],
    operationKeys: [
      'control-plane GET /v2/projects/{proj_id}/envs/{env_id}/copy/async/{task_id}/result',
    ],
  },
  {
    id: 'api.async-copy.new-target',
    level: 'api',
    methodNames: ['permit.api.environments.copyAsync', 'permit.api.environments.getCopyResult'],
    operationKeys: [
      'control-plane POST /v2/projects/{proj_id}/envs/{env_id}/copy/async',
      'control-plane GET /v2/projects/{proj_id}/envs/{env_id}/copy/async/{task_id}/result',
    ],
  },
  {
    id: 'api.async-copy.existing-target',
    level: 'api',
    methodNames: ['permit.api.environments.copyAsync', 'permit.api.environments.getCopyResult'],
    operationKeys: [
      'control-plane POST /v2/projects/{proj_id}/envs/{env_id}/copy/async',
      'control-plane GET /v2/projects/{proj_id}/envs/{env_id}/copy/async/{task_id}/result',
    ],
  },
];
export const NODE_FEATURES = [
  {
    id: 'create-user-inline-roles',
    owner: 'PER-16573',
    caseIds: INLINE_ROLE_CASES.map((row) => row.id),
    operationKeys: ['control-plane POST /v2/facts/{proj_id}/{env_id}/users'],
  },
  {
    id: 'environment-async-copy',
    owner: 'PER-16951',
    caseIds: ASYNC_COPY_CASES.map((row) => row.id),
    operationKeys: [
      'control-plane POST /v2/projects/{proj_id}/envs/{env_id}/copy/async',
      'control-plane GET /v2/projects/{proj_id}/envs/{env_id}/copy/async/{task_id}/result',
    ],
  },
];
export const ACCEPTANCE_GATES = ['candidate', 'cloud-setup', 'cloud-test', 'cloud-cleanup'];
export const NODE_DEFERRALS = {
  sharedTarget: { status: 'UNAVAILABLE', owner: 'PER-16345' },
  curtainCall: { status: 'OWNER_DEFERRED', owner: 'PER-16574' },
  bulkCounts: { status: 'OWNER_DEFERRED', owner: 'PER-9298' },
};

/** Loads the reviewed Node scope; labels alone cannot adopt another acceptance contract. */
export function readNodeAcceptance(root) {
  const plan = JSON.parse(readFileSync(join(root, 'api-coverage/node-acceptance.json'), 'utf8'));
  validateNodeAcceptance(plan);
  return { acceptance: plan, acceptanceSha256: digest(plan) };
}

/** Checks fixed scope/deferrals and required feature observations without granting execution. */
export function validateNodeAcceptance(plan) {
  const fields = ['schema', 'scope', 'deferrals', 'requiredGates', 'features', 'dependencies'];
  if (
    !plan ||
    !isDeepStrictEqual(Object.keys(plan).sort(), fields.sort()) ||
    plan.schema !== 2 ||
    plan.scope !== 'permit-node' ||
    !isDeepStrictEqual(plan.deferrals, NODE_DEFERRALS) ||
    !isDeepStrictEqual(plan.requiredGates, ACCEPTANCE_GATES) ||
    !Array.isArray(plan.features) ||
    !plan.features.length ||
    !Array.isArray(plan.dependencies)
  )
    throw new Error('Invalid reviewed Node acceptance contract.');
  const ids = new Set();
  for (const feature of plan.features) {
    if (
      !isDeepStrictEqual(Object.keys(feature).sort(), [
        'caseIds',
        'id',
        'operationKeys',
        'owner',
      ]) ||
      !/^[a-z][a-z0-9.-]+$/u.test(feature.id) ||
      !/^PER-[1-9]\d*$/u.test(feature.owner) ||
      !Array.isArray(feature.caseIds) ||
      feature.caseIds.some((id) => typeof id !== 'string' || !/^[a-z][A-Za-z0-9.-]+$/u.test(id)) ||
      new Set(feature.caseIds).size !== feature.caseIds.length ||
      ids.has(feature.id)
    )
      throw new Error('Invalid required Node feature observations.');
    const required = NODE_FEATURES.find((row) => row.id === feature.id);
    if (
      !required ||
      feature.owner !== required.owner ||
      (required.caseIds && !isDeepStrictEqual(feature.caseIds, required.caseIds)) ||
      !isDeepStrictEqual(feature.operationKeys, required.operationKeys)
    )
      throw new Error('Required Node feature routes or owners differ from the adopted contract.');
    ids.add(feature.id);
  }
  if (ids.size !== NODE_FEATURES.length || NODE_FEATURES.some((feature) => !ids.has(feature.id)))
    throw new Error('Adopted async-copy and inline-role proof cannot be removed.');
  if (
    plan.dependencies.length !== 1 ||
    plan.dependencies[0]?.id !== 'user-attribute-backend-rollout' ||
    plan.dependencies[0]?.owner !== 'PER-16954'
  )
    throw new Error('Required backend rollout dependency cannot be removed or reassigned.');
  for (const dependency of plan.dependencies)
    if (
      !isDeepStrictEqual(Object.keys(dependency).sort(), ['id', 'owner', 'status']) ||
      !/^[a-z][a-z0-9.-]+$/u.test(dependency.id) ||
      !/^PER-[1-9]\d*$/u.test(dependency.owner) ||
      !['UNAVAILABLE', 'VERIFIED'].includes(dependency.status)
    )
      throw new Error('Invalid Node acceptance dependency.');
}

/** Reads trusted CI identity independently of the supplied producer payload. */
export function trustedCloudIdentity(env, { commit, tree }) {
  if (
    env['GITHUB_ACTIONS'] !== 'true' ||
    env['GITHUB_REPOSITORY'] !== 'permitio/permit-node' ||
    !['push', 'pull_request', 'release'].includes(env['GITHUB_EVENT_NAME']) ||
    env['GITHUB_ACTOR'] === 'dependabot[bot]' ||
    (env['GITHUB_EVENT_NAME'] === 'pull_request' &&
      env['PR_HEAD_REPOSITORY'] !== 'permitio/permit-node') ||
    !workflowRefPattern.test(env['GITHUB_WORKFLOW_REF'] ?? '') ||
    env['GITHUB_SHA'] !== commit ||
    !/^[a-f0-9]{40}$/u.test(commit) ||
    !/^[a-f0-9]{40}$/u.test(tree) ||
    !/^[1-9]\d*$/u.test(env['GITHUB_RUN_ID'] ?? '') ||
    !/^[1-9]\d*$/u.test(env['GITHUB_RUN_ATTEMPT'] ?? '')
  )
    throw new Error('Cloud acceptance requires an authorized trusted CI source and run.');
  return {
    repository: env['GITHUB_REPOSITORY'],
    workflowRef: env['GITHUB_WORKFLOW_REF'],
    runId: env['GITHUB_RUN_ID'],
    runAttempt: env['GITHUB_RUN_ATTEMPT'],
    commit,
    tree,
  };
}
