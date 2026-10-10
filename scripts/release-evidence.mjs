import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import { gte, valid } from 'semver';

import { compareStrings, digest, extractSdk } from '#scripts/api-contracts.mjs';
import { inspectContracts } from '#scripts/check-api-contracts.mjs';
import {
  CLOUD_CASES,
  INLINE_ROLE_CASES,
  ASYNC_COPY_CASES,
  CLOUD_ORIGIN,
  CLOUD_CONTRACT_SHA256,
  NODE_DEFERRALS,
  validateNodeAcceptance,
} from '#scripts/node-acceptance.mjs';

const statuses = ['PASSED', 'FAILED', 'INVALID', 'NOT_RUN'];
const levels = ['package', 'wire', 'mock-pdp', 'api', 'pdp'];
const sha256 = /^[a-f0-9]{64}$/;
const stableId = /^[a-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*$/;
const supportedNodeVersion = (value) =>
  typeof value === 'string' &&
  /^\d+\.\d+\.\d+$/u.test(value) &&
  valid(value) !== null &&
  gte(value, '22.13.0');
const changeId = /^[A-Z][1-9]\d*$/;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const positive = (value) => integer(value) && value > 0;
const hash = (value) => typeof value === 'string' && sha256.test(value);
const label = (value) => typeof value === 'string' && stableId.test(value);
const oneOf = (values) => (value) => values.includes(value);
const text = (value) => typeof value === 'string' && value.length > 0;

function requireValid(condition, message) {
  if (!condition) throw new Error(message);
}

function record(value, fields, context) {
  requireValid(object(value), `${context}: expected an object.`);
  requireValid(
    isDeepStrictEqual(Object.keys(value).sort(), Object.keys(fields).sort()),
    `${context}: missing or unrecognized fields.`,
  );
  for (const [key, predicate] of Object.entries(fields))
    requireValid(predicate(value[key]), `${context}.${key}: invalid value.`);
}

function unique(values, key, context) {
  requireValid(Array.isArray(values), `${context}: expected an array.`);
  const keys = values.map(key);
  requireValid(new Set(keys).size === keys.length, `${context}: duplicate entries.`);
  return values;
}

function strings(value, predicate) {
  return Array.isArray(value) && value.every(predicate) && new Set(value).size === value.length;
}

const ids = (value) => strings(value, label);
const names = (value) => strings(value, (name) => /^permit(?:\.[A-Za-z][A-Za-z0-9]*)+$/.test(name));
const array = Array.isArray;
export const operationKey = (row) => `${row.source} ${row.method} ${row.path}`;

/** Removes case links and orders the complete inventory for the shared SHA-256 contract. */
export function canonicalReleaseInventory(inventory) {
  return {
    methods: inventory.methods.map((row) => row.name).sort(compareStrings),
    operations: inventory.operations
      .map(({ source, method, path, decision }) => ({ source, method, path, decision }))
      .sort((a, b) => compareStrings(operationKey(a), operationKey(b))),
  };
}

/** Extracts current public methods and reviewed source decisions; throws on contract drift. */
export async function expectedReleaseInventory(root) {
  const report = await inspectContracts({ root });
  requireValid(
    report.integrity === 'PASS',
    'API contract inventory must pass before release evidence.',
  );
  const sdk = extractSdk(root);
  const inventory = {
    methods: [...sdk.methods, ...sdk.helpers].map(({ name }) => ({ name, caseIds: [] })),
    operations: report.operations.map(({ source, method, path, decision }) => ({
      source,
      method,
      path,
      decision: decision.action,
      caseIds: [],
    })),
  };
  return {
    inventory,
    inventorySha256: digest(canonicalReleaseInventory(inventory)),
    methodLevels: Object.fromEntries([
      ...sdk.methods.map(({ name }) => [name, 'wire']),
      ...sdk.helpers.map(({ name }) => [name, 'package']),
    ]),
  };
}

function validateSchema(evidence) {
  record(
    evidence,
    {
      schema: (v) => v === 2,
      artifact: object,
      sdk: object,
      inventory: object,
      runs: array,
      ab: object,
      gates: object,
    },
    'evidence',
  );
  record(
    evidence.artifact,
    {
      name: (v) => v === 'permitio',
      version: text,
      sha256: hash,
      fileCount: positive,
      lockSha256: hash,
    },
    'artifact',
  );
  record(
    evidence.sdk,
    {
      tree: (v) => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v),
      inventorySha256: hash,
      acceptanceSha256: hash,
    },
    'sdk',
  );
  record(evidence.inventory, { methods: array, operations: array }, 'inventory');
  for (const row of unique(evidence.inventory.methods, (v) => v?.name, 'inventory.methods'))
    record(row, { name: (v) => names([v]), caseIds: ids }, 'inventory.method');
  for (const row of unique(evidence.inventory.operations, operationKey, 'inventory.operations'))
    record(
      row,
      {
        source: oneOf(['control-plane', 'pdp-container', 'pdp-cloud']),
        method: oneOf(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']),
        path: (v) => typeof v === 'string' && v.startsWith('/') && !/[\s?#]/.test(v),
        decision: oneOf(['add', 'retain', 'defer', 'exclude', 'undecided']),
        caseIds: ids,
      },
      'inventory.operation',
    );
  for (const run of unique(evidence.runs, (v) => v?.id, 'runs')) {
    record(
      run,
      {
        id: label,
        artifactSha256: hash,
        nativeReportSha256: hash,
        node: supportedNodeVersion,
        target: oneOf(['offline', 'local', 'hosted-ci']),
        consumerLockSha256: hash,
        httpObservations: array,
        pdp: object,
        phaseResults: array,
        caseResults: array,
        cleanup: object,
        setupErrorCount: integer,
        cleanupErrorCount: integer,
      },
      'run',
    );
    if (run.target === 'hosted-ci') {
      record(
        run.pdp,
        {
          kind: (v) => v === 'managed-cloud',
          origin: (v) => v === CLOUD_ORIGIN,
          contractSha256: (v) => v === CLOUD_CONTRACT_SHA256,
          observedAt: (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)),
          ci: object,
        },
        'run.pdp',
      );
      record(
        run.pdp.ci,
        {
          repository: (v) => v === 'permitio/permit-node',
          workflowRef: text,
          runId: (v) => typeof v === 'string' && /^[1-9]\d*$/.test(v),
          runAttempt: (v) => typeof v === 'string' && /^[1-9]\d*$/.test(v),
          commit: (v) => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v),
          tree: (v) => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v),
        },
        'run.pdp.ci',
      );
    } else {
      record(
        run.pdp,
        {
          kind: (v) => v === 'container',
          digest: (v) => typeof v === 'string' && /^sha256:[a-f0-9]{64}$/.test(v),
          roles: (v) => strings(v, oneOf(['pinned', 'current'])) && v.length > 0,
          resolvedAt: (v) =>
            typeof v === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(v) &&
            new Date(v).toISOString().slice(0, 10) === v,
        },
        'run.pdp',
      );
    }
    for (const observation of unique(
      run.httpObservations,
      (v) => v?.caseId + '/' + v?.entry,
      'run.httpObservations',
    )) {
      record(
        observation,
        {
          caseId: label,
          entry: oneOf(['esm', 'commonjs']),
          method: (v) => v === 'POST',
          path: oneOf(CLOUD_CASES.map((v) => v.operationKeys[0].slice('pdp-cloud POST '.length))),
          origin: (v) => v === CLOUD_ORIGIN,
          status: (v) => v === 200,
          requests: positive,
          requestIdPresent: (v) => typeof v === 'boolean',
          readinessFailures: (v) => Number.isSafeInteger(v) && v >= 0 && v < 30,
        },
        'run.httpObservation',
      );
      requireValid(
        observation.readinessFailures === 0 || observation.caseId === 'cloud.check',
        'Cloud readiness failures are allowed only while the first check waits for readiness.',
      );
    }
    record(
      run.cleanup,
      { registered: integer, completed: integer, verified: integer },
      'run.cleanup',
    );
    for (const phase of unique(run.phaseResults, (v) => v?.id, 'run.phaseResults'))
      record(
        phase,
        { id: label, kind: oneOf(levels), status: oneOf(statuses), assertions: integer },
        'phase',
      );
    for (const entry of unique(run.caseResults, (v) => v?.id, 'run.caseResults'))
      record(
        entry,
        {
          id: label,
          phaseId: label,
          methodNames: names,
          operationKeys: (v) => strings(v, text),
          level: oneOf(levels),
          status: oneOf(statuses),
          assertions: integer,
        },
        'case',
      );
  }
  record(
    evidence.ab,
    {
      baseline: object,
      candidateSha256: hash,
      cases: array,
      intentionalDifferences: array,
    },
    'ab',
  );
  record(
    evidence.ab.baseline,
    {
      version: text,
      sha256: hash,
      fileCount: positive,
      lockSha256: hash,
      kind: (v) => v === 'released-npm',
      integrity: (v) => typeof v === 'string' && /^sha512-[A-Za-z0-9+/]{86}==$/.test(v),
    },
    'ab.baseline',
  );
  for (const entry of unique(
    evidence.ab.cases,
    (v) => `${v?.id}/${v?.baselineRunId}/${v?.candidateRunId}`,
    'ab.cases',
  ))
    record(
      entry,
      {
        id: label,
        baselineRunId: label,
        candidateRunId: label,
        status: oneOf(statuses),
        assertions: integer,
      },
      'ab.case',
    );
  for (const entry of unique(
    evidence.ab.intentionalDifferences,
    (v) => v?.id,
    'ab.intentionalDifferences',
  ))
    record(
      entry,
      { id: label, changeId: (v) => typeof v === 'string' && changeId.test(v) },
      'ab.difference',
    );
  record(
    evidence.gates,
    { sharedTarget: object, curtainCall: object, bulkCounts: object },
    'gates',
  );
  equal(evidence.gates, NODE_DEFERRALS, 'Node deferrals differ from the adopted contract.');
  record(
    evidence.gates.sharedTarget,
    {
      status: (v) => v === 'UNAVAILABLE',
      owner: (v) => v === 'PER-16345',
    },
    'gates.sharedTarget',
  );
}

