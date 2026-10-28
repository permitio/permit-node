---
name: permit-node-3-migration
description: >-
  Migrate applications from Permit Node SDK 2.x to 3.0. Use for permitio major-version upgrades,
  removed flat API calls, grouped return changes, constructor/error/OPA behavior, and migration
  readiness reviews in JavaScript or TypeScript. Includes a read-only compiler-based scanner.
---

# Permit Node SDK 3.0 migration

Read `references/changes.md` before editing. Its stable IDs identify required migrations, semantic
reviews, retained behavior and additions. The candidate package identifies itself as 3.0.0 and
remains unpublished; confirm the official release before changing production requirements.

## Establish scope

Inspect the customer's installed version, package/lock/runtime pins, Permit imports, constructor
options, grouped/flat calls, results, errors, transport hooks and authorization tests. Use Node
`>=22.13.0`, including later major versions. Keep CJS and ESM as appropriate. Follow the customer's
repository instructions and existing authorization. Use supported grouped APIs; do not introduce
compatibility shims or new public context APIs.

## Install the scanner prerequisite

The copied skill directory is self-contained. Its manifest/lock explicitly pin TypeScript 6.0.3
for the JavaScript compiler API and semver 7.8.5 for runtime range validation. These are customer
tool dependencies, not Permit runtime dependencies. The scanner loads both only from the skill's
own `node_modules`, at exactly those versions; it never falls back to the customer's TypeScript or
semver (including any in an ancestor `node_modules`) or the SDK workspace's compiler tools.
Install only these locked prerequisites with lifecycle scripts disabled. Installation needs
registry access; scanning does not. The SDK package includes this directory; copy it to your
agent's skills directory first.
For Codex, use `$CODEX_HOME/skills/permit-node-3-migration` (usually `~/.codex/skills/...`).

The manifest also pins the package manager (`packageManager: pnpm@12.8.1`), and the lock records
that pnpm release's per-platform binaries with integrity hashes. If the `pnpm` on your PATH is a
different version, pnpm downloads pnpm 12.8.1 from the registry, verifies it against the lock and
runs the install with it. Install pnpm 12.8.1 beforehand if that download is not acceptable. The
skill keeps this pin rather than turning off pnpm's package-manager version management, because the
install relies on settings in `pnpm-workspace.yaml` (`ignoreScripts`, `minimumReleaseAge`,
`engineStrict`) and on the lock format, which other pnpm versions may ignore or read differently; a
hash-verified, known pnpm is the safer choice than whichever version happens to be installed.

```bash
set -euo pipefail
PERMIT_MIGRATION_SKILL=/absolute/path/to/permit-node-3-migration
cp "$PERMIT_MIGRATION_SKILL/compiler-lock.yaml" "$PERMIT_MIGRATION_SKILL/pnpm-lock.yaml"
pnpm --dir "$PERMIT_MIGRATION_SKILL" audit --audit-level=moderate
pnpm --dir "$PERMIT_MIGRATION_SKILL" install --frozen-lockfile --ignore-scripts
node "$PERMIT_MIGRATION_SKILL/scripts/scan.mjs" /absolute/path/to/customer-project
```

The scanner prints JSON. Exit 0 means complete declared coverage with no recognized findings;
exit 1 means complete coverage with findings; exit 2 means incomplete coverage, even with findings.
These statuses do not certify semantic migration. A missing, foreign or differently versioned
compiler/semver is an installation failure: the scanner prints the reason to stderr, no JSON, and
exits 2. It never executes customer code, package scripts, configuration modules, target
dependencies, network calls or writes. Symlinks are not followed. `node_modules` and `.git` are
excluded everywhere; `build`, `dist`, `coverage` and `.next` only directly inside a directory with
a `package.json`. Extensionless files with a Node/tsx/ts-node/Bun/Deno shebang are scanned as
sources. Unsupported Vue/Svelte/Astro/MDX sources, HTML with inline scripts, files over the size
limit (2 MiB by default, `--max-file-bytes <n>`), parse/read errors, escaped/broken links, an
expired `--deadline-ms <n>` or zero supported source files make coverage incomplete. See the
report's limitations, including the migration IDs no rule detects, and its excluded paths.

The shipped `compiler-lock.yaml` is copied to pnpm's expected filename because package packing
omits pnpm-lock.yaml. These prerequisite writes happen inside the copied skill, not the target.

## Migrate and validate

1. Resolve INCOMPLETE inputs or document their uncovered scope explicitly. Trace imports and client
   provenance; do not rename unrelated or shadowed objects merely because they have similar names.
2. Apply A1's 29 grouped replacements within the authorized migration. Preserve receiver binding
   with closures. Review A3 results, T1 tenant/model data, and T2 bulk persistence expectations.
3. Review F1/F2 ownership, E1/E2 errors/logging, and W1–W6 policy, hooks, wire and
   retry semantics. The scanner has no rule for A4, W1, W4, W5 or W6; review those by hand.
   REVIEW_REQUIRED findings need source inspection and focused behavioral tests, not guessed
   automated replacements. Clarify business intent only when it cannot be inferred.
4. Regenerate the application lock for the actual available release, compile its real CJS/ESM
   consumer code, and test meaningful request/auth/query/body behavior. Use permitted test fixtures;
   do not run a production write or publish a release as part of a migration scan.
5. Rerun the scanner and repository checks. Report applied IDs, tests, remaining review findings,
   incomplete coverage and external/manual checks separately. A clean syntax scan alone is not
   migration readiness. New N1–N3 capabilities are optional additions, not compulsory rewrites.

The scanner recognizes supported source syntax, local aliases/destructuring and SDK-typed/direct
clients. Dynamic/reassigned/escaped values require review. External module indirection, environment
values, policy correctness, OPA transformations, live results and every downstream result consumer
remain manual review. Keep errors actionable and do not hide skipped or unavailable verification.
