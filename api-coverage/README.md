# API contract evidence

`pnpm check:api-contracts` checks the reviewed local operation inventory and declared shapes.
`pnpm check:api-drift` additionally fetches the public control-plane and cloud-PDP OpenAPI
**documentation** and compares it with the committed snapshots. Neither command calls API
operations, creates fixtures, or measures real-backend behavior. Reports are written to ignored
`coverage/api-contracts/report.json` and `report.md`; use `--output DIRECTORY` with the script to
save them elsewhere.

## Status and scope

The report deliberately has separate results:

| Result                        | Meaning                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Local integrity PASS          | Current extraction, source provenance and reviewed decisions are consistent. |
| Coverage GAPS                 | Planned additions or existing undecided omissions remain.                    |
| Shared target UNAVAILABLE     | PER-16345 has not published an adopted machine-readable cross-SDK target.    |
| Backend NOT_MEASURED          | This command performs no real-backend tests.                                 |
| Latest container NOT_MEASURED | The retained container schema comes from the pinned image only.              |
| Future PDP NOT_ADOPTED        | No approved future-PDP contract snapshot has been adopted.                   |

Exit **0** means local integrity, not complete coverage or parity. Exit **1** means changed
contracts, new/unexplained operations or stale decisions. Exit **2** means incomplete or invalid
input: missing files, unsupported referenced Path Items, invalid supported structures, empty
inventories, unresolved references or a failed source fetch. Structural checks cover the operation,
response, parameter, server and local-reference forms this inventory consumes; they are not an
exhaustive OpenAPI specification validator. A network error cannot produce a clean drift result.

The initial reviewed denominator is 263 control-plane operations, 34 pinned-container PDP
operations and 10 cloud-PDP operations. Every published operation remains visible, including
GA, EAP, deprecated, generated-only and excluded operations. There is no coverage percentage
that silently removes exclusions from the denominator.

