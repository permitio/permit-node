import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, onTestFinished, test, vi } from 'vitest';

import {
  generateOpenApi,
  generatorOptions,
  repairPropertyDescriptions,
  verifyGeneratorArtifact,
} from '#scripts/openapi-generator.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'permit-jar-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const bytes = Buffer.from('verified test archive');
  mkdirSync(join(root, 'openapi'));
  writeFileSync(
    join(root, 'openapitools.json'),
    JSON.stringify({ 'generator-cli': { version: '7.25.0' } }),
  );
  writeFileSync(
    join(root, 'openapi/provenance.json'),
    JSON.stringify({
      generator: '7.25.0',
      generatorSha256: createHash('sha256').update(bytes).digest('hex'),
    }),
  );
  const jar = join(root, 'node_modules/.cache/openapi-generator/7.25.0.jar');
  return { root, jar, bytes };
}

test('verifies a downloaded artifact before caching it and reuses it without a network call', async () => {
  const { root, jar, bytes } = fixture();
  const download = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes });
  vi.stubGlobal('fetch', download);
  await expect(verifyGeneratorArtifact(root)).resolves.toBe('7.25.0');
  expect(readFileSync(jar)).toEqual(bytes);
  expect(download.mock.calls[0][0]).toBe(
    'https://repo.maven.apache.org/maven2/org/openapitools/openapi-generator-cli/7.25.0/openapi-generator-cli-7.25.0.jar',
  );
  await expect(verifyGeneratorArtifact(root)).resolves.toBe('7.25.0');
  expect(download).toHaveBeenCalledTimes(1);
});

for (const [name, response, pattern] of [
  ['HTTP failure', { ok: false, status: 404 }, /HTTP 404/],
  [
    'wrong archive',
    { ok: true, arrayBuffer: async () => Buffer.from('wrong bytes') },
    /hash differs/,
  ],
]) {
  test(`rejects ${name} without installing an unverified archive`, async () => {
    const { root, jar } = fixture();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(verifyGeneratorArtifact(root)).rejects.toThrow(pattern);
    expect(existsSync(jar)).toBe(false);
  });
}

test('download transport failure retains operation context and its cause', async () => {
  const { root, jar } = fixture();
  const cause = new Error('offline');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(cause));
  await expect(verifyGeneratorArtifact(root)).rejects.toMatchObject({
    message: 'Cannot download pinned generator 7.25.0 from Maven Central.',
    cause,
  });
  expect(existsSync(jar)).toBe(false);
});

test('a missing Java executable preserves the spawn failure as its cause', async () => {
  const { root, jar, bytes } = fixture();
  mkdirSync(dirname(jar), { recursive: true });
  writeFileSync(jar, bytes);
  writeFileSync(join(root, 'openapi/generator.json'), JSON.stringify(reviewedConfig));
  vi.stubEnv('JAVA_HOME', join(root, 'missing java'));
  await expect(
    generateOpenApi({ root, input: join(root, 'input.json'), output: join(root, 'output') }),
  ).rejects.toMatchObject({
    message: expect.stringMatching(/Cannot execute Java.*ENOENT.*install Java 17/),
    cause: expect.objectContaining({ code: 'ENOENT' }),
  });
});

test('Java output overflow retains bounded stdout and stderr with its cause', async () => {
  const { root, jar, bytes } = fixture();
  mkdirSync(dirname(jar), { recursive: true });
  writeFileSync(jar, bytes);
  writeFileSync(join(root, 'openapi/generator.json'), JSON.stringify(reviewedConfig));
  const javaHome = join(root, 'fixture java');
  mkdirSync(join(javaHome, 'bin'), { recursive: true });
  writeFileSync(
    join(javaHome, 'bin/java'),
    `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync('java-executed', 'yes');
fs.writeSync(2, 'stderr before overflow\\n');
fs.writeSync(1, 'stdout before overflow\\n');
fs.writeSync(1, Buffer.alloc(12 * 1024 * 1024, 'x'));
`,
    { mode: 0o755 },
  );
  vi.stubEnv('JAVA_HOME', javaHome);
  const failure = await generateOpenApi({
    root,
    input: join(root, 'input.json'),
    output: join(root, 'output'),
  }).catch((error) => error);
  expect(readFileSync(join(root, 'java-executed'), 'utf8')).toBe('yes');
  expect(failure).toBeInstanceOf(Error);
  expect(failure).toMatchObject({ cause: expect.objectContaining({ code: 'ENOBUFS' }) });
  expect(failure.message).toMatch(/generator 7\.25\.0 exceeded its 10 MiB output limit/);
  expect(failure.message).toContain('stdout before overflow');
  expect(failure.message).toContain('stderr before overflow');
  expect(failure.message).toContain('[output truncated]');
  expect(failure.message.length).toBeLessThan(34 * 1024);
  expect(failure.message).not.toContain('install Java');
});

