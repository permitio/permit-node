import {
  diagnosticCause,
  diagnosticErrorSecrets,
  diagnosticMetadata,
  diagnosticText,
} from '#src/utils/diagnostics';

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
  public readonly status: number | undefined;
  public readonly code: string | undefined;

  constructor(message: string, options?: ErrorOptions) {
    const privacy = diagnosticErrorSecrets(options?.cause);
    const cause = options?.cause === undefined ? undefined : diagnosticCause(options.cause);
    super(diagnosticText(message, privacy), cause === undefined ? undefined : { cause });
    this.name = 'PermitContextError';
    const metadata = diagnosticMetadata(cause);
    this.status = metadata.status;
    this.code = metadata.code;
  }
}

/**
 * The `PermitContextChangeError` will be thrown when the user is trying to set the
 * SDK context to an object that the current API Key cannot access (and if allowed,
 * such API calls will result in 401). Instead, the SDK throws this exception.
 */
export class PermitContextChangeError extends Error {
  public readonly status: number | undefined;
  public readonly code: string | undefined;

  constructor(message: string, options?: ErrorOptions) {
    const privacy = diagnosticErrorSecrets(options?.cause);
    const cause = options?.cause === undefined ? undefined : diagnosticCause(options.cause);
    super(diagnosticText(message, privacy), cause === undefined ? undefined : { cause });
    this.name = 'PermitContextChangeError';
    const metadata = diagnosticMetadata(cause);
    this.status = metadata.status;
    this.code = metadata.code;
  }
}

type Scope =
  | {
      level: ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY;
      organization: string;
      project: null;
      environment: null;
    }
  | {
      level: ApiKeyLevel.PROJECT_LEVEL_API_KEY;
      organization: string;
      project: string;
      environment: null;
    }
  | {
      level: ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY;
      organization: string;
      project: string;
      environment: string;
    };

type Selection =
  | { level: ApiContextLevel.WAIT_FOR_INIT; organization: null; project: null; environment: null }
  | { level: ApiContextLevel.ORGANIZATION; organization: string; project: null; environment: null }
  | { level: ApiContextLevel.PROJECT; organization: string; project: string; environment: null }
  | {
      level: ApiContextLevel.ENVIRONMENT;
      organization: string;
      project: string;
      environment: string;
    };

interface ContextState {
  scope: Scope | null;
  selection: Selection;
  revision: number;
  initialization: Promise<void> | undefined;
}

interface ContextSnapshot {
  readonly scope: Scope | null;
  readonly selection: Selection;
}

const contextStates = new WeakMap<ApiContext, ContextState>();
const contextSnapshotKey = Symbol.for('permitio.ApiContext.snapshot');

function stateOf(context: ApiContext): ContextState {
  const state = contextStates.get(context);
  if (state === undefined) {
    throw new PermitContextError('Invalid API context: use an ApiContext instance.');
  }
  return state;
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new PermitContextError(`Invalid API scope ${field}: expected a nonempty string.`);
  }
  return value;
}

function parseScope(value: unknown): Scope {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PermitContextError('Invalid API scope response: expected an object.');
  }
  const organization = identifier(Reflect.get(value, 'organization_id'), 'organization_id');
  const projectValue: unknown = Reflect.get(value, 'project_id');
  const environmentValue: unknown = Reflect.get(value, 'environment_id');
  const project = projectValue == null ? null : identifier(projectValue, 'project_id');
  const environment =
    environmentValue == null ? null : identifier(environmentValue, 'environment_id');
  if (environment !== null && project === null) {
    throw new PermitContextError('Invalid API scope response: environment_id requires project_id.');
  }
  if (project !== null && environment !== null) {
    return { level: ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY, organization, project, environment };
  }
  if (project !== null) {
    return { level: ApiKeyLevel.PROJECT_LEVEL_API_KEY, organization, project, environment: null };
  }
  return {
    level: ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY,
    organization,
    project: null,
    environment: null,
  };
}

function defaultSelection(scope: Scope): Selection {
  switch (scope.level) {
    case ApiKeyLevel.ORGANIZATION_LEVEL_API_KEY:
      return { ...scope, level: ApiContextLevel.ORGANIZATION };
    case ApiKeyLevel.PROJECT_LEVEL_API_KEY:
      return { ...scope, level: ApiContextLevel.PROJECT };
    case ApiKeyLevel.ENVIRONMENT_LEVEL_API_KEY:
      return { ...scope, level: ApiContextLevel.ENVIRONMENT };
  }
}

function verifySelection(scope: Scope | null, selection: Selection): void {
  if (selection.level === ApiContextLevel.WAIT_FOR_INIT) return;
  if (
    !scope ||
    selection.organization !== scope.organization ||
    (selection.project !== null && scope.project !== null && selection.project !== scope.project) ||
    (selection.environment !== null &&
      scope.environment !== null &&
      selection.environment !== scope.environment)
  ) {
    throw new PermitContextChangeError(
      'Cannot select an API context outside the API key permissions.',
    );
  }
}

