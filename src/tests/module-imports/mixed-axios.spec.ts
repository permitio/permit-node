import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../../../', import.meta.url));

for (const sdkFormat of ['cjs', 'esm']) {
  for (const callerFormat of ['cjs', 'esm']) {
    for (const transport of ['rest', 'opa']) {
      test(`${sdkFormat} SDK / ${callerFormat} Axios: live ${transport} headers`, async () => {
        const probe = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sdk = ${sdkFormat === 'esm' ? "await import('permitio')" : "require('permitio')"};
const axios = ${callerFormat === 'esm' ? "(await import('axios')).default" : "require('axios')"};
const transport = ${JSON.stringify(transport)};
const attempts = [];
let hooks = 0;
let transforms = 0;
const caller = axios.create({
  headers: { common: { 'X-Live': 'before', 'X-Disabled': false, 'X-Empty': null } },
  auth: { username: 'caller-user', password: 'caller-password' },
  adapter: async config => {
    const direct = config.url === '/direct';
    attempts.push({
      live: config.headers.get('X-Live'), disabled: config.headers.get('X-Disabled'),
      empty: config.headers.get('X-Empty'), hook: config.headers.get('X-Hook'),
      authorization: config.headers.get('Authorization'),
      auth: config.auth, url: axios.getUri(config),
    });
    if (!direct && attempts.length === 1) {
      caller.defaults.headers.common['X-Live'] = 'during-retry';
      throw new axios.AxiosError('Temporary failure', 'ERR_BAD_RESPONSE', config, undefined, {
        config, status: 503, statusText: 'Unavailable', headers: {}, data: {},
      });
    }
    return {
      config, status: 200, statusText: 'OK', headers: {},
      data: transport === 'opa' && !direct ? { result: { allow: true } } : { key: 'alice' },
    };
  },
});
const originalAdapter = caller.defaults.adapter;
caller.defaults.transformRequest = [function(data) { transforms += 1; return data; }];
caller.interceptors.request.use(config => {
  hooks += 1;
  config.headers.set('X-Hook', String(hooks));
  return config;
});
const context = new sdk.ApiContext();
context._saveApiKeyAccessibleScope('org', 'project', 'environment');
context.setEnvironmentLevelContext('org', 'project', 'environment');
const permit = new sdk.Permit({
  token: 'sdk-token', apiContext: context, pdp: 'http://127.0.0.1:7766',
  apiUrl: 'http://127.0.0.1:8080',
  ...(transport === 'opa' ? { opaAxiosInstance: caller } : { axiosInstance: caller }),
  retry: { maxRetries: 1, retryDelay: 0 }, log: { level: 'silent' },
});
caller.defaults.headers.common['X-Live'] = 'after-construction';
const result = transport === 'opa'
  ? await permit.check('alice', 'read', 'document', {}, { useOpa: true })
  : await permit.api.users.get('alice');
assert.deepEqual(result, transport === 'opa' ? true : { key: 'alice' });
assert.equal(attempts.length, 2);
assert.deepEqual(attempts.map(value => value.live), ['after-construction', 'during-retry']);
assert.deepEqual(attempts.map(value => value.hook), ['1', '2']);
for (const attempt of attempts) {
  assert.equal(attempt.disabled, false);
  assert.equal(attempt.empty, null);
  assert.equal(attempt.authorization, 'Bearer sdk-token');
  assert.equal(attempt.auth, undefined);
  assert.ok(attempt.url.startsWith('http://127.0.0.1:'));
}
assert.equal(hooks, 2);
assert.equal(transforms, 2);
assert.equal(caller.defaults.adapter, originalAdapter);
assert.deepEqual(caller.defaults.auth, { username: 'caller-user', password: 'caller-password' });
caller.defaults.headers.common['X-Live'] = 'direct-after-sdk';
await caller.get('/direct');
assert.equal(attempts.length, 3);
assert.equal(attempts[2].live, 'direct-after-sdk');
assert.deepEqual(attempts[2].auth, caller.defaults.auth);
assert.equal(attempts[2].authorization, undefined);
assert.equal(hooks, 3);
assert.equal(transforms, 3);
console.log('MIXED_AXIOS_OK');
`;
        const { stdout, stderr } = await promisify(execFile)(
          process.execPath,
          ['--input-type=module', '-e', probe],
          { cwd: root, encoding: 'utf8', timeout: 30_000 },
        );
        expect(stdout.trim()).toBe('MIXED_AXIOS_OK');
        expect(stderr).toBe('');
      });
    }
  }
}
