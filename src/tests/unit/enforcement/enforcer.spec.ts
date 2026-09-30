import { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import { type ICheckQuery } from '#src/enforcement/interfaces';
import { Permit } from '#src/index';
import { createMockPermit, MOCK_PDP_ORIGIN, type MockTransport } from '#src/tests/helpers/mock-api';

// The enforcer talks to two dedicated axios instances: the PDP client (captured
// by `pdp`) and the OPA client (captured by `opa`, used only when a check is
// made with `{ useOpa: true }`). Both default to the seeded pdp host
// (http://localhost:7766/, OPA rewritten to port 8181 + /v1/data/permit/).
//
// PDP error mapping, the throwOnError fallbacks, per-check bulk context and
// checkAllTenants are tested against a local HTTP PDP in pdp-errors.spec.ts,
// bulk-check-context.spec.ts and check-all-tenants.spec.ts.
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
      expect(pdp.last?.origin).toBe(MOCK_PDP_ORIGIN);
      expect(pdp.last?.path).toBe('/allowed');
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

      expect(pdp.last?.data).toHaveProperty('user', { key: 'alice' });
    });

    it('parses a `type:key` resource string into { type, key }', async () => {
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', 'doc:123');

      expect(pdp.last?.data).toHaveProperty('resource', {
        type: 'doc',
        key: '123',
        tenant: 'default',
      });
    });

    it('parses a bare `type` resource string into { type } with no key', async () => {
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', 'doc');

      // `key` is `undefined`, so JSON serialization drops it from the body.
      expect(pdp.last?.data).toHaveProperty('resource', { type: 'doc', tenant: 'default' });
      expect(pdp.last?.data).not.toHaveProperty('resource.key');
    });

    it('rejects resource strings with >2 colon parts without echoing input or dispatching', async () => {
      pdp.resolveWith({ allow: true });

      const error = await permit.check('alice', 'read', 'a:b:c').catch((err) => err);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Invalid resource string: expected a resource type or type:key.');
      expect(error.message).not.toContain('a:b:c');
      expect(pdp.requests.length).toBe(0);
    });
  });

  describe('check - default tenant injection', () => {
    it('injects the default tenant if none is set and useDefaultTenantIfEmpty is on', async () => {
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', { type: 'doc' });

      expect(pdp.last?.data).toHaveProperty('resource', { type: 'doc', tenant: 'default' });
    });

    it('keeps the resource tenant untouched when one is already set', async () => {
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', { type: 'doc', tenant: 'acme' });

      expect(pdp.last?.data).toHaveProperty('resource.tenant', 'acme');
    });

    it('does not inject a tenant when useDefaultTenantIfEmpty is off', async () => {
      ({ permit, pdp } = createMockPermit({ useDefaultTenantIfEmpty: false }));
      pdp.resolveWith({ allow: true });

      await permit.check('alice', 'read', { type: 'doc' });

      expect(pdp.last?.data).toHaveProperty('resource', { type: 'doc' });
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
      expect(opa.last?.origin).toBe('http://localhost:8181');
      expect(opa.last?.path).toBe('/v1/data/permit/root');
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

  describe('check - timeout passthrough', () => {
    it.each([0, 1234])(
      'forwards per-call timeout %i to the PDP request config',
      async (timeout) => {
        const { client } = (permit as unknown as { enforcer: { client: AxiosInstance } }).enforcer;
        let seenTimeout: number | undefined;
        client.defaults.adapter = async (
          config: InternalAxiosRequestConfig,
        ): Promise<AxiosResponse> => {
          seenTimeout = config.timeout;
          return { data: { allow: true }, status: 200, statusText: 'OK', headers: {}, config };
        };

        await permit.check('alice', 'read', 'doc', {}, { timeout });

        expect(seenTimeout).toBe(timeout);
      },
    );
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
      expect(pdp.last?.path).toBe('/allowed/bulk');
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

    it.each([0, 1234])(
      'forwards per-call timeout %i to the PDP request config',
      async (timeout) => {
        const { client } = (permit as unknown as { enforcer: { client: AxiosInstance } }).enforcer;
        let seenTimeout: number | undefined;
        client.defaults.adapter = async (
          config: InternalAxiosRequestConfig,
        ): Promise<AxiosResponse> => {
          seenTimeout = config.timeout;
          return {
            data: { allow: [{ allow: true }] },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        };

        await permit.bulkCheck([{ user: 'u1', action: 'read', resource: 'doc' }], {}, { timeout });

        expect(seenTimeout).toBe(timeout);
      },
    );
  });

  describe('getUserPermissions', () => {
    it('POSTs {user,tenants,resources,resource_types} to `user-permissions`', async () => {
      pdp.resolveWith({ 'doc:1': { permissions: ['read'] } });

      const permissions = await permit.getUserPermissions('bob', ['t1', 't2'], ['doc:1'], ['doc']);

      expect(permissions).toEqual({ 'doc:1': { permissions: ['read'] } });
      expect(pdp.last?.method).toBe('POST');
      expect(pdp.last?.path).toBe('/user-permissions');
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

    it.each([0, 1234])(
      'forwards per-call timeout %i to the PDP request config',
      async (timeout) => {
        const { client } = (permit as unknown as { enforcer: { client: AxiosInstance } }).enforcer;
        let seenTimeout: number | undefined;
        client.defaults.adapter = async (
          config: InternalAxiosRequestConfig,
        ): Promise<AxiosResponse> => {
          seenTimeout = config.timeout;
          return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
        };

        await permit.getUserPermissions('bob', undefined, undefined, undefined, { timeout });

        expect(seenTimeout).toBe(timeout);
      },
    );
  });
});