test('a Java permission failure preserves its cause and names executable permissions', async () => {
  const { root, jar, bytes } = fixture();
  mkdirSync(dirname(jar), { recursive: true });
  writeFileSync(jar, bytes);
  writeFileSync(join(root, 'openapi/generator.json'), JSON.stringify(reviewedConfig));
  const javaHome = join(root, 'fixture java');
  mkdirSync(join(javaHome, 'bin'), { recursive: true });
  writeFileSync(join(javaHome, 'bin/java'), 'not executable', { mode: 0o644 });
  vi.stubEnv('JAVA_HOME', javaHome);
  await expect(
    generateOpenApi({ root, input: join(root, 'input.json'), output: join(root, 'output') }),
  ).rejects.toMatchObject({
    message: expect.stringMatching(/Cannot execute Java.*EACCES.*check executable permissions/),
    cause: expect.objectContaining({ code: 'EACCES' }),
  });
});

test('rejects changed pin provenance before download', async () => {
  const { root } = fixture();
  const download = vi.fn();
  vi.stubGlobal('fetch', download);
  writeFileSync(
    join(root, 'openapitools.json'),
    JSON.stringify({ 'generator-cli': { version: '8.0.0' } }),
  );
  await expect(verifyGeneratorArtifact(root)).rejects.toThrow(/pin and reviewed artifact/);
  expect(download).not.toHaveBeenCalled();
});

const reviewedConfig = JSON.parse(
  readFileSync(new URL('../openapi/generator.json', import.meta.url), 'utf8'),
);

test('uses the checked JSON-array mapping in the shared generation configuration', () => {
  const { root } = fixture();
  writeFileSync(join(root, 'openapi/generator.json'), JSON.stringify(reviewedConfig));
  expect(generatorOptions(root).typeMappings).toEqual({ set: 'Array' });
});

test.each([undefined, null, { set: 'Set' }, { set: 'Array', array: 'Set' }])(
  'rejects missing or unreviewed JSON-array mappings: %j',
  (typeMappings) => {
    const { root } = fixture();
    writeFileSync(
      join(root, 'openapi/generator.json'),
      JSON.stringify({ ...reviewedConfig, typeMappings }),
    );
    expect(() => generatorOptions(root)).toThrow('preserve unique JSON arrays');
  },
);

const wrappedProperties = [
  [
    'data_generator_lib__schemas__schema_opal_data__DerivationSettings',
    'superseded_by_direct_role',
    'data-generator-lib-schemas-schema-opal-data-derivation-settings',
  ],
  ['GroupAssignment', 'group_instance_key', 'group-assignment'],
  ['GroupCreate', 'group_instance_key', 'group-create'],
  ['GroupReadSchema', 'group_instance_key', 'group-read-schema'],
  ['TenantBlockRead', 'attributes', 'tenant-block-read'],
];

function commentFixture() {
  const { root } = fixture();
  const models = join(root, 'types');
  mkdirSync(models);
  const schemas = {};
  for (const [model, property, filename] of wrappedProperties) {
    schemas[model] = { properties: { [property]: { description: 'First line.\nSecond line.' } } };
    writeFileSync(
      join(models, filename + '.ts'),
      `/**\n     * First line. Second line.\n     */\n    '${property}'?: string;`,
    );
  }
  const input = join(root, 'input.json');
  writeFileSync(input, JSON.stringify({ components: { schemas } }));
  return { root, models, input };
}

test('restores only checked property-comment lines without changing surrounding source', () => {
  const { root, models, input } = commentFixture();
  repairPropertyDescriptions(root, 'types', input);
  for (const [, property, filename] of wrappedProperties) {
    expect(readFileSync(join(models, filename + '.ts'), 'utf8')).toBe(
      `/**\n     * First line.\n     * Second line.\n     */\n    '${property}'?: string;`,
    );
  }
});

test.each(wrappedProperties)(
  'rejects missing, changed or duplicate %s comment source',
  (model, property, filename) => {
    for (const mode of ['missing', 'changed', 'duplicate']) {
      const { root, models, input } = commentFixture();
      const path = join(models, filename + '.ts');
      const text = readFileSync(path, 'utf8');
      const changed = mode === 'duplicate' ? text + text : text.replace('First line.', 'Changed.');
      writeFileSync(path, changed);
      if (mode === 'missing') {
        const spec = JSON.parse(readFileSync(input, 'utf8'));
        delete spec.components.schemas[model].properties[property].description;
        writeFileSync(input, JSON.stringify(spec));
      }
      expect(() => repairPropertyDescriptions(root, 'types', input)).toThrow(
        /comment.*changed; review/i,
      );
    }
  },
);
