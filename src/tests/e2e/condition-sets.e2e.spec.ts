import pino from 'pino';

import { IPermitClient } from '../../index';
import { createTestClient } from '../fixtures';
import { waitForCheck } from '../helpers/wait-for';

let permit: IPermitClient;
let logger: pino.Logger;

// Unique per-run suffix so concurrent/repeated runs never collide on the shared
// environment, and so the tolerant afterAll only ever touches what this spec made.
const rand = Math.random().toString(36).slice(2, 8);
const RESOURCE_KEY = `cs_e2e_doc_${rand}`;
const USERSET_KEY = `cs_e2e_userset_${rand}`;
const RESOURCESET_KEY = `cs_e2e_resourceset_${rand}`;
const MATCHING_USER_KEY = `cs_e2e_user_match_${rand}`;
const OTHER_USER_KEY = `cs_e2e_user_other_${rand}`;
const ACTION = 'read';
const PERMISSION = `${RESOURCE_KEY}:${ACTION}`;
const TENANT = 'default';

beforeAll(() => {
  ({ permit, logger } = createTestClient());
});

afterAll(async () => {
  // Tolerant teardown in dependency order (rule -> condition sets -> users ->
  // resource). Each delete swallows its own error so a partial run (the body
  // threw before creating an entity) neither throws nor masks the original
  // failure. The deletes cascade, then the assertions confirm nothing leaked.
  await permit.api.conditionSetRules
    .delete({ user_set: USERSET_KEY, permission: PERMISSION, resource_set: RESOURCESET_KEY })
    .catch(() => undefined);
  await permit.api.conditionSets.delete(USERSET_KEY).catch(() => undefined);
  await permit.api.conditionSets.delete(RESOURCESET_KEY).catch(() => undefined);
  await permit.api.users.delete(MATCHING_USER_KEY).catch(() => undefined);
  await permit.api.users.delete(OTHER_USER_KEY).catch(() => undefined);
  await permit.api.resources.delete(RESOURCE_KEY).catch(() => undefined);

  const sets = await permit.api.conditionSets.list();
  expect(sets.some((set) => set.key === USERSET_KEY)).toBe(false);
  expect(sets.some((set) => set.key === RESOURCESET_KEY)).toBe(false);

  const resources = await permit.api.resources.list();
  expect(resources.some((resource) => resource.key === RESOURCE_KEY)).toBe(false);

  const users = (await permit.api.users.list()).data;
  expect(users.some((user) => user.key === MATCHING_USER_KEY)).toBe(false);
  expect(users.some((user) => user.key === OTHER_USER_KEY)).toBe(false);
});

it('ABAC condition-set permission check e2e test', async () => {
  logger.info('creating an attributed resource for ABAC');
  const resource = await permit.api.resources.create({
    key: RESOURCE_KEY,
    name: RESOURCE_KEY,
    actions: { [ACTION]: {} },
    attributes: {
      confidential: {
        type: 'bool',
        description: 'whether the document is confidential',
      },
    },
  });
  expect(resource.key).toBe(RESOURCE_KEY);
  expect((resource.actions ?? {})[ACTION]).not.toBe(undefined);

  logger.info('creating the userset condition set (matches a user attribute)');
  const userSet = await permit.api.conditionSets.create({
    key: USERSET_KEY,
    name: USERSET_KEY,
    type: 'userset',
    conditions: {
      allOf: [{ 'user.clearance': { equals: 'top_secret' } }],
    },
  });
  expect(userSet.key).toBe(USERSET_KEY);
  expect(userSet.type).toBe('userset');

  logger.info('creating the resourceset condition set (matches a resource attribute)');
  const resourceSet = await permit.api.conditionSets.create({
    key: RESOURCESET_KEY,
    name: RESOURCESET_KEY,
    type: 'resourceset',
    resource_id: RESOURCE_KEY,
    conditions: {
      allOf: [{ 'resource.confidential': { equals: true } }],
    },
  });
  expect(resourceSet.key).toBe(RESOURCESET_KEY);
  expect(resourceSet.type).toBe('resourceset');

  logger.info('linking the sets with a condition-set rule that grants the action');
  const rule = await permit.api.conditionSetRules.create({
    user_set: USERSET_KEY,
    permission: PERMISSION,
    resource_set: RESOURCESET_KEY,
  });
  expect(rule.user_set).toBe(USERSET_KEY);
  expect(rule.resource_set).toBe(RESOURCESET_KEY);
  expect(rule.permission).toBe(PERMISSION);

  logger.info('syncing a user that matches the userset, and one that does not');
  const { user: matchingUser } = await permit.api.users.sync({
    key: MATCHING_USER_KEY,
    attributes: { clearance: 'top_secret' },
  });
  expect(matchingUser.key).toBe(MATCHING_USER_KEY);
  expect((matchingUser.attributes as Record<string, unknown>)['clearance']).toBe('top_secret');

  const { user: otherUser } = await permit.api.users.sync({
    key: OTHER_USER_KEY,
    attributes: { clearance: 'public' },
  });
  expect(otherUser.key).toBe(OTHER_USER_KEY);

  const confidentialResource = {
    type: RESOURCE_KEY,
    tenant: TENANT,
    attributes: { confidential: true },
  };

  // Wait for the writes above to propagate from the control plane to the PDP.
  await waitForCheck(() => permit.check(MATCHING_USER_KEY, ACTION, confidentialResource), true);

  logger.info('positive ABAC check: matching user reads a confidential document');
  expect(await permit.check(MATCHING_USER_KEY, ACTION, confidentialResource)).toBe(true);

  logger.info('negative ABAC check: non-matching user is denied');
  expect(await permit.check(OTHER_USER_KEY, ACTION, confidentialResource)).toBe(false);
});
