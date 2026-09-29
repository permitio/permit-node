import * as path from 'node:path';

// Validate the BUILT CommonJS artifact (build/index.js) the package actually
// ships, not the TypeScript source. This is a packaging-regression guard.
// __dirname is provided by Vitest at runtime and by @types/node under the
// project's commonjs module setting, avoiding import.meta (unsupported here).
const builtCjsPath = path.resolve(__dirname, '../../../build/index.js');

it('CommonJS require() of the built bundle exposes Permit', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const built = require(builtCjsPath);

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

it('CommonJS require() of the built bundle exposes the public API classes', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const built = require(builtCjsPath);

  expect(typeof built.ApiClient).toBe('function');
  expect(built.ApiClient.name).toBe('ApiClient');
  expect(typeof built.ElementsClient).toBe('function');
  expect(built.ElementsClient.name).toBe('ElementsClient');
});
