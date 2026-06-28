import { PermitApiError } from '../../../api/base';
import { RoleAssignmentCreate, RoleAssignmentRemove } from '../../../api/role-assignments';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// role-assignments URL is scoped under `/v2/facts/{proj}/{env}/role_assignments`.
const PROJ = 'proj';
const ENV = 'env';
const COLLECTION = `/v2/facts/${PROJ}/${ENV}/role_assignments`;
const BULK = `${COLLECTION}/bulk`;

// waitForSync reads the X-Wait-Timeout header off a cloned client's openapi
// config (see wait-for-sync.spec.ts); this shape exposes that protected member.
interface ApiWithConfig {
  openapiClientConfig: { basePath?: string; baseOptions: { headers: Record<string, string> } };
}

function headersOf(api: unknown): Record<string, string> {
  return (api as unknown as ApiWithConfig).openapiClientConfig.baseOptions.headers;
}

describe('RoleAssignmentsApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection with default pagination', async () => {
      rest.resolveWith([]);

      await permit.api.roleAssignments.list({});

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
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
      expect(rest.last?.params).toMatchObject({
        user: 'user-1',
        role: 'admin',
        tenant: 'acme',
        resource_instance: 'document:readme',
      });
    });

    it('forwards page, perPage and includeTotalCount as wire params', async () => {
      rest.resolveWith({ data: [], total_count: 0, page_count: 0 });

      await permit.api.roleAssignments.list({ page: 2, perPage: 5, includeTotalCount: true });

      expect(rest.last?.params).toMatchObject({
        page: '2',
        per_page: '5',
        include_total_count: 'true',
      });
    });

    it('forwards the detailed flag as a wire param', async () => {
      rest.resolveWith([]);

      await permit.api.roleAssignments.list({ detailed: true });

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
      rest.resolveWith({ ...payload, id: 'ra-1' });

      await permit.api.roleAssignments.assign(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.url).not.toContain('/bulk');
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
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.url).not.toContain('/bulk');
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('bulkAssign', () => {
    const payload: RoleAssignmentCreate[] = [
      { user: 'user-1', role: 'admin', tenant: 'acme' },
      { user: 'user-2', role: 'viewer', tenant: 'acme' },
    ];

    it('POSTs the array of assignments to the bulk path', async () => {
      rest.resolveWith({ assignments: [] });

      await permit.api.roleAssignments.bulkAssign(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(BULK);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('bulkUnassign', () => {
    const payload: RoleAssignmentRemove[] = [
      { user: 'user-1', role: 'admin', tenant: 'acme' },
      { user: 'user-2', role: 'viewer', tenant: 'acme' },
    ];

    it('DELETEs the array of unassignments at the bulk path', async () => {
      rest.resolveWith({ assignments: [] });

      await permit.api.roleAssignments.bulkUnassign(payload);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(BULK);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('waitForSync', () => {
    it('clones the client with X-Wait-Timeout and routes facts through the PDP host', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      const synced = proxied.permit.api.roleAssignments.waitForSync(10);

      // A distinct clone carries the wait header; the original is untouched.
      expect(synced).not.toBe(proxied.permit.api.roleAssignments);
      expect(headersOf(synced)['X-Wait-Timeout']).toBe('10');
      expect(headersOf(proxied.permit.api.roleAssignments)['X-Wait-Timeout']).toBeUndefined();

      // The proxied facts client still dispatches on the REST transport, but the
      // absolute URL now targets the PDP host rather than the control-plane API.
      proxied.rest.resolveWith({ id: 'ra-1' });
      await synced.assign({ user: 'user-1', role: 'admin', tenant: 'acme' });

      expect(proxied.rest.last?.method).toBe('POST');
      expect(proxied.rest.last?.url).toContain('http://localhost:7766');
      expect(proxied.rest.last?.url).toContain(COLLECTION);
    });

    it('is a no-op without proxyFactsViaPdp (returns self, no wait header)', () => {
      const synced = permit.api.roleAssignments.waitForSync(0);

      expect(synced).toBe(permit.api.roleAssignments);
      expect(headersOf(synced)['X-Wait-Timeout']).toBeUndefined();
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