function readApiContextSnapshot(this: ApiContext): ContextSnapshot {
  const state = stateOf(this);
  return {
    scope: state.scope === null ? null : { ...state.scope },
    selection: { ...state.selection },
  };
}

function parseSelection(value: unknown): Selection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PermitContextError('Invalid API context snapshot selection.');
  }
  const level: unknown = Reflect.get(value, 'level');
  const organization: unknown = Reflect.get(value, 'organization');
  const project: unknown = Reflect.get(value, 'project');
  const environment: unknown = Reflect.get(value, 'environment');
  switch (level) {
    case ApiContextLevel.WAIT_FOR_INIT:
      if (organization === null && project === null && environment === null) {
        return { level, organization, project, environment };
      }
      break;
    case ApiContextLevel.ORGANIZATION:
      if (project === null && environment === null) {
        return {
          level,
          organization: identifier(organization, 'organization'),
          project,
          environment,
        };
      }
      break;
    case ApiContextLevel.PROJECT:
      if (environment === null) {
        return {
          level,
          organization: identifier(organization, 'organization'),
          project: identifier(project, 'project'),
          environment,
        };
      }
      break;
    case ApiContextLevel.ENVIRONMENT:
      return {
        level,
        organization: identifier(organization, 'organization'),
        project: identifier(project, 'project'),
        environment: identifier(environment, 'environment'),
      };
  }
  throw new PermitContextError('Invalid API context snapshot selection hierarchy.');
}

function parseContextSnapshot(value: unknown): ContextSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new PermitContextError('Invalid API context snapshot.');
  }
  const permissions: unknown = Reflect.get(value, 'scope');
  let scope: Scope | null = null;
  if (permissions !== null) {
    if (typeof permissions !== 'object' || Array.isArray(permissions)) {
      throw new PermitContextError('Invalid API context snapshot permissions.');
    }
    const project: unknown = Reflect.get(permissions, 'project');
    const environment: unknown = Reflect.get(permissions, 'environment');
    if (
      (project !== null && typeof project !== 'string') ||
      (environment !== null && typeof environment !== 'string')
    ) {
      throw new PermitContextError('Invalid API context snapshot permission hierarchy.');
    }
    scope = parseScope({
      organization_id: Reflect.get(permissions, 'organization'),
      project_id: project,
      environment_id: environment,
    });
    if (Reflect.get(permissions, 'level') !== scope.level) {
      throw new PermitContextError('Invalid API context snapshot permission level.');
    }
  }
  const selection = parseSelection(Reflect.get(value, 'selection'));
  verifySelection(scope, selection);
  return { scope, selection };
}

/** Stores checked API-key permissions and the mutable routing selection for API methods. */
export class ApiContext {
  constructor() {
    contextStates.set(this, {
      scope: null,
      selection: {
        level: ApiContextLevel.WAIT_FOR_INIT,
        organization: null,
        project: null,
        environment: null,
      },
      revision: 0,
      initialization: undefined,
    });
    Object.defineProperty(this, contextSnapshotKey, { value: readApiContextSnapshot });
  }

  /**
   * Records validated API-key permissions for internal SDK use.
   *
   * @param org - Accessible organization key or ID.
   * @param project - Accessible project key or ID, if restricted to a project.
   * @param environment - Accessible environment key or ID, requiring a project.
   * @throws PermitContextError When scope identifiers or hierarchy are invalid.
   * @throws PermitContextChangeError When new permissions exclude the existing selection.
   */
  public _saveApiKeyAccessibleScope(org: string, project?: string, environment?: string): void {
    const scope = parseScope({
      organization_id: org,
      project_id: project,
      environment_id: environment,
    });
    const state = stateOf(this);
    verifySelection(scope, state.selection);
    state.scope = scope;
    state.revision += 1;
  }

  /** Returns the API key's permission level. */
  public get permittedAccessLevel(): ApiKeyLevel {
    return stateOf(this).scope?.level ?? ApiKeyLevel.WAIT_FOR_INIT;
  }

  /** Returns the current context level. */
  public get contextLevel(): ApiContextLevel {
    return stateOf(this).selection.level;
  }

  /** Returns the selected organization, or null before initialization. */
  public get organization(): string | null {
    return stateOf(this).selection.organization;
  }

  /** Returns the selected project, or null outside project/environment context. */
  public get project(): string | null {
    return stateOf(this).selection.project;
  }

  /** Returns the selected environment, or null outside environment context. */
  public get environment(): string | null {
    return stateOf(this).selection.environment;
  }

