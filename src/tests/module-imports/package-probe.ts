import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

/** The repository root, whose package.json names the package `permitio`. */
const PACKAGE_ROOT = path.resolve(__dirname, '../../..');

const MARKER = 'PERMITIO_PROBE ';

// Shared by both formats: construct a Permit and print what a consumer would see.
const REPORT = `
const permit = new Permit({ token: 'test-token', pdp: 'http://localhost:7766' });
console.log(${JSON.stringify(MARKER)} + JSON.stringify({
  resolved: realpathSync(resolved),
  names: { Permit: Permit.name, ApiClient: ApiClient.name, ElementsClient: ElementsClient.name },
  members: {
    check: typeof permit.check,
    api: typeof permit.api,
    elements: typeof permit.elements,
    users: typeof permit.api.users,
    resources: typeof permit.api.resources,
    roles: typeof permit.api.roles,
  },
  config: { token: permit.config.token, pdp: permit.config.pdp },
}));
`;

const ESM_PROBE = `
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ApiClient, ElementsClient, Permit } from 'permitio';
const resolved = fileURLToPath(import.meta.resolve('permitio'));
${REPORT}`;

const CJS_PROBE = `
const { realpathSync } = require('node:fs');
const { ApiClient, ElementsClient, Permit } = require('permitio');
const resolved = require.resolve('permitio');
${REPORT}`;

async function runProbe(format: 'esm' | 'cjs'): Promise<unknown> {
  const args = format === 'esm' ? ['--input-type=module', '-e', ESM_PROBE] : ['-e', CJS_PROBE];
  const { stdout } = await promisify(execFile)(process.execPath, args, {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const report = stdout.split('\n').find((line) => line.startsWith(MARKER));
  if (report === undefined) {
    throw new Error(`The ${format} probe printed no report. Output:\n${stdout}`);
  }
  return JSON.parse(report.slice(MARKER.length));
}

const probes = new Map<'esm' | 'cjs', Promise<unknown>>();

/**
 * Loads the built package in a separate Node process the way a consumer does: by package name,
 * so Node resolves it through the `exports` map. Vitest transforms the `.mjs` files it imports
 * itself, so only a child process exercises Node's own ESM loader. The child runs from the
 * repository root, where Node lets a package import itself by name.
 *
 * Each format is loaded once per test file; every test that awaits a failed load fails with the
 * child's error.
 *
 * @param format - `esm` uses a static `import` in Node's ESM loader, `cjs` uses `require`.
 * @returns The parsed report: the real path Node resolved `permitio` to (`resolved`), the
 *   exported class names (`names`), the `typeof` of Permit members (`members`) and the
 *   constructed Permit's `config` token and pdp.
 */
export function probePackage(format: 'esm' | 'cjs'): Promise<unknown> {
  let probe = probes.get(format);
  if (probe === undefined) {
    probe = runProbe(format);
    probes.set(format, probe);
  }
  return probe;
}

/** The real path of a file in the package build output. */
export function builtFile(name: string): string {
  return realpathSync(path.join(PACKAGE_ROOT, 'build', name));
}
