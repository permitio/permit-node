import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

import { digest } from '#scripts/api-contracts.mjs';
import {
  canonicalReleaseInventory,
  expectedReleaseInventory,
  validateReleaseEvidence,
} from '#scripts/release-evidence.mjs';

const candidateHash = 'a'.repeat(64);
const baselineHash = 'b'.repeat(64);
const pdpDigest = `sha256:${'c'.repeat(64)}`;
const sharedCase = {
  id: 'ab.users.edge-values',
  level: 'api',
  methodNames: ['permit.api.users.create'],
  operationKeys: ['control-plane POST /v2/facts/{proj_id}/{env_id}/users'],
};

function fixture(nodes = ['22.13.0', '24.0.0']) {
  const inventory = {
    methods: [{ name: 'permit.api.users.create', caseIds: [sharedCase.id] }],
    operations: [
      {
        source: 'control-plane',
        method: 'POST',
        path: '/v2/facts/{proj_id}/{env_id}/users',
        decision: 'retain',
        caseIds: [sharedCase.id],
      },
      {
        source: 'pdp-container',
        method: 'GET',
        path: '/deferred',
        decision: 'defer',
        caseIds: [],
      },
    ],
  };
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
    integrity: `sha512-${'A'.repeat(86)}==`,
  };
  const requirements = {
    nodes,
    runIds: nodes.flatMap((node) => [`baseline-${node}`, `candidate-${node}`]),
    phaseIds: ['api.users'],
    pdps: ['pinned', 'current'].map((role) => ({
      role,
      digest: pdpDigest,
      resolvedAt: '2026-09-30',
    })),
    cases: [sharedCase],
    abCaseIds: [sharedCase.id],
    intentionalDifferences: [{ id: 'migration.flat-facade', changeId: 'A1' }],
  };
  const expected = {
    artifact,
    baseline,
    inventory,
    requirements,
    tree: 'f'.repeat(40),
    methodLevels: { 'permit.api.users.create': 'wire' },
  };
  const runs = requirements.nodes.flatMap((node) =>
    ['baseline', 'candidate'].map((role) => ({
      id: `${role}-${node}`,
      artifactSha256: role === 'baseline' ? baselineHash : candidateHash,
      nativeReportSha256: '1'.repeat(64),
      node,
      target: 'local',
      pdp: { digest: pdpDigest, roles: ['pinned', 'current'], resolvedAt: '2026-09-30' },
      phaseResults: [{ id: 'api.users', kind: 'api', status: 'PASSED', assertions: 8 }],
      caseResults: [{ ...sharedCase, phaseId: 'api.users', status: 'PASSED', assertions: 8 }],
      cleanup: { registered: 1, completed: 1, verified: 1 },
      setupErrorCount: 0,
      cleanupErrorCount: 0,
    })),
  );
  const evidence = {
    schema: 1,
    artifact,
    sdk: {
      tree: expected.tree,
      inventorySha256: digest(canonicalReleaseInventory(inventory)),
    },
    inventory,
    runs,
    ab: {
      baseline,
      candidateSha256: candidateHash,
      cases: requirements.nodes.map((node) => ({
        id: sharedCase.id,
        baselineRunId: `baseline-${node}`,
        candidateRunId: `candidate-${node}`,
        status: 'PASSED',
        assertions: 1,
      })),
      intentionalDifferences: requirements.intentionalDifferences,
    },
    gates: { sharedTarget: { status: 'UNAVAILABLE', owner: 'PER-16345' } },
  };
  return { evidence: structuredClone(evidence), expected: structuredClone(expected) };
}

function result(change) {
  const { evidence, expected } = fixture();
  change?.(evidence, expected);
  return validateReleaseEvidence(evidence, expected);
}

