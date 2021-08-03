import { ResourceDefinition } from './registry';

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
}
