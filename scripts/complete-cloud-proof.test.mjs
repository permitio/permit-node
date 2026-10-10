import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test, vi } from 'vitest';

import { CLOUD_CASES, CLOUD_ORIGIN } from '#scripts/node-acceptance.mjs';
import { bytesSha256 } from '#scripts/release-evidence.mjs';
import { saveCloudRun } from '#scripts/cloud-release-cli.mjs';
import { completeCloudExecution, main } from '#scripts/complete-cloud-proof.mjs';

async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'permit-cloud-completion-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const identity = { sha256: 'a'.repeat(64), commit: 'b'.repeat(40), tree: 'c'.repeat(40) };
  const ci = {
    repository: 'permitio/permit-node',
    workflowRef: 'permitio/permit-node/.github/workflows/ci.yaml@refs/heads/main',
    runId: '123',
    runAttempt: '1',
    commit: identity.commit,
    tree: identity.tree,
  };
  const proof = {
    phaseResults: CLOUD_CASES.map((row) => ({
      id: row.id,
      kind: 'pdp',
      status: 'PASSED',
      assertions: 10,
    })),
    caseResults: CLOUD_CASES.map((row) => ({
      ...row,
      phaseId: row.id,
      status: 'PASSED',
      assertions: 10,
    })),
    httpObservations: CLOUD_CASES.flatMap((row) =>
      ['esm', 'commonjs'].map((entry) => ({
        caseId: row.id,
        entry,
        method: 'POST',
        path: row.operationKeys[0].slice('pdp-cloud POST '.length),
        origin: CLOUD_ORIGIN,
        status: 200,
        requests: 4,
        requestIdPresent: true,
      })),
    ),
  };
  const lockBytes = Buffer.from('actual-network-free-fixture-lock-bytes\n');
  await saveCloudRun({
    identity,
    ci,
    node: '22.23.3',
    output: directory,
    lockSha256: bytesSha256(lockBytes),
    execute: async () => proof,
  });
  const { tree: _tree, ...cleanupCi } = ci;
  return {
    identity,
    ci,
    node: '22.23.3',
    lockBytes,
    executionBytes: readFileSync(join(directory, 'native.json')),
    runBytes: readFileSync(join(directory, 'run.json')),
    cleanupBytes: Buffer.from(
      JSON.stringify({
        schema: 2,
        ci: cleanupCi,
        cleanup: { registered: 1, completed: 1, verified: 1 },
      }),
    ),
  };
}
function change(bytes, edit) {
  const value = JSON.parse(bytes);
  edit(value);
  return Buffer.from(JSON.stringify(value));
}
function linkExecution(options, edit) {
  options.executionBytes = change(options.executionBytes, edit);
  const native = JSON.parse(options.executionBytes);
  options.runBytes = change(options.runBytes, (run) => {
    run.nativeReportSha256 = bytesSha256(options.executionBytes);
    for (const key of ['phaseResults', 'caseResults', 'httpObservations', 'pdp'])
      run[key] = native[key];
  });
}

test('joins actual producer bytes only with matching cleanup and lock bytes', async () => {
  const options = await fixture(),
    original = Buffer.from(options.executionBytes);
  const result = completeCloudExecution(options),
    native = JSON.parse(result.nativeBytes);
  expect(result.executionBytes).toEqual(options.executionBytes);
  expect(result.executionBytes).not.toBe(options.executionBytes);
  expect(result.run.cleanup).toEqual({ registered: 1, completed: 1, verified: 1 });
  expect(result.run.nativeReportSha256).toBe(bytesSha256(result.nativeBytes));
  expect(native.executionReportSha256).toBe(bytesSha256(options.executionBytes));
  expect(native.cleanupReportSha256).toBe(bytesSha256(options.cleanupBytes));
  expect(result.completeRequests).toBe(true);
  expect(result.run).not.toHaveProperty('releaseReady');
  expect(result.run).not.toHaveProperty('nodeReleaseReady');
  expect(options.executionBytes.equals(original)).toBe(true);
});

