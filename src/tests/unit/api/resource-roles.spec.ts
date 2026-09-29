import { PermitApiError } from '../../../api/base';
import { ResourceRoleCreate, ResourceRoleUpdate } from '../../../api/resource-roles';
import { Permit } from '../../../index';
import {
  DerivedRoleRuleCreate,
  DerivedRoleRuleDelete,
  PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings,
} from '../../../openapi';
import { createMockPermit, MockTransport } from '../../helpers/mock-api';

// The mock seeds an environment-level context with these defaults, so every
// resource-role URL is scoped under
// `/v2/schema/{proj}/{env}/resources/{resourceKey}/roles`.
const PROJ = 'proj';
const ENV = 'env';
const RESOURCE = 'doc';
const COLLECTION = `/v2/schema/${PROJ}/${ENV}/resources/${RESOURCE}/roles`;

describe('ResourceRolesApi (unit)', () => {
  let permit: Permit;
  let rest: MockTransport;

  beforeEach(() => {
    ({ permit, rest } = createMockPermit());
  });

  describe('list', () => {
    it('GETs the resource-scoped collection with default pagination', async () => {
      rest.resolveWith([]);

      await permit.api.resourceRoles.list({ resourceKey: RESOURCE });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '1', per_page: '100' });
    });

    it('forwards page and perPage as wire params', async () => {
      rest.resolveWith([]);

      await permit.api.resourceRoles.list({ resourceKey: RESOURCE, page: 2, perPage: 10 });

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.params).toMatchObject({ page: '2', per_page: '10' });
    });
  });

  describe('get / getByKey / getById', () => {
    it('GETs a single resource role with both keys in the path', async () => {
      rest.resolveWith({ key: 'editor' });

      await permit.api.resourceRoles.get(RESOURCE, 'editor');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/editor`);
    });

    it('getByKey is an alias for get', async () => {
      rest.resolveWith({ key: 'editor' });

      await permit.api.resourceRoles.getByKey(RESOURCE, 'editor');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/editor`);
    });

    it('getById is an alias for get', async () => {
      rest.resolveWith({ key: 'role-1' });

      await permit.api.resourceRoles.getById(RESOURCE, 'role-1');

      expect(rest.last?.method).toBe('GET');
      expect(rest.last?.url).toContain(`${COLLECTION}/role-1`);
    });
  });

  describe('create', () => {
    const payload: ResourceRoleCreate = {
      key: 'editor',
      name: 'Editor',
      permissions: ['read', 'write'],
    };

    it('POSTs the role body to the resource-scoped collection', async () => {
      rest.resolveWith({ ...payload, id: 'role-1' });

      await permit.api.resourceRoles.create(RESOURCE, payload);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(COLLECTION);
      expect(rest.last?.data).toEqual(payload);
    });
  });

  describe('update', () => {
    it('PATCHes the role body to the keyed path', async () => {
      const body: ResourceRoleUpdate = { name: 'Renamed' };
      rest.resolveWith({ key: 'editor', name: 'Renamed' });

      await permit.api.resourceRoles.update(RESOURCE, 'editor', body);

      expect(rest.last?.method).toBe('PATCH');
      expect(rest.last?.url).toContain(`${COLLECTION}/editor`);
      expect(rest.last?.data).toEqual(body);
    });
  });

  describe('delete', () => {
    it('DELETEs the keyed path', async () => {
      rest.resolveWith({});

      await permit.api.resourceRoles.delete(RESOURCE, 'editor');

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/editor`);
    });
  });

  describe('assignPermissions', () => {
    it('POSTs the permissions body to the role permissions path', async () => {
      const permissions = ['doc:read', 'doc:write'];
      rest.resolveWith({ key: 'editor' });

      await permit.api.resourceRoles.assignPermissions(RESOURCE, 'editor', permissions);

      expect(rest.last?.method).toBe('POST');
      expect(rest.last?.url).toContain(`${COLLECTION}/editor/permissions`);
      expect(rest.last?.data).toEqual({ permissions });
    });
  });

  describe('removePermissions', () => {
    it('DELETEs the permissions body from the role permissions path', async () => {
      const permissions = ['doc:write'];
      rest.resolveWith({ key: 'editor' });

      await permit.api.resourceRoles.removePermissions(RESOURCE, 'editor', permissions);

      expect(rest.last?.method).toBe('DELETE');
      expect(rest.last?.url).toContain(`${COLLECTION}/editor/permissions`);
      expect(rest.last?.data).toEqual({ permissions });
    });
  });

  // The role-derivation methods delegate to a different generated client
  // (`ImplicitGrantsApi`), which builds an `.../roles/{roleKey}/implicit_grants`
  // path under the same project/environment scope.
  describe('role derivation (implicit grants)', () => {
    const DERIVATION = `${COLLECTION}/editor/implicit_grants`;

    describe('createRoleDerivation', () => {
      const rule: DerivedRoleRuleCreate = {
        role: 'viewer',
        on_resource: 'folder',
        linked_by_relation: 'parent',
      };

      it('POSTs the derivation rule to the role implicit-grants path', async () => {
        rest.resolveWith({ ...rule });

        await permit.api.resourceRoles.createRoleDerivation(RESOURCE, 'editor', rule);

        expect(rest.last?.method).toBe('POST');
        expect(rest.last?.url).toContain(DERIVATION);
        expect(rest.last?.data).toEqual(rule);
      });

      it('maps a 404 to PermitApiError', async () => {
        rest.rejectWith(404, { message: 'not found' });

        const error = await permit.api.resourceRoles
          .createRoleDerivation(RESOURCE, 'editor', rule)
          .catch((err) => err);

        expect(error).toBeInstanceOf(PermitApiError);
        expect(error.response?.status).toBe(404);
      });

      it('maps a 409 conflict to PermitApiError', async () => {
        rest.rejectWith(409, { message: 'already exists' });

        const error = await permit.api.resourceRoles
          .createRoleDerivation(RESOURCE, 'editor', rule)
          .catch((err) => err);

        expect(error).toBeInstanceOf(PermitApiError);
        expect(error.response?.status).toBe(409);
      });
    });

    describe('deleteRoleDerivation', () => {
      const rule: DerivedRoleRuleDelete = {
        role: 'viewer',
        on_resource: 'folder',
        linked_by_relation: 'parent',
      };

      it('DELETEs the derivation rule from the role implicit-grants path', async () => {
        rest.resolveWith({});

        await permit.api.resourceRoles.deleteRoleDerivation(RESOURCE, 'editor', rule);

        expect(rest.last?.method).toBe('DELETE');
        expect(rest.last?.url).toContain(DERIVATION);
        expect(rest.last?.data).toEqual(rule);
      });

      it('maps a 404 to PermitApiError', async () => {
        rest.rejectWith(404, { message: 'not found' });

        const error = await permit.api.resourceRoles
          .deleteRoleDerivation(RESOURCE, 'editor', rule)
          .catch((err) => err);

        expect(error).toBeInstanceOf(PermitApiError);
        expect(error.response?.status).toBe(404);
      });
    });

    describe('updateRoleDerivationConditions', () => {
      const conditions: PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings = {
        no_direct_roles_on_object: true,
      };

      it('PUTs the conditions to the implicit-grants conditions path', async () => {
        rest.resolveWith({ ...conditions });

        await permit.api.resourceRoles.updateRoleDerivationConditions(
          RESOURCE,
          'editor',
          conditions,
        );

        expect(rest.last?.method).toBe('PUT');
        expect(rest.last?.url).toContain(`${DERIVATION}/conditions`);
        expect(rest.last?.data).toEqual(conditions);
      });

      it('maps a 404 to PermitApiError', async () => {
        rest.rejectWith(404, { message: 'not found' });

        const error = await permit.api.resourceRoles
          .updateRoleDerivationConditions(RESOURCE, 'editor', conditions)
          .catch((err) => err);

        expect(error).toBeInstanceOf(PermitApiError);
        expect(error.response?.status).toBe(404);
      });
    });
  });

  describe('error mapping', () => {
    it('maps a 404 to PermitApiError carrying the upstream response', async () => {
      rest.rejectWith(404, { message: 'not found' });

      const error = await permit.api.resourceRoles.get(RESOURCE, 'missing').catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(404);
    });

    it('maps a 409 conflict on create to PermitApiError', async () => {
      rest.rejectWith(409, { message: 'already exists' });

      const error = await permit.api.resourceRoles
        .create(RESOURCE, { key: 'editor', name: 'Editor' })
        .catch((err) => err);

      expect(error).toBeInstanceOf(PermitApiError);
      expect(error.response?.status).toBe(409);
    });
  });
});
