import { builtFile, probePackage } from '#src/tests/module-imports/package-probe';

// Validates the BUILT package the way a CommonJS consumer loads it:
// `require('permitio')` in a separate Node process, resolved through the
// package.json `exports` map. This is a packaging-regression guard.
describe('CommonJS require of the built package', () => {
  it('resolves through the exports map to build/index.js', async () => {
    expect(await probePackage('cjs')).toHaveProperty('resolved', builtFile('index.js'));
  });

  it('exposes Permit and the public API classes', async () => {
    expect(await probePackage('cjs')).toHaveProperty('names', {
      Permit: 'Permit',
      ApiClient: 'ApiClient',
      ElementsClient: 'ElementsClient',
    });
  });

  it('constructs a Permit with the given config and its API modules', async () => {
    const probe = await probePackage('cjs');

    expect(probe).toHaveProperty('members', {
      check: 'function',
      api: 'object',
      elements: 'object',
      users: 'object',
      resources: 'object',
      roles: 'object',
    });
    expect(probe).toHaveProperty('config', { token: 'test-token', pdp: 'http://localhost:7766' });
  });
});
