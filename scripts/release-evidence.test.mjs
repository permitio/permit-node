import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

import { digest } from '#scripts/api-contracts.mjs';
import {
  canonicalReleaseInventory,
  expectedReleaseInventory,
  validateReleaseEvidence,
} from '#scripts/release-evidence.mjs';
import {
  CLOUD_CASES,
  INLINE_ROLE_CASES,
  ASYNC_COPY_CASES,
  CLOUD_ORIGIN,
  CLOUD_CONTRACT_SHA256,
  NODE_DEFERRALS,
  readNodeAcceptance,
} from '#scripts/node-acceptance.mjs';

const candidateHash = 'a'.repeat(64);
const baselineHash = 'b'.repeat(64);
const pdpDigest = `sha256:${'c'.repeat(64)}`;
const sharedCase = {
  id: 'ab.users.edge-values',
  level: 'api',
  methodNames: ['permit.api.users.create'],
  operationKeys: ['control-plane POST /v2/facts/{proj_id}/{env_id}/users'],
};

function fixture(nodes = ['22.13.0', '22.23.3', '24.0.0', '24.21.0', '26.11.0']) {
  const acceptance = readNodeAcceptance(resolve(import.meta.dirname, '..')).acceptance;
  const featureCases = [...INLINE_ROLE_CASES, ...ASYNC_COPY_CASES];
  acceptance.dependencies[0].status = 'VERIFIED';
  const definitions = [sharedCase, ...featureCases, ...CLOUD_CASES];
  const keys = [...new Set(definitions.flatMap((row) => row.operationKeys))];
  const methodNames = [...new Set(definitions.flatMap((row) => row.methodNames))];
  const inventory = {
    methods: methodNames.map((name) => ({
      name,
      caseIds: definitions.filter((row) => row.methodNames.includes(name)).map((row) => row.id),
    })),
    operations: keys.map((key) => {
      const [source, method, ...parts] = key.split(' ');
      return {
        source,
        method,
        path: parts.join(' '),
        decision: 'retain',
        caseIds: definitions.filter((row) => row.operationKeys.includes(key)).map((row) => row.id),
      };
    }),
  };
  inventory.operations.push({
    source: 'pdp-container',
    method: 'GET',
    path: '/deferred',
    decision: 'defer',
    caseIds: [],
  });
  const artifact = {
    name: 'permitio',
    version: '3.0.0',
    sha256: candidateHash,
    fileCount: 440,
    lockSha256: 'd'.repeat(64),
  };
  const baseline = {
    version: '2.7.5',
    sha256: baselineHash,
    fileCount: 999,
    lockSha256: 'e'.repeat(64),
    kind: 'released-npm',
    integrity: 'sha512-' + 'A'.repeat(86) + '==',
  };
  const ci = {
    repository: 'permitio/permit-node',
    workflowRef: 'permitio/permit-node/.github/workflows/ci.yaml@refs/heads/codex/release',
    runId: '123',
    runAttempt: '1',
    commit: '9'.repeat(40),
    tree: 'f'.repeat(40),
  };
  const now = Date.parse('2026-10-08T12:00:00Z');
  const requirements = {
    nodes,
    runIds: nodes.flatMap((node) => ['baseline-' + node, 'candidate-' + node]),
    phaseIds: ['api.users', 'wire.users'],
    pdps: ['pinned', 'current'].map((role) => ({
      role,
      digest: pdpDigest,
      resolvedAt: '2026-10-08',
    })),
    cases: definitions,
    abCaseIds: [sharedCase.id],
    intentionalDifferences: [{ id: 'migration.flat-facade', changeId: 'A1' }],
    cloud: {
      origin: CLOUD_ORIGIN,
      contractSha256: CLOUD_CONTRACT_SHA256,
      caseIds: CLOUD_CASES.map((row) => row.id),
      phaseIds: CLOUD_CASES.map((row) => row.id),
      runIds: nodes.map((node) => 'candidate.cloud.node' + node),
    },
  };
  const expected = {
    artifact,
    baseline,
    inventory,
    requirements,
    tree: ci.tree,
    acceptance,
    ci,
    now,
    cloudLocks: Object.fromEntries(nodes.map((node) => [node, '8'.repeat(64)])),
    gateResults: Object.fromEntries(
      acceptance.requiredGates.map((name) => [name, { result: 'success' }]),
    ),
    methodLevels: Object.fromEntries(methodNames.map((name) => [name, 'wire'])),
  };
  const local = nodes.flatMap((node) =>
    ['baseline', 'candidate'].map((role) => ({
      id: role + '-' + node,
      artifactSha256: role === 'baseline' ? baselineHash : candidateHash,
      nativeReportSha256: '1'.repeat(64),
      node,
      target: 'local',
      consumerLockSha256: role === 'baseline' ? baseline.lockSha256 : artifact.lockSha256,
      httpObservations: [],
      pdp: {
        kind: 'container',
        digest: pdpDigest,
        roles: ['pinned', 'current'],
        resolvedAt: '2026-10-08',
      },
      phaseResults: [
        {
          id: 'api.users',
          kind: 'api',
          status: 'PASSED',
          assertions: role === 'baseline' ? 24 : 32,
        },
        {
          id: 'wire.users',
          kind: 'wire',
          status: 'PASSED',
          assertions: role === 'baseline' ? 16 : 48,
        },
      ],
      caseResults: (role === 'baseline' ? [sharedCase] : [sharedCase, ...featureCases]).map(
        (row) => ({
          ...row,
          phaseId: row.level === 'wire' ? 'wire.users' : 'api.users',
          status: 'PASSED',
          assertions: 8,
        }),
      ),
      cleanup: { registered: 1, completed: 1, verified: 1 },
      setupErrorCount: 0,
      cleanupErrorCount: 0,
    })),
  );
  const cloud = nodes.map((node) => ({
    id: 'candidate.cloud.node' + node,
    artifactSha256: candidateHash,
    nativeReportSha256: '2'.repeat(64),
    node,
    target: 'hosted-ci',
    consumerLockSha256: expected.cloudLocks[node],
    httpObservations: CLOUD_CASES.flatMap((row) =>
      ['esm', 'commonjs'].map((entry) => ({
        caseId: row.id,
        entry,
        method: 'POST',
        path: row.operationKeys[0].slice('pdp-cloud POST '.length),
        origin: CLOUD_ORIGIN,
        status: 200,
        requests: 1,
        requestIdPresent: true,
        readinessFailures: 0,
      })),
    ),
    pdp: {
      kind: 'managed-cloud',
      origin: CLOUD_ORIGIN,
      contractSha256: CLOUD_CONTRACT_SHA256,
      observedAt: new Date(now).toISOString(),
      ci,
    },
    phaseResults: CLOUD_CASES.map((row) => ({
      id: row.id,
      kind: 'pdp',
      status: 'PASSED',
      assertions: 8,
    })),
    caseResults: CLOUD_CASES.map((row) => ({
      ...row,
      phaseId: row.id,
      status: 'PASSED',
      assertions: 8,
    })),
    cleanup: { registered: 0, completed: 0, verified: 0 },
    setupErrorCount: 0,
    cleanupErrorCount: 0,
  }));
  const evidence = {
    schema: 2,
    artifact,
    sdk: {
      tree: expected.tree,
      inventorySha256: digest(canonicalReleaseInventory(inventory)),
      acceptanceSha256: digest(acceptance),
    },
    inventory,
    runs: [...local, ...cloud],
    ab: {
      baseline,
      candidateSha256: candidateHash,
      cases: nodes.map((node) => ({
        id: sharedCase.id,
        baselineRunId: 'baseline-' + node,
        candidateRunId: 'candidate-' + node,
        status: 'PASSED',
        assertions: 1,
      })),
      intentionalDifferences: requirements.intentionalDifferences,
    },
    gates: NODE_DEFERRALS,
  };
  return { evidence: structuredClone(evidence), expected: structuredClone(expected) };
}

