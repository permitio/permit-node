import { PermitApiError } from '../../../api/base';
import { ConditionSetCreate, ConditionSetUpdate } from '../../../api/condition-sets';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// condition-sets URL is scoped under `/v2/schema/{proj}/{env}/condition_sets`.
const PROJ = 'proj';
const ENV = 'env';
const COLLECTION = `/v2/schema/${PROJ}/${ENV}/condition_sets`;

describe('ConditionSetsApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection with default pagination', async () => {
      rest.resolveWith([]);

      await permit.api.conditionSets.list();

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      // page/per_page are serialized into the URL query string (values are strings).
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
    });

    it('forwards page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.conditionSets.list({ page: 3, perPage: 25 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.params).toMatchObject({ page: '3', per_page: '25' });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single condition set with the key in the path', async () => {
      rest.resolveWith({ key: 'us-employees' });

      await permit.api.conditionSets.get('us-employees');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/us-employees`);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: 'us-employees' });

      await permit.api.conditionSets.getByKey('us-employees');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/us-employees`);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: 'set-1' });

      await permit.api.conditionSets.getById('set-1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/set-1`);
    });
  });

  describe('create', () => {
    it('POSTs a userset body to the collection', async () => {
      const payload: ConditionSetCreate = {
        key: 'us-employees',
        name: 'US based employees',
        type: 'userset',
        conditions: { allOf: [{ 'user.location': { equals: 'US' } }] },
      };
      rest.resolveWith({ ...payload, id: 'set-1' });

      await permit.api.conditionSets.create(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });

    it('POSTs a resourceset body to the collection', async () => {
      const payload: ConditionSetCreate = {
        key: 'confidential-docs',
        name: 'Confidential documents',
        type: 'resourceset',
        resource_id: 'document',
        conditions: { allOf: [{ 'resource.classification': { equals: 'secret' } }] },
      };
      rest.resolveWith({ ...payload, id: 'set-2' });

      await permit.api.conditionSets.create(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the condition set body to the keyed path', async () => {
      const body: ConditionSetUpdate = {
        name: 'Renamed set',
        conditions: { allOf: [{ 'user.location': { equals: 'EU' } }] },
      };
      rest.resolveWith({ key: 'us-employees', name: 'Renamed set' });

      await permit.api.conditionSets.update('us-employees', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${COLLECTION}/us-employees`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.conditionSets.delete('us-employees');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/us-employees`);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.conditionSets.get('missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.conditionSets
        .create({ key: 'us-employees', name: 'US based employees', type: 'userset' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
