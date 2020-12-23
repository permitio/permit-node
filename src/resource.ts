import { ResourceDefinition, resourceRegistry } from './registry';

export default class Resource {
  definitionPath?: string;

  constructor(
    public name: string,
    public path: string,
    public definition?: ResourceDefinition,
    public context: Record<string, any> = {}
  ) {
    this.definitionPath = definition?.path || undefined;
  }

  public dict(): Record<string, any> {
    return {
      type: this.name,
      path: this.definitionPath,
      instance: this.path,
      context: this.context
    }
  }

  public static fromPath(path: string): Resource | undefined {
    const match = resourceRegistry.getResourceByPath(path);
    if (!match) {
      return undefined;
    }

    return new Resource(match.resourceName, path, match.resourceDef, match.context);
  }
}