function result(change) {
  const { evidence, expected } = fixture();
  change?.(evidence, expected);
  return validateReleaseEvidence(evidence, expected);
}

test('computes Node readiness only from complete independently bound proof', () => {
  expect(result()).toEqual({
    schema: 2,
    scope: 'permit-node',
    nodeEvidence: 'PASS',
    exitCode: 0,
    nodeReleaseReady: true,
    releaseReady: true,
    ...NODE_DEFERRALS,
    incomplete: [],
    failures: [],
  });
});

test.each([
  ['root', (v) => v],
  ['artifact', (v) => v.artifact],
  ['sdk', (v) => v.sdk],
  ['inventory', (v) => v.inventory],
  ['method', (v) => v.inventory.methods[0]],
  ['operation', (v) => v.inventory.operations[0]],
  ['run', (v) => v.runs[0]],
  ['PDP', (v) => v.runs[0].pdp],
  ['phase', (v) => v.runs[0].phaseResults[0]],
  ['case', (v) => v.runs[0].caseResults[0]],
  ['cleanup', (v) => v.runs[0].cleanup],
  ['A/B', (v) => v.ab],
  ['baseline', (v) => v.ab.baseline],
  ['comparison', (v) => v.ab.cases[0]],
  ['difference', (v) => v.ab.intentionalDifferences[0]],
  ['gates', (v) => v.gates],
  ['shared target', (v) => v.gates.sharedTarget],
])('rejects undeclared private metadata at %s', (_name, pick) => {
  const report = result((v) => {
    pick(v).internalMetadata = 'must not be published';
  });
  expect(report.exitCode).toBe(2);
  expect(JSON.stringify(report)).not.toContain('must not be published');
});

test.each([
  [
    'wrong archive',
    (v) => {
      v.artifact.sha256 = baselineHash;
    },
    'Candidate artifact or lockfile differs from supplied bytes.',
  ],
  [
    'wrong file count',
    (v) => {
      v.artifact.fileCount++;
    },
    'Candidate artifact or lockfile differs from supplied bytes.',
  ],
  [
    'wrong consumer lock',
    (v) => {
      v.artifact.lockSha256 = baselineHash;
    },
    'Candidate artifact or lockfile differs from supplied bytes.',
  ],
  [
    'wrong source tree',
    (v) => {
      v.sdk.tree = '0'.repeat(40);
    },
    'SDK source tree differs from the clean checkout.',
  ],
  [
    'wrong inventory hash',
    (v) => {
      v.sdk.inventorySha256 = baselineHash;
    },
    'Inventory digest differs.',
  ],
  [
    'same-version development baseline',
    (v) => {
      v.ab.baseline.sha256 = candidateHash;
    },
    'Released baseline or lockfile differs from supplied bytes.',
  ],
  [
    'wrong baseline integrity',
    (v) => {
      v.ab.baseline.integrity = `sha512-${'B'.repeat(86)}==`;
    },
    'Released baseline or lockfile differs from supplied bytes.',
  ],
  [
    'baseline used for candidate cell',
    (v) => {
      v.runs[1].artifactSha256 = baselineHash;
      v.runs[1].consumerLockSha256 = v.ab.baseline.lockSha256;
    },
    'Missing local candidate cell: Node 22.13.0/pinned.',
  ],
  [
    'different local consumer lock',
    (v) => {
      v.runs[1].consumerLockSha256 = '7'.repeat(64);
    },
    'Local consumer lock differs.',
  ],
  [
    'unknown artifact',
    (v) => {
      v.runs[1].artifactSha256 = '2'.repeat(64);
    },
    'Unknown artifact in run candidate-22.13.0.',
  ],
  [
    'removed inventory method',
    (v) => {
      v.inventory.methods.pop();
    },
    'Public inventory or decisions differ.',
  ],
  [
    'removed deferred operation',
    (v) => {
      v.inventory.operations.pop();
    },
    'Public inventory or decisions differ.',
  ],
  [
    'changed source decision',
    (v) => {
      v.inventory.operations[0].decision = 'defer';
    },
    'Public inventory or decisions differ.',
  ],
  [
    'unreviewed case',
    (v) => {
      v.runs[1].caseResults[0].id = 'invented.case';
    },
    'Unreviewed case ID.',
  ],
  [
    'invented route credit',
    (v) => {
      v.runs[1].caseResults[0].operationKeys = [];
    },
    'Case ab.users.edge-values: operation links differ.',
  ],
  [
    'invented method credit',
    (v) => {
      v.runs[1].caseResults[0].methodNames = [];
    },
    'Case ab.users.edge-values: method links differ.',
  ],
  [
    'weaker evidence level',
    (v) => {
      v.runs[1].caseResults[0].level = 'wire';
    },
    'Case ab.users.edge-values: evidence level differs.',
  ],
  [
    'missing phase link',
    (v) => {
      v.runs[1].caseResults[0].phaseId = 'missing.phase';
    },
    'Case ab.users.edge-values: missing/mismatched phase.',
  ],
  [
    'missing case links',
    (v) => {
      v.inventory.methods[0].caseIds = [];
    },
    'Case links differ: permit.api.users.create.',
  ],
  [
    'invented adoption',
    (v) => {
      v.gates.sharedTarget.status = 'ADOPTED';
    },
    'Node deferrals differ from the adopted contract.',
  ],
])('returns INVALID for %s', (_name, change, message) => {
  const report = result(change);
  expect(report).toMatchObject({ exitCode: 2, releaseReady: false });
  expect(report.incomplete).toContain(message);
});

