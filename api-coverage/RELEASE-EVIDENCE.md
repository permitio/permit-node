# Packed release evidence

`pnpm check:release-evidence` checks a compatibility harness's public-safe evidence against the
actual package and a reviewed test plan. It runs local build and packaging tools, reads supplied
files, and never contacts a backend or PDP. Run service tests separately through the authorized
harness, using isolated local services on this computer. Existing cloud-backed CI lanes are
separate evidence and remain unchanged.

The committed [matrix](release-matrix.json) is a requirement, **not a test result**. Missing cases
and source-operation gaps remain visible. A method call, a passing phase, and a static route link
are different observations; none establishes complete schema or backend fidelity.

## Inputs and invocation

Use the exact repository-pinned pnpm, a supported Node runtime, installed frozen dependencies,
and a clean committed checkout. Place evidence and consumer lockfiles outside the tracked source
(or under ignored `coverage/`). The candidate is the actual tarball installed by the harness;
its version remains whatever `package.json` currently declares until the release-version change.
An unreleased development tarball labeled 2.7.5 is not the released baseline.

```sh
pnpm check:release-evidence \
  --evidence /path/to/public-evidence.json \
  --artifact /path/to/candidate.tgz \
  --baseline /path/to/released-permitio-2.7.5.tgz \
  --candidate-lock /path/to/candidate-consumer/pnpm-lock.yaml \
  --baseline-lock /path/to/baseline-consumer/pnpm-lock.yaml
```

The checker independently:

1. Verifies that the checkout is clean and records its Git tree.
2. Reads both tarballs without installing them, extracting files onto disk, or running their code.
   Paths, member types, duplicates, input sizes, process duration, and output sizes are bounded.
   Harmless archive directories are allowed; links and other member types are rejected.
3. Builds the SDK and packs a reference archive with the exact pnpm and disabled package lifecycle
   scripts. The supplied candidate must match that archive byte for byte. This includes omitted
   files, file boundaries, declarations, package metadata, documentation, and exported entry points.
   The checkout must still be clean and at the same tree afterward.
