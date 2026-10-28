import pino from 'pino';

import { type IPermitClient, type IResource } from '#src/index';
import { type RoleAssignmentCreate } from '#src/openapi/index';
import { cleanUp, createTestClient, expectNotFound } from '#src/tests/fixtures';
import { waitFor } from '#src/tests/helpers/wait-for';

let permit: IPermitClient;
let logger: pino.Logger;

// Keys unique to this run, so entities left by another spec or an earlier run can't change the
// results.
const RUN_ID = `${process.pid}_${Date.now()}`;
const unique = (key: string) => `rebac_${key}_${RUN_ID}`;

// The heavy ReBAC graph can take minutes to propagate to the PDP on a cold environment. Each step
// is its own test, so this budget plus one attempt stays inside the 300s test timeout.
const STEP_TIMEOUT_MS = 150_000;

const viewerRoleKey = 'viewer';
const commenterRoleKey = 'commenter';
const editorRoleKey = 'editor';
const adminRoleKey = 'admin';
const memberRoleKey = 'member';

const account = {
  key: unique('account'),
  name: 'Account',
  urn: `prn:gdrive:${unique('account')}`,
  description: 'google drive account',
  actions: {
    create: {},
    invite_user: {},
    delete: {},
    view_members: {},
    create_folder: {},
    create_document: {},
  },
  roles: {
    admin: {
      name: 'Admin',
      permissions: ['create', 'invite_user', 'delete', 'create_folder', 'create_document'],
    },
    member: {
      name: 'Member',
      permissions: ['view_members', 'create_folder', 'create_document'],
    },
  },
};
const folder = {
  key: unique('folder'),
  name: 'Folder',
  urn: `prn:gdrive:${unique('folder')}`,
  description: 'google drive folder',
  actions: {
    read: {},
    rename: {},
    delete: {},
    create_document: {},
  },
  relations: {
    account: account.key,
  },
};
const document = {
  key: unique('document'),
  name: 'Document',
  urn: `prn:gdrive:${unique('document')}`,
  description: 'google drive document',
  actions: {
    read: {},
    update: {},
    delete: {},
    comment: {},
  },
};

const resourcesToCreate = [account, folder, document];

const permitUser = {
  key: unique('user_permit'),
  email: 'user@permit.io',
  first_name: 'Permit',
  last_name: 'User',
  attributes: {
    age: 35,
  },
};
const authzUser = {
  key: unique('user_authz'),
  email: 'member@auth0.com',
  first_name: 'Member',
  last_name: 'User',
  attributes: {
    age: 27,
  },
};

const usersToCreate = [permitUser, authzUser];

const folderViewer = {
  resourceKey: folder.key,
  roleData: {
    key: viewerRoleKey,
    name: 'Folder Viewer',
    permissions: ['read'],
  },
};

const folderCommenter = {
  resourceKey: folder.key,
  roleData: {
    key: commenterRoleKey,
    name: 'Folder Commenter',
    permissions: ['read', 'rename'],
    granted_to: {
      users_with_role: [
        {
          role: memberRoleKey,
          on_resource: account.key,
          linked_by_relation: 'account',
          when: {
            no_direct_roles_on_object: true,
          },
        },
      ],
    },
  },
};

const folderEditor = {
  resourceKey: folder.key,
  roleData: {
    key: editorRoleKey,
    name: 'Folder Editor',
    permissions: ['read', 'rename', 'delete', 'create_document'],
    // tests creation of role derivation as part of the resource role
    // (account admin is editor on folder)
    granted_to: {
      users_with_role: [
        {
          role: adminRoleKey,
          on_resource: account.key,
          linked_by_relation: 'account',
        },
      ],
      when: {
        no_direct_roles_on_object: true,
      },
    },
  },
};

const documentViewer = {
  resourceKey: document.key,
  roleData: {
    key: viewerRoleKey,
    name: 'Document Viewer',
    permissions: ['read'],
  },
};

const documentCommenter = {
  resourceKey: document.key,
  roleData: {
    key: commenterRoleKey,
    name: 'Document Commenter',
    permissions: ['read', 'comment'],
  },
};

const documentEditor = {
  resourceKey: document.key,
  roleData: {
    key: editorRoleKey,
    name: 'Document Editor',
    permissions: ['read', 'comment', 'update', 'delete'],
  },
};

