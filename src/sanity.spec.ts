import test from 'ava';

import { Permit } from './index';

test('paths are processed correctly', async () =>
  //t
  {
    const permit = new Permit({
      token: 'PJUKkuwiJkKxbIoC4o4cguWxB_2gX6MyATYKc2OCM',
    });

    permit.resource({
      name: 'task',
      description: 'Todo Task',
      type: 'rest',
      path: '/api/v1/boards/:listId/tasks',
      actions: [
        permit.action({
          name: 'list',
          title: 'List',
          description: 'list all tasks',
          path: '/api/v1/boards/:listId/tasks',
          attributes: {
            verb: 'GET',
          },
        }),
        permit.action({
          name: 'retrieve',
          title: 'Retrieve',
          description: 'Retrieve task details',
          path: '/api/v1/boards/:listId/tasks/:taskId',
          attributes: {
            verb: 'GET',
          },
        }),
      ],
    });

    await permit.write(
      permit.api.createTenant({ key: 'tenant1', name: 'My First Tenant' }),
      permit.api.assignRole('mysuperid', 'Admin', 'tenant1'),
    );

    // TODO: when we support zanzibar
    // await permit.write(
    //   permit.relationships({
    //     tuples: [
    //       { user: 'alice', relation: 'reader', object: 'document:A'},
    //       { user: 'bob', relation: 'reader', object: 'document:B'},
    //       { user: 'charlie', relation: 'reader', object: 'document:C'},
    //     ]
    //   })
    // );

    // const context = permit.getUrlContext("/api/v1/boards/b1/tasks/t1", "GET");
    // if (!context) {
    //   return;
    // }
    // const { resource, action } = context;

    // permit.check({ key: "u1" }, action, resource);

    // permit.save((api: IPermitCloudMutations): Promise<any> => {
    //   return Promise.all([
    //     api.createTenant({key: "teannt1", name: "Ten 1"}),
    //     api.assignRole("uk", "admin", "tk"),
    //   ]);
    // });

    // t.is(resourceRegistry.paths.length, 2);
    // const result = resourceRegistry.getResourceAndActionFromRequestParams("/api/v1/boards/2/tasks/25");
    // t.is(result?.resource.name, 'task');
    // t.is(result?.resource.context['listId'], '2');
    // t.is(result?.resource.context['taskId'], '25');
  });
