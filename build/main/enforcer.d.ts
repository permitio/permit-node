import Resource from './resource';
export interface Context {
    [id: string]: string;
}
export interface ContextTransform {
    (context: Context): Context;
}
declare type Dict = Record<string, any>;
export declare type UserType = string;
export declare type ActionType = string;
export declare type ResourceType = string | Resource | Dict;
export declare class Enforcer {
    private transforms;
    private client;
    constructor();
    addTransform(transform: ContextTransform): void;
    private transformContext;
    private translateResource;
    /**
     * Usage:
     *
     * authorizon.is_allowed(user, 'get', '/tasks/23')
     * authorizon.is_allowed(user, 'get', '/tasks')
     * authorizon.is_allowed(user, 'post', '/lists/3/todos/37', context={org_id=2})
     * authorizon.is_allowed(user, 'view', task)
     *
     * @param user
     * @param action
     * @param resource
     *
     * @returns whether or not action is allowed for given user
     */
    isAllowed(user: UserType, action: ActionType, resource: ResourceType): Promise<boolean>;
}
export declare const enforcer: Enforcer;
export {};
