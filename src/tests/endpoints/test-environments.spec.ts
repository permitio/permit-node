import { randomUUID } from 'crypto';

import pino from 'pino';
import { type TestContext } from 'vitest';

import {
  ApiKeyLevel,
  type EnvironmentCreate,
  type EnvironmentRead,
  Permit,
  PermitApiError,
  PermitContextError,
  type ProjectCreate,
  type ProjectRead,
} from '#src/index';
import { cleanUp, createTestClient, handleApiError, isApiStatus } from '#src/tests/fixtures';

let logger: pino.Logger;

// The two suites below exercise org- and project-scoped clients (constructed at
// module scope). createTestClient() is still invoked in beforeAll so the suite
// honors the same PDP_API_KEY gate as the rest of the integration tests.
beforeAll(() => {
  ({ logger } = createTestClient());
});

// The org-level test reuses one project across runs, creating it when it is missing. The
// environments are unique to this run, so runs sharing the project never see each other's.
// CI's Node legs start together on separate runners, where pid and start time can match.
const RUN_ID = `${process.pid}-${Date.now()}-${randomUUID().slice(0, 8)}`;
const TEST_PROJECT: ProjectCreate = { key: 'test-node-proj', name: 'New Node Project' };
const CREATED_ENVIRONMENTS: EnvironmentCreate[] = [
  { key: `node-env-${RUN_ID}`, name: `Node Env ${RUN_ID}` },
  { key: `node-env-2-${RUN_ID}`, name: `Node Env 2 ${RUN_ID}` },
];
const CREATED_KEYS = CREATED_ENVIRONMENTS.map((env) => env.key);

const permitWithOrgLevelApiKey = new Permit({
  token: process.env['ORG_PDP_API_KEY'] || process.env['PDP_API_KEY'] || '',
  pdp: process.env['PDP_URL'] || 'http://localhost:7766',
  apiUrl: process.env['PDP_CONTROL_PLANE'] || 'https://api.permit.io',
  log: {
    level: 'debug',
  },
});

const permitWithProjectLevelApiKey = new Permit({
  token: process.env['PROJECT_PDP_API_KEY'] || process.env['PDP_API_KEY'] || '',
  pdp: process.env['PDP_URL'] || 'http://localhost:7766',
  apiUrl: process.env['PDP_CONTROL_PLANE'] || 'https://api.permit.io',
  log: {
    level: 'debug',
  },
});

/** Deletes this run's environments from the project, tolerating ones that were never created. */
function deleteCreatedEnvironments(client: Permit, projectKey: string): Promise<void> {
  const steps: Record<string, () => Promise<void>> = {};
  for (const key of CREATED_KEYS) {
    steps[`environment ${key} in project ${projectKey}`] = () =>
      client.api.environments.delete(projectKey, key);
  }
  return cleanUp(steps);
}

/** Rethrows a REST API error with the failed request in its message; other errors unchanged. */
async function describeApiErrors(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof PermitApiError) {
      handleApiError(error, 'Got API Error', logger);
    }
    throw error;
  }
}

async function getOrCreateProject(client: Permit, project: ProjectCreate): Promise<ProjectRead> {
  try {
    return await client.api.projects.create(project);
  } catch (error) {
    if (!isApiStatus(error, 409)) {
      throw error;
    }
    logger.info(`project ${project.key} already exists, reading it`);
    return await client.api.projects.get(project.key);
  }
}

async function createEnvironments(client: Permit, project: ProjectRead): Promise<void> {
  for (const environmentData of CREATED_ENVIRONMENTS) {
    logger.info(`creating environment: ${environmentData.key}`);
    const environment: EnvironmentRead = await client.api.environments.create(
      project.key,
      environmentData,
    );
    expect(environment.key).toBe(environmentData.key);
    expect(environment.name).toBe(environmentData.name);
    // The API returns null for a description that was never set.
    expect(environment.description ?? undefined).toBe(environmentData.description);
    expect(environment.project_id).toBe(project.id);
  }
}

async function expectCreatedEnvironmentsListed(client: Permit, projectKey: string): Promise<void> {
  const environments = await client.api.environments.list({ projectKey });
  const listedKeys = environments.map((env) => env.key);
  expect(listedKeys).toEqual(expect.arrayContaining(CREATED_KEYS));
}

/**
 * Skips the current test when the client's API key is scoped below `level`. A failure to read
 * the key's scope, such as a network or authentication error, still fails the test.
 */
async function skipUnlessKeyLevel(
  ctx: TestContext,
  client: Permit,
  level: ApiKeyLevel,
  keyVariable: string,
): Promise<void> {
  try {
    await client.api.ensureAccessLevel(level);
  } catch (error) {
    const scopeKnown = client.config.apiContext.permittedAccessLevel !== ApiKeyLevel.WAIT_FOR_INIT;
    if (error instanceof PermitContextError && scopeKnown) {
      ctx.skip(`requires ${level} in ${keyVariable}`);
    }
    throw error;
  }
}

it('environment creation with org level api key', async (ctx) => {
  const client = permitWithOrgLevelApiKey;

  await skipUnlessKeyLevel(ctx, client, ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY, 'ORG_PDP_API_KEY');
  expect(client.config.apiContext.permittedAccessLevel).toBe(
    ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY,
  );

  await describeApiErrors(async () => {
    logger.info(`getting or creating project: ${TEST_PROJECT.key}`);
    const project = await getOrCreateProject(client, TEST_PROJECT);
    expect(project.key).toBe(TEST_PROJECT.key);
    expect(project.name).toBe(TEST_PROJECT.name);
    expect(project.description ?? undefined).toBe(TEST_PROJECT.description);

    ctx.onTestFinished(() => deleteCreatedEnvironments(client, project.key));
    await createEnvironments(client, project);
    await expectCreatedEnvironmentsListed(client, project.key);

    const [firstEnvironment] = CREATED_ENVIRONMENTS;
    assert(firstEnvironment !== undefined);
    const testEnvironment = await client.api.environments.get(project.key, firstEnvironment.key);
    expect(testEnvironment.key).toBe(firstEnvironment.key);
    expect(testEnvironment.name).toBe(firstEnvironment.name);
    expect(testEnvironment.description ?? undefined).toBe(firstEnvironment.description);
  });
});

it('environment creation with project level api key', async (ctx) => {
  const client = permitWithProjectLevelApiKey;

  await skipUnlessKeyLevel(ctx, client, ApiKeyLevel.PROJECT_LEVEL_API_KEY, 'PROJECT_PDP_API_KEY');
  expect(client.config.apiContext.permittedAccessLevel).toBe(ApiKeyLevel.PROJECT_LEVEL_API_KEY);

  await describeApiErrors(async () => {
    const projectId = client.config.apiContext.project;
    expect(projectId).toBeTruthy();

    const project = await client.api.projects.get(String(projectId));
    expect(String(project.id)).toBe(String(projectId));

    ctx.onTestFinished(() => deleteCreatedEnvironments(client, project.key));
    await createEnvironments(client, project);
    await expectCreatedEnvironmentsListed(client, project.key);
  });
});
