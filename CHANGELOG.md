# Changelog

## Unreleased — 3.0

These changes describe the unpublished 3.0.0 candidate; they do not announce a release.
See [the migration guide](MIGRATION.md) for affected callers, actions and retained behavior.

- **P1**: Upgrade the direct dependency and application lock after the 3.0 publication.
- **C1**: Support Node `>=22.13.0`.
- **C2**: Preserve named CommonJS/ESM imports and loader-specific declarations;
  review internal paths.
- **C3**: Remove six former dependencies (`@bitauth/libauth`, `axios-retry`, `lodash`,
  `path-to-regexp`, `require-in-the-middle`, `url-parse`); consumers that import them must
  declare them.
- **A1**: Remove all 29 flat API methods in favor of grouped clients. The 14 user and tenant
  replacements follow `proxyFactsViaPdp` and the facts sync timeout settings; the flat methods
  always used `apiUrl`.
- **A2**: Remove getMethods, five legacy exports, and ApiContext.level.
- **A3**: Adapt page/sync/rule results; reject empty rule creation and return void on unassign.
- **A4**: Allow omitted/partial condition filters; permission filters use the action key/ID.
- **F1**: Validate effective constructor options and default unset logging format to JSON.
  Breaking: `log.json: false` now selects pretty text rather than the old JSON output.
  Update log parsers or use `log.json: true`. Pretty output writes synchronously; blocked stdout
  can delay the application. The default JSON destination is unchanged. A supplied
  `axiosInstance` or `opaAxiosInstance` must come from axios 1.0.0 or later.
- **F2**: Freeze SDK settings and copy initial context while keeping caller transports live.
- **E1**: Normalize PDP errors and preserve denial cardinality in non-throwing bulk results.
- **E2**: Detach and bound REST/scope error data; remove raw request and error identity access.
- **W1**: Require literal booleans and validate complete authorization responses. An OPA
  `{ result: {} }` or a bulk entry without a boolean `allow` raises `PermitPDPStatusError` in
  throwing mode instead of returning `false`.
- **W2**: Serialize enforcement bodies before Axios; OPA hooks now receive JSON text.
- **W3**: Send normalized all-tenants JSON and validate allowed_tenants grants.
- **W4**: Exclude REST POST/PATCH retries and share the PDP timeout budget across attempts.
- **W5**: Preserve live injected Axios behavior across entries without changing caller defaults.
- **W6**: Apply per-check context precedence and snapshot caller inputs without mutation.
- **T1**: Rename/remove generated symbols and require actual tenant fields.
- **T2**: Type five bulk results as unspecified object; verify persisted outcomes by reads.
- **T3**: Separate constructor/config types and accurately infer role-list envelopes, including
  `users.getAssignedRoles()` with a runtime flag. Classes implementing `IPermitClient` or
  `IPermitApi` must add the new members.
- **N1**: Add eight GA grouped Groups operations.
- **N2**: Add new-user tenant membership, three detailed lists, and environment refresh ack.
- **N3**: Add permission context, authorized-user/role-tenant discovery, and object filtering.
- Add `permit.api.userInvites` create/list/get/update/delete/approve for facts invites. `approve()`
  reports every HTTP 400 with a generic message, because the server's text can contain another
  invite's stored email.
- Add `permit.api.auditLogs` list/get for the selected environment's authorization audit logs.
- Add `permit.api.environments.copyAsync` and `getCopyResult` for background environment copies;
  the SDK returns each task response once and does not poll.
- `users.list()` accepts `searchOperator` and `includeResourceInstanceRoles`.
  `tenants.list({ includeTotalCount: true })` returns the complete page with `total_count`.
- Add `permit.getLocalRoleAssignments` with dedicated local query/row types, complete array
  validation and one-page REST pagination. Invalid input, OPA, malformed pages and unavailable
  HTTP 404/405/501 remain visible even in non-throwing mode.
- Add typed `permit.api.apiKeys` list/get/create/delete/rotate/getScope operations through
  the control plane, preserving complete pages, scoped bodies and optional returned secrets.
  Management does not initialize context; rotation is bodyless and is not replayed by the SDK.
- Add typed `permit.api.proxyConfigs` for the five published control-plane configuration routes,
  preserving complete mapping rules and received secret values without input rehydration.
- Add `permit.checkUrl` and `CheckUrlConfig` for the published container URL check, with
  tenant/context/timeout options. Invalid input, unsupported OPA, malformed decisions and
  unavailable HTTP 404/405/501 remain visible even in non-throwing mode.
- Add typed `permit.api.roles.bulkCreateOrReplace` for existing tenant and resource role bulk
  creation/replacement, preserving the complete `created` and `updated` result arrays.
- Add `permit.api.userAttributes` for user attribute schema list/get/create/update/delete,
  preserving the dedicated routes and complete `ResourceAttributeRead` results. User values
  remain managed through `permit.api.users`.
- Export existing resource-relation/resource-role clients and their public contracts, plus missing
  method input/result types. `ApiContextLevel` and `PermitContextChangeError` are also named root
  exports. Generate linked group reference pages and validate local reference targets; building
  documentation does not publish the candidate.
- `new Permit()` works without an options object, reading every setting from the environment, and
  a nested `log` or `multiTenancy` field left `undefined` keeps its default, as in 2.x.
- `X-Permit-SDK-Version` carries the SDK's own version; it carried the host application's
  `npm_package_version`.
- A PDP URL with a path prefix (`http://gateway/pdp`) gives the OPA URL
  `http://gateway:8181/pdp/v1/data/permit/`; 2.x joined the prefix without a slash.
- A PDP retry stops when less than a millisecond of the timeout budget is left, instead of sending
  its last attempt with no timeout.
- Request values shorter than 8 characters are no longer redacted out of error and log messages.
- A partly redacted error body keeps its surrounding text when a later error layer sanitizes it
  again. A large request, such as a `bulkCheck()` of many items, keeps the transport `code`, a
  code-bearing message and the configured PDP address instead of a generic message.
- A per-call `timeout` that is not a finite number from 0 to 2147483647 ms rejects with
  `PermitError` before any request, regardless of `throwOnError`; it surfaced as a PDP connection
  failure, or a silent deny. A `null` or primitive `bulkCheck()` slot raises `PermitError`, not a
  raw `TypeError`.
- `util.inspect()` and `JSON.stringify()` show the configured token, and the generated clients'
  access token, as `[REDACTED]`; `permit.config.token` still reads it.
- `resourceRelations.list` also accepts the raw-array response of older APIs.
- `users.list`, `tenants.list`, `tenants.listTenantUsers`, `resourceInstances.list` and
  `relationshipTuples.list` default to `page: 1, perPage: 100`, as their pagination
  documentation and the `listDetailed()` methods already did. They sent no pagination before, so
  the API returned its own default of 30 records. Pass `perPage` to keep a smaller page.