test.each([
  [
    'missing floor',
    (v) => {
      v.runs.splice(2);
      v.ab.cases.splice(1);
    },
    'Missing local candidate cell: Node 24.0.0/pinned.',
  ],
  [
    'missing current PDP',
    (v) => {
      for (const run of v.runs.filter((row) => row.target === 'local')) run.pdp.roles = ['pinned'];
    },
    'Missing local candidate cell: Node 22.13.0/current.',
  ],
  [
    'unreviewed current patch',
    (v) => {
      v.runs[0].node = '24.1.0';
    },
    'Unreviewed runtime in run baseline-22.13.0.',
  ],
  [
    'wrong PDP bytes',
    (v) => {
      v.runs[0].pdp.digest = `sha256:${baselineHash}`;
    },
    'Unreviewed PDP in run baseline-22.13.0.',
  ],
  [
    'extra run on an unreviewed PDP',
    (v, e) => {
      const extra = structuredClone(v.runs[1]);
      extra.id = 'candidate-extra';
      extra.pdp.digest = `sha256:${'9'.repeat(64)}`;
      e.requirements.runIds.push(extra.id);
      v.runs.push(extra);
    },
    'Unreviewed PDP in run candidate-extra.',
  ],
  [
    'undated current image',
    (v) => {
      v.runs[0].pdp.resolvedAt = '';
    },
    'run.pdp.resolvedAt: invalid value.',
  ],
  [
    'invalid date',
    (v) => {
      v.runs[0].pdp.resolvedAt = '2026-02-30';
    },
    'run.pdp.resolvedAt: invalid value.',
  ],
  [
    'offline service evidence',
    (v) => {
      v.runs[0].target = 'offline';
    },
    'Run baseline-22.13.0: offline phase claims service proof.',
  ],
  [
    'missing execution',
    (v) => {
      v.runs[0].caseResults = [];
    },
    'A/B ab.users.edge-values: missing execution case.',
  ],
  [
    'phase counts alone',
    (v) => {
      for (const run of v.runs.filter((row) => row.target === 'local')) run.caseResults = [];
    },
    'Missing case ab.users.edge-values: Node 22.13.0/pinned.',
  ],
  [
    'zero-assertion case',
    (v) => {
      v.runs[0].caseResults[0].assertions = 0;
    },
    'Case ab.users.edge-values: PASS has no successful phase assertions.',
  ],
  [
    'zero-assertion phase',
    (v) => {
      v.runs[0].phaseResults[0].assertions = 0;
    },
    'Phase api.users: empty PASS.',
  ],
  [
    'required phase reported as an empty PASS',
    (v, e) => {
      e.requirements.phaseIds.push('wire.empty');
      for (const run of v.runs.filter((row) => row.target === 'local'))
        run.phaseResults.push({ id: 'wire.empty', kind: 'wire', status: 'PASSED', assertions: 0 });
    },
    'Phase wire.empty: empty PASS.',
  ],
  [
    'zero-assertion comparison',
    (v) => {
      v.ab.cases[0].assertions = 0;
    },
    'A/B ab.users.edge-values: PASS without successful execution and comparison assertions.',
  ],
  [
    'A/B PASS over a failed execution case',
    (v) => {
      v.runs[1].caseResults.find((row) => row.id === sharedCase.id).status = 'FAILED';
    },
    'A/B ab.users.edge-values: PASS without successful execution and comparison assertions.',
  ],
  [
    'missing A/B',
    (v) => {
      v.ab.cases = [];
    },
    'Missing A/B ab.users.edge-values: Node 22.13.0/pinned.',
  ],
  [
    'A/B runtime mismatch',
    (v) => {
      v.ab.cases[0].baselineRunId = 'baseline-24.0.0';
    },
    'A/B ab.users.edge-values: missing or different artifact/runtime/PDP cells.',
  ],
  [
    'setup error',
    (v) => {
      v.runs[0].setupErrorCount++;
    },
    'Run baseline-22.13.0: setup or cleanup is incomplete.',
  ],
  [
    'cleanup error',
    (v) => {
      v.runs[0].cleanupErrorCount++;
    },
    'Run baseline-22.13.0: setup or cleanup is incomplete.',
  ],
  [
    'unverified cleanup',
    (v) => {
      v.runs[0].cleanup.verified--;
    },
    'Run baseline-22.13.0: setup or cleanup is incomplete.',
  ],
  [
    'unexecuted cleanup',
    (v) => {
      v.runs[0].cleanup.completed--;
    },
    'Run baseline-22.13.0: setup or cleanup is incomplete.',
  ],
  [
    'registered cleanup never completed',
    (v) => {
      v.runs[1].cleanup = { registered: 2, completed: 1, verified: 1 };
    },
    'Run candidate-22.13.0: setup or cleanup is incomplete.',
  ],
  [
    'unreachable backend',
    (v) => {
      v.runs[0].phaseResults[0].status = 'INVALID';
    },
    'baseline-22.13.0/api.users: INVALID.',
  ],
  [
    'not run',
    (v) => {
      v.runs[0].caseResults[0].status = 'NOT_RUN';
    },
    'baseline-22.13.0/ab.users.edge-values: NOT_RUN.',
  ],
  [
    'duplicate run',
    (v) => {
      v.runs.push(structuredClone(v.runs[0]));
    },
    'runs: duplicate entries.',
  ],
  [
    'duplicate case',
    (v) => {
      v.runs[0].caseResults.push(structuredClone(v.runs[0].caseResults[0]));
    },
    'run.caseResults: duplicate entries.',
  ],
  [
    'negative assertions',
    (v) => {
      v.runs[0].caseResults[0].assertions = -1;
    },
    'case.assertions: invalid value.',
  ],
  [
    'fractional assertions',
    (v) => {
      v.runs[0].caseResults[0].assertions = 1.2;
    },
    'case.assertions: invalid value.',
  ],
  [
    'unsafe integer',
    (v) => {
      v.runs[0].cleanup.registered = Number.MAX_SAFE_INTEGER + 1;
    },
    'run.cleanup.registered: invalid value.',
  ],
])('cannot pass with %s', (_name, change, message) => {
  const report = result(change);
  expect(report).toMatchObject({ exitCode: 2, releaseReady: false });
  expect(report.incomplete).toContain(message);
});

test('retains actual failures and gives incomplete cleanup precedence', () => {
  const { evidence, expected } = fixture();
  evidence.runs[1].phaseResults[0].status = 'FAILED';
  for (const row of evidence.runs[1].caseResults) row.status = 'FAILED';
  evidence.ab.cases[0].status = 'FAILED';
  expect(validateReleaseEvidence(evidence, expected)).toMatchObject({
    exitCode: 1,
    nodeEvidence: 'FAIL',
    failures: expect.arrayContaining(['ab.cases[0]']),
  });
  evidence.runs[1].cleanup.verified = 0;
  expect(validateReleaseEvidence(evidence, expected)).toMatchObject({
    exitCode: 2,
    failures: expect.arrayContaining(['ab.cases[0]']),
  });
});

test('requires mapping for every method and retained operation without erasing gaps', () => {
  const report = result((v, expected) => {
    expected.methodLevels['permit.api.users.get'] = 'wire';
    for (const inventory of [v.inventory, expected.inventory]) {
      inventory.methods.push({ name: 'permit.api.users.get', caseIds: [] });
      inventory.operations.push({
        source: 'pdp-container',
        method: 'GET',
        path: '/unproven',
        decision: 'retain',
        caseIds: [],
      });
    }
    v.sdk.inventorySha256 = digest(canonicalReleaseInventory(v.inventory));
  });
  expect(report.exitCode).toBe(2);
  expect(report.incomplete).toEqual(
    expect.arrayContaining([
      'No reviewed case for permit.api.users.get.',
      'No reviewed case for pdp-container GET /unproven.',
    ]),
  );
});

