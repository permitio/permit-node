# OpenAPI rebaseline migration inventory

This major-version rebaseline replaces the old generated source with the reviewed 2026-09-30
public contract and the existing Elements login supplement. It generates 264 operations across
165 paths, with 335 source schemas and 400 TypeScript files. Internal inline schemas explain why
the generated file count exceeds the source schema count.

## Public SDK changes

- The runtime export `EnvironmentCopyConflictStrategyEnum` is replaced by
  `EnvironmentCopyConflictStrategy`. The CJS and ESM root surfaces each still contain 31 named
  exports; this is their only removed/added runtime name.
- The unused `Statistics` type export is removed. The implicit-grants settings type is now
  `PermitBackendSchemasSchemaDerivedRoleRuleDerivationSettings`, replacing
  `PermitBackendSchemasSchemaDerivedRoleDerivedRoleSettings`.
- `ResourceInstanceCreate.tenant`, `ResourceInstanceRead.tenant` and `tenant_id`,
  `RoleAssignmentRemove.tenant`, and `UserRoleRemove.tenant` are required by the reviewed schema.
  Callers must supply tenant information where required.
- Resource roles are named `ResourceRoleRead` dictionary values. Role `granted_to` uses the
  current `DerivedRoleBlockRead`/`DerivedRoleBlockEdit` models. Role inheritance remains optional
  `string[]` for create/read/update on both global and resource roles.
- Generated list methods preserve array-or-pagination-envelope unions. High-level condition-set,
  tenant, resource-instance and relationship-tuple lists retain their array contract by unwrapping
  the envelope when present. High-level role/resource lists still honor `includeTotalCount`.
- Generated resource-relation listing returns `PaginatedResultRelationRead`. The existing
  `permit.api.resourceRelations.list()` returns its `data` array, matching its declared contract.
- Generated role-assignment user/role/tenant filters are arrays. Existing high-level singleton
  string parameters are serialized as one unbracketed query value, preserving encoded keys.
- Explicit `apiUrl` and PDP routing keep precedence over an injected Axios `baseURL`, preserving
  the previous SDK behavior despite the upstream generator helper change.
- Generated unassignment returns `RoleAssignmentRead`. The two current high-level unassign methods
  retain their void result. The deprecated `unassignRole` returns its actual
  `AxiosResponse<RoleAssignmentRead>`.
- `bulkUserCreate`, `bulkUserDelete`, `bulkUserReplace`, `bulkRelationshipTuples`, and
  `bulkUnRelationshipTuples` return unspecified `object` results. Their old request-payload return
  types were incorrect; the backend's empty result schemas remain unresolved. Request shapes are
  still typed and are not used as substitute result contracts.

## Generated-only removals

The public snapshot omits 34 of the 195 previously generated operations. The existing Elements
login route is preserved by its narrow supplement; the other 33 generated-only operations are
removed. These methods were not called by high-level SDK wrappers. This inventory records the
removed generated declarations; it does not claim that every omitted backend route stopped
working. The refreshed public snapshot adds 102 operations.

