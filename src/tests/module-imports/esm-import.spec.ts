import test from 'ava';

import { ApiClient } from '../../api/api-client';
import { ElementsClient } from '../../api/elements';
import { Enforcer } from '../../enforcement/enforcer';
import type { IResource, IUser } from '../../enforcement/interfaces';
import { Permit } from '../../index';

test('ES Module import works correctly', async (t) => {
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

test('ES Module imports individual modules', async (t) => {
  t.is(typeof Enforcer, 'function');
  t.is(Enforcer.name, '_Enforcer');
  // IUser and IResource are types, so we can't test them at runtime
  t.pass('Type imports work correctly');
});

test('ES Module imports API modules', async (t) => {
  t.is(typeof ApiClient, 'function');
  t.is(ApiClient.name, 'ApiClient');
  t.is(typeof ElementsClient, 'function');
  t.is(ElementsClient.name, 'ElementsClient');
});
