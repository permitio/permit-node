import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

import { afterAll, beforeAll, expect, onTestFinished, test } from 'vitest';

import { auditPublicExports, checkReferenceLinks } from '#scripts/public-reference.mjs';

const root = resolve(import.meta.dirname, '..');
let output;
let contracts;
beforeAll(() => {
  output = mkdtempSync(join(tmpdir(), 'permit-reference-output-'));
  execFileSync(process.execPath, [join(root, 'tools/compiler/docs.mjs'), '--out', output], {
    cwd: root,
    stdio: 'pipe',
  });
  contracts = auditPublicExports(root);
}, 30_000);
afterAll(() => rmSync(output, { recursive: true, force: true }));

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'permit-reference-regression-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  cpSync(output, directory, { recursive: true });
  return directory;
}

test('generated public groups have real navigation, member links and local targets', () => {
  expect(contracts.groups.some((group) => group.field === 'resourceRoles')).toBe(true);
  expect(contracts.groups.some((group) => group.field === 'resourceRelations')).toBe(true);
  expect(contracts.contracts.every((contract) => contract.exported)).toBe(true);
  const result = checkReferenceLinks(output, contracts.groups);
  expect(result.publicGroups).toBe(contracts.groups.length);
  expect(result.htmlFiles).toBeGreaterThan(0);
  expect(result.localReferences).toBeGreaterThan(result.htmlFiles);
});

test('rejects a missing navigation entry even while its interface page exists', () => {
  const directory = fixture();
  const file = join(directory, 'assets/navigation.js');
  const source = readFileSync(file, 'utf8');
  const encoded = JSON.parse(source.slice(source.indexOf('=') + 1).trim());
  const navigation = JSON.parse(inflateSync(Buffer.from(encoded, 'base64')));
  const page = 'interfaces/IResourceRolesApi.html';
  const filtered = navigation.filter((item) => item.path !== page);
  expect(filtered.length).toBeLessThan(navigation.length);
  writeFileSync(
    file,
    'window.navigationData = ' +
      JSON.stringify(deflateSync(JSON.stringify(filtered)).toString('base64')),
  );
  expect(() => checkReferenceLinks(directory, contracts.groups)).toThrow(
    /navigation.*IResourceRolesApi/,
  );
});

test('rejects an unlinked API member even when the summary still links its interface', () => {
  const directory = fixture();
  const file = join(directory, 'interfaces/IPermitApi.html');
  const text = readFileSync(file, 'utf8');
  const position = text.indexOf('id="resourcerelations"');
  const start = text.lastIndexOf('<section', position);
  const end = text.indexOf('</section>', position);
  const section = text
    .slice(start, end)
    .replace('href="IResourceRelationsApi.html"', 'data-page="missing"');
  const changed = text.slice(0, start) + section + text.slice(end);
  expect(changed).not.toBe(text);
  expect(changed).toContain('href="IResourceRelationsApi.html"');
  writeFileSync(file, changed);
  expect(() => checkReferenceLinks(directory, contracts.groups)).toThrow(
    /resourceRelations.*page link/,
  );
});

test.each(['interfaces/IResourceRelationsApi.html', 'assets/style.css', 'media/Node.png'])(
  'rejects a missing generated page or media asset: %s',
  (file) => {
    const directory = fixture();
    renameSync(join(directory, file), join(directory, file + '.removed'));
    expect(() => checkReferenceLinks(directory, contracts.groups)).toThrow(
      /missing local reference/,
    );
  },
);

test.each(['classes/Permit.html#missing-member', 'assets/icons.svg#missing-icon'])(
  'rejects a missing local fragment: %s',
  (link) => {
    const directory = fixture();
    const file = join(directory, 'index.html');
    writeFileSync(file, readFileSync(file, 'utf8') + `<a href="${link}">Broken</a>`);
    expect(() => checkReferenceLinks(directory, contracts.groups)).toThrow(
      /missing local fragment/,
    );
  },
);

test('checks a same-page encoded anchor and leaves remote links offline', () => {
  const directory = fixture();
  const file = join(directory, 'index.html');
  writeFileSync(
    file,
    readFileSync(file, 'utf8') +
      '<a id="review anchor" href="#review%20anchor">Local</a>' +
      '<a href="https://unavailable.example.invalid/missing">External</a>',
  );
  expect(() => checkReferenceLinks(directory, contracts.groups)).not.toThrow();
});

test('rejects links outside the standalone output directory', () => {
  const directory = fixture();
  const file = join(directory, 'index.html');
  writeFileSync(file, readFileSync(file, 'utf8') + '<a href="../private.html">Outside</a>');
  expect(() => checkReferenceLinks(directory, contracts.groups)).toThrow(/escapes output/);
});

test.each(['contract', 'group', 'error'])(
  'compiler audit rejects a missing root %s export',
  (kind) => {
    const directory = mkdtempSync(join(tmpdir(), 'permit-export-regression-'));
    onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
    mkdirSync(join(directory, 'src'));
    writeFileSync(
      join(directory, 'tsconfig.build.json'),
      JSON.stringify({
        compilerOptions: { strict: true, target: 'ES2023' },
        include: ['src/*.ts'],
      }),
    );
    writeFileSync(
      join(directory, 'src/group.ts'),
      `
export interface Input { key: string; }
export class GroupError extends Error {}
export interface IGroupApi {
  /** @throws {GroupError} When the operation fails. */
  create(input: Input): Promise<Input>;
}`,
    );
    const omitted = { contract: 'Input', group: 'IGroupApi', error: 'GroupError' }[kind];
    const names = ['Input', 'IGroupApi', 'GroupError'].filter((name) => name !== omitted);
    writeFileSync(
      join(directory, 'src/index.ts'),
      `
import type { IGroupApi } from './group';
export { ${names.join(', ')} } from './group';
export interface IPermitApi { group: IGroupApi; }
`,
    );
    expect(() => auditPublicExports(directory)).toThrow(new RegExp(`missing:.*${omitted}`));
  },
);
