# Contributing

Install the Node version from `.nvmrc` and pnpm 12.8.1. From the repository root:

```sh
pnpm audit --audit-level=moderate
pnpm install --frozen-lockfile --ignore-scripts
pnpm hooks:install
pnpm verify
```

`verify` runs the frozen dependency check, Oxlint, Oxfmt, strict TypeScript, both module builds,
all local unit, module-import, and tooling tests, and the reviewed API contract inventory.
It requires no Permit credentials or Java. CI runs these checks in separate required jobs,
then validates generated contracts, workflows, packed consumers and dependency security.
Use `pnpm fix` for lint fixes and formatting, then rerun `pnpm verify`.
Hooks check files without rewriting them.

Packed-customer fixture preparation resolves and audits an isolated dependency lock before a
frozen installation with scripts disabled. It may fetch packages and registry audit data, so a
fresh checkout does not depend on a developer's pnpm metadata cache. The copied migration skill
uses its shipped compiler lock without re-resolving it. SDK behavior tests use local fixtures;
package preparation does not contact Permit services. Cold dependency setup has a separate bounded
setup budget; behavioral assertions and failure/skip gates remain unchanged.

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

Use `pnpm exec vitest run --project unit path/to/file.test.ts` for focused unit work.
`pnpm test:unit` runs the complete unit project with the execution report gate;
`pnpm test:module-imports` checks the built entry points.
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

Gated commands write native JSON and execution summaries to `.test-results/`. They reject missing
files, empty/all-skipped suites and unreasoned skips. Missing `PDP_API_KEY` reports `UNAVAILABLE`
and exits 2 before backend tests start. Optional organization/project credentials may be absent,
but supplied keys with the wrong scope fail. Named optional gaps and the existing PER-16553 ABAC
block appear separately from executed tests as a `PARTIAL` result. `pnpm coverage` reports every
authored runtime module, excluding generated clients and tests, without a percentage threshold.

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
The shared candidate security jobs scan the same versioned archive as the packed consumer jobs.
Failed, skipped, cancelled or missing candidate gates prevent the publisher from running.
npm Trusted Publishing requires Node >=22.14.0 and npm >=11.5.1; the release job validates
the npm bundled with its Node 24 runner.
The supported SDK Node floor remains 22.13.0.

Dependabot groups runtime and tooling minor/patch updates, uses `increase`, and waits seven days
(fourteen for majors). Its published support matrix currently lists pnpm through version 10;
pnpm 12 lock updates are not yet verified. Maintainers must review dependency update failures and
apply compatible pinned updates manually until the bot supports this lockfile. The scheduled
security gate does not depend on Dependabot and continues to scan all four trees.

## Release gate rollout

The `SDK required checks` aggregate requires the shared candidate, the explicit trusted/fork backend
path and cleanup to succeed. Candidate gates require lint, strict types, unit/tooling tests,
workflow checks, generated contracts, the versioned archive, both supported-floor packed consumers
and dependency security. Fork and Dependabot runs report backend coverage as UNAVAILABLE and run
local checks; same-repository backend runs fail when their required secret is missing. Failed
cleanup attempts every owned environment deletion, then fails the aggregate rather than warning
and reporting success.

The publisher receives the archive from the same workflow run. Its SHA-256, metadata and committed
source identity must match before npm executes. Publication acceptance is separate: SDK71 has no
`releaseReady=true` contract while the shared target and Curtain Call remain unresolved. There is
no dispatch flag or manual approval boolean that substitutes for those contracts.

The following owner rollout is proposed, not applied. First observe a successful GitHub Actions
check named exactly `SDK required checks` on the final PR commit, including a fork run and a
trusted backend run. In active ruleset `main2` (24216899), add that exact context with GitHub
Actions integration ID 15368 to `required_status_checks`; preserve every other field, including
strict checks, no bypass actors, approval and thread-resolution requirements. Verify a
missing/failing check blocks merge before relying on the setting. The 2026-10-01 read-only audit
found the list empty; legacy branch-protection lookup returned 404 because the repository uses
rulesets.

After the acceptance blockers are resolved, propose production environment reviewers, prevent
self-review, restrict deployment to the approved release tags, and create tag rules restricting
creation, updates and deletion to the owner's release process. The same audit found no production
protection rules/deployment policy and no tag rulesets. These settings require a separate concrete
owner approval; retain existing branch rules and do not grant a bypass to get a release through.

Before an authorized release, an npm package owner must verify the active Trusted Publisher binds
`permitio/permit-node`, `node_sdk_publish.yaml` and `production`, with publication permission and
appropriate account protection. Public registry provenance for 2.7.6 confirms that historical
workflow identity, but does not prove the current trust configuration. Read-only `npm trust list`
returned E401 in the audit; no authentication, ownership or publisher settings were changed.
No credentials belong in the archive, validation evidence or workflow logs. Website reference
publication remains separate from npm publication.