test.each([
  'artifact',
  'commit',
  'tree',
  'node',
  'lock',
  'runhash',
  'runid',
  'target',
  'pendingcleanup',
])('refuses changed %s source/runtime/run binding', async (field) => {
  const options = await fixture();
  if (field === 'artifact') options.identity.sha256 = 'e'.repeat(64);
  if (field === 'commit') options.identity.commit = 'e'.repeat(40);
  if (field === 'tree') options.identity.tree = 'e'.repeat(40);
  if (field === 'node') options.node = '24.0.0';
  if (field === 'lock') options.lockBytes = Buffer.from('changed');
  if (field === 'runhash')
    options.runBytes = change(options.runBytes, (r) => (r.nativeReportSha256 = 'e'.repeat(64)));
  if (field === 'runid')
    options.runBytes = change(options.runBytes, (r) => (r.id = 'candidate.local.node22.23.3'));
  if (field === 'target') options.runBytes = change(options.runBytes, (r) => (r.target = 'local'));
  if (field === 'pendingcleanup')
    options.runBytes = change(options.runBytes, (r) => (r.cleanup.verified = 1));
  expect(() => completeCloudExecution(options)).toThrow('no verified execution credit');
});

test.each([
  'missingphase',
  'relinkedcase',
  'missingentry',
  'unknownfield',
  'zeroassertions',
  'failedcase',
  'stale',
])('refuses tampered %s even after run/report hashes are relinked', async (field) => {
  const options = await fixture();
  linkExecution(options, (n) => {
    if (field === 'missingphase') n.phaseResults.pop();
    if (field === 'relinkedcase') n.caseResults[1].phaseId = n.phaseResults[0].id;
    if (field === 'missingentry') n.httpObservations.pop();
    if (field === 'unknownfield') n.httpObservations[0].response = 'PRIVATE_CANARY';
    if (field === 'zeroassertions') n.caseResults[0].assertions = 0;
    if (field === 'failedcase') n.caseResults[0].status = 'FAILED';
    if (field === 'stale') n.pdp.observedAt = '2026-09-01T00:00:00.000Z';
  });
  expect(() => completeCloudExecution(options)).toThrow('no verified execution credit');
});

test.each([
  'missing',
  'duplicate',
  'unverified',
  'notattempted',
  'foreignrun',
  'foreignattempt',
  'foreigncommit',
  'foreignrepo',
  'unknownfield',
])('refuses %s ownership cleanup proof', async (field) => {
  const options = await fixture();
  options.cleanupBytes = change(options.cleanupBytes, (c) => {
    if (field === 'missing') delete c.cleanup;
    if (field === 'duplicate') c.cleanup = { registered: 2, completed: 2, verified: 2 };
    if (field === 'unverified') c.cleanup.verified = 0;
    if (field === 'notattempted') c.cleanup = { registered: 0, completed: 0, verified: 0 };
    if (field === 'foreignrun') c.ci.runId = '999';
    if (field === 'foreignattempt') c.ci.runAttempt = '2';
    if (field === 'foreigncommit') c.ci.commit = 'e'.repeat(40);
    if (field === 'foreignrepo') c.ci.repository = 'foreign/repo';
    if (field === 'unknownfield') c.receivedBody = 'PRIVATE_CANARY';
  });
  expect(() => completeCloudExecution(options)).toThrow('no verified execution credit');
});

test('preserves missing request-ID after successful cleanup', async () => {
  const options = await fixture();
  linkExecution(options, (n) => (n.httpObservations[2].requestIdPresent = false));
  const result = completeCloudExecution(options);
  expect(result.completeRequests).toBe(false);
  expect(result.run.httpObservations[2].requestIdPresent).toBe(false);
  expect(result.run.cleanup.verified).toBe(1);
});

test.each(['parser', 'native', 'run', 'ci'])(
  'arbitrary %s secret/cause data cannot escape the output boundary',
  async (field) => {
    const options = await fixture(),
      canary = 'OUTPUT_PRIVATE_CANARY';
    if (field === 'parser') options.executionBytes = Buffer.from(canary);
    if (field === 'native')
      options.executionBytes = change(options.executionBytes, (n) => (n.response = canary));
    if (field === 'run') options.runBytes = change(options.runBytes, (n) => (n.response = canary));
    if (field === 'ci') options.ci.response = { cause: canary };
    let caught;
    try {
      completeCloudExecution(options);
    } catch (error) {
      caught = error;
    }
    expect(caught?.message).toBe(
      'Cloud proof completion failed; no verified execution credit is available.',
    );
    expect(JSON.stringify(caught)).not.toContain(canary);
  },
);

test('invalid actual CLI input logs only a static diagnostic', () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {});
  onTestFinished(() => output.mockRestore());
  expect(main(['--unknown', 'PRIVATE_PATH_CANARY'])).toBe(2);
  expect(output.mock.calls).toEqual([
    ['Cloud proof completion failed. Check source, same-run reports and cleanup.'],
  ]);
});
