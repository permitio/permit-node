import util from 'util';

import test from 'ava';
import { AxiosError, AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { PermitApiError } from '../../api/base';

// A token value that only this test uses.
const TOKEN = 'permit_key_exposure_test_0123456789abcdef';

interface PermitInternals {
  enforcer: { client: AxiosInstance };
  checkAllTenants: (
    user: string,
    action: string,
    resource: string,
    context?: Record<string, unknown>,
  ) => Promise<Array<{ key: string }>>;
}

test('checkAllTenants sends the query in the body and the key only in the header', async (t) => {
  const { Permit } = await import('../../index');
  const permit = new Permit({ token: TOKEN }) as unknown as PermitInternals;
  let sent: InternalAxiosRequestConfig | undefined;
  permit.enforcer.client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    sent = config;
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      data: { allowed_tenants: [{ tenant: { key: 'tenant-1', attributes: {} } }] },
    };
  };

  const tenants = await permit.checkAllTenants('user-1', 'read', 'document', { ip: '1.2.3.4' });

  t.deepEqual(
    tenants.map((tenant) => tenant.key),
    ['tenant-1'],
  );
  t.truthy(sent);
  t.true(sent?.url?.endsWith('allowed/all-tenants'));
  t.is(AxiosHeaders.from(sent?.headers).get('Authorization'), `Bearer ${TOKEN}`);
  const body = JSON.parse(String(sent?.data));
  t.deepEqual(body, {
    user: { key: 'user-1' },
    action: 'read',
    resource: { type: 'document' },
    context: { ip: '1.2.3.4' },
  });
  t.false(String(sent?.data).includes(TOKEN));
});

test('an API error neither prints nor keeps the key', (t) => {
  const config = {
    method: 'get',
    url: 'https://api.example.com/v2/facts/p/e/users/u',
    headers: new AxiosHeaders({ Authorization: `Bearer ${TOKEN}` }),
  } as InternalAxiosRequestConfig;
  const request = { _header: `GET /v2 HTTP/1.1\r\nAuthorization: Bearer ${TOKEN}\r\nHost: x\r\n` };
  const response = {
    status: 500,
    statusText: 'Error',
    data: { message: 'boom' },
    headers: {},
    config,
  };
  const axiosError = new AxiosError(
    'failed',
    'ERR_BAD_RESPONSE',
    config,
    request,
    response as never,
  );

  const error = new PermitApiError('boom', axiosError);

  t.false(util.inspect(error, { depth: 10 }).includes(TOKEN));
  t.false(util.inspect(error.originalError, { depth: 10 }).includes(TOKEN));
  t.false(JSON.stringify(error.formattedAxiosError).includes(TOKEN));
  t.is(error.originalError, axiosError);
  t.is(error.response?.status, 500);
});
