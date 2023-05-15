import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  EnvironmentsApi as AutogenEnvironmentsApi,
  EnvironmentCopy,
  EnvironmentCreate,
  EnvironmentRead,
  EnvironmentUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IListEnvironments extends IPagination {
  projectKey: string;
}

export interface IEnvironmentsApi {
  list(params: IListEnvironments): Promise<EnvironmentRead[]>;
  get(projectKey: string, environmentKey: string): Promise<EnvironmentRead>;
  getByKey(projectKey: string, environmentKey: string): Promise<EnvironmentRead>;
  getById(projectId: string, environmentId: string): Promise<EnvironmentRead>;
  create(projectKey: string, environmentData: EnvironmentCreate): Promise<EnvironmentRead>;
  update(
    projectKey: string,
    environmentKey: string,
    environmentData: EnvironmentUpdate,
  ): Promise<EnvironmentRead>;
  copy(
    projectKey: string,
    environmentKey: string,
    copyParams: EnvironmentCopy,
  ): Promise<EnvironmentRead>;
  delete(projectKey: string, environmentKey: string): Promise<void>;
}

export class EnvironmentsApi extends BasePermitApi implements IEnvironmentsApi {
  private environments: AutogenEnvironmentsApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.environments = new AutogenEnvironmentsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  public async list(params: IListEnvironments): Promise<EnvironmentRead[]> {
    const { projectKey, page = 1, perPage = 100 } = params;
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.listEnvironments({
          projId: projectKey,
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async get(projectKey: string, environmentKey: string): Promise<EnvironmentRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.getEnvironment({
          projId: projectKey,
          envId: environmentKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async getByKey(projectKey: string, environmentKey: string): Promise<EnvironmentRead> {
    return await this.get(projectKey, environmentKey);
  }

  public async getById(projectId: string, environmentId: string): Promise<EnvironmentRead> {
    return await this.get(projectId, environmentId);
  }

  public async create(
    projectKey: string,
    environmentData: EnvironmentCreate,
  ): Promise<EnvironmentRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.createEnvironment({
          projId: projectKey,
          environmentCreate: environmentData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async update(
    projectKey: string,
    environmentKey: string,
    environmentData: EnvironmentUpdate,
  ): Promise<EnvironmentRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.updateEnvironment({
          projId: projectKey,
          envId: environmentKey,
          environmentUpdate: environmentData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async copy(
    projectKey: string,
    environmentKey: string,
    copyParams: EnvironmentCopy,
  ): Promise<EnvironmentRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.environments.copyEnvironment({
          projId: projectKey,
          envId: environmentKey,
          environmentCopy: copyParams,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async delete(projectKey: string, environmentKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      await this.environments.deleteEnvironment({
        projId: projectKey,
        envId: environmentKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
