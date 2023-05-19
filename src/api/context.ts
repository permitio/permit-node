/**
 * The `ApiKeyLevel` enum represents the levels of API key authorization in Permit.
 */
export enum ApiKeyLevel {
  /**
   * Wait for initialization of the API key.
   */
  WAIT_FOR_INIT = 'WAIT_FOR_INIT',

  /**
   * Organization level API key authorization.
   * Using an API key of this scope will allow the SDK user to modify
   * all projects and environments under the organization / workspace.
   */
  ORGANIZATION_LEVEL_API_KEY = 'ORGANIZATION_LEVEL_API_KEY',

  /**
   * Project level API key authorization.
   * Using an API key of this scope will allow the SDK user to modify
   * a single project and the environments under that project.
   */
  PROJECT_LEVEL_API_KEY = 'PROJECT_LEVEL_API_KEY',

  /**
   * Environment level API key authorization.
   * Using an API key of this scope will allow the SDK user to modify
   * a single Permit environment.
   */
  ENVIRONMENT_LEVEL_API_KEY = 'ENVIRONMENT_LEVEL_API_KEY',
}

/**
 * The `PermitContextError` class represents an error that occurs when an API method
 * is called with either insufficient level of API key authorization (i.e: trying to
 * modify an object without proper access) or trying to call an API method that requires
 * a lower level of API key authorization in order to extract implicit context (i.e: most
 * API Methods expects an Environment-level API key so the environment could be implicitly
 * inferred from the API key itself).
 */
export class PermitContextError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * The `ApiContext` class represents the context for API key authorization in Permit.
 * It allows setting and retrieving the API Key context to be either:
 * organization-level context, project-level context, or environment-level context.
 */
export class ApiContext {
  private _level: ApiKeyLevel;
  private _organization: string | null;
  private _project: string | null;
  private _environment: string | null;

  constructor() {
    this._level = ApiKeyLevel.WAIT_FOR_INIT;
    this._organization = null;
    this._project = null;
    this._environment = null;
  }

  /**
   * Get the current API key level.
   */
  public get level(): ApiKeyLevel {
    return this._level;
  }

  /**
   * Get the current organization in the context.
   */
  public get organization(): string | null {
    return this._organization;
  }

  /**
   * Get the current project in the context.
   */
  public get project(): string | null {
    return this._project;
  }

  /**
   * Get the current environment in the context.
   */
  public get environment(): string | null {
    return this._environment;
  }

  /**
   * Set the context to organization level.
   * @param org The organization key.
   */
  public setOrganizationLevelContext(org: string) {
    this._level = ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY;
    this._organization = org;
    this._project = null;
    this._environment = null;
  }

  /**
   * Set the context to project level.
   * @param org The organization key.
   * @param project The project key.
   */
  public setProjectLevelContext(org: string, project: string) {
    this._level = ApiKeyLevel.PROJECT_LEVEL_API_KEY;
    this._organization = org;
    this._project = project;
    this._environment = null;
  }

  /**
   * Set the context to environment level.
   * @param org The organization key.
   * @param project The project key.
   * @param environment The environment key.
   */
  public setEnvironmentLevelContext(org: string, project: string, environment: string) {
    this._level = ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY;
    this._organization = org;
    this._project = project;
    this._environment = environment;
  }

  /**
   * Get the API project and environment parameters from an environment-level context.
   * @returns An object containing the project and environment IDs.
   * @throws {PermitContextError} If the API context is not set to environment level or the project or environment is null.
   */
  public get environmentContext(): { projId: string; envId: string } {
    if (
      this._level !== ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY ||
      this._project === null ||
      this._environment === null
    ) {
      throw new PermitContextError(
        `You cannot get environment context, current api context is: ${this._level.toString()}`,
      );
    }
    return {
      projId: this._project,
      envId: this._environment,
    };
  }
}
