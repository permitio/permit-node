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

const PLACEHOLDER: string = "(\w+)";

function escapeRegex(s: string): string {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// Equivalent to python dict(zip(['AB', 'CD', 'EF', 'GH'],[1, 2, 3, 4])) in javascript
function dictZip(keys: string[], values: string[]): Record<string, string> | undefined {
  if (keys.length === values.length) {
    return keys.reduce((acc: Record<string, string>, curr: string, index: number) => {
      acc[curr] = values[index];
      return acc;
    }, {});
  } else {
    return undefined;
  }
}

export function extractPatternAndContext(path: string): PatternWithContext {
  if (path.endsWith("/")) {
    path = path.slice(0, -1); // remove last "/"
  }

  const parts: string[] = path.split("/");
  const contextVars: string[] = [];

  parts.forEach((part: string, i: number) => {
    const regex: RegExp = /\{(\w+)\}/;
    let match;
    let partContainsVariable: boolean = false;

    while ((match = regex.exec(part)) !== null) {
      contextVars.push(match[1]);
      partContainsVariable = true;
    };

    if (partContainsVariable) {
      parts[i] = PLACEHOLDER;
    } else {
      parts[i] = escapeRegex(parts[i]);
    }
  });

  const pattern: RegExp = new RegExp("^" + parts.join("/") + "[/]?$");
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
        if (potential.contextVars.length == match.length) {
          context = dictZip(potential.contextVars, match) || {};
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
