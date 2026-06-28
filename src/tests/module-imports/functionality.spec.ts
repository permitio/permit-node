import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// Exercise the BUILT bundles (build/index.mjs and build/index.js) end-to-end to
// guard against packaging regressions in either module format.
const builtCjsPath = path.resolve(__dirname, '../../../build/index.js');
const builtMjsUrl = pathToFileURL(path.resolve(__dirname, '../../../build/index.mjs')).href;

it('ES Module functionality test (built bundle)', async () => {
  const { Permit } = await import(builtMjsUrl);

  const permit = new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });

  expect(permit).toBeTruthy();
  expect(typeof permit.check).toBe('function');
  expect(typeof permit.api).toBe('object');
  expect(typeof permit.elements).toBe('object');
  expect(typeof permit.config).toBe('object');

  // Test that the config was set correctly
  expect(permit.config.token).toBe('test-token');
  expect(permit.config.pdp).toBe('http://localhost:7766');
});

it('CommonJS functionality test (built bundle)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Permit } = require(builtCjsPath);

  const permit = new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });

  expect(permit).toBeTruthy();
  expect(typeof permit.check).toBe('function');
  expect(typeof permit.api).toBe('object');
  expect(typeof permit.elements).toBe('object');
  expect(typeof permit.config).toBe('object');

  // Test that the config was set correctly
  expect(permit.config.token).toBe('test-token');
  expect(permit.config.pdp).toBe('http://localhost:7766');
});

it('Built bundle exposes nested API modules', async () => {
  const { Permit } = await import(builtMjsUrl);

  const permit = new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });

  expect(permit).toBeTruthy();
  expect(typeof permit.check).toBe('function');

  // Test that we can access nested modules
  expect(typeof permit.api.users).toBe('object');
  expect(typeof permit.api.resources).toBe('object');
  expect(typeof permit.api.roles).toBe('object');
});
