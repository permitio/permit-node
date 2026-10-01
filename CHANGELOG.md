# Changelog

## Unreleased — 3.0

These changes describe the upcoming major release; this source still has package version 2.7.5.
See [the migration guide](MIGRATION.md) for affected callers, actions and retained behavior.

- **P1**: Upgrade the direct dependency and application lock after the 3.0 publication.
- **C1**: Support Node `^22.13.0 || ^24.0.0`.
- **C2**: Preserve root CommonJS/ESM imports; review changed internal generated paths.
- **C3**: Remove four unused transitive packages; direct consumers must declare them.
- **A1**: Remove all 29 flat API methods in favor of grouped clients.
- **A2**: Remove getMethods, five legacy exports, and ApiContext.level.
- **A3**: Adapt page/sync/rule results; reject empty rule creation and return void on unassign.
- **A4**: Allow omitted/partial condition filters; permission filters use the action key/ID.
- **F1**: Validate effective constructor options and default unset logging format to JSON.
- **F2**: Freeze SDK settings and copy initial context while keeping caller transports live.
- **E1**: Normalize PDP errors and preserve denial cardinality in non-throwing bulk results.
- **E2**: Detach and bound REST/scope error data; remove raw request and error identity access.
- **W1**: Require literal booleans and validate complete authorization responses.
- **W2**: Serialize enforcement bodies before Axios; OPA hooks now receive JSON text.
- **W3**: Send normalized all-tenants JSON and validate allowed_tenants grants.
- **W4**: Exclude REST POST/PATCH retries and share the PDP timeout budget across attempts.
- **W5**: Preserve live injected Axios behavior across entries without changing caller defaults.
- **W6**: Apply per-check context precedence and snapshot caller inputs without mutation.
- **T1**: Rename/remove generated symbols and require actual tenant fields.
- **T2**: Type five bulk results as unspecified object; verify persisted outcomes by reads.
- **T3**: Separate constructor/config types and accurately infer role-list envelopes.
- **N1**: Add eight GA grouped Groups operations.
- **N2**: Add new-user tenant membership, three detailed lists, and environment refresh ack.
- **N3**: Add permission context, authorized-user/role-tenant discovery, and object filtering.
