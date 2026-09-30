# Migrating to Permit Node SDK 3.0

## Grouped API clients replace the flat facade

Version 3.0 removes the deprecated methods directly under `permit.api`.
Use the grouped clients below. The same replacements work with CommonJS and ES modules.
The examples use `api` as shorthand for `permit.api` and `data` for the corresponding typed input.

| Removed call                                 | Replacement                                       |
| -------------------------------------------- | ------------------------------------------------- |
| `api.listUsers()`                            | `(await api.users.list()).data`                   |
| `api.listRoles()`                            | `api.roles.list()`                                |
| `api.listConditionSets(type, page, perPage)` | `api.conditionSets.list({ type, page, perPage })` |
| `api.listConditionSetsRules(page, perPage)`  | `api.conditionSetRules.list({ page, perPage })`   |
| `api.getUser(key)`                           | `api.users.get(key)`                              |
| `api.getTenant(key)`                         | `api.tenants.get(key)`                            |
| `api.listTenants(page)`                      | `api.tenants.list({ page })`                      |
| `api.getRole(key)`                           | `api.roles.get(key)`                              |
| `api.getAssignedRoles(user, tenant)`         | `api.users.getAssignedRoles({ user, tenant })`    |
| `api.createResource(data)`                   | `api.resources.create(data)`                      |
| `api.updateResource(key, data)`              | `api.resources.update(key, data)`                 |
| `api.deleteResource(key)`                    | `api.resources.delete(key)`                       |
| `api.createUser(data)`                       | `api.users.create(data)`                          |
| `api.syncUser(data)`                         | `(await api.users.sync(data)).user`               |
| `api.updateUser(key, data)`                  | `api.users.update(key, data)`                     |
| `api.deleteUser(key)`                        | `api.users.delete(key)`                           |
| `api.createTenant(data)`                     | `api.tenants.create(data)`                        |
| `api.updateTenant(key, data)`                | `api.tenants.update(key, data)`                   |
| `api.deleteTenant(key)`                      | `api.tenants.delete(key)`                         |
| `api.createRole(data)`                       | `api.roles.create(data)`                          |
| `api.updateRole(key, data)`                  | `api.roles.update(key, data)`                     |
| `api.deleteRole(key)`                        | `api.roles.delete(key)`                           |
| `api.assignRole(data)`                       | `api.users.assignRole(data)`                      |
| `api.unassignRole(data)`                     | `api.users.unassignRole(data)`                    |
| `api.createConditionSet(data)`               | `api.conditionSets.create(data)`                  |
| `api.updateConditionSet(key, data)`          | `api.conditionSets.update(key, data)`             |
| `api.deleteConditionSet(key)`                | `api.conditionSets.delete(key)`                   |
| `api.assignConditionSetRule(data)`           | `api.conditionSetRules.create(data)`              |
| `api.unassignConditionSetRule(data)`         | `api.conditionSetRules.delete(data)`              |

Await the replacement calls as before. Several return values need an explicit adjustment:

- `users.list()` returns a pagination envelope. Use its `data` property for the user array.
- `users.sync()` returns `{ user, created }`. Use `user` for the record and `created` to distinguish
  creation from an update.
- Grouped delete and unassign methods resolve to `void`. Do not read an Axios response body,
  status or headers from their result. HTTP errors reject with `PermitApiError`.
- `conditionSetRules.create()` returns one rule instead of an array. It rejects if the server
  returns no created rule.

Pagination and filters use option objects. `conditionSets.list()` accepts an optional `type`
(`ConditionSetType.Userset` or `ConditionSetType.Resourceset`); omitting it lists both kinds.
`conditionSetRules.list()` accepts any combination of `userSetKey`, `permissionKey`, and
`resourceSetKey`; omitting the filters lists all rules. Both methods default to page 1 with
100 records per page. Omit optional properties when you do not have a value, rather than
passing `undefined`, when using `exactOptionalPropertyTypes`.

The old `api.getMethods()` method bag is removed. Use the grouped clients directly. For a callback,
keep its receiver with an explicit closure, for example:

```ts
const getUser = (key: string) => permit.api.users.get(key);
```

The deprecated `ApiContext.level` alias is also removed. Read
`permit.config.apiContext.permittedAccessLevel` for the API key permission level.

## Removed exports

| Removed export         | Replacement                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| `DeprecatedApiClient`  | Use `permit.api`, or `ApiClient` when constructing a client directly. |
| `IDeprecatedPermitApi` | Use `IPermitApi` and the grouped methods.                             |
| `IDeprecatedReadApis`  | Use the applicable grouped interface, such as `IUsersApi`.            |
| `IDeprecatedWriteApis` | Use the applicable grouped interface, such as `IUsersApi`.            |
| `ContextTransform`     | Transform context in application code before passing it to the SDK.   |

`ContextTransform` had no public runtime registration API. Global context and per-call context
continue to work; the unused internal transform registry is removed.

## Related changes

See the [README](README.md) for supported runtimes, constructor configuration, retries,
errors and authorization behavior. Generated model changes are recorded in the
[OpenAPI migration inventory][openapi-migration].

[openapi-migration]: https://github.com/permitio/permit-node/blob/08fda456fae8/openapi/MIGRATION.md