function equal(actual, expected, message) {
  requireValid(isDeepStrictEqual(actual, expected), message);
}

function validateRequirements(expected) {
  const plan = expected.requirements;
  validateNodeAcceptance(expected.acceptance);
  equal(
    plan.cloud,
    {
      origin: CLOUD_ORIGIN,
      contractSha256: CLOUD_CONTRACT_SHA256,
      caseIds: CLOUD_CASES.map((v) => v.id),
      phaseIds: CLOUD_CASES.map((v) => v.id),
      runIds: plan.nodes.map((node) => 'candidate.cloud.node' + node),
    },
    'Managed cloud matrix differs from the reviewed public contract.',
  );
  for (const row of INLINE_ROLE_CASES) {
    const actual = plan.cases.find((value) => value.id === row.id);
    if (actual !== undefined) equal(actual, row, 'Required inline-role proof case differs.');
  }
  for (const row of ASYNC_COPY_CASES) {
    const actual = plan.cases.find((value) => value.id === row.id);
    if (actual !== undefined) equal(actual, row, 'Required async-copy proof case differs.');
  }
  const cloudKeys = expected.inventory.operations
    .filter((row) => row.source === 'pdp-cloud' && ['add', 'retain'].includes(row.decision))
    .map(operationKey)
    .sort();
  equal(
    cloudKeys,
    CLOUD_CASES.flatMap((v) => v.operationKeys).sort(),
    'Required managed cloud operations cannot be removed or deferred.',
  );
  for (const row of CLOUD_CASES)
    equal(
      plan.cases.find((v) => v.id === row.id),
      row,
      'Required managed cloud case differs.',
    );
  requireValid(
    strings(plan.nodes, supportedNodeVersion) &&
      plan.nodes.includes('22.13.0') &&
      plan.nodes.includes('24.0.0'),
    'Reviewed runtime matrix must use supported Node versions and retain both test floors.',
  );
  requireValid(
    ids(plan.runIds) && plan.runIds.length > 0 && ids(plan.phaseIds) && plan.phaseIds.length > 0,
    'Reviewed run and phase registries must be nonempty and unique.',
  );
  requireValid(
    Array.isArray(plan.pdps) &&
      plan.pdps.length === 2 &&
      isDeepStrictEqual(plan.pdps.map((row) => row.role).sort(), ['current', 'pinned']),
    'Reviewed PDP matrix must contain pinned and current identities.',
  );
  const methods = new Set(expected.inventory.methods.map((row) => row.name));
  const operations = new Set(expected.inventory.operations.map(operationKey));
  requireValid(methods.size > 0 && operations.size > 0, 'Independent inventory cannot be empty.');
  requireValid(
    isDeepStrictEqual(Object.keys(expected.methodLevels).sort(), [...methods].sort()) &&
      Object.values(expected.methodLevels).every(oneOf(['package', 'wire'])),
    'Independent method evidence requirements are incomplete.',
  );
  for (const entry of plan.cases) {
    record(
      entry,
      {
        id: label,
        level: oneOf(levels),
        methodNames: names,
        operationKeys: (v) => strings(v, text),
      },
      'reviewed case',
    );
    requireValid(
      entry.methodNames.every((name) => methods.has(name)) &&
        entry.operationKeys.every((key) => operations.has(key)),
      'Reviewed case references an unknown method or published operation.',
    );
    requireValid(
      !entry.operationKeys.length || entry.methodNames.length > 0,
      'Published-operation proof must identify a public SDK method.',
    );
    requireValid(
      !['api', 'pdp'].includes(entry.level) ||
        entry.operationKeys.every((key) => !key.startsWith('pdp-cloud ')) ||
        CLOUD_CASES.some((row) => isDeepStrictEqual(row, entry)),
      'Local service evidence cannot claim cloud PDP execution.',
    );
  }
  requireValid(
    ids(plan.abCaseIds) &&
      plan.abCaseIds.length > 0 &&
      plan.abCaseIds.every((id) => plan.cases.some((entry) => entry.id === id)),
    'Every reviewed A/B ID must have an execution case.',
  );
}

