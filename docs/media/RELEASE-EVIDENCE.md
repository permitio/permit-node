# Packed Node release evidence

`pnpm check:release-evidence` validates one public-safe schema 2 payload against the exact packed
candidate, released baseline, clean source, actual consumer locks and reviewed Node acceptance
plan. It performs local build/pack inspection and reads supplied files; it never calls a backend
or PDP. Actual local services run separately in the authorized private harness. Hosted cloud
observations come only from the trusted CI producer and its separate cleanup.

The committed [matrix](release-matrix.json) and [Node scope](node-acceptance.json) are requirements,
not test results. They retain every measured public method and published operation, reviewed
runtime, case, phase and migration comparison. Method invocation, route registration, positive
behavior assertions and full schema fidelity remain distinct claims.

## Inputs and source binding

Use the repository-pinned pnpm, supported Node, frozen dependencies and a clean committed checkout.
Keep supplied evidence and consumer lockfiles outside tracked source. The candidate is the exact
archive installed by the producer. A development package labeled 2.7.5 cannot replace the reviewed
released npm baseline.

```sh
pnpm check:release-evidence \
  --evidence /path/to/public-evidence.json \
  --artifact /path/to/candidate.tgz \
  --baseline /path/to/released-permitio-2.7.5.tgz \
  --candidate-lock /path/to/candidate-consumer/pnpm-lock.yaml \
  --baseline-lock /path/to/baseline-consumer/pnpm-lock.yaml \
  --cloud-locks /path/to/received-cloud-artifacts
```

The cloud-lock directory contains `candidate-cloud-NODE/consumer-lock.yaml` for each reviewed
Node version. The checker hashes those actual bytes; a supplied digest cannot replace the file.
It independently reads trusted GitHub Actions identity and required job results from its
environment.
A run label or producer boolean cannot create hosted identity.

The checker bounds archive/file sizes, member paths/types, duplicates and inspection duration. It
rebuilds and packs clean source with lifecycle scripts disabled, then requires exact candidate
archive bytes and per-member metadata. Source must remain clean at the same Git tree. It matches
released permitio 2.7.5 against the reviewed npm SHA256 and official SHA512 integrity, hashes actual
locks, extracts the public SDK inventory, and checks committed source decisions, catalog and scope.

Output defaults to ignored `coverage/release-evidence/report.json`; use `--output DIRECTORY` to
select another destination. Rejected producer errors, filesystem diagnostics and identifiers are
not copied into the public result.

## One public payload: schema 2

All objects have exact allowlists. Missing/unknown fields reject, including nested fields. The
executable contract is `scripts/release-evidence.mjs`; there is no schema 1 compatibility path.

- Root: `schema:2`, `artifact`, `sdk`, `inventory`, `runs`, `ab`, `gates`.
- Candidate: `name`, `version`, `sha256`, `fileCount`, `lockSha256`.
- SDK: `tree`, `inventorySha256`, `acceptanceSha256`.
- Inventory method: `name`, `caseIds`; operation: `source`, `method`, `path`, `decision`, `caseIds`.
- Run: `id`, `artifactSha256`, `nativeReportSha256`, `node`, `target`, `consumerLockSha256`,
  `pdp`, `phaseResults`, `caseResults`, `httpObservations`, `cleanup`, `setupErrorCount`,
  `cleanupErrorCount`.
- Local PDP: `kind:container`, `digest`, `roles`, `resolvedAt`.
- Hosted PDP: `kind:managed-cloud`, public `origin`, `contractSha256`, `observedAt`, `ci`.
- Hosted CI: `repository`, `workflowRef`, `runId`, `runAttempt`, `commit`, `tree`.
- Phase: `id`, `kind`, `status`, `assertions`.
- Case: `id`, `phaseId`, `methodNames`, `operationKeys`, `level`, `status`, `assertions`.
- HTTP observation: `caseId`, `entry`, `method`, `path`, public `origin`, `status`, `requests`,
  `requestIdPresent`. Header values are never evidence fields.
- Cleanup: `registered`, `completed`, `verified`.
- A/B: `baseline`, `candidateSha256`, `cases`, `intentionalDifferences`.
- Baseline: `version`, `sha256`, `fileCount`, `lockSha256`, `kind:released-npm`, `integrity`.
- Comparison: `id`, `baselineRunId`, `candidateRunId`, `status`, `assertions`.
- Intentional difference: `id`, `changeId`.
- Gates retain shared target UNAVAILABLE/PER-16345, Curtain Call OWNER_DEFERRED/PER-16574
  and bulk counts OWNER_DEFERRED/PER-9298.

Statuses are PASSED, FAILED, INVALID or NOT_RUN. Counts are nonnegative safe integers; successful
assertion/request counts are positive. Hashes use 64 lowercase hex characters; source identities
use 40. Stable public cell IDs do not replace native execution identity. Baseline/candidate cells
carry their actual distinct archives. Inventory hashing recursively sorts keys and uses the sorted
measured methods and reviewed operations; case links are separately checked. The extractor and
committed plan are authoritative, rather than a manually maintained denominator.

