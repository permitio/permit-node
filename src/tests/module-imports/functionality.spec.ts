import test from 'ava';

test('ES Module functionality test', async (t) => {
  const { Permit } = await import('../../index');

  // Test creating a Permit instance with ES module import
  const permit = new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });

  t.truthy(permit);
  t.is(typeof permit.check, 'function');
  t.is(typeof permit.api, 'object');
  t.is(typeof permit.elements, 'object');
  t.is(typeof permit.config, 'object');

  // Test that the config was set correctly
  t.is(permit.config.token, 'test-token');
  t.is(permit.config.pdp, 'http://localhost:7766');
});

test('CommonJS functionality test', async (t) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Permit } = require('../../index');

  // Test creating a Permit instance with CommonJS require
  const permit = new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });

  t.truthy(permit);
  t.is(typeof permit.check, 'function');
  t.is(typeof permit.api, 'object');
  t.is(typeof permit.elements, 'object');
  t.is(typeof permit.config, 'object');

  // Test that the config was set correctly
  t.is(permit.config.token, 'test-token');
  t.is(permit.config.pdp, 'http://localhost:7766');
});

test('Dynamic import functionality test', async (t) => {
  // Test dynamic import (ES modules)
  const { Permit } = await import('../../index');

  const permit = new Permit({
    token: 'test-token',
    pdp: 'http://localhost:7766',
  });

  t.truthy(permit);
  t.is(typeof permit.check, 'function');

  // Test that we can access nested modules
  t.is(typeof permit.api.users, 'object');
  t.is(typeof permit.api.resources, 'object');
  t.is(typeof permit.api.roles, 'object');
});
