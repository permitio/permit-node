import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';

import { expect, onTestFinished, test, vi } from 'vitest';

import { CLOUD_CASES, CLOUD_ORIGIN } from '#scripts/node-acceptance.mjs';
import { bytesSha256 } from '#scripts/release-evidence.mjs';
import { installedCloudEntries, main, saveCloudRun } from '#scripts/cloud-release-cli.mjs';

function directory() {
  const root = mkdtempSync(join(tmpdir(), 'permit-cloud-cli-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function fixture() {
  const identity = { sha256: 'a'.repeat(64), commit: 'b'.repeat(40), tree: 'c'.repeat(40) };
  return {
    identity,
    ci: {
      repository: 'permitio/permit-node',
      workflowRef: 'permitio/permit-node/.github/workflows/ci.yaml@refs/heads/main',
      runId: '123',
      runAttempt: '1',
      commit: identity.commit,
      tree: identity.tree,
    },
    lockSha256: 'd'.repeat(64),
    node: '22.23.3',
    output: join(directory(), 'proof'),
    proof: {
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
    },
  };
}

// These output-boundary fixtures grant no real cloud/service execution credit.
test('writes finite native/run identities and keeps cleanup explicitly incomplete', async () => {
  const options = fixture();
  expect(await saveCloudRun({ ...options, execute: async () => options.proof })).toBe(0);
  const native = readFileSync(join(options.output, 'native.json'));
  const run = JSON.parse(readFileSync(join(options.output, 'run.json'), 'utf8'));
  expect(run.nativeReportSha256).toBe(bytesSha256(native));
  expect(run.cleanup).toEqual({ registered: 1, completed: 0, verified: 0 });
  expect(run).toMatchObject({
    artifactSha256: options.identity.sha256,
    consumerLockSha256: options.lockSha256,
    target: 'hosted-ci',
    node: options.node,
    pdp: { ci: options.ci },
  });
  expect(run).not.toHaveProperty('releaseReady');
  expect(run).not.toHaveProperty('nodeReleaseReady');
});

test('missing request ID preserves honest unavailable observations', async () => {
  const options = fixture();
  options.proof.httpObservations[3].requestIdPresent = false;
  expect(await saveCloudRun({ ...options, execute: async () => options.proof })).toBe(2);
  const run = JSON.parse(readFileSync(join(options.output, 'run.json'), 'utf8'));
  expect(run.httpObservations[3].requestIdPresent).toBe(false);
  expect(run.httpObservations[3].status).toBe(200);
});

test('success output drops nested response metadata and caller credentials', async () => {
  const options = fixture(),
    canary = 'SUCCESS_RESPONSE_ONLY_CANARY';
  options.proof.privateResponse = { token: canary };
  for (const array of ['phaseResults', 'caseResults', 'httpObservations'])
    for (const row of options.proof[array]) row.privateResponse = { token: canary };
  expect(await saveCloudRun({ ...options, execute: async () => options.proof })).toBe(0);
  const output =
    readFileSync(join(options.output, 'native.json'), 'utf8') +
    readFileSync(join(options.output, 'run.json'), 'utf8');
  expect(output).not.toContain(canary);
  expect(output).not.toContain('privateResponse');
});

test('actual execution exception and cause are replaced at the real output boundary', async () => {
  const options = fixture(),
    canary = 'FAILURE_RESPONSE_ONLY_CANARY';
  const failure = new Error(canary, { cause: { privateResponse: canary } });
  let caught;
  try {
    await saveCloudRun({
      ...options,
      execute: async () => {
        throw failure;
      },
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(inspect(caught, { depth: 10 }) + JSON.stringify(caught) + String(caught)).not.toContain(
    canary,
  );
  expect(caught.cause).toBeUndefined();
  expect(existsSync(join(options.output, 'run.json'))).toBe(false);
});

for (const [name, change] of [
  ['missing phase', (v) => v.proof.phaseResults.pop()],
  [
    'duplicate case',
    (v) => {
      v.proof.caseResults[1] = v.proof.caseResults[0];
    },
  ],
  [
    'zero assertions',
    (v) => {
      v.proof.phaseResults[0].assertions = 0;
    },
  ],
  [
    'excess case assertions',
    (v) => {
      v.proof.caseResults[0].assertions = 11;
    },
  ],
  ['missing entry', (v) => v.proof.httpObservations.pop()],
  [
    'foreign origin',
    (v) => {
      v.proof.httpObservations[0].origin = 'https://foreign.invalid';
    },
  ],
  [
    'empty actual requests',
    (v) => {
      v.proof.httpObservations[0].requests = 0;
    },
  ],
  [
    'false request header label',
    (v) => {
      v.proof.httpObservations[0].requestIdPresent = 'true';
    },
  ],
  [
    'failed HTTP',
    (v) => {
      v.proof.httpObservations[0].status = 503;
    },
  ],
  [
    'wrong operation link',
    (v) => {
      v.proof.caseResults[0].operationKeys = [];
    },
  ],
  [
    'extra CI secret',
    (v) => {
      v.ci.secret = 'FAILURE_METADATA_CANARY';
    },
  ],
  [
    'foreign source',
    (v) => {
      v.ci.tree = 'FAILURE_METADATA_CANARY';
    },
  ],
])
  test('refuses ' + name + ' without safe-looking cloud credit', async () => {
    const options = fixture();
    change(options);
    await expect(saveCloudRun({ ...options, execute: async () => options.proof })).rejects.toThrow(
      'no complete cloud execution credit',
    );
    expect(existsSync(join(options.output, 'run.json'))).toBe(false);
  });

test('refuses replacing an earlier report instead of quietly reusing stale proof', async () => {
  const options = fixture();
  await saveCloudRun({ ...options, execute: async () => options.proof });
  await expect(saveCloudRun({ ...options, execute: async () => options.proof })).rejects.toThrow();
});

test('CLI sanitizes parser failures containing response-only canaries', async () => {
  const canary = 'CLI_RESPONSE_ONLY_CANARY';
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  onTestFinished(() => vi.restoreAllMocks());
  expect(await main(['--' + canary], directory())).toBe(2);
  expect(error.mock.calls.flat().join(' ')).not.toContain(canary);
});

function archiveFixture() {
  const root = directory(),
    packageRoot = join(root, 'package');
  mkdirSync(join(packageRoot, 'build'), { recursive: true });
  writeFileSync(
    join(packageRoot, 'package.json'),
    JSON.stringify({
      name: 'permitio',
      version: '3.0.0',
      type: 'commonjs',
      main: 'build/index.js',
      exports: { '.': { require: './build/index.js', import: './build/index.mjs' } },
    }),
  );
  writeFileSync(join(packageRoot, 'build/index.js'), 'module.exports={Permit:class {}};');
  writeFileSync(join(packageRoot, 'build/index.mjs'), 'export class Permit {}');
  const artifact = join(root, 'permitio.tgz');
  const packed = spawnSync('tar', ['-czf', artifact, '-C', root, 'package']);
  expect(packed.status).toBe(0);
  const consumer = join(root, 'consumer');
  mkdirSync(join(consumer, 'node_modules'), { recursive: true });
  cpSync(packageRoot, join(consumer, 'node_modules/permitio'), { recursive: true });
  writeFileSync(join(consumer, 'package.json'), '{}');
  const source = join(root, 'source');
  mkdirSync(source);
  return { artifact, consumer, root: source };
}

test('loads both installed module entries only after all archive members match', async () => {
  const fixture = archiveFixture();
  const entries = await installedCloudEntries(fixture);
  expect(entries.map((row) => [row.name, typeof row.Permit])).toEqual([
    ['esm', 'function'],
    ['commonjs', 'function'],
  ]);
});

test('changed installed bytes refuse before any candidate module can execute', async () => {
  const fixture = archiveFixture();
  writeFileSync(
    join(fixture.consumer, 'node_modules/permitio/build/index.mjs'),
    'globalThis.__permitCloudMismatchExecuted=true; export class Permit {}',
  );
  await expect(installedCloudEntries(fixture)).rejects.toThrow('differs from archive bytes');
  expect(globalThis.__permitCloudMismatchExecuted).toBeUndefined();
});
