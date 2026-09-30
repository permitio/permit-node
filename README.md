![Node.png](imgs/Node.png)

# Permit.io client for Node.js

Node.js client library for the Permit.io full-stack permissions platform.

## Supported runtimes

Node.js 22.13.0 or newer in the 22.x line, and Node.js 24.x are supported.
CI tests the minimum versions, 22.13.0 and 24.0.0. The package provides both
CommonJS (`require`) and ES module (`import`) entry points.

## Installation

```
npm install permitio
```

## Development

Use the Node version in `.nvmrc` and pnpm 12.8.1, pinned in `package.json`.
Install pnpm with `npm install --global --ignore-scripts pnpm@12.8.1`. Then run:

```sh
pnpm audit --audit-level=moderate
pnpm install --frozen-lockfile
pnpm hooks:install
pnpm verify
```

Installs disable lifecycle scripts, so builds and hook setup are explicit. Run `pnpm hooks:install`
to install prek for the current checkout without changing sibling worktree hooks. New dependency versions must be
at least 24 hours old; direct dependencies are saved with exact versions.

`pnpm test` runs the unit and module-import suites without a Permit backend.
`pnpm test:codegen` tests the generator guard without Java; `pnpm check:codegen` also
regenerates the fixture and requires Java 17. `pnpm check:openapi` regenerates the reviewed
production snapshot twice and verifies committed output. See [OpenAPI generation](openapi/README.md)
and its [migration inventory](openapi/MIGRATION.md).

## Release

Releases use the `Release permit Node SDK` GitHub workflow after maintainer approval. The workflow
validates the literal release tag, verifies dependency security on both supported Node floors,
builds and tests the SDK, then scans and publishes the same tarball through npm Trusted Publishing.
Dependency installation, packing, and publication disable lifecycle scripts. Failed or incomplete
security scans block publication. Release candidates use the `rc` distribution tag.

