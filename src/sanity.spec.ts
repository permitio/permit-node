import { AuthorizonSDK, IAuthorizonClient } from './index';
import test from 'ava';

test('paths are processed correctly', async (
  //t
) => {
  const authorizon: IAuthorizonClient = AuthorizonSDK.init({
    token: "PJUKkuwiJkKxbIoC4o4cguWxB_2gX6MyATYKc2OCM",
  });

  authorizon.once('ready', () => {
    authorizon.resource({
      name: "task",
      description: "Todo Task",
      type: "rest",
      path: "/api/v1/boards/:listId/tasks",
      actions: [
        authorizon.action({
          name: "list",
          title: "List",
          description: "list all tasks",
          path: "/api/v1/boards/:listId/tasks",
          attributes: {
            "verb": "GET"
          }
        }),
        authorizon.action({
          name: "retrieve",
          title: "Retrieve",
          description: "Retrieve task details",
          path: "/api/v1/boards/:listId/tasks/:taskId",
          attributes: {
            "verb": "GET"
          }
        }),
      ]
    });

    // const context = authorizon.getUrlContext("/api/v1/boards/b1/tasks/t1", "GET");
    // if (!context) {
    //   return;
    // }
    // const { resource, action } = context;

    // authorizon.isAllowed({ key: "u1" }, action, resource);

    // authorizon.save((api: IAuthorizonCloudMutations): Promise<any> => {
    //   return Promise.all([
    //     api.createTenant({key: "teannt1", name: "Ten 1"}),
    //     api.assignRole("uk", "admin", "tk"),
    //   ]);
    // });
  });

  // t.is(resourceRegistry.paths.length, 2);
  // const result = resourceRegistry.getResourceAndActionFromRequestParams("/api/v1/boards/2/tasks/25");
  // t.is(result?.resource.name, 'task');
  // t.is(result?.resource.context['listId'], '2');
  // t.is(result?.resource.context['taskId'], '25');
});
