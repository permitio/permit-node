import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { onTestFinished } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));

const consumer = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
interface Attributes { readonly region: 'east' | 'west'; note?: string | null; }
declare const permit: sdk.Permit;
const api = permit.api.tenants;
declare const implementation: sdk.TenantsApi;
declare const publicApi: sdk.ITenantsApi;
declare const dynamic: boolean;
declare const params: sdk.IListTenantsParams;
declare const maybe: sdk.IListTenantsParams | undefined;
declare const optionalTrue: { includeTotalCount?: true };
declare const optionalFalse: { includeTotalCount?: false };
declare const union: { includeTotalCount: true } | { search: string };
const plain = api.list();
const omitted = api.list({ search: 'east' });
const undefinedOptions = api.list(undefined);
const counted = api.list({ includeTotalCount: true });
const uncounted = api.list({ includeTotalCount: false });
const runtime = api.list({ includeTotalCount: dynamic });
const wide = api.list(params);
const absent = api.list(maybe);
const conditional = api.list(union);
const maybeTrue = api.list(optionalTrue);
const maybeFalse = api.list(optionalFalse);
const typedPlain = api.list<Attributes>();
const typedCounted = api.list<Attributes>({ includeTotalCount: true });
const typedFalse = api.list<Attributes>({ includeTotalCount: false });
const typedDynamic = api.list<Attributes>({ includeTotalCount: dynamic });
const typedMaybe = api.list<Attributes>(maybe);
const typedUnion = api.list<Attributes>(union);
type Results = [
  Assert<Equal<Awaited<typeof plain>, sdk.TenantRead[]>>,
  Assert<Equal<Awaited<typeof omitted>, sdk.TenantRead[]>>,
  Assert<Equal<Awaited<typeof undefinedOptions>, sdk.TenantRead[]>>,
  Assert<Equal<Awaited<typeof counted>, sdk.PaginatedResultTenantRead>>,
  Assert<Equal<Awaited<typeof uncounted>, sdk.TenantRead[]>>,
  Assert<Equal<Awaited<typeof runtime>, sdk.TenantRead[] | sdk.PaginatedResultTenantRead>>,
  Assert<Equal<Awaited<typeof wide>, sdk.TenantRead[] | sdk.PaginatedResultTenantRead>>,
  Assert<Equal<Awaited<typeof absent>, sdk.TenantRead[] | sdk.PaginatedResultTenantRead>>,
  Assert<Equal<Awaited<typeof conditional>, sdk.TenantRead[] | sdk.PaginatedResultTenantRead>>,
  Assert<Equal<Awaited<typeof maybeTrue>, sdk.TenantRead[] | sdk.PaginatedResultTenantRead>>,
  Assert<Equal<Awaited<typeof maybeFalse>, sdk.TenantRead[]>>,
  Assert<Equal<Awaited<typeof typedPlain>, sdk.TenantRead<Attributes>[]>>,
  Assert<Equal<Awaited<typeof typedCounted>, sdk.PaginatedResultTenantRead<Attributes>>>,
  Assert<Equal<Awaited<typeof typedFalse>, sdk.TenantRead<Attributes>[]>>,
  Assert<Equal<
    Awaited<typeof typedDynamic>,
    sdk.TenantRead<Attributes>[] | sdk.PaginatedResultTenantRead<Attributes>
  >>,
  Assert<Equal<
    Awaited<typeof typedMaybe>,
    sdk.TenantRead<Attributes>[] | sdk.PaginatedResultTenantRead<Attributes>
  >>,
  Assert<Equal<
    Awaited<typeof typedUnion>,
    sdk.TenantRead<Attributes>[] | sdk.PaginatedResultTenantRead<Attributes>
  >>,
];
// @ts-expect-error An explicit undefined flag is outside the established exact-optional contract.
api.list({ includeTotalCount: undefined });
// @ts-expect-error The flag is a boolean.
api.list({ includeTotalCount: 'true' });
// @ts-expect-error Attribute selection accepts object shapes.
api.list<null>();

const concrete: Promise<sdk.PaginatedResultTenantRead<Attributes>> =
  implementation.list<Attributes>({ includeTotalCount: true });
const interfaceResult: Promise<sdk.PaginatedResultTenantRead<Attributes>> =
  publicApi.list<Attributes>({ includeTotalCount: true });
const cloned: Promise<sdk.PaginatedResultTenantRead<Attributes>> =
  api.waitForSync(10).list<Attributes>({ includeTotalCount: true });
declare const page: sdk.PaginatedResultTenantRead<Attributes>;
const attrs: Attributes | undefined = page.data[0]?.attributes;
const nullable: string | null | undefined = page.data[0]?.attributes?.note;
const total: number = page.total_count;
const rows: sdk.TenantRead<Attributes>[] = page.data;
const optionalPageCount: number | undefined = page.page_count;
declare const absentAttributes: Omit<sdk.TenantRead<Attributes>, 'attributes'>;
const optionalAttributes: sdk.TenantRead<Attributes> = absentAttributes;
// @ts-expect-error A counted page remains an envelope rather than an array.
const wrongArray: Promise<sdk.TenantRead[]> = api.list({ includeTotalCount: true });
// @ts-expect-error The default array cannot be used as a counted page.
const wrongPage: Promise<sdk.PaginatedResultTenantRead> = api.list();
// @ts-expect-error Optional flags can be absent, so they cannot promise a page.
const uncertainPage: Promise<sdk.PaginatedResultTenantRead> = api.list(optionalTrue);
// @ts-expect-error Dynamic flags require narrowing before reading metadata.
runtime.then(result => result.total_count);
// @ts-expect-error Full page metadata remains required.
const missingTotal: sdk.PaginatedResultTenantRead<Attributes> = { data: [] };
// @ts-expect-error Attributes remain non-null at the top level.
const nullAttributes: sdk.TenantRead<Attributes> = { ...absentAttributes, attributes: null };
// @ts-expect-error Primitive attribute shapes are not supported.
api.list<string>({ includeTotalCount: true });
void [concrete, interfaceResult, cloned, attrs, nullable, total, rows, optionalPageCount,
  optionalAttributes, wrongArray, wrongPage, uncertainPage, missingTotal, nullAttributes];
// Compiling the tuple evaluates every exact result assertion.
declare const results: Results;
void results;
`;
test('strict consumers preserve literal and dynamic tenant-list shapes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'permit-tenant-totals-types-'));
  onTestFinished(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'node_modules'));
  await symlink(root, join(directory, 'node_modules/permitio'), 'dir');
  const esmFile = join(directory, 'consumer.mts');
  const cjsFile = join(directory, 'consumer.cts');
  await writeFile(esmFile, `import * as sdk from 'permitio';\n${consumer}`);
  await writeFile(cjsFile, `import sdk = require('permitio');\n${consumer}`);
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
        types: ['node'],
        typeRoots: [join(root, 'node_modules/@types')],
        noEmit: true,
      },
      files: [esmFile, cjsFile],
    }),
  );
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(root, 'node_modules/typescript/lib/tsc.js'), '-p', config],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  ).catch((error: unknown) => {
    if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
      throw new Error(
        `Tenant totals consumer compilation failed:\n${error.stdout}\n${error.stderr}`,
        {
          cause: error,
        },
      );
    }
    throw error;
  });
  expect(stdout).toBe('');
  expect(stderr).toBe('');
});
