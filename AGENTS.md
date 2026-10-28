# Working on the Permit Node SDK

Use Node 22.13.0 or newer, and the exact pnpm version in `package.json`.
Run `pnpm verify` before proposing a change. This runs the pinned prek checks, builds both
published entry points, and runs local unit, module-import, and tooling tests.

## Source and types

- Authored TypeScript uses ESM and `#src/` imports. Tooling tests use `#scripts/` imports.
- Keep every strict compiler option enabled. Do not use `skipLibCheck`, blanket exclusions,
  or assertions to conceal unsupported public types.
- esbuild bundles CJS and ESM; TypeScript 7 emits declarations. The declaration build resolves
  source aliases to portable paths. Preserve the existing package entry points.
- `tools/compiler` explicitly contains TypeScript 6's maintained compiler API for TypeDoc and
  AST tooling. It does not check or emit the SDK build.
- Use Oxlint with the TypeScript, import, and unicorn plugins and Oxfmt's 100-column format.
- New source tests should be colocated `*.test.ts` files. Existing grouped suites remain in
  `src/tests`; add focused regressions there when changing an existing tested behavior.
- Document non-trivial public APIs with parameters, return values, and relevant failure cases.

## Generated source

Regenerate from the reviewed committed snapshot with `pnpm generate-openapi-client`. The shared
configuration, checked schema corrections and narrow template adaptations live in `openapi/` and
`scripts/openapi-*.mjs`. The generator normalizes strict imports and annotations, formats output,
and checks the SDK before replacing generated files. Keep the normalization and shape tests passing.
`pnpm check:openapi` verifies two clean generations and committed output; `pnpm check:codegen`
retains the historical fixture checks. Both require Java 17. See `openapi/README.md` before
refreshing the snapshot; never bypass schema validation or invent unspecified bulk-result fields.

## Dependencies and hooks

Run `pnpm audit --audit-level=moderate` before changing dependencies. Pin exact direct versions,
keep the 24-hour release delay, and leave install scripts disabled. Audit findings require a
named owner and follow-up; do not add overrides or ignore advisory IDs to hide them.

Run `pnpm hooks:install` for each checkout. It installs pinned prek under that checkout's
Git directory at `permit-hooks/hooks`, then sets only its worktree hook path. Shared default
and custom hook files stay intact, including when installing from the primary checkout.
Never unset the common `core.hooksPath`: another worktree may still use it. Hook dependencies are
the exact tools in the pnpm lockfile; Dependabot groups their updates with a seven-day cooldown.

Run tests against local fixtures on this computer. Backend integration and e2e commands require
explicit authorization and suitable credentials; `pnpm verify` never invokes them.
