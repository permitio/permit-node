import pino from 'pino';

import { IPermitClient } from '../../index';
import { UserRead } from '../../openapi';
import { cleanUp, createTestClient, expectNotFound } from '../fixtures';
import { waitFor, waitForCheck } from '../helpers/wait-for';

// Direct-OPA (`useOpa`) checks need the PDP's OPA port (8181) reachable on the PDP_URL host.
// They run in their own test, which is reported as skipped unless PERMIT_RUN_OPA_E2E=true.
const RUN_OPA_E2E = process.env.PERMIT_RUN_OPA_E2E === 'true';

// Keys unique to this run, so entities left by another spec or an earlier run can't change the
// results, and the assertions below look only at what this spec created.
const RUN_ID = `${process.pid}_${Date.now()}`;
const DOCUMENT = `rbac_document_${RUN_ID}`;
const ADMIN = `rbac_admin_${RUN_ID}`;
const VIEWER = `rbac_viewer_${RUN_ID}`;
const TENANT = `rbac_tesla_${RUN_ID}`;
const ELON = `auth0|elon_${RUN_ID}`;
const JAMES = `auth0|james_${RUN_ID}`;

// The main test's propagation waits all draw on this budget, so together they end inside the
// project's 300s test timeout, leaving time for the API calls around them.
const WAIT_BUDGET_MS = 240_000;

const documentInTenant = { type: DOCUMENT, tenant: TENANT };

let permit: IPermitClient;
let logger: pino.Logger;

beforeAll(() => {
  ({ permit, logger } = createTestClient());
});

afterAll(async () => {
  if (!permit) return; // beforeAll never initialized the client (e.g. missing key)
  // Deleting the users and the tenant removes their role assignments; deleting the resource
  // removes its permissions from the roles.
  await cleanUp({
    [`user ${ELON}`]: () => permit.api.users.delete(ELON),
    [`user ${JAMES}`]: () => permit.api.users.delete(JAMES),
    [`tenant ${TENANT}`]: () => permit.api.tenants.delete(TENANT),
    [`role ${ADMIN}`]: () => permit.api.roles.delete(ADMIN),
    [`role ${VIEWER}`]: () => permit.api.roles.delete(VIEWER),
    [`resource ${DOCUMENT}`]: () => permit.api.resources.delete(DOCUMENT),
  });
  await expectNotFound(permit.api.users.get(ELON), `user ${ELON}`);
  await expectNotFound(permit.api.users.get(JAMES), `user ${JAMES}`);
  await expectNotFound(permit.api.tenants.get(TENANT), `tenant ${TENANT}`);
  await expectNotFound(permit.api.roles.get(ADMIN), `role ${ADMIN}`);
  await expectNotFound(permit.api.roles.get(VIEWER), `role ${VIEWER}`);
  await expectNotFound(permit.api.resources.get(DOCUMENT), `resource ${DOCUMENT}`);
});

