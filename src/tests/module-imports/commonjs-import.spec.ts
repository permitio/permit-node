import test from 'ava';

test('CommonJS require() import works correctly', async (t) => {
  // This test will be compiled to JS and can use require() at runtime
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Permit } = require('../../index');

  t.is(typeof Permit, 'function');
  t.is(Permit.name, 'Permit');

  // Test creating a Permit instance
  const permit = new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });

  t.truthy(permit);
  t.is(typeof permit.check, 'function');
  t.is(typeof permit.api, 'object');
  t.is(typeof permit.elements, 'object');
  t.is(typeof permit.config, 'object');
});

test('CommonJS require() imports individual modules', async (t) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Enforcer } = require('../../enforcement/enforcer');

  t.is(typeof Enforcer, 'function');
  t.is(Enforcer.name, '_Enforcer');
});

test('CommonJS require() imports API modules', async (t) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ApiClient } = require('../../api/api-client');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ElementsClient } = require('../../api/elements');

  t.is(typeof ApiClient, 'function');
  t.is(ApiClient.name, 'ApiClient');
  t.is(typeof ElementsClient, 'function');
  t.is(ElementsClient.name, 'ElementsClient');
});