test('extracts all actual SDK/source entries with case-independent hashing', async () => {
  const result = await expectedReleaseInventory(resolve(import.meta.dirname, '..'));
  expect(result.inventory.methods).toHaveLength(180);
  expect(
    result.inventory.methods.filter((method) => method.name.startsWith('permit.api.userInvites.')),
  ).toHaveLength(6);
  const attributes = result.inventory.methods.filter((method) =>
    method.name.startsWith('permit.api.userAttributes.'),
  );
  const plan = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../api-coverage/release-matrix.json'), 'utf8'),
  );
  expect(attributes.map((method) => method.name)).toEqual(
    ['create', 'delete', 'get', 'list', 'update'].map(
      (method) => `permit.api.userAttributes.${method}`,
    ),
  );
  for (const method of attributes) {
    const name = method.name.split('.').at(-1);
    expect(
      plan.cases
        .filter((entry) => entry.methodNames.includes(method.name))
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(
      [
        `wire.api.userAttributes.${name}.esm`,
        `wire.api.userAttributes.${name}.commonjs`,
        `api.user-attributes.${name}`,
        'api.user-attributes.access',
      ].sort(),
    );
  }
  const bulkName = 'permit.api.roles.bulkCreateOrReplace';
  expect(result.inventory.methods.filter((method) => method.name === bulkName)).toHaveLength(1);
  const bulkCases = plan.cases.filter((entry) => entry.methodNames.includes(bulkName));
  expect(bulkCases.map((entry) => entry.id).sort()).toEqual([
    'api.bulk-roles.create-replace',
    'api.bulk-roles.scope',
    'wire.api.roles.bulkCreateOrReplace.commonjs',
    'wire.api.roles.bulkCreateOrReplace.esm',
  ]);
  expect(bulkCases.map((entry) => entry.level).sort()).toEqual(['api', 'api', 'wire', 'wire']);
  for (const entry of bulkCases)
    expect(entry.operationKeys).toEqual([
      'control-plane PUT /v2/schema/{proj_id}/{env_id}/bulk/roles',
    ]);
  const localName = 'permit.getLocalRoleAssignments';
  expect(result.inventory.methods.filter((method) => method.name === localName)).toHaveLength(1);
  const localCases = plan.cases.filter((entry) => entry.methodNames.includes(localName));
  expect(localCases.map((entry) => entry.id).sort()).toEqual([
    'commonjs.mock-pdp.local-role-assignments-errors',
    'commonjs.mock-pdp.local-role-assignments-invalid',
    'mock-pdp.local-role-assignments-errors',
    'mock-pdp.local-role-assignments-invalid',
    'pdp.local-role-assignments-filters-pagination',
    'pdp.local-role-assignments-removal',
    'wire.permit.getLocalRoleAssignments.commonjs',
    'wire.permit.getLocalRoleAssignments.esm',
  ]);
  expect(localCases.map((entry) => entry.level).sort()).toEqual([
    'mock-pdp',
    'mock-pdp',
    'mock-pdp',
    'mock-pdp',
    'pdp',
    'pdp',
    'wire',
    'wire',
  ]);
  for (const entry of localCases)
    expect(entry.operationKeys).toEqual(['pdp-container GET /local/role_assignments']);
  expect(result.inventory.operations).toHaveLength(307);
  expect(result.inventorySha256).toBe(digest(canonicalReleaseInventory(result.inventory)));
  const changed = structuredClone(result.inventory);
  changed.methods.reverse();
  changed.operations.reverse();
  changed.methods[0].caseIds = ['new.case'];
  expect(digest(canonicalReleaseInventory(changed))).toBe(result.inventorySha256);
}, 20_000);

test('retains later reported failures even when an earlier binding is invalid', () => {
  const report = result((v) => {
    v.artifact.sha256 = baselineHash;
    v.runs[3].phaseResults[0].status = 'FAILED';
    v.runs[3].caseResults[0].status = 'FAILED';
    v.ab.cases[1].status = 'FAILED';
  });
  expect(report.exitCode).toBe(2);
  expect(report.failures).toEqual([
    'runs[3].phaseResults[0]',
    'runs[3].caseResults[0]',
    'ab.cases[1]',
  ]);
});

test.each(['run', 'phase', 'case', 'ab'])('does not publish rejected %s labels', (kind) => {
  const secret = 'private-secret-that-must-never-be-published';
  const report = result((v) => {
    if (kind === 'run') v.runs[0].id = secret;
    else if (kind === 'phase') v.runs[0].phaseResults[0].id = secret;
    else if (kind === 'case') v.runs[0].caseResults[0].id = secret;
    else v.ab.cases[0].id = secret;
  });
  expect(report.exitCode).toBe(2);
  expect(JSON.stringify(report)).not.toContain(secret);
});

test('does not turn a single phase assertion into several independently passing cases', () => {
  const report = result((v, expected) => {
    const extra = { ...sharedCase, id: 'api.another-observation' };
    expected.requirements.cases.push(extra);
    for (const row of v.inventory.methods)
      if (extra.methodNames.includes(row.name)) row.caseIds.push(extra.id);
    v.inventory.operations[0].caseIds.push(extra.id);
    v.runs[1].caseResults.push({ ...extra, phaseId: 'api.users', status: 'PASSED', assertions: 8 });
  });
  expect(report.exitCode).toBe(2);
  expect(report.incomplete).toContain('Case assertions exceed the containing phase.');
});

test('requires existing phase evidence even when newly mapped cases are present', () => {
  const report = result((_v, expected) => {
    expected.requirements.phaseIds.push('pdp.existing-control');
  });
  expect(report.exitCode).toBe(2);
  expect(report.incomplete).toContain('Missing phase pdp.existing-control: Node 22.13.0/pinned.');
});

test('package presence assertions cannot replace HTTP behavior evidence', () => {
  const report = result((v, expected) => {
    for (const row of expected.requirements.cases)
      if (row.methodNames.includes('permit.api.users.create')) row.level = 'package';
    for (const run of v.runs.filter((row) => row.target === 'local')) {
      for (const row of run.caseResults) row.level = 'package';
      run.phaseResults[0].kind = 'package';
    }
  });
  expect(report.exitCode).toBe(2);
  expect(report.incomplete).toContain('Required inline-role proof case differs.');
});

test.each([
  [
    'empty phases',
    (_v, e) => {
      e.requirements.phaseIds = [];
    },
    'Reviewed run and phase registries must be nonempty and unique.',
  ],
  [
    'empty runs',
    (_v, e) => {
      e.requirements.runIds = [];
    },
    'Reviewed run and phase registries must be nonempty and unique.',
  ],
  [
    'missing floor',
    (_v, e) => {
      e.requirements.nodes = ['22.13.0'];
      e.requirements.cloud.runIds = ['candidate.cloud.node22.13.0'];
    },
    'Reviewed runtime matrix must use supported Node versions and retain both test floors.',
  ],
  [
    'unmapped AB',
    (_v, e) => {
      e.requirements.abCaseIds = ['missing.case'];
    },
    'Every reviewed A/B ID must have an execution case.',
  ],
])('does not accept an accidentally reduced reviewed policy: %s', (_name, change, message) => {
  const report = result(change);
  expect(report.exitCode).toBe(2);
  expect(report.incomplete).toEqual([message]);
});

test('the committed plan preserves missing source-addition proof', async () => {
  const root = resolve(import.meta.dirname, '..');
  const actual = await expectedReleaseInventory(root);
  const plan = JSON.parse(readFileSync(resolve(root, 'api-coverage/release-matrix.json'), 'utf8'));
  const { evidence, expected } = fixture();
  expected.inventory = actual.inventory;
  expected.methodLevels = actual.methodLevels;
  expected.requirements = plan;
  evidence.inventory = structuredClone(actual.inventory);
  for (const row of evidence.inventory.methods)
    row.caseIds = plan.cases
      .filter((entry) => entry.methodNames.includes(row.name))
      .map((entry) => entry.id);
  for (const row of evidence.inventory.operations) {
    const key = `${row.source} ${row.method} ${row.path}`;
    row.caseIds = plan.cases
      .filter((entry) => entry.operationKeys.includes(key))
      .map((entry) => entry.id);
  }
  evidence.sdk.inventorySha256 = actual.inventorySha256;
  evidence.runs = [];
  evidence.ab.cases = [];
  evidence.ab.intentionalDifferences = plan.intentionalDifferences;
  const report = validateReleaseEvidence(evidence, expected);
  expect(report.exitCode).toBe(2);
  expect(report.incomplete).toContain(
    'Missing case api.async-copy.new-target: Node 22.13.0/pinned.',
  );
  expect(report.incomplete).toContain('Missing local candidate cell: Node 24.21.0/current.');
  expect(report.incomplete.some((message) => message.startsWith('Missing case '))).toBe(true);
  expect(evidence.inventory.methods).toHaveLength(180);
  expect(evidence.inventory.operations).toHaveLength(307);
}, 20_000);