function validateBindings(evidence, expected) {
  validateRequirements(expected);
  requireValid(
    evidence.sdk.acceptanceSha256 === digest(expected.acceptance),
    'Reviewed Node acceptance contract hash differs.',
  );
  equal(
    evidence.artifact,
    expected.artifact,
    'Candidate artifact or lockfile differs from supplied bytes.',
  );
  equal(
    evidence.ab.baseline,
    expected.baseline,
    'Released baseline or lockfile differs from supplied bytes.',
  );
  requireValid(
    evidence.ab.candidateSha256 === evidence.artifact.sha256,
    'A/B candidate artifact differs.',
  );
  requireValid(
    evidence.sdk.tree === expected.tree,
    'SDK source tree differs from the clean checkout.',
  );
  const inventory = canonicalReleaseInventory(evidence.inventory);
  equal(
    inventory,
    canonicalReleaseInventory(expected.inventory),
    'Public inventory or decisions differ.',
  );
  requireValid(evidence.sdk.inventorySha256 === digest(inventory), 'Inventory digest differs.');
  equal(
    evidence.ab.intentionalDifferences,
    expected.requirements.intentionalDifferences,
    'Intentional changes differ from the reviewed migration exclusions.',
  );
  const cases = new Map(expected.requirements.cases.map((entry) => [entry.id, entry]));
  requireValid(
    cases.size > 0 && cases.size === expected.requirements.cases.length,
    'Reviewed case catalog is empty or contains duplicate IDs.',
  );
  for (const row of evidence.inventory.methods) {
    const links = [...cases.values()].filter((entry) => entry.methodNames.includes(row.name));
    equal(
      [...row.caseIds].sort(),
      links.map((entry) => entry.id).sort(),
      `Case links differ: ${row.name}.`,
    );
  }
  for (const row of evidence.inventory.operations) {
    const links = [...cases.values()].filter((entry) =>
      entry.operationKeys.includes(operationKey(row)),
    );
    equal(
      [...row.caseIds].sort(),
      links.map((entry) => entry.id).sort(),
      `Case links differ: ${operationKey(row)}.`,
    );
  }
  return cases;
}

