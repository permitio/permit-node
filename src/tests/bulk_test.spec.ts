import anyTest, { TestInterface } from 'ava';

import { provideTestExecutionContext, TestContext } from './fixtures';

const test_relationship_tuples = anyTest as TestInterface<TestContext>;
test_relationship_tuples.before(provideTestExecutionContext);
test_relationship_tuples('Bulk relationship tuples test', async (t) => {
  const permit = t.context.permit;
  const logger = t.context.logger;

  try {
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
    await permit.api.relationshipTuples.bulkRelationshipTuples(tuples);
  } catch (error) {
    logger.error(`Got error: ${error}`);
    t.fail(`Got error: ${error}`);
  }
});

const test_bulk_add_users = anyTest as TestInterface<TestContext>;
test_bulk_add_users.before(provideTestExecutionContext);
test_bulk_add_users('Bulk users test', async (t) => {
  const permit = t.context.permit;
  const logger = t.context.logger;

  try {
    const users = [
      {
        key: 'user_maya_test_1',
      },
      {
        key: 'user_maya_test_2',
      },
    ];
    logger.info('users: ' + JSON.stringify(users));
    await permit.api.users.bulkUserCreate(users);
  } catch (error) {
    logger.error(`Got error: ${error}`);
    t.fail(`Got error: ${error}`);
  }
});

const test_bulk_replace_users = anyTest as TestInterface<TestContext>;
test_bulk_replace_users.before(provideTestExecutionContext);
test_bulk_replace_users('Bulk users replace test', async (t) => {
  const permit = t.context.permit;
  const logger = t.context.logger;

  try {
    const users = [
      {
        key: 'user_maya_test_1',
        first_name: '1',
      },
      {
        key: 'user_maya_test_2',
        first_name: '2',
      },
    ];
    logger.info('users: ' + JSON.stringify(users));
    await permit.api.users.bulkUserReplace(users);
  } catch (error) {
    logger.error(`Got error: ${error}`);
    t.fail(`Got error: ${error}`);
  }
});

const test_bulk_delete_users = anyTest as TestInterface<TestContext>;
test_bulk_delete_users.before(provideTestExecutionContext);
test_bulk_delete_users('Bulk users delete test', async (t) => {
  const permit = t.context.permit;
  const logger = t.context.logger;

  try {
    const users = [
      {
        key: 'user_maya_1',
      },
      {
        key: 'user_maya_2',
      },
    ];
    logger.info('users: ' + JSON.stringify(users));
    await permit.api.users.bulkUserCreate(users);
    const users_key = ['user_maya_1', 'user_maya_2'];
    logger.info('users: ' + JSON.stringify(users_key));
    await permit.api.users.bulkUserDelete(users_key);
  } catch (error) {
    logger.error(`Got error: ${error}`);
    t.fail(`Got error: ${error}`);
  }
});
