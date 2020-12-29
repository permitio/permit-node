import _ from 'lodash';

import { mapApp } from './appMapper/appMapper';
import { resource as saveResource } from './commands';
import { config } from './config';

export class AppManager {
  resources: Record<string, any> = {};

  manage(name: string, app: any): void {
    // TODO support mixed HTTP/HTTPS server (via name merging resources mutual to http and https )
    // If we have auto-mapping - map the app given to us and save its resources
    if (config.autoMapping) {
      const resources = mapApp(app);
      this.resources[name] = resources;
      _.forEach(resources, (resource) => saveResource(resource));
    }
  }
}

export const appManager = new AppManager();
