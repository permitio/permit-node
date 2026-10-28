import { PermitApiError } from '#src/api/base';
import { type ResourceCreate, type ResourceReplace, type ResourceUpdate } from '#src/api/resources';
import { Permit } from '#src/index';
import { createMockPermit, type MockTransport } from '#src/tests/helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// resources URL is scoped under `/v2/schema/{proj}/{env}/resources`.
const PROJ = 'proj';
const ENV = 'env';
const COLLECTION = `/v2/schema/${PROJ}/${ENV}/resources`;

describe('ResourcesApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection with default pagination', async () => {
      const resources = [{ key: 'doc', id: 'res-1' }];
      rest.resolveWith(resources);

      const result = await permit.api.resources.list();

      expect(result).toEqual(resources);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      // page/per_page are serialized into the URL query string (values are strings).
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
      // includeTotalCount is omitted when not requested.
      expect(rest.last?.params).not.toHaveProperty('include_total_count');
    });

    it('forwards page, perPage and includeTotalCount as wire params', async () => {
      const page = { data: [{ key: 'doc', id: 'res-1' }], total_count: 1, page_count: 1 };
      rest.resolveWith(page);

      const result = await permit.api.resources.list({
        page: 2,
        perPage: 5,
        includeTotalCount: true,
      });

      // With includeTotalCount the paginated envelope is returned as is.
      expect(result).toEqual(page);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({
        page: '2',
        per_page: '5',
        include_total_count: 'true',
      });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single resource with the key in the path', async () => {
      const resource = { key: 'doc', id: 'res-1' };
      rest.resolveWith(resource);

      const result = await permit.api.resources.get('doc');

      expect(result).toEqual(resource);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/doc`);
    });

    it('getByKey is an alias for get', async () => {
      const resource = { key: 'doc', id: 'res-1' };
      rest.resolveWith(resource);

      const result = await permit.api.resources.getByKey('doc');

      expect(result).toEqual(resource);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/doc`);
    });

    it('getById is an alias for get', async () => {
      const resource = { key: 'doc', id: 'res-1' };
      rest.resolveWith(resource);

      const result = await permit.api.resources.getById('res-1');

      expect(result).toEqual(resource);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/res-1`);
    });

    it('percent-encodes a key that is not URL-safe', async () => {
      rest.resolveWith({ key: 'folder/doc #1' });

      await permit.api.resources.get('folder/doc #1');

      expect(rest.last?.path).toBe(`${COLLECTION}/folder%2Fdoc%20%231`);
    });
  });

  describe('create', () => {
    const payload: ResourceCreate = {
      key: 'doc',
      name: 'Document',
      actions: { read: {}, write: {} },
    };

    it('POSTs the resource body to the collection', async () => {
      const created = { ...payload, id: 'res-1' };
      rest.resolveWith(created);

      const result = await permit.api.resources.create(payload);

      expect(result).toEqual(created);
      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the resource body to the keyed path', async () => {
      const body: ResourceUpdate = { name: 'Renamed' };
      const updated = { key: 'doc', name: 'Renamed' };
      rest.resolveWith(updated);

      const result = await permit.api.resources.update('doc', body);

      expect(result).toEqual(updated);
      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.path).toBe(`${COLLECTION}/doc`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('replace', () => {
    it('PUTs the resource body to the keyed path', async () => {
      const body: ResourceReplace = { name: 'Replaced', actions: { read: {} } };
      const replaced = { key: 'doc', name: 'Replaced' };
      rest.resolveWith(replaced);

      const result = await permit.api.resources.replace('doc', body);

      expect(result).toEqual(replaced);
      expect(rest.last?.method).toBe('PUT');
      expect(rest.last?.path).toBe(`${COLLECTION}/doc`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.resources.delete('doc');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.path).toBe(`${COLLECTION}/doc`);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.resources.get('missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.resources
        .create({ key: 'doc', name: 'Document', actions: { read: {} } })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
