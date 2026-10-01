# Migrating to Permit Node SDK 3.0

This guide describes the upcoming 3.0 behavior. The reviewed candidate identifies itself as
3.0.0 and remains unpublished. Check the official release before
changing production requirements. Compare your actual installed 2.x version: some fixes were already
present in recent 2.x source. Stable IDs below are shared with the scanner and release notes.

The inventory compares the official npm 2.7.5 package and the reviewed main source separately.
Published 2.7.5 already had root CJS/ESM exports and the 29 flat methods, but no SDK retry options.
Statements about retained retry or routing behavior refer to reviewed main, not every 2.x release.

## Upgrade and compatibility

### P1 — Dependency and lock

After 3.0 is released, update the direct `permitio` requirement and regenerate the application lock
with your package manager. Check every workspace, deployment image and independent consumer. Review
transitive pins rather than assuming a successful install migrated application behavior.

### C1 — Supported Node families

Use Node `^22.13.0 || ^24.0.0`. The former `>=10` requirement no longer applies. This range does not
promise Node 23, 25, or all later majors. Check CI, containers, deployment providers and local pins.

### C2 — Imports and modules

Both native CommonJS and ES modules remain supported; there is no forced module conversion.
Use `require('permitio')` or `import { Permit } from 'permitio'`. Both loaders expose named exports.
Root-only package exports already existed in 2.x. If you bypassed them with generated/internal file
paths, review those imports: generated files and the physical runtime layout changed. Do not replace
them with another internal path. The historical generated inventory lists removed declarations.

`ResourceRelationsApi`, `ResourceRolesApi`, `ApiContextLevel` and `PermitContextChangeError` are
now named root exports. Use the grouped clients through `permit.api.resourceRelations` and
`permit.api.resourceRoles`, and use their exported classes for constructor identity checks.

### C3 — Direct use of former transitive dependencies

The SDK no longer brings in `@bitauth/libauth`, `path-to-regexp`, `require-in-the-middle` or
`url-parse`. If application code imports these packages, declare and review its own dependencies.
Do not add them back to Permit. Review dependency changes through the application lock and audit.

## API migration

### A1 — Flat methods are removed

The 29 deprecated methods directly under `permit.api` are absent in 3.0. There are no compatibility
shims or warnings that keep them callable. Below, `api` means `permit.api`; supply the corresponding
typed arguments and await calls as before. Read A3 before adapting consumers of returned values.

| Removed call                                 | Grouped replacement                               |
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

### A2 — Method bag, five legacy exports, and context alias

Remove `api.getMethods()`. For callbacks keep the grouped method's receiver with a closure, such as
`const getUser = (key: string) => permit.api.users.get(key)`.

| Removed export         | Replacement                                           |
| ---------------------- | ----------------------------------------------------- |
| `DeprecatedApiClient`  | `permit.api`, or `ApiClient` for direct construction  |
| `IDeprecatedPermitApi` | `IPermitApi`                                          |
| `IDeprecatedReadApis`  | The applicable grouped interface, such as `IUsersApi` |
| `IDeprecatedWriteApis` | The applicable grouped interface, such as `IUsersApi` |
| `ContextTransform`     | Transform context in application code before the call |

Use `permit.config.apiContext.permittedAccessLevel` instead of the removed `ApiContext.level`.
There was no public runtime transform registration API. Do not invent a global-context setter or
register an unused transform. Two additional removed root exports are covered under T1.

### A3 — Returned values and runtime corrections

- Flat `listUsers()` returned an array; grouped `users.list()` returns a page. Read `page.data`.
- Flat `syncUser()` returned the record; grouped `users.sync()` returns `{ user, created }`.
- Flat `assignConditionSetRule()` returned an array; grouped `conditionSetRules.create()` returns
  one record. Existing grouped create already had this shape; it now rejects an empty success body
  instead of returning `undefined`.
- Grouped deletes/unassignments are typed `Promise<void>`: use completion, not response body,
  status or headers. Only `users.unassignRole()` and `roleAssignments.unassign()` now explicitly
  resolve `undefined`; they were declared void in 2.x but returned bodies. Other unchanged void
  wrappers can expose empty Axios response text for HTTP 204; do not require identical empty
  runtime values or treat them as substantive results.
- Ordinary condition-set, tenant, instance, tuple and resource-relation lists keep their declared
  array result, unwrapping a server pagination envelope when required. Do not add `.data` to these
  high-level array results. Generated-only clients can have different result unions.

