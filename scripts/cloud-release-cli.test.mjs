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
import {
  cloudProofDiagnostic,
  installedCloudEntries,
  main,
  saveCloudRun,
} from '#scripts/cloud-release-cli.mjs';

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
          readinessFailures: 0,
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
  expect(caught.code).toBe('cloud-proof:run:execute');
  expect(existsSync(join(options.output, 'run.json'))).toBe(false);
});

test('a static operation code survives the output boundary without its message', async () => {
  const options = fixture(),
    canary = 'OPERATION_RESPONSE_ONLY_CANARY';
  const failure = Object.assign(new Error(canary), {
    code: 'cloud-proof:op:check:esm:not-ready:timeout',
  });
  const caught = await saveCloudRun({
    ...options,
    execute: async () => {
      throw failure;
    },
  }).catch((error) => error);
  expect(caught).toMatchObject({
    message: 'Cloud SDK proof failed; no complete cloud execution credit is available.',
    code: 'cloud-proof:op:check:esm:not-ready:timeout',
  });
  expect(JSON.stringify({ ...caught, message: caught.message })).not.toContain(canary);
});

test('check readiness failures are kept as a finite allowlisted count', async () => {
  const options = fixture();
  options.proof.httpObservations[0].readinessFailures = 2;
  expect(await saveCloudRun({ ...options, execute: async () => options.proof })).toBe(0);
  const run = JSON.parse(readFileSync(join(options.output, 'run.json'), 'utf8'));
  expect(run.httpObservations.map((row) => row.readinessFailures)).toEqual([
    2, 0, 0, 0, 0, 0, 0, 0,
  ]);
});

for (const [name, change, code] of [
  ['missing phase', (v) => v.proof.phaseResults.pop(), 'cloud-proof:proof:incomplete'],
  [
    'duplicate case',
    (v) => {
      v.proof.caseResults[1] = v.proof.caseResults[0];
    },
    'cloud-proof:proof:duplicate',
  ],
  [
    'zero assertions',
    (v) => {
      v.proof.phaseResults[0].assertions = 0;
    },
    'cloud-proof:proof:case',
  ],
  [
    'excess case assertions',
    (v) => {
      v.proof.caseResults[0].assertions = 11;
    },
    'cloud-proof:proof:case',
  ],
  ['missing entry', (v) => v.proof.httpObservations.pop(), 'cloud-proof:proof:incomplete'],
  [
    'foreign origin',
    (v) => {
      v.proof.httpObservations[0].origin = 'https://foreign.invalid';
    },
    'cloud-proof:proof:observation',
  ],
  [
    'empty actual requests',
    (v) => {
      v.proof.httpObservations[0].requests = 0;
    },
    'cloud-proof:proof:observation',
  ],
  [
    'false request header label',
    (v) => {
      v.proof.httpObservations[0].requestIdPresent = 'true';
    },
    'cloud-proof:proof:observation',
  ],
  [
    'failed HTTP',
    (v) => {
      v.proof.httpObservations[0].status = 503;
    },
    'cloud-proof:proof:observation',
  ],
  [
    'missing readiness failures',
    (v) => {
      delete v.proof.httpObservations[0].readinessFailures;
    },
    'cloud-proof:proof:readiness',
  ],
  [
    'negative readiness failures',
    (v) => {
      v.proof.httpObservations[0].readinessFailures = -1;
    },
    'cloud-proof:proof:readiness',
  ],
  [
    'fractional readiness failures',
    (v) => {
      v.proof.httpObservations[0].readinessFailures = 1.5;
    },
    'cloud-proof:proof:readiness',
  ],
  [
    'readiness failures beyond the bounded attempts',
    (v) => {
      v.proof.httpObservations[0].readinessFailures = 30;
    },
    'cloud-proof:proof:readiness',
  ],
  [
    'readiness failures outside check readiness',
    (v) => {
      v.proof.httpObservations[2].readinessFailures = 1;
    },
    'cloud-proof:proof:readiness',
  ],
  [
    'wrong operation link',
    (v) => {
      v.proof.caseResults[0].operationKeys = [];
    },
    'cloud-proof:proof:case',
  ],
  [
    'extra CI secret',
    (v) => {
      v.ci.secret = 'FAILURE_METADATA_CANARY';
    },
    'cloud-proof:ci:metadata',
  ],
  [
    'foreign source',
    (v) => {
      v.ci.tree = 'FAILURE_METADATA_CANARY';
    },
    'cloud-proof:ci:metadata',
  ],
  [
    'an unreviewed runtime label',
    (v) => {
      v.node = '22';
    },
    'cloud-proof:identity:metadata',
  ],
])
  test('refuses ' + name + ' without safe-looking cloud credit', async () => {
    const options = fixture();
    change(options);
    await expect(
      saveCloudRun({ ...options, execute: async () => options.proof }),
    ).rejects.toMatchObject({
      message: 'Cloud SDK proof failed; no complete cloud execution credit is available.',
      code,
    });
    expect(existsSync(join(options.output, 'run.json'))).toBe(false);
  });

