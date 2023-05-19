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
  /**
   * Retrieves a list of projects.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of projects.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  list(pagination?: IPagination): Promise<ProjectRead[]>;

  /**
   * Retrieves a project by its key.
   *
   * @param projectKey The key of the project.
   * @returns A promise that resolves to the project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  get(projectKey: string): Promise<ProjectRead>;

  /**
   * Retrieves a project by its key.
   * Alias for the {@link get} method.
   *
   * @param projectKey The key of the project.
   * @returns A promise that resolves to the project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getByKey(projectKey: string): Promise<ProjectRead>;

  /**
   * Retrieves a project by its ID.
   * Alias for the {@link get} method.
   *
   * @param projectId The ID of the project.
   * @returns A promise that resolves to the project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  getById(projectId: string): Promise<ProjectRead>;

  /**
   * Creates a new project.
   *
   * @param projectData The data for the new project.
   * @returns A promise that resolves to the created project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  create(projectData: ProjectCreate): Promise<ProjectRead>;

  /**
   * Updates a project.
   *
   * @param projectKey The key of the project.
   * @param projectData The updated data for the project.
   * @returns A promise that resolves to the updated project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  update(projectKey: string, projectData: ProjectUpdate): Promise<ProjectRead>;

  /**
   * Deletes a project.
   *
   * @param projectKey The key of the project to delete.
   * @returns A promise that resolves when the project is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  delete(projectKey: string): Promise<void>;
}

/**
 * The ProjectsApi class provides methods for interacting with Permit Projects.
 */
export class ProjectsApi extends BasePermitApi implements IProjectsApi {
  private projects: AutogenProjectsApi;

  /**
   * Creates an instance of the ProjectsApi.
   * @param config - The configuration object for the Permit SDK.
   * @param logger - The logger instance for logging.
   */
  constructor(config: IPermitConfig, logger: Logger) {
    super(config, logger);
    this.projects = new AutogenProjectsApi(
      this.openapiClientConfig,
      BASE_PATH,
      this.config.axiosInstance,
    );
  }

  /**
   * Retrieves a list of projects.
   *
   * @param pagination The pagination options, @see {@link IPagination}
   * @returns A promise that resolves to an array of projects.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Retrieves a project by its key.
   *
   * @param projectKey The key of the project.
   * @returns A promise that resolves to the project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Retrieves a project by its key.
   * Alias for the {@link get} method.
   *
   * @param projectKey The key of the project.
   * @returns A promise that resolves to the project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getByKey(projectKey: string): Promise<ProjectRead> {
    return await this.get(projectKey);
  }

  /**
   * Retrieves a project by its ID.
   * Alias for the {@link get} method.
   *
   * @param projectId The ID of the project.
   * @returns A promise that resolves to the project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
  public async getById(projectId: string): Promise<ProjectRead> {
    return await this.get(projectId);
  }

  /**
   * Creates a new project.
   *
   * @param projectData The data for the new project.
   * @returns A promise that resolves to the created project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Updates a project.
   *
   * @param projectKey The key of the project.
   * @param projectData The updated data for the project.
   * @returns A promise that resolves to the updated project.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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

  /**
   * Deletes a project.
   *
   * @param projectKey The key of the project to delete.
   * @returns A promise that resolves when the project is deleted.
   * @throws {PermitApiError} If the API returns an error HTTP status code.
   * @throws {PermitContextError} If the configured {@link ApiContext} does not match the required endpoint context.
   */
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
