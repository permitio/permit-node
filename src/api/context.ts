export enum ApiKeyLevel {
  WAIT_FOR_INIT,
  ORGANIZATION_LEVEL_API_KEY,
  PROJECT_LEVEL_API_KEY,
  ENVIRONMENT_LEVEL_API_KEY,
}

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

  public get level(): ApiKeyLevel {
    return this._level;
  }

  public get organization(): string | null {
    return this._organization;
  }

  public get project(): string | null {
    return this._project;
  }

  public get environment(): string | null {
    return this._environment;
  }

  public setOrganizationLevelContext(org: string) {
    this._level = ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY;
    this._organization = org;
    this._project = null;
    this._environment = null;
  }

  public setProjectLevelContext(org: string, project: string) {
    this._level = ApiKeyLevel.PROJECT_LEVEL_API_KEY;
    this._organization = org;
    this._project = project;
    this._environment = null;
  }

  public setEnvironmentLevelContext(org: string, project: string, environment: string) {
    this._level = ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY;
    this._organization = org;
    this._project = project;
    this._environment = environment;
  }
}
