import { PermitApiError } from '../../../api/base';
import {
  RoleAssignmentCreate,
  RoleAssignmentRemove,
  UserCreate,
  UserUpdate,
} from '../../../api/users';
import { Permit } from '../../../index';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// users URL is scoped under `/v2/facts/{proj}/{env}/users`.
const PROJ = 'proj';
const ENV = 'env';
const USERS = `/v2/facts/${PROJ}/${ENV}/users`;
const ROLE_ASSIGNMENTS = `/v2/facts/${PROJ}/${ENV}/role_assignments`;
const BULK_USERS = `/v2/facts/${PROJ}/${ENV}/bulk/users`;

describe('UsersApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the env-scoped collection without pagination params by default', async () => {
      rest.resolveWith({ data: [], total_count: 0, page_count: 0 });

      await permit.api.users.list();

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(USERS);
      // Unlike resources.list, users.list does not inject default page/per_page.
      expect(rest.last?.params).not.toHaveProperty('page');
      expect(rest.last?.params).not.toHaveProperty('per_page');
    });

    it('forwards search, role and pagination as wire params', async () => {
      rest.resolveWith({ data: [], total_count: 0, page_count: 0 });

      await permit.api.users.list({ search: 'bob', role: 'admin', page: 2, perPage: 5 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(USERS);
      expect(rest.last?.params).toMatchObject({
        search: 'bob',
        role: 'admin',
        page: '2',
        per_page: '5',
      });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single user with the key in the path', async () => {
      rest.resolveWith({ key: 'bob' });

      await permit.api.users.get('bob');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${USERS}/bob`);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: 'bob' });

      await permit.api.users.getByKey('bob');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${USERS}/bob`);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: 'user-1' });

      await permit.api.users.getById('user-1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${USERS}/user-1`);
    });
  });

  describe('create', () => {
    const payload: UserCreate = {
      key: 'bob',
      email: 'bob@example.com',
      first_name: 'Bob',
    };

    it('POSTs the user body to the collection', async () => {
      rest.resolveWith({ ...payload, id: 'user-1' }, 201);

      await permit.api.users.create(payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(USERS);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the user body to the keyed path', async () => {
      const body: UserUpdate = { first_name: 'Robert' };
      rest.resolveWith({ key: 'bob', first_name: 'Robert' });

      await permit.api.users.update('bob', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${USERS}/bob`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('sync', () => {
    const payload: UserCreate = { key: 'bob', email: 'bob@example.com' };

    it('PUTs the user body to the keyed path', async () => {
      rest.resolveWith({ ...payload, id: 'user-1' }, 200);

      await permit.api.users.sync(payload);

      expect(rest.last?.method).toBe('PUT');
      expect(rest.last?.url).toContain(`${USERS}/bob`);
      expect(rest.last?.data).toEqual(payload);
    });

    it('reports created=true when the API responds 201', async () => {
      rest.resolveWith({ ...payload, id: 'user-1' }, 201);

      const result = await permit.api.users.sync(payload);

      expect(result.created).toBe(true);
      expect(result.user).toMatchObject({ key: 'bob' });
    });

    it('reports created=false when the API responds 200', async () => {
      rest.resolveWith({ ...payload, id: 'user-1' }, 200);

      const result = await permit.api.users.sync(payload);

      expect(result.created).toBe(false);
      expect(result.user).toMatchObject({ key: 'bob' });
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.users.delete('bob');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${USERS}/bob`);
    });
  });

  describe('assignRole / unassignRole', () => {
    it('POSTs the assignment to the role_assignments path', async () => {
      const assignment: RoleAssignmentCreate = { user: 'bob', role: 'admin', tenant: 'acme' };
      rest.resolveWith({ ...assignment, id: 'ra-1' });

      await permit.api.users.assignRole(assignment);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(ROLE_ASSIGNMENTS);
      expect(rest.last?.data).toEqual(assignment);
    });

    it('DELETEs the removal from the role_assignments path', async () => {
      const removal: RoleAssignmentRemove = { user: 'bob', role: 'admin', tenant: 'acme' };
      rest.resolveWith({});

      await permit.api.users.unassignRole(removal);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(ROLE_ASSIGNMENTS);
      expect(rest.last?.data).toEqual(removal);
    });
  });

  describe('getAssignedRoles', () => {
    it('GETs role_assignments with default detailed/includeTotalCount/pagination flags', async () => {
      rest.resolveWith([]);

      await permit.api.users.getAssignedRoles({ user: 'bob' });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(ROLE_ASSIGNMENTS);
      expect(rest.last?.params).toMatchObject({
        user: 'bob',
        detailed: 'false',
        include_total_count: 'false',
        page: '1',
        per_page: '100',
      });
      expect(rest.last?.params).not.toHaveProperty('tenant');
    });

    it('forwards the tenant filter', async () => {
      rest.resolveWith([]);

      await permit.api.users.getAssignedRoles({ user: 'bob', tenant: 'acme' });

      expect(rest.last?.params).toMatchObject({ user: 'bob', tenant: 'acme' });
    });

    it('forwards detailed=true', async () => {
      rest.resolveWith([]);

      await permit.api.users.getAssignedRoles({ user: 'bob', detailed: true });

      expect(rest.last?.params).toMatchObject({ user: 'bob', detailed: 'true' });
    });

    it('forwards includeTotalCount and explicit pagination', async () => {
      rest.resolveWith({ data: [], total_count: 0, page_count: 0 });

      await permit.api.users.getAssignedRoles({
        user: 'bob',
        includeTotalCount: true,
        page: 3,
        perPage: 20,
      });

      expect(rest.last?.params).toMatchObject({
        user: 'bob',
        include_total_count: 'true',
        page: '3',
        per_page: '20',
      });
    });
  });

  describe('bulk operations', () => {
    const users: UserCreate[] = [
      { key: 'bob', email: 'bob@example.com' },
      { key: 'alice', email: 'alice@example.com' },
    ];

    it('POSTs bulkUserCreate with an operations envelope', async () => {
      rest.resolveWith({});

      await permit.api.users.bulkUserCreate(users);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(BULK_USERS);
      expect(rest.last?.data).toEqual({ operations: users });
    });

    it('PUTs bulkUserReplace with an operations envelope', async () => {
      rest.resolveWith({});

      await permit.api.users.bulkUserReplace(users);

      expect(rest.last?.method).toBe('PUT');
      expect(rest.last?.url).toContain(BULK_USERS);
      expect(rest.last?.data).toEqual({ operations: users });
    });

    it('DELETEs bulkUserDelete with an idents envelope', async () => {
      rest.resolveWith({});

      await permit.api.users.bulkUserDelete(['bob', 'alice']);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(BULK_USERS);
      expect(rest.last?.data).toEqual({ idents: ['bob', 'alice'] });
    });
  });

  describe('waitForSync', () => {
    it('returns the same instance and ignores the call when proxyFactsViaPdp is off', () => {
      const synced = permit.api.users.waitForSync(10);

      expect(synced).toBe(permit.api.users);
    });

    it('returns a clone that dispatches through the PDP host when proxyFactsViaPdp is on', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });

      const synced = proxied.permit.api.users.waitForSync(10);
      expect(synced).not.toBe(proxied.permit.api.users);

      proxied.rest.resolveWith({ data: [], total_count: 0, page_count: 0 });
      await synced.list();

      expect(proxied.rest.last?.method).toBe('GET');
      expect(proxied.rest.last?.url).toContain('http://localhost:7766');
      expect(proxied.rest.last?.url).toContain(USERS);
    });
  });

  describe('proxyFactsViaPdp', () => {
    it('routes facts requests through the PDP base path while still using the rest transport', async () => {
      const proxied = createMockPermit({ proxyFactsViaPdp: true });
      proxied.rest.resolveWith({ key: 'bob' });

      await proxied.permit.api.users.get('bob');

      expect(proxied.rest.last?.url).toContain('http://localhost:7766');
      expect(proxied.rest.last?.url).toContain(`${USERS}/bob`);
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.users.get('missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.users
        .create({ key: 'bob', email: 'bob@example.com' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
