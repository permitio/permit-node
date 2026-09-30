import { PermitApiError } from '#src/api/base';
import { type RoleAssignmentCreate, type RoleAssignmentRemove } from '#src/api/role-assignments';
import { Permit } from '#src/index';
import {
  createMockPermit,
  MOCK_API_ORIGIN,
  MOCK_PDP_ORIGIN,
  type MockTransport,
} from '#src/tests/helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// role-assignments URL is scoped under `/v2/facts/{proj}/{env}/role_assignments`.
const PROJ = 'proj';
const ENV = 'env';
const COLLECTION = `/v2/facts/${PROJ}/${ENV}/role_assignments`;
const BULK = `${COLLECTION}/bulk`;

describe('RoleAssignmentsApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection with default pagination', async () => {
      const response = [{ user: 'user-1', role: 'admin', tenant: 'acme', id: 'ra-1' }];
      rest.resolveWith(response);

      const result = await permit.api.roleAssignments.list({});

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      // page/per_page are always sent (SDK defaults 1/100) and serialized as strings.
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
      // Optional flags are omitted unless requested.
      expect(rest.last?.params).not.toHaveProperty('include_total_count');
      expect(rest.last?.params).not.toHaveProperty('detailed');
    });

    it('forwards user/role/tenant/resourceInstance filters as snake_case wire params', async () => {
      rest.resolveWith([]);

      await permit.api.roleAssignments.list({
        user: 'user-1',
        role: 'admin',
        tenant: 'acme',
        resourceInstance: 'document:readme',
      });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({
        user: 'user-1',
        role: 'admin',
        tenant: 'acme',
        resource_instance: 'document:readme',
      });
    });

    it('forwards page, perPage and includeTotalCount as wire params', async () => {
      const response = {
        data: [{ user: 'user-1', role: 'admin', tenant: 'acme', id: 'ra-1' }],
        total_count: 1,
        page_count: 1,
      };
      rest.resolveWith(response);

      const result = await permit.api.roleAssignments.list({
        page: 2,
        perPage: 5,
        includeTotalCount: true,
      });

      // With includeTotalCount the paginated envelope is returned as is.
      expect(result).toEqual(response);
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({
        page: '2',
        per_page: '5',
        include_total_count: 'true',
      });
    });

    it('forwards the detailed flag as a wire param', async () => {
      rest.resolveWith([]);

      await permit.api.roleAssignments.list({ detailed: true });

      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.params).toMatchObject({ detailed: 'true' });
    });
  });

  describe('assign', () => {
    const payload: RoleAssignmentCreate = {
      user: 'user-1',
      role: 'admin',
      tenant: 'acme',
    };

    it('POSTs the assignment body to the collection', async () => {
      const response = { ...payload, id: 'ra-1' };
      rest.resolveWith(response);

      const result = await permit.api.roleAssignments.assign(payload);

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('unassign', () => {
    const payload: RoleAssignmentRemove = {
      user: 'user-1',
      role: 'admin',
      tenant: 'acme',
    };

    it('DELETEs the collection with the unassignment body', async () => {
      rest.resolveWith({});

      await permit.api.roleAssignments.unassign(payload);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.path).toBe(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('bulkAssign', () => {
    const payload: RoleAssignmentCreate[] = [
      { user: 'user-1', role: 'admin', tenant: 'acme' },
      { user: 'user-2', role: 'viewer', tenant: 'acme' },
    ];

    it('POSTs the array of assignments to the bulk path', async () => {
      const response = { assignments_created: 2 };
      rest.resolveWith(response);

      const result = await permit.api.roleAssignments.bulkAssign(payload);

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.path).toBe(BULK);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('bulkUnassign', () => {
    const payload: RoleAssignmentRemove[] = [
      { user: 'user-1', role: 'admin', tenant: 'acme' },
      { user: 'user-2', role: 'viewer', tenant: 'acme' },
    ];

    it('DELETEs the array of unassignments at the bulk path', async () => {
      const response = { assignments_removed: 2 };
      rest.resolveWith(response);

      const result = await permit.api.roleAssignments.bulkUnassign(payload);

      expect(result).toEqual(response);
      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.path).toBe(BULK);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  // wait-for-sync.spec.ts covers the header values through the users API; these check that
  // the role-assignments API sends them too.
  describe('waitForSync', () => {
    const assignment = { user: 'user-1', role: 'admin', tenant: 'acme' };

    it('sends X-Wait-Timeout to the PDP host from the returned client only', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });

      await proxied.permit.api.roleAssignments.waitForSync(10).assign(assignment);

      // The proxied facts client still dispatches on the REST transport, but the
      // absolute URL now targets the PDP host rather than the control-plane API.
      expect(proxied.rest.last?.method).toBe('POST');
      expect(proxied.rest.last?.origin).toBe(MOCK_PDP_ORIGIN);
      expect(proxied.rest.last?.path).toBe(COLLECTION);
      expect(proxied.rest.last?.headers.get('X-Wait-Timeout')).toBe('10');

      await proxied.permit.api.roleAssignments.assign(assignment);

      expect(proxied.rest.last?.origin).toBe(MOCK_PDP_ORIGIN);
      expect(proxied.rest.last?.headers.has('X-Wait-Timeout')).toBe(false);
    });

    it('is a no-op without proxyFactsViaPdp (returns self, no wait header)', async () => {
      const synced = permit.api.roleAssignments.waitForSync(0);
      await synced.assign(assignment);

      expect(synced).toBe(permit.api.roleAssignments);
      expect(rest.last?.origin).toBe(MOCK_API_ORIGIN);
      expect(rest.last?.headers.has('X-Wait-Timeout')).toBe(false);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 on list to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.roleAssignments.list({}).catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 404 on unassign to PermitApiError', async () => {
      rest.rejectWith(404, { message: 'assignment not found' });

      const error = await permit.api.roleAssignments
        .unassign({ user: 'user-1', role: 'admin', tenant: 'acme' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on assign to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already assigned' });

      const error = await permit.api.roleAssignments
        .assign({ user: 'user-1', role: 'admin', tenant: 'acme' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });

    it('maps a 422 on bulkAssign to PermitApiError', async () => {
      rest.rejectWith(422, { message: 'validation error' });

      const error = await permit.api.roleAssignments
        .bulkAssign([{ user: 'user-1', role: 'admin', tenant: 'acme' }])
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(422);
    });
  });
});
