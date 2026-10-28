import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const probe = `
const assert = require('node:assert/strict');
const axios = require('axios');
for (const variable of ['PERMIT_PDP_URL', 'PERMIT_API_URL']) delete process.env[variable];
let dispatches = 0;
const client = axios.create({ adapter: async config => {
  dispatches++;
  return { data: { key: 'tenant', id: 'tenant-id' }, status: 200,
    statusText: 'OK', headers: {}, config };
} });
const privateValue = 'private-url-value';
const token = 'test-token';
for (const name of ['apiUrl', 'pdp']) {
  for (const suffix of ['?'+privateValue, '#'+privateValue, '?', '#', '/?', '/#']) {
    assert.throws(() => new Permit({ token, [name]: 'http://api.invalid'+suffix,
      axiosInstance: client }), error => {
      assert.equal(error instanceof TypeError, true);
      assert.equal(error.message.includes('Invalid '+name+':'), true);
      assert.equal(error.message.includes(privateValue), false);
      assert.equal(Object.hasOwn(error, 'cause'), false);
      return true;
    });
  }
}
assert.equal(dispatches, 0);
for (const proxyFactsViaPdp of [false, true]) {
  for (const origin of ['https://api.invalid:8443', 'http://[::1]:7766']) {
    const prefix = '/prefix/%3Fsegment/%23segment';
    const context = new ApiContext();
    context._saveApiKeyAccessibleScope('org', 'project', 'environment');
    const seen = [];
    client.defaults.adapter = async config => {
      const url = new URL(client.getUri(config));
      seen.push({ origin: url.origin, path: url.pathname, search: url.search, hash: url.hash });
      return { data: { key: 'tenant', id: 'tenant-id' }, status: 200,
        statusText: 'OK', headers: {}, config };
    };
    const permit = new Permit({ token, apiUrl: origin+prefix, pdp: origin+prefix,
      axiosInstance: client, apiContext: context, proxyFactsViaPdp, log: {level:'silent'} });
    assert.equal(permit.config.apiUrl, origin+prefix);
    assert.equal(permit.config.pdp, origin+prefix);
    assert.equal((await permit.api.tenants.get('tenant')).key, 'tenant');
    assert.deepEqual(seen, [{ origin, path: prefix+'/v2/facts/project/environment/tenants/tenant',
      search: '', hash: '' }]);
  }
}
console.log('URL validation and routing passed');
`;

test.each(['esm', 'commonjs'] as const)(
  'built %s entry rejects bad base URLs and preserves encoded prefix routing',
  async (entry) => {
    const prelude =
      entry === 'esm'
        ? `import { createRequire } from 'node:module';
import { Permit, ApiContext } from 'permitio';
const require = createRequire(import.meta.url);`
        : `const { Permit, ApiContext } = require('permitio');`;
    const args =
      entry === 'esm'
        ? ['--input-type=module', '-e', prelude + probe]
        : [
            '-e',
            `(async () => { ${prelude + probe} })().catch(error => {
console.error(error); process.exitCode = 1; });`,
          ];
    const { stdout, stderr } = await promisify(execFile)(process.execPath, args, {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(stdout.trim()).toBe('URL validation and routing passed');
    expect(stderr).toBe('');
  },
);