test.each(['23.0.0', '25.0.0', '26.11.0', '27.0.0'])(
  'accepts complete reviewed evidence on supported later Node %s',
  (node) => {
    const { evidence, expected } = fixture(['22.13.0', '24.0.0', node]);
    expect(validateReleaseEvidence(evidence, expected).exitCode).toBe(0);
  },
);

test.each([
  '20.0.0',
  '22.12.9',
  '22.13.0-rc.1',
  '26.11.0-rc.1',
  '26.11.0+build',
  '026.11.0',
  '26.11',
  '9007199254740993.0.0',
])('rejects unsupported or noncanonical Node identities: %s', (node) => {
  const { evidence, expected } = fixture(['22.13.0', '24.0.0', node]);
  expect(validateReleaseEvidence(evidence, expected).exitCode).toBe(2);
  evidence.runs = evidence.runs.filter((run) => run.node !== node);
  expect(validateReleaseEvidence(evidence, expected).exitCode).toBe(2);
});

test('requires complete execution evidence in the current Node 26 cell', () => {
  const { evidence, expected } = fixture(['22.13.0', '24.0.0', '26.11.0']);
  evidence.runs = evidence.runs.filter((run) => run.node !== '26.11.0');
  const report = validateReleaseEvidence(evidence, expected);
  expect(report.exitCode).toBe(2);
  expect(report.incomplete).toContain('Missing local candidate cell: Node 26.11.0/current.');
});