See [Contributing](.github/CONTRIBUTING.md#dependency-security) for local scan commands and reports.

## Constructor Configuration

The constructor accepts `IPermitOptions`. Omitted values use environment variables and SDK
defaults. A nonempty token is required after `PERMIT_API_KEY` fallback; tokens are opaque strings
and cannot contain whitespace or control characters. PDP and REST URLs must be absolute HTTP(S)
URLs. Invalid settings throw before the SDK creates a logger or transport, with errors that omit
caller values.

In 3.0, `permit.config` settings and their SDK-owned nested objects are frozen. Configure tokens,
URLs, logging, tenancy and retry settings at construction time. Supplied Axios instances and
retry callbacks remain caller-owned and live; their defaults, interceptors and mutable callback
state can still change.

A supplied `apiContext` is copied into an independent SDK-owned context, preserving its initial
permissions and selection. It no longer retains the supplied object's identity. Make later
context changes through `permit.config.apiContext`. Concurrent first REST calls share one scope
lookup per SDK. A failed initial lookup rejects its waiting calls and allows a later retry. Invalid
hierarchical scope replies are rejected atomically, and late replies preserve explicit context
changes.

## Retry Configuration

The SDK includes built-in retry support for transient failures. Retries are **opt-in**:
they are **off** unless you pass a `retry` config (or `retry: { enabled: true }`).

When enabled, the defaults are:

- **3 retries** (up to 4 total attempts) with exponential backoff
- Retries on recognized transient network errors and status codes: `408`, `429`, `500`, `502`, `503`, `504`
- Respects `Retry-After` headers for rate limiting (429)

`maxRetries` is the number of retries _after_ the initial request, so the default of `3` means up to 4 total requests.

> **Behavioral note**
>
> - Retries are opt-in — providing a `retry` config object turns them on; omitting it (or passing `retry: false`) leaves them off.
> - When enabled, PDP/OPA calls additionally retry `POST` because authorization queries are idempotent.
> - SDK retries never repeat REST `POST` or `PATCH`, even when listed in `retryMethods`. The default idempotent methods remain `GET`, `HEAD`, `OPTIONS`, `PUT` and `DELETE`.
> - Cancellation and invalid request configuration are never retried, even with a custom predicate. Unclassified response-less errors are not retried by the default predicate.

Retry options are checked when the SDK is constructed. Counts must be nonnegative safe integers;
delays must be finite milliseconds from 0 through 2,147,483,647; the backoff multiplier must be
finite and at least 1. Retry predicates must return a boolean. Invalid configuration fails with
an actionable error instead of silently accepting a malformed policy.

For 3.0, failed attempts and backoff consume **one Axios timeout budget**. Each retry gets the
remaining timeout, and a delay that exhausts the budget prevents another attempt. The SDK `timeout`
option applies to PDP/OPA; REST and Elements use the supplied Axios instance's timeout. A timeout
of 0 disables the deadline; omitted SDK timeouts preserve caller defaults. This changes the earlier
behavior that reset the full timeout for every retry. Axios adapters must honor the timeout;
arbitrary caller interceptors or adapters are not interrupted by an SDK wall-clock deadline.

A supplied `axiosInstance` serves REST and Elements; `opaAxiosInstance` serves OPA. The SDK keeps
these caller instances unchanged and delegates every attempt through their live adapters,
transforms and interceptors. Two SDK instances can share a client while retaining separate
routes, Bearer tokens, logging and SDK retry policies. SDK requests explicitly allow their configured
absolute URLs even when the caller default `allowAbsoluteUrls` is false, so a caller base URL cannot
prefix or reroute an SDK destination. Direct caller requests retain that caller restriction and remain
usable and acquire no SDK retries. Default Basic credentials cannot replace an explicit
SDK Bearer token. Intentional caller hooks can still rewrite request configuration, including
headers and transforms; caller-owned retry or redirect behavior remains the caller's responsibility.
PDP requests use a separate internal transport. There are no SDK registrations on supplied
instances to dispose of.

### Customizing Retry Behavior

```typescript
import { Permit } from 'permitio';

// Retries are off by default (opt-in)
const permitDefault = new Permit({ token: 'your-api-key' });

// Enable with custom retry configuration
const permitCustom = new Permit({
  token: 'your-api-key',
  retry: {
    maxRetries: 5,
    retryDelay: 500, // Initial delay in ms
    backoffMultiplier: 2, // Exponential backoff multiplier
    maxDelay: 30000, // Maximum delay cap
  },
});

// Explicitly disable retry
const permitNoRetry = new Permit({
  token: 'your-api-key',
  retry: false,
});

// Different config for PDP vs REST API
const permitPdp = new Permit({
  token: 'your-api-key',
  retry: { maxRetries: 3 },
  pdpRetry: { maxRetries: 5 },
});
```

## Logging and errors

`log.level` controls the SDK's log level (default: `warn`). Set it to `debug` to include HTTP
request and response diagnostics, or `silent` to disable SDK logs. `PERMIT_LOG_LEVEL` supplies
the default when `log.level` is omitted.

Logs are JSON lines by default. Set `log.json: false` for pretty text. When `log.json` is
omitted, `PERMIT_LOG_JSON` supplies the default: `false` selects pretty text, while `true`, an
unset variable, or any other value keeps JSON lines. The variable ignores letter case and
surrounding whitespace. An explicit `log.json` setting always overrides the environment variable.
Pretty output uses an in-process stream without worker threads. SDK initialization logs do not
include the API key or serialized configuration.

```typescript
import { Permit } from 'permitio';

const permit = new Permit({
  token: process.env.PERMIT_API_KEY,
  log: { level: 'debug', json: false },
});
```

With the default `throwOnError: true`, a PDP response with an unexpected status code, or a `200`
response with a body the SDK cannot read, throws `PermitPDPStatusError`, a subclass of
`PermitConnectionError`. It carries the HTTP `statusCode` and a bounded, sanitized `responseBody`.
Transport failures, such as refused connections or timeouts, throw `PermitConnectionError` with
a safe `cause` and transport `code` when available. Match errors with `instanceof`,
not their `name` or message, and check the more specific status error first:

```typescript
import { PermitConnectionError, PermitPDPStatusError } from 'permitio';

try {
  await permit.check('user-1', 'read', 'document:one');
} catch (error) {
  if (error instanceof PermitPDPStatusError) {
    console.error('PDP HTTP status:', error.statusCode);
  } else if (error instanceof PermitConnectionError) {
    console.error('PDP connection failed');
  } else {
    throw error;
  }
}
```

REST failures, including retained deprecated methods, throw named `PermitApiError` errors.
The SDK accepts `message`, `detail` (including validation-error arrays), and text error bodies;
missing descriptions fall back to the HTTP status or transport failure. `status`, `code` and a
detached safe `cause` retain failure metadata. API-key scope failures use `PermitContextError`
with the same safe metadata.

These are deliberate 3.0 error-property changes. `PermitApiError.originalError` is a detached Axios
snapshot; `response.data` and `formattedAxiosError.error` have type `unknown` after redaction.
`PermitApiError` no longer takes a response-body type parameter; narrow the sanitized data before use.
`request` is always undefined. Snapshots omit request bodies, parameters, socket objects, hooks,
original stacks and raw causes. Response diagnostics keep only `message`, `detail`, `msg`,
`error_code`, `code` and `errors`; nested values, item counts and text lengths are bounded.
Request header values remain redacted except known protocol/SDK headers. Response header values
are redacted except content type, content length and retry timing. Credential URL components
(user information, query values and fragments) are removed. Known request credentials and private
values are scrubbed from error descriptions; oversized or deeply nested requests cause descriptions
to be redacted. Failures from caller adapters, interceptors and retry hooks follow the same rules;
uninspectable primitive rejections use a useful operation fallback. Credentials and identity/permission
attributes are omitted from JSON and pretty
SDK logs, including successful authorization calls.

These rules apply to `check`, `bulkCheck`, `getUserPermissions`, and `checkAllTenants`.
PDP responses are validated before authorization data reaches the caller. Direct PDP responses
and OPA `result` envelopes are supported. Decisions must be literal booleans; bulk results must
contain exactly one decision for each requested position. An empty bulk request requires an empty
result. Every all-tenant entry must have `allow: true` and a tenant with a string key; a denied or
malformed entry invalidates the whole result. A legacy `result` boolean alongside `allow` is
additive metadata and does not override the decision.

Permission entries must contain string arrays when `permissions` or `roles` are supplied. Tenant
and resource details require string keys, resources also require a string type, and supplied
attributes must be objects. The SDK applies the PDP's documented defaults: missing permissions
become `[]`, missing attributes become `{}`, and nullable optional roles/tenant/resource fields are
omitted. Null permissions or attributes are invalid. Extra fields are retained. Dictionary identifiers
such as `result`, `permissions`, and `__proto__` remain valid; a valid direct map takes precedence
over interpreting it as an OPA envelope.

These are deliberate next-major response contract changes: malformed responses that previously
escaped as truthy values, incomplete bulk arrays, or unchecked permission/tenant objects now fail.
`useOpa: true` is supported by `check()` only; bulk and permission calls reject it under the same
error policy instead of ignoring it. Per-call `timeout: 0` disables the timeout.

With `throwOnError: false`, failures, including an invalid resource string, return `false` for
`check`, one `false` per input for `bulkCheck`, `{}` for `getUserPermissions`, and `[]` for
`checkAllTenants`. The first three methods also accept per-call error-policy overrides;
`checkAllTenants` uses the SDK setting.

## Groups

`permit.api.groups` supports the eight GA core operations: `create`, `delete`, `list`, `get`,
`assignUser`, `removeUser`, `assignRole`, and `removeRole`. `list` and `get` use the direct Groups
endpoints. Pass a qualified resource:instance key (such as `team:support`) or an internal group
instance ID to identify a group.

Create and assignment calls return `GroupRead`, which contains the group and membership fields.
Direct reads return `GroupReadSchema`, which also contains `id`. `list` always returns the full
`PaginatedResultGroupReadSchema` envelope: `data`, `total_count`, and optional `page_count`.
It accepts `tenant`, `resource`, `search`, `page`, and `perPage`; pagination defaults to page 1
with 100 rows per page.

```typescript
// The group resource type, user, tenant, target resource instance, and role already exist.
const groupKey = 'team:support';
await permit.api.groups.create({
  group_resource_type_key: 'team',
  group_instance_key: 'support',
  group_tenant: 'east',
});
await permit.api.groups.assignUser(groupKey, 'alice', { tenant: 'east' });

const grant = {
  role: 'reader',
  resource: 'document',
  resource_instance: 'quarterly-report',
  tenant: 'east',
};
await permit.api.groups.assignRole(groupKey, grant);
const page = await permit.api.groups.list({ tenant: 'east', page: 1, perPage: 20 });
console.log(page.data, page.total_count);

await permit.api.groups.removeRole(groupKey, grant);
await permit.api.groups.removeUser(groupKey, 'alice', { tenant: 'east' });
await permit.api.groups.delete(groupKey);
```

Group role grants apply through ReBAC relationships and role derivation. Members inherit the
granted resource role; revoking the grant or removing membership removes that inheritance after
policy and facts synchronization. Both adding and removing a user require the tenant JSON body.
Role assignment and removal require `role`, `resource`, `resource_instance`, and `tenant`.

## Documentation

[Read the documentation at Permit.io website](https://docs.permit.io/sdk/nodejs/quickstart-nodejs#add-the-sdk-to-your-js-code)

## API Reference

[Check out the tsdoc reference here.](https://permitio.github.io/permit-node/classes/Permit.html)
