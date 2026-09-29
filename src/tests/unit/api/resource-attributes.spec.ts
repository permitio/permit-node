import { PermitApiError } from '../../../api/base';
import { ResourceAttributeCreate, ResourceAttributeUpdate } from '../../../api/resource-attributes';
import { Permit } from '../../../index';
import { AttributeType } from '../../../openapi';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// attributes URL is nested under `/v2/schema/{proj}/{env}/resources/{resourceKey}/attributes`.
const PROJ = 'proj';
const ENV = 'env';
const RESOURCE = 'document';
const COLLECTION = `/v2/schema/${PROJ}/${ENV}/resources/${RESOURCE}/attributes`;

describe('ResourceAttributesApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the resource-scoped attributes collection with default pagination', async () => {
      const response = [{ key: 'item-1', id: 'item-id-1' }];
      rest.resolveWith(response);

      const result = await permit.api.resourceAttributes.list({ resourceKey: RESOURCE });

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
    });

    it('forwards page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.resourceAttributes.list({ resourceKey: RESOURCE, page: 4, perPage: 25 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '4', per_page: '25' });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single attribute with the resource key and attribute key in the path', async () => {
      const response = { key: 'owner' };
      rest.resolveWith(response);

      const result = await permit.api.resourceAttributes.get(RESOURCE, 'owner');

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/owner`);
    });

    it('getByKey is an alias for get', async () => {
      const response = { key: 'owner' };
      rest.resolveWith(response);

      const result = await permit.api.resourceAttributes.getByKey(RESOURCE, 'owner');

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/owner`);
    });

    it('getById is an alias for get', async () => {
      const response = { key: 'attr-1' };
      rest.resolveWith(response);

      const result = await permit.api.resourceAttributes.getById(RESOURCE, 'attr-1');

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(`${COLLECTION}/attr-1`);
    });
  });

  describe('create', () => {
    const payload: ResourceAttributeCreate = { key: 'owner', type: AttributeType.String };

    it('POSTs the attribute body to the resource-scoped collection', async () => {
      const response = { ...payload, id: 'attr-1' };
      rest.resolveWith(response);

      const result = await permit.api.resourceAttributes.create(RESOURCE, payload);

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the attribute body to the keyed path', async () => {
      const body: ResourceAttributeUpdate = { type: AttributeType.Number };
      const response = { key: 'owner', type: 'number' };
      rest.resolveWith(response);

      const result = await permit.api.resourceAttributes.update(RESOURCE, 'owner', body);

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.path).toBe(`${COLLECTION}/owner`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.resourceAttributes.delete(RESOURCE, 'owner');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.path).toBe(`${COLLECTION}/owner`);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.resourceAttributes
        .get(RESOURCE, 'missing')
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.resourceAttributes
        .create(RESOURCE, { key: 'owner', type: AttributeType.String })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