test('reviewed capability phases grant no fixture setup case credit', async () => {
  const root = resolve(import.meta.dirname, '..');
  const actual = await expectedReleaseInventory(root);
  const plan = JSON.parse(readFileSync(resolve(root, 'api-coverage/release-matrix.json'), 'utf8'));
  const urlPhases = [
    ['api.url-check-owned-fixtures', 'api'],
    ['mock-pdp.url-check-contract', 'mock-pdp'],
    ['mock-pdp.url-check-inputs', 'mock-pdp'],
    ['mock-pdp.url-check-errors', 'mock-pdp'],
    ['commonjs.mock-pdp.url-check-contract', 'mock-pdp'],
    ['commonjs.mock-pdp.url-check-inputs', 'mock-pdp'],
    ['commonjs.mock-pdp.url-check-errors', 'mock-pdp'],
    ['pdp.url-check-mapped-allow-and-deny', 'pdp'],
    ['pdp.url-check-mapping-removal', 'pdp'],
  ];
  expect(
    plan.cases
      .filter((entry) => entry.methodNames.includes('permit.checkUrl'))
      .map((entry) => entry.id)
      .sort(),
  ).toEqual(
    [
      'wire.checkUrl.esm',
      'wire.checkUrl.commonjs',
      ...urlPhases.filter(([, kind]) => kind !== 'api').map(([id]) => id),
    ].sort(),
  );
  const localRolePhases = [
    ['wire.local-role-assignments-contract', 'wire'],
    ['mock-pdp.local-role-assignments-invalid', 'mock-pdp'],
    ['mock-pdp.local-role-assignments-errors', 'mock-pdp'],
    ['commonjs.wire.local-role-assignments-contract', 'wire'],
    ['commonjs.mock-pdp.local-role-assignments-invalid', 'mock-pdp'],
    ['commonjs.mock-pdp.local-role-assignments-errors', 'mock-pdp'],
    ['api.local-role-assignments-owned-fixtures', 'api'],
    ['pdp.local-role-assignments-filters-pagination', 'pdp'],
    ['pdp.local-role-assignments-removal', 'pdp'],
  ];
  expect(
    plan.cases
      .filter((entry) => entry.methodNames.includes('permit.getLocalRoleAssignments'))
      .map((entry) => entry.id)
      .sort(),
  ).toEqual(
    [
      'wire.permit.getLocalRoleAssignments.esm',
      'wire.permit.getLocalRoleAssignments.commonjs',
      ...localRolePhases
        .filter(([, kind]) => kind === 'mock-pdp' || kind === 'pdp')
        .map(([id]) => id),
    ].sort(),
  );
  const proxyPhases = [
    ['wire.proxy-configs.esm', 'wire'],
    ['wire.proxy-configs.commonjs', 'wire'],
    ['api.proxy-configs-owned-fixtures', 'api'],
    ['api.proxy-configs-lifecycle', 'api'],
  ];
  const apiKeyPhases = [
    ['wire.api-keys.esm', 'wire'],
    ['wire.api-keys.commonjs', 'wire'],
    ['api.api-keys-lifecycle', 'api'],
  ];
  const auditPhases = [
    ['wire.audit-logs.esm', 'wire'],
    ['wire.audit-logs.commonjs', 'wire'],
    ['api.audit-logs-owned-fixtures', 'api'],
    ['pdp.audit-logs-decisions', 'pdp'],
    ['api.audit-logs-ingestion-list', 'api'],
    ['api.audit-logs-ingestion-detail', 'api'],
  ];
  const asyncPhases = [
    ['wire.async-copy.esm', 'wire'],
    ['wire.async-copy.commonjs', 'wire'],
    ['api.async-copy-owned-fixtures', 'api'],
    ['api.async-copy.new-target', 'api'],
    ['api.async-copy.existing-target', 'api'],
  ];
  const capabilityPhases = [
    ...urlPhases,
    ...localRolePhases,
    ...proxyPhases,
    ...apiKeyPhases,
    ...auditPhases,
    ...asyncPhases,
  ];
  const phaseForWireCase = {
    'wire.api.environments.copyAsync.esm': 'wire.async-copy.esm',
    'wire.api.environments.copyAsync.commonjs': 'wire.async-copy.commonjs',
    'wire.api.environments.getCopyResult.esm': 'wire.async-copy.esm',
    'wire.api.environments.getCopyResult.commonjs': 'wire.async-copy.commonjs',
    'wire.checkUrl.esm': 'release.wire.enforcement.esm',
    'wire.checkUrl.commonjs': 'release.wire.enforcement.commonjs',
    'wire.permit.getLocalRoleAssignments.esm': 'wire.local-role-assignments-contract',
    'wire.permit.getLocalRoleAssignments.commonjs': 'commonjs.wire.local-role-assignments-contract',
  };
  const phaseForLevel = {
    package: 'release.package.clone-helpers',
    wire: 'release.wire.observed.esm',
    'mock-pdp': 'mock-pdp.decisions-and-context',
    api: 'api.core-roundtrip',
    pdp: 'pdp.rbac-grant-and-tenant-boundary',
  };
  const { evidence, expected } = fixture();
  expected.inventory = actual.inventory;
  expected.methodLevels = actual.methodLevels;
  expected.requirements = plan;
  expected.acceptance = readNodeAcceptance(root).acceptance;
  evidence.sdk.acceptanceSha256 = digest(expected.acceptance);
  evidence.inventory = structuredClone(actual.inventory);
  for (const row of evidence.inventory.methods)
    row.caseIds = plan.cases
      .filter((entry) => entry.methodNames.includes(row.name))
      .map((entry) => entry.id);
  for (const row of evidence.inventory.operations)
    row.caseIds = plan.cases
      .filter((entry) => entry.operationKeys.includes(`${row.source} ${row.method} ${row.path}`))
      .map((entry) => entry.id);
  evidence.sdk.inventorySha256 = actual.inventorySha256;
  evidence.ab.intentionalDifferences = plan.intentionalDifferences;
  evidence.runs = plan.nodes.flatMap((node) =>
    ['baseline', 'candidate'].map((role) => {
      const caseResults = plan.cases
        .filter(
          (entry) =>
            !plan.cloud.caseIds.includes(entry.id) &&
            (role === 'candidate' || plan.abCaseIds.includes(entry.id)),
        )
        .map((entry) => ({
          ...entry,
          phaseId: capabilityPhases.some(([id]) => id === entry.id)
            ? entry.id
            : entry.id.startsWith('wire.api.auditLogs.')
              ? `wire.audit-logs.${entry.id.endsWith('.commonjs') ? 'commonjs' : 'esm'}`
              : entry.id.startsWith('api.audit-logs-')
                ? entry.id
                : entry.id.startsWith('wire.api.apiKeys.')
                  ? `wire.api-keys.${entry.id.endsWith('.commonjs') ? 'commonjs' : 'esm'}`
                  : entry.id.startsWith('api.api-keys.')
                    ? 'api.api-keys-lifecycle'
                    : entry.id.startsWith('wire.api.proxyConfigs.')
                      ? `wire.proxy-configs.${entry.id.endsWith('.commonjs') ? 'commonjs' : 'esm'}`
                      : entry.id.startsWith('api.proxy-configs.')
                        ? 'api.proxy-configs-lifecycle'
                        : (phaseForWireCase[entry.id] ?? phaseForLevel[entry.level]),
          status: 'PASSED',
          assertions: 1,
        }));
      const phaseIds =
        role === 'candidate'
          ? [...new Set([...plan.phaseIds, ...capabilityPhases.map(([id]) => id)])]
          : [...new Set(caseResults.map((entry) => entry.phaseId))];
      return {
        ...fixture().evidence.runs[0],
        id: `${role}.local.node${node}`,
        node,
        artifactSha256: role === 'candidate' ? candidateHash : baselineHash,
        consumerLockSha256:
          role === 'candidate' ? evidence.artifact.lockSha256 : evidence.ab.baseline.lockSha256,
        pdp: {
          kind: 'container',
          digest: plan.pdps[0].digest,
          resolvedAt: plan.pdps[0].resolvedAt,
          roles: ['pinned', 'current'],
        },
        phaseResults: phaseIds.map((id) => ({
          id,
          kind:
            capabilityPhases.find(([name]) => name === id)?.[1] ??
            caseResults.find((entry) => entry.phaseId === id)?.level ??
            'package',
          status: 'PASSED',
          assertions: Math.max(1, caseResults.filter((entry) => entry.phaseId === id).length),
        })),
        caseResults,
      };
    }),
  );
  evidence.runs.push(...fixture().evidence.runs.filter((run) => run.target === 'hosted-ci'));
  evidence.ab.cases = plan.nodes.flatMap((node) =>
    plan.abCaseIds.map((id) => ({
      id,
      baselineRunId: `baseline.local.node${node}`,
      candidateRunId: `candidate.local.node${node}`,
      status: 'PASSED',
      assertions: 1,
    })),
  );
  const report = validateReleaseEvidence(evidence, expected);
  expect(report.exitCode).toBe(2);
  expect(
    report.incomplete.filter((message) => message.startsWith('No reviewed case for ')),
  ).toHaveLength(0);
  expect(report.incomplete).toEqual(
    expect.arrayContaining([
      'Unverified acceptance dependency user-attribute-backend-rollout (PER-16954).',
    ]),
  );
  expect(report.failures).toEqual([]);
  expect(report.releaseReady).toBe(false);
  expect(plan.cases.some((entry) => entry.id === 'api.url-check-owned-fixtures')).toBe(false);
  expect(plan.cases.some((entry) => entry.id === 'api.local-role-assignments-owned-fixtures')).toBe(
    false,
  );
  expect(plan.cases.some((entry) => entry.id === 'api.proxy-configs-owned-fixtures')).toBe(false);
  expect(plan.cases.some((entry) => entry.id === 'api.audit-logs-owned-fixtures')).toBe(false);
  expect(plan.cases.some((entry) => entry.id === 'pdp.audit-logs-decisions')).toBe(false);
  expect(plan.cases.some((entry) => entry.id === 'api.inline-role-owned-fixtures')).toBe(false);
  expect(report.incomplete).not.toContain(
    'Unimplemented required feature create-user-inline-roles (PER-16573).',
  );
  expect(
    plan.cases
      .filter((row) => row.id.includes('inline-roles'))
      .map((row) => row.id)
      .sort(),
  ).toEqual(INLINE_ROLE_CASES.map((row) => row.id).sort());

  expect(plan.cases.some((entry) => entry.id === 'api.async-copy-owned-fixtures')).toBe(false);
  const fixtureOnly = structuredClone(evidence);
  for (const run of fixtureOnly.runs) {
    run.caseResults = run.caseResults.filter((entry) => !entry.id.startsWith('api.async-copy.'));
  }
  const fixtureReport = validateReleaseEvidence(fixtureOnly, expected);
  expect(fixtureReport.exitCode).toBe(2);
  expect(fixtureReport.incomplete).toContain(
    'Missing case api.async-copy.new-target: Node 22.13.0/pinned.',
  );

  for (const [id] of capabilityPhases) {
    const unregistered = structuredClone(expected);
    unregistered.requirements.phaseIds = plan.phaseIds.filter((name) => name !== id);
    expect(validateReleaseEvidence(evidence, unregistered).incomplete).toEqual([
      'Unreviewed phase ID.',
    ]);
    const unexecuted = structuredClone(evidence);
    for (const run of unexecuted.runs) {
      run.phaseResults = run.phaseResults.filter((phase) => phase.id !== id);
      run.caseResults = run.caseResults.filter((entry) => entry.phaseId !== id);
    }
    const missing = validateReleaseEvidence(unexecuted, expected);
    expect(missing.exitCode).toBe(2);
    expect(missing.incomplete).toContain(`Missing phase ${id}: Node 22.13.0/pinned.`);
  }
  const unknown = structuredClone(evidence);
  unknown.runs[0].phaseResults.push({
    id: 'api.unreviewed-url-phase',
    kind: 'api',
    status: 'PASSED',
    assertions: 1,
  });
  const rejected = validateReleaseEvidence(unknown, expected);
  expect(rejected.exitCode).toBe(2);
  expect(rejected.incomplete).toEqual(['Unreviewed phase ID.']);
  expect(JSON.stringify(rejected)).not.toContain('api.unreviewed-url-phase');
}, 20_000);

