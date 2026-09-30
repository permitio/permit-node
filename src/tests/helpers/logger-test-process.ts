import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { build } from 'esbuild';

import { TEST_TOKEN } from '#src/tests/helpers/pdp-test-server';

export type LogMode = 'default' | 'json' | 'env' | 'pretty' | 'env-pretty';

export type PdpOperation = 'check' | 'bulkCheck' | 'getUserPermissions' | 'checkAllTenants';

export interface LoggerChild {
  script: string;
  remove: () => Promise<void>;
}

/**
 * Bundles logger-child.ts and the SDK source it imports into one CommonJS script. Vitest runs the
 * specs from source, so there is no compiled child to execute. The script goes into a new
 * directory under node_modules/.cache, where Node resolves the SDK's runtime dependencies.
 *
 * @returns The script path and a function that deletes its directory.
 */
export async function buildLoggerChild(): Promise<LoggerChild> {
  const cacheDir = resolve(__dirname, '../../../node_modules/.cache');
  await mkdir(cacheDir, { recursive: true });
  const outDir = await mkdtemp(join(cacheDir, 'permit-logger-child-'));
  const remove = () => rm(outDir, { recursive: true, force: true });
  try {
    await build({
      entryPoints: [join(__dirname, 'logger-child.ts')],
      outfile: join(outDir, 'logger-child.js'),
      bundle: true,
      tsconfig: resolve('tsconfig.build.json'),
      format: 'cjs',
      platform: 'node',
      target: 'node22',
      packages: 'external',
    });
  } catch (error: unknown) {
    await remove();
    throw error;
  }
  return { script: join(outDir, 'logger-child.js'), remove };
}

/** Captures real SDK output in an isolated process without replacing logger methods. */
export async function captureLogs(
  child: LoggerChild,
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
    child.script,
    mode,
    pdp ?? '',
    options.operation ?? 'check',
    String(options.throwOnError ?? true),
    String(options.instances ?? 1),
    options.failure ?? 'allow',
  ];
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  delete env['PERMIT_LOG_JSON'];
  if (mode === 'env' || mode === 'env-pretty') {
    env['PERMIT_LOG_JSON'] = String(mode === 'env');
  }
  return promisify(execFile)(process.execPath, args, {
    encoding: 'utf8',
    timeout: 10000,
    env,
  });
}

/** Checks log formatting and ensures configured secrets never enter the captured output. */
export function assertLogs(
  output: { stdout: string; stderr: string },
  mode: LogMode,
  expectErrorOutput = false,
): void {
  if (expectErrorOutput) {
    expect(output.stderr).toMatch(/Permit(?:PDPStatus|Connection)Error/);
  } else {
    expect(output.stderr).toBe('');
  }
  for (const stream of [output.stdout, output.stderr]) {
    expect(stream).not.toContain(TEST_TOKEN);
    expect(stream).not.toContain('rest-secret-do-not-log');
    expect(stream).not.toContain('MaxListenersExceededWarning');
  }
  expect(output.stdout).toContain('Permit.io SDK initialized');
  if (mode === 'pretty' || mode === 'env-pretty') {
    expect(output.stdout).toContain('DEBUG');
    expect(output.stdout.trimStart().startsWith('{')).toBe(false);
    return;
  }

  const lines = output.stdout.trim().split('\n');
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    const record: unknown = JSON.parse(line);
    assert(
      typeof record === 'object' && record !== null,
      'Expected each log line to be a JSON object',
    );
    const fields = record as Record<string, unknown>;
    expect(typeof fields['level']).toBe('number');
    expect(typeof fields['time']).toBe('string');
    expect(typeof fields['msg']).toBe('string');
  }
}