### A4 — Condition filters

`conditionSets.list()` accepts optional `{ type, page, perPage }`; no type lists both kinds.
`conditionSetRules.list()` accepts omitted, empty or partial filters. Both default to page 1 and
100 records per page. `permissionKey: 'write'` filters by the action key/ID; rule create/read
permission is canonical `document:write`. The SDK forwards filters unchanged. Do not confuse a
permission's persisted representation with the GET action filter. Use full typed read records.

## Configuration and errors

### F1 — Effective constructor validation and logging defaults

Use `IPermitOptions` for constructor input. Supply a nonempty token without whitespace/control
characters, after `PERMIT_API_KEY` fallback, and absolute HTTP(S) `pdp`/`apiUrl` URLs. Validate
deployment variables before construction. Base URLs cannot contain literal query (`?`) or
fragment (`#`) components, even empty trailing delimiters. Remove those components rather than
expecting the SDK to strip them. Existing path prefixes and encoded path characters such as
`%3F` and `%23` remain supported, including existing environment URL defaults. Logger levels,
booleans, timeout and retry values are checked. Invalid effective options throw `TypeError`
before HTTP, without echoing credentials.
Use complete instances from `axios.create()` and a genuine current-version `ApiContext`, rather
than partial mock objects. Explicit `undefined` is permitted for constructor options.

Unset `PERMIT_LOG_JSON` now selects JSON lines. Explicit `log.json: false` produced JSON in 2.x
and now selects pretty output. Environment value `false` also selects pretty output; case and
surrounding whitespace are ignored. Update log parsers, or explicitly set `log.json: true`.
Pretty output writes synchronously on the calling thread; blocked stdout can delay the application.
The default JSON output keeps Pino's default destination and is preferred for production collection.
Logs omit raw configuration, credentials, full attributes, request bodies and private errors.

### F2 — Configuration and API context ownership

SDK-owned settings and nested log/tenancy/retry options are copied and frozen. Construct a new
client to change token, routes or these settings. The config reference is readonly; do not replace
`permit.config` to rotate settings. Caller Axios instances and callbacks stay live.

A supplied initial `ApiContext` is validated and copied. Change selection afterward through
`permit.config.apiContext`, within the key's validated scope, once permissions are available.
Mutating the originally supplied context no longer changes this client. Current CJS/ESM contexts
interoperate; an old-version/plain context is not a supported substitute. Concurrent wrappers
share one scope lookup, and a failed lookup allows a later retry.

### E1 — PDP errors and non-throwing results

Catch `PermitPDPStatusError` before `PermitConnectionError`: the status class now extends the
connection class. HTTP failures and malformed successful PDP bodies retain the specific status
class with safe `statusCode`/`responseBody`; transport failures have safe cause/code metadata.
Stop matching raw/private error text or assuming raw request/body identity is retained.

With `throwOnError: false`, check failure returns `false`, bulk failure returns one `false` per
input rather than `[]`, permissions return `{}`, and all-tenants return `[]`. These are denial
fallbacks, not proof a policy denied a healthy request. New discovery exceptions are covered in N3.

### E2 — REST and scope error snapshots

`PermitApiError` is named and non-generic. `originalError` is a detached bounded Axios snapshot,
not the caller's thrown object. `request` is `undefined`; response data and formatted error bodies
are `unknown`. Narrow them before reading fields. Use `status`, `code` and safe cause metadata.
Do not rely on sockets, hooks, raw headers/bodies, identity, stacks or private server messages.
Non-Axios adapter/hook failures are normalized too. Scope errors expose safe status/code/cause as
`PermitContextError`. Update log pipelines that relied on raw error or user/resource contents.

## Wire and enforcement review

### W1 — Literal and whole-result validation

Authorization mocks and custom PDPs must return literal booleans. Bulk responses must contain
exactly one valid decision per input, including zero. One malformed member invalidates the whole
bulk, permissions or all-tenant result; no partial allow result is accepted. All-tenant entries
require `allow: true` and a string tenant key. Permission entries validate arrays/details, default
missing permissions/attributes, and omit nullable optional members. Legal own dictionary keys and
additive fields survive. Update truthy/incomplete fixtures and verify the live policy contract.
Sparse bulk slots reject before partial dispatch. `useOpa: true` on bulk/permission queries now
rejects through their configured throw/deny policy instead of being ignored; only check supports it.

