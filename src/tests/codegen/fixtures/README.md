# Codegen guard fixture

`openapi-3.1.0.json` contains the snapshot of
<https://api.permit.io/v2/openapi.json> committed in `4993c341` on 2026-06-28.
The original capture date was not recorded. The snapshot has 329 API schemas and
160 paths. Its API data is unchanged; the JSON is formatted for review.

Two synthetic schemas, `CodegenProbe` and `CodegenProbeInner`, exercise OpenAPI 3.1
nullable type arrays, `anyOf` with `null`, nullable references and nullable arrays.
The guard checks their generated property types as well as role inheritance and
scalar canaries. The fixture must retain its `3.1.0` header.

Run `yarn test:codegen` for Java-free AVA regression tests and `yarn check:codegen`
for generation (Java 11+ required). The guard reads the generator version from
`openapitools.json` and the options from `generate-openapi-client` in `package.json`.
It rejects new options it cannot reproduce. Temporary output is removed after each run.

Generator 7.25.0 was selected using the Maven Central release metadata captured
2026-09-29. It supports all four existing `typescript-axios` options and removes
the extra index signatures emitted by 7.12.0 in two derived-role models. Its
output is checked with the existing TypeScript compiler; the shipped client in
`src/openapi/` is not regenerated here (PER-16500's semver-major follow-up).

The guard checks completion metadata, unexpected `any` in all models and 11
specific property shapes. Its 20 permitted bare-`any` fields represent deliberately
unconstrained API data. Nested free-form dictionaries are also permitted. This is
not proof of complete JSON Schema support: both 7.12.0 and 7.25.0 turn an untyped
`const` into `any`, and the API's nonstandard `HeadersAuth`, `BasicAuth` and
`BearerAuth` schema types still produce an empty `Secret` interface. These upstream
limitations and live-spec drift belong to the PER-16500 follow-up; no entire model
is exempted from the `any` checks. The older npm wrapper also emits Node 24's
DEP0190 warning because it invokes Java through a shell; updating that dependency
and its lockfile is separate work. Relative generator arguments avoid its path
splitting bug, and completion metadata catches its false-success signal exits.

To refresh the API snapshot intentionally:

1. Save the current `CodegenProbe` and `CodegenProbeInner` schemas.
2. Download the source:

   ```sh
   curl --fail https://api.permit.io/v2/openapi.json -o /tmp/permit-openapi.json
   ```

3. Merge the two probes into `components.schemas`, then write the fixture with
   `JSON.stringify(spec, null, 2) + '\n'`. Run Prettier on the fixture and record
   the capture date here.
4. Review schema changes and any changes to the exact free-form property list in
   `scripts/check-codegen.mjs`; do not exempt new degradation just to pass the guard.
5. Run `yarn test:codegen` and `yarn check:codegen`. Check that generator 6.2.1
   still fails in an isolated checkout. Do not regenerate `src/openapi/` as part
   of refreshing this fixture.
