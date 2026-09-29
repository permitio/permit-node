import pino from 'pino';

import {
  ApiKeyLevel,
  EnvironmentCreate,
  EnvironmentRead,
  Permit,
  PermitApiError,
  PermitConnectionError,
  ProjectCreate,
  ProjectRead,
} from '../../index';
import { createTestClient, handleApiError, printBreak } from '../fixtures';

let logger: pino.Logger;

// The two suites below exercise org- and project-scoped clients (constructed at
// module scope). createTestClient() is still invoked in beforeAll so the suite
// honors the same PDP_API_KEY gate as the rest of the integration tests.
beforeAll(() => {
  ({ logger } = createTestClient());
});

const TEST_PROJECT_KEY = 'test-node-proj';
const CREATED_PROJECTS: ProjectCreate[] = [{ key: TEST_PROJECT_KEY, name: 'New Node Project' }];
const CREATED_ENVIRONMENTS: EnvironmentCreate[] = [
  { key: 'my-node-env', name: 'My Node Env' },
  { key: 'my-node-env-2', name: 'My Node Env 2' },
];

const permitWithOrgLevelApiKey = new Permit({
  token: process.env.ORG_PDP_API_KEY || process.env.PDP_API_KEY || '',
  pdp: process.env.PDP_URL || 'http://localhost:7766',
  apiUrl: process.env.PDP_CONTROL_PLANE || 'https://api.permit.io',
  log: {
    level: 'debug',
  },
});

const permitWithProjectLevelApiKey = new Permit({
  token: process.env.PROJECT_PDP_API_KEY || process.env.PDP_API_KEY || '',
  pdp: process.env.PDP_URL || 'http://localhost:7766',
  apiUrl: process.env.PDP_CONTROL_PLANE || 'https://api.permit.io',
  log: {
    level: 'debug',
  },
});

async function cleanup(client: Permit, projectKey: string) {
  logger.info('Running cleanup...');
  for (const env of CREATED_ENVIRONMENTS) {
    try {
      await client.api.environments.delete(projectKey, env.key);
    } catch (error) {
      if (error instanceof PermitApiError && error.response?.status === 404) {
        logger.info(`SKIPPING delete, env does not exist: ${env.key}, project_key=${projectKey}`);
      }
    }
  }
  printBreak();
}

it('environment creation with org level api key', async () => {
  const client = permitWithOrgLevelApiKey;
  logger.info(`token: ${client.config.token}`);

  try {
    await client.api.ensureAccessLevel(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
  } catch (error) {
    logger.warn('this test must run with an org level api key');
    return;
  }
  expect(client.config.apiContext.permittedAccessLevel).toBe(
    ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY,
  );

  try {
    await cleanup(client, TEST_PROJECT_KEY);
    const projects: ProjectRead[] = [];
    for (const projectData of CREATED_PROJECTS) {
      logger.info(`trying to creating project: ${projectData.key}`);
      try {
        let project: ProjectRead;
        try {
          project = await client.api.projects.create(projectData);
        } catch (error) {
          if (error instanceof PermitApiError && error.response?.status === 409) {
            logger.info(`SKIPPING create, project already exists: ${projectData.key}`);
          }
          project = await client.api.projects.get(projectData.key);
        }
        projects.push(project);
        expect(project).toBeTruthy();
        expect(project.key).toBe(projectData.key);
        expect(project.name).toBe(projectData.name);
        expect(project.description == projectData.description).toBe(true); // will compare null and undefined as well
      } catch (error) {
        if (error instanceof PermitApiError) {
          handleApiError(error, 'Got API Error', logger);
        } else if (error instanceof PermitConnectionError) {
          throw error;
        } else {
          logger.error(`Got error: ${error}`);
          throw new Error(`Got error: ${error}`);
        }
      }
    }

    printBreak();

    const environmentsOriginal = await client.api.environments.list({
      projectKey: projects[0]?.key,
    });
    const originalNumOfEnvs = environmentsOriginal.length;

    for (const environmentData of CREATED_ENVIRONMENTS) {
      logger.info(`creating environment: ${environmentData.key}`);
      const environment: EnvironmentRead = await client.api.environments.create(
        projects[0].key,
        environmentData,
      );
      expect(environment).toBeTruthy();
      expect(environment.key).toBe(environmentData.key);
      expect(environment.name).toBe(environmentData.name);
      expect(environment.description == environmentData.description).toBe(true); // will compare null and undefined as well
      expect(environment.project_id).toBe(projects[0].id);
    }

    printBreak();

    const environments = await client.api.environments.list({ projectKey: projects[0]?.key });
    logger.info(`environments: ${environments.map((e) => e.key)}`);
    expect(environments.length).toBe(CREATED_ENVIRONMENTS.length + originalNumOfEnvs); // each project has 2 default `dev` and `prod` environments

    const testEnvironment = await client.api.environments.get(
      TEST_PROJECT_KEY,
      CREATED_ENVIRONMENTS[0].key,
    );

    expect(testEnvironment).toBeTruthy();
    expect(testEnvironment.key).toBe(CREATED_ENVIRONMENTS[0].key);
    expect(testEnvironment.name).toBe(CREATED_ENVIRONMENTS[0].name);
    expect(testEnvironment.description == CREATED_ENVIRONMENTS[0].description).toBe(true); // will compare null and undefined as well
  } finally {
    printBreak();
    await cleanup(client, TEST_PROJECT_KEY);
  }
});

it('environment creation with project level api key', async () => {
  const client = permitWithProjectLevelApiKey;

  try {
    await client.api.ensureAccessLevel(ApiKeyLevel.PROJECT_LEVEL_API_KEY);
  } catch (error) {
    logger.warn('this test must run with a project level api key');
    return;
  }
  expect(client.config.apiContext.permittedAccessLevel).toBe(ApiKeyLevel.PROJECT_LEVEL_API_KEY);

  try {
    const project = client.config.apiContext.project;
    expect(project).toBeTruthy();
    const projectId = String(project);

    const projectRead = await client.api.projects.get(projectId);
    expect(String(projectRead.id)).toBe(projectId);

    await cleanup(client, projectRead.key);

    for (const environmentData of CREATED_ENVIRONMENTS) {
      logger.info(`creating environment: ${environmentData.key}`);
      const environment: EnvironmentRead = await client.api.environments.create(
        projectRead.key,
        environmentData,
      );
      expect(environment).toBeTruthy();
      expect(environment.key).toBe(environmentData.key);
      expect(environment.name).toBe(environmentData.name);
      expect(environment.description == environmentData.description).toBe(true); // will compare null and undefined as well
      expect(environment.project_id).toBe(projectRead.id);
    }

    const environments = await client.api.environments.list({ projectKey: projectRead?.key });
    const actualEnvSet = environments.map((env) => env.key);
    const createdEnvSet = new Set(CREATED_ENVIRONMENTS.map((env) => env.key));
    const intersection = new Set(actualEnvSet.filter((x) => createdEnvSet.has(x)));
    expect(intersection.size).toBe(2);
  } catch (error) {
    if (error instanceof PermitApiError) {
      handleApiError(error, 'Got API Error', logger);
    } else if (error instanceof PermitConnectionError) {
      throw error;
    } else {
      logger.error(`Got error: ${error}`);
      throw new Error(`Got error: ${error}`);
    }
  } finally {
    await cleanup(client, TEST_PROJECT_KEY);
  }
});
