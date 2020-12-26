import { dictZip } from './utils/dict';
import { escapeRegex, matchAll, RegexMatch } from './utils/regex';

export interface PatternWithContext {
  pattern: RegExp;
  contextVars: string[];
}

export interface PathRegex extends PatternWithContext {
  resourceName: string;
}

export interface ResourceMatch {
  resourceName: string;
  resourceDef: ResourceDefinition;
  context: Record<string, string>;
}

export function extractPatternAndContext(path: string): PatternWithContext {
  if (path.endsWith("/")) {
    path = path.slice(0, -1); // remove last "/"
  }

  const regex: RegExp = /\:(\w+)/;
  const PLACEHOLDER: string = "(\\w+)";

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
    parts.push(escapeRegex(path.slice(currentIndex)))
  }

  const pattern: RegExp = new RegExp("^" + parts.join("") + "\\/?$");
  return {
    pattern: pattern,
    contextVars: contextVars
  }
}

export class ActionDefinition {
  private _resourceId?: string = undefined;
  private _resourceName: string = "";

  constructor(
    public readonly name: string,
    public readonly title?: string,
    public readonly description?: string,
    public readonly path?: string,
    public readonly attributes: Record<string, any> = {},
    resourceId?: string,
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

  public dict(): Record<string, any> {
    return {
      name: this.name,
      title: this.title,
      description: this.description,
      path: this.path,
      attributes: this.attributes,
      resourceId: this.resourceId,
    }
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
    public readonly attributes: Record<string, any> = {},
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
      actions: this.actions.map(a => a.dict()),
      attributes: this.attributes,
    }
  }

  public repr(): string {
    return `Resource(name="${this.name}", path="${this.path}", actions=[${this.actions.map(a => a.name)}])`;
  }
}

export class ResourceRegistry {
  private resources: Record<string, ResourceDefinition> = {};
  private alreadySynced: Set<string> = new Set();
  private processedPaths: Set<string> = new Set();
  private pathRegexes: PathRegex[] = [];

  get resourceList(): ResourceDefinition[] {
    return Object.keys(this.resources).map(k => this.resources[k]);
  }

  public addResource(resource: ResourceDefinition) {
    if (!(resource.name in this.resources)) {
      this.resources[resource.name] = resource;
      this.processPath(resource.path, resource.name);
    }

    resource.actions.forEach(action => {
      action.resourceName = resource.name;
      if (action.path) {
        this.processPath(action.path, resource.name);
      }
    })
  }

  public addActionToResource(
    resourceName: string,
    action: ActionDefinition): ActionDefinition | undefined {
    if (!(resourceName in this.resources)) {
      return undefined;
    }

    const resource = this.resources[resourceName];
    action.resourceId = resource.remoteId;
    action.resourceName = resource.name;

    const existingActions = resource.actions.map(a => a.name);

    if (!(action.name in existingActions)) {
      resource.actions.push(action);
    }

    if (action.path) {
      this.processPath(action.path, resource.name);
    }
    return action
  }

  public get paths(): string[] {
    return Array.from(this.processedPaths.values());
  }

  public static actionKey(action: ActionDefinition): string {
    return `${action.resourceName}:${action.name}`;
  }

  private processPath(path: string, resourceName: string): void {
    if (path in this.processedPaths) {
      return;
    }

    const { pattern, contextVars: context } = extractPatternAndContext(path);
    this.pathRegexes.push({
      pattern: pattern,
      contextVars: context,
      resourceName: resourceName
    });

    this.processedPaths.add(path);
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

  public markAsSynced(obj: ResourceDefinition | ActionDefinition, remoteId: string): void {
    if (obj instanceof ResourceDefinition) {
      this.alreadySynced.add(obj.name);
      this.resources[obj.name].remoteId = remoteId;
      obj.actions.forEach(action => {
        this.alreadySynced.add(ResourceRegistry.actionKey(action));
      });
    }

    if (obj instanceof ActionDefinition) {
      this.alreadySynced.add(ResourceRegistry.actionKey(obj));
    }
  }

  public getResourceByPath(path: string): ResourceMatch | undefined {
    for (let potential of this.pathRegexes) {
      const match = path.match(potential.pattern);
      if (match) {
        const resourceDef = this.resources[potential.resourceName] || undefined;
        let context = {};
        const capturedGroups = match.slice(1); // the first group is the entire string
        if (potential.contextVars.length == capturedGroups.length) {
          context = dictZip(potential.contextVars, capturedGroups) || {};
        }

        return {
          resourceName: potential.resourceName,
          resourceDef: resourceDef,
          context: context
        }
      }
    }
    return undefined;
  }
}

export const resourceRegistry = new ResourceRegistry();
