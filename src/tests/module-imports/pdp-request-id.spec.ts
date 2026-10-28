import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const marker = 'PDP_REQUEST_ID_PROBE ';

interface RequestIdReport {
  fresh: string[];
  retry: string[];
  inherited: string[];
  falseDefault: { ids: string[]; before: string; after: string };
}

// Each built entry runs in its own Node process against an ephemeral loopback PDP. The PDP and
// derived OPA traffic stay on that port, and inherited proxy settings are removed.
function probe(entry: 'cjs' | 'esm'): string {
  return `
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Permit } = ${entry === 'esm' ? "await import('permitio')" : "require('permitio')"};
const axios = ${entry === 'esm' ? "(await import('axios')).default" : "require('axios')"};
const received = [];
let statuses = [];
const server = createServer((request, response) => {
  request.resume();
  request.on('end', () => {
    received.push(request.headers['x-request-id']);
    const status = statuses.shift() ?? 200;
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(status === 200 ? { allow: true } : {}));
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const pdp = 'http://127.0.0.1:' + server.address().port;
const opa = axios.create({ proxy: false });
opa.interceptors.request.use((request) => {
  request.baseURL = pdp + '/v1/data/permit/';
  return request;
});
const options = {
  token: 'request-id-fixture-token', pdp, opaAxiosInstance: opa, retry: false,
  log: { level: 'silent' },
};
const resource = { type: 'document', key: 'report', tenant: 'east' };
async function observe(run) {
  received.length = 0;
  await run();
  return [...received];
}
try {
  const fresh = await observe(async () => {
    const permit = new Permit(options);
    await permit.check('alice', 'read', resource);
    await permit.check('alice', 'read', resource);
  });
  statuses = [503, 200];
  const retry = await observe(() =>
    new Permit({ ...options, retry: { maxRetries: 1, retryDelay: 0 }, throwOnError: true })
      .check('alice', 'read', resource));
  axios.defaults.headers.common['X-Request-Id'] = 'caller-chosen-id';
  const inherited = await observe(() => new Permit(options).check('alice', 'read', resource));
  delete axios.defaults.headers.common['X-Request-Id'];
  axios.defaults.headers.common['x-request-id'] = false;
  const before = JSON.stringify(axios.defaults.headers);
  const ids = await observe(() => new Permit(options).check('alice', 'read', resource));
  const after = JSON.stringify(axios.defaults.headers);
  delete axios.defaults.headers.common['x-request-id'];
  console.log(${JSON.stringify(marker)} + JSON.stringify({
    fresh, retry, inherited, falseDefault: { ids, before, after },
  }));
} finally {
  server.close();
}
`;
}

const environment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(?:npm_config_)?(?:https?_|all_)?proxy$/iu.test(name),
    ),
  ),
  NO_PROXY: '127.0.0.1',
  no_proxy: '127.0.0.1',
  npm_config_no_proxy: '127.0.0.1',
};
const reports = new Map<'cjs' | 'esm', Promise<RequestIdReport>>();

async function run(entry: 'cjs' | 'esm'): Promise<RequestIdReport> {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ['--input-type=module', '-e', probe(entry)],
    { cwd: root, encoding: 'utf8', timeout: 30_000, env: environment },
  );
  const line = stdout.split('\n').find((value) => value.startsWith(marker));
  if (line === undefined) throw new Error(`The ${entry} probe printed no report:\n${stdout}`);
  return JSON.parse(line.slice(marker.length)) as RequestIdReport;
}

function report(entry: 'cjs' | 'esm'): Promise<RequestIdReport> {
  let pending = reports.get(entry);
  if (pending === undefined) {
    pending = run(entry);
    reports.set(entry, pending);
  }
  return pending;
}

for (const entry of ['cjs', 'esm'] as const) {
  describe(`built ${entry} entry PDP X-Request-ID`, () => {
    test('generates a fresh UUID for every logical call', async () => {
      const { fresh } = await report(entry);
      expect(fresh).toHaveLength(2);
      for (const id of fresh) expect(id).toMatch(uuid);
      expect(fresh[0]).not.toBe(fresh[1]);
    });

    test('keeps one ID across an SDK retry after a 503', async () => {
      const { retry } = await report(entry);
      expect(retry).toHaveLength(2);
      expect(retry[0]).toMatch(uuid);
      expect(retry[1]).toBe(retry[0]);
    });

    test('keeps a usable ID inherited from the matching Axios defaults', async () => {
      expect((await report(entry)).inherited).toEqual(['caller-chosen-id']);
    });

    test('replaces a false default without mutating caller defaults', async () => {
      const { falseDefault } = await report(entry);
      expect(falseDefault.ids).toHaveLength(1);
      expect(falseDefault.ids[0]).toMatch(uuid);
      expect(falseDefault.after).toBe(falseDefault.before);
      expect(JSON.parse(falseDefault.before)).toHaveProperty(['common', 'x-request-id'], false);
    });
  });
}
