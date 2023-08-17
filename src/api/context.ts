/**
 * The `ApiKeyLevel` enum represents the access level of a Permit API Key.
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

export const API_ACCESS_LEVELS: ApiKeyLevel[] = [
  ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY,
  ApiKeyLevel.PROJECT_LEVEL_API_KEY,
  ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY,
];

export enum ApiContextLevel {
  /**
   * Signifies that the context is not set yet.
   */
  WAIT_FOR_INIT = 0,

  /**
   * When running in this context level, the SDK knows the current organization.
   */
  ORGANIZATION = 1,

  /**
   * When running in this context level, the SDK knows the current organization and project.
   */
  PROJECT = 2,

  /**
   * When running in this context level, the SDK knows the current organization, project and environment.
   */
  ENVIRONMENT = 3,
}

/**
 * The `PermitContextError` class represents an error that occurs when an API method
 * is called with insufficient context (not knowing in what environment, project or
 * organization the API call is being made).
 * Some of the input for the API method is provided via the SDK context.
 * If the context is missing some data required for a method - the API call will fail.
 */
export class PermitContextError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * The `PermitContextChangeError` will be thrown when the user is trying to set the
 * SDK context to an object that the current API Key cannot access (and if allowed,
 * such API calls will result in 401). Instead, the SDK throws this exception.
 */
export class PermitContextChangeError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * The `ApiContext` class represents the required known context for an API method.
 * Since the Permit API hierarchy is deeply nested, it is less convenient to specify
 * the full object hierarchy in every request.
 * For example, in order to list roles, the user needs to specify the (id or key) of the:
 * - the org
 * - the project
 * - then environment
 * in which the roles are located under.
 * Instead, the SDK can "remember" the current context and "auto-complete" the details
 * from that context.
 * We then get this kind of experience:
 * ```
 * await permit.api.roles.list()
 * ```
 * We can only run this function if the current context already knows the org, project,
 * and environments that we want to run under, and that is why this method assumes
 * we are running under a `ApiContextLevel.ENVIRONMENT` context.
 */
export class ApiContext {
  private _level: ApiKeyLevel;
  // org, project and environment the API Key is allowed to access
  private _permittedOrganization: string | null;
  private _permittedProject: string | null;
  private _permittedEnvironment: string | null;

  // current known context
  private _contextLevel: ApiContextLevel;
  private _organization: string | null;
  private _project: string | null;
  private _environment: string | null;

  constructor() {
    this._level = ApiKeyLevel.WAIT_FOR_INIT;
    this._permittedOrganization = null;
    this._permittedProject = null;
    this._permittedEnvironment = null;

    this._contextLevel = ApiContextLevel.WAIT_FOR_INIT;
    this._organization = null;
    this._project = null;
    this._environment = null;
  }

  /**
   * Do not call this method directly!
   */
  public _saveApiKeyAccessibleScope(org: string, project?: string, environment?: string): void {
    this._permittedOrganization = org; // cannot be null

    if (project && environment) {
      this._permittedProject = project;
      this._permittedEnvironment = environment;
      this._level = ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY;
    } else if (project) {
      this._permittedProject = project;
      this._permittedEnvironment = null;
      this._level = ApiKeyLevel.PROJECT_LEVEL_API_KEY;
    } else {
      this._permittedProject = null;
      this._permittedEnvironment = null;
      this._level = ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY;
    }
  }

  /**
   * Get the current API key access level.
   */
  public get permittedAccessLevel(): ApiKeyLevel {
    return this._level;
  }

  /**
   * Get the current API key level.
   * @deprecated replaced with permit.config.apiContext.permittedAccessLevel
   */
  public get level(): ApiKeyLevel {
    return this._level;
  }

  /**
   * Get the current SDK context level.
   */
  public get contextLevel(): ApiContextLevel {
    return this._contextLevel;
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

  private verifyCanAccessOrg(org: string): void {
    if (org !== this._permittedOrganization) {
      throw new PermitContextChangeError(
        `You cannot set an SDK context with org '${org}' due to insufficient API Key permissions`,
      );
    }
  }

  private verifyCanAccessProject(org: string, project: string): void {
    this.verifyCanAccessOrg(org);
    if (this._permittedProject !== null && project !== this._permittedProject) {
      throw new PermitContextChangeError(
        `You cannot set an SDK context with project '${project}' due to insufficient API Key permissions`,
      );
    }
  }

  private verifyCanAccessEnvironment(org: string, project: string, environment: string): void {
    this.verifyCanAccessProject(org, project);
    if (this._permittedEnvironment !== null && environment !== this._permittedEnvironment) {
      throw new PermitContextChangeError(
        `You cannot set an SDK context with environment '${environment}' due to insufficient API Key permissions`,
      );
    }
  }

  /**
   * Set the context to organization level.
   * @param org The organization key.
   */
  public setOrganizationLevelContext(org: string) {
    this.verifyCanAccessOrg(org);
    this._contextLevel = ApiContextLevel.ORGANIZATION;
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
    this.verifyCanAccessProject(org, project);
    this._contextLevel = ApiContextLevel.PROJECT;
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
    this.verifyCanAccessEnvironment(org, project, environment);
    this._contextLevel = ApiContextLevel.ENVIRONMENT;
    this._organization = org;
    this._project = project;
    this._environment = environment;
  }

  /**
   * Get the API project and environment parameters from an environment-level context.
   * @returns An object containing the project and environment IDs.
   * @throws {@link PermitContextError} If the API context is not set to environment level or the project or environment is null.
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
