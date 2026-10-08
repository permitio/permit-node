import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

function requireShape(actual, expected, location) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(
      `OpenAPI correction at ${location} is stale; review the source before updating it.`,
    );
  }
}

// Public permit-python ef80ae2393b4c74e400fdd40ca838d589ee43709, permit/api/models.py.
// Only its 71 explicit Optional read-output fields below are corrected; inputs are excluded.
const AUDIT_READ_NULLABILITY = {
  AVPEngineDecisionLog: {
    sha256: '627e1f19fa9dee86f208a174b36d5831bcbc1d742318bcc9387efeab0b98c382',
    fields: ['engine', 'process_time_ms'],
  },
  ActionObj: {
    sha256: '96e255f7be87c4a1e8367b27845ca73848e6857d02e7c02452b3127d85deaf67',
    fields: ['name'],
  },
  AuditLogModel: {
    sha256: '3101bc7d1c1634b381101b252ed12842729113e600f92dfd7136f5b6e61602e2',
    fields: [
      'raw_data',
      'created_at',
      'query',
      'user_key',
      'user_email',
      'user_name',
      'resource_type',
      'tenant',
      'action',
      'decision',
      'reason',
      'pdp_config_id',
    ],
  },
  AuditLogObjectsModel: {
    sha256: '3c6fd5d927e0ac3eafda0e83794f710228f6c63be796c887e9d1878f23fb424b',
    fields: [
      'id',
      'organization_object',
      'project_object',
      'environment_object',
      'pdp_config_object',
      'user_object',
      'action_object',
      'resource_type_object',
      'tenant_object',
      'created_at',
    ],
  },
  DetailedAuditLogModel: {
    sha256: 'd8d12c8c6e41f2c6e08ac4ad76d0b0e4c0f6ac7fcbc73f1c07a177bf6e7486b5',
    fields: [
      'created_at',
      'query',
      'user_key',
      'user_email',
      'user_name',
      'resource_type',
      'tenant',
      'action',
      'decision',
      'reason',
      'pdp_config_id',
      'objects',
    ],
  },
  DummyEngineModel: {
    sha256: '876d535102a6db8ab6642e3866bfb761eff340bfd2aba43233a1b9b4e5cf88dd',
    fields: ['engine', 'timestamp'],
  },
  EnvironmentObj: {
    sha256: '268b0aa006e1016ee348966b45e1a80da7ce3c8a6c930c0668d481e9da2de66d',
    fields: ['name'],
  },
  GenericEngineDecisionLog: {
    sha256: '6b68a0015680cc155dec4d941ffd717394cbba9a6a1f6acface809b414182f04',
    fields: [
      'engine',
      'decision_id',
      'process_time_ms',
      'query',
      'user_key',
      'user_email',
      'user_name',
      'action',
      'resource_type',
      'tenant',
    ],
  },
  LimitedPaginatedResult_AuditLogModel_: {
    sha256: 'cc5e880c98a692c01c90f63f44e6ab4465de7b6e64f1d2353d71f813df5e061e',
    fields: ['page_count'],
  },
  OPAEngineDecisionLog: {
    sha256: 'f5fcc30b1507d9244b8157511148c0bc58e8c46278057a35837f7439ea2b16a9',
    fields: ['engine'],
  },
  OPAMetrics: {
    sha256: 'b15d6ffac83b14f5536b199fd1395f2e8f213f8edc3dd46875744f223d5557a4',
    fields: [
      'timer_rego_input_parse_ns',
      'timer_rego_query_parse_ns',
      'timer_rego_query_compile_ns',
      'timer_rego_query_eval_ns',
      'timer_rego_module_parse_ns',
      'timer_rego_module_compile_ns',
      'timer_server_handler_ns',
    ],
  },
  OrganizationObj: {
    sha256: 'a8864abb658259aa78fcaabd316bc8193a2175ea162b903a9388b94c807d445b',
    fields: ['name'],
  },
  ProjectObj: {
    sha256: 'e3ad7af6f58465026396142aeb868fa6d158d64ba5ff6dca6294b5bef9f2cbaf',
    fields: ['name'],
  },
  ResourceTypeObj: {
    sha256: '05b7d465a260ceedd729171a3db21ef2e5dde525c4d362a9b71e2e0b1c394e17',
    fields: ['name', 'attributes'],
  },
  TenantObj: {
    sha256: '25be63e87b33fc7c104b2681404c826482c9911b695691db2a12c73261c3a8ef',
    fields: ['name', 'attributes'],
  },
  UserObj: {
    sha256: '8312e23114aca5279679d127c90cfd148539a3cd9921cbd266172a48deb56431',
    fields: ['email', 'first_name', 'last_name', 'attributes', 'roles', 'assigned_roles'],
  },
};