function validateRun(run, context) {
  const { evidence, expected, cases, incomplete } = context;
  const cloud = run.target === 'hosted-ci';
  requireValid(
    (cloud ? expected.requirements.cloud.runIds : expected.requirements.runIds).includes(run.id),
    'Unreviewed run ID.',
  );
  requireValid(
    run.phaseResults.every((phase) =>
      (cloud ? expected.requirements.cloud.phaseIds : expected.requirements.phaseIds).includes(
        phase.id,
      ),
    ),
    'Unreviewed phase ID.',
  );
  requireValid(
    [evidence.artifact.sha256, evidence.ab.baseline.sha256].includes(run.artifactSha256),
    `Unknown artifact in run ${run.id}.`,
  );
  requireValid(
    expected.requirements.nodes.includes(run.node),
    `Unreviewed runtime in run ${run.id}.`,
  );
  if (cloud) {
    requireValid(
      run.artifactSha256 === evidence.artifact.sha256 &&
        run.id === 'candidate.cloud.node' + run.node,
      'Cloud cell is not the exact candidate.',
    );
    equal(run.pdp.ci, expected.ci, 'Cloud report differs from independently checked CI source.');
    requireValid(
      run.consumerLockSha256 === expected.cloudLocks?.[run.node],
      'Cloud consumer lock differs from supplied bytes.',
    );
    if (run.httpObservations.some((row) => !row.requestIdPresent))
      incomplete.push(
        'Cloud default SDK request omitted required X-Request-ID: Node ' + run.node + '.',
      );
    const age = (expected.now ?? Date.now()) - Date.parse(run.pdp.observedAt);
    requireValid(age >= -60_000 && age < 86_400_000, 'Stale cloud observation.');
  } else {
    requireValid(run.httpObservations.length === 0, 'Local evidence cannot claim cloud HTTP.');
    requireValid(
      run.consumerLockSha256 ===
        (run.artifactSha256 === evidence.artifact.sha256
          ? evidence.artifact.lockSha256
          : evidence.ab.baseline.lockSha256),
      'Local consumer lock differs.',
    );
  }
  for (const role of run.pdp.roles ?? []) {
    const required = expected.requirements.pdps.find((entry) => entry.role === role);
    requireValid(
      required && required.digest === run.pdp.digest && required.resolvedAt === run.pdp.resolvedAt,
      `Unreviewed PDP in run ${run.id}.`,
    );
  }
  if (
    run.setupErrorCount ||
    run.cleanupErrorCount ||
    run.cleanup.registered !== run.cleanup.completed ||
    run.cleanup.completed !== run.cleanup.verified
  )
    incomplete.push(`Run ${run.id}: setup or cleanup is incomplete.`);
  requireValid(run.phaseResults.length > 0, `Run ${run.id}: no executed phase evidence.`);
  const phases = new Map(run.phaseResults.map((entry) => [entry.id, entry]));
  for (const phase of run.phaseResults) {
    if (phase.status === 'PASSED')
      requireValid(phase.assertions > 0, `Phase ${phase.id}: empty PASS.`);
    const claimedAssertions = run.caseResults
      .filter((entry) => entry.phaseId === phase.id)
      .reduce((sum, entry) => sum + entry.assertions, 0);
    requireValid(
      Number.isSafeInteger(claimedAssertions) && claimedAssertions <= phase.assertions,
      'Case assertions exceed the containing phase.',
    );
    if (['INVALID', 'NOT_RUN'].includes(phase.status))
      incomplete.push(`${run.id}/${phase.id}: ${phase.status}.`);
    requireValid(
      run.target !== 'offline' || !['api', 'pdp'].includes(phase.kind),
      `Run ${run.id}: offline phase claims service proof.`,
    );
  }
  for (const entry of run.caseResults) {
    requireValid(
      cloud === expected.requirements.cloud.caseIds.includes(entry.id),
      'Local and managed-cloud case credit cannot be relabeled.',
    );
    const required = cases.get(entry.id);
    requireValid(required, 'Unreviewed case ID.');
    equal(entry.methodNames, required.methodNames, `Case ${entry.id}: method links differ.`);
    equal(entry.operationKeys, required.operationKeys, `Case ${entry.id}: operation links differ.`);
    requireValid(entry.level === required.level, `Case ${entry.id}: evidence level differs.`);
    const phase = phases.get(entry.phaseId);
    requireValid(
      phase && phase.kind === entry.level,
      `Case ${entry.id}: missing/mismatched phase.`,
    );
    if (entry.status === 'PASSED')
      requireValid(
        entry.assertions > 0 && phase.status === 'PASSED' && phase.assertions >= entry.assertions,
        `Case ${entry.id}: PASS has no successful phase assertions.`,
      );
    if (cloud) {
      requireValid(entry.phaseId === entry.id, 'Cloud case requires its own registered phase.');
      for (const format of ['esm', 'commonjs']) {
        const observation = run.httpObservations.find(
          (v) => v.caseId === entry.id && v.entry === format,
        );
        requireValid(
          observation &&
            entry.operationKeys.includes(
              'pdp-cloud ' + observation.method + ' ' + observation.path,
            ),
          'Cloud case lacks successful actual HTTP observations for both entry points.',
        );
      }
    }
    if (['INVALID', 'NOT_RUN'].includes(entry.status))
      incomplete.push(`${run.id}/${entry.id}: ${entry.status}.`);
  }
  requireValid(
    run.httpObservations.every((v) => run.caseResults.some((c) => c.id === v.caseId)),
    'Cloud HTTP observation lacks an executed case.',
  );
}

