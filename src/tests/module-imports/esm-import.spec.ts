import { builtFile, probePackage } from './package-probe';

// Validates the BUILT package the way an ES module consumer loads it: a static
// `import ... from 'permitio'` in a separate Node process, resolved through the
// package.json `exports` map. This is a packaging-regression guard.
describe('ES module import of the built package', () => {
  it("resolves through the exports map to build/index.mjs in Node's ESM loader", async () => {
    expect(await probePackage('esm')).toHaveProperty('resolved', builtFile('index.mjs'));
  });

  it('exposes Permit and the public API classes as named exports', async () => {
    expect(await probePackage('esm')).toHaveProperty('names', {
      Permit: 'Permit',
      ApiClient: 'ApiClient',
      ElementsClient: 'ElementsClient',
    });
  });

  it('constructs a Permit with the given config and its API modules', async () => {
    const probe = await probePackage('esm');

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