/** Corrects only the pinned public audit read graph, refusing new input uses or source drift. */
function correctAuditReadNullability(spec) {
  const affected = new Set(
    Object.keys(AUDIT_READ_NULLABILITY).map((name) => `#/components/schemas/${name}`),
  );
  function rejectInputUse(value, location, visited = new Set()) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      const ref = value.$ref;
      if (affected.has(ref)) {
        throw new Error(
          `Audit read nullability reaches an input at ${location}; review the source.`,
        );
      }
      if (!visited.has(ref) && ref.startsWith('#/')) {
        visited.add(ref);
        const target = ref
          .slice(2)
          .split('/')
          .reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], spec);
        rejectInputUse(target, location, visited);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (!['example', 'examples', 'default', 'enum', 'const'].includes(key))
        rejectInputUse(child, `${location}/${key}`, visited);
    }
  }
  for (const [name, body] of Object.entries(spec.components.requestBodies ?? {})) {
    rejectInputUse(body, `/components/requestBodies/${name}`);
  }
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!['get', 'put', 'post', 'delete', 'patch', 'head', 'options'].includes(method)) continue;
      rejectInputUse(operation.requestBody, `${method.toUpperCase()} ${path}/requestBody`);
      for (const parameter of [...(item.parameters ?? []), ...(operation.parameters ?? [])])
        rejectInputUse(parameter, `${method.toUpperCase()} ${path}/parameters`);
    }
  }
  for (const [name, { sha256, fields }] of Object.entries(AUDIT_READ_NULLABILITY)) {
    const model = spec.components.schemas[name];
    requireShape(
      createHash('sha256')
        .update(JSON.stringify(model ?? null))
        .digest('hex'),
      sha256,
      `/components/schemas/${name}`,
    );
    for (const field of fields) {
      const property = model.properties[field];
      if (property.enum) {
        const { type, enum: values, ...metadata } = property;
        model.properties[field] = {
          ...metadata,
          anyOf: [{ type, enum: values }, { type: 'null' }],
        };
      } else if (typeof property.type === 'string') {
        property.type = [property.type, 'null'];
      } else if (property.anyOf) {
        property.anyOf.push({ type: 'null' });
      } else {
        const { $ref, allOf, ...metadata } = property;
        model.properties[field] = {
          ...metadata,
          anyOf: [$ref ? { $ref } : { allOf }, { type: 'null' }],
        };
      }
    }
  }
}

/**
 * Rejects unresolved references and invalid JSON Schema primitive names before generation.
 *
 * @param spec - Complete OpenAPI document, including reviewed supplemental operations.
 * @throws If a schema reference or primitive type cannot be resolved.
 */