const allResourceRolesToCreate = [
  folderViewer,
  folderCommenter,
  folderEditor,
  documentViewer,
  documentCommenter,
  documentEditor,
];

const permitTenant = {
  key: unique('permit'),
  name: 'Permit',
};
const cocacolaTenant = {
  key: unique('cocacola'),
  name: 'Coca Cola',
};
const tenantsToCreate = [permitTenant, cocacolaTenant];

const relationships: [string, string, string, string][] = [
  // finance folder contains 2 documents
  [`${folder.key}:finance`, 'parent', `${document.key}:budget23`, permitTenant.key],
  [`${folder.key}:finance`, 'parent', `${document.key}:june-expenses`, permitTenant.key],
  // rnd folder contains 2 documents
  [`${folder.key}:rnd`, 'parent', `${document.key}:architecture`, permitTenant.key],
  [`${folder.key}:rnd`, 'parent', `${document.key}:opal`, permitTenant.key],
  // folders belongs in permit g-drive account
  [`${account.key}:permitio`, 'account', `${folder.key}:finance`, permitTenant.key],
  [`${account.key}:permitio`, 'account', `${folder.key}:rnd`, permitTenant.key],
  // another account->folder->doc belongs to another tenant
  [`${folder.key}:recipes`, 'parent', `${document.key}:secret-recipe`, cocacolaTenant.key],
  [`${account.key}:cocacola`, 'account', `${folder.key}:recipes`, cocacolaTenant.key],
];

interface CheckAssertion {
  user: string;
  action: string;
  resource_instance: IResource;
  result: boolean;
}

interface TestStep {
  name: string;
  assignments: Array<RoleAssignmentCreate & { tenant: string }>;
  assertions: CheckAssertion[];
}

