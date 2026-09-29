import { PermitApiError } from '../../../api/base';
import { Permit } from '../../../index';
import {
  ConditionSetType,
  ResourceCreate,
  RoleAssignmentCreate,
  TenantUpdate,
  UserCreate,
} from '../../../openapi';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with org='org', project='proj',
// environment='env'. Facts modules scope under /v2/facts/{proj}/{env}, schema
// modules under /v2/schema/{proj}/{env}.
const FACTS = '/v2/facts/proj/env';
const SCHEMA = '/v2/schema/proj/env';

// These deprecated wrappers delegate to the same openapi clients as the modern
// `permit.api.<module>.<method>()` surface. The tests below verify the
// delegation (method + path + body/params) for a representative slice across
// read/create/update/delete/assign rather than every one of the ~28 wrappers.
describe('DeprecatedApiClient (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('read', () => {
    it('listUsers GETs the users collection and unwraps the paginated data', async () => {
      rest.resolveWith({ data: [{ key: 'u1' }], total_count: 1, page_count: 1 });

      const users = await permit.api.listUsers();

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${FACTS}/users`);
      // listUsers returns response.data.data (the inner array), not the envelope.
      expect(users).toEqual([{ key: 'u1' }]);
    });

    it('getUser GETs the keyed user path and returns the body', async () => {
      rest.resolveWith({ key: 'u1' });

      const user = await permit.api.getUser('u1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${FACTS}/users/u1`);
      expect(user).toEqual({ key: 'u1' });
    });

    it('listConditionSets GETs condition_sets with type/page/per_page as wire params', async () => {
      rest.resolveWith([{ key: 'cs1' }]);

      await permit.api.listConditionSets(ConditionSetType.Userset, 2, 10);

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${SCHEMA}/condition_sets`);
      expect(rest.last?.params).toMatchObject({ type: 'userset', page: '2', per_page: '10' });
    });
  });

  describe('create', () => {
    it('createUser POSTs the user body to the users collection', async () => {
      const payload: UserCreate = { key: 'u1', email: 'u1@example.com' };
      rest.resolveWith({ ...payload, id: 'user-id-1' });

      await permit.api.createUser(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(`${FACTS}/users`);
      expect(rest.last?.data).toEqual(payload);
    });

    it('createResource POSTs the resource body to the schema resources collection', async () => {
      const payload: ResourceCreate = {
        key: 'doc',
        name: 'Document',
        actions: { read: {} },
      };
      rest.resolveWith({ ...payload, id: 'res-1' });

      await permit.api.createResource(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(`${SCHEMA}/resources`);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('updateTenant PATCHes the tenant body to the keyed path', async () => {
      const body: TenantUpdate = { name: 'Renamed Tenant' };
      rest.resolveWith({ key: 't1', name: 'Renamed Tenant' });

      await permit.api.updateTenant('t1', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${FACTS}/tenants/t1`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('assign', () => {
    it('assignRole POSTs the assignment body to the role_assignments collection', async () => {
      const body: RoleAssignmentCreate = { role: 'admin', tenant: 't1', user: 'u1' };
      rest.resolveWith({ ...body, id: 'ra-1' });

      await permit.api.assignRole(body);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(`${FACTS}/role_assignments`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('deleteUser DELETEs the keyed path and returns the raw AxiosResponse', async () => {
      rest.resolveWith(undefined, 204);

      const response = await permit.api.deleteUser('u1');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${FACTS}/users/u1`);
      // delete-style wrappers return the whole AxiosResponse, not the unwrapped body.
      expect(response.status).toBe(204);
      expect(response.data).toEqual({});
    });
  });

  describe('error propagation', () => {
    it('re-throws the raw AxiosError (deprecated wrappers do not map to PermitApiError)', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.getUser('missing').catch((err) => err);

      expect(error.isAxiosError).toBe(true);
      expect(error).not.toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });
  });
});