| Former generated class file     | Method                                     | Route                                                                                                        |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `authentication-api.ts`         | `devLogin`                                 | `POST /v2/auth/devlogin`                                                                                     |
| `authentication-api.ts`         | `elementsFeLoginAs`                        | `POST /v2/auth/{env_id}/elements_fe_login_as`                                                                |
| `authentication-api.ts`         | `login`                                    | `POST /v2/auth/login`                                                                                        |
| `authentication-api.ts`         | `loginElements`                            | `GET /v2/auth/login_elements`                                                                                |
| `authentication-api.ts`         | `logoutGet`                                | `GET /v2/auth/logout`                                                                                        |
| `authentication-api.ts`         | `logoutPost`                               | `POST /v2/auth/logout`                                                                                       |
| `authentication-api.ts`         | `me`                                       | `GET /v2/auth/me`                                                                                            |
| `authentication-api.ts`         | `switchOrganization`                       | `POST /v2/auth/switch_org/{org_id}`                                                                          |
| `condition-sets-api.ts`         | `getConditionSetPossibleParents`           | `GET /v2/schema/{proj_id}/{env_id}/condition_sets/{condition_set_id}/possible_parents`                       |
| `decision-logs-api.ts`          | `listPdpDecisionLogs`                      | `GET /v2/pdps/{proj_id}/{env_id}/decision-logs/{pdp_id}`                                                     |
| `decision-logs-ingress-api.ts`  | `insertOpaDecisionLogs`                    | `POST /v2/decision-logs/ingress`                                                                             |
| `default-api.ts`                | `dummy`                                    | `GET /v2/stress/dummy`                                                                                       |
| `default-api.ts`                | `dummyDb`                                  | `GET /v2/stress/db/dummy`                                                                                    |
| `default-api.ts`                | `getOrganizationV2StressDbOrganizationGet` | `GET /v2/stress/db/organization`                                                                             |
| `default-api.ts`                | `getOrganizationWithAuthn`                 | `GET /v2/stress/db/organization_auth`                                                                        |
| `default-api.ts`                | `getOrganizationWithAuthz`                 | `GET /v2/stress/db/organization_authz`                                                                       |
| `elements-configs-api.ts`       | `getElementsTypeConfig`                    | `GET /v2/elements/{proj_id}/{env_id}/{element_type}`                                                         |
| `elements-configs-api.ts`       | `updateElementsTypePermissions`            | `PATCH /v2/elements/{proj_id}/{env_id}/{element_type}`                                                       |
| `instructions-api.ts`           | `listLanguageInstructions`                 | `GET /v2/{proj_id}/{env_id}/get_instructions`                                                                |
| `opaldata-api.ts`               | `getDataForConditionSet`                   | `GET /v2/internal/opal_data/{org_id}/{proj_id}/{env_id}/condition_sets/{condition_set_id}`                   |
| `opaldata-api.ts`               | `getDataForResource`                       | `GET /v2/internal/opal_data/{org_id}/{proj_id}/{env_id}/resource_types/{resource_id}`                        |
| `opaldata-api.ts`               | `getDataForRole`                           | `GET /v2/internal/opal_data/{org_id}/{proj_id}/{env_id}/roles/{role_id}`                                     |
| `opaldata-api.ts`               | `getDataForSetRule`                        | `GET /v2/internal/opal_data/{org_id}/{proj_id}/{env_id}/condition_set_rules/{user_set_id}/{resource_set_id}` |
| `opaldata-api.ts`               | `getDataForTenant`                         | `GET /v2/internal/opal_data/{org_id}/{proj_id}/{env_id}/tenants/{tenant_id}`                                 |
| `opaldata-api.ts`               | `getDataForUser`                           | `GET /v2/internal/opal_data/{org_id}/{proj_id}/{env_id}/users/{user_id}`                                     |
| `policy-api.ts`                 | `getOpalDataSources`                       | `GET /v2/opal/data/config`                                                                                   |
| `policy-api.ts`                 | `getOpalDataSourcesOpalDataConfigGet`      | `GET /opal/data/config`                                                                                      |
| `policy-decision-points-api.ts` | `getAuthenticatingPdpConfigValues`         | `POST /v2/pdps/me/config`                                                                                    |
| `policy-decision-points-api.ts` | `getAuthenticatingPdpConfigValuesLegacy`   | `GET /v2/pdps/me/config`                                                                                     |
| `policy-decision-points-api.ts` | `opalDataCallback`                         | `POST /v2/pdps/me/opal_data_callback`                                                                        |
| `policy-decision-points-api.ts` | `pushPdpState`                             | `POST /v2/pdps/me/state`                                                                                     |
| `roles-api.ts`                  | `addParentRole`                            | `PUT /v2/schema/{proj_id}/{env_id}/roles/{role_id}/parents/{parent_role_id}`                                 |
| `roles-api.ts`                  | `removeParentRole`                         | `DELETE /v2/schema/{proj_id}/{env_id}/roles/{role_id}/parents/{parent_role_id}`                              |

The packed declaration surface grows from 356 to 434 files. The following generated declaration
files are removed, including names replaced by current schema models. All remaining declarations
are checked by the strict SDK build and packed-consumer checks.

