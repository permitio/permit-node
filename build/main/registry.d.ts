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
export declare function extractPatternAndContext(path: string): PatternWithContext;
export declare class ActionDefinition {
    readonly name: string;
    readonly title?: string | undefined;
    readonly description?: string | undefined;
    readonly path?: string | undefined;
    readonly attributes: Record<string, any>;
    private _resourceId?;
    private _resourceName;
    constructor(name: string, title?: string | undefined, description?: string | undefined, path?: string | undefined, attributes?: Record<string, any>, resourceId?: string);
    get resourceId(): string | undefined;
    set resourceId(id: string | undefined);
    get resourceName(): string;
    set resourceName(name: string);
    dict(): Record<string, any>;
}
export declare class ResourceDefinition {
    readonly name: string;
    readonly type: string;
    readonly path: string;
    readonly description?: string | undefined;
    readonly actions: ActionDefinition[];
    readonly attributes: Record<string, any>;
    private _remoteId?;
    constructor(name: string, type: string, path: string, description?: string | undefined, actions?: ActionDefinition[], attributes?: Record<string, any>);
    get remoteId(): string | undefined;
    set remoteId(id: string | undefined);
    dict(): Record<string, any>;
}
export declare class ResourceRegistry {
    private resources;
    private alreadySynced;
    private processedPaths;
    private pathRegexes;
    get resourceList(): ResourceDefinition[];
    addResource(resource: ResourceDefinition): void;
    addActionToResource(resourceName: string, action: ActionDefinition): ActionDefinition | undefined;
    static actionKey(action: ActionDefinition): string;
    private processPath;
    isSynced(obj: ResourceDefinition | ActionDefinition): boolean;
    markAsSynced(obj: ResourceDefinition | ActionDefinition, remoteId: string): void;
    getResourceByPath(path: string): ResourceMatch | undefined;
}
export declare const resourceRegistry: ResourceRegistry;
