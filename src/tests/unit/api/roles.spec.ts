import { PermitApiError } from '../../../api/base';
import { RoleCreate, RoleUpdate } from '../../../api/roles';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// roles URL is scoped under `/v2/schema/{proj}/{env}/roles`.
const PROJ = 'proj';
const ENV = 'env';
const COLLECTION = `/v2/schema/${PROJ}/${ENV}/roles`;

describe('RolesApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection with default pagination', async () => {
      rest.resolveWith([]);

      await permit.api.roles.list();

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
      expect(rest.last?.params).not.toHaveProperty('include_total_count');
    });

    it('forwards page, perPage and includeTotalCount as wire params', async () => {
      rest.resolveWith({ data: [], total_count: 0, page_count: 0 });

      await permit.api.roles.list({ page: 3, perPage: 25, includeTotalCount: true });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.params).toMatchObject({
        page: '3',
        per_page: '25',
        include_total_count: 'true',
      });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single role with the key in the path', async () => {
      rest.resolveWith({ key: 'admin' });

      await permit.api.roles.get('admin');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/admin`);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: 'admin' });

      await permit.api.roles.getByKey('admin');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/admin`);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: 'role-1' });

      await permit.api.roles.getById('role-1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/role-1`);
    });
  });

  describe('create', () => {
    const payload: RoleCreate = {
      key: 'admin',
      name: 'Administrator',
      permissions: ['doc:read', 'doc:write'],
    };

    it('POSTs the role body to the collection', async () => {
      rest.resolveWith({ ...payload, id: 'role-1' });

      await permit.api.roles.create(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the role body to the keyed path', async () => {
      const body: RoleUpdate = { name: 'Renamed' };
      rest.resolveWith({ key: 'admin', name: 'Renamed' });

      await permit.api.roles.update('admin', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${COLLECTION}/admin`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.roles.delete('admin');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/admin`);
    });
  });

  describe('assignPermissions', () => {
    it('POSTs the permissions body to the role permissions path', async () => {
      const permissions = ['doc:read', 'doc:write'];
      rest.resolveWith({ key: 'admin' });

      await permit.api.roles.assignPermissions('admin', permissions);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(`${COLLECTION}/admin/permissions`);
      expect(rest.last?.data).toEqual({ permissions });
    });
  });

  describe('removePermissions', () => {
    it('DELETEs the permissions body from the role permissions path', async () => {
      const permissions = ['doc:write'];
      rest.resolveWith({ key: 'admin' });

      await permit.api.roles.removePermissions('admin', permissions);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/admin/permissions`);
      expect(rest.last?.data).toEqual({ permissions });
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.roles.get('missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.roles
        .create({ key: 'admin', name: 'Administrator' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