test('refuses replacing an earlier report instead of quietly reusing stale proof', async () => {
  const options = fixture();
  await saveCloudRun({ ...options, execute: async () => options.proof });
  await expect(
    saveCloudRun({ ...options, execute: async () => options.proof }),
  ).rejects.toMatchObject({ code: 'cloud-proof:output:write' });
});

const failed = 'Cloud proof failed. Check candidate identity, trusted CI and owned setup.';
function consoleLines() {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  onTestFinished(() => vi.restoreAllMocks());
  return () => [...error.mock.calls, ...log.mock.calls].map((call) => call.join(' '));
}
test('CLI sanitizes parser failures containing response-only canaries', async () => {
  const canary = 'CLI_RESPONSE_ONLY_CANARY';
  const lines = consoleLines();
  expect(await main(['--' + canary], directory())).toBe(2);
  expect(lines()).toEqual(['Cloud proof diagnostic: cloud-proof:cli:arguments', failed]);
  expect(lines().join('\n')).not.toContain(canary);
});
const paths = (root, identity) => [
  '--artifact',
  join(root, 'candidate.tgz'),
  '--identity',
  identity,
  '--consumer',
  root,
  '--fixture',
  root,
  '--output',
  join(root, 'out'),
];
test.each([
  ['missing required paths', () => ['--artifact', 'candidate.tgz'], 'cloud-proof:cli:arguments'],
  [
    'an identity path that is not a bounded file',
    (root) => paths(root, root),
    'cloud-proof:identity:file',
  ],
  [
    'an identity that does not match the archive',
    (root) => {
      writeFileSync(join(root, 'identity.json'), JSON.stringify({ sha256: 'IDENTITY_CANARY' }));
      return paths(root, join(root, 'identity.json'));
    },
    'cloud-proof:identity:archive',
  ],
])('CLI names %s with one static diagnostic line', async (_name, args, code) => {
  const root = directory(),
    lines = consoleLines();
  expect(await main(args(root), root)).toBe(2);
  expect(lines()).toEqual([`Cloud proof diagnostic: ${code}`, failed]);
  expect(lines().join('\n')).not.toMatch(/IDENTITY_CANARY|permit-cloud-cli-/u);
});
test.each([
  [
    'cloud-proof:op:check:esm:not-ready:pdp-status:503',
    'cloud-proof:op:check:esm:not-ready:pdp-status:503',
  ],
  ['cloud-proof:cli:arguments', 'cloud-proof:cli:arguments'],
  [`cloud-proof:op:${'z'.repeat(40)}`, `cloud-proof:op:${'z'.repeat(40)}`],
  [`cloud-proof:op:${'z'.repeat(41)}`, 'unclassified'],
  ['cloud-proof:op:check:esm:not-ready:pdp-status:503:extra', 'unclassified'],
  ['cloud-proof:op', 'unclassified'],
  ['cloud-proof', 'unclassified'],
  ['cloud-proof:Op:check', 'unclassified'],
  ['closure:defaults:pdp_configs', 'unclassified'],
  ['cloud-proof:op:check:esm:oracle:1\nforged: line', 'unclassified'],
  [`cloud-proof:op:${'deadbeef'.repeat(4)}:esm`, 'unclassified'],
  ['cloud-proof:op:6f1c2d3e-4b5a-6978-8a9b-0c1d2e3f4a5b:esm', 'unclassified'],
  [503, 'unclassified'],
  [undefined, 'unclassified'],
])('the CLI diagnostic prints code %j as %s', (code, printed) => {
  expect(cloudProofDiagnostic(Object.assign(new Error('MESSAGE_CANARY'), { code }))).toBe(
    `Cloud proof diagnostic: ${printed}`,
  );
  expect(cloudProofDiagnostic(undefined)).toBe('Cloud proof diagnostic: unclassified');
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
  writeFileSync(
    join(packageRoot, 'build/index.js'),
    'class PermitConnectionError extends Error {}\n' +
      'class PermitPDPStatusError extends PermitConnectionError {}\n' +
      'module.exports={Permit:class {},PermitConnectionError,PermitPDPStatusError};',
  );
  writeFileSync(
    join(packageRoot, 'build/index.mjs'),
    'export class Permit {}\nexport class PermitConnectionError extends Error {}\n' +
      'export class PermitPDPStatusError extends PermitConnectionError {}',
  );
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
  for (const entry of entries)
    expect(Object.getPrototypeOf(entry.PermitPDPStatusError)).toBe(entry.PermitConnectionError);
});
test('installed entries without the SDK error classes refuse', async () => {
  const fixture = archiveFixture(),
    packed = join(fixture.root, '..');
  for (const root of [join(packed, 'package'), join(fixture.consumer, 'node_modules/permitio')])
    writeFileSync(join(root, 'build/index.mjs'), 'export class Permit {}');
  expect(spawnSync('tar', ['-czf', fixture.artifact, '-C', packed, 'package']).status).toBe(0);
  await expect(installedCloudEntries(fixture)).rejects.toMatchObject({
    code: 'cloud-proof:entries:constructors',
  });
});

