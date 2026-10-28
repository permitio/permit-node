import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

test('both public entries expose the dedicated user attribute facade', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as esm from 'permitio';
const cjs = createRequire(import.meta.url)('permitio');
for (const sdk of [esm, cjs]) {
  const permit = new sdk.Permit({ token: 'fixture', log: { level: 'silent' } });
  assert.ok(permit.api.userAttributes instanceof sdk.UserAttributesApi);
  for (const method of ['list', 'get', 'create', 'update', 'delete']) {
    assert.equal(typeof permit.api.userAttributes[method], 'function');
  }
}
console.log('USER_ATTRIBUTES_EXPORTS_OK');
`,
    ],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  );
  expect(stdout.trim()).toBe('USER_ATTRIBUTES_EXPORTS_OK');
});

const consumer = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
declare const permit: sdk.Permit;
declare const concrete: sdk.UserAttributesApi;
declare const client: sdk.IPermitClient;
const api: sdk.IUserAttributesApi = permit.api.userAttributes;
const clientApi: sdk.IUserAttributesApi = client.api.userAttributes;
const create: sdk.ResourceAttributeCreate = {
  key: 'department', type: sdk.AttributeType.String, description: 'Policy schema',
};
const patch: sdk.ResourceAttributeUpdate = { description: 'Updated schema' };
const options: sdk.IPagination = { page: 2, perPage: 3 };
const listed = api.list(options);
const defaults = api.list();
const created = api.create(create);
const got = api.get('attribute-key-or-uuid');
const updated = api.update('attribute-key-or-uuid', patch);
const deleted = api.delete('attribute-key-or-uuid');
const concreteList = concrete.list();
const emptyPatch = concrete.update('attribute-key-or-uuid', {});
type Results = [
  Assert<Equal<Awaited<typeof listed>, sdk.ResourceAttributeRead[]>>,
  Assert<Equal<Awaited<typeof defaults>, sdk.ResourceAttributeRead[]>>,
  Assert<Equal<Awaited<typeof created>, sdk.ResourceAttributeRead>>,
  Assert<Equal<Awaited<typeof got>, sdk.ResourceAttributeRead>>,
  Assert<Equal<Awaited<typeof updated>, sdk.ResourceAttributeRead>>,
  Assert<Equal<Awaited<typeof deleted>, void>>,
  Assert<Equal<Awaited<typeof concreteList>, sdk.ResourceAttributeRead[]>>,
  Assert<Equal<Awaited<typeof emptyPatch>, sdk.ResourceAttributeRead>>,
];
declare const row: sdk.ResourceAttributeRead;
const metadata: [string, string, string, string, string, string, string, string, boolean] = [
  row.id, row.key, row.resource_id, row.resource_key, row.organization_id,
  row.project_id, row.environment_id, row.created_at, row.built_in,
];
const updatedAt: string = row.updated_at;
// @ts-expect-error Attribute creation requires its schema key.
api.create({ type: sdk.AttributeType.String });
// @ts-expect-error Attribute creation requires a supported schema type.
api.create({ key: 'department' });
// @ts-expect-error Attribute types are the committed enum.
api.create({ ...create, type: 'unsupported-kind' });
// @ts-expect-error Schema definitions do not accept individual user values.
api.create({ ...create, attributes: { department: 'engineering' } });
// @ts-expect-error The committed description does not accept null.
api.create({ ...create, description: null });
// @ts-expect-error Exact optional metadata rejects explicit undefined.
api.update('attribute', { description: undefined });
// @ts-expect-error An attribute PATCH does not rename its key.
api.update('attribute', { key: 'renamed' });
// @ts-expect-error Pagination cannot select another resource.
api.list({ resourceKey: '__user' });
// @ts-expect-error There is no resource ID switch on this dedicated facade.
api.list({ resourceId: 'resource-id' });
// @ts-expect-error Get accepts only an attribute key or UUID.
api.get('resource', 'attribute');
// @ts-expect-error Create has no resource selector argument.
api.create('resource', create);
// @ts-expect-error Schema reads preserve all required identity and context metadata.
const missingMetadata: sdk.ResourceAttributeRead = create;
// @ts-expect-error Lists return the committed array, not a facts page envelope.
const page: Promise<sdk.PaginatedResultUserRead> = api.list();
// @ts-expect-error Schema operations have no facts synchronization helper.
api.waitForSync(3);
// @ts-expect-error The dedicated facade exposes only the five requested operations.
api.getByKey('attribute');
// @ts-expect-error Schema reads do not use caller-declared user value shapes.
api.get<{ department: string }>('attribute');
void [clientApi, metadata, updatedAt];
declare const results: Results;
void results;
`;

test('strict TS6 and TS7 root consumers preserve user attribute schema contracts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-user-attribute-types-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'node_modules'));
  await symlink(root, join(directory, 'node_modules/permitio'), 'dir');
  const esm = join(directory, 'consumer.mts');
  const cjs = join(directory, 'consumer.cts');
  await writeFile(esm, `import * as sdk from 'permitio';\n${consumer}`);
  await writeFile(cjs, `import sdk = require('permitio');\n${consumer}`);
  const config = join(directory, 'tsconfig.json');
  await writeFile(
    config,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2023',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noPropertyAccessFromIndexSignature: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        skipLibCheck: false,
        noEmit: true,
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
      },
      files: [esm, cjs],
    }),
  );
  for (const compiler of [
    join(root, 'node_modules/typescript/bin/tsc'),
    join(root, 'tools/compiler/node_modules/typescript/bin/tsc'),
  ]) {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [compiler, '-p', config],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
      },
    ).catch((error: unknown) => {
      if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
        throw new Error(
          `User attribute consumer compilation failed:\n${error.stdout}\n${error.stderr}`,
          {
            cause: error,
          },
        );
      }
      throw error;
    });
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  }
}, 65_000);