const assignmentsAndAssertions: TestStep[] = [
  {
    name: 'direct access: a document viewer can read it but not comment',
    assignments: [
      {
        user: permitUser.key,
        role: viewerRoleKey,
        resource_instance: `${document.key}:architecture`,
        tenant: permitTenant.key,
      },
    ],
    assertions: [
      {
        user: permitUser.key,
        action: 'read',
        resource_instance: {
          type: document.key,
          key: 'architecture',
          tenant: permitTenant.key,
        },
        result: true,
      },
      {
        user: permitUser.key,
        action: 'comment',
        resource_instance: {
          type: document.key,
          key: 'architecture',
          tenant: permitTenant.key,
        },
        result: false,
      },
      {
        user: permitUser.key,
        action: 'comment',
        resource_instance: {
          type: document.key,
          key: 'opal',
          tenant: permitTenant.key,
        },
        result: false,
      },
    ],
  },
  {
    name: 'access from a higher level: a folder commenter reaches the folder documents',
    assignments: [
      {
        user: permitUser.key,
        role: commenterRoleKey,
        resource_instance: `${folder.key}:rnd`,
        tenant: permitTenant.key,
      },
    ],
    assertions: [
      // direct access allowed
      {
        user: permitUser.key,
        action: 'read',
        resource_instance: {
          type: folder.key,
          key: 'rnd',
          tenant: permitTenant.key,
        },
        result: true,
      },
      // access to child resources allowed
      ...[
        { action: 'read', resource: 'architecture' },
        { action: 'comment', resource: 'architecture' },
        { action: 'read', resource: 'opal' },
        { action: 'comment', resource: 'opal' },
      ].map((settings) => ({
        user: permitUser.key,
        action: settings.action,
        resource_instance: {
          type: document.key,
          key: settings.resource,
          tenant: permitTenant.key,
        },
        result: true,
      })),
      // higher permissions not allowed
      {
        user: permitUser.key,
        action: 'update',
        resource_instance: {
          type: document.key,
          key: 'architecture',
          tenant: permitTenant.key,
        },
        result: false,
      },
      // access to other resources not allowed: budget23 is a document in the finance folder
      {
        user: permitUser.key,
        action: 'read',
        resource_instance: {
          type: document.key,
          key: 'budget23',
          tenant: permitTenant.key,
        },
        result: false,
      },
    ],
  },
  {
    name: 'access from the highest level: an account admin reaches documents in its tenant only',
    assignments: [
      {
        user: permitUser.key,
        role: adminRoleKey,
        resource_instance: `${account.key}:permitio`,
        tenant: permitTenant.key,
      },
      {
        user: authzUser.key,
        role: memberRoleKey,
        resource_instance: `${account.key}:cocacola`,
        tenant: cocacolaTenant.key,
      },
    ],
    assertions: [
      // direct access allowed
      {
        user: permitUser.key,
        action: 'invite_user',
        resource_instance: {
          type: account.key,
          key: 'permitio',
          tenant: permitTenant.key,
        },
        result: true,
      },
      // access to child resources allowed
      ...['read', 'comment', 'update', 'delete'].map((action) => ({
        user: permitUser.key,
        action,
        resource_instance: {
          type: document.key,
          key: 'architecture',
          tenant: permitTenant.key,
        },
        result: true,
      })),
      // access to other tenants not allowed
      {
        user: permitUser.key,
        action: 'read',
        resource_instance: {
          type: document.key,
          key: 'secret-recipe',
          tenant: cocacolaTenant.key,
        },
        result: false,
      },
      // but access is allowed to user with lower permissions in the right tenant
      {
        user: authzUser.key,
        action: 'read',
        resource_instance: {
          type: document.key,
          key: 'secret-recipe',
          tenant: cocacolaTenant.key,
        },
        result: true,
      },
    ],
  },
  {
    name: 'a direct folder role blocks the editor role derived from account admin',
    assignments: [
      {
        user: permitUser.key,
        role: adminRoleKey,
        resource_instance: `${account.key}:permitio`,
        tenant: permitTenant.key,
      },
      {
        user: permitUser.key,
        role: viewerRoleKey,
        resource_instance: `${folder.key}:rnd`,
        tenant: permitTenant.key,
      },
    ],
    assertions: [
      // direct access allowed
      {
        user: permitUser.key,
        action: 'read',
        resource_instance: {
          type: folder.key,
          key: 'rnd',
          tenant: permitTenant.key,
        },
        result: true,
      },
      // access given by derived role is not allowed
      ...['rename', 'delete', 'create_document'].map((action) => ({
        user: permitUser.key,
        action,
        resource_instance: {
          type: folder.key,
          key: 'rnd',
          tenant: permitTenant.key,
        },
        result: false,
      })),
    ],
  },
  {
    name: 'a direct folder role blocks the commenter role derived from account member',
    assignments: [
      {
        user: permitUser.key,
        role: memberRoleKey,
        resource_instance: `${account.key}:permitio`,
        tenant: permitTenant.key,
      },
      {
        user: permitUser.key,
        role: viewerRoleKey,
        resource_instance: `${folder.key}:rnd`,
        tenant: permitTenant.key,
      },
    ],
    assertions: [
      // direct access allowed
      {
        user: permitUser.key,
        action: 'read',
        resource_instance: {
          type: folder.key,
          key: 'rnd',
          tenant: permitTenant.key,
        },
        result: true,
      },
      // access given by derived role is not allowed
      {
        user: permitUser.key,
        action: 'rename',
        resource_instance: {
          type: folder.key,
          key: 'rnd',
          tenant: permitTenant.key,
        },
        result: false,
      },
    ],
  },
];

/** Lists the assertions whose check returned the other result. */
function describeMismatches(assertions: CheckAssertion[], results: boolean[]): string {
  return assertions
    .filter((assertion, index) => results[index] !== assertion.result)
    .map(({ user, action, resource_instance: { type, key, tenant }, result }) => {
      return `${user} ${action} ${type}:${key} in ${tenant} returned ${!result}`;
    })
    .join('; ');
}