export function validateSource(spec) {
  const types = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);
  function schema(value, pointer) {
    if (!value || typeof value !== 'object') return;
    for (const type of value.type === undefined ? [] : [value.type].flat()) {
      if (!types.has(type)) throw new Error(`Invalid schema type ${type} at ${pointer}/type.`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (['example', 'examples', 'default', 'enum', 'const'].includes(key)) continue;
      if (['properties', 'patternProperties', '$defs'].includes(key)) {
        for (const [name, property] of Object.entries(child))
          schema(property, `${pointer}/${key}/${name}`);
      } else if (Array.isArray(child)) {
        child.forEach((entry, index) => schema(entry, `${pointer}/${key}/${index}`));
      } else if (typeof child === 'object') schema(child, `${pointer}/${key}`);
    }
  }
  function visit(value, pointer) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      const ref = value.$ref;
      const target = ref.startsWith('#/')
        ? ref
            .slice(2)
            .split('/')
            .reduce((node, key) => node?.[key.replaceAll('~1', '/').replaceAll('~0', '~')], spec)
        : undefined;
      if (target === undefined)
        throw new Error(`Unresolved schema reference ${ref} at ${pointer}.`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (['example', 'examples', 'default', 'enum', 'const'].includes(key)) continue;
      if (key === 'schema') schema(child, `${pointer}/${key}`);
      visit(child, `${pointer}/${key}`);
    }
  }
  for (const [name, value] of Object.entries(spec.components?.schemas ?? {})) {
    schema(value, `/components/schemas/${name}`);
  }
  visit(spec, '');
}

/**
 * Applies exact, documented corrections to the reviewed backend schema.
 *
 * @param source - Unmodified public snapshot or the historical generator regression fixture.
 * @param supplement - Existing Elements login operation and its original request/response schemas.
 * @returns A separate OpenAPI 3.1 document suitable for validated generation.
 */
