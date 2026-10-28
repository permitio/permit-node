import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';

import { trustedCloudIdentity } from '#scripts/node-acceptance.mjs';

const root = resolve(import.meta.dirname, '..');
function prepareCommand() {
  const workflow = readFileSync(join(root, '.github/workflows/ci.yaml'), 'utf8');
  const start = workflow.indexOf(
    '      - name: Audit and install only the exact external candidate',
  );
  const finish = workflow.indexOf('      - name:', start + 20);
  const command = workflow
    .slice(start, finish)
    .split('run: >-\n')[1]
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .join(' ');
  return command.replace(
    'node scripts/prepare-cloud-consumer.mjs',
    '"$PUBLIC_NODE_BINARY" "$PUBLIC_PREPARE_SCRIPT"',
  );
}
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'permit-cloud-workflow-cli-')));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, 'bin'),
    artifacts = join(directory, '.test-results/release-candidate');
  mkdirSync(bin);
  mkdirSync(artifacts, { recursive: true });
  writeFileSync(join(artifacts, 'permitio.tgz'), 'boundary-only-input-no-runtime-proof');
  const pnpm = join(bin, 'pnpm');
  writeFileSync(
    pnpm,
    `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$*" >> "$PUBLIC_PROBE_LOG"
if [[ "$*" == *--lockfile-only* ]]; then
  printf '%s\\n' 'actual-process-boundary-lock' > pnpm-lock.yaml
fi
`,
  );
  chmodSync(pnpm, 0o700);
  const log = join(directory, 'pnpm-commands.log');
  const env = {
    PATH: bin + ':' + dirname(process.execPath) + ':/usr/bin:/bin',
    PUBLIC_NODE_BINARY: process.execPath,
    PUBLIC_PREPARE_SCRIPT: join(root, 'scripts/prepare-cloud-consumer.mjs'),
    PUBLIC_PROBE_LOG: log,
    RUNNER_TEMP: directory,
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'permitio/permit-node',
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_ACTOR: 'test-only',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW_REF: 'permitio/permit-node/.github/workflows/ci.yaml@refs/heads/main',
  };
  return { directory, log, env };
}

test('workflow preparation command reaches audit then frozen install without credentials', () => {
  const f = fixture(),
    result = spawnSync(
      '/bin/bash',
      ['--noprofile', '--norc', '-euo', 'pipefail', '-c', prepareCommand()],
      { cwd: f.directory, env: f.env, encoding: 'utf8', timeout: 10_000 },
    );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(readFileSync(f.log, 'utf8').trimEnd().split('\n')).toEqual([
    'install --lockfile-only --no-frozen-lockfile --ignore-scripts',
    'audit --audit-level=moderate',
    'install --frozen-lockfile --ignore-scripts',
  ]);
  expect(readFileSync(join(f.directory, 'cloud-consumer/pnpm-lock.yaml'), 'utf8')).toBe(
    'actual-process-boundary-lock\n',
  );
});
test('wrong workflow CLI flag cannot report a checked consumer or execute package commands', () => {
  const f = fixture(),
    result = spawnSync(
      '/bin/bash',
      [
        '--noprofile',
        '--norc',
        '-euo',
        'pipefail',
        '-c',
        prepareCommand().replace('--directory', '--consumer'),
      ],
      { cwd: f.directory, env: f.env, encoding: 'utf8', timeout: 10_000 },
    );
  expect(result.status).toBe(2);
  expect(existsSync(f.log)).toBe(false);
  expect(result.stderr).toBe('Cloud consumer preparation failed; no runtime proof was produced.\n');
});

function workflowPrEnvironment(job, headRepository = 'permitio/permit-node') {
  const workflow = readFileSync(join(root, '.github/workflows/ci.yaml'), 'utf8');
  const start = workflow.indexOf('  ' + job + ':');
  const block = workflow.slice(start, workflow.indexOf('    steps:', start));
  const match = block.match(
    /^      ([A-Z_]+): \$\{\{ github\.event\.pull_request\.head\.repo\.full_name \}\}$/mu,
  );
  expect(match).not.toBeNull();
  return {
    ...fixture().env,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_WORKFLOW_REF: 'permitio/permit-node/.github/workflows/ci.yaml@refs/pull/123/merge',
    [match[1]]: headRepository,
  };
}
test.each(['cloud-test', 'cloud-required-checks'])(
  'actual %s workflow-shaped same-repository PR establishes trusted identity',
  (job) => {
    const env = workflowPrEnvironment(job);
    expect(
      trustedCloudIdentity(env, { commit: env.GITHUB_SHA, tree: 'b'.repeat(40) }),
    ).toMatchObject({ repository: 'permitio/permit-node', runId: '123', runAttempt: '1' });
  },
);
test.each(['cloud-test', 'cloud-required-checks'])(
  'actual %s workflow-shaped fork PR cannot establish trusted identity',
  (job) => {
    const env = workflowPrEnvironment(job, 'foreign/permit-node');
    expect(() =>
      trustedCloudIdentity(env, { commit: env.GITHUB_SHA, tree: 'b'.repeat(40) }),
    ).toThrow('authorized trusted CI');
  },
);
