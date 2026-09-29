import { Permit } from '../../index';

// `openapiClientConfig` is a protected member of BasePermitApi; the tests read it
// through this shape to verify the headers waitForSync mutates on the clone.
interface ApiWithConfig {
  openapiClientConfig: { basePath?: string; baseOptions: { headers: Record<string, string> } };
}

function headersOf(api: unknown): Record<string, string> {
  return (api as unknown as ApiWithConfig).openapiClientConfig.baseOptions.headers;
}

function basePathOf(api: unknown): string | undefined {
  return (api as unknown as ApiWithConfig).openapiClientConfig.basePath;
}

const PDP_ADDRESS = 'http://localhost:7766';

// waitForSync only mutates request headers on a cloned client (see base.ts
// BaseFactsPermitAPI.waitForSync); it performs no network I/O, so these tests
// are fully deterministic and need no PDP/backend.

it('waitForSync(0) returns a cloned client carrying X-Wait-Timeout: 0', () => {
  const permit = new Permit({
    token: 'test-token',
    pdp: PDP_ADDRESS,
    proxyFactsViaPdp: true,
  });

  const synced = permit.api.users.waitForSync(0);

  // A distinct clone is returned, leaving the original untouched.
  expect(synced).not.toBe(permit.api.users);
  expect(headersOf(synced)['X-Wait-Timeout']).toBe('0');
  // Original client must not have gained the wait header.
  expect(headersOf(permit.api.users)['X-Wait-Timeout']).toBeUndefined();
});

it('waitForSync(null) returns a clone carrying X-Wait-Timeout as an empty string', () => {
  const permit = new Permit({
    token: 'test-token',
    pdp: PDP_ADDRESS,
    proxyFactsViaPdp: true,
  });

  const synced = permit.api.users.waitForSync(null);

  // base.ts maps a null timeout to '' (wait indefinitely), not to '0'.
  expect(synced).not.toBe(permit.api.users);
  expect(headersOf(synced)['X-Wait-Timeout']).toBe('');
});

it('waitForSync(timeout, policy) sets the X-Timeout-Policy header on the clone', () => {
  const permit = new Permit({
    token: 'test-token',
    pdp: PDP_ADDRESS,
    proxyFactsViaPdp: true,
  });

  const synced = permit.api.users.waitForSync(5, 'fail');

  expect(headersOf(synced)['X-Wait-Timeout']).toBe('5');
  expect(headersOf(synced)['X-Timeout-Policy']).toBe('fail');
  // The original client carries neither header.
  expect(headersOf(permit.api.users)['X-Timeout-Policy']).toBeUndefined();
});

it('the proxied facts client points its basePath at the PDP', () => {
  const permit = new Permit({
    token: 'test-token',
    pdp: PDP_ADDRESS,
    proxyFactsViaPdp: true,
  });

  // With proxyFactsViaPdp the facts API (and its waitForSync clone) talk to the
  // PDP rather than the control-plane API URL.
  expect(basePathOf(permit.api.users)).toBe(PDP_ADDRESS);
  expect(basePathOf(permit.api.users.waitForSync(0))).toBe(PDP_ADDRESS);
});

it('waitForSync is a no-op without proxyFactsViaPdp (returns self, no wait header)', () => {
  const permit = new Permit({
    token: 'test-token',
    pdp: PDP_ADDRESS,
  });

  const synced = permit.api.users.waitForSync(0);

  // Without proxyFactsViaPdp the same instance is returned and no header is set.
  expect(synced).toBe(permit.api.users);
  expect(headersOf(synced)['X-Wait-Timeout']).toBeUndefined();
});
