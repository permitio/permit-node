import pino from 'pino';

import { IPermitClient } from '../../index';
import { cleanUp, createTestClient } from '../fixtures';

let permit: IPermitClient;
let logger: pino.Logger;

// Keys unique to this run, so entities left by another spec or an earlier run can't collide
// with the ones created here.
const RUN_ID = `${process.pid}_${Date.now()}`;
const unique = (key: string) => `bulk_${key}_${RUN_ID}`;

const BULK_USER_1 = unique('user_maya_test_1');
const BULK_USER_2 = unique('user_maya_test_2');
const DELETED_USER_1 = unique('user_maya_1');
const DELETED_USER_2 = unique('user_maya_2');
// Every user key this spec creates, so afterAll can delete whichever ones remain.
const CREATED_USER_KEYS = [BULK_USER_1, BULK_USER_2, DELETED_USER_1, DELETED_USER_2];

// Resources/relation backing the relationship-tuple test. Created here so the
// test is self-contained in a shared backend (rebac uses its own schema).
const FOLDERS_RESOURCE = unique('folders');
const DOCS_RESOURCE = unique('docs');

beforeAll(async () => {
  ({ permit, logger } = createTestClient());

  await permit.api.resources.create({
    key: FOLDERS_RESOURCE,
    name: 'Folders',
    actions: { read: {} },
  });
  await permit.api.resources.create({ key: DOCS_RESOURCE, name: 'Docs', actions: { read: {} } });
  // docs:<x> --parent--> folders:<y>; subject of the relation is a folder.
  await permit.api.resourceRelations.create(DOCS_RESOURCE, {
    key: 'parent',
    name: 'Parent',
    subject_resource: FOLDERS_RESOURCE,
  });
});

afterAll(async () => {
  if (!permit) return; // beforeAll never initialized the client (e.g. missing key)
  // Deleting the resources removes their instances and relationship tuples.
  const steps: Record<string, () => Promise<unknown>> = {};
  for (const key of CREATED_USER_KEYS) {
    steps[`user ${key}`] = () => permit.api.users.delete(key);
  }
  steps[`resource ${DOCS_RESOURCE}`] = () => permit.api.resources.delete(DOCS_RESOURCE);
  steps[`resource ${FOLDERS_RESOURCE}`] = () => permit.api.resources.delete(FOLDERS_RESOURCE);
  await cleanUp(steps);
});

it('Bulk relationship tuples test', async () => {
  const tuples = [
    {
      subject: `${FOLDERS_RESOURCE}:pdf`,
      relation: 'parent',
      object: `${DOCS_RESOURCE}:tasks`,
      tenant: 'default',
    },
    {
      subject: `${FOLDERS_RESOURCE}:png`,
      relation: 'parent',
      object: `${DOCS_RESOURCE}:files`,
      tenant: 'default',
    },
  ];
  logger.info('Tuples: ' + JSON.stringify(tuples));
  const result = await permit.api.relationshipTuples.bulkRelationshipTuples(tuples);
  expect(result).toBeDefined();
});

it('Bulk users test', async () => {
  const users = [{ key: BULK_USER_1 }, { key: BULK_USER_2 }];
  logger.info('users: ' + JSON.stringify(users));
  await permit.api.users.bulkUserCreate(users);
});

it('Bulk users replace test', async () => {
  const users = [
    { key: BULK_USER_1, first_name: '1' },
    { key: BULK_USER_2, first_name: '2' },
  ];
  logger.info('users: ' + JSON.stringify(users));
  await permit.api.users.bulkUserReplace(users);
});

it('Bulk users delete test', async () => {
  const users = [{ key: DELETED_USER_1 }, { key: DELETED_USER_2 }];
  logger.info('users: ' + JSON.stringify(users));
  await permit.api.users.bulkUserCreate(users);
  const users_key = [DELETED_USER_1, DELETED_USER_2];
  logger.info('users: ' + JSON.stringify(users_key));
  await permit.api.users.bulkUserDelete(users_key);
});