test('changed installed bytes refuse before any candidate module can execute', async () => {
  const fixture = archiveFixture();
  writeFileSync(
    join(fixture.consumer, 'node_modules/permitio/build/index.mjs'),
    'globalThis.__permitCloudMismatchExecuted=true; export class Permit {}',
  );
  await expect(installedCloudEntries(fixture)).rejects.toMatchObject({
    message: 'Installed cloud candidate differs from archive bytes.',
    code: 'cloud-proof:entries:archive-bytes',
  });
  expect(globalThis.__permitCloudMismatchExecuted).toBeUndefined();
});

test('an installed candidate inside the source checkout refuses', async () => {
  const fixture = archiveFixture();
  await expect(installedCloudEntries({ ...fixture, root: fixture.consumer })).rejects.toMatchObject(
    { code: 'cloud-proof:entries:external' },
  );
});
test('a CommonJS entry resolving outside the checked build refuses', async () => {
  const fixture = archiveFixture(),
    packed = join(fixture.root, '..');
  for (const root of [join(packed, 'package'), join(fixture.consumer, 'node_modules/permitio')]) {
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    manifest.main = 'build/other.js';
    manifest.exports['.'].require = './build/other.js';
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
    writeFileSync(join(root, 'build/other.js'), readFileSync(join(root, 'build/index.js')));
  }
  expect(spawnSync('tar', ['-czf', fixture.artifact, '-C', packed, 'package']).status).toBe(0);
  await expect(installedCloudEntries(fixture)).rejects.toMatchObject({
    code: 'cloud-proof:entries:resolution',
  });
});