beforeAll(async () => {
  ({ permit, logger } = createTestClient());
  logger.info('initial setup of objects');

  // create resources
  for (const resource of resourcesToCreate) {
    const createdResource = await permit.api.resources.create(resource);
    expect(createdResource.key).toBe(resource.key);
    expect(createdResource.name).toBe(resource.name);
    expect(createdResource.urn).toBe(resource.urn);
    expect(createdResource.description).toBe(resource.description);
  }

  // create admin and member users
  for (const user of usersToCreate) {
    const createdUser = await permit.api.users.create(user);
    expect(createdUser.key).toBe(user.key);
    expect(createdUser.email).toBe(user.email);
    expect(createdUser.first_name).toBe(user.first_name);
    expect(createdUser.last_name).toBe(user.last_name);
  }

  // create folder and document roles
  for (const resourceRole of allResourceRolesToCreate) {
    const createdResourceRole = await permit.api.resourceRoles.create(
      resourceRole.resourceKey,
      resourceRole.roleData,
    );
    expect(createdResourceRole.key).toBe(resourceRole.roleData.key);
    expect(createdResourceRole.name).toBe(resourceRole.roleData.name);
  }

  // create relation between document and folder (parent)
  const documentFolderRelation = await permit.api.resourceRelations.create(document.key, {
    key: 'parent',
    name: 'Document Folder Relation',
    subject_resource: folder.key,
  });
  expect(documentFolderRelation.key).toBe('parent');

  // create role derivation folder -> document
  await Promise.all(
    [viewerRoleKey, commenterRoleKey, editorRoleKey].map((role) =>
      permit.api.resourceRoles.createRoleDerivation(document.key, role, {
        role: role,
        on_resource: folder.key,
        linked_by_relation: 'parent',
      }),
    ),
  );

  // create permit and cocacola tenants
  for (const tenant of tenantsToCreate) {
    const createdTenant = await permit.api.tenants.create(tenant);
    expect(createdTenant.key).toBe(tenant.key);
    expect(createdTenant.name).toBe(tenant.name);
  }

  for (const [subject, relation, object, tenant] of relationships) {
    const relTuple = await permit.api.relationshipTuples.create({
      subject,
      relation,
      object,
      tenant,
    });
    expect(relTuple.subject).toBe(subject);
    expect(relTuple.relation).toBe(relation);
    expect(relTuple.object).toBe(object);
  }
});

afterAll(async () => {
  if (!permit) return; // beforeAll never initialized the client (e.g. missing key)
  // Deleting users and tenants removes their role assignments, and deleting a resource removes
  // its roles, relations, instances and relationship tuples. Resources go in reverse order of
  // their references: document points at folder, folder at account.
  await cleanUp({
    [`user ${permitUser.key}`]: () => permit.api.users.delete(permitUser.key),
    [`user ${authzUser.key}`]: () => permit.api.users.delete(authzUser.key),
    [`tenant ${permitTenant.key}`]: () => permit.api.tenants.delete(permitTenant.key),
    [`tenant ${cocacolaTenant.key}`]: () => permit.api.tenants.delete(cocacolaTenant.key),
    [`resource ${document.key}`]: () => permit.api.resources.delete(document.key),
    [`resource ${folder.key}`]: () => permit.api.resources.delete(folder.key),
    [`resource ${account.key}`]: () => permit.api.resources.delete(account.key),
  });
  for (const user of usersToCreate) {
    await expectNotFound(permit.api.users.get(user.key), `user ${user.key}`);
  }
  for (const tenant of tenantsToCreate) {
    await expectNotFound(permit.api.tenants.get(tenant.key), `tenant ${tenant.key}`);
  }
  for (const resource of resourcesToCreate) {
    await expectNotFound(permit.api.resources.get(resource.key), `resource ${resource.key}`);
  }
});

// The steps run in order: each one removes its role assignments before the next begins.
for (const { name, assignments, assertions } of assignmentsAndAssertions) {
  it(name, async () => {
    for (const assignment of assignments) {
      const ra = await permit.api.roleAssignments.assign(assignment);
      expect(ra.user).toBe(assignment.user);
      expect(ra.role).toBe(assignment.role);
      expect(ra.resource_instance).toBe(assignment.resource_instance);
      expect(ra.tenant).toBe(assignment.tenant);
    }
    // Poll until every check returns its expected result, the negatives included, so the step
    // also waits for the previous step's unassignments to reach the PDP.
    await waitFor(
      () => Promise.all(assertions.map((a) => permit.check(a.user, a.action, a.resource_instance))),
      (results) => results.every((allowed, index) => allowed === assertions[index]?.result),
      {
        timeoutMs: STEP_TIMEOUT_MS,
        message: 'some checks kept returning the wrong result',
        describe: (results) => describeMismatches(assertions, results),
      },
    );
    for (const assignment of assignments) {
      await permit.api.roleAssignments.unassign(assignment);
    }
  });
}
