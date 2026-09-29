import { PermitApiError } from '../../../api/base';
import { ResourceActionCreate, ResourceActionUpdate } from '../../../api/resource-actions';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// actions URL is nested under `/v2/schema/{proj}/{env}/resources/{resourceKey}/actions`.
const PROJ = 'proj';
const ENV = 'env';
const RESOURCE = 'document';
const COLLECTION = `/v2/schema/${PROJ}/${ENV}/resources/${RESOURCE}/actions`;

describe('ResourceActionsApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the resource-scoped actions collection with default pagination', async () => {
      rest.resolveWith([]);

      await permit.api.resourceActions.list({ resourceKey: RESOURCE });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
    });

    it('forwards page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.resourceActions.list({ resourceKey: RESOURCE, page: 3, perPage: 7 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '3', per_page: '7' });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single action with the resource key and action key in the path', async () => {
      rest.resolveWith({ key: 'read' });

      await permit.api.resourceActions.get(RESOURCE, 'read');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/read`);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: 'read' });

      await permit.api.resourceActions.getByKey(RESOURCE, 'read');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/read`);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: 'action-1' });

      await permit.api.resourceActions.getById(RESOURCE, 'action-1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/action-1`);
    });
  });

  describe('create', () => {
    const payload: ResourceActionCreate = { key: 'read', name: 'Read' };

    it('POSTs the action body to the resource-scoped collection', async () => {
      rest.resolveWith({ ...payload, id: 'action-1' });

      await permit.api.resourceActions.create(RESOURCE, payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the action body to the keyed path', async () => {
      const body: ResourceActionUpdate = { name: 'Read renamed' };
      rest.resolveWith({ key: 'read', name: 'Read renamed' });

      await permit.api.resourceActions.update(RESOURCE, 'read', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${COLLECTION}/read`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.resourceActions.delete(RESOURCE, 'read');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/read`);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.resourceActions.get(RESOURCE, 'missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.resourceActions
        .create(RESOURCE, { key: 'read', name: 'Read' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