### W2 — OPA request hooks now receive JSON text

The SDK serializes enforcement bodies before Axios merging to preserve legal `__proto__` and
`constructor` own keys. Supplied OPA interceptors/transforms receive a JSON string, including the
OPA input envelope. Parse/edit/stringify that text if a hook changes it; do not access it as a raw
object. Direct caller requests keep the caller's own shape. Circular/unsupported serialization
inputs produce safe `PermitError` before HTTP, or the operation's configured denial fallback.
Review custom adapters/hooks manually; the scanner cannot prove their transformations correct.

### W3 — All-tenants requests

`checkAllTenants(user, action, resource, context?, sdk?)` keeps its public call shape. Its request
sends actual normalized JSON input/context with SDK Authorization/language headers to
`allowed/all-tenants`; these are not misplaced body header/params objects. It parses
`allowed_tenants` and validates every grant. It does not inject the default resource tenant for
an all-tenant query. Update wire mocks and custom proxy expectations; keep authorization semantics.

### W4 — Retries and shared timeout budget

Retries are opt-in, as on reviewed main; published 2.7.5 had no SDK retry options. `maxRetries`
counts retries after the initial attempt. SDK REST POST/PATCH
writes are excluded even if listed; cancellation, invalid configuration and a non-boolean custom
predicate are not made safe by a retry condition. PDP/OPA authorization POST can retry when enabled.
Caller-owned retries/redirects remain the caller's responsibility.

A positive timeout covers failed attempts plus delays; each retry receives the remaining Axios
timeout. Caller adapters must honor it; arbitrary hooks are not interrupted by a wall-clock timer.
Per-call timeout `0` disables that timeout instead of falling through to the configured value.
SDK timeout applies to PDP/OPA; REST/Elements use the caller transport's timeout defaults.

### W5 — Injected Axios ownership

REST/Elements use `axiosInstance`; PDP has an internal transport; OPA uses `opaAxiosInstance`.
The SDK no longer registers handlers or rewrites caller defaults. Direct caller requests get no
SDK retries/logging. Current adapters, transforms, interceptors and default headers stay live on
every SDK attempt, including both Axios module entries. Explicit SDK Bearer credentials/routes
prevail over default Basic auth, `baseURL` or `allowAbsoluteUrls: false`. Intentional caller hooks
can still rewrite requests. Review applications relying on old shared-client pollution or doubled
retry policies. Explicit SDK routing precedence is retained from reviewed main.

### W6 — Context and snapshots

Per-check context now overrides call context, which overrides existing internal global context.
Review policies or fixtures that depended on per-check context being ignored. Legal own context
keys survive; request inputs are normalized without mutating the caller's resource. Filtering
uses a synchronous object-array snapshot. No new public global context registration API is added.

## Type review

### T1 — Removed symbols and generated models

Replace root `EnvironmentCopyConflictStrategyEnum` with `EnvironmentCopyConflictStrategy`.
Root `Statistics` is removed without a generic substitute. Together with A2, exactly seven root
names were removed from the reviewed main baseline. The generated derivation-settings name becomes
`PermitBackendSchemasSchemaDerivedRoleRuleDerivationSettings` and is available from `permitio`
alongside the resource-role method contracts. Other generated-only internal imports need review.
Resource-role and `granted_to` dictionaries use current named models. Review the historical
[generated inventory][inventory] and compile against the final package, not its old counts.

Required fields include `ResourceInstanceCreate.tenant`, `ResourceInstanceRead.tenant/tenant_id`,
`RoleAssignmentRemove.tenant` and generated-only `UserRoleRemove.tenant`. Supply actual tenants in
typed fixtures. Role inheritance remains optional `string[]`; it is not a new stricter behavior.
Server-generated array/envelope unions and generated removals do not imply backend route removal.

### T2 — Unspecified bulk results

`users.bulkUserCreate`, `bulkUserDelete`, `bulkUserReplace`,
`relationshipTuples.bulkRelationshipTuples` and `bulkUnRelationshipTuples` return `object`.
Their old request-payload result types were incorrect. Do not read synthetic counts, operation
arrays or processing reports; verify persisted outcomes through readbacks when needed.

### T3 — Strict consumer types

