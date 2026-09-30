import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';

import { expect, onTestFinished, test } from 'vitest';

const root = process.cwd();
const workflow = readFileSync(join(root, '.github/workflows/ci.yaml'), 'utf8');
const schema = JSON.parse(
  readFileSync(join(root, 'src/tests/codegen/fixtures/openapi-3.1.0.json'), 'utf8'),
);
const keyPattern = new RegExp(schema.components.schemas.EnvironmentCreate.properties.key.pattern);

function stepScript(name: string): string {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name: ')[0];
  const script = step?.split('        run: |\n')[1]?.split('\n  codegen-guard:')[0];
  if (!script) {
    throw new Error(`Cannot find the run block for CI workflow step: ${name}`);
  }
  return script.replace(/^ {10}/gm, '');
}

function setting(name: string): string {
  const value = workflow.match(new RegExp(`^ +${name}: (.+)$`, 'm'))?.[1];
  if (!value) {
    throw new Error(`Cannot find CI workflow setting: ${name}`);
  }
  return value;
}

function interpolate(value: string, context: Record<string, string>): string {
  return value.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) => {
    const replacement = context[expression];
    if (replacement === undefined) {
      throw new Error(`Missing workflow context value: ${expression}`);
    }
    return replacement;
  });
}

test('CI provisions schema-valid environment keys and cleans up every matrix lane', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'permit-ci-env-'));
  onTestFinished(() => rmSync(cwd, { recursive: true, force: true }));
  const requests = join(cwd, 'requests.jsonl');
  writeFileSync(
    join(cwd, 'curl'),
    `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
const method = args[args.indexOf('-X') + 1];
const url = args.find(arg => arg.startsWith('https://'));
const body = method === 'POST' ? JSON.parse(args[args.indexOf('-d') + 1]) : undefined;
if (method !== 'POST' && method !== 'DELETE') throw new Error('Unexpected method: ' + method);
fs.appendFileSync(process.env.REQUESTS_FILE, JSON.stringify({ method, url, body }) + '\\n');
process.stdout.write(method === 'POST' ? '{"id":"local-env-id"}\\n201' : '204');
`,
    { mode: 0o755 },
  );
  const env = {
    ...process.env,
    PATH: cwd + delimiter + process.env.PATH,
    PROJECT_ID: 'local-project',
    PROJECT_API_KEY: 'local-token',
    GITHUB_OUTPUT: join(cwd, 'outputs'),
    REQUESTS_FILE: requests,
  };
  const context = { 'github.run_id': '12345', 'github.run_attempt': '2' };
  const lanes = [...workflow.matchAll(/- node: '([^']+)'\n +node-version: '([^']+)'/g)];
  expect(lanes.length).toBeGreaterThan(0);
  for (const [, label, version] of lanes) {
    const result = spawnSync(
      'bash',
      ['-euo', 'pipefail', '-c', stepScript('Provision temp Permit env')],
      {
        cwd,
        env: {
          ...env,
          ENV_KEY: interpolate(setting('ENV_KEY'), {
            ...context,
            'matrix.node': label,
            'matrix.node-version': version,
          }),
        },
        encoding: 'utf8',
      },
    );
    expect(result.status, result.stderr).toBe(0);
  }
  const cleanup = spawnSync(
    'bash',
    ['-euo', 'pipefail', '-c', stepScript('Delete temp Permit envs')],
    {
      cwd,
      env: {
        ...env,
        NODE_LABELS: setting('NODE_LABELS'),
        ENV_KEY_PREFIX: interpolate(setting('ENV_KEY_PREFIX'), context),
      },
      encoding: 'utf8',
    },
  );
  expect(cleanup.status, cleanup.stderr).toBe(0);
  const calls: Array<{ method: string; url: string; body?: { key: string } }> = readFileSync(
    requests,
    'utf8',
  )
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const created = calls.filter((call) => call.method === 'POST').map((call) => call.body?.key);
  expect(created).toHaveLength(lanes.length);
  expect(new Set(created).size).toBe(lanes.length);
  for (const key of created) {
    expect(key).toMatch(keyPattern);
  }
  const deleted = calls
    .filter((call) => call.method === 'DELETE')
    .map((call) => call.url.split('/').pop());
  expect(deleted.sort()).toStrictEqual(created.sort());
});
