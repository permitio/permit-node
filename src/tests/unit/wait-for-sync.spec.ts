import { type InternalAxiosRequestConfig } from 'axios';

import { Permit } from '#src/index';

// Neither address is an SDK default, so a request sent to one of them used the configured value.
const PDP_URL = 'http://pdp.test:7000';
const API_URL = 'http://api.test:8000';

const assignment = { user: 'u1', role: 'r1', tenant: 't1' };

function createPermit(proxyFactsViaPdp: boolean): Permit {
  return new Permit({ token: 'test-token', pdp: PDP_URL, apiUrl: API_URL, proxyFactsViaPdp });
}

/**
 * Records each request the SDK's REST client sends, at the adapter, after the SDK and axios
 * have built it. The API key scope lookup is answered with an environment-level scope.
 */
function captureRequests(permit: Permit): InternalAxiosRequestConfig[] {
  const sent: InternalAxiosRequestConfig[] = [];
  permit.config.axiosInstance.defaults.adapter = async (config) => {
    sent.push(config);
    const data = config.url?.endsWith('/v2/api-key/scope')
      ? { organization_id: 'org', project_id: 'proj', environment_id: 'env' }
      : {};
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  return sent;
}

function roleAssignmentWrites(sent: InternalAxiosRequestConfig[]): InternalAxiosRequestConfig[] {
  return sent.filter(
    (config) => config.method === 'post' && config.url?.endsWith('/role_assignments'),
  );
}

it('waitForSync(0) sends the write to the PDP with X-Wait-Timeout: 0', async () => {
  const permit = createPermit(true);
  const sent = captureRequests(permit);

  await permit.api.users.waitForSync(0).assignRole(assignment);

  const [write] = roleAssignmentWrites(sent);
  expect(write?.url).toBe(`${PDP_URL}/v2/facts/proj/env/role_assignments`);
  expect(write?.headers.get('X-Wait-Timeout')).toBe('0');
  expect(write?.headers.has('X-Timeout-Policy')).toBe(false);
});

it('waitForSync(null) sends an empty X-Wait-Timeout, which waits without a limit', async () => {
  const permit = createPermit(true);
  const sent = captureRequests(permit);

  await permit.api.users.waitForSync(null).assignRole(assignment);

  const [write] = roleAssignmentWrites(sent);
  expect(write?.headers.get('X-Wait-Timeout')).toBe('');
});

it('waitForSync(timeout, policy) sends both headers', async () => {
  const permit = createPermit(true);
  const sent = captureRequests(permit);

  await permit.api.users.waitForSync(5, 'fail').assignRole(assignment);

  const [write] = roleAssignmentWrites(sent);
  expect(write?.headers.get('X-Wait-Timeout')).toBe('5');
  expect(write?.headers.get('X-Timeout-Policy')).toBe('fail');
});

it('waitForSync leaves the headers of the client it was called on unchanged', async () => {
  const permit = createPermit(true);
  const sent = captureRequests(permit);

  permit.api.users.waitForSync(5, 'fail');
  await permit.api.users.assignRole(assignment);

  const [write] = roleAssignmentWrites(sent);
  expect(write?.url).toBe(`${PDP_URL}/v2/facts/proj/env/role_assignments`);
  expect(write?.headers.has('X-Wait-Timeout')).toBe(false);
  expect(write?.headers.has('X-Timeout-Policy')).toBe(false);
});

it('waitForSync does nothing without proxyFactsViaPdp', async () => {
  const permit = createPermit(false);
  const sent = captureRequests(permit);

  const synced = permit.api.users.waitForSync(0);
  await synced.assignRole(assignment);

  expect(synced).toBe(permit.api.users);
  const [write] = roleAssignmentWrites(sent);
  expect(write?.url).toBe(`${API_URL}/v2/facts/proj/env/role_assignments`);
  expect(write?.headers.has('X-Wait-Timeout')).toBe(false);
});
