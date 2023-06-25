import anyTest, { ExecutionContext, TestInterface } from 'ava';

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
import { handleApiError, printBreak, provideTestExecutionContext, TestContext } from '../fixtures';

const test = anyTest as TestInterface<TestContext>;
test.before(provideTestExecutionContext);

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

async function cleanup(permit: Permit, projectKey: string, t: ExecutionContext<TestContext>) {
  t.context.logger.info('Running cleanup...');
  for (const env of CREATED_ENVIRONMENTS) {
    try {
      await permit.api.environments.delete(projectKey, env.key);
    } catch (error) {
      if (error instanceof PermitApiError && error.response?.status === 404) {
        t.context.logger.info(
          `SKIPPING delete, env does not exist: ${env.key}, project_key=${projectKey}`,
        );
      }
    }
  }
  printBreak();
}

test.serial('environment creation with org level api key', async (t) => {
  const permit = permitWithOrgLevelApiKey;
  t.context.logger.info(`token: ${permit.config.token}`);

  try {
    await permit.api.ensureAccessLevel(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
  } catch (error) {
    t.context.logger.warn('this test must run with an org level api key');
    return;
  }
  t.is(permit.config.apiContext.permittedAccessLevel, ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);

  try {
    await cleanup(permit, TEST_PROJECT_KEY, t);
    const projects: ProjectRead[] = [];
    for (const projectData of CREATED_PROJECTS) {
      t.context.logger.info(`trying to creating project: ${projectData.key}`);
      try {
        let project: ProjectRead;
        try {
          project = await permit.api.projects.create(projectData);
        } catch (error) {
          if (error instanceof PermitApiError && error.response?.status === 409) {
            t.context.logger.info(`SKIPPING create, project already exists: ${projectData.key}`);
          }
          project = await permit.api.projects.get(projectData.key);
        }
        projects.push(project);
        t.truthy(project);
        t.is(project.key, projectData.key);
        t.is(project.name, projectData.name);
        t.true(project.description == projectData.description); // will compare null and undefined as well
      } catch (error) {
        if (error instanceof PermitApiError) {
          handleApiError(error, 'Got API Error', t);
        } else if (error instanceof PermitConnectionError) {
          throw error;
        } else {
          t.context.logger.error(`Got error: ${error}`);
          t.fail(`Got error: ${error}`);
        }
      }
    }

    printBreak();

    const environmentsOriginal = await permit.api.environments.list({
      projectKey: projects[0]?.key,
    });
    const originalNumOfEnvs = environmentsOriginal.length;

    for (const environmentData of CREATED_ENVIRONMENTS) {
      t.context.logger.info(`creating environment: ${environmentData.key}`);
      const environment: EnvironmentRead = await permit.api.environments.create(
        projects[0].key,
        environmentData,
      );
      t.truthy(environment);
      t.is(environment.key, environmentData.key);
      t.is(environment.name, environmentData.name);
      t.true(environment.description == environmentData.description); // will compare null and undefined as well
      t.is(environment.project_id, projects[0].id);
    }

    printBreak();

    const environments = await permit.api.environments.list({ projectKey: projects[0]?.key });
    t.context.logger.info(`environments: ${environments.map((e) => e.key)}`);
    t.is(environments.length, CREATED_ENVIRONMENTS.length + originalNumOfEnvs); // each project has 2 default `dev` and `prod` environments

    const testEnvironment = await permit.api.environments.get(
      TEST_PROJECT_KEY,
      CREATED_ENVIRONMENTS[0].key,
    );

    t.truthy(testEnvironment);
    t.is(testEnvironment.key, CREATED_ENVIRONMENTS[0].key);
    t.is(testEnvironment.name, CREATED_ENVIRONMENTS[0].name);
    t.true(testEnvironment.description == CREATED_ENVIRONMENTS[0].description); // will compare null and undefined as well
  } catch (error) {
    t.context.logger.error(`Got error: ${error}`);
    t.fail(`Got error: ${error}`);
  } finally {
    printBreak();
    await cleanup(permit, TEST_PROJECT_KEY, t);
  }
});

test.serial('environment creation with project level api key', async (t) => {
  const permit = permitWithProjectLevelApiKey;

  try {
    await permit.api.ensureAccessLevel(ApiKeyLevel.PROJECT_LEVEL_API_KEY);
  } catch (error) {
    t.context.logger.warning('this test must run with a project level api key');
    return;
  }
  t.is(permit.config.apiContext.permittedAccessLevel, ApiKeyLevel.PROJECT_LEVEL_API_KEY);

  try {
    const project = permit.config.apiContext.project;
    t.truthy(project);
    const projectId = String(project);

    const projectRead = await permit.api.projects.get(projectId);
    t.is(String(projectRead.id), projectId);

    await cleanup(permit, projectRead.key, t);

    for (const environmentData of CREATED_ENVIRONMENTS) {
      t.context.logger.info(`creating environment: ${environmentData.key}`);
      const environment: EnvironmentRead = await permit.api.environments.create(
        projectRead.key,
        environmentData,
      );
      t.truthy(environment);
      t.is(environment.key, environmentData.key);
      t.is(environment.name, environmentData.name);
      t.true(environment.description == environmentData.description); // will compare null and undefined as well
      t.is(environment.project_id, projectRead.id);
    }

    const environments = await permit.api.environments.list({ projectKey: projectRead?.key });
    const actualEnvSet = environments.map((env) => env.key);
    const createdEnvSet = new Set(CREATED_ENVIRONMENTS.map((env) => env.key));
    const intersection = new Set(actualEnvSet.filter((x) => createdEnvSet.has(x)));
    t.is(intersection.size, 2);
  } catch (error) {
    if (error instanceof PermitApiError) {
      handleApiError(error, 'Got API Error', t);
    } else if (error instanceof PermitConnectionError) {
      throw error;
    } else {
      t.context.logger.error(`Got error: ${error}`);
      t.fail(`Got error: ${error}`);
    }
  } finally {
    await cleanup(permit, TEST_PROJECT_KEY, t);
  }
});
