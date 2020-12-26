import authorizon from './index';
import { resourceRegistry } from './registry';
import test from 'ava';

test('paths are processed correctly', async (t) => {
  authorizon.init({
    token: "PJUKkuwiJkKxbIoC4o4cguWxB_2gX6MyATYKc2OCM",
    appName: "todos"
  });

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

  t.is(resourceRegistry.paths.length, 2);
  const result = resourceRegistry.getResourceByPath("/api/v1/boards/2/tasks/25");
  t.is(result?.resourceName, 'task');
  t.is(result?.context['listId'], '2');
  t.is(result?.context['taskId'], '25');
});
