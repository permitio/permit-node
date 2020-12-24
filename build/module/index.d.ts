import { ActionDefinition } from "./registry";
import { AuthorizonConfig, ResourceStub } from "./client";
export interface ResourceConfig {
    name: string;
    type: string;
    path: string;
    description?: string;
    actions?: ActionDefinition[];
    attributes?: Record<string, any>;
}
export interface ActionConfig {
    name: string;
    title?: string;
    description?: string;
    path?: string;
    attributes?: Record<string, any>;
}
export declare const init: (config: AuthorizonConfig) => void;
export declare const resource: (config: ResourceConfig) => ResourceStub;
export declare const action: (config: ActionConfig) => ActionDefinition;
export declare const syncUser: (userId: string, userData: Record<string, any>) => Promise<Record<string, any> | Error>;
export declare const syncOrg: (orgId: string, orgName: string) => Promise<Record<string, any> | Error>;
export declare const deleteOrg: (orgId: string) => Promise<void>;
export declare const addUserToOrg: (userId: string, orgId: string) => Promise<Record<string, any> | Error>;
export declare const getOrgsForUser: (userId: string) => Promise<Record<string, any> | Error>;
export declare const assignRole: (role: string, userId: string, orgId: string) => Promise<Record<string, any> | Error>;
export declare const updatePolicyData: () => void;
export declare const isAllowed: (user: string, action: string, resource: import("./enforcer").ResourceType) => Promise<boolean>;
export declare const transformResourceContext: (transform: import("./enforcer").ContextTransform) => void;
