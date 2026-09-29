import pino from 'pino';

import { IPermitClient } from '../../index';
import { cleanUp, createTestClient, expectNotFound } from '../fixtures';
import { waitForCheck } from '../helpers/wait-for';

let permit: IPermitClient;
let logger: pino.Logger;

// Unique per-run suffix so concurrent/repeated runs never collide on the shared
// environment, and so the afterAll cleanup only ever touches what this spec made.
const rand = Math.random().toString(36).slice(2, 8);
const RESOURCE_KEY = `cs_e2e_doc_${rand}`;
const USERSET_KEY = `cs_e2e_userset_${rand}`;
const RESOURCESET_KEY = `cs_e2e_resourceset_${rand}`;
const MATCHING_USER_KEY = `cs_e2e_user_match_${rand}`;
const OTHER_USER_KEY = `cs_e2e_user_other_${rand}`;
// Built-in 'user' resource key in Permit. A userset condition that references
// user.<attr> requires the attribute to exist on this resource first.
const USER_RESOURCE_KEY = '__user';
const USER_ATTR = `cs_e2e_clearance_${rand}`;
const ACTION = 'read';
const PERMISSION = `${RESOURCE_KEY}:${ACTION}`;
const TENANT = 'default';
const RULE = { user_set: USERSET_KEY, permission: PERMISSION, resource_set: RESOURCESET_KEY };

const documentInTenant = { type: RESOURCE_KEY, tenant: TENANT };

beforeAll(() => {
  ({ permit, logger } = createTestClient());
});

/** Rejects while a rule linking the two sets still grants the permission. */
async function expectRuleGone(): Promise<void> {
  const rules = await permit.api.conditionSetRules.list({
    userSetKey: USERSET_KEY,
    permissionKey: PERMISSION,
    resourceSetKey: RESOURCESET_KEY,
  });
  expect(rules).toEqual([]);
}

afterAll(async () => {
  if (!permit) return; // beforeAll never initialized the client (e.g. missing key)
  // Teardown in dependency order (rule -> condition sets -> user attribute -> users ->
  // resource). Every step runs even if an earlier one failed; a 404 means the entity was never
  // created. The rule is checked while its sets still exist, then each entity by its key.
  await cleanUp({
    [`condition set rule ${USERSET_KEY} -> ${RESOURCESET_KEY}`]: () =>
      permit.api.conditionSetRules.delete(RULE),
    [`check that the rule is gone`]: expectRuleGone,
    [`condition set ${USERSET_KEY}`]: () => permit.api.conditionSets.delete(USERSET_KEY),
    [`condition set ${RESOURCESET_KEY}`]: () => permit.api.conditionSets.delete(RESOURCESET_KEY),
    // The built-in '__user' resource itself is never deleted, only the attribute added to it.
    [`attribute ${USER_ATTR} of ${USER_RESOURCE_KEY}`]: () =>
      permit.api.resourceAttributes.delete(USER_RESOURCE_KEY, USER_ATTR),
    [`user ${MATCHING_USER_KEY}`]: () => permit.api.users.delete(MATCHING_USER_KEY),
    [`user ${OTHER_USER_KEY}`]: () => permit.api.users.delete(OTHER_USER_KEY),
    [`resource ${RESOURCE_KEY}`]: () => permit.api.resources.delete(RESOURCE_KEY),
  });

  await expectNotFound(permit.api.conditionSets.get(USERSET_KEY), `condition set ${USERSET_KEY}`);
  await expectNotFound(
    permit.api.conditionSets.get(RESOURCESET_KEY),
    `condition set ${RESOURCESET_KEY}`,
  );
  await expectNotFound(
    permit.api.resourceAttributes.get(USER_RESOURCE_KEY, USER_ATTR),
    `attribute ${USER_ATTR} of ${USER_RESOURCE_KEY}`,
  );
  await expectNotFound(permit.api.users.get(MATCHING_USER_KEY), `user ${MATCHING_USER_KEY}`);
  await expectNotFound(permit.api.users.get(OTHER_USER_KEY), `user ${OTHER_USER_KEY}`);
  await expectNotFound(permit.api.resources.get(RESOURCE_KEY), `resource ${RESOURCE_KEY}`);
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

  logger.info('registering the user attribute referenced by the userset condition');
  const userAttribute = await permit.api.resourceAttributes.create(USER_RESOURCE_KEY, {
    key: USER_ATTR,
    type: 'string',
  });
  expect(userAttribute.key).toBe(USER_ATTR);

  logger.info('creating the userset condition set (matches a user attribute)');
  const userSet = await permit.api.conditionSets.create({
    key: USERSET_KEY,
    name: USERSET_KEY,
    type: 'userset',
    conditions: {
      allOf: [{ [`user.${USER_ATTR}`]: { equals: 'top_secret' } }],
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
  const rule = await permit.api.conditionSetRules.create(RULE);
  expect(rule.user_set).toBe(USERSET_KEY);
  expect(rule.resource_set).toBe(RESOURCESET_KEY);
  expect(rule.permission).toBe(PERMISSION);

  logger.info('syncing a user that matches the userset, and one that does not');
  const { user: matchingUser } = await permit.api.users.sync({
    key: MATCHING_USER_KEY,
    attributes: { [USER_ATTR]: 'top_secret' },
  });
  expect(matchingUser.key).toBe(MATCHING_USER_KEY);
  expect(matchingUser.attributes).toHaveProperty([USER_ATTR], 'top_secret');

  const { user: otherUser } = await permit.api.users.sync({
    key: OTHER_USER_KEY,
    attributes: { [USER_ATTR]: 'public' },
  });
  expect(otherUser.key).toBe(OTHER_USER_KEY);

  const confidentialResource = { ...documentInTenant, attributes: { confidential: true } };

  // Positive ABAC check: the matching user reads a confidential document. It is polled until
  // the writes above have propagated from the control plane to the PDP. Condition sets compile
  // to new policy (rego), which takes longer to take effect than plain role/fact propagation,
  // so allow a wider budget.
  logger.info('positive ABAC check: matching user reads a confidential document');
  await waitForCheck(() => permit.check(MATCHING_USER_KEY, ACTION, confidentialResource), true, {
    timeoutMs: 180_000,
  });

  // The policy is in place now, so each half of the rule can be checked on its own.
  logger.info('negative ABAC check: non-matching user is denied');
  expect(await permit.check(OTHER_USER_KEY, ACTION, confidentialResource)).toBe(false);

  logger.info('negative ABAC check: matching user is denied a document that is not confidential');
  const publicResource = { ...documentInTenant, attributes: { confidential: false } };
  expect(await permit.check(MATCHING_USER_KEY, ACTION, publicResource)).toBe(false);
  expect(await permit.check(MATCHING_USER_KEY, ACTION, documentInTenant)).toBe(false);
});
