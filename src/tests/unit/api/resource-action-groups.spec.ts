import { PermitApiError } from '../../../api/base';
import { ResourceActionGroupCreate } from '../../../api/resource-action-groups';
import { Permit } from '../../../index';
import { ResourceActionGroupUpdate } from '../../../openapi';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// action-group URL is nested under
// `/v2/schema/{proj}/{env}/resources/{resourceKey}/action_groups`.
const PROJ = 'proj';
const ENV = 'env';
const RESOURCE = 'document';
const COLLECTION = `/v2/schema/${PROJ}/${ENV}/resources/${RESOURCE}/action_groups`;

describe('ResourceActionGroupsApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the resource-scoped action_groups collection with default pagination', async () => {
      rest.resolveWith([]);

      await permit.api.actionGroups.list({ resourceKey: RESOURCE });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
    });

    it('forwards page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.actionGroups.list({ resourceKey: RESOURCE, page: 2, perPage: 10 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '2', per_page: '10' });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single group with the resource key and group key in the path', async () => {
      rest.resolveWith({ key: 'editing' });

      await permit.api.actionGroups.get(RESOURCE, 'editing');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/editing`);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: 'editing' });

      await permit.api.actionGroups.getByKey(RESOURCE, 'editing');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/editing`);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: 'group-1' });

      await permit.api.actionGroups.getById(RESOURCE, 'group-1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/group-1`);
    });
  });

  describe('create', () => {
    const payload: ResourceActionGroupCreate = {
      key: 'editing',
      name: 'Editing',
      actions: ['read', 'write'],
    };

    it('POSTs the group body to the resource-scoped collection', async () => {
      rest.resolveWith({ ...payload, id: 'group-1' });

      await permit.api.actionGroups.create(RESOURCE, payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the group body to the keyed path', async () => {
      const body: ResourceActionGroupUpdate = { name: 'Editing renamed' };
      rest.resolveWith({ key: 'editing', name: 'Editing renamed' });

      await permit.api.actionGroups.update(RESOURCE, 'editing', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${COLLECTION}/editing`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.actionGroups.delete(RESOURCE, 'editing');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/editing`);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.actionGroups.get(RESOURCE, 'missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.actionGroups
        .create(RESOURCE, { key: 'editing', name: 'Editing' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
