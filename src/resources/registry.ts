import Resource from './resource';
import { dictZip } from '../utils/dict';
import { escapeRegex, matchAll, RegexMatch } from '../utils/regex';

export interface PatternWithContext {
  pattern: RegExp;
  contextVars: string[];
}

export interface ActionMatcher extends PatternWithContext {
  verb: string;
  resourceName: string;
  actionName: string;
}

export interface ResourceActionPair {
  resource: Resource;
  action: string;
}

export const NO_VERB: string = "DEFAULT";

export function extractPatternAndContext(path: string): PatternWithContext {
  if (path.endsWith('/')) {
    path = path.slice(0, -1); // remove last "/"
  }

  const regex: RegExp = /\:(\w+)/;
  const PLACEHOLDER: string = '(\\w+)';

  const matches: RegexMatch[] = matchAll(regex, path);

  const parts: string[] = [];
  const contextVars: string[] = [];

  let currentIndex = 0;
  for (let match of matches) {
    // save param name to context vars
    contextVars.push(match.groups[1]);
    // push (escaped) chunk before match
    parts.push(escapeRegex(path.slice(currentIndex, match.start)));
    // push placeholder regex instead of match
    parts.push(PLACEHOLDER);
    // advance the index after the match end
    currentIndex += match.start + match.length;
  }

  if (currentIndex < path.length) {
    parts.push(escapeRegex(path.slice(currentIndex)));
  }

  const pattern: RegExp = new RegExp('^' + parts.join('') + '\\/?$');
  return {
    pattern: pattern,
    contextVars: contextVars,
  };
}

export class ActionDefinition {
  private _resourceId?: string = undefined;
  private _resourceName: string = '';

  constructor(
    public name: string,
    public title?: string,
    public description?: string,
    public path?: string,
    public attributes: Record<string, any> = {},
    resourceId?: string
  ) {
    this.resourceId = resourceId;
  }

  get resourceId(): string | undefined {
    return this._resourceId;
  }

  set resourceId(id: string | undefined) {
    this._resourceId = id;
  }

  get resourceName(): string {
    return this._resourceName;
  }

  set resourceName(name: string) {
    this._resourceName = name;
  }

  get verb(): string {
    const v: string = this.attributes['verb'] || NO_VERB;
    return v.toUpperCase();
  }

  public dict(): Record<string, any> {
    return {
      name: this.name,
      title: this.title,
      description: this.description,
      path: this.path,
      attributes: this.attributes,
      resourceId: this.resourceId,
    };
  }

  public repr(): string {
    return `Action( name=${this.name}, path=${this.path} )`;
  }
}

export class ResourceDefinition {
  private _remoteId?: string = undefined;

  constructor(
    public readonly name: string,
    public readonly type: string,
    public readonly path: string,
    public readonly description?: string,
    public readonly actions: ActionDefinition[] = [],
    public readonly attributes: Record<string, any> = {}
  ) {
    this.attributes = attributes;
  }

  get remoteId(): string | undefined {
    return this._remoteId;
  }

  set remoteId(id: string | undefined) {
    this._remoteId = id;
  }

  public dict(): Record<string, any> {
    return {
      name: this.name,
      type: this.type,
      path: this.path,
      description: this.description,
      actions: this.actions.map((a) => a.dict()),
      attributes: this.attributes,
    };
  }

  public repr(): string {
    return `Resource(name="${this.name}", path="${this.path
      }", actions=[${this.actions.map((a) => a.name)}])`;
  }
}

export class ResourceRegistry {
  private resources: Record<string, ResourceDefinition> = {};
  private alreadySynced: Set<string> = new Set();
  private processedPaths: Record<string, PatternWithContext> = {};
  private actionMatchers: ActionMatcher[] = [];

  get resourceList(): ResourceDefinition[] {
    return Object.keys(this.resources).map((k) => this.resources[k]);
  }

  public addResource(resource: ResourceDefinition) {
    if (!(resource.name in this.resources)) {
      this.resources[resource.name] = resource;
    }

    resource.actions.forEach((action) => {
      action.resourceName = resource.name;
      const path = (action.path) ? action.path : resource.path;
      this.processActionPath(path, action.verb, resource.name, action.name);
    });
  }

  public addActionToResource(
    resourceName: string,
    action: ActionDefinition
  ): ActionDefinition | undefined {
    if (!(resourceName in this.resources)) {
      return undefined;
    }

    const resource = this.resources[resourceName];
    action.resourceId = resource.remoteId;
    action.resourceName = resource.name;

    const existingActions = resource.actions.map((a) => a.name);

    if (!(action.name in existingActions)) {
      resource.actions.push(action);
    }

    const path = (action.path) ? action.path : resource.path;
    this.processActionPath(path, action.verb, resource.name, action.name);
    return action;
  }

  public get paths(): string[] {
    return Array.from(Object.keys(this.processedPaths));
  }

  public static actionKey(action: ActionDefinition): string {
    return `${action.resourceName}:${action.name}`;
  }

  /**
   * parses the action URI (path) and http verb into a matcher regex with context vars (named params)
   */
  private processActionPath(path: string, verb: string, resourceName: string, actionName: string): void {
    let patternAndContext: PatternWithContext;
    if (this.processedPaths.hasOwnProperty(path)) {
      patternAndContext = this.processedPaths[path];
    } else {
      patternAndContext = extractPatternAndContext(path);
      this.processedPaths[path] = patternAndContext;
    }
    this.actionMatchers.push({
      ...patternAndContext,
      resourceName: resourceName,
      actionName: actionName,
      verb: verb,
    });
  }

  public isSynced(obj: ResourceDefinition | ActionDefinition): boolean {
    if (obj instanceof ResourceDefinition) {
      return obj.name in this.alreadySynced;
    }

    if (obj instanceof ActionDefinition) {
      return ResourceRegistry.actionKey(obj) in this.alreadySynced;
    }

    return false;
  }

  public markAsSynced(
    obj: ResourceDefinition | ActionDefinition,
    remoteId: string
  ): void {
    if (obj instanceof ResourceDefinition) {
      this.alreadySynced.add(obj.name);
      this.resources[obj.name].remoteId = remoteId;
      obj.actions.forEach((action) => {
        this.alreadySynced.add(ResourceRegistry.actionKey(action));
      });
    }

    if (obj instanceof ActionDefinition) {
      this.alreadySynced.add(ResourceRegistry.actionKey(obj));
    }
  }

  public getResourceAndActionFromRequestParams(path: string, verb: string = NO_VERB): ResourceActionPair | undefined {
    for (const matcher of this.actionMatchers) {
      if (matcher.verb !== verb && verb !== NO_VERB) {
        continue;
      }
      const match = path.match(matcher.pattern);
      if (match) {
        const resourceDef = this.resources[matcher.resourceName] || undefined;
        let context = {};
        const capturedGroups = match.slice(1); // the first group is the entire string
        if (matcher.contextVars.length == capturedGroups.length) {
          // TODO dictZip should probably be replaced by lodash _.zipObject
          context = dictZip(matcher.contextVars, capturedGroups) || {};
        }

        return {
          resource: new Resource(matcher.resourceName, path, resourceDef, context),
          action: matcher.actionName
        };
      }
    }
    return undefined;
  }
}

export const resourceRegistry = new ResourceRegistry();