test('accepts only the reviewed local scope and keeps release readiness blocked', () => {
  expect(result()).toEqual({
    schema: 1,
    localEvidence: 'PASS',
    exitCode: 0,
    releaseReady: false,
    sharedTarget: { status: 'UNAVAILABLE', owner: 'PER-16345' },
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
  ],
  [
    'wrong file count',
    (v) => {
      v.artifact.fileCount++;
    },
  ],
  [
    'wrong consumer lock',
    (v) => {
      v.artifact.lockSha256 = baselineHash;
    },
  ],
  [
    'wrong source tree',
    (v) => {
      v.sdk.tree = '0'.repeat(40);
    },
  ],
  [
    'wrong inventory hash',
    (v) => {
      v.sdk.inventorySha256 = baselineHash;
    },
  ],
  [
    'same-version development baseline',
    (v) => {
      v.ab.baseline.sha256 = candidateHash;
    },
  ],
  [
    'wrong baseline integrity',
    (v) => {
      v.ab.baseline.integrity = `sha512-${'B'.repeat(86)}==`;
    },
  ],
  [
    'baseline used for candidate cell',
    (v) => {
      v.runs[1].artifactSha256 = baselineHash;
    },
  ],
  [
    'unknown artifact',
    (v) => {
      v.runs[1].artifactSha256 = '2'.repeat(64);
    },
  ],
  [
    'removed inventory method',
    (v) => {
      v.inventory.methods.pop();
    },
  ],
  [
    'removed deferred operation',
    (v) => {
      v.inventory.operations.pop();
    },
  ],
  [
    'changed source decision',
    (v) => {
      v.inventory.operations[0].decision = 'defer';
    },
  ],
  [
    'unreviewed case',
    (v) => {
      v.runs[1].caseResults[0].id = 'invented.case';
    },
  ],
  [
    'invented route credit',
    (v) => {
      v.runs[1].caseResults[0].operationKeys = [];
    },
  ],
  [
    'invented method credit',
    (v) => {
      v.runs[1].caseResults[0].methodNames = [];
    },
  ],
  [
    'weaker evidence level',
    (v) => {
      v.runs[1].caseResults[0].level = 'wire';
    },
  ],
  [
    'missing phase link',
    (v) => {
      v.runs[1].caseResults[0].phaseId = 'missing.phase';
    },
  ],
  [
    'missing case links',
    (v) => {
      v.inventory.methods[0].caseIds = [];
    },
  ],
  [
    'invented adoption',
    (v) => {
      v.gates.sharedTarget.status = 'ADOPTED';
    },
  ],
])('returns INVALID for %s', (_name, change) => {
  expect(result(change)).toMatchObject({ exitCode: 2, releaseReady: false });
});

test.each([
  [
    'missing floor',
    (v) => {
      v.runs.splice(2);
      v.ab.cases.splice(1);
    },
  ],
  [
    'missing current PDP',
    (v) => {
      v.runs.forEach((run) => {
        run.pdp.roles = ['pinned'];
      });
    },
  ],
  [
    'unreviewed current patch',
    (v) => {
      v.runs[0].node = '24.1.0';
    },
  ],
  [
    'wrong PDP bytes',
    (v) => {
      v.runs[0].pdp.digest = `sha256:${baselineHash}`;
    },
  ],
  [
    'undated current image',
    (v) => {
      v.runs[0].pdp.resolvedAt = '';
    },
  ],
  [
    'invalid date',
    (v) => {
      v.runs[0].pdp.resolvedAt = '2026-02-30';
    },
  ],
  [
    'offline service evidence',
    (v) => {
      v.runs[0].target = 'offline';
    },
  ],
  [
    'missing execution',
    (v) => {
      v.runs[0].caseResults = [];
    },
  ],
  [
    'phase counts alone',
    (v) => {
      v.runs.forEach((run) => {
        run.caseResults = [];
      });
    },
  ],
  [
    'zero-assertion case',
    (v) => {
      v.runs[0].caseResults[0].assertions = 0;
    },
  ],
  [
    'zero-assertion phase',
    (v) => {
      v.runs[0].phaseResults[0].assertions = 0;
    },
  ],
  [
    'zero-assertion comparison',
    (v) => {
      v.ab.cases[0].assertions = 0;
    },
  ],
  [
    'missing A/B',
    (v) => {
      v.ab.cases = [];
    },
  ],
  [
    'A/B runtime mismatch',
    (v) => {
      v.ab.cases[0].baselineRunId = 'baseline-24.0.0';
    },
  ],
  [
    'setup error',
    (v) => {
      v.runs[0].setupErrorCount++;
    },
  ],
  [
    'cleanup error',
    (v) => {
      v.runs[0].cleanupErrorCount++;
    },
  ],
  [
    'unverified cleanup',
    (v) => {
      v.runs[0].cleanup.verified--;
    },
  ],
  [
    'unexecuted cleanup',
    (v) => {
      v.runs[0].cleanup.completed--;
    },
  ],
  [
    'unreachable backend',
    (v) => {
      v.runs[0].phaseResults[0].status = 'INVALID';
    },
  ],
  [
    'not run',
    (v) => {
      v.runs[0].caseResults[0].status = 'NOT_RUN';
    },
  ],
  [
    'duplicate run',
    (v) => {
      v.runs.push(structuredClone(v.runs[0]));
    },
  ],
  [
    'duplicate case',
    (v) => {
      v.runs[0].caseResults.push(structuredClone(v.runs[0].caseResults[0]));
    },
  ],
  [
    'negative assertions',
    (v) => {
      v.runs[0].caseResults[0].assertions = -1;
    },
  ],
  [
    'fractional assertions',
    (v) => {
      v.runs[0].caseResults[0].assertions = 1.2;
    },
  ],
  [
    'unsafe integer',
    (v) => {
      v.runs[0].cleanup.registered = Number.MAX_SAFE_INTEGER + 1;
    },
  ],
])('cannot pass with %s', (_name, change) => {
  expect(result(change)).toMatchObject({ exitCode: 2, releaseReady: false });
});

test('retains actual failures and gives incomplete cleanup precedence', () => {
  const { evidence, expected } = fixture();
  evidence.runs[1].phaseResults[0].status = 'FAILED';
  evidence.runs[1].caseResults[0].status = 'FAILED';
  evidence.ab.cases[0].status = 'FAILED';
  expect(validateReleaseEvidence(evidence, expected)).toMatchObject({
    exitCode: 1,
    localEvidence: 'FAIL',
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
    for (const row of v.inventory.methods) row.caseIds.push(extra.id);
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
    expected.requirements.cases[0].level = 'package';
    for (const run of v.runs) {
      run.caseResults[0].level = 'package';
      run.phaseResults[0].kind = 'package';
    }
  });
  expect(report.exitCode).toBe(2);
  expect(report.incomplete).toContain('No reviewed case for permit.api.users.create.');
});

test.each(['empty phases', 'empty runs', 'missing floor', 'unmapped AB'])(
  'does not accept an accidentally reduced reviewed policy: %s',
  (change) => {
    const report = result((_v, expected) => {
      if (change === 'empty phases') expected.requirements.phaseIds = [];
      else if (change === 'empty runs') expected.requirements.runIds = [];
      else if (change === 'missing floor') expected.requirements.nodes = ['22.13.0'];
      else expected.requirements.abCaseIds = ['missing.case'];
    });
    expect(report.exitCode).toBe(2);
  },
);

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

test('the real matrix accepts reviewed capability phases without granting fixture setup case credit', async () => {
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
        .filter((entry) => role === 'candidate' || plan.abCaseIds.includes(entry.id))
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
        pdp: {
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
  expect(report.incomplete).toHaveLength(4);
  expect(report.incomplete.every((message) => message.startsWith('No reviewed case for '))).toBe(
    true,
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
