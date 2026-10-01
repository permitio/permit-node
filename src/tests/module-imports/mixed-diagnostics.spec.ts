import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const PRIVATE_VALUES = [
  'FIRST_OPAQUE_TOKEN',
  'SECOND_OPAQUE_TOKEN',
  'first_private',
  'second_private',
];

const runtimeProbe = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inspect } from 'node:util';
import * as esm from 'permitio';
const require = createRequire(import.meta.url);
const cjs = require('permitio');
const axios = require('axios');
const pino = require('pino');
const privateValues = ${JSON.stringify(PRIVATE_VALUES)};
function context(sdk) {
  const result = new sdk.ApiContext();
  result._saveApiKeyAccessibleScope('org', 'project', 'environment');
  result.setEnvironmentLevelContext('org', 'project', 'environment');
  return result;
}
function client(sdk, token, caller) {
  return new sdk.Permit({
    token, apiContext: context(sdk), axiosInstance: caller, retry: false,
    log: { level: 'debug', json: true },
  });
}
function safe(error) {
  const lines = [];
  const logger = pino({ level: 'error' }, { write: line => lines.push(line) });
  logger.error({ err: error }, 'Application error');
  for (const value of [String(error), inspect(error, { depth: Infinity }), JSON.stringify(error), ...lines]) {
    for (const secret of privateValues) assert.ok(!value.includes(secret), 'Public failure leaked private data');
  }
}
async function rejection(promise) {
  try { await promise; } catch (error) { return error; }
  assert.fail('Expected the caller adapter to reject');
}
for (const [firstModule, secondModule] of [[cjs, esm], [esm, cjs]]) {
  const raw = Object.assign(new Error('Caller failed for FIRST_OPAQUE_TOKEN first_private'), {
    code: 'FIRST_OPAQUE_TOKEN',
  });
  const originalKeys = Reflect.ownKeys(raw);
  const caller = axios.create({ adapter: async () => { throw raw; } });
  const first = client(firstModule, privateValues[0], caller);
  const firstError = await rejection(first.api.users.create({
    key: 'first', attributes: { note: privateValues[2] },
  }));
  assert.ok(firstError instanceof firstModule.PermitApiError);
  safe(firstError);
  raw.message = 'Caller failed for FIRST_OPAQUE_TOKEN first_private SECOND_OPAQUE_TOKEN second_private';
  const second = client(secondModule, privateValues[1], caller);
  const secondError = await rejection(second.api.users.create({
    key: 'second', attributes: { note: privateValues[3] },
  }));
  assert.ok(secondError instanceof secondModule.PermitApiError);
  assert.equal(secondError.code, undefined);
  safe(secondError);
  safe(new secondModule.PermitContextError(raw.message, { cause: raw }));
  assert.deepEqual(Reflect.ownKeys(raw), originalKeys);
  assert.equal(raw.code, privateValues[0]);
  assert.ok(raw.message.includes(privateValues[2]));
  const unrelated = client(secondModule, privateValues[1], axios.create({
    adapter: async () => { throw Object.assign(new Error('Service unavailable'), { code: 'ECONNRESET' }); },
  }));
  const otherError = await rejection(unrelated.api.users.get('unrelated'));
  assert.equal(otherError.message, 'Service unavailable');
  assert.equal(otherError.code, 'ECONNRESET');
}
console.log('MIXED_DIAGNOSTICS_OK');
`;

test('ordinary errors reused across CJS and ESM retain prior privacy in both directions', async () => {
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', runtimeProbe],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout).toContain('MIXED_DIAGNOSTICS_OK');
  expect(stderr).toBe('');
  for (const secret of PRIVATE_VALUES) expect(stdout).not.toContain(secret);
});

for (const [name, value, enumerable] of [
  ['wrong value', '{ private: "collision-private-canary" }', 'false'],
  ['enumerable map', 'new WeakMap()', 'true'],
] as const) {
  test(`incompatible shared diagnostics state fails clearly for a ${name}`, async () => {
    const probe = `
import assert from 'node:assert/strict';
Object.defineProperty(globalThis, Symbol.for('permitio.diagnostics.failurePrivacy.v1'), {
  value: ${value}, enumerable: ${enumerable}, writable: false, configurable: false,
});
const failure = await import('permitio').then(() => undefined, error => error);
assert.ok(failure instanceof TypeError);
assert.match(failure.message, /Permit diagnostic privacy state is incompatible/);
assert.ok(!failure.message.includes('collision-private-canary'));
console.log('INCOMPATIBLE_PRIVACY_STATE_OK');
`;
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      ['--input-type=module', '-e', probe],
      { cwd: root, encoding: 'utf8', timeout: 30_000 },
    );
    expect(stdout.trim()).toBe('INCOMPATIBLE_PRIVACY_STATE_OK');
    expect(stderr).toBe('');
  });
}
