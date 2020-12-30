import _ from 'lodash';

import util from 'util';

import { mapApp } from './appMapper/appMapper';
import { MappedEndpoint } from './appMapper/types';
import { ResourceConfig, resource as saveResource } from './commands';
import { config } from './config';

export class AppManager {
  resources: Record<string, any> = {};

  report(
    name: string,
    resources: ResourceConfig[],
    endpoints: MappedEndpoint[]
  ) {
    const SEPARATOR_LINE = '*************************************************';
    console.log(`<Authorizon Documenting App - ${name}>`);
    console.log(SEPARATOR_LINE);
    console.log('endpoints', util.inspect(endpoints, false, 12, true));
    console.log(SEPARATOR_LINE);
    console.log('resources', util.inspect(resources, false, 12, true));
    console.log(SEPARATOR_LINE);
  }

  manage(name: string, app: any): void {
    // TODO support mixed HTTP/HTTPS server (via name merging resources mutual to http and https )
    // If we have auto-mapping - map the app given to us and save its resources
    if (config.autoMapping) {
      const { resources, endpoints } = mapApp(app);
      if (config.reviewMode) {
        this.report(name, resources, endpoints);
      } else {
        this.resources[name] = resources;
        _.forEach(resources, (resource) => saveResource(resource));
      }
    }
  }
}

export const appManager = new AppManager();
