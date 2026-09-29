import { PermitApiError } from '../../../api/base';
import { TenantCreate, TenantUpdate } from '../../../api/tenants';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

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
      rest.resolveWith([]);

      await permit.api.tenants.list();

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      // Unlike resources, tenants.list() forwards only the params it is given,
      // so page/per_page are absent when the caller omits them.
      expect(rest.last?.params).not.toHaveProperty('page');
      expect(rest.last?.params).not.toHaveProperty('per_page');
    });

    it('forwards search, page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.tenants.list({ page: 2, perPage: 5, search: 'acme' });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({
        page: '2',
        per_page: '5',
        search: 'acme',
      });
    });
  });

  describe('listTenantUsers', () => {
    it('GETs the tenant users sub-collection with the tenant key in the path', async () => {
      rest.resolveWith({ data: [], total_count: 0, page_count: 0 });

      await permit.api.tenants.listTenantUsers({ tenantKey: 't1' });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/t1/users`);
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
      expect(rest.last?.url).toContain(`${COLLECTION}/t1/users`);
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
      rest.resolveWith({ key: 't1' });

      await permit.api.tenants.get('t1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/t1`);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: 't1' });

      await permit.api.tenants.getByKey('t1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/t1`);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: 'tenant-id' });

      await permit.api.tenants.getById('tenant-id');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/tenant-id`);
    });
  });

  describe('create', () => {
    const payload: TenantCreate = {
      key: 't1',
      name: 'Acme',
      attributes: { tier: 'gold' },
    };

    it('POSTs the tenant body to the collection', async () => {
      rest.resolveWith({ ...payload, id: 'tenant-1' });

      await permit.api.tenants.create(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the tenant body to the keyed path', async () => {
      const body: TenantUpdate = { name: 'Renamed' };
      rest.resolveWith({ key: 't1', name: 'Renamed' });

      await permit.api.tenants.update('t1', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${COLLECTION}/t1`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.tenants.delete('t1');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/t1`);
    });
  });

  describe('deleteTenantUser', () => {
    it('DELETEs the user under the tenant with both keys in the path', async () => {
      rest.resolveWith({});

      await permit.api.tenants.deleteTenantUser('t1', 'u1');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/t1/users/u1`);
    });
  });

  describe('waitForSync', () => {
    it('returns the same instance and dispatches to the REST host when proxy is off', async () => {
      const tenants = permit.api.tenants;

      expect(tenants.waitForSync(10)).toBe(tenants);

      rest.resolveWith([]);
      await tenants.list();
      expect(rest.last?.url).toContain('http://localhost:8000');
    });

    it('returns a distinct clone that dispatches to the PDP host when proxy is on', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      const tenants = proxied.permit.api.tenants;

      const synced = tenants.waitForSync(10);
      expect(synced).not.toBe(tenants);

      proxied.rest.resolveWith([]);
      await synced.list();
      expect(proxied.rest.last?.url).toContain('http://localhost:7766/v2/facts');
    });
  });

  describe('proxyFactsViaPdp', () => {
    it('routes the request through the PDP host while still using the rest transport', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      proxied.rest.resolveWith([]);

      await proxied.permit.api.tenants.list();

      expect(proxied.rest.last?.method).toBe('GET');
      expect(proxied.rest.last?.url).toContain('http://localhost:7766/v2/facts/proj/env/tenants');
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
