---
name: permit-node-3-migration
description: >-
  Migrate applications from Permit Node SDK 2.x to 3.0. Use for permitio major-version upgrades,
  removed flat API calls, grouped return changes, constructor/error/OPA behavior, and migration
  readiness reviews in JavaScript or TypeScript. Includes a read-only compiler-based scanner.
---

# Permit Node SDK 3.0 migration

Read `references/changes.md` before editing. Its stable IDs identify required migrations, semantic
reviews, retained behavior and additions. This pre-release source still has package version 2.7.5;
confirm the official 3.0 release before changing production requirements.

## Establish scope

Inspect the customer's installed version, package/lock/runtime pins, Permit imports, constructor
options, grouped/flat calls, results, errors, transport hooks and authorization tests. Keep CJS and
ESM as appropriate. Follow the customer's repository instructions and existing authorization.
Use supported grouped APIs; do not introduce compatibility shims or new public context APIs.

## Install the scanner prerequisite

The copied skill directory is self-contained. Its manifest/lock explicitly pin TypeScript 6.0.3,
the JavaScript compiler API. This is a customer tool dependency, not a Permit runtime dependency.
It does not use the customer's TypeScript or the SDK workspace's compiler tools. Install only this
locked prerequisite with lifecycle scripts disabled. Installation needs registry access; scanning
does not. The SDK package includes this directory; copy it to your agent's skills directory first.
For Codex, use `$CODEX_HOME/skills/permit-node-3-migration` (usually `~/.codex/skills/...`).

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
These statuses do not certify semantic migration. A missing compiler is an installation failure,
not a clean scan. It never executes customer code, package scripts, configuration modules, target
dependencies, network calls or writes. Dependency/build/Git exclusions are listed; symlinks are not
followed. Unsupported Vue/Svelte/Astro sources, parse/read errors, escaped/broken links or zero
supported source files make coverage incomplete. See the report's limitations and excluded paths.

The shipped `compiler-lock.yaml` is copied to pnpm's expected filename because package packing
omits pnpm-lock.yaml. These prerequisite writes happen inside the copied skill, not the target.

## Migrate and validate

1. Resolve INCOMPLETE inputs or document their uncovered scope explicitly. Trace imports and client
   provenance; do not rename unrelated or shadowed objects merely because they have similar names.
2. Apply A1's 29 grouped replacements within the authorized migration. Preserve receiver binding
   with closures. Review A3 results, T1 tenant/model data, and T2 bulk persistence expectations.
3. Review F1/F2 ownership, E1/E2 errors/logging, and W1–W6 policy, hooks, wire and
   retry semantics. REVIEW_REQUIRED findings need source inspection and focused behavioral tests,
   not guessed automated replacements. Clarify business intent only when it cannot be inferred.
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
