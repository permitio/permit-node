import Hook from 'require-in-the-middle';

import { appManager } from './appManager';
import { logger } from './logger';

/**
 * Plugin (hook) into frameworks (Express) and track created apps
 */
export function hook() {
  //  Plugin into the http/https create server and map the app provided there/then
  Hook(['http', 'https'], undefined, (exports: any, name: string) => {
    /**
     * Handler for the proxy
     */
    const handler = {
      get: function (target: any, prop: any, receiver: any) {
        try {
          // Wrap call for createServer - to catch passed app
          if (prop === 'createServer') {
            return (listener: any) => {
              appManager.manage(name, listener);
              // Proxy the call to the original app
              return Reflect.get(target, prop, receiver)(listener);
            };
          }
        } catch (error) {
          logger.error('Failed to plugin into http/https', { error });
        }
        // if not 'creatServer' or if we failed we return the original property
        return Reflect.get(target, prop, receiver);
      },
    };

    /** Create a Proxy and wrap the module */
    try {
      const proxy = new Proxy(exports, handler);
      return proxy;
    } catch (error) {
      logger.error('Plugin hook failed to proxy module', { name, error });
      return exports;
    }
  });
}
