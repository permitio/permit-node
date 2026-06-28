import test from 'ava';
import { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { IResource, IUser, TenantDetails } from '../../enforcement/interfaces';

// Reaches the private PDP (enforcer.client) axios instance so we can swap its
// adapter and capture the outgoing request the SDK actually builds.
interface PermitInternals {
  enforcer: { client: AxiosInstance };
  checkAllTenants: (
    user: IUser | string,
    action: string,
    resource: IResource | string,
  ) => Promise<TenantDetails[]>;
}

interface CapturedBody {
  user: IUser;
  action: string;
  resource: IResource;
  context: Record<string, unknown>;
  // The old bug leaked these top-level keys into the request body.
  headers?: unknown;
  params?: unknown;
}

// Installs an adapter that records the request config and returns a canned
// all-tenants response, so the call resolves without touching the network.
function installCapturingAdapter(
  instance: AxiosInstance,
  tenants: Array<{ key: string }>,
): { config: () => InternalAxiosRequestConfig } {
  let captured: InternalAxiosRequestConfig;
  instance.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    captured = config;
    return Promise.resolve({
      data: { allowedTenants: tenants.map((tenant) => ({ tenant })) },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
  };
  return { config: () => captured };
}

async function newPermit(): Promise<PermitInternals> {
  const { Permit } = await import('../../index');
  return new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  }) as unknown as PermitInternals;
}

function parseBody(config: InternalAxiosRequestConfig): CapturedBody {
  return typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
}

test('checkAllTenants sends an authenticated, well-formed request (string forms)', async (t) => {
  const permit = await newPermit();
  const adapter = installCapturingAdapter(permit.enforcer.client, [{ key: 't1' }, { key: 't2' }]);

  const tenants = await permit.checkAllTenants('elon', 'read', 'document:doc-1');

  const config = adapter.config();

  // Regression guard: the Authorization header is now actually sent as a header,
  // not buried in the request body as it was before the fix.
  t.is(config.headers.Authorization, 'Bearer test-token');
  t.is(config.headers['X-Permit-Sdk-Language'], 'node');

  const body = parseBody(config);
  t.deepEqual(body, {
    user: { key: 'elon' },
    action: 'read',
    resource: { type: 'document', key: 'doc-1' },
    context: {},
  });

  // The old bug placed `headers` and `params` in the body.
  t.is(body.headers, undefined);
  t.is(body.params, undefined);

  // All-tenants must never pin a default tenant on the resource.
  t.is(body.resource.tenant, undefined);

  t.deepEqual(tenants, [{ key: 't1' }, { key: 't2' }] as unknown as TenantDetails[]);
});

test('checkAllTenants accepts object forms for user and resource', async (t) => {
  const permit = await newPermit();
  const adapter = installCapturingAdapter(permit.enforcer.client, [{ key: 't1' }]);

  const tenants = await permit.checkAllTenants({ key: 'elon' }, 'read', {
    type: 'document',
    key: 'doc-1',
  });

  const config = adapter.config();
  t.is(config.headers.Authorization, 'Bearer test-token');
  t.is(config.headers['X-Permit-Sdk-Language'], 'node');

  const body = parseBody(config);
  t.deepEqual(body, {
    user: { key: 'elon' },
    action: 'read',
    resource: { type: 'document', key: 'doc-1' },
    context: {},
  });
  t.is(body.headers, undefined);
  t.is(body.params, undefined);
  t.is(body.resource.tenant, undefined);

  t.deepEqual(tenants, [{ key: 't1' }] as unknown as TenantDetails[]);
});