4. Matches the baseline against the reviewed SHA-256 and official npm SHA-512 integrity in the
   matrix. The baseline is [published permitio 2.7.5](https://registry.npmjs.org/permitio/2.7.5).
   File counts include regular files only, not tar directory entries.
5. Hashes both actual consumer lockfiles, extracts the current public SDK inventory, and validates
   the existing source-contract baseline and operation decisions before reading execution claims.
6. Checks the evidence against those inputs and the independently committed cases and matrix.

The result is written to ignored `coverage/release-evidence/report.json`. Use `--output DIRECTORY`
for another destination. Invalid-input diagnostics stay on the local console; the JSON result
never copies arbitrary filesystem errors or rejected producer identifiers.

## Result meanings

| Exit | Local result | Meaning                                                                         |
| ---- | ------------ | ------------------------------------------------------------------------------- |
| 0    | PASS         | Required local observations, identities, comparisons, and cleanup are complete. |
| 1    | FAIL         | A phase, case, or baseline comparison reported a behavioral failure.            |
| 2    | INVALID      | Inputs, bindings, execution, matrix coverage, setup, or cleanup are incomplete. |

INVALID takes precedence when failures and incomplete evidence coexist. The `failures` array
still retains producer-reported FAILED positions such as `runs[1].caseResults[3]`. These positions
are useful for private diagnosis; an invalid report's claims are not independently confirmed.
A missing backend, a wrong artifact, a zero-assertion PASS, or phase counts without case observations
cannot pass. Merely invoking the CLI without every required input also returns 2.

`releaseReady` is **always false** while PER-16345's shared target is unavailable. No adopted
shared-target payload is defined by this contract. A local PASS is neither a parity claim nor a
publication approval. Operations marked add/retain without proof keep local evidence incomplete;
excluded, deferred, and undecided operations remain in the inventory instead of disappearing.

## Public payload version 1

Every object has an explicit allowlist. Missing or unknown fields are rejected, including nested
objects. The executable field contract is in `scripts/release-evidence.mjs`; the required public
identifiers and case links are in `release-matrix.json`.

- **Root**: `schema: 1`, `artifact`, `sdk`, `inventory`, `runs`, `ab`, `gates`.
- **Candidate artifact**: `name`, `version`, `sha256`, `fileCount`, `lockSha256`.
- **SDK**: `tree`, `inventorySha256`.
- **Inventory method**: `name`, `caseIds`.
- **Inventory operation**: `source`, `method`, `path`, `decision`, `caseIds`.
- **Run**: `id`, `artifactSha256`, `nativeReportSha256`, `node`, `target`, `pdp`, `phaseResults`,
  `caseResults`, `cleanup`, `setupErrorCount`, `cleanupErrorCount`.
- **PDP**: `digest`, `roles`, `resolvedAt`.
- **Phase result**: `id`, `kind`, `status`, `assertions`.
- **Case result**: `id`, `phaseId`, `methodNames`, `operationKeys`, `level`, `status`,
  `assertions`.
- **Cleanup**: `registered`, `completed`, `verified`.
- **A/B**: `baseline`, `candidateSha256`, `cases`, `intentionalDifferences`.
- **Released baseline**: `version`, `sha256`, `fileCount`, `lockSha256`, `kind: released-npm`,
  `integrity`.
- **A/B comparison**: `id`, `baselineRunId`, `candidateRunId`, `status`, `assertions`.
- **Intentional difference**: `id`, `changeId`.
- **Shared gate**: `sharedTarget: {status: UNAVAILABLE, owner: PER-16345}`.

Statuses are PASSED, FAILED, INVALID, and NOT_RUN. Assertion/error/cleanup counts are nonnegative
safe integers. File counts and PASSED assertion counts must be positive. SHA-256 values use 64
lowercase hexadecimal characters; Git trees use 40. The public run IDs are stable cell labels,
not native random run IDs. Baseline and candidate cells carry their actual different artifact hashes.

Inventory hashing uses the existing `digest` canonicalization in `scripts/api-contracts.mjs`:
recursive object-key sorting and UTF-8 JSON serialization. The input contains sorted method names
and operations sorted by `source + " " + method + " " + path`; each operation includes only source,
method, path, and reviewed decision. Case links are excluded from this hash and checked separately.
All 163 current methods and all 307 reviewed published operations remain visible. The extractor,
not these documented counts, is authoritative after future reviewed changes.

## Proof levels and matrix

Package, wire, mock-PDP, API, and PDP evidence stay separate. HTTP methods require at least actual
wire behavior; package-presence checks cannot replace it. Route-free helpers can have package
behavior cases. Local API/PDP observations cannot claim cloud-PDP execution. Each case records
only the routes, methods, and successful assertions actually exercised inside its bounded callback.
Case assertion totals cannot exceed their containing phase's assertions. Cases must reference an
existing phase of the same level, and PASSED cases require a successful containing phase.

The SDK supports Node >=22.13.0, including later major versions. The matrix retains Node 22.13.0
and 24.0.0 floors plus current Node 22.23.3, 24.21.0 and 26.11.0 releases verified on 2026-10-08
from [Node's official release index](https://nodejs.org/dist/index.json). Pinned and
current PDP roles share one image digest in this dated snapshot. One execution can fulfill both
roles only when the reviewed digest and resolution date match. This is not ongoing monitoring of
moving tags; refresh and review the matrix before relying on a newer runtime or image.

Each candidate local cell must include every required phase and case. Existing phase-only reports
cannot be retroactively relabeled as case execution. Missing planned cases stay missing. A/B
comparisons require matching local runtime/PDP cells, successful case observations on each artifact,
and an actual positive-count comparison. The harness compares normalized values from shared
supported behavior; it must preserve semantic fields, falsy/null values, promised order, and response
shapes. Explicit migration change IDs document intentional differences; they are not successful
A/B comparisons and never erase missing execution.

## Trust, privacy, and review

This is an evidence validator, not a remote attestation system. A hash binds supplied bytes; it
does not prove that unsigned native reports describe genuine execution. The authorized producer,
its real comparison assertions, case instrumentation, and native reports require independent review.
Two independently passing calls are not evidence that their values were equal. A declared link is
not proof that every field or every mapped route was exercised. Consumer lock hashing binds the
recorded dependency resolution; the separate dependency/security gates assess those dependencies.

The private runner must construct the public payload field by field. Never spread native report
objects into it. Do not include credentials, headers, raw responses, fixture keys, ownership labels,
internal topology, private checkout paths, backend commits, harness trees, or freeform diagnostics.
Public case IDs must come from the reviewed plan. Preserve private failed runs for diagnosis instead
of replacing them with a later success. Review the exported payload before publishing it.

When changing the matrix, review the actual method/route/assertion implementation and its failure
probes. Preserve missing proof; do not remove a case, source operation, or runtime solely to obtain
PASS. No automatic catalog adoption, parity approval, service setup, or npm publication is performed.