Constructor input is `IPermitOptions`; effective config is readonly `IPermitConfig`. Narrow unknown
error data and shape unions. `roleAssignments.list()` correctly reflects literal, dynamic, optional
and correlated detail/count flags; its existing wire behavior is retained. Prefer `listDetailed()`
when a guaranteed detailed envelope is appropriate. With `exactOptionalPropertyTypes`, omit absent
generated properties instead of explicitly setting `undefined`; constructor options are different.
Downstream projects are not forced to adopt the SDK's compiler flags. Import `CheckConfig`,
`ICheckQuery`, `IUserPermissions` and the named pagination/list result contracts from `permitio`
for explicit call and result annotations. `FormattedAxiosError` describes sanitized REST
diagnostics; its `error` body remains unknown until narrowed.

## Additions, not compulsory replacements

### N1 — Groups

Eight GA Groups wrappers preserve full envelopes and typed key/ID behavior. Group-to-group routes
remain deferred. Adopt these operations only when needed; they are not replacements for every role.

### N2 — Membership, detailed reads and refresh

`tenants.addUser()` creates a new user; an existing user is a duplicate error, not a generic
membership association. Three `listDetailed()` methods preserve their full detailed envelopes.
These operations always use the control plane even with facts proxying or waitForSync enabled.
`pdps.refresh({ reason })` is an environment refresh acknowledgement, not reload completion or an
individual-PDP refresh API. Do not treat acknowledgements as synchronization guarantees.

### N3 — Permission context, discovery and filtering

Permission context uses the fifth `getUserPermissions()` config argument. `getAuthorizedUsers()`
returns a validated full envelope for container/cloud PDP contracts. `getUserTenants()` is container
role-derived tenant discovery, not general membership or a cloud endpoint. An unavailable 404 always
rejects with actionable status, including non-throwing mode. New discovery/filter `useOpa` always
rejects. Other operational failures follow their documented error policy: normalized empty
authorized-user envelope, or empty tenant/filter arrays in non-throwing mode.

`filterObjects()` evaluates one dense readonly array through bulk decisions, preserving original
identity, order and duplicates. Only known resource fields are dispatched. Object request context
overrides call context; extra application fields remain in returned objects only. Empty inputs do
not bypass unsupported-option validation. URL checks and AuthZEN remain deferred.

## What scanning cannot certify

The read-only scanner identifies supported syntax and local Permit binding provenance. A COMPLETE
report means traversal/parsing completed for declared supported inputs, not that an application is
semantically migrated. Always review constructor environment values, authorization policy/results,
OPA hooks, error/log consumers, returned values, generated types, timeouts and external code.
REVIEW_REQUIRED marks unresolved/dynamic/escaped SDK sites. INCOMPLETE records parse/read failures,
unsupported wrappers, escaped/broken symlinks or zero supported sources. Exclusions are listed.
The scanner never executes target code, scripts, configuration modules or target dependencies.

[inventory]: https://github.com/permitio/permit-node/blob/90b49a1878f0/openapi/MIGRATION.md

## Complete migrated consumer

Both entry styles are supported. Validate the effective token; this example performs only a read.
The environment key selects its scope automatically. Broader keys need an allowed environment
selection through `permit.config.apiContext` after scope initialization.

```ts
import { Permit, PermitApiError } from 'permitio';

async function listUsers() {
  const token = process.env['PERMIT_API_KEY'];
  if (!token || /[\s\p{Cc}]/u.test(token)) {
    throw new Error('Set PERMIT_API_KEY to a nonempty whitespace-free API key.');
  }
  const permit = new Permit({ token });
  try {
    const page = await permit.api.users.list({ page: 1, perPage: 20 });
    return page.data;
  } catch (error: unknown) {
    if (error instanceof PermitApiError) {
      console.error('Permit users read failed', { status: error.status, code: error.code });
    }
    throw error;
  }
}

void listUsers();
```

For CommonJS, use `const { Permit, PermitApiError } = require('permitio')` and the same grouped
calls. Strict CJS/ESM fixtures and private loopback tests validate the packed entries.

## Migrate with an agent

The package contains [the customer migration skill](skills/permit-node-3-migration/SKILL.md).
Copy the whole `skills/permit-node-3-migration` directory from the package into your agent's skill
directory. Install its locked compiler prerequisite with pnpm and lifecycle scripts disabled,
as described in SKILL.md; then run its read-only scanner against the application directory.
Review the stable IDs above alongside the scanner's findings and coverage limitations. The scanner
does not perform edits, network calls or execute application code. A clean scan does not replace
policy, transport, generated-type and real consumer verification.
