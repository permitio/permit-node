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
        subject: 'user:alice',
        relation: 'can_access',
        object: 'resource:document',
        tenant: 'public',
      },
      {
        subject: 'user:bob',
        relation: 'can_access',
        object: 'resource:document',
        tenant: 'public',
      },
    ];

    logger.info('Tuples: ' + JSON.stringify(tuples));

    const result = await permit.api.relationshipTuples.bulkRelationshipTuples(tuples);
    logger.info('Result:', result);

    const resultLength = result.operations.length;
    t.is(resultLength, 2);
    t.deepEqual(result.operations[0], tuples[0]);
    t.deepEqual(result.operations[1], tuples[1]);
    logger.info('Bulk relationship tuples test passed');
  } catch (error) {
    logger.error(`Got error: ${error}`);
    t.fail(`Got error: ${error}`);
  }
});
