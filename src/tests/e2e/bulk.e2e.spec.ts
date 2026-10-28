import { randomUUID } from 'node:crypto';

import pino from 'pino';

import { type IPermitClient } from '#src/index';
import { cleanUp, createTestClient, expectNotFound } from '#src/tests/fixtures';
import { waitFor } from '#src/tests/helpers/wait-for';

let permit: IPermitClient;
let logger: pino.Logger;

// Keys unique to this run, so entities left by another spec or an earlier run can't collide
// with the ones created here.
const RUN_ID = `${process.pid}_${Date.now()}_${randomUUID().slice(0, 8)}`;
const unique = (key: string) => `bulk_${key}_${RUN_ID}`;

const BULK_USER_1 = unique('user_maya_test_1');
const BULK_USER_2 = unique('user_maya_test_2');
// The delete test's users share a prefix, so searching for it lists exactly those users.
const DELETED_PREFIX = unique('user_maya_deleted');
const DELETED_USER_1 = `${DELETED_PREFIX}_1`;
const DELETED_USER_2 = `${DELETED_PREFIX}_2`;
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
    steps[`verify user ${key} absent`] = () =>
      expectNotFound(permit.api.users.get(key), `user ${key}`);
  }
  steps[`resource ${DOCS_RESOURCE}`] = () => permit.api.resources.delete(DOCS_RESOURCE);
  steps[`resource ${FOLDERS_RESOURCE}`] = () => permit.api.resources.delete(FOLDERS_RESOURCE);
  steps[`verify resource ${DOCS_RESOURCE} absent`] = () =>
    expectNotFound(permit.api.resources.get(DOCS_RESOURCE), `resource ${DOCS_RESOURCE}`);
  steps[`verify resource ${FOLDERS_RESOURCE} absent`] = () =>
    expectNotFound(permit.api.resources.get(FOLDERS_RESOURCE), `resource ${FOLDERS_RESOURCE}`);
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
  for (const [resource, key] of [
    [FOLDERS_RESOURCE, 'pdf'],
    [FOLDERS_RESOURCE, 'png'],
    [DOCS_RESOURCE, 'tasks'],
    [DOCS_RESOURCE, 'files'],
  ] as const) {
    await permit.api.resourceInstances.create({ resource, key, tenant: 'default' });
  }
  logger.info('Tuples: ' + JSON.stringify(tuples));
  await permit.api.relationshipTuples.bulkRelationshipTuples(tuples);
  for (const tuple of tuples) {
    const persisted = await waitFor(
      () => permit.api.relationshipTuples.list(tuple),
      (list) => list.length === 1,
      { timeoutMs: 60_000, message: 'bulk-created tuple not yet persisted' },
    );
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject(tuple);
    expect(persisted[0]?.id).toEqual(expect.any(String));
  }
});

it('Bulk users test', async () => {
  const users = [{ key: BULK_USER_1 }, { key: BULK_USER_2 }];
  logger.info('users: ' + JSON.stringify(users));
  await permit.api.users.bulkUserCreate(users);
  for (const user of users) {
    const persisted = await waitFor(
      () => permit.api.users.list({ search: user.key }),
      (list) => list.data.some((item) => item.key === user.key),
      { timeoutMs: 60_000, message: 'bulk-created user not yet persisted' },
    );
    expect(persisted.data.find((item) => item.key === user.key)).toMatchObject(user);
  }
});

it('Bulk users replace test', async () => {
  const users = [
    { key: BULK_USER_1, first_name: '1' },
    { key: BULK_USER_2, first_name: '2' },
  ];
  logger.info('users: ' + JSON.stringify(users));
  await permit.api.users.bulkUserReplace(users);
  for (const user of users) {
    const persisted = await waitFor(
      () => permit.api.users.list({ search: user.key }),
      (list) =>
        list.data.some((item) => item.key === user.key && item.first_name === user.first_name),
      { timeoutMs: 60_000, message: 'bulk-replaced user fields not yet persisted' },
    );
    expect(persisted.data.find((item) => item.key === user.key)).toMatchObject(user);
  }
});

it('Bulk users delete test', async () => {
  const listDeletedUsers = () => permit.api.users.list({ search: DELETED_PREFIX });
  const users = [{ key: DELETED_USER_1 }, { key: DELETED_USER_2 }];
  logger.info('users: ' + JSON.stringify(users));
  await permit.api.users.bulkUserCreate(users);
  // Bulk create is eventually consistent; wait until both users are listable, so the delete
  // below acts on users that exist.
  await waitFor(listDeletedUsers, (list) => list.total_count === 2, {
    timeoutMs: 60_000,
    message: 'bulk-created users not yet listable',
    describe: (list) => `total_count=${list.total_count}`,
  });
  const users_key = [DELETED_USER_1, DELETED_USER_2];
  logger.info('users: ' + JSON.stringify(users_key));
  await permit.api.users.bulkUserDelete(users_key);
  await waitFor(listDeletedUsers, (list) => list.total_count === 0, {
    timeoutMs: 60_000,
    message: 'bulk-deleted users still listed',
    describe: (list) => `total_count=${list.total_count}`,
  });
});
