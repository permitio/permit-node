import { PermitApiError } from '#src/api/base';
import { type TenantCreate, type TenantUpdate } from '#src/api/tenants';
import { Permit } from '#src/index';
import {
  createMockPermit,
  MOCK_API_ORIGIN,
  MOCK_PDP_ORIGIN,
  type MockTransport,
} from '#src/tests/helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// tenants URL is scoped under `/v2/facts/{proj}/{env}/tenants`. Tenants is a
// facts module, hence the `/v2/facts` prefix (not `/v2/schema`).
const PROJ = 'proj';
const ENV = 'env';
const COLLECTION = `/v2/facts/${PROJ}/${ENV}/tenants`;

describe('TenantsApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection without injecting pagination defaults', async () => {
      const response = [{ key: 't1', id: 'tenant-1' }];
      rest.resolveWith(response);

      const result = await permit.api.tenants.list();

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      // Unlike resources, tenants.list() forwards only the params it is given,
      // so page/per_page are absent when the caller omits them.
      expect(rest.last?.params).not.toHaveProperty('page');
      expect(rest.last?.params).not.toHaveProperty('per_page');
      expect(rest.last?.params).not.toHaveProperty('include_total_count');
    });

    it.each([true, false])('forwards explicit count=%s with immutable filters', async (count) => {
      interface Attributes {
        region: string | null;
      }
      const rows = [{ key: 'east', attributes: { region: null }, additive: { kept: true } }];
      const page = { data: rows, total_count: 17, page_count: 1, cursor: 'next-page' };
      const options = Object.freeze({
        includeTotalCount: count,
        search: 'east &/é',
        page: 2,
        perPage: 5,
      });
      const before = { ...options };
      rest.resolveWith(count ? page : rows);

      expect(await permit.api.tenants.list<Attributes>(options)).toEqual(count ? page : rows);
      expect(options).toEqual(before);
      expect(rest.requests).toHaveLength(1);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toEqual({
        search: 'east &/é',
        include_total_count: String(count),
        page: '2',
        per_page: '5',
      });
    });

    it('preserves empty counted pages and optional metadata without invented values', async () => {
      for (const page of [
        { data: [], total_count: 11, page_count: 0, additive: { kept: true } },
        { data: [], total_count: 0 },
      ]) {
        rest.resolveWith(page);
        expect(await permit.api.tenants.list({ includeTotalCount: true })).toEqual(page);
        expect(rest.last?.params).toEqual({ include_total_count: 'true' });
      }
      expect(rest.requests).toHaveLength(2);
    });

    it('keeps legacy flattening for omitted and false flags', async () => {
      const rows = [{ key: 'east' }];
      for (const options of [undefined, { includeTotalCount: false }] as const) {
        rest.resolveWith({ data: rows, total_count: 19, page_count: 1 });
        expect(await permit.api.tenants.list(options)).toEqual(rows);
        expect(rest.last?.params).toEqual(options ? { include_total_count: 'false' } : {});
      }
      expect(rest.requests).toHaveLength(2);
    });

    it('does not wrap unexpected counted responses or synthesize missing counts', async () => {
      for (const body of [[{ key: 'east' }], { data: [], additive: 'retained' }]) {
        rest.resolveWith(body);
        expect(await permit.api.tenants.list({ includeTotalCount: true })).toEqual(body);
      }
      expect(rest.requests).toHaveLength(2);
    });

    it('captures one option snapshot for dispatch and result selection', async () => {
      const options = { includeTotalCount: true, search: 'east', page: 2, perPage: 5 };
      const page = { data: [{ key: 'east' }], total_count: 11, page_count: 1 };
      rest.resolveWith(page);
      const pending = permit.api.tenants.list(options);
      options.includeTotalCount = false;
      options.search = 'changed';
      options.page = 9;
      expect(await pending).toEqual(page);
      expect(rest.last?.params).toEqual({
        include_total_count: 'true',
        search: 'east',
        page: '2',
        per_page: '5',
      });
      expect(options).toEqual({ includeTotalCount: false, search: 'changed', page: 9, perPage: 5 });
    });

    it('retains counted results on synchronization clones using facts proxy', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      const page = { data: [{ key: 'east' }], total_count: 3, page_count: 1 };
      const original = proxied.permit.api.tenants;
      const synced = original.waitForSync(10);
      proxied.rest.resolveWith(page);
      expect(await synced.list({ includeTotalCount: true })).toEqual(page);
      expect(proxied.rest.last?.origin).toBe(MOCK_PDP_ORIGIN);
      expect(proxied.rest.last?.path).toBe(COLLECTION);
      expect(proxied.rest.last?.params).toEqual({ include_total_count: 'true' });
      expect(synced).not.toBe(original);
      expect(proxied.rest.requests).toHaveLength(1);
    });

    it('propagates counted-list errors without a partial page or retry', async () => {
      rest.rejectWith(422, { detail: 'invalid pagination' });
      await expect(
        permit.api.tenants.list({ includeTotalCount: true, page: 0 }),
      ).rejects.toMatchObject({ name: 'PermitApiError', status: 422 });
      expect(rest.requests).toHaveLength(1);
      expect(rest.last?.params).toEqual({ include_total_count: 'true', page: '0' });
    });

    it('forwards search, page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.tenants.list({ page: 2, perPage: 5, search: 'acme' });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({
        page: '2',
        per_page: '5',
        search: 'acme',
      });
    });
  });

  describe('listTenantUsers', () => {
    it('GETs the tenant users sub-collection with the tenant key in the path', async () => {
      const response = { data: [{ key: 'u1', id: 'user-1' }], total_count: 1, page_count: 1 };
      rest.resolveWith(response);

      const result = await permit.api.tenants.listTenantUsers({ tenantKey: 't1' });

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/t1/users`);
      expect(rest.last?.params).not.toHaveProperty('page');
    });

    it('forwards pagination and the search/role filters as wire params', async () => {
      rest.resolveWith({ data: [], total_count: 0, page_count: 0 });

      await permit.api.tenants.listTenantUsers({
        tenantKey: 't1',
        page: 3,
        perPage: 10,
        search: 'alice',
        role: 'admin',
      });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/t1/users`);
      expect(rest.last?.params).toMatchObject({
        page: '3',
        per_page: '10',
        search: 'alice',
        role: 'admin',
      });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single tenant with the key in the path', async () => {
      const response = { key: 't1' };
      rest.resolveWith(response);

      const result = await permit.api.tenants.get('t1');

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/t1`);
    });

    it('getByKey is an alias for get', async () => {
      const response = { key: 't1' };
      rest.resolveWith(response);

      const result = await permit.api.tenants.getByKey('t1');

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/t1`);
    });

    it('getById is an alias for get', async () => {
      const response = { key: 'tenant-id' };
      rest.resolveWith(response);

      const result = await permit.api.tenants.getById('tenant-id');

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/tenant-id`);
    });
  });

  describe('create', () => {
    const payload: TenantCreate = {
      key: 't1',
      name: 'Acme',
      attributes: { tier: 'gold' },
    };

    it('POSTs the tenant body to the collection', async () => {
      const response = { ...payload, id: 'tenant-1' };
      rest.resolveWith(response);

      const result = await permit.api.tenants.create(payload);

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the tenant body to the keyed path', async () => {
      const body: TenantUpdate = { name: 'Renamed' };
      const response = { key: 't1', name: 'Renamed' };
      rest.resolveWith(response);

      const result = await permit.api.tenants.update('t1', body);

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.path).toBe(`${COLLECTION}/t1`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.tenants.delete('t1');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.path).toBe(`${COLLECTION}/t1`);
    });
  });

  describe('deleteTenantUser', () => {
    it('DELETEs the user under the tenant with both keys in the path', async () => {
      rest.resolveWith({});

      await permit.api.tenants.deleteTenantUser('t1', 'u1');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.path).toBe(`${COLLECTION}/t1/users/u1`);
    });
  });

  describe('waitForSync', () => {
    it('returns the same instance and dispatches to the REST host when proxy is off', async () => {
      const tenants = permit.api.tenants;

      expect(tenants.waitForSync(10)).toBe(tenants);

      rest.resolveWith([]);
      await tenants.list();
      expect(rest.last?.origin).toBe(MOCK_API_ORIGIN);
      expect(rest.last?.path).toBe(COLLECTION);
    });

    it('returns a distinct clone that dispatches to the PDP host when proxy is on', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      const tenants = proxied.permit.api.tenants;

      const synced = tenants.waitForSync(10);
      expect(synced).not.toBe(tenants);

      proxied.rest.resolveWith([]);
      await synced.list();
      expect(proxied.rest.last?.origin).toBe(MOCK_PDP_ORIGIN);
      expect(proxied.rest.last?.path).toBe(COLLECTION);
    });
  });

  describe('proxyFactsViaPdp', () => {
    it('routes the request through the PDP host while still using the rest transport', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      const response = [{ key: 't1', id: 'tenant-1' }];
      proxied.rest.resolveWith(response);

      const result = await proxied.permit.api.tenants.list();

      expect(result).toEqual(response);
      expect(proxied.rest.last?.method).toBe('GET');
      expect(proxied.rest.last?.origin).toBe(MOCK_PDP_ORIGIN);
      expect(proxied.rest.last?.path).toBe(COLLECTION);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.tenants.get('missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.tenants
        .create({ key: 't1', name: 'Acme' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