function validateMatrix(evidence, expected, incomplete) {
  const { requirements } = expected;
  const hasCase = (row, minimum) =>
    requirements.cases.some(
      (entry) =>
        row.caseIds.includes(entry.id) && (minimum === 'package' || entry.level !== 'package'),
    );
  for (const row of evidence.inventory.methods)
    if (!hasCase(row, expected.methodLevels[row.name]))
      incomplete.push(`No reviewed case for ${row.name}.`);
  for (const row of evidence.inventory.operations)
    if (['add', 'retain'].includes(row.decision) && !hasCase(row, 'wire'))
      incomplete.push(`No reviewed case for ${operationKey(row)}.`);
  for (const node of requirements.nodes)
    for (const pdp of requirements.pdps) {
      const cells = evidence.runs.filter(
        (run) =>
          run.artifactSha256 === evidence.artifact.sha256 &&
          run.node === node &&
          run.target === 'local' &&
          run.pdp.digest === pdp.digest &&
          run.pdp.roles.includes(pdp.role),
      );
      if (!cells.length) incomplete.push(`Missing local candidate cell: Node ${node}/${pdp.role}.`);
      for (const id of requirements.phaseIds)
        if (!cells.some((run) => run.phaseResults.some((phase) => phase.id === id)))
          incomplete.push(`Missing phase ${id}: Node ${node}/${pdp.role}.`);
      for (const entry of requirements.cases.filter(
        (v) => !requirements.cloud.caseIds.includes(v.id),
      ))
        if (!cells.some((run) => run.caseResults.some((item) => item.id === entry.id)))
          incomplete.push(`Missing case ${entry.id}: Node ${node}/${pdp.role}.`);
    }
  for (const node of requirements.nodes) {
    const cloud = evidence.runs.filter((run) => run.target === 'hosted-ci' && run.node === node);
    for (const id of requirements.cloud.phaseIds)
      if (!cloud.some((run) => run.phaseResults.some((row) => row.id === id)))
        incomplete.push('Missing cloud phase ' + id + ': Node ' + node + '.');
    for (const id of requirements.cloud.caseIds)
      if (!cloud.some((run) => run.caseResults.some((row) => row.id === id)))
        incomplete.push('Missing cloud case ' + id + ': Node ' + node + '.');
  }
  for (const feature of expected.acceptance.features) {
    const implemented =
      feature.caseIds.length > 0 &&
      feature.caseIds.every((id) => requirements.cases.some((row) => row.id === id)) &&
      feature.operationKeys.every((key) =>
        feature.caseIds.some((id) =>
          requirements.cases.some(
            (row) => row.id === id && row.level === 'api' && row.operationKeys.includes(key),
          ),
        ),
      );
    if (!implemented)
      incomplete.push('Unimplemented required feature ' + feature.id + ' (' + feature.owner + ').');
  }
  for (const dependency of expected.acceptance.dependencies)
    if (dependency.status !== 'VERIFIED')
      incomplete.push(
        'Unverified acceptance dependency ' + dependency.id + ' (' + dependency.owner + ').',
      );
  for (const name of expected.acceptance.requiredGates)
    if (expected.gateResults?.[name]?.result !== 'success')
      incomplete.push('Required acceptance job did not succeed: ' + name + '.');
  if (
    expected.gateResults &&
    !isDeepStrictEqual(
      Object.keys(expected.gateResults).sort(),
      [...expected.acceptance.requiredGates].sort(),
    )
  )
    incomplete.push('Missing or unexpected acceptance job results.');
}

