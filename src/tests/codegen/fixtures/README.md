# Historical OpenAPI regression fixture

`openapi-3.1.0.json` retains the public API snapshot committed in `4993c341` on 2026-06-28.
Its original capture date was not recorded. The API data contains 329 schemas and 160 paths;
two synthetic schemas, `CodegenProbe` and `CodegenProbeInner`, exercise OpenAPI 3.1 nullable
primitive arrays, `anyOf` with `null`, nullable references and nullable arrays.

Run `pnpm test:codegen` for local Java-free regression tests and `pnpm check:codegen` for real
fixture generation with Java 17. The fixture guard uses the same `openapi/generator.json`, pinned
7.25.0 generator, union templates, checked source corrections and tuple repair as production.
It validates the prepared OpenAPI document, completion metadata and all model shapes, including
11 historical property canaries. Temporary output is removed after success or failure.

The original fixture remains unchanged so generator upgrades retain a stable comparison point.
The current production snapshot, provenance, corrections, known generator diagnostics and refresh
procedure are documented in [openapi/README.md](../../../../openapi/README.md). Production
regeneration is separately checked twice for determinism and against committed output with
`pnpm check:openapi`. The shared model guard rejects unexpected `any`, empty interfaces and lost
union branches; it permits only reviewed free-form source contracts.
