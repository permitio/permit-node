import pino from 'pino';

import { IPermitClient } from '../../index';
import { UserRead } from '../../openapi';
import { createTestClient, printBreak } from '../fixtures';
import { waitForCheck } from '../helpers/wait-for';

let permit: IPermitClient;
let logger: pino.Logger;

beforeAll(() => {
  ({ permit, logger } = createTestClient());
});

it('Permission check e2e test', async () => {
  try {
    logger.info('initial setup of objects');
    const document = await permit.api.resources.create({
      key: 'document',
      name: 'Document',
      urn: 'prn:gdrive:document',
      description: 'google drive document',
      actions: {
        create: {},
        read: {},
        update: {},
        delete: {},
      },
      attributes: {
        private: {
          type: 'bool',
          description: 'whether the document is private',
        },
      },
    });

    // verify create output
    expect(document).not.toBe(null);
    expect(document.id).not.toBe(null);
    expect(document.key).toBe('document');
    expect(document.name).toBe('Document');
    expect(document.description).toBe('google drive document');
    expect(document.urn).toBe('prn:gdrive:document');
    expect(Object.keys(document.actions ?? {}).length).toBe(4);
    expect((document.actions ?? {})['create']).not.toBe(undefined);
    expect((document.actions ?? {})['read']).not.toBe(undefined);
    expect((document.actions ?? {})['update']).not.toBe(undefined);
    expect((document.actions ?? {})['delete']).not.toBe(undefined);

    // verify list output
    const resources = await permit.api.resources.list();
    expect(Array.isArray(resources)).toBe(true);
    expect(resources.length).toBe(1);
    expect(resources[0].id).toBe(document.id);
    expect(resources[0].key).toBe(document.key);
    expect(resources[0].name).toBe(document.name);
    expect(resources[0].description).toBe(document.description);
    expect(resources[0].urn).toBe(document.urn);

    const resourcesWithTotalCount = await permit.api.resources.list({ includeTotalCount: true });
    expect(resourcesWithTotalCount).not.toBe(null);
    expect(resourcesWithTotalCount.data).not.toBe(null);
    expect(resourcesWithTotalCount.data.length).toBe(1);
    expect(resourcesWithTotalCount.total_count).toBe(1);
    expect(resourcesWithTotalCount.page_count).toBe(1);

    // create admin role
    const admin = await permit.api.roles.create({
      key: 'admin',
      name: 'Admin',
      description: 'an admin role',
      permissions: ['document:create', 'document:read'],
    });

    expect(admin).not.toBe(null);
    expect(admin.key).toBe('admin');
    expect(admin.name).toBe('Admin');
    expect(admin.description).toBe('an admin role');
    expect(admin.permissions).not.toBe(undefined);
    expect(admin.permissions?.includes('document:create')).toBe(true);
    expect(admin.permissions?.includes('document:read')).toBe(true);

    // create viewer role
    const viewer = await permit.api.roles.create({
      key: 'viewer',
      name: 'Viewer',
      description: 'an viewer role',
    });

    expect(viewer).not.toBe(null);
    expect(viewer.key).toBe('viewer');
    expect(viewer.name).toBe('Viewer');
    expect(viewer.description).toBe('an viewer role');
    expect(viewer.permissions).not.toBe(undefined);
    expect(viewer.permissions?.length).toBe(0);

    const roles = await permit.api.roles.list();
    expect(Array.isArray(roles)).toBe(true);
    expect(roles.length).toBe(2);

    // assign permissions to roles
    const assignedViewer = await permit.api.roles.assignPermissions('viewer', ['document:read']);

    expect(assignedViewer.key).toBe('viewer');
    expect(assignedViewer.permissions?.length).toBe(1);
    expect(assignedViewer.permissions?.includes('document:read')).toBe(true);
    expect(assignedViewer.permissions?.includes('document:create')).toBe(false);

    // create a tenant
    const tenant = await permit.api.tenants.create({
      key: 'tesla',
      name: 'Tesla Inc',
      description: 'The car company',
    });

    expect(tenant.key).toBe('tesla');
    expect(tenant.name).toBe('Tesla Inc');
    expect(tenant.description).toBe('The car company');
    expect(tenant.attributes).toBe(null);

    // create a user
    const { user } = await permit.api.users.sync({
      key: 'auth0|elon',
      email: 'elonmusk@tesla.com',
      first_name: 'Elon',
      last_name: 'Musk',
      attributes: {
        age: 50,
        favoriteColor: 'red',
      },
    });

    expect(user.key).toBe('auth0|elon');
    expect(user.email).toBe('elonmusk@tesla.com');
    expect(user.first_name).toBe('Elon');
    expect(user.last_name).toBe('Musk');
    expect(Object.keys(user.attributes ?? {}).length).toBe(2);
    expect((user.attributes as any)['age']).toBe(50);
    expect((user.attributes as any)['favoriteColor']).toBe('red');

    // assign role to user in tenant
    const ra = await permit.api.users.assignRole({
      user: user.key,
      role: viewer.key,
      tenant: tenant.key,
    });

    expect(ra.user_id).toBe(user.id);
    expect(ra.role_id).toBe(viewer.id);
    expect(ra.tenant_id).toBe(tenant.id);
    expect(ra.user).toBe(user.key);
    expect(ra.role).toBe(viewer.key);
    expect(ra.tenant).toBe(tenant.key);

    // create a user
    const newUser: UserRead = await permit.api.users.create({
      key: 'auth0|james',
      email: 'james@undos.com',
      first_name: 'James',
      last_name: 'Undos',
      attributes: {
        age: 50,
        favoriteColor: 'red',
      },
      role_assignments: [
        {
          role: viewer.key,
          tenant: tenant.key,
        },
      ],
    });

    expect(newUser.roles?.[0]?.role).toBe(viewer.key);

    const resourceAttributes = { secret: true };

    // wait for the writes above to propagate from cloud to PDP
    await waitForCheck(
      () =>
        permit.check('auth0|elon', 'read', {
          type: 'document',
          tenant: 'tesla',
          attributes: resourceAttributes,
        }),
      true,
    );

    // positive permission check (will be true because elon is a viewer, and a viewer can read a document)
    logger.info('testing positive permission check');

    expect(
      await permit.check(
        'auth0|elon',
        'read',
        // a 'document' belonging to 'tesla' (ownership based on tenant)
        { type: 'document', tenant: 'tesla', attributes: resourceAttributes },
      ),
    ).toBe(true);

    printBreak();

    // use opa directly
    expect(
      await permit.check(
        'auth0|elon',
        'read',
        // a 'document' belonging to 'tesla' (ownership based on tenant)
        { type: 'document', tenant: 'tesla', attributes: resourceAttributes },
        {},
        { useOpa: true },
      ),
    ).toBe(true);

    printBreak();

    expect(
      await permit.check(
        'auth0|elon',
        'control the usa',
        // a 'document' belonging to 'tesla' (ownership based on tenant)
        { type: 'document', tenant: 'tesla', attributes: resourceAttributes },
        {},
        { useOpa: true },
      ),
    ).toBe(false);

    printBreak();

    logger.info('testing positive permission check with complete user object');
    expect(await permit.check(user, 'read', { type: document.key, tenant: tenant.key })).toBe(true);

    printBreak();

    // use opa directly
    logger.info('testing positive permission check with complete user object');
    expect(
      await permit.check(
        user,
        'read',
        { type: document.key, tenant: tenant.key },
        {},
        { useOpa: true },
      ),
    ).toBe(true);

    printBreak();

    // negative permission check (will be false because a viewer cannot create a document)
    logger.info('testing negative permission check');
    expect(await permit.check(user, 'create', { type: document.key, tenant: tenant.key })).toBe(
      false,
    );

    printBreak();

    logger.info('testing bulk check permissions');
    const decisions = await permit.bulkCheck([
      { user: user, action: 'read', resource: { type: document.key, tenant: tenant.key } },
      { user: user, action: 'create', resource: { type: document.key, tenant: tenant.key } },
    ]);
    expect(decisions.length === 2).toBe(true);
    expect(decisions[0]).toBe(true);
    expect(decisions[1]).toBe(false);

    logger.info('testing get user permissions matches assigned roles permissions');
    const userPermissions = await permit.getUserPermissions(user.key);
    expect(`__tenant:${tenant.key}` in userPermissions).toBe(true);
    viewer.permissions?.forEach((permission) => {
      expect(userPermissions[tenant.key].permissions.includes(permission)).toBe(true);
    });

    logger.info('changing the user roles');

    // change the user role - assign admin role
    await permit.api.users.assignRole({
      user: user.key,
      role: admin.key,
      tenant: tenant.key,
    });
    // change the user role - remove viewer role
    await permit.api.users.unassignRole({
      user: user.key,
      role: viewer.key,
      tenant: tenant.key,
    });

    // list user roles in all tenants
    const assignedRoles = await permit.api.users.getAssignedRoles({ user: user.key });

    expect(assignedRoles.length).toBe(1);
    expect(assignedRoles[0].user_id).toBe(user.id);
    expect(assignedRoles[0].role_id).toBe(admin.id);
    expect(assignedRoles[0].tenant_id).toBe(tenant.id);

    // wait for the role swap above to propagate from cloud to PDP
    await waitForCheck(
      () => permit.check(user, 'create', { type: document.key, tenant: tenant.key }),
      true,
    );

    // run the same negative permission check again, this time it's true
    logger.info('testing previously negative permission check, should now be positive');
    expect(await permit.check(user, 'create', { type: document.key, tenant: tenant.key })).toBe(
      true,
    );
    //use opa directly
    expect(
      await permit.check(
        user,
        'create',
        { type: document.key, tenant: tenant.key },
        {},
        { useOpa: true },
      ),
    ).toBe(true);

    printBreak();
  } finally {
    // Leave the shared env empty for the next spec. Each delete is tolerant so a
    // missing entity (e.g. the body threw before creating it) neither throws nor
    // masks the original failure; the assertions below then confirm the env is
    // clean. Deleting the resource cascades to its instances and assignments.
    await permit.api.users.delete('auth0|elon').catch(() => undefined);
    await permit.api.users.delete('auth0|james').catch(() => undefined);
    await permit.api.tenants.delete('tesla').catch(() => undefined);
    await permit.api.roles.delete('admin').catch(() => undefined);
    await permit.api.roles.delete('viewer').catch(() => undefined);
    await permit.api.resources.delete('document').catch(() => undefined);
    expect((await permit.api.resources.list()).length).toBe(0);

    const roles = await permit.api.roles.list();

    expect(Array.isArray(roles)).toBe(true);
    expect(roles.length).toBe(0);

    expect((await permit.api.tenants.list()).length).toBe(1); // the default tenant
    expect((await permit.api.users.list()).data.length).toBe(0);
  }
});