function validateAb(evidence, expected, incomplete) {
  const runs = new Map(evidence.runs.map((run) => [run.id, run]));
  const requiredIds = expected.requirements.abCaseIds;
  requireValid(
    requiredIds.length > 0 && new Set(requiredIds).size === requiredIds.length,
    'Reviewed A/B catalog is empty or duplicated.',
  );
  for (const entry of evidence.ab.cases) {
    requireValid(requiredIds.includes(entry.id), 'Unreviewed A/B comparison ID.');
    const baseline = runs.get(entry.baselineRunId);
    const candidate = runs.get(entry.candidateRunId);
    requireValid(
      baseline &&
        candidate &&
        baseline.artifactSha256 === evidence.ab.baseline.sha256 &&
        candidate.artifactSha256 === evidence.artifact.sha256 &&
        baseline.target === 'local' &&
        candidate.target === 'local' &&
        baseline.node === candidate.node &&
        isDeepStrictEqual(baseline.pdp, candidate.pdp),
      `A/B ${entry.id}: missing or different artifact/runtime/PDP cells.`,
    );
    for (const run of [baseline, candidate]) {
      const result = run.caseResults.find((item) => item.id === entry.id);
      requireValid(result, `A/B ${entry.id}: missing execution case.`);
      if (entry.status === 'PASSED')
        requireValid(
          result.status === 'PASSED' && entry.assertions > 0,
          `A/B ${entry.id}: PASS without successful execution and comparison assertions.`,
        );
    }
    if (['INVALID', 'NOT_RUN'].includes(entry.status))
      incomplete.push(`A/B ${entry.id}: ${entry.status}.`);
  }
  for (const node of expected.requirements.nodes)
    for (const pdp of expected.requirements.pdps)
      for (const id of requiredIds)
        if (
          !evidence.ab.cases.some(
            (entry) =>
              entry.id === id &&
              runs.get(entry.candidateRunId)?.node === node &&
              runs.get(entry.candidateRunId)?.pdp.roles.includes(pdp.role),
          )
        )
          incomplete.push(`Missing A/B ${id}: Node ${node}/${pdp.role}.`);
}

