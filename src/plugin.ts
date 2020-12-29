import Hook from 'require-in-the-middle';

import { mapApp } from './appMapper/appMapper';

/**
 * Plugin (hook) into frameworks (Express) and track created apps
 */
export function hook() {
  // Hook(['express'], undefined, (exports: express.Express) => {
  //   const handler = {
  //     apply: (target: any, thisArg: any, argumentsList: any[]) => {
  //       const app = target.apply(thisArg, argumentsList);
  //       trackedApps.push(app);
  //       return app;
  //     },
  //   };

  //   const proxy = new Proxy(exports, handler);
  //   return proxy;
  // });

  //  Plugin into the http/https create server and map the app provided there/then
  Hook(['http', 'https'], undefined, (exports: any) => {
    const handler = {
      get: function (target: any, prop: any, receiver: any) {
        // Wrap call for createServer - to catch passed app
        if (prop === 'createServer') {
          return (listener: any) => {
            mapApp(listener);
            // Call original
            return Reflect.get(target, prop, receiver)(listener);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    };

    const proxy = new Proxy(exports, handler);
    return proxy;
  });
}
