import { execFile } from 'child_process';
import { resolve } from 'path';
import { promisify } from 'util';

import { ExecutionContext } from 'ava';

import { TEST_TOKEN } from './pdp-test-server';

export type LogMode = 'default' | 'json' | 'env' | 'pretty' | 'env-pretty';

export type PdpOperation = 'check' | 'bulkCheck' | 'getUserPermissions' | 'checkAllTenants';

/** Captures real SDK output in an isolated process without replacing logger methods. */
export async function captureLogs(
  mode: LogMode,
  pdp?: string,
  options: {
    operation?: PdpOperation;
    throwOnError?: boolean;
    instances?: number;
    failure?: 'status' | 'transport';
  } = {},
) {
  const args = [
    resolve(__dirname, 'logger-child.js'),
    mode,
    pdp ?? '',
    options.operation ?? 'check',
    String(options.throwOnError ?? true),
    String(options.instances ?? 1),
    options.failure ?? 'allow',
  ];
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  delete env.PERMIT_LOG_JSON;
  if (mode === 'env' || mode === 'env-pretty') {
    env.PERMIT_LOG_JSON = String(mode === 'env');
  }
  return promisify(execFile)(process.execPath, args, {
    encoding: 'utf8',
    timeout: 10000,
    env,
  });
}

/** Checks log formatting and ensures configured secrets never enter the captured output. */
export function assertLogs(
  t: ExecutionContext,
  output: { stdout: string; stderr: string },
  mode: LogMode,
  expectErrorOutput = false,
): void {
  if (expectErrorOutput) {
    t.regex(output.stderr, /Permit(?:PDPStatus|Connection)Error/);
  } else {
    t.is(output.stderr, '');
  }
  for (const stream of [output.stdout, output.stderr]) {
    t.false(stream.includes(TEST_TOKEN));
    t.false(stream.includes('rest-secret-do-not-log'));
    t.false(stream.includes('MaxListenersExceededWarning'));
  }
  t.true(output.stdout.includes('Permit.io SDK initialized'));
  if (mode === 'pretty' || mode === 'env-pretty') {
    t.true(output.stdout.includes('DEBUG'));
    t.false(output.stdout.trimStart().startsWith('{'));
    return;
  }

  const lines = output.stdout.trim().split('\n');
  t.true(lines.length > 0);
  for (const line of lines) {
    const record: unknown = JSON.parse(line);
    if (typeof record !== 'object' || record === null) {
      t.fail('Expected each log line to be a JSON object');
      return;
    }
    const fields = record as Record<string, unknown>;
    t.is(typeof fields.level, 'number');
    t.is(typeof fields.time, 'string');
    t.is(typeof fields.msg, 'string');
  }
}
