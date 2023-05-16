import anyTest, { TestInterface } from 'ava';

import { Permit } from './index';
import { IPermitClient } from './index';

const test = anyTest as TestInterface<{ permit: IPermitClient }>;

test.before((t) => {
  // config
  const defaultPDPAddress: string =
    process.env.CLOUD_PDP === 'true' ? 'https://cloudpdp.api.permit.io' : 'http://localhost:7766';
  const defaultApiAddress: string =
    process.env.API_TIER === 'prod' ? 'https://api.permit.io' : 'http://localhost:8000';

  const token: string = process.env.PDP_API_KEY || '';
  const pdpAddress: string = process.env.PDP_URL || defaultPDPAddress;
  const apiUrl = process.env.PDP_CONTROL_PLANE || defaultApiAddress;

  if (!token) {
    t.fail('Permit API Key is not configured, test cannot run!');
  }

  t.context.permit = new Permit({
    token,
    pdp: pdpAddress,
    apiUrl,
  });
});

test('Permission check e2e test', async (t) => {
  const permit = t.context.permit;

  try {
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
    t.is(resources.length, 1);
    t.is(resources[0].id, document.id);
    t.is(resources[0].key, document.key);
    t.is(resources[0].name, document.name);
    t.is(resources[0].description, document.description);
    t.is(resources[0].urn, document.urn);

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
      permissions: ['document:create', 'document:read'],
    });

    t.not(viewer, null);
    t.is(viewer.key, 'viewer');
    t.is(viewer.name, 'Viewer');
    t.is(viewer.description, 'an viewer role');
    t.not(viewer.permissions, undefined);
    t.is(viewer.permissions?.length, 0);

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
    t.is(tenant.attributes, undefined);

    // create a user
    const { user, created } = await permit.api.users.sync({
      key: 'auth0|elon',
      email: 'elonmusk@tesla.com',
      first_name: 'Elon',
      last_name: 'Musk',
      attributes: {
        age: 50,
        favoriteColor: 'red',
      },
    });

    t.true(created);
    t.is(user.key, 'auth0|elon');
    t.is(user.email, 'elonmusk@tesla.com');
    t.is(user.first_name, 'Elon');
    t.is(user.last_name, 'Musk');
    t.is(Object.keys(user.attributes ?? {}).length, 2);
    t.is((user.attributes as any)['age'], 50);
    t.is((user.attributes as any)['favoriteColor'], 'red');

    // assign role to user in tenant
    const ra = await permit.api.users.assignRole({
      user: 'auth0|elon',
      role: 'viewer',
      tenant: 'tesla',
    });

    t.is(ra.user_id, user.id);
    t.is(ra.role_id, viewer.id);
    t.is(ra.tenant_id, tenant.id);
    t.is(ra.user, user.key);
    t.is(ra.role, viewer.key);
    t.is(ra.tenant, tenant.key);

    console.info(
      'sleeping 2 seconds before permit.check() to make sure all writes propagated from cloud to PDP',
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // positive permission check (will be true because elon is a viewer, and a viewer can read a document)
    console.info('testing positive permission check');
    const resourceAttributes = { secret: true };

    t.true(
      permit.check(
        'auth0|elon',
        'read',
        // a 'document' belonging to 'tesla' (ownership based on tenant)
        { type: 'document', tenant: 'tesla', attributes: resourceAttributes },
      ),
    );

    console.info('testing positive permission check with complete user object');
    t.true(permit.check(user, 'read', { type: document.key, tenant: tenant.key }));

    // negative permission check (will be false because a viewer cannot create a document)
    console.info('testing negative permission check');
    t.false(permit.check(user, 'create', { type: document.key, tenant: tenant.key }));

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

    console.info(
      'sleeping 2 seconds before permit.check() to make sure all writes propagated from cloud to PDP',
    );
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // run the same negative permission check again, this time it's true
    console.info('testing previously negative permission check, should now be positive');
    t.true(permit.check(user, 'create', { type: document.key, tenant: tenant.key }));
  } catch (error) {
    t.fail(`got error: ${error}`);
  } finally {
    // cleanup
    try {
      await permit.api.users.delete('auth0|elon');
      await permit.api.tenants.delete('tesla');
      await permit.api.roles.delete('admin');
      await permit.api.roles.delete('viewer');
      await permit.api.resources.delete('document');
      t.is((await permit.api.resources.list()).length, 0);
      t.is((await permit.api.roles.list()).length, 0);
      t.is((await permit.api.tenants.list()).length, 1); // the default tenant
      t.is((await permit.api.users.list()).data.length, 0);
    } catch (error) {
      t.fail(`got error: ${error}`);
    }
  }

  // code example:
  // const [user, created] = await permit.api.createUser({
  //   key: 'asaf@permit.io',
  //   attributes: { name: 'asaf', age: '35' },
  // });

  // permit.resource({
  //   name: 'task',
  //   description: 'Todo Task',
  //   type: 'rest',
  //   path: '/api/v1/boards/:listId/tasks',
  //   actions: [
  //     permit.action({
  //       name: 'list',
  //       title: 'List',
  //       description: 'list all tasks',
  //       path: '/api/v1/boards/:listId/tasks',
  //       attributes: {
  //         verb: 'GET',
  //       },
  //     }),
  //     permit.action({
  //       name: 'retrieve',
  //       title: 'Retrieve',
  //       description: 'Retrieve task details',
  //       path: '/api/v1/boards/:listId/tasks/:taskId',
  //       attributes: {
  //         verb: 'GET',
  //       },
  //     }),
  //   ],
  // });

  // await permit.write(
  //   permit.api.createTenant({ key: 'tenant1', name: 'My First Tenant' }),
  //   permit.api.assignRole('mysuperid', 'Admin', 'tenant1'),
  // );

  // TODO: when we support zanzibar
  // await permit.write(
  //   permit.relationships({
  //     tuples: [
  //       { user: 'alice', relation: 'reader', object: 'document:A'},
  //       { user: 'bob', relation: 'reader', object: 'document:B'},
  //       { user: 'charlie', relation: 'reader', object: 'document:C'},
  //     ]
  //   })
  // );

  // const context = permit.getUrlContext("/api/v1/boards/b1/tasks/t1", "GET");
  // if (!context) {
  //   return;
  // }
  // const { resource, action } = context;

  // permit.check({ key: "u1" }, action, resource);

  // permit.save((api: IPermitCloudMutations): Promise<any> => {
  //   return Promise.all([
  //     api.createTenant({key: "teannt1", name: "Ten 1"}),
  //     api.assignRole("uk", "admin", "tk"),
  //   ]);
  // });

  // t.is(resourceRegistry.paths.length, 2);
  // const result = resourceRegistry.getResourceAndActionFromRequestParams("/api/v1/boards/2/tasks/25");
  // t.is(result?.resource.name, 'task');
  // t.is(result?.resource.context['listId'], '2');
  // t.is(result?.resource.context['taskId'], '25');
});
