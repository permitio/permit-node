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
    logger.error('Result:', result.operations.toString());
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
