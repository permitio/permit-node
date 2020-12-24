import { ResourceDefinition, ActionDefinition } from './registry';
export interface AuthorizonConfig {
    token: string;
    appName?: string;
    serviceName?: string;
}
export interface SyncObjectResponse {
    id: string;
}
declare type Dict = Record<string, any>;
export declare class ResourceStub {
    readonly resourceName: string;
    constructor(resourceName: string);
    action(name: string, title?: string, description?: string, path?: string, attributes?: Record<string, any>): void;
}
export declare class AuthorizationClient {
    private initialized;
    private registry;
    private config;
    private client;
    constructor();
    initialize(config: AuthorizonConfig): void;
    get token(): string;
    addResource(resource: ResourceDefinition): ResourceStub;
    addActionToResource(resourceName: string, actionDef: ActionDefinition): void;
    private maybeSyncResource;
    private maybeSyncAction;
    private syncResources;
    updatePolicy(): void;
    updatePolicyData(): void;
    private throwIfNotInitialized;
    syncUser(userId: string, userData: Dict): Promise<Dict | Error>;
    syncOrg(orgId: string, orgName: string): Promise<Dict | Error>;
    deleteOrg(orgId: string): Promise<void>;
    addUserToOrg(userId: string, orgId: string): Promise<Dict | Error>;
    getOrgsForUser(userId: string): Promise<Dict | Error>;
    assignRole(role: string, userId: string, orgId: string): Promise<Dict | Error>;
}
export declare const authorizationClient: AuthorizationClient;
export {};