`decisions.json` contains exact **Node-local** decisions and reasons, with issue ownership and
source links. Its prose sources are [PER-16337](https://linear.app/permit/issue/PER-16337) and
[PER-16345](https://linear.app/permit/issue/PER-16345); it is not their unpublished shared target.
Existing undecided entries remain gaps. A newly published operation without an exact reviewed
entry fails the gate, as does a decision whose operation disappeared or changed lifecycle.
An exclusion fails when a public method begins exposing that operation. Local decisions must
be reconciled with the shared artifact when its owner publishes it; adoption is not complete.

## Extraction and shape evidence

The compiler-based extractor starts at the public `Permit` instance type. It follows exposed
API properties, constructor-assigned implementations, inherited aliases and resolved calls
through generated dispatch to HTTP parameter creators. Enforcement JSON serialization retains the
structural input body in the inventory: the compiler verifies the private serializer's native
`JSON.stringify` call and input parameter identity. Removing it, substituting a local lookalike,
or bypassing it remains a measured change. Generated clients alone do not count
as public `Permit` methods. Internal scope discovery remains supporting evidence;
`permit.api.apiKeys.getScope` independently exposes its complete typed result through the
control plane. Explicit helper decisions cover route-free public methods;
new unresolved methods fail instead of disappearing from the inventory.

PER-16949 exposes the six published API-key management operations through `permit.api.apiKeys`.
The compiler and separate wire cases retain API-only routing, bodyless rotation, finite list
filters, complete pagination envelopes and optional response secrets. Successful DTO preservation
and sanitized failure diagnostics are distinct checks; these wrappers do not infer server privilege
or inject selected scope.

The snapshot includes authored interfaces/type aliases, generated model and request shapes,
resolved generated return types, actual exposed overloads, HTTP paths/methods and transport selection.
Authored function signatures, enums, supporting variable values, class initializers and reachable
declarations (including parameter defaults) are retained alongside generated request/dispatch bodies.
All authored class declarations and generated support modules also have normalized AST fingerprints,
so constructor helpers, static defaults and shared routing changes require review. These conservative
fingerprints are separate from operation coverage and do not establish public reachability.
This deliberately conservative snapshot means:
request-mapping edits behind unchanged signatures require review, and unrelated body edits may
also require a baseline update. The separate strict compiler and wire tests remain necessary.
This is drift evidence, not a proof that every field of every published schema is implemented.

Source drift includes request/response schemas, model fields, nullability, required fields,
array/envelope shapes, defaults, unions, enum values, reusable components and authentication schemes.
Declared path/operation servers, effective server precedence and all source counts are retained.
Referenced root Path Items are explicitly unsupported and return INVALID until their operation
resolution is implemented and reviewed; they cannot silently reduce the operation inventory.
Documentation annotations are ignored; application property names and literal defaults are retained. Even an
additive source field requires review. That review gate does not reject additive runtime data:
local Axios-boundary tests verify that extra object/row fields and unknown enum-like values
survive supported read/list paths. Existing wrappers that return arrays intentionally unwrap
only the documented envelope.

## PDP routing and source exceptions

`sources.json` pins exact public source URLs, raw-byte hashes, counts and the container image
reference. The full provenance, including alias proof and unavailable capability statuses, is
also pinned in `baseline.json`. Reviewed schema repairs and unspecified bulk-result limitations
remain documented in [the OpenAPI guide](../openapi/README.md), with source defects tracked by
PER-16342 and bulk placeholders by PER-9298.

The pinned image mounts the same facts router under `/facts` and the hidden compatibility
prefix `/v2/facts/{proj_id}/{env_id}`. Only exact method/suffix matches receive container alias
evidence. The source-file digest records this observation; private implementation and deployment
configuration are not published. Other `proxyFactsViaPdp` paths are listed as SDK-only forwarding
with unverified support, never treated as published local PDP operations. The optional OPA path
and retained Elements login supplement also have explicit SDK-only decisions. Missing or stale
exceptions fail the gate.

The cloud schema lacks container-only routes such as all-tenants and user-tenants. A method's
presence in one source never establishes support in another. Future and moving-latest PDPs need
separate reviewed evidence. PER-16568 adds complete authorized-user discovery to the published
container/cloud route and role-derived tenant discovery to the container-only route. It retains
all-tenants behavior; future deprecation communication belongs to PER-16015. Object filtering
composes the supported bulk operation and adds no server route.

## Reviewing a change

1. Run the local command and inspect the JSON changes and operation rows. Do not delete baseline
   entries, shrink a denominator or relabel an omission solely to make the gate pass.
2. For upstream drift, review the exact public schema delta, source hash and generated effects.
   Update the committed raw snapshot only through the OpenAPI review/generation procedure.
3. Give each new or changed operation an explicit decision, reason and issue owner. Keep an
   unresolved product decision visible; source corrections need their existing source ticket.
4. For an intentional SDK change, inspect its actual route, signature, model and implementation
   changes before replacing that portion of `baseline.json`. Update the reviewed provenance
   alongside source changes. There is no automatic acceptance mode in CI.
5. Run `pnpm verify`, the focused contract tests and the applicable separate wire/backend tests.
   Record the actual test level and runtime; do not copy a static PASS into backend evidence.

The shared parity artifact is an external dependency of PER-16561. Feature additions have
separate owners and independent wire/backend evidence; this check does not implement those
methods or establish live behavior.

## Scheduled review and ownership

The `Published API contract drift` workflow runs weekly and on manual dispatch. It fetches only
allowlisted public schema documents with time and size limits, stores the JSON/Markdown evidence
for 30 days, and fails on drift or incomplete inspection. Local checks also run in `pnpm verify`,
so PR validation does not depend on a mutable external schema.

SDK maintainers own failure triage through [PER-16561](https://linear.app/permit/issue/PER-16561).
Review a failed scheduled run before the next SDK release and link the resolved decision or source
issue in the baseline-change PR. GitHub's workflow failure notifications, job summary and retained
artifact are the implemented alert surfaces. No Slack destination, automated ticket creation or
cross-SDK owner service is configured by this change.

## Packed release evidence

[The release-evidence contract](RELEASE-EVIDENCE.md) validates a separate compatibility harness's
allowlisted observations against the exact candidate package, official released baseline, clean
source inventory, and reviewed runtime/case matrix. It does not start services. Package/wire/API/PDP
proof remain distinct, and missing execution remains INVALID. This command's local PASS never
resolves the unavailable shared parity target or approves npm publication.
