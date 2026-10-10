import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { digest } from '#scripts/api-contracts.mjs';
import {
  readNodeAcceptance,
  trustedCloudIdentity,
  validateNodeAcceptance,
} from '#scripts/node-acceptance.mjs';

const root = resolve(import.meta.dirname, '..');
const fixture = () => JSON.parse(readFileSync(resolve(root, 'api-coverage/node-acceptance.json')));

test('loads Node scope and binds the complete reviewed acceptance contract', () => {
  const result = readNodeAcceptance(root);
  expect(result.acceptanceSha256).toBe(digest(fixture()));
  expect(result.acceptance.scope).toBe('permit-node');
  expect(result.acceptance.deferrals.sharedTarget).toEqual({
    status: 'UNAVAILABLE',
    owner: 'PER-16345',
  });
});

test('pins accepted async cases and both routes without granting execution credit', () => {
  const result = readNodeAcceptance(root).acceptance.features.find(
    (row) => row.id === 'environment-async-copy',
  );
  expect(result.caseIds).toEqual([
    'wire.api.environments.copyAsync.esm',
    'wire.api.environments.copyAsync.commonjs',
    'wire.api.environments.getCopyResult.esm',
    'wire.api.environments.getCopyResult.commonjs',
    'api.async-copy.new-target',
    'api.async-copy.existing-target',
  ]);
  expect(result.operationKeys).toEqual([
    'control-plane POST /v2/projects/{proj_id}/envs/{env_id}/copy/async',
    'control-plane GET /v2/projects/{proj_id}/envs/{env_id}/copy/async/{task_id}/result',
  ]);
});

test.each([
  [
    'legacy schema',
    (v) => {
      v.schema = 1;
    },
  ],
  [
    'shared scope',
    (v) => {
      v.scope = 'five-sdks';
    },
  ],
  [
    'unknown field',
    (v) => {
      v.releaseReady = true;
    },
  ],
  [
    'removed feature',
    (v) => {
      v.features.pop();
    },
  ],
  [
    'duplicate feature',
    (v) => {
      v.features.push(structuredClone(v.features[0]));
    },
  ],
  [
    'invented feature',
    (v) => {
      v.features[0].id = 'speculative-feature';
    },
  ],
  [
    'changed owner',
    (v) => {
      v.features[0].owner = 'PER-1';
    },
  ],
  [
    'removed route',
    (v) => {
      v.features[1].operationKeys.pop();
    },
  ],
  [
    'substituted route',
    (v) => {
      v.features[1].operationKeys[0] = 'control-plane GET /other';
    },
  ],
  [
    'duplicate cases',
    (v) => {
      v.features[0].caseIds.push(v.features[0].caseIds[0]);
    },
  ],
  [
    'removed gate',
    (v) => {
      v.requiredGates.pop();
    },
  ],
  [
    'removed backend dependency',
    (v) => {
      v.dependencies = [];
    },
  ],
  [
    'changed backend dependency',
    (v) => {
      v.dependencies[0].owner = 'PER-1';
    },
  ],
  [
    'label-only shared completion',
    (v) => {
      v.deferrals.sharedTarget.status = 'COMPLETE';
    },
  ],
  [
    'deferred implementation claim',
    (v) => {
      v.deferrals.bulkCounts.status = 'COMPLETE';
    },
  ],
])('rejects %s in the adopted Node contract', (_name, change) => {
  const plan = fixture();
  change(plan);
  expect(() => validateNodeAcceptance(plan)).toThrow();
});

const source = { commit: 'a'.repeat(40), tree: 'b'.repeat(40) };
const ci = () => ({
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'permitio/permit-node',
  GITHUB_EVENT_NAME: 'push',
  GITHUB_ACTOR: 'owned-collaborator',
  GITHUB_WORKFLOW_REF: 'permitio/permit-node/.github/workflows/ci.yaml@refs/heads/codex/release',
  GITHUB_SHA: source.commit,
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
});

test('returns only allowlisted independently supplied CI identity', () => {
  expect(trustedCloudIdentity({ ...ci(), PRIVATE_VALUE: 'never-export' }, source)).toEqual({
    repository: 'permitio/permit-node',
    workflowRef: ci().GITHUB_WORKFLOW_REF,
    runId: '123',
    runAttempt: '1',
    ...source,
  });
});

test.each([
  [
    'local runner',
    (env) => {
      delete env.GITHUB_ACTIONS;
    },
  ],
  [
    'fork',
    (env) => {
      env.GITHUB_REPOSITORY = 'foreign/permit-node';
    },
  ],
  [
    'fork pull request',
    (env) => {
      env.GITHUB_EVENT_NAME = 'pull_request';
      env.PR_HEAD_REPOSITORY = 'foreign/permit-node';
    },
  ],
  [
    'dependency bot',
    (env) => {
      env.GITHUB_ACTOR = 'dependabot[bot]';
    },
  ],
  [
    'unapproved event',
    (env) => {
      env.GITHUB_EVENT_NAME = 'workflow_dispatch';
    },
  ],
  [
    'different source',
    (env) => {
      env.GITHUB_SHA = 'c'.repeat(40);
    },
  ],
  [
    'different workflow',
    (env) => {
      env.GITHUB_WORKFLOW_REF = 'permitio/permit-node/.github/workflows/other.yml@refs/heads/main';
    },
  ],
  [
    'missing attempt',
    (env) => {
      delete env.GITHUB_RUN_ATTEMPT;
    },
  ],
])('refuses %s as a cloud acceptance context', (_name, change) => {
  const env = ci();
  change(env);
  expect(() => trustedCloudIdentity(env, source)).toThrow();
});

test('ordinary users.create case IDs cannot adopt inline-role acceptance', () => {
  const plan = fixture();
  plan.features[0].caseIds = ['api.legal-attribute-roundtrip'];
  expect(() => validateNodeAcceptance(plan)).toThrow('Required Node feature');
});