const cloudRun = (evidence) => evidence.runs.find((run) => run.target === 'hosted-ci');
test.each([
  [
    'legacy export',
    (v) => {
      v.schema = 1;
    },
    'evidence.schema: invalid value.',
  ],
  [
    'producer readiness Boolean',
    (v) => {
      v.releaseReady = true;
    },
    'evidence: missing or unrecognized fields.',
  ],
  [
    'changed acceptance hash',
    (v) => {
      v.sdk.acceptanceSha256 = '0'.repeat(64);
    },
    'Reviewed Node acceptance contract hash differs.',
  ],
  [
    'relabel local to cloud',
    (v) => {
      v.runs[1].target = 'hosted-ci';
    },
    'run.pdp: missing or unrecognized fields.',
  ],
  [
    'relabel cloud to local',
    (v) => {
      cloudRun(v).target = 'local';
    },
    'run.pdp: missing or unrecognized fields.',
  ],
  [
    'invented cloud container digest',
    (v) => {
      cloudRun(v).pdp.digest = pdpDigest;
    },
    'run.pdp: missing or unrecognized fields.',
  ],
  [
    'wrong cloud origin',
    (v) => {
      cloudRun(v).pdp.origin = 'https://foreign.invalid';
    },
    'run.pdp.origin: invalid value.',
  ],
  [
    'wrong public cloud contract',
    (v) => {
      cloudRun(v).pdp.contractSha256 = '0'.repeat(64);
    },
    'run.pdp.contractSha256: invalid value.',
  ],
  [
    'wrong CI source commit',
    (v) => {
      cloudRun(v).pdp.ci.commit = '0'.repeat(40);
    },
    'Cloud report differs from independently checked CI source.',
  ],
  [
    'wrong CI tree',
    (v) => {
      cloudRun(v).pdp.ci.tree = '0'.repeat(40);
    },
    'Cloud report differs from independently checked CI source.',
  ],
  [
    'wrong CI attempt',
    (v) => {
      cloudRun(v).pdp.ci.runAttempt = '2';
    },
    'Cloud report differs from independently checked CI source.',
  ],
  [
    'different cloud consumer lock',
    (v) => {
      cloudRun(v).consumerLockSha256 = '0'.repeat(64);
    },
    'Cloud consumer lock differs from supplied bytes.',
  ],
  [
    'stale cloud observation',
    (v) => {
      cloudRun(v).pdp.observedAt = '2026-10-06T12:00:00Z';
    },
    'Stale cloud observation.',
  ],
  [
    'future cloud observation',
    (v) => {
      cloudRun(v).pdp.observedAt = '2026-10-09T12:00:00Z';
    },
    'Stale cloud observation.',
  ],
  [
    'missing CJS observation',
    (v) => {
      cloudRun(v).httpObservations = cloudRun(v).httpObservations.filter(
        (row) => row.entry !== 'commonjs',
      );
    },
    'Cloud case lacks successful actual HTTP observations for both entry points.',
  ],
  [
    'wrong observed method',
    (v) => {
      cloudRun(v).httpObservations[0].method = 'GET';
    },
    'run.httpObservation.method: invalid value.',
  ],
  [
    'wrong observed path',
    (v) => {
      cloudRun(v).httpObservations[0].path = '/authorized_users';
    },
    'Cloud case lacks successful actual HTTP observations for both entry points.',
  ],
  [
    'wrong observed origin',
    (v) => {
      cloudRun(v).httpObservations[0].origin = 'http://127.0.0.1:1';
    },
    'run.httpObservation.origin: invalid value.',
  ],
  [
    'failed observed HTTP status',
    (v) => {
      cloudRun(v).httpObservations[0].status = 503;
    },
    'run.httpObservation.status: invalid value.',
  ],
  [
    'zero observed requests',
    (v) => {
      cloudRun(v).httpObservations[0].requests = 0;
    },
    'run.httpObservation.requests: invalid value.',
  ],
  [
    'duplicate cloud observation',
    (v) => {
      cloudRun(v).httpObservations.push(structuredClone(cloudRun(v).httpObservations[0]));
    },
    'run.httpObservations: duplicate entries.',
  ],
  [
    'missing cloud cell',
    (v) => {
      v.runs = v.runs.filter((run) => run.target !== 'hosted-ci' || run.node !== '26.11.0');
    },
    'Missing cloud phase cloud.check: Node 26.11.0.',
  ],
  [
    'cloud cleanup failure',
    (v) => {
      cloudRun(v).cleanupErrorCount = 1;
    },
    'Run candidate.cloud.node22.13.0: setup or cleanup is incomplete.',
  ],
  [
    'cloud phase count without cases',
    (v) => {
      cloudRun(v).caseResults = [];
    },
    'Cloud HTTP observation lacks an executed case.',
  ],
  [
    'wire-only cloud credit',
    (v) => {
      cloudRun(v).caseResults[0].level = 'wire';
      cloudRun(v).phaseResults[0].kind = 'wire';
    },
    'Case cloud.check: evidence level differs.',
  ],
  [
    'removed required cloud operation',
    (_v, e) => {
      e.requirements.cloud.caseIds.pop();
    },
    'Managed cloud matrix differs from the reviewed public contract.',
  ],
  [
    'removed cloud inventory decision',
    (v, e) => {
      v.inventory.operations.find((row) => row.source === 'pdp-cloud').decision = 'defer';
      e.inventory = structuredClone(v.inventory);
      v.sdk.inventorySha256 = digest(canonicalReleaseInventory(v.inventory));
    },
    'Required managed cloud operations cannot be removed or deferred.',
  ],
  [
    'absent trusted CI context',
    (_v, e) => {
      delete e.ci;
    },
    'Cloud report differs from independently checked CI source.',
  ],
  [
    'missing required CI job',
    (_v, e) => {
      delete e.gateResults['cloud-cleanup'];
    },
    'Required acceptance job did not succeed: cloud-cleanup.',
  ],
  [
    'absent CI gate results',
    (_v, e) => {
      e.gateResults = null;
    },
    'Required acceptance job did not succeed: candidate.',
  ],
  [
    'unknown required CI job',
    (_v, e) => {
      e.gateResults['invented-job'] = { result: 'success' };
    },
    'Missing or unexpected acceptance job results.',
  ],
  [
    'unavailable backend rollout',
    (v, e) => {
      e.acceptance.dependencies[0].status = 'UNAVAILABLE';
      v.sdk.acceptanceSha256 = digest(e.acceptance);
    },
    'Unverified acceptance dependency user-attribute-backend-rollout (PER-16954).',
  ],
  [
    'emptied async feature contract',
    (v, e) => {
      e.acceptance.features.find((row) => row.id === 'environment-async-copy').caseIds = [];
      v.sdk.acceptanceSha256 = digest(e.acceptance);
    },
    'Required Node feature routes or owners differ from the adopted contract.',
  ],
  [
    'unimplemented async feature',
    (v, e) => {
      const omitted = 'api.async-copy.existing-target';
      e.requirements.cases = e.requirements.cases.filter((row) => row.id !== omitted);
      for (const row of [...v.inventory.methods, ...v.inventory.operations])
        row.caseIds = row.caseIds.filter((id) => id !== omitted);
      for (const run of v.runs)
        run.caseResults = run.caseResults.filter((row) => row.id !== omitted);
    },
    'Unimplemented required feature environment-async-copy (PER-16951).',
  ],
  [
    'only wire feature proof',
    (v, e) => {
      const rows = e.requirements.cases.filter((row) => row.id.startsWith('api.async-copy.'));
      for (const row of rows) row.level = 'wire';
      for (const run of v.runs.filter((run) => run.target === 'local'))
        for (const item of run.caseResults)
          if (rows.some((row) => row.id === item.id)) item.level = 'wire';
    },
    'Required async-copy proof case differs.',
  ],
  [
    'missing readiness failures',
    (v) => {
      delete cloudRun(v).httpObservations[0].readinessFailures;
    },
    'run.httpObservation: missing or unrecognized fields.',
  ],
  [
    'negative readiness failures',
    (v) => {
      cloudRun(v).httpObservations[0].readinessFailures = -1;
    },
    'run.httpObservation.readinessFailures: invalid value.',
  ],
  [
    'readiness failures beyond the bounded attempts',
    (v) => {
      cloudRun(v).httpObservations[0].readinessFailures = 30;
    },
    'run.httpObservation.readinessFailures: invalid value.',
  ],
  [
    'readiness failures outside check readiness',
    (v) => {
      cloudRun(v).httpObservations[2].readinessFailures = 1;
    },
    'Cloud readiness failures are allowed only while the first check waits for readiness.',
  ],
])('Node readiness refuses %s', (_name, change, message) => {
  const report = result(change);
  expect(report).toMatchObject({
    exitCode: 2,
    nodeReleaseReady: false,
    releaseReady: false,
  });
  expect(report.incomplete).toContain(message);
});
test.each(['failure', 'cancelled', 'skipped', 'pending', 'neutral', 'timed_out'])(
  'required CI result %s cannot grant Node readiness',
  (status) => {
    const report = result((_v, e) => {
      e.gateResults['cloud-test'].result = status;
    });
    expect(report).toMatchObject({ exitCode: 2, nodeReleaseReady: false });
    expect(report.incomplete).toContain('Required acceptance job did not succeed: cloud-test.');
  },
);
test('complete local execution still cannot substitute for managed cloud runtime', () => {
  const report = result((v) => {
    v.runs = v.runs.filter((run) => run.target === 'local');
  });
  expect(report.nodeReleaseReady).toBe(false);
  expect(report.incomplete).toContain('Missing cloud case cloud.check: Node 26.11.0.');
});

