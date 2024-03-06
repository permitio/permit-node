import anyTest, { TestInterface } from 'ava';

import { provideTestExecutionContext, TestContext } from './fixtures';

const test = anyTest as TestInterface<TestContext>;
test.before(provideTestExecutionContext);
test('Bulk relationship tuples test', async (t) => {
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
    const result = await permit.api.relationshipTuples.bulkRelationshipTuples(tuples);
    // const array_test: any[] = result.operations;
    // const resultLength = array_test.length
    // t.is(resultLength, 2);
    // t.deepEqual(array_test[0], tuples[0]);
    // t.deepEqual(array_test[1], tuples[1]);
    // logger.info('Bulk relationship tuples test passed');
  } catch (error) {
    logger.error(`Got error: ${error}`);
    t.fail(`Got error: ${error}`);
  }
});

const test2 = anyTest as TestInterface<TestContext>;
test2.before(provideTestExecutionContext);
test2('Bulk users test', async (t) => {
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

const test4 = anyTest as TestInterface<TestContext>;
test4.before(provideTestExecutionContext);
test4('Bulk users replace test', async (t) => {
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

const test3 = anyTest as TestInterface<TestContext>;
test3.before(provideTestExecutionContext);
test3('Bulk users delete test', async (t) => {
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
