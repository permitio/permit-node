import test from 'ava';
import axios from 'axios';
import pino from 'pino';

import { buildOpaBaseUrl } from '../../enforcement/enforcer';
import { Permit, PermitError } from '../../index';

// The OPA client base URL is derived from the configured PDP URL by forcing the
// OPA port (8181) and appending the OPA data path. This was previously built
// with the `url-parse` package and is now built with the native WHATWG `URL`
// (#106). These assertions lock the produced string so the refactor is proven
// behaviour-equivalent and any regression in the construction logic fails here.

test('buildOpaBaseUrl: default PDP', (t) => {
  t.is(buildOpaBaseUrl('http://localhost:7766'), 'http://localhost:8181/v1/data/permit/');
});

test('buildOpaBaseUrl: trailing slash yields the same URL as no trailing slash', (t) => {
  t.is(buildOpaBaseUrl('http://localhost:7766/'), 'http://localhost:8181/v1/data/permit/');
});

test('buildOpaBaseUrl: https host without an explicit port', (t) => {
  t.is(buildOpaBaseUrl('https://pdp.example.com'), 'https://pdp.example.com:8181/v1/data/permit/');
});

test('buildOpaBaseUrl: an existing port is overridden with 8181', (t) => {
  t.is(
    buildOpaBaseUrl('https://pdp.example.com:1234'),
    'https://pdp.example.com:8181/v1/data/permit/',
  );
});

test('buildOpaBaseUrl: a path-prefixed PDP preserves the pre-existing concatenation behaviour', (t) => {
  // Pre-existing url-parse quirk: a path with no trailing slash glues onto the data path.
  t.is(
    buildOpaBaseUrl('http://localhost:7766/prefix'),
    'http://localhost:8181/prefixv1/data/permit/',
  );
  t.is(
    buildOpaBaseUrl('http://localhost:7766/prefix/'),
    'http://localhost:8181/prefix/v1/data/permit/',
  );
});

test('buildOpaBaseUrl: a PDP without a scheme throws a PermitError naming the pdp option', (t) => {
  // Scheme-less input (bare host or `//host:port`) throws at construction; `localhost:7766` is misparsed, not rejected.
  for (const pdp of ['localhost', '//localhost:7766']) {
    t.throws(() => buildOpaBaseUrl(pdp), {
      instanceOf: PermitError,
      message: /"pdp" option.*absolute http\(s\) URL/,
    });
  }
});

test('new Permit with an invalid credential-bearing PDP URL does not expose the credentials', (t) => {
  const error = t.throws(
    () => new Permit({ token: 'test-token', pdp: 'http://pdp-user:pdp-secret@localhost:bad' }),
    { instanceOf: PermitError },
  );
  // Serialize the way the SDK's pino logger would, so enumerable error fields are covered too.
  t.false(JSON.stringify(pino.stdSerializers.err(error)).includes('pdp-secret'));
});

test('Enforcer wires the OPA client base URL to buildOpaBaseUrl(pdp)', (t) => {
  // Guards the integration the refactor actually edits: the constructed OPA axios
  // client must take its baseURL from the helper. Passing an opaAxiosInstance lets
  // us read what the Enforcer set, without a live PDP or network call.
  const opaAxiosInstance = axios.create();
  new Permit({ token: 'test-token', pdp: 'http://localhost:7766', opaAxiosInstance });
  t.is(opaAxiosInstance.defaults.baseURL, buildOpaBaseUrl('http://localhost:7766'));
});