test('cloud cases cannot reuse one passing phase for all operations', () => {
  const report = result((v) => {
    const run = cloudRun(v);
    run.phaseResults = run.phaseResults.slice(0, 1);
    run.phaseResults[0].assertions = 32;
    for (const row of run.caseResults) row.phaseId = run.phaseResults[0].id;
  });
  expect(report.exitCode).toBe(2);
  expect(report.nodeReleaseReady).toBe(false);
  expect(report.incomplete).toContain('Cloud case requires its own registered phase.');
});
test('every registered cloud phase must run for every required runtime', () => {
  const report = result((v) => {
    const run = cloudRun(v);
    run.phaseResults = [];
    run.caseResults = [];
    run.httpObservations = [];
  });
  expect(report.exitCode).toBe(2);
  expect(report.nodeReleaseReady).toBe(false);
});
test('ordinary user creation cannot replace persisted inline-role proof', () => {
  const report = result((v, e) => {
    e.acceptance.features[0].caseIds = [sharedCase.id];
    v.sdk.acceptanceSha256 = digest(e.acceptance);
  });
  expect(report.exitCode).toBe(2);
  expect(report.nodeReleaseReady).toBe(false);
});

test('one missing cloud phase remains visible with three valid nonempty phases', () => {
  const report = result((v) => {
    const run = cloudRun(v);
    const missing = 'cloud.bulkCheck';
    run.phaseResults = run.phaseResults.filter((row) => row.id !== missing);
    run.caseResults = run.caseResults.filter((row) => row.id !== missing);
    run.httpObservations = run.httpObservations.filter((row) => row.caseId !== missing);
  });
  expect(report.exitCode).toBe(2);
  expect(
    report.incomplete.some((message) => message.includes('Missing cloud phase cloud.bulkCheck')),
  ).toBe(true);
  expect(report.nodeReleaseReady).toBe(false);
});

test('tolerated check readiness failures keep complete cloud evidence', () => {
  expect(
    result((v) => {
      cloudRun(v).httpObservations[0].readinessFailures = 2;
      cloudRun(v).httpObservations[1].readinessFailures = 29;
    }),
  ).toEqual(result());
});

test('actual absent required cloud header blocks readiness despite HTTP and oracles', () => {
  const report = result((v) => {
    cloudRun(v).httpObservations[0].requestIdPresent = false;
  });
  expect(report.nodeReleaseReady).toBe(false);
  expect(
    report.incomplete.some((message) => message.includes('omitted required X-Request-ID')),
  ).toBe(true);
});

test('inherited current resolution blocks readiness despite complete shared cells', () => {
  const { evidence, expected } = fixture();
  expected.requirements.pdps = expected.requirements.pdps.map((row) => ({
    ...row,
    resolvedAt: row.role === 'pinned' ? '2026-09-30' : '2026-10-08',
  }));
  for (const run of evidence.runs.filter((row) => row.target !== 'hosted-ci')) {
    run.pdp.roles = ['current'];
    run.pdp.resolvedAt = '2026-10-08';
  }
  const stale = structuredClone(expected);
  stale.requirements.pdps.find((row) => row.role === 'current').resolvedAt = '2026-09-30';
  const inherited = structuredClone(evidence);
  for (const run of inherited.runs.filter((row) => row.target !== 'hosted-ci')) {
    run.pdp.roles = ['pinned', 'current'];
    run.pdp.resolvedAt = '2026-09-30';
  }
  const report = validateReleaseEvidence(inherited, stale);
  expect(report.nodeReleaseReady).toBe(false);
  expect(report.incomplete.join(' ')).toContain('Current PDP image resolution is stale');
});

test.each([86_400_000, -60_001])('current-image freshness boundary %s refuses readiness', (age) => {
  const { evidence, expected } = fixture();
  expected.now = Date.parse(expected.requirements.pdps[1].resolvedAt) + age;
  // Keep independent cloud observation current so this negative isolates image freshness.
  for (const run of evidence.runs.filter((row) => row.target === 'hosted-ci'))
    run.pdp.observedAt = new Date(expected.now).toISOString();
  expect(validateReleaseEvidence(evidence, expected).incomplete.join(' ')).toContain(
    'Current PDP image resolution is stale',
  );
});

test('separate historical pinned and fresh current cells satisfy readiness', () => {
  const { evidence, expected } = fixture();
  expected.requirements.pdps.find((row) => row.role === 'pinned').resolvedAt = '2026-09-30';
  const historical = evidence.runs
    .filter((row) => row.target === 'local')
    .map((run) => ({
      ...structuredClone(run),
      id: run.id + '-historical',
      pdp: { ...run.pdp, roles: ['pinned'], resolvedAt: '2026-09-30' },
    }));
  for (const run of evidence.runs.filter((row) => row.target === 'local'))
    run.pdp.roles = ['current'];
  expected.requirements.runIds.push(...historical.map((run) => run.id));
  evidence.runs.push(...historical);
  evidence.ab.cases.push(
    ...evidence.ab.cases.map((row) => ({
      ...row,
      baselineRunId: row.baselineRunId + '-historical',
      candidateRunId: row.candidateRunId + '-historical',
    })),
  );
  const report = validateReleaseEvidence(evidence, expected);
  expect(report.incomplete).toEqual([]);
  expect(report.nodeReleaseReady).toBe(true);
});

test('one shared runtime record cannot claim two different reviewed resolution dates', () => {
  const { evidence, expected } = fixture();
  expected.requirements.pdps.find((row) => row.role === 'pinned').resolvedAt = '2026-09-30';
  const report = validateReleaseEvidence(evidence, expected);
  expect(report.incomplete.join(' ')).toContain('Unreviewed PDP');
  expect(report.nodeReleaseReady).toBe(false);
});
