import { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import { PermitConnectionError, PermitPDPStatusError } from '../../../enforcement/enforcer';
import { ICheckQuery } from '../../../enforcement/interfaces';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The enforcer talks to two dedicated axios instances: the PDP client (captured
// by `pdp`) and the OPA client (captured by `opa`, used only when a check is
// made with `{ useOpa: true }`). Both default to the seeded pdp host
// (http://localhost:7766/, OPA rewritten to port 8181 + /v1/data/permit/).
describe('Enforcer (unit)', () => {
  let permit: Permit;
  let pdp: MockTransport;
  let opa: MockTransport;

  beforeEach(() => {
    ({ permit, pdp, opa } = createMockPermit());
  });

  describe('check - request shaping', () => {
    it('POSTs to `allowed` with the full {user,action,resource,context} input', async () => {
      pdp.resolveWith({ allow: true });

      const allowed = await permit.check(
        { key: 'alice', email: 'alice@x.com' },
        'read',
        { type: 'doc', key: 'd1', tenant: 't1' },
        { region: 'eu' },
      );

      expect(allowed).toBe(true);
      expect(pdp.last?.method).toBe('POST');
      expect(pdp.last?.url).toBe('allowed');
      expect(pdp.last?.data).toEqual({
        user: { key: 'alice', email: 'alice@x.com' },
        action: 'read',
        resource: { type: 'doc', key: 'd1', tenant: 't1' },
        context: { region: 'eu' },
      });
    });

    it('wraps a string user into { key }', async () => {
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', { type: 'doc', tenant: 't1' });

      expect(pdp.last?.data?.user).toEqual({ key: 'alice' });
    });

    it('parses a `type:key` resource string into { type, key }', async () => {
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', 'doc:123');

      expect(pdp.last?.data?.resource).toEqual({ type: 'doc', key: '123', tenant: 'default' });
    });

    it('parses a bare `type` resource string into { type } with no key', async () => {
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', 'doc');

      // `key` is `undefined`, so JSON serialization drops it from the body.
      expect(pdp.last?.data?.resource).toEqual({ type: 'doc', tenant: 'default' });
      expect(pdp.last?.data?.resource).not.toHaveProperty('key');
    });

    it('throws `invalid resource string` for >2 colon-separated parts and never dispatches', async () => {
      pdp.resolveWith({ allow: true });

      const error = await permit.check('alice', 'read', 'a:b:c').catch((err) => err);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('invalid resource string');
      expect(pdp.requests.length).toBe(0);
    });
  });

  describe('check - default tenant injection', () => {
    it('injects the default tenant when the resource has none and useDefaultTenantIfEmpty is on', async () => {
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', { type: 'doc' });

      expect(pdp.last?.data?.resource).toEqual({ type: 'doc', tenant: 'default' });
    });

    it('keeps the resource tenant untouched when one is already set', async () => {
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', { type: 'doc', tenant: 'acme' });

      expect(pdp.last?.data?.resource?.tenant).toBe('acme');
    });

    it('does not inject a tenant when useDefaultTenantIfEmpty is off', async () => {
      permit.config.multiTenancy.useDefaultTenantIfEmpty = false;
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', { type: 'doc' });

      expect(pdp.last?.data?.resource).toEqual({ type: 'doc' });
    });
  });

  describe('check - OPA path', () => {
    it('POSTs to `root` on the OPA client with an { input } wrapper', async () => {
      opa.resolveWith({ result: { allow: true } });

      const allowed = await permit.check(
        'alice',
        'read',
        { type: 'doc', tenant: 't1' },
        {},
        { useOpa: true },
      );

      expect(allowed).toBe(true);
      expect(opa.last?.method).toBe('POST');
      expect(opa.last?.url).toBe('root');
      expect(opa.last?.baseURL).toContain('8181');
      expect(opa.last?.baseURL).toContain('v1/data/permit');
      expect(opa.last?.data).toEqual({
        input: {
          user: { key: 'alice' },
          action: 'read',
          resource: { type: 'doc', tenant: 't1' },
          context: {},
        },
      });
      // The OPA path must not touch the PDP client.
      expect(pdp.requests.length).toBe(0);
    });
  });

  describe('check - response shaping', () => {
    it('returns the boolean from a plain `{ allow }` PDP decision', async () => {
      pdp.resolveWith({ allow: false });

      expect(await permit.check('alice', 'read', 'doc')).toBe(false);
    });

    it('unwraps `{ result: { allow } }` from an OPA decision', async () => {
      opa.resolveWith({ result: { allow: false } });

      expect(await permit.check('alice', 'read', 'doc', {}, { useOpa: true })).toBe(false);
    });
  });

  describe('check - error handling', () => {
    // A non-200 PDP response makes the SDK throw a PermitPDPStatusError inside the
    // `.then`, but the trailing `.catch` re-wraps every rejection into a
    // PermitConnectionError, so PermitPDPStatusError never actually surfaces to
    // the caller. We assert the behavior the SDK exhibits today.
    it('surfaces a non-200 PDP response as PermitConnectionError', async () => {
      pdp.resolveWith({ allow: true }, 502);

      const error = await permit.check('alice', 'read', 'doc').catch((err) => err);

      expect(error).toBeInstanceOf(PermitConnectionError);
      expect(error).not.toBeInstanceOf(PermitPDPStatusError);
      expect(error.message).toContain('unexpected status code');
    });

    it('maps a network/HTTP rejection to PermitConnectionError', async () => {
      pdp.rejectWith(500, { message: 'boom' });

      const error = await permit.check('alice', 'read', 'doc').catch((err) => err);

      expect(error).toBeInstanceOf(PermitConnectionError);
    });

    it('swallows the error and returns false when throwOnError is false per-call', async () => {
      pdp.rejectWith(500, { message: 'boom' });

      const allowed = await permit.check('alice', 'read', 'doc', {}, { throwOnError: false });

      expect(allowed).toBe(false);
    });

    it('swallows the error and returns false when throwOnError is false in config', async () => {
      permit.config.throwOnError = false;
      pdp.rejectWith(500, { message: 'boom' });

      expect(await permit.check('alice', 'read', 'doc')).toBe(false);
    });
  });

  describe('check - timeout passthrough', () => {
    it('forwards the per-call timeout to the PDP request config', async () => {
      const { client } = (permit as unknown as { enforcer: { client: AxiosInstance } }).enforcer;
      let seenTimeout: number | undefined;
      client.defaults.adapter = async (
        config: InternalAxiosRequestConfig,
      ): Promise<AxiosResponse> => {
        seenTimeout = config.timeout;
        return { data: { allow: true }, status: 200, statusText: 'OK', headers: {}, config };
      };

      await permit.check('alice', 'read', 'doc', {}, { timeout: 1234 });

      expect(seenTimeout).toBe(1234);
    });
  });

  describe('bulkCheck', () => {
    it('POSTs the mapped inputs to `allowed/bulk` and returns one boolean per check', async () => {
      pdp.resolveWith({ allow: [{ allow: true }, { allow: false }] });
      const checks: ICheckQuery[] = [
        { user: 'u1', action: 'read', resource: 'doc' },
        { user: { key: 'u2' }, action: 'write', resource: { type: 'task', key: '1', tenant: 't' } },
      ];

      const decisions = await permit.bulkCheck(checks, { region: 'eu' });

      expect(decisions).toEqual([true, false]);
      expect(pdp.last?.method).toBe('POST');
      expect(pdp.last?.url).toBe('allowed/bulk');
      expect(pdp.last?.data).toEqual([
        {
          user: { key: 'u1' },
          action: 'read',
          resource: { type: 'doc', tenant: 'default' },
          context: { region: 'eu' },
        },
        {
          user: { key: 'u2' },
          action: 'write',
          resource: { type: 'task', key: '1', tenant: 't' },
          context: { region: 'eu' },
        },
      ]);
    });

    it('unwraps an OPA-shaped `{ result: { allow } }` bulk decision', async () => {
      pdp.resolveWith({ result: { allow: [{ allow: true }, { allow: false }] } });

      const decisions = await permit.bulkCheck([
        { user: 'u1', action: 'read', resource: 'doc' },
        { user: 'u2', action: 'read', resource: 'doc' },
      ]);

      expect(decisions).toEqual([true, false]);
    });

    it('returns an empty array for an empty check list', async () => {
      pdp.resolveWith({ allow: [] });

      expect(await permit.bulkCheck([])).toEqual([]);
    });

    it('returns an empty array when throwOnError is false and the PDP errors', async () => {
      pdp.rejectWith(500, { message: 'boom' });

      const decisions = await permit.bulkCheck(
        [{ user: 'u1', action: 'read', resource: 'doc' }],
        {},
        { throwOnError: false },
      );

      expect(decisions).toEqual([]);
    });

    it('throws PermitConnectionError on PDP error by default', async () => {
      pdp.rejectWith(500, { message: 'boom' });

      const error = await permit
        .bulkCheck([{ user: 'u1', action: 'read', resource: 'doc' }])
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitConnectionError);
    });

    it('forwards the per-call timeout to the PDP request config', async () => {
      const { client } = (permit as unknown as { enforcer: { client: AxiosInstance } }).enforcer;
      let seenTimeout: number | undefined;
      client.defaults.adapter = async (
        config: InternalAxiosRequestConfig,
      ): Promise<AxiosResponse> => {
        seenTimeout = config.timeout;
        return { data: { allow: [] }, status: 200, statusText: 'OK', headers: {}, config };
      };

      await permit.bulkCheck(
        [{ user: 'u1', action: 'read', resource: 'doc' }],
        {},
        { timeout: 1234 },
      );

      expect(seenTimeout).toBe(1234);
    });
  });

  describe('getUserPermissions', () => {
    it('POSTs the {user,tenants,resources,resource_types} input to `user-permissions`', async () => {
      pdp.resolveWith({ 'doc:1': { permissions: ['read'] } });

      const permissions = await permit.getUserPermissions('bob', ['t1', 't2'], ['doc:1'], ['doc']);

      expect(permissions).toEqual({ 'doc:1': { permissions: ['read'] } });
      expect(pdp.last?.method).toBe('POST');
      expect(pdp.last?.url).toBe('user-permissions');
      expect(pdp.last?.data).toEqual({
        user: { key: 'bob' },
        tenants: ['t1', 't2'],
        resources: ['doc:1'],
        resource_types: ['doc'],
      });
    });

    it('omits undefined filters and wraps a string user into { key }', async () => {
      pdp.resolveWith({});

      await permit.getUserPermissions('bob');

      expect(pdp.last?.data).toEqual({ user: { key: 'bob' } });
    });

    it('unwraps an OPA-shaped `{ result: { permissions } }` response', async () => {
      pdp.resolveWith({ result: { permissions: { 'doc:1': { permissions: ['read'] } } } });

      const permissions = await permit.getUserPermissions('bob');

      expect(permissions).toEqual({ 'doc:1': { permissions: ['read'] } });
    });

    it('returns {} when throwOnError is false and the PDP errors', async () => {
      pdp.rejectWith(404, { message: 'not found' });

      const permissions = await permit.getUserPermissions('bob', undefined, undefined, undefined, {
        throwOnError: false,
      });

      expect(permissions).toEqual({});
    });

    it('throws PermitConnectionError on PDP error by default', async () => {
      pdp.rejectWith(500, { message: 'boom' });

      const error = await permit.getUserPermissions('bob').catch((err) => err);

      expect(error).toBeInstanceOf(PermitConnectionError);
    });

    it('forwards the per-call timeout to the PDP request config', async () => {
      const { client } = (permit as unknown as { enforcer: { client: AxiosInstance } }).enforcer;
      let seenTimeout: number | undefined;
      client.defaults.adapter = async (
        config: InternalAxiosRequestConfig,
      ): Promise<AxiosResponse> => {
        seenTimeout = config.timeout;
        return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
      };

      await permit.getUserPermissions('bob', undefined, undefined, undefined, { timeout: 1234 });

      expect(seenTimeout).toBe(1234);
    });
  });

  describe('checkAllTenants', () => {
    // TODO(PER-15318): asserts current buggy behavior. checkAllTenants passes
    // `{ headers, params }` as the POST *body* (axios's 2nd arg) instead of as a
    // request config, so the auth header / query params end up serialized into
    // the request body and never become real headers or query params, and the
    // user/action/resource are sent raw (not normalized).
    it('sends headers and params in the request body (not as real headers/params)', async () => {
      pdp.resolveWith({
        allowedTenants: [
          { tenant: { key: 't1', attributes: {} } },
          { tenant: { key: 't2', attributes: { plan: 'pro' } } },
        ],
      });

      const tenants = await permit.checkAllTenants(
        'alice',
        'read',
        'document',
        { region: 'eu' },
        'node',
      );

      expect(tenants).toEqual([
        { key: 't1', attributes: {} },
        { key: 't2', attributes: { plan: 'pro' } },
      ]);
      expect(pdp.last?.method).toBe('POST');
      expect(pdp.last?.url).toBe('/allowed/all-tenants');
      expect(pdp.last?.data).toEqual({
        headers: { Authorization: 'Bearer test-token', 'X-Permit-Sdk-Language': 'node' },
        params: { user: 'alice', action: 'read', resource: 'document', context: { region: 'eu' } },
      });
      // The Authorization header is buried in the body, so it is not a real header.
      expect(pdp.last?.headers?.Authorization).toBeUndefined();
    });

    // see PER-15318 (asserted above) — this also asserts the current buggy body placement
    it('defaults the sdk language to `node` when omitted', async () => {
      pdp.resolveWith({ allowedTenants: [] });

      const tenants = await permit.checkAllTenants('alice', 'read', 'document');

      expect(tenants).toEqual([]);
      expect(pdp.last?.data?.headers?.['X-Permit-Sdk-Language']).toBe('node');
      // context defaults to an empty object when not provided.
      expect(pdp.last?.data?.params).toEqual({
        user: 'alice',
        action: 'read',
        resource: 'document',
        context: {},
      });
    });
  });
});
