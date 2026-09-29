import pino from 'pino';

import { IPermitClient } from '../../index';
import { createTestClient } from '../fixtures';

let permit: IPermitClient;
let logger: pino.Logger;

// Every user key this spec creates, so afterAll can purge them from the shared
// environment and not pollute sibling suites.
const CREATED_USER_KEYS = ['user_maya_test_1', 'user_maya_test_2', 'user_maya_1', 'user_maya_2'];

// Resources/relation backing the relationship-tuple test. Created here so the
// test is self-contained in a shared backend (rebac uses its own schema).
const FOLDERS_RESOURCE = 'folders';
const DOCS_RESOURCE = 'docs';

beforeAll(async () => {
  ({ permit, logger } = createTestClient());

  await permit.api.resources
    .create({ key: FOLDERS_RESOURCE, name: 'Folders', actions: { read: {} } })
    .catch(() => null);
  await permit.api.resources
    .create({ key: DOCS_RESOURCE, name: 'Docs', actions: { read: {} } })
    .catch(() => null);
  // docs:<x> --parent--> folders:<y>; subject of the relation is a folder.
  await permit.api.resourceRelations
    .create(DOCS_RESOURCE, {
      key: 'parent',
      name: 'Parent',
      subject_resource: FOLDERS_RESOURCE,
    })
    .catch(() => null);
});

afterAll(async () => {
  if (!permit) return; // beforeAll never initialized the client (e.g. missing key)
  // Purge every user this spec created.
  await permit.api.users.bulkUserDelete(CREATED_USER_KEYS).catch(() => null);
  // Deleting the resources cascades to their instances and relationship tuples.
  await permit.api.resources.delete(DOCS_RESOURCE).catch(() => null);
  await permit.api.resources.delete(FOLDERS_RESOURCE).catch(() => null);
});

it('Bulk relationship tuples test', async () => {
  const tuples = [
    {
      subject: 'folders:pdf',
      relation: 'parent',
      object: 'docs:tasks',
      tenant: 'default',
    },
    {
      subject: 'folders:png',
      relation: 'parent',
      object: 'docs:files',
      tenant: 'default',
    },
  ];
  logger.info('Tuples: ' + JSON.stringify(tuples));
  const result = await permit.api.relationshipTuples.bulkRelationshipTuples(tuples);
  expect(result).toBeDefined();
});

it('Bulk users test', async () => {
  const users = [{ key: 'user_maya_test_1' }, { key: 'user_maya_test_2' }];
  logger.info('users: ' + JSON.stringify(users));
  await permit.api.users.bulkUserCreate(users);
});

it('Bulk users replace test', async () => {
  const users = [
    { key: 'user_maya_test_1', first_name: '1' },
    { key: 'user_maya_test_2', first_name: '2' },
  ];
  logger.info('users: ' + JSON.stringify(users));
  await permit.api.users.bulkUserReplace(users);
});

it('Bulk users delete test', async () => {
  const users = [{ key: 'user_maya_1' }, { key: 'user_maya_2' }];
  logger.info('users: ' + JSON.stringify(users));
  await permit.api.users.bulkUserCreate(users);
  const users_key = ['user_maya_1', 'user_maya_2'];
  logger.info('users: ' + JSON.stringify(users_key));
  await permit.api.users.bulkUserDelete(users_key);
});
