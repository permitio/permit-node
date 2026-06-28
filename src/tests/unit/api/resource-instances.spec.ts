import { PermitApiError } from '../../../api/base';
import { ResourceInstanceCreate, ResourceInstanceUpdate } from '../../../api/resource-instances';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// resource-instance URL is scoped under `/v2/facts/{proj}/{env}/resource_instances`.
// Resource instances is a facts module, hence the `/v2/facts` prefix.
const PROJ = 'proj';
const ENV = 'env';
const COLLECTION = `/v2/facts/${PROJ}/${ENV}/resource_instances`;

describe('ResourceInstancesApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection without injecting pagination defaults', async () => {
      rest.resolveWith([]);

      await permit.api.resourceInstances.list();

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      // list() forwards only the params it is given, so page/per_page and the
      // tenant/resource filters are absent when the caller omits them.
      expect(rest.last?.params).not.toHaveProperty('page');
      expect(rest.last?.params).not.toHaveProperty('tenant');
      expect(rest.last?.params).not.toHaveProperty('resource');
    });

    it('forwards the tenant and resource filters plus pagination as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.resourceInstances.list({
        tenant: 't1',
        resource: 'document',
        page: 2,
        perPage: 5,
      });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({
        tenant: 't1',
        resource: 'document',
        page: '2',
        per_page: '5',
      });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single resource instance with the key in the path', async () => {
      rest.resolveWith({ key: 'inst-1' });

      await permit.api.resourceInstances.get('inst-1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/inst-1`);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: 'inst-1' });

      await permit.api.resourceInstances.getByKey('inst-1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/inst-1`);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: 'instance-id' });

      await permit.api.resourceInstances.getById('instance-id');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/instance-id`);
    });
  });

  describe('create', () => {
    const payload: ResourceInstanceCreate = {
      key: 'inst-1',
      resource: 'document',
      tenant: 't1',
      attributes: { private: true },
    };

    it('POSTs the resource-instance body to the collection', async () => {
      rest.resolveWith({ ...payload, id: 'inst-id-1' });

      await permit.api.resourceInstances.create(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the resource-instance body to the keyed path', async () => {
      const body: ResourceInstanceUpdate = { attributes: { private: false } };
      rest.resolveWith({ key: 'inst-1' });

      await permit.api.resourceInstances.update('inst-1', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${COLLECTION}/inst-1`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.resourceInstances.delete('inst-1');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/inst-1`);
    });
  });

  describe('waitForSync', () => {
    it('returns the same instance and dispatches to the REST host when proxy is off', async () => {
      const instances = permit.api.resourceInstances;

      expect(instances.waitForSync(10)).toBe(instances);

      rest.resolveWith([]);
      await instances.list();
      expect(rest.last?.url).toContain('http://localhost:8000');
    });

    it('returns a distinct clone that dispatches to the PDP host when proxy is on', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      const instances = proxied.permit.api.resourceInstances;

      const synced = instances.waitForSync(10);
      expect(synced).not.toBe(instances);

      proxied.rest.resolveWith([]);
      await synced.list();
      expect(proxied.rest.last?.url).toContain('http://localhost:7766/v2/facts');
    });
  });

  describe('proxyFactsViaPdp', () => {
    it('routes the request through the PDP host while still using the rest transport', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      proxied.rest.resolveWith([]);

      await proxied.permit.api.resourceInstances.list();

      expect(proxied.rest.last?.method).toBe('GET');
      expect(proxied.rest.last?.url).toContain(
        'http://localhost:7766/v2/facts/proj/env/resource_instances',
      );
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.resourceInstances.get('missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.resourceInstances
        .create({ key: 'inst-1', resource: 'document' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
