import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// Validate the BUILT ES Module artifact (build/index.mjs) the package actually
// ships, not the TypeScript source. This is a packaging-regression guard.
const builtMjsUrl = pathToFileURL(path.resolve(__dirname, '../../../build/index.mjs')).href;

it('ES Module import of the built bundle exposes Permit', async () => {
  const built = await import(builtMjsUrl);

  expect(typeof built.Permit).toBe('function');
  expect(built.Permit.name).toBe('Permit');

  const permit = new built.Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });

  expect(permit).toBeTruthy();
  expect(typeof permit.check).toBe('function');
  expect(typeof permit.api).toBe('object');
  expect(typeof permit.elements).toBe('object');
  expect(typeof permit.config).toBe('object');
});

it('ES Module import of the built bundle exposes the public API classes', async () => {
  const built = await import(builtMjsUrl);

  expect(typeof built.ApiClient).toBe('function');
  expect(built.ApiClient.name).toBe('ApiClient');
  expect(typeof built.ElementsClient).toBe('function');
  expect(built.ElementsClient.name).toBe('ElementsClient');
});