export function prepareOpenApi(source, supplement) {
  if (source.openapi !== '3.1.0') throw new Error('The OpenAPI source must declare 3.1.0.');
  const spec = structuredClone(source);
  const duplicates = spec.tags.filter((tag) => tag.name === 'Bulk Operations');
  requireShape(
    duplicates,
    [
      { name: 'Bulk Operations', description: 'None' },
      { name: 'Bulk Operations', description: 'None' },
    ],
    '/tags:Bulk Operations',
  );
  spec.tags.splice(
    spec.tags.findLastIndex((tag) => tag.name === 'Bulk Operations'),
    1,
  );
  if (new Set(spec.tags.map((tag) => tag.name)).size !== spec.tags.length) {
    throw new Error('Unexpected duplicate OpenAPI tag; repair the source document.');
  }

  const callback = spec.components.schemas.OPALUpdateCallback.properties.callbacks.items;
  requireShape(
    callback,
    {
      anyOf: [
        { type: 'string' },
        {
          items: [{ type: 'string' }, { $ref: '#/components/schemas/OPALHttpFetcherConfig' }],
          type: 'array',
          maxItems: 2,
          minItems: 2,
        },
      ],
    },
    '/components/schemas/OPALUpdateCallback/properties/callbacks/items',
  );
  const tuple = callback.anyOf[1];
  tuple.prefixItems = tuple.items;
  tuple.items = false;

  for (const name of ['ProxyConfigCreate', 'ProxyConfigRead', 'ProxyConfigUpdate']) {
    const secret = spec.components.schemas[name].properties.secret;
    requireShape(
      secret.anyOf,
      [
        {
          type: 'HeadersAuth',
          title: 'HeadersAuth',
          description: 'HeadersAuth is a dictionary of headers to be sent with the request.',
        },
        {
          type: 'BasicAuth',
          pattern: '^.+:.+$',
          title: 'BasicAuth',
          description: "BasicAuth is a string of the form 'username:password'.",
        },
        {
          type: 'BearerAuth',
          minLength: 1,
          title: 'BearerAuth',
          description: 'BearerAuth is a string of the token to be sent with the request.',
        },
      ],
      `${name}/secret/anyOf`,
    );
    secret.anyOf[0].type = 'object';
    secret.anyOf[0].additionalProperties = { type: 'string' };
    secret.anyOf[1].type = 'string';
    secret.anyOf[2].type = 'string';
  }

  const keyScope = spec.components.schemas.APIKeyScopeRead;
  requireShape(
    keyScope,
    {
      properties: {
        organization_id: {
          type: 'string',
          format: 'uuid',
          title: 'Organization Id',
          description: 'Unique id of the organization that the api_key belongs to.',
        },
        project_id: {
          type: 'string',
          format: 'uuid',
          title: 'Project Id',
          description: 'Unique id of the project that the api_key belongs to.',
        },
        environment_id: {
          type: 'string',
          format: 'uuid',
          title: 'Environment Id',
          description: 'Unique id of the environment that the api_key belongs to.',
        },
      },
      additionalProperties: false,
      type: 'object',
      required: ['organization_id'],
      title: 'APIKeyScopeRead',
    },
    '/components/schemas/APIKeyScopeRead',
  );
  for (const field of ['project_id', 'environment_id']) {
    keyScope.properties[field].type = ['string', 'null'];
  }

  const keyRead = spec.components.schemas.APIKeyRead;
  requireShape(
    keyRead,
    {
      properties: {
        organization_id: {
          type: 'string',
          format: 'uuid',
          title: 'Organization Id',
        },
        project_id: {
          type: 'string',
          format: 'uuid',
          title: 'Project Id',
        },
        environment_id: {
          type: 'string',
          format: 'uuid',
          title: 'Environment Id',
        },
        object_type: {
          allOf: [
            {
              $ref: '#/components/schemas/MemberAccessObj',
            },
          ],
          default: 'env',
        },
        access_level: {
          allOf: [
            {
              $ref: '#/components/schemas/MemberAccessLevel',
            },
          ],
          default: 'admin',
        },
        owner_type: {
          $ref: '#/components/schemas/APIKeyOwnerType',
        },
        name: {
          type: 'string',
          title: 'Name',
        },
        id: {
          type: 'string',
          format: 'uuid',
          title: 'Id',
        },
        secret: {
          type: 'string',
          title: 'Secret',
        },
        created_at: {
          type: 'string',
          format: 'date-time',
          title: 'Created At',
        },
        created_by_member: {
          $ref: '#/components/schemas/OrgMemberRead',
        },
        last_used_at: {
          type: 'string',
          format: 'date-time',
          title: 'Last Used At',
        },
        env: {
          $ref: '#/components/schemas/EnvironmentRead',
        },
        project: {
          $ref: '#/components/schemas/ProjectRead',
        },
      },
      additionalProperties: false,
      type: 'object',
      required: ['organization_id', 'owner_type', 'id', 'created_at'],
      title: 'APIKeyRead',
    },
    '/components/schemas/APIKeyRead',
  );
  for (const field of [
    'project_id',
    'environment_id',
    'object_type',
    'access_level',
    'name',
    'secret',
    'created_by_member',
    'last_used_at',
    'env',
    'project',
  ]) {
    const property = keyRead.properties[field];
    if (property.type === 'string') {
      property.type = ['string', 'null'];
    } else if (property.$ref) {
      keyRead.properties[field] = { anyOf: [{ $ref: property.$ref }, { type: 'null' }] };
    } else {
      property.anyOf = [...property.allOf, { type: 'null' }];
      delete property.allOf;
    }
  }

  const keyPage = spec.components.schemas.PaginatedResult_APIKeyRead_;
  requireShape(
    keyPage,
    {
      properties: {
        data: {
          items: {
            $ref: '#/components/schemas/APIKeyRead',
          },
          type: 'array',
          title: 'Data',
          description: 'List of Api Keys',
        },
        total_count: {
          type: 'integer',
          minimum: 0.0,
          title: 'Total Count',
        },
        page_count: {
          type: 'integer',
          minimum: 0.0,
          title: 'Page Count',
          default: 0,
        },
      },
      additionalProperties: false,
      type: 'object',
      required: ['data', 'total_count'],
      title: 'PaginatedResult[APIKeyRead]',
    },
    '/components/schemas/PaginatedResult_APIKeyRead_',
  );
  keyPage.properties.page_count.type = ['integer', 'null'];

  requireShape(
    spec.components.schemas.MonthlyUsage?.properties?.monthly_tenants,
    {
      items: { type: 'string', format: 'uuid' },
      type: 'array',
      uniqueItems: true,
      title: 'Monthly Tenants',
      default: [],
    },
    '/components/schemas/MonthlyUsage/properties/monthly_tenants',
  );

  const groupDescription =
    'Either the unique id of the resource instance that that the group belongs to, or the ' +
    'URL-friendly key of the <resource_key:resource_instance_key> (i.e: file:my_file)';
  for (const [model, property, original, replacement] of [
    [
      'data_generator_lib__schemas__schema_opal_data__DerivationSettings',
      'superseded_by_direct_role',
      'If True, the derived role is superseded by a direct role.meaning role derivation is ' +
        'not considered if the user has a direct role.',
      'If True, the derived role is superseded by a direct role.\n' +
        'Meaning role derivation is not considered if the user has a direct role.',
    ],
    [
      'ElementsUserInviteApprove',
      'email',
      'The email of the user that being invited',
      'The email of the user that is being invited',
    ],
    ...['GroupAssignment', 'GroupCreate', 'GroupReadSchema'].map((model) => [
      model,
      'group_instance_key',
      groupDescription,
      'Either the unique id of the resource instance that the group belongs to, or the\n' +
        'URL-friendly key of the <resource_key:resource_instance_key> (i.e: file:my_file)',
    ]),
    [
      'PaginatedResult_RelationshipTupleDetailedRead_',
      'data',
      'List of Relationship Tuple Detaileds',
      'List of Detailed Relationship Tuples',
    ],
    [
      'PaginatedResult_ResourceInstanceDetailedRead_',
      'data',
      'List of Resource Instance Detaileds',
      'List of Detailed Resource Instances',
    ],
    [
      'TenantBlockRead',
      'attributes',
      'Arbitraty tenant attributes that will be used to enforce attribute-based ' +
        'access control policies.',
      'Arbitrary tenant attributes that will be used to enforce\n' +
        'attribute-based access control policies.',
    ],
  ]) {
    const field = spec.components.schemas[model]?.properties?.[property];
    requireShape(
      field?.description,
      original,
      `/components/schemas/${model}/${property}/description`,
    );
    field.description = replacement;
  }

  if (supplement) {
    for (const [path, operation] of Object.entries(supplement.paths)) {
      if (spec.paths[path])
        throw new Error(`Supplemental route ${path} is now published; remove the stale exception.`);
      spec.paths[path] = structuredClone(operation);
    }
    for (const [name, model] of Object.entries(supplement.schemas)) {
      if (spec.components.schemas[name]) requireShape(spec.components.schemas[name], model, name);
      spec.components.schemas[name] = structuredClone(model);
    }
  }
  correctAuditReadNullability(spec);
  validateSource(spec);
  return spec;
}

/** Loads the exact reviewed bytes so refreshing the live API is always an explicit change. */
export function loadReviewedOpenApi(root) {
  const provenance = JSON.parse(readFileSync(join(root, 'openapi/provenance.json'), 'utf8'));
  const bytes = readFileSync(join(root, 'openapi/permit-api.json'));
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== provenance.sha256)
    throw new Error('OpenAPI snapshot hash changed; review and record its provenance.');
  const source = JSON.parse(bytes);
  const operations = Object.values(source.paths)
    .flatMap((path) => Object.values(path))
    .filter((operation) => operation.operationId);
  requireShape(
    {
      paths: Object.keys(source.paths).length,
      operations: operations.length,
      schemas: Object.keys(source.components.schemas).length,
    },
    provenance.counts,
    'snapshot inventory',
  );
  const supplementBytes = readFileSync(join(root, 'openapi/elements-login.json'));
  if (
    createHash('sha256').update(supplementBytes).digest('hex') !== provenance.elementsLogin.sha256
  ) {
    throw new Error('Elements login supplement changed; review and record its provenance.');
  }
  const supplement = JSON.parse(supplementBytes);
  return prepareOpenApi(source, supplement);
}
