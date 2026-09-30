import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, onTestFinished, test, vi } from 'vitest';

import { verifyGeneratorArtifact } from '#scripts/openapi-generator.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'permit-jar-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
    vi.unstubAllGlobals();
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
  const jar = join(root, 'node_modules/@openapitools/openapi-generator-cli/versions/7.25.0.jar');
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
