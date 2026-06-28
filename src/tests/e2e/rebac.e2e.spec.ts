import pino from 'pino';

import { IPermitClient } from '../..';
import { createTestClient, printBreak } from '../fixtures';
import { waitFor } from '../helpers/wait-for';

let permit: IPermitClient;
let logger: pino.Logger;

beforeAll(() => {
  ({ permit, logger } = createTestClient());
});

const viewerRoleKey = 'viewer';
const commenterRoleKey = 'commenter';
const editorRoleKey = 'editor';
const adminRoleKey = 'admin';
const memberRoleKey = 'member';

const account = {
  key: 'account',
  name: 'Account',
  urn: 'prn:gdrive:account',
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
  key: 'folder',
  name: 'Folder',
  urn: 'prn:gdrive:folder',
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
  key: 'document',
  name: 'Document',
  urn: 'prn:gdrive:document',
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
  key: 'user_permit',
  email: 'user@permit.io',
  first_name: 'Permit',
  last_name: 'User',
  attributes: {
    age: 35,
  },
};
const authzUser = {
  key: 'user_authz',
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
  key: 'permit',
  name: 'Permit',
};
const cocacolaTenant = {
  key: 'cocacola',
  name: 'Coca Cola',
};
const tenantsToCreate = [permitTenant, cocacolaTenant];