## Required behavioral proof

Package, wire, mock-PDP, API and PDP cases stay separate. Package presence cannot credit HTTP wire
behavior. Cases must match registered method/route links and successful containing phases of the
same level; case counts cannot exceed phase counts. Fixture-only phases grant no method credit.
Missing, duplicate, unknown, relabeled, zero-assertion or unexecuted phases/cases cannot pass.

Every local candidate cell requires its full catalog. Async-copy and persisted inline user-role
features use their exact feature-specific cases and published routes. An ordinary users.create
case cannot substitute for persisted role assignments. Async setup or task acknowledgement cannot
substitute for both actual terminal tasks and independent target/policy readback.

The matrix retains Node 22.13.0 and 24.0.0 floors and current Node 22, 24, 26 entries. Each
local cell
binds actual container image digest and reviewed resolution date. Current resolution must be
independently refreshed within 24 hours; historical pinned metadata stays valid. One execution can
cover both roles only when both reviewed digest and date match. Different dates require distinct
role observations even if digest matches. Old evidence must never be relabeled as freshly resolved.

Each hosted Node cell requires all four cloud phases/cases and both installed ESM/CommonJS entries
against the public cloud origin: check, bulkCheck, getAuthorizedUsers and getUserPermissions.
Strict allow/deny, ordered/full received envelopes and filter exclusion oracles establish behavior;
HTTP 200 or a false/empty result alone does not. Actual X-Request-ID presence is observed without
logging values or injecting a test-only header. Missing presence remains incomplete proof. Hosted
observations must bind actual same-run source/archive/consumer lock and trusted CI identity with
fresh observed time. Local execution cannot be relabeled hosted.

A/B comparisons require actual matching baseline/candidate runtime/PDP cells and positive-count
value comparisons of shared supported behavior. Two separate passes are insufficient. Semantic
fields, falsy/null values, promised order and received shapes remain significant. Reviewed migration
IDs describe intentional differences; they do not erase missing observations.

## Hosted credential and cleanup boundaries

Trusted setup and cleanup use fixed generated public Node-builtin programs without checkout or
dependency execution. Every matrix job separately verifies the owned environment credential and
scope in a trusted pre-checkout step. Broad project credentials are step-only; only the masked
environment key reaches candidate execution through the same job's step output. No credential
crosses job outputs, artifacts or new secrets. This is step separation, not separate-runner
isolation.
Forks and Dependabot cannot enter the trusted credential path.

Separate cleanup always follows partial setup and candidate execution. It checks immutable physical
parent/child identities, complete bounded destructive child inventories and captured defaults before
cascade deletion, then verifies key/ID absence. API keys are not a complete inventory: the project
credential reads the environment's primary key, whose secret must match exactly one of the
environment's one to four PDP configurations, but a project-level credential cannot enumerate
additional environment keys. Unknown/lost writes, failed initial capture, foreign or
recycled/additive/changed children, incomplete pages or failed reads retain survivors and supply no
fabricated cleanup credit. Only finite noncredential state and cleanup receipts cross jobs.

Completion validates the received execution/native/run/cleanup/actual-lock bytes and emits a final
set for each runtime, including original execution.json bytes. The pending producer receipt has
zero cleanup credit and is never accepted as final evidence. The private exporter reads final files
with exact allowlists, preserving the separately received execution/cleanup hashes and header
boolean.

## Readiness and limits

Exit 0/PASS means required Node observations, identities, comparisons, quality/security jobs,
migration and cleanup are complete. Exit 1/FAIL records behavior failure. Exit 2/INVALID means
binding, setup, matrix or proof is incomplete; INVALID takes precedence while retaining finite
failed
positions. Missing required inputs also return 2.

`nodeReleaseReady` and `releaseReady` are computed for the adopted Node scope only. Shared five-SDK
acceptance stays UNAVAILABLE and owner-deferred Curtain Call/bulk counts stay separate. Required
user-attribute backend rollout PER-16954 remains UNAVAILABLE until independently verified adoption.
Actual local evidence handoff remains an owner decision; no upload/release-asset channel is selected
here. PR cloud fixture checks can succeed independently, while publication requires the complete
Node validator inputs and rollout evidence. No manual boolean or producer claim waives those gates.

This is a validator, not remote attestation. Unsigned hashes bind supplied bytes without proving
genuine execution. Producers, their real assertions, native reports and ownership cleanup require
independent review and actual authorized runs. Public export is a finite projection; credentials,
raw responses, fixture keys/markers, private topology/paths/backend identities and freeform errors
stay private. Preserve failed evidence for diagnosis. No automatic catalog adoption, parity
approval,
service setup or npm publication is performed.
