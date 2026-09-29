import test from 'ava';
import axios, { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import pino from 'pino';

import { buildOpaBaseUrl } from '../../enforcement/enforcer';
import { Permit, PermitError } from '../../index';

// The OPA client base URL is derived from the configured PDP URL by forcing the
// OPA port (8181) and appending the OPA data path. This was previously built
// with the `url-parse` package and is now built with the native WHATWG `URL`
// (#106). For absolute http(s) PDP URLs in canonical form the result matches what
// url-parse produced, and these assertions lock that string. WHATWG parsing also
// normalizes input that url-parse kept verbatim (dot segments, percent-encoding,
// IDN hosts); the dot-segment test below pins that intended difference.

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

test('buildOpaBaseUrl: a path prefix preserves the existing concatenation behaviour', (t) => {
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

test('buildOpaBaseUrl: dot segments in the PDP path are resolved before the data path', (t) => {
  // url-parse kept them verbatim and produced `/a/..v1/data/permit/`.
  t.is(
    buildOpaBaseUrl('https://pdp.example.com/a/..'),
    'https://pdp.example.com:8181/v1/data/permit/',
  );
});

test('buildOpaBaseUrl: a PDP without a scheme throws a PermitError naming the pdp option', (t) => {
  // Bare hosts and `//host:port` throw at construction; `localhost:7766` is misparsed,
  // not rejected.
  for (const pdp of ['localhost', '//localhost:7766']) {
    t.throws(() => buildOpaBaseUrl(pdp), {
      instanceOf: PermitError,
      message: /"pdp" option.*absolute http\(s\) URL/,
    });
  }
});

test('new Permit does not expose credentials from an invalid PDP URL', (t) => {
  const error = t.throws(
    () => new Permit({ token: 'test-token', pdp: 'http://pdp-user:pdp-secret@localhost:bad' }),
    { instanceOf: PermitError },
  );
  // Serialize the way the SDK's pino logger would, so enumerable error fields are covered too.
  t.false(JSON.stringify(pino.stdSerializers.err(error)).includes('pdp-secret'));
});

// A non-default scheme, port and path, so a constructor that ignores the configured
// PDP (or an OPA client that ignores the derived base URL) fails the tests below.
const CONFIGURED_PDP = 'https://pdp.example.com:1234/prefix/';
const EXPECTED_OPA_CHECK_URL = 'https://pdp.example.com:8181/prefix/v1/data/permit/root';

// Reaches the SDK-created OPA client, as retry-interceptor.spec.ts does for enforcer.client.
interface PermitInternals {
  enforcer: { opaClient: AxiosInstance };
}

// Records the URL axios would request and answers with an OPA allow decision, so the
// check runs end to end without a network call.
function captureRequestUrls(instance: AxiosInstance): string[] {
  const urls: string[] = [];
  instance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    urls.push(axios.getUri(config));
    return { status: 200, statusText: 'OK', headers: {}, config, data: { allow: true } };
  };
  return urls;
}

test('a useOpa check posts to the OPA root derived from the configured PDP', async (t) => {
  const permit = new Permit({ token: 'test-token', pdp: CONFIGURED_PDP });
  const urls = captureRequestUrls((permit as unknown as PermitInternals).enforcer.opaClient);

  t.true(await permit.check('user', 'read', 'document', {}, { useOpa: true }));
  t.deepEqual(urls, [EXPECTED_OPA_CHECK_URL]);
});

test('a useOpa check through an injected opaAxiosInstance posts to the OPA root', async (t) => {
  const opaAxiosInstance = axios.create();
  const urls = captureRequestUrls(opaAxiosInstance);
  const permit = new Permit({ token: 'test-token', pdp: CONFIGURED_PDP, opaAxiosInstance });

  t.true(await permit.check('user', 'read', 'document', {}, { useOpa: true }));
  t.deepEqual(urls, [EXPECTED_OPA_CHECK_URL]);
});
