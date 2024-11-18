import anyTest, { TestInterface } from 'ava';
import { UserCreate, UserRead } from '../../openapi';

import { printBreak, provideTestExecutionContext, TestContext } from '../fixtures';

const sleepTimeMs = 10000;

const test = anyTest as TestInterface<TestContext>;
test.before(provideTestExecutionContext);

test('Permission check e2e test', async (t) => {
  const permit = t.context.permit;
  const logger = t.context.logger;

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
    t.not(document, null);
    t.not(document.id, null);
    t.is(document.key, 'document');
    t.is(document.name, 'Document');
    t.is(document.description, 'google drive document');
    t.is(document.urn, 'prn:gdrive:document');
    t.is(Object.keys(document.actions ?? {}).length, 4);
    t.not((document.actions ?? {})['create'], undefined);
    t.not((document.actions ?? {})['read'], undefined);
    t.not((document.actions ?? {})['update'], undefined);
    t.not((document.actions ?? {})['delete'], undefined);

    // verify list output
    const resources = await permit.api.resources.list();
    t.true(Array.isArray(resources));
    t.is(resources.length, 1);
    t.is(resources[0].id, document.id);
    t.is(resources[0].key, document.key);
    t.is(resources[0].name, document.name);
    t.is(resources[0].description, document.description);
    t.is(resources[0].urn, document.urn);

    const resourcesWithTotalCount = await permit.api.resources.list({ includeTotalCount: true });
    t.not(resourcesWithTotalCount, null);
    t.not(resourcesWithTotalCount.data, null);
    t.is(resourcesWithTotalCount.data.length, 1);
    t.is(resourcesWithTotalCount.total_count, 1);
    t.is(resourcesWithTotalCount.page_count, 1);

    // create admin role
    const admin = await permit.api.roles.create({
      key: 'admin',
      name: 'Admin',
      description: 'an admin role',
      permissions: ['document:create', 'document:read'],
    });

    t.not(admin, null);
    t.is(admin.key, 'admin');
    t.is(admin.name, 'Admin');
    t.is(admin.description, 'an admin role');
    t.not(admin.permissions, undefined);
    t.true(admin.permissions?.includes('document:create'));
    t.true(admin.permissions?.includes('document:read'));

    // create viewer role
    const viewer = await permit.api.roles.create({
      key: 'viewer',
      name: 'Viewer',
      description: 'an viewer role',
    });

    t.not(viewer, null);
    t.is(viewer.key, 'viewer');
    t.is(viewer.name, 'Viewer');
    t.is(viewer.description, 'an viewer role');
    t.not(viewer.permissions, undefined);
    t.is(viewer.permissions?.length, 0);

    const roles = await permit.api.roles.list();
    t.true(Array.isArray(roles));
    t.is(roles.length, 2);

    // assign permissions to roles
    const assignedViewer = await permit.api.roles.assignPermissions('viewer', ['document:read']);

    t.is(assignedViewer.key, 'viewer');
    t.is(assignedViewer.permissions?.length, 1);
    t.true(assignedViewer.permissions?.includes('document:read'));
    t.false(assignedViewer.permissions?.includes('document:create'));

    // create a tenant
    const tenant = await permit.api.tenants.create({
      key: 'tesla',
      name: 'Tesla Inc',
      description: 'The car company',
    });

    t.is(tenant.key, 'tesla');
    t.is(tenant.name, 'Tesla Inc');
    t.is(tenant.description, 'The car company');
    t.is(tenant.attributes, null);

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

    t.is(user.key, 'auth0|elon');
    t.is(user.email, 'elonmusk@tesla.com');
    t.is(user.first_name, 'Elon');
    t.is(user.last_name, 'Musk');
    t.is(Object.keys(user.attributes ?? {}).length, 2);
    t.is((user.attributes as any)['age'], 50);
    t.is((user.attributes as any)['favoriteColor'], 'red');

    // assign role to user in tenant
    const ra = await permit.api.users.assignRole({
      user: user.key,
      role: viewer.key,
      tenant: tenant.key,
    });

    t.is(ra.user_id, user.id);
    t.is(ra.role_id, viewer.id);
    t.is(ra.tenant_id, tenant.id);
    t.is(ra.user, user.key);
    t.is(ra.role, viewer.key);
    t.is(ra.tenant, tenant.key);

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

    t.is(newUser.roles![0].role, viewer.key);

    logger.info(
      `sleeping ${sleepTimeMs} ms before permit.check() to make sure all writes propagated from cloud to PDP`,
    );
    await new Promise((resolve) => setTimeout(resolve, sleepTimeMs));

    // positive permission check (will be true because elon is a viewer, and a viewer can read a document)
    logger.info('testing positive permission check');
    const resourceAttributes = { secret: true };

    t.true(
      await permit.check(
        'auth0|elon',
        'read',
        // a 'document' belonging to 'tesla' (ownership based on tenant)
        { type: 'document', tenant: 'tesla', attributes: resourceAttributes },
      ),
    );

    printBreak();

    // use opa directly
    t.true(
      await permit.check(
        'auth0|elon',
        'read',
        // a 'document' belonging to 'tesla' (ownership based on tenant)
        { type: 'document', tenant: 'tesla', attributes: resourceAttributes },
        {},
        { useOpa: true },
      ),
    );

    printBreak();

    t.false(
      await permit.check(
        'auth0|elon',
        'control the usa',
        // a 'document' belonging to 'tesla' (ownership based on tenant)
        { type: 'document', tenant: 'tesla', attributes: resourceAttributes },
        {},
        { useOpa: true },
      ),
    );

    printBreak();

    logger.info('testing positive permission check with complete user object');
    t.true(await permit.check(user, 'read', { type: document.key, tenant: tenant.key }));

    printBreak();

    // use opa directly
    logger.info('testing positive permission check with complete user object');
    t.true(
      await permit.check(
        user,
        'read',
        { type: document.key, tenant: tenant.key },
        {},
        { useOpa: true },
      ),
    );

    printBreak();

    // negative permission check (will be false because a viewer cannot create a document)
    logger.info('testing negative permission check');
    t.false(await permit.check(user, 'create', { type: document.key, tenant: tenant.key }));

    printBreak();

    logger.info('testing bulk check permissions');
    const decisions = await permit.bulkCheck([
      { user: user, action: 'read', resource: { type: document.key, tenant: tenant.key } },
      { user: user, action: 'create', resource: { type: document.key, tenant: tenant.key } },
    ]);
    t.true(decisions.length === 2);
    t.true(decisions[0]);
    t.false(decisions[1]);

    logger.info('testing get user permissions matches assigned roles permissions');
    const userPermissions = await permit.getUserPermissions(user.key);
    t.true(
      `__tenant:${tenant.key}` in userPermissions,
      `tenant key not found in
      user permissions:\n${JSON.stringify(userPermissions, null, 2)}`,
    );
    viewer.permissions?.forEach((permission) => {
      t.true(userPermissions[tenant.key].permissions.includes(permission));
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

    t.is(assignedRoles.length, 1);
    t.is(assignedRoles[0].user_id, user.id);
    t.is(assignedRoles[0].role_id, admin.id);
    t.is(assignedRoles[0].tenant_id, tenant.id);

    logger.info(
      `sleeping ${sleepTimeMs} ms before permit.check() to make sure all writes propagated from cloud to PDP`,
    );
    await new Promise((resolve) => setTimeout(resolve, sleepTimeMs));

    // run the same negative permission check again, this time it's true
    logger.info('testing previously negative permission check, should now be positive');
    t.true(await permit.check(user, 'create', { type: document.key, tenant: tenant.key }));
    //t.true(await permit.check(user, 'create', { type: document.key, tenant: tenant.key }, {}, { useOpa: true}));

    printBreak();
  } catch (error) {
    logger.error(`GOT ERROR: ${error}`);
    t.fail(`got error: ${error}`);
  } finally {
    // cleanup
    try {
      await permit.api.users.delete('auth0|elon');
      await permit.api.users.delete('auth0|james');
      await permit.api.tenants.delete('tesla');
      await permit.api.roles.delete('admin');
      await permit.api.roles.delete('viewer');
      await permit.api.resources.delete('document');
      t.is((await permit.api.resources.list()).length, 0);

      const roles = await permit.api.roles.list();

      t.true(Array.isArray(roles));
      t.is(roles.length, 0);

      t.is((await permit.api.tenants.list()).length, 1); // the default tenant
      t.is((await permit.api.users.list()).data.length, 0);
    } catch (error) {
      logger.error(`GOT ERROR: ${error}`);
      t.fail(`got error: ${error}`);
    }
  }
});
