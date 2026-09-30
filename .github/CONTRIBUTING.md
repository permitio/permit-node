# Contributing

Install the Node version from `.nvmrc` and pnpm 12.8.1. From the repository root:

```sh
pnpm audit --audit-level=moderate
pnpm install --frozen-lockfile --ignore-scripts
pnpm hooks:install
pnpm verify
```

`verify` runs the frozen dependency check, Oxlint, Oxfmt, strict TypeScript, both module builds,
and all local unit, module-import, and tooling tests. It requires no Permit credentials or Java.
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

## Documentation and changes

Run `pnpm run docs` to generate API documentation, or `pnpm run docs:watch` while editing TSDoc.
Use `pnpm run docs -- --out /absolute/output/path` to inspect output without replacing tracked docs.
Keep generated documentation out of unrelated changes.

Keep changes focused, preserve supported runtime behavior, and describe validation and remaining
limitations in the PR. Check [AGENTS.md](../AGENTS.md) for repository development rules.
