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
