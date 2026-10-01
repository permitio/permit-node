# Reviewed OpenAPI generation

`permit-api.json` preserves the exact bytes of the public OpenAPI 3.1.0 document captured on
2026-09-30 from <https://api.permit.io/v2/openapi.json>. `provenance.json` records its SHA-256,
164 paths, 263 operations and 333 schemas. Regeneration reads this committed snapshot; it does
not fetch a moving API definition. The generated API's `info.version` remains the backend's
`2.0.0`; that value is separate from the OpenAPI document version `3.1.0`.

Use the locked Node/pnpm toolchain and Java 17:

```sh
pnpm generate-openapi-client
pnpm check:openapi
pnpm check:codegen
pnpm verify
```

`generator.json` is the single configuration for production generation and the historical
fixture guard. `openapitools.json` pins generator 7.25.0. Both commands verify its recorded JAR
SHA-256 before invoking the generator. If the archive is missing, they download that exact version
from Maven Central and verify its bytes before caching or execution. Both commands validate the
prepared schema; neither skips validation.
The normalizer applies strict compiler-compatible imports and annotations before Oxfmt. Generation
checks all model shapes and the TypeScript 7 SDK build before replacing the previous generated tree.
A failure leaves the previous tree intact. Only generated TypeScript files are installed, so stale
models and APIs are removed. Temporary files are cleaned up even when generation fails.

`check:openapi` generates twice into independent directories, applies the same normalization and
formatting, and compares every TypeScript filename and byte, then compares the result with
`src/openapi`. CI runs this exact command alongside the historical fixture guard. Unit tests
exercise missing output, process errors, unexpected diagnostics, schema drift, degraded unions,
empty interfaces and tuple widening. Strict consumer tests protect role inheritance, required
tenant fields and representative request/response types.

## Reviewed corrections

`scripts/openapi-source.mjs` applies the following changes to an in-memory copy. Each correction
checks the original shape and fails if the upstream schema changes; unrelated duplicate tags,
unknown primitive types and unresolved references fail validation.

| Source pointer                                                                    | Correction and basis                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/tags/4`, `/tags/19`                                                             | Remove the second identical `Bulk Operations` tag. OpenAPI requires unique tag names.                                                                                                                                                    |
| `/components/schemas/OPALUpdateCallback/properties/callbacks/items/anyOf/1/items` | Move the two tuple entries into `prefixItems`, retain `minItems` and `maxItems` of 2, and set `items: false`, using OpenAPI 3.1/JSON Schema tuple syntax.                                                                                |
| `/components/schemas/ProxyConfig{Create,Read,Update}/properties/secret/anyOf`     | Replace the nonstandard `HeadersAuth`, `BasicAuth` and `BearerAuth` primitive names with the documented header dictionary or string shapes. Preserve the basic-auth pattern and bearer-token minimum length. No null branch is inferred. |

`elements-login.json` supplements only the existing `POST /v2/auth/elements_login_as` wrapper route
and its two request/response models. The contract was verified against backend OpenAPI on the
capture date; its hash is recorded separately. This route is absent from the public document but
is still used by `permit.elements.loginAs()`. Preparation fails if the route becomes published,
so the exception must then be reviewed and removed. Other routes omitted by the public snapshot
are accounted for in [migration notes](MIGRATION.md), without retaining obsolete generated files.

## Generator adaptations and unresolved source contracts

The small `model.mustache` override adds dispatch to `modelAnyOf.mustache`, which emits TypeScript
unions. The rest of the template comes from generator 7.25.0. Without this change, array-or-page
responses lose their array branch and the proxy secret becomes an empty interface. A checked
post-generation repair restores `CallbacksInner` to `string | [string, OPALHttpFetcherConfig]`;
the generator otherwise widens the tuple to `Array<any>`. Both defects have negative regressions.
A second checked repair preserves the SDK's explicit API/PDP base-path precedence over an injected
Axios instance's default `baseURL`. The new upstream helper would otherwise send requests to the
instance default. Actual-request tests cover scope discovery, REST facts and proxied facts routing.
The Axios request helper retains `ReturnType<typeof globalAxios.request<T, R>>`, removing the
upstream generic Promise assertion so declarations preserve Axios's actual response type.

The checked `typeMappings` setting maps the generator's `set` representation to `Array`.
`MonthlyUsage.monthly_tenants` is a JSON array; Axios does not construct a JavaScript `Set`.
The prepared source keeps the captured UUID item schema, `uniqueItems: true` and empty default.
The compiler shape guard rejects a regenerated `Set<string>` declaration. This generated model
is shipped as a declaration; it is not a supported root export or high-level organizations API.

Preparation also corrects exactly eight checked descriptions: data-generator derived-role settings,
invite approval, GroupAssignment/GroupCreate/GroupReadSchema, detailed relationship-tuple and
resource-instance pages, and TenantBlockRead. It checks each original string before replacing it,
fails on upstream drift and leaves other model descriptions unchanged.
The pinned generator flattens description newlines. A checked output repair restores the five
long corrected property comments before formatting and type checks. It requires one exact
generated occurrence for each property and leaves other comments and schema metadata unchanged.

The only accepted generator diagnostics are its OpenAPI 3.1 beta notice, the known tuple-name
warning, and its safe `Object` to `ModelObject` rename. Each has a specific comment in the runner;
all other warnings and every error fail generation. Completion metadata, syntax checks, model
shape checks and strict compilation still apply to the whole output.

Nine bulk-result schemas are empty source objects: create/delete relationship tuples, resource
instances and tenants, plus create/delete/replace users. They remain unspecified objects in the
generated API. The affected high-level user and tuple bulk methods return `Promise<object>`;
they no longer claim that the request payload is the response. No success counts or result fields
are invented. Backend result-schema completion remains outstanding.

The source explicitly permits unconstrained audit data, nested dictionaries and the untyped array
branch of `DataSourceEntryWithPollingInterval.data`. The guard allows only those reviewed fields
and that exact union. It rejects whole-model `any` degradation and empty interfaces.

The generated surface includes the published Groups, tenant-membership and PDP refresh routes.
Groups includes four routes tagged EAP and two deprecated routes; their source annotations are
preserved. This rebaseline does not add high-level wrappers for those features.

## Refreshing the snapshot

Save a new public response to a temporary file and review its paths, schema changes and wire
contracts before replacing `permit-api.json`. Update the capture date, hash and inventory in
`provenance.json`, then review whether each exact correction and the Elements supplement is still
needed. Run regeneration, the two-generation comparison, the historical fixture guard and
`pnpm verify`. Review generated additions/removals and update the migration inventory. Do not
update expectations merely to accept a degraded type.
