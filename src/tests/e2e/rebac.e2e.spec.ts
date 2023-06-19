import anyTest, { TestInterface } from 'ava';

import { IPermitClient } from '../..';
import { printBreak, provideTestExecutionContext, TestContext } from '../fixtures';

const test = anyTest as TestInterface<TestContext>;
test.before(provideTestExecutionContext);

test('Permission check e2e test', async (t) => {
  const permit = t.context.permit;
  const logger = t.context.logger;

  try {
    logger.info('initial setup of objects');

    const account = await permit.api.resources.create({
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
    });

    const folder = await permit.api.resources.create({
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
    });

    const document = await permit.api.resources.create({
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
    });
    // create admin and member users
    const permitUser = await permit.api.users.create({
      key: 'user_permit',
      email: 'user@permit.io',
      first_name: 'Permit',
      last_name: 'User',
      attributes: {
        age: 35,
      },
    });

    const authzUser = await permit.api.users.create({
      key: 'authz_user',
      email: 'member@auth0.com',
      first_name: 'Member',
      last_name: 'User',
      attributes: {
        age: 27,
      },
    });
    const viewerRoleKey = 'viewer';
    const commenterRoleKey = 'commenter';
    const editorRoleKey = 'editor';
    const adminRoleKey = 'admin';
    const memberRoleKey = 'member';
    // create folder roles
    const folderViewer = await permit.api.resourceRoles.create(folder.key, {
      key: viewerRoleKey,
      name: 'Folder Viewer',
      permissions: ['read'],
    });
    const folderCommenter = await permit.api.resourceRoles.create(folder.key, {
      key: commenterRoleKey,
      name: 'Folder Commenter',
      permissions: ['read'],
    });
    const folderEditor = await permit.api.resourceRoles.create(folder.key, {
      key: editorRoleKey,
      name: 'Folder Editor',
      permissions: ['read', 'rename', 'delete', 'create_document'],
      // tests creation of role derivation as part of the resource role
      // (account admin is editor on folder)
      granted_to: {
        users_with_role: [
          {
            role: adminRoleKey,
            on_resource: 'account',
            linked_by_relation: 'account',
          },
        ],
      },
    });
    // create document roles
    const documentViewer = await permit.api.resourceRoles.create(document.key, {
      key: viewerRoleKey,
      name: 'Document Viewer',
      permissions: ['read'],
    });
    const documentCommenter = await permit.api.resourceRoles.create(document.key, {
      key: commenterRoleKey,
      name: 'Document Commenter',
      permissions: ['read', 'comment'],
    });
    const documentEditor = await permit.api.resourceRoles.create(document.key, {
      key: editorRoleKey,
      name: 'Document Editor',
      permissions: ['read', 'comment', 'update', 'delete'],
    });

    // create relation between document and folder (parent)
    const documentFolderRelation = await permit.api.resourceRelations.create(document.key, {
      key: 'parent',
      name: 'Document Folder Relation',
      subject_resource: folder.key,
    });

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
    const permitTenant = await permit.api.tenants.create({
      key: 'permit',
      name: 'Permit',
    });
    const cocacolaTenant = await permit.api.tenants.create({
      key: 'cocacola',
      name: 'Coca Cola',
    });

    const relationships = [
      // finance folder contains 2 documents
      [`${folder.key}:finance`, 'parent', `${document.key}:budget23`, permitTenant.key],
      // [`${folder.key}:finance`, 'parent', `${document.key}:june-expenses`, permitTenant.key],
      // rnd folder contains 2 documents
      [`${folder.key}:rnd`, 'parent', `${document.key}:architecture`, permitTenant.key],
      // [`${folder.key}:rnd`, 'parent', `${document.key}:opal`, permitTenant.key],
      // folders belongs in permit g-drive account
      [`${account.key}:permitio`, 'account', `${folder.key}:finance`, permitTenant.key],
      // [`${account.key}:permitio`, 'account', `${folder.key}:rnd`, permitTenant.key],
      // another account->folder->doc belongs to another tenant
      [`${folder.key}:recipes`, 'parent', `${document.key}:secret-recipe`, cocacolaTenant.key],
      [`${account.key}:cocacola`, 'account', `${folder.key}:recipes`, cocacolaTenant.key],
    ];

    const relationshipTuples = relationships.map(async (relationship) => {
      const relTuple = await permit.api.relationshipTuples.create({
        subject: relationship[0],
        relation: relationship[1],
        object: relationship[2],
        tenant: relationship[3],
      });
      t.not(relTuple, undefined);
      t.not(relTuple, null);
      t.is(relTuple.subject, relationship[0]);
      t.is(relTuple.relation, relationship[1]);
      t.is(relTuple.object, relationship[2]);
      // t.is(relTuple.tenant_id, relationship[3]); returns id instead of key
      return relTuple;
    });

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
          {
            user: permitUser.key,
            action: 'comment',
            resource_instance: {
              type: folder.key,
              key: 'architecture',
              tenant: permitTenant.key,
            },
            result: true,
          },
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
            action: 'invite-user',
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
    ];

    const assertPermitCheck = async (permit: IPermitClient, assertion: any) => {
      const result = await permit.check(
        assertion.user,
        assertion.action,
        assertion.resource_instance,
      );
      t.is(result, assertion.result);
    };

    for (const testStep of assignmentsAndAssertions) {
      // role assignments
      for (const assignment of testStep.assignments) {
        const ra = await permit.api.roleAssignments.assign(assignment);
        t.is(ra.user, assignment.user);
        t.is(ra.role, assignment.role);
        t.is(ra.resource_instance, assignment.resource_instance);
        t.is(ra.tenant, assignment.tenant);
      }
      for (const assertion of testStep.assertions) {
        await assertPermitCheck(permit, assertion);
      }
    }

    printBreak();
  } catch (error) {
    logger.error(`GOT ERROR: ${error}`);
    t.fail(`got error: ${error}`);
  } finally {
    // cleanup
    try {
      console.log('cleaning up');
      await permit.api.tenants.delete('cocacola');
      await permit.api.tenants.delete('permit');
      await permit.api.resources.delete('account');
      await permit.api.resources.delete('folder');
      await permit.api.resources.delete('document');
      await permit.api.users.delete('user_authz');
      await permit.api.users.delete('user_permit');
    } catch (error) {
      logger.error(`GOT ERROR: ${error}`);
      t.fail(`got error: ${error}`);
    }
  }
});
