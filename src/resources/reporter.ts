import axios, { AxiosInstance } from 'axios';
import { Logger } from 'winston';

import { IPermitConfig } from '../config';

import { ActionConfig, ResourceConfig, ResourceTypes } from './interfaces';
import { ActionDefinition, ResourceDefinition, ResourceRegistry } from './registry';

export interface SyncObjectResponse {
  id: string;
}

export class ResourceStub {
  constructor(private reporter: ResourceReporter, public readonly resourceName: string) {}

  public action(config: ActionConfig): void {
    const action = new ActionDefinition(
      config.name,
      config.title,
      config.description,
      config.path,
      config.attributes || {},
    );
    this.reporter.addActionToResource(this.resourceName, action);
  }
}

export interface IResourceReporter {
  resource(config: ResourceConfig): ResourceStub;
  action(config: ActionConfig): ActionDefinition;
  syncResources(config: ResourceTypes): ResourceStub[];
}

/**
 * the ResourceReporter is used to sync resources and actions
 * (the authorization enforcement points) defined by the app to the
 * permit.io control plane in the cloud, so that policy and permissions
 * may be defined by the control plane. The only data permit.io needs to
 * know about the app is the available enforcement point (i.e: resources
 * and actions).
 */
export class ResourceReporter implements IResourceReporter {
  private initialized = false;
  private client: AxiosInstance = axios.create();

  constructor(
    private config: IPermitConfig,
    private registry: ResourceRegistry,
    private logger: Logger,
  ) {
    this.client = axios.create({
      baseURL: `${this.config.sidecarUrl}/`,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
    });
    this.initialized = true; // TODO: remove this
    this.syncResourcesToControlPlane();
  }

  public get token(): string {
    return this.config.token;
  }

  // resources and actions
  public addResource(resource: ResourceDefinition): ResourceStub {
    this.registry.addResource(resource);
    this.maybeSyncResource(resource);
    return new ResourceStub(this, resource.name);
  }

  public addActionToResource(resourceName: string, actionDef: ActionDefinition): void {
    const action = this.registry.addActionToResource(resourceName, actionDef);
    if (action) {
      this.maybeSyncAction(action);
    }
  }

  private maybeSyncResource(resource: ResourceDefinition): void {
    if (this.initialized && !this.registry.isSynced(resource)) {
      this.logger.info(`syncing resource: ${resource.repr()}`);
      this.client
        .put<SyncObjectResponse>(`cloud/resources/${resource.name}`, resource.dict())
        .then((response) => {
          this.registry.markAsSynced(resource, response.data.id);
        })
        .catch((error) => {
          this.logger.error(`tried to sync resource ${resource.name}, got error: ${error}`);
        });
    }
  }

  private maybeSyncAction(action: ActionDefinition): void {
    if (!action.resourceId) {
      return;
    }
    const resourceId: string = action.resourceId;

    if (this.initialized && !this.registry.isSynced(action)) {
      this.logger.info(`syncing action: ${action.repr()}`);
      this.client
        .put<SyncObjectResponse>(`cloud/resources/${resourceId}/actions`, action.dict())
        .then((response) => {
          this.registry.markAsSynced(action, response.data.id);
        })
        .catch((error) => {
          this.logger.error(`tried to sync action ${action.name}, got error: ${error}`);
        });
    }
  }

  private syncResourcesToControlPlane(): void {
    // will also sync actions
    for (const resource of this.registry.resourceList) {
      this.maybeSyncResource(resource);
    }
  }

  public resource(config: ResourceConfig): ResourceStub {
    const resource = new ResourceDefinition(
      config.name,
      config.type,
      config.path,
      config.description,
      config.actions || [],
      config.attributes || {},
    );
    return this.addResource(resource);
  }

  public action(config: ActionConfig): ActionDefinition {
    return new ActionDefinition(
      config.name,
      config.title,
      config.description,
      config.path,
      config.attributes || {},
    );
  }

  // TODO: currently we use the old api (PUT single resource)
  // due to mismatches with the resource registry
  public syncResources(config: ResourceTypes): ResourceStub[] {
    const stubs: ResourceStub[] = [];
    for (const resource of config.resources) {
      stubs.push(
        this.addResource(
          new ResourceDefinition(
            resource.type,
            'rest',
            `/resources/${resource.type}`,
            resource.description,
            Object.keys(resource.actions).map((actionName) => {
              const action = resource.actions[actionName];
              return new ActionDefinition(
                actionName,
                action.title ?? actionName,
                action.description,
                action.path,
                action.attributes || {},
              );
            }),
            resource.attributes || {},
          ),
        ),
      );
    }
    return stubs;
  }

  public getMethods(): IResourceReporter {
    return {
      resource: this.resource.bind(this),
      action: this.action.bind(this),
      syncResources: this.syncResources.bind(this),
    };
  }
}
