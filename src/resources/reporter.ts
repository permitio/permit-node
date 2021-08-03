import axios, { AxiosInstance } from 'axios'; // eslint-disable-line

import { logger } from '../logger';
import {
  ResourceDefinition,
  ActionDefinition,
  ResourceRegistry,
} from './registry';

import { ActionConfig } from '../interface';
import { IAuthorizonConfig } from '../config';


export interface SyncObjectResponse {
  id: string;
}

export interface OrgDefinition {
  id: string;
  name: string;
}

export class ResourceStub {
  constructor(private reporter: ResourceReporter, public readonly resourceName: string) { }

  public action(config: ActionConfig): void {
    const action = new ActionDefinition(
      config.name,
      config.title,
      config.description,
      config.path,
      config.attributes || {}
    );
    this.reporter.addActionToResource(this.resourceName, action);
  }
}

/**
 * the ResourceReporter is used to sync resources and actions
 * (the authorization enforcement points) defined by the app to the
 * authorizon control plane in the cloud, so that policy and permissions
 * may be defined by the control plane. The only data authorizon needs to
 * know about the app is the available enforcement point (i.e: resources
 * and actions).
 */
export class ResourceReporter {
  private initialized: boolean = false;
  private client: AxiosInstance = axios.create();

  constructor(private config: IAuthorizonConfig, private registry: ResourceRegistry) {
    this.client = axios.create({
      baseURL: `${this.config.sidecarUrl}/`,
      headers: {
        Authorization: `Bearer ${this.config.token}`,
      },
    });
    this.initialized = true; // TODO: remove this
    this.syncResources();
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

  public addActionToResource(
    resourceName: string,
    actionDef: ActionDefinition
  ): void {
    const action = this.registry.addActionToResource(resourceName, actionDef);
    if (action) {
      this.maybeSyncAction(action);
    }
  }

  private maybeSyncResource(resource: ResourceDefinition): void {
    if (this.initialized && !this.registry.isSynced(resource)) {
      logger.info(`syncing resource: ${resource.repr()}`);
      this.client
        .put<SyncObjectResponse>('cloud/resources', resource.dict())
        .then((response) => {
          this.registry.markAsSynced(resource, response.data.id);
        })
        .catch((error) => {
          logger.error(
            `tried to sync resource ${resource.name}, got error: ${error}`
          );
        });
    }
  }

  private maybeSyncAction(action: ActionDefinition): void {
    if (!action.resourceId) {
      return;
    }
    const resourceId: string = action.resourceId;

    if (this.initialized && !this.registry.isSynced(action)) {
      logger.info(`syncing action: ${action.repr()}`);
      this.client
        .put<SyncObjectResponse>(
          `cloud/resources/${resourceId}/actions`,
          action.dict()
        )
        .then((response) => {
          this.registry.markAsSynced(action, response.data.id);
        })
        .catch((error) => {
          logger.error(
            `tried to sync action ${action.name}, got error: ${error}`
          );
        });
    }
  }

  private syncResources(): void {
    // will also sync actions
    for (let resource of this.registry.resourceList) {
      this.maybeSyncResource(resource);
    }
  }
}