function reportedFailurePositions(evidence) {
  const failures = [];
  if (Array.isArray(evidence?.runs))
    evidence.runs.forEach((run, runIndex) => {
      for (const kind of ['phaseResults', 'caseResults'])
        if (Array.isArray(run?.[kind]))
          run[kind].forEach((entry, index) => {
            if (entry?.status === 'FAILED') failures.push(`runs[${runIndex}].${kind}[${index}]`);
          });
    });
  if (Array.isArray(evidence?.ab?.cases))
    evidence.ab.cases.forEach((entry, index) => {
      if (entry?.status === 'FAILED') failures.push(`ab.cases[${index}]`);
    });
  return failures;
}

/**
 * Validates producer evidence against independently inspected inputs and a reviewed case catalog.
 * Returns 0 for complete local evidence, 1 for failures, or 2 for invalid/incomplete proof.
 * Integrity errors take precedence; producer-reported failure positions remain visible.
 * Node readiness also requires every adopted feature, trusted cloud cell, dependency and CI gate.
 */
export function validateReleaseEvidence(evidence, expected) {
  const incomplete = [];
  const failures = reportedFailurePositions(evidence);
  try {
    validateSchema(evidence);
    const cases = validateBindings(evidence, expected);
    for (const run of evidence.runs) validateRun(run, { evidence, expected, cases, incomplete });
    const current = expected.requirements.pdps.find((row) => row.role === 'current');
    const currentAge = (expected.now ?? Date.now()) - Date.parse(current.resolvedAt);
    // Current-image resolution is fresh for 24 hours; historical pinned resolution stays valid.
    if (currentAge < -60_000 || currentAge >= 86_400_000)
      incomplete.push(
        'Current PDP image resolution is stale; independently refresh its registry identity.',
      );
    validateMatrix(evidence, expected, incomplete);
    validateAb(evidence, expected, incomplete);
  } catch (error) {
    incomplete.push(error.message);
  }
  const exitCode = incomplete.length ? 2 : failures.length ? 1 : 0;
  return {
    schema: 2,
    scope: 'permit-node',
    nodeEvidence: ['PASS', 'FAIL', 'INVALID'][exitCode],
    exitCode,
    nodeReleaseReady: exitCode === 0,
    releaseReady: exitCode === 0,
    ...NODE_DEFERRALS,
    incomplete,
    failures: [...new Set(failures)],
  };
}

/** Hashes the bytes supplied by the caller; no filenames or private metadata enter the payload. */
export const bytesSha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
