import { PermitApiError } from '#src/api/base';
import { type RelationCreate } from '#src/api/resource-relations';
import { Permit } from '#src/index';
import { createMockPermit, type MockTransport } from '#src/tests/helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// relations URL is scoped under the resource passed to each call.
const PROJ = 'proj';
const ENV = 'env';
const RESOURCE = 'folder';
const COLLECTION = `/v2/schema/${PROJ}/${ENV}/resources/${RESOURCE}/relations`;

describe('ResourceRelationsApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the resource-scoped relations collection with default pagination', async () => {
      const response = [{ key: 'item-1', id: 'item-id-1' }];
      rest.resolveWith(response);

      const result = await permit.api.resourceRelations.list({ resourceKey: RESOURCE });

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      // The SDK defaults page/perPage, so they are always serialized as strings.
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
    });

    it('forwards page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.resourceRelations.list({ resourceKey: RESOURCE, page: 3, perPage: 25 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '3', per_page: '25' });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single relation with resource and relation keys in the path', async () => {
      const response = { key: 'parent' };
      rest.resolveWith(response);

      const result = await permit.api.resourceRelations.get(RESOURCE, 'parent');

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/parent`);
    });

    it('getByKey is an alias for get', async () => {
      const response = { key: 'parent' };
      rest.resolveWith(response);

      const result = await permit.api.resourceRelations.getByKey(RESOURCE, 'parent');

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/parent`);
    });

    it('getById is an alias for get', async () => {
      const response = { key: 'rel-1' };
      rest.resolveWith(response);

      const result = await permit.api.resourceRelations.getById(RESOURCE, 'rel-1');

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/rel-1`);
    });
  });

  describe('create', () => {
    const payload: RelationCreate = {
      key: 'parent',
      name: 'Parent',
      subject_resource: 'account',
    };

    it('POSTs the relation body with the resource key in the path', async () => {
      const response = { ...payload, id: 'rel-1' };
      rest.resolveWith(response);

      const result = await permit.api.resourceRelations.create(RESOURCE, payload);

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed relation path', async () => {
      rest.resolveWith({});

      await permit.api.resourceRelations.delete(RESOURCE, 'parent');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.path).toBe(`${COLLECTION}/parent`);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.resourceRelations.get(RESOURCE, 'missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.resourceRelations
        .create(RESOURCE, { key: 'parent', name: 'Parent', subject_resource: 'account' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