- `api/decision-logs-api.d.ts`
- `api/decision-logs-ingress-api.d.ts`
- `api/elements-configs-api.d.ts`
- `api/instructions-api.d.ts`
- `api/opaldata-api.d.ts`
- `api/policy-api.d.ts`
- `types/action-block.d.ts`
- `types/activity-details.d.ts`
- `types/actor.d.ts`
- `types/allow.d.ts`
- `types/allowed-result.d.ts`
- `types/apikey-info.d.ts`
- `types/apikey-viewer-context.d.ts`
- `types/attribute-block.d.ts`
- `types/attributes.d.ts`
- `types/audit-log-objects.d.ts`
- `types/audit-log.d.ts`
- `types/audit-logs.d.ts`
- `types/authn-me-apikey-read.d.ts`
- `types/authn-me-member-read.d.ts`
- `types/authn-me-read.d.ts`
- `types/authn-me-user-read.d.ts`
- `types/condition-set-data.d.ts`
- `types/data-entry-report.d.ts`
- `types/data-source-entry.d.ts`
- `types/data-update-report.d.ts`
- `types/derived-role-rule.d.ts`
- `types/derived-role.d.ts`
- `types/detailed-audit-log.d.ts`
- `types/dev-login.d.ts`
- `types/editable.d.ts`
- `types/elements-env-type-read.d.ts`
- `types/elements-env-type-update.d.ts`
- `types/entry.d.ts`
- `types/environment-regeneration.d.ts`
- `types/full-data.d.ts`
- `types/full-regeneration.d.ts`
- `types/granted-to.d.ts`
- `types/granted-to1.d.ts`
- `types/granted-to2.d.ts`
- `types/invite-attempt-result.d.ts`
- `types/jwks.d.ts`
- `types/labels.d.ts`
- `types/language-instructions.d.ts`
- `types/login-result.d.ts`
- `types/member-info.d.ts`
- `types/member-viewer-context.d.ts`
- `types/message.d.ts`
- `types/new.d.ts`
- `types/opadecision-log.d.ts`
- `types/opal-common-schemas-data-data-source-config.d.ts`
- `types/opal-common.d.ts`
- `types/organization-regeneration.d.ts`
- `types/paginated-result-audit-log.d.ts`
- `types/paginated-result-opadecision-log.d.ts`
- `types/payload.d.ts`
- `types/pdp.d.ts`
- `types/pdpinfo.d.ts`
- `types/pdpopainfo.d.ts`
- `types/pdpstate-update.d.ts`
- `types/pdpstate.d.ts`
- `types/permit-backend-opal-api-data-data-source-config.d.ts`
- `types/permit-backend-schemas-schema-derived-role-derived-role-settings.d.ts`
- `types/permit-backend-schemas-schema-opal-data-derived-role-settings.d.ts`
- `types/policy-synchronizer-regeneration.d.ts`
- `types/programming-language.d.ts`
- `types/project-regeneration.d.ts`
- `types/resource-sets.d.ts`
- `types/resource-type-data.d.ts`
- `types/resources.d.ts`
- `types/response-get-data-for-condition-set-v2-internal-opal-data-org-id-proj-id-env-id-condition-sets-condition-set-id-get.d.ts`
- `types/response-get-data-for-resource-v2-internal-opal-data-org-id-proj-id-env-id-resource-types-resource-id-get.d.ts`
- `types/response-get-data-for-role-v2-internal-opal-data-org-id-proj-id-env-id-roles-role-id-get.d.ts`
- `types/response-get-data-for-tenant-v2-internal-opal-data-org-id-proj-id-env-id-tenants-tenant-id-get.d.ts`
- `types/response-get-data-for-user-v2-internal-opal-data-org-id-proj-id-env-id-users-user-id-get.d.ts`
- `types/role-block.d.ts`
- `types/role-data.d.ts`
- `types/scope.d.ts`
- `types/settings.d.ts`
- `types/statistics.d.ts`
- `types/target-env.d.ts`
- `types/tenant-data.d.ts`
- `types/user-data.d.ts`
- `types/user-felogin-request-input.d.ts`
- `types/user-sets.d.ts`
- `types/viewer-context.d.ts`
- `types/viewer-grant.d.ts`
- `types/viewer.d.ts`
- `types/webhook-create.d.ts`
- `types/when.d.ts`
