import { ResourceDefinition } from './registry';
export default class Resource {
    name: string;
    path: string;
    definition?: ResourceDefinition | undefined;
    context: Record<string, any>;
    definitionPath?: string;
    constructor(name: string, path: string, definition?: ResourceDefinition | undefined, context?: Record<string, any>);
    dict(): Record<string, any>;
    static fromPath(path: string): Resource | undefined;
}