it('Permission check e2e test', async () => {
  try {
    logger.info('initial setup of objects');

    // create resources
    for (const resource of resourcesToCreate) {
      const createdResource = await permit.api.resources.create(resource);
      expect(createdResource).not.toBe(undefined);
      expect(createdResource).not.toBe(null);
      expect(createdResource.key).toBe(resource.key);
      expect(createdResource.name).toBe(resource.name);
      expect(createdResource.urn).toBe(resource.urn);
      expect(createdResource.description).toBe(resource.description);
    }

    // create admin and member users
    for (const user of usersToCreate) {
      const createdUser = await permit.api.users.create(user);
      expect(createdUser).not.toBe(undefined);
      expect(createdUser).not.toBe(null);
      expect(createdUser.key).toBe(user.key);
      expect(createdUser.email).toBe(user.email);
      expect(createdUser.first_name).toBe(user.first_name);
      expect(createdUser.last_name).toBe(user.last_name);
    }

    // create folder roles

    for (const resourceRole of allResourceRolesToCreate) {
      const createdResourceRole = await permit.api.resourceRoles.create(
        resourceRole.resourceKey,
        resourceRole.roleData,
      );
      expect(createdResourceRole).not.toBe(undefined);
      expect(createdResourceRole).not.toBe(null);
      expect(createdResourceRole.key).toBe(resourceRole.roleData.key);
      expect(createdResourceRole.name).toBe(resourceRole.roleData.name);
    }

    // create relation between document and folder (parent)
    const documentFolderRelation = await permit.api.resourceRelations.create(document.key, {
      key: 'parent',
      name: 'Document Folder Relation',
      subject_resource: folder.key,
    });
    expect(documentFolderRelation).not.toBe(undefined);
    expect(documentFolderRelation).not.toBe(null);
    expect(documentFolderRelation.key).toBe('parent');

    // create role derivation folder -> document
    const folderDocumentRoleDerivation = [viewerRoleKey, commenterRoleKey, editorRoleKey].map(
      (role) =>
        permit.api.resourceRoles.createRoleDerivation(document.key, role, {
          role: role,
          on_resource: folder.key,
          linked_by_relation: 'parent',
        }),
    );
    await Promise.all(folderDocumentRoleDerivation);

    // create permit and cocacola tenants
    for (const tenant of tenantsToCreate) {
      const createdTenant = await permit.api.tenants.create(tenant);
      expect(createdTenant).not.toBe(undefined);
      expect(createdTenant).not.toBe(null);
      expect(createdTenant.key).toBe(tenant.key);
      expect(createdTenant.name).toBe(tenant.name);
    }

    const relationships = [
      // finance folder contains 2 documents
      [`${folder.key}:finance`, 'parent', `${document.key}:budget23`, permitTenant.key],
      // TODO: add missing relationships commented out below because of 409 conflict
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

    for (const relationship of relationships) {
      const relTuple = await permit.api.relationshipTuples.create({
        subject: relationship[0],
        relation: relationship[1],
        object: relationship[2],
        tenant: relationship[3],
      });

      expect(relTuple).not.toBe(undefined);
      expect(relTuple).not.toBe(null);
      expect(relTuple.subject).toBe(relationship[0]);
      expect(relTuple.relation).toBe(relationship[1]);
      expect(relTuple.object).toBe(relationship[2]);
      // expect(relTuple.tenant_id).toBe(relationship[3]); returns id instead of key
    }

    const assignmentsAndAssertions = [
      {
        // direct access
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
      // access from higher level
      {
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
          // access to other resources not allowed
          {
            user: permitUser.key,
            action: 'read',
            resource_instance: {
              type: folder.key,
              key: 'budget23',
              tenant: permitTenant.key,
            },
            result: false,
          },
        ],
      },
      // access from highest level (account)
      {
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
      // permissions from higher level blocked by condition on role derivation

      {
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
          ...['rename', 'delete', 'create-document'].map((action) => ({
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
      // permissions from higher level blocked by condition on role derivation rule
      {
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

    const assertPermitCheck = async (client: IPermitClient, assertion: any, assignment: any) => {
      const result = await client.check(
        assertion.user,
        assertion.action,
        assertion.resource_instance,
      );
      if (result !== assertion.result) {
        console.log('assertion failed');
        console.log('assertion', assertion);
        console.log('assignment', assignment);
        console.log('result', result);
      }
      expect(result).toBe(assertion.result);
    };

    for (const testStep of assignmentsAndAssertions) {
      // role assignments
      for (const assignment of testStep.assignments) {
        const ra = await permit.api.roleAssignments.assign(assignment);
        expect(ra.user).toBe(assignment.user);
        expect(ra.role).toBe(assignment.role);
        expect(ra.resource_instance).toBe(assignment.resource_instance);
        expect(ra.tenant).toBe(assignment.tenant);
      }
      // Gate until every assertion in the step matches its expected result
      // (positives become true AND negatives become false), replacing a fixed
      // sleep. Polling all assertions also covers steps whose assertions are all
      // negative, which a positives-only gate would skip without waiting.
      await waitFor(
        async () => {
          const results = await Promise.all(
            testStep.assertions.map((a) => permit.check(a.user, a.action, a.resource_instance)),
          );
          return results.every((res, i) => res === testStep.assertions[i].result);
        },
        { timeoutMs: 60_000, intervalMs: 1_000, message: 'rebac step did not converge' },
      );
      for (const assertion of testStep.assertions) {
        await assertPermitCheck(permit, assertion, testStep.assignments);
      }
      for (const assignment of testStep.assignments) {
        try {
          await permit.api.roleAssignments.unassign(assignment);
        } catch (error) {
          logger.error(
            `failed to unassign ${assignment.user} ${assignment.role} ${assignment.resource_instance} ${assignment.tenant}`,
          );
        }
      }
    }

    printBreak();
  } finally {
    // Leave the shared env empty for the next spec. Deleting a resource cascades
    // to its roles, relations, resource instances and relationship tuples;
    // deleting users/tenants removes their role assignments. Each delete is
    // tolerant so a missing entity (e.g. the body threw before creating it)
    // neither throws nor masks the original failure.
    console.log('cleaning up');
    await permit.api.tenants.delete('cocacola').catch(() => undefined);
    await permit.api.tenants.delete('permit').catch(() => undefined);
    await permit.api.resources.delete('account').catch(() => undefined);
    await permit.api.resources.delete('folder').catch(() => undefined);
    await permit.api.resources.delete('document').catch(() => undefined);
    await permit.api.users.delete('user_authz').catch(() => undefined);
    await permit.api.users.delete('user_permit').catch(() => undefined);
  }
});
