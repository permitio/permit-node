import { Logger } from 'winston';

import { IPermitConfig } from '../config';
import {
  ProjectsApi as AutogenProjectsApi,
  ProjectCreate,
  ProjectRead,
  ProjectUpdate,
} from '../openapi';
import { BASE_PATH } from '../openapi/base';

import { BasePermitApi, IPagination } from './base';
import { ApiKeyLevel } from './context';

export interface IProjectsApi {
  list(pagination?: IPagination): Promise<ProjectRead[]>;
  get(projectKey: string): Promise<ProjectRead>;
  getByKey(projectKey: string): Promise<ProjectRead>;
  getById(projectId: string): Promise<ProjectRead>;
  create(projectData: ProjectCreate): Promise<ProjectRead>;
  update(projectKey: string, projectData: ProjectUpdate): Promise<ProjectRead>;
  delete(projectKey: string): Promise<void>;
}

export class ProjectsApi extends BasePermitApi implements IProjectsApi {
  private projects: AutogenProjectsApi;

  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.projects = new AutogenProjectsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  public async list(pagination?: IPagination): Promise<ProjectRead[]> {
    const { page = 1, perPage = 100 } = pagination ?? {};
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.projects.listProjects({
          page,
          perPage,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async get(projectKey: string): Promise<ProjectRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.projects.getProject({
          projId: projectKey,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async getByKey(projectKey: string): Promise<ProjectRead> {
    return await this.get(projectKey);
  }

  public async getById(projectId: string): Promise<ProjectRead> {
    return await this.get(projectId);
  }

  public async create(projectData: ProjectCreate): Promise<ProjectRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.projects.createProject({
          projectCreate: projectData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async update(projectKey: string, projectData: ProjectUpdate): Promise<ProjectRead> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      return (
        await this.projects.updateProject({
          projId: projectKey,
          projectUpdate: projectData,
        })
      ).data;
    } catch (err) {
      this.handleApiError(err);
    }
  }

  public async delete(projectKey: string): Promise<void> {
    await this.ensureContext(ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY);
    try {
      await this.projects.deleteProject({
        projId: projectKey,
      });
    } catch (err) {
      this.handleApiError(err);
    }
  }
}