it('Permission check e2e test', async () => {
  const deadline = Date.now() + WAIT_BUDGET_MS;
  const remainingBudget = () => ({ timeoutMs: Math.max(0, deadline - Date.now()) });

  logger.info('initial setup of objects');
  const document = await permit.api.resources.create({
    key: DOCUMENT,
    name: 'Document',
    urn: `prn:gdrive:${DOCUMENT}`,
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
  expect(document.id).toBeTruthy();
  expect(document.key).toBe(DOCUMENT);
  expect(document.name).toBe('Document');
  expect(document.description).toBe('google drive document');
  expect(document.urn).toBe(`prn:gdrive:${DOCUMENT}`);
  expect(Object.keys(document.actions ?? {}).sort()).toEqual([
    'create',
    'delete',
    'read',
    'update',
  ]);

  // verify list output
  const resources = await permit.api.resources.list();
  expect(resources.filter((resource) => resource.key === DOCUMENT)).toEqual([
    expect.objectContaining({
      id: document.id,
      key: document.key,
      name: document.name,
      description: document.description,
      urn: document.urn,
    }),
  ]);

  const resourcesWithTotalCount = await permit.api.resources.list({ includeTotalCount: true });
  expect(resourcesWithTotalCount.data.map((resource) => resource.key)).toContain(DOCUMENT);
  expect(resourcesWithTotalCount.total_count).toBeGreaterThanOrEqual(
    resourcesWithTotalCount.data.length,
  );
  // resources.list() asks for 100 resources per page by default
  expect(resourcesWithTotalCount.page_count).toBe(
    Math.ceil(resourcesWithTotalCount.total_count / 100),
  );

  // create admin role
  const admin = await permit.api.roles.create({
    key: ADMIN,
    name: 'Admin',
    description: 'an admin role',
    permissions: [`${DOCUMENT}:create`, `${DOCUMENT}:read`],
  });

  expect(admin.key).toBe(ADMIN);
  expect(admin.name).toBe('Admin');
  expect(admin.description).toBe('an admin role');
  expect(admin.permissions).toEqual(
    expect.arrayContaining([`${DOCUMENT}:create`, `${DOCUMENT}:read`]),
  );

  // create viewer role
  const viewer = await permit.api.roles.create({
    key: VIEWER,
    name: 'Viewer',
    description: 'an viewer role',
  });

  expect(viewer.key).toBe(VIEWER);
  expect(viewer.name).toBe('Viewer');
  expect(viewer.description).toBe('an viewer role');
  expect(viewer.permissions).toEqual([]);

  const roles = await permit.api.roles.list();
  expect(roles.map((role) => role.key)).toEqual(expect.arrayContaining([ADMIN, VIEWER]));

  // assign permissions to roles
  const assignedViewer = await permit.api.roles.assignPermissions(VIEWER, [`${DOCUMENT}:read`]);

  expect(assignedViewer.key).toBe(VIEWER);
  expect(assignedViewer.permissions).toEqual([`${DOCUMENT}:read`]);

  // create a tenant
  const tenant = await permit.api.tenants.create({
    key: TENANT,
    name: 'Tesla Inc',
    description: 'The car company',
  });

  expect(tenant.key).toBe(TENANT);
  expect(tenant.name).toBe('Tesla Inc');
  expect(tenant.description).toBe('The car company');
  expect(tenant.attributes).toBe(null);

  // create a user
  const { user } = await permit.api.users.sync({
    key: ELON,
    email: 'elonmusk@tesla.com',
    first_name: 'Elon',
    last_name: 'Musk',
    attributes: {
      age: 50,
      favoriteColor: 'red',
    },
  });

  expect(user.key).toBe(ELON);
  expect(user.email).toBe('elonmusk@tesla.com');
  expect(user.first_name).toBe('Elon');
  expect(user.last_name).toBe('Musk');
  expect(user.attributes).toEqual({ age: 50, favoriteColor: 'red' });

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
    key: JAMES,
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

  // Positive permission check (elon is a viewer, and a viewer can read a document). It is polled
  // until the writes above have propagated from the cloud to the PDP.
  logger.info('testing positive permission check');
  await waitForCheck(
    () =>
      permit.check(ELON, 'read', {
        ...documentInTenant,
        attributes: { secret: true },
      }),
    true,
    remainingBudget(),
  );

  logger.info('testing positive permission check with complete user object');
  // Gate on the complete-user object's read propagating before the multi-result
  // reads below (bulkCheck / getUserPermissions), which query separate PDP
  // endpoints that can lag behind a single check.
  await waitForCheck(() => permit.check(user, 'read', documentInTenant), true, remainingBudget());

  // negative permission check (will be false because a viewer cannot create a document)
  logger.info('testing negative permission check');
  expect(await permit.check(user, 'create', documentInTenant)).toBe(false);

  logger.info('testing bulk check permissions');
  const bulkQueries = [
    { user, action: 'read', resource: documentInTenant },
    { user, action: 'create', resource: documentInTenant },
  ];
  await waitFor(
    () => permit.bulkCheck(bulkQueries),
    (decisions) => decisions.length === 2 && decisions[0] === true && decisions[1] === false,
    { ...remainingBudget(), message: 'bulkCheck did not return [true, false] for read and create' },
  );

  logger.info('testing get user permissions matches assigned roles permissions');
  const tenantPermissionsKey = `__tenant:${tenant.key}`;
  const viewerPermissions = assignedViewer.permissions ?? [];
  await waitFor(
    () => permit.getUserPermissions(user.key),
    (permissions) =>
      viewerPermissions.every((permission) =>
        permissions[tenantPermissionsKey]?.permissions.includes(permission),
      ),
    {
      ...remainingBudget(),
      message: `getUserPermissions did not list ${viewerPermissions} under ${tenantPermissionsKey}`,
      describe: (permissions) => JSON.stringify(permissions[tenantPermissionsKey] ?? permissions),
    },
  );

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

  expect(assignedRoles).toHaveLength(1);
  expect(assignedRoles[0].user_id).toBe(user.id);
  expect(assignedRoles[0].role_id).toBe(admin.id);
  expect(assignedRoles[0].tenant_id).toBe(tenant.id);

  // The previously negative check becomes positive once the role swap has propagated.
  logger.info('testing previously negative permission check, should now be positive');
  await waitForCheck(() => permit.check(user, 'create', documentInTenant), true, remainingBudget());
});

// Uses the state the test above leaves behind: elon holds the admin role and james the viewer
// role in the tenant.
it.skipIf(!RUN_OPA_E2E)('useOpa checks go to OPA directly (PERMIT_RUN_OPA_E2E=true)', async () => {
  const useOpa = { useOpa: true };
  const secretDocument = { ...documentInTenant, attributes: { secret: true } };
  await waitForCheck(() => permit.check(JAMES, 'read', secretDocument), true);

  expect(await permit.check(JAMES, 'read', secretDocument, {}, useOpa)).toBe(true);
  expect(await permit.check(JAMES, 'create', secretDocument, {}, useOpa)).toBe(false);
  expect(await permit.check({ key: ELON }, 'create', documentInTenant, {}, useOpa)).toBe(true);
  expect(await permit.check(ELON, 'control the usa', secretDocument, {}, useOpa)).toBe(false);
});
