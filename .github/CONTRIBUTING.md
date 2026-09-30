# Contributing

Install the Node version from `.nvmrc` and pnpm 12.8.1. From the repository root:

```sh
pnpm audit --audit-level=moderate
pnpm install --frozen-lockfile --ignore-scripts
pnpm hooks:install
pnpm verify
```

`verify` runs the frozen dependency check, Oxlint, Oxfmt, strict TypeScript, both module builds,
all local unit, module-import, and tooling tests, and the reviewed API contract inventory. It requires no Permit credentials or Java.
CI uses the same verification command. Use `pnpm fix` for lint fixes and formatting, then rerun
`pnpm verify`. Hooks check files without rewriting them.

The hook installer enables Git's per-worktree configuration and installs prek into the current
checkout's own Git directory. It leaves the shared hook path and sibling worktrees unchanged.
Tool versions are pinned in the pnpm lockfile; Dependabot groups updates with a seven-day delay.
For any future remote prek hooks, use frozen commit hashes and `pnpm exec prek update
--cooldown-days 7 --freeze` when reviewing updates.

## Builds and imports

Authored source is ESM under `src/package.json`. Use `#src/` imports, including type-only imports
where appropriate. The root package keeps its CommonJS metadata because it publishes both
`build/index.js` and `build/index.mjs`. TypeScript emits declarations; a checked AST pass replaces
source aliases with paths that resolve inside the packed package. Do not publish source aliases
or change public entry points as an incidental tooling fix.

TypeScript 7 is the SDK checker and emitter. TypeDoc and the generation guard need a JavaScript
compiler API, so the private `tools/compiler` workspace explicitly owns maintained TypeScript 6
and TypeDoc. The SDK has no runtime dependency on that workspace.

## Tests

Use `pnpm test:unit` for focused unit work and `pnpm test:module-imports` for the built entry points.
Add new source tests beside the code as `*.test.ts`; existing grouped `src/tests` suites can be
extended in place. Mock external boundaries and test malformed input and failures. Demonstrate
that a representative regression fails when its fix is removed.

`pnpm test:codegen` tests the generator guard and local tooling without Java. Regeneration requires
Java 17: `pnpm generate-openapi-client` reads the reviewed committed snapshot and shared configuration,
then validates and normalizes the generated output before replacing it. `pnpm check:openapi` compares
two clean generations with each other and the committed output. The separate `pnpm check:codegen`
guard regenerates the historical fixture using the same pinned generator and configuration.
See [the generation guide](../openapi/README.md) before refreshing the snapshot. Never replace the
historical fixture or change API shapes merely to make a tooling check pass.

`test:integration` and `test:e2e` use a Permit backend. Run them locally only with explicit
authorization. The standard verification command uses local fixtures only.

## API operation and shape evidence

`pnpm check:api-contracts` verifies the local AST inventory, source provenance and exact operation
omission decisions. `pnpm check:api-drift` also compares current public schema documentation with
the pinned snapshots; it makes no backend operation calls. Reports distinguish local integrity,
coverage gaps, the unavailable shared parity target and unmeasured backend behavior. See
[the evidence guide](../api-coverage/README.md) before changing a baseline or exclusion.

## Documentation and changes

Run `pnpm run docs` to generate API documentation, or `pnpm run docs:watch` while editing TSDoc.
Use `pnpm run docs -- --out /absolute/output/path` to inspect output without replacing tracked docs.
Keep generated documentation out of unrelated changes.

Keep changes focused, preserve supported runtime behavior, and describe validation and remaining
limitations in the PR. Check [AGENTS.md](../AGENTS.md) for repository development rules.

## Dependency security

Install [Trivy 0.74.0](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0) for the same
scanner used in CI. The audit runner uses Node built-ins and runs before SDK dependencies install:

```sh
node scripts/audit-dependencies.mjs --locked-only --out security-preinstall
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm pack --out candidate.tgz --ignore-scripts
pnpm audit:dependencies --artifact candidate.tgz --out security-report
```

The report covers the locked SDK runtime graph, the complete development/tooling workspace,
and two independently resolved consumers of the actual tarball. Runtime dependencies are exact
pins, so the minimum and newest supported direct versions are identical. Both consumer lanes
resolve current compatible transitive versions; neither claims to test the lowest transitive
versions. Adding dependency ranges or peer dependencies requires explicit supported-range lanes.

The pinned pnpm resolver uses a 24-hour release delay and disables scripts. It resolves a consumer
lockfile, audits it, then performs a frozen installation only after that lane passes. Trivy's
runtime dependency graph must match an independent pnpm lock inventory. Empty results, incomplete
inventory, malformed output, process failures and unresolved consumer installs are INVALID.

Exit codes are 0 (PASS), 1 (FAIL: fixable HIGH/CRITICAL findings) and 2 (INVALID: not completed).
All other advisories and registry severity totals remain visible in JSON and Markdown, including
findings without available fixes. Raw scanner output and each consumer lockfile are retained.
Do not add ignored advisory IDs, dependency overrides or scanner suppression files.

CI requires these checks on Node 22.13 and 24.0. The weekly Monday workflow and manual dispatch
publish GitHub summaries and downloadable evidence; repository maintainers review failed runs.
Slack delivery requires a separately authorized destination and is not configured here.
The release job also scans its final tarball immediately before publication with scripts disabled;
it cannot publish if either scanner or consumer lane fails. npm Trusted Publishing requires
Node >=22.14.0 and npm >=11.5.1; the release job validates the npm bundled with its Node 24 runner.
The supported SDK Node floor remains 22.13.0.

Dependabot groups runtime and tooling minor/patch updates, uses `increase`, and waits seven days
(fourteen for majors). Its published support matrix currently lists pnpm through version 10;
pnpm 12 lock updates are not yet verified. Maintainers must review dependency update failures and
apply compatible pinned updates manually until the bot supports this lockfile. The scheduled
security gate does not depend on Dependabot and continues to scan all four trees.