  private select(selection: Selection): void {
    const state = stateOf(this);
    verifySelection(state.scope, selection);
    state.selection = selection;
    state.revision += 1;
  }

  /**
   * Selects an organization allowed by the API key, clearing project and environment.
   *
   * @param org - Organization key or ID.
   * @throws PermitContextError When the identifier is invalid.
   * @throws PermitContextChangeError When permissions have not loaded or exclude the organization.
   */
  public setOrganizationLevelContext(org: string): void {
    this.select({
      level: ApiContextLevel.ORGANIZATION,
      organization: identifier(org, 'organization'),
      project: null,
      environment: null,
    });
  }

  /**
   * Selects an allowed project, clearing the environment.
   *
   * @param org - Organization key or ID.
   * @param project - Project key or ID.
   * @throws PermitContextError When an identifier is invalid.
   * @throws PermitContextChangeError When permissions have not loaded or exclude the project.
   */
  public setProjectLevelContext(org: string, project: string): void {
    this.select({
      level: ApiContextLevel.PROJECT,
      organization: identifier(org, 'organization'),
      project: identifier(project, 'project'),
      environment: null,
    });
  }

  /**
   * Selects an environment allowed by the API key.
   *
   * @param org - Organization key or ID.
   * @param project - Project key or ID.
   * @param environment - Environment key or ID.
   * @throws PermitContextError When an identifier is invalid.
   * @throws PermitContextChangeError When permissions have not loaded or exclude the environment.
   */
  public setEnvironmentLevelContext(org: string, project: string, environment: string): void {
    this.select({
      level: ApiContextLevel.ENVIRONMENT,
      organization: identifier(org, 'organization'),
      project: identifier(project, 'project'),
      environment: identifier(environment, 'environment'),
    });
  }

  /** Returns routing parameters for the selected environment; throws when none is selected. */
  public get environmentContext(): { projId: string; envId: string } {
    const selected = stateOf(this).selection;
    if (selected.level !== ApiContextLevel.ENVIRONMENT) {
      throw new PermitContextError(
        `Cannot get environment context at level ${ApiContextLevel[selected.level]}.`,
      );
    }
    return { projId: selected.project, envId: selected.environment };
  }
}

/**
 * Copies validated initial state without sharing mutable selection or an in-flight lookup.
 *
 * @internal
 * @param source - Context whose initial permissions and selection should be preserved.
 * @returns An independent context for one SDK instance.
 * @throws TypeError When source lacks a checked snapshot bridge or its snapshot is invalid.
 */
export function snapshotApiContext(source: ApiContext): ApiContext {
  let snapshot: ContextSnapshot;
  try {
    if (source === null || typeof source !== 'object' || Array.isArray(source)) {
      throw new TypeError();
    }
    const methods = [
      '_saveApiKeyAccessibleScope',
      'setOrganizationLevelContext',
      'setProjectLevelContext',
      'setEnvironmentLevelContext',
    ];
    if (methods.some((method) => typeof Reflect.get(source, method) !== 'function')) {
      throw new TypeError();
    }
    const properties = [
      'permittedAccessLevel',
      'contextLevel',
      'organization',
      'project',
      'environment',
      'environmentContext',
    ];
    if (properties.some((property) => !(property in source))) throw new TypeError();
    const bridge: unknown = Reflect.get(source, contextSnapshotKey);
    if (typeof bridge !== 'function') throw new TypeError();
    snapshot = parseContextSnapshot(Reflect.apply(bridge, source, []));
  } catch {
    throw new TypeError(
      'Invalid apiContext: expected an ApiContext with valid permissions and selection.',
    );
  }
  const target = new ApiContext();
  const copy = stateOf(target);
  copy.scope = snapshot.scope;
  copy.selection = snapshot.selection;
  return target;
}

/**
 * Shares one scope lookup among wrappers, publishing complete state only while it is current.
 *
 * @internal
 * @param context - The SDK-owned context shared by this SDK's wrappers.
 * @param load - Fetches the API key scope without committing it.
 * @returns Completion of the shared lookup; rejected lookups permit a later retry.
 * @throws PermitContextError When the scope response is malformed.
 */
export function initializeApiContext(
  context: ApiContext,
  load: () => Promise<unknown>,
): Promise<void> {
  const state = stateOf(context);
  if (state.scope !== null && state.selection.level !== ApiContextLevel.WAIT_FOR_INIT)
    return Promise.resolve();
  if (state.initialization) return state.initialization;
  const revision = state.revision;
  const pending = Promise.resolve()
    .then(async () => {
      const scope = state.scope ?? parseScope(await load());
      if (state.revision !== revision) return;
      const selection = defaultSelection(scope);
      state.scope = scope;
      state.selection = selection;
      state.revision += 1;
    })
    .finally(() => {
      if (state.initialization === pending) state.initialization = undefined;
    });
  state.initialization = pending;
  return pending;
}
