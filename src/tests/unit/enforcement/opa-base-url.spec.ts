import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import pino from 'pino';

import { buildOpaBaseUrl } from '#src/enforcement/enforcer';
import { Permit, PermitError } from '#src/index';

// The OPA client base URL is derived from the configured PDP URL by forcing the
// OPA port (8181) and appending the OPA data path. This was previously built
// with the `url-parse` package and is now built with the native WHATWG `URL`
// (#106). For absolute http(s) PDP URLs in canonical form the result matches what
// url-parse produced, and these assertions lock that string. WHATWG parsing also
// normalizes input that url-parse kept verbatim (dot segments, percent-encoding,
// IDN hosts); the dot-segment test below pins that intended difference.

// A non-default scheme, port and path, so a constructor that ignores the configured
// PDP (or an OPA client that ignores the derived base URL) fails the tests below.
const CONFIGURED_PDP = 'https://pdp.example.com:1234/prefix/';
const EXPECTED_OPA_CHECK_URL = 'https://pdp.example.com:8181/prefix/v1/data/permit/root';

// Reaches the private SDK OPA facade to inspect its URL construction.
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

function errorThrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected the call to throw, but it returned normally');
}

describe('buildOpaBaseUrl', () => {
  it('derives the OPA URL from the default PDP', () => {
    expect(buildOpaBaseUrl('http://localhost:7766')).toBe('http://localhost:8181/v1/data/permit/');
  });

  it('yields the same URL with or without a trailing slash', () => {
    expect(buildOpaBaseUrl('http://localhost:7766/')).toBe('http://localhost:8181/v1/data/permit/');
  });

  it('adds port 8181 to an https host without an explicit port', () => {
    expect(buildOpaBaseUrl('https://pdp.example.com')).toBe(
      'https://pdp.example.com:8181/v1/data/permit/',
    );
  });

  it('overrides an existing port with 8181', () => {
    expect(buildOpaBaseUrl('https://pdp.example.com:1234')).toBe(
      'https://pdp.example.com:8181/v1/data/permit/',
    );
  });

  it('preserves the existing concatenation behaviour for a path prefix', () => {
    // Pre-existing url-parse quirk: a path with no trailing slash glues onto the data path.
    expect(buildOpaBaseUrl('http://localhost:7766/prefix')).toBe(
      'http://localhost:8181/prefixv1/data/permit/',
    );
    expect(buildOpaBaseUrl('http://localhost:7766/prefix/')).toBe(
      'http://localhost:8181/prefix/v1/data/permit/',
    );
  });

  it('resolves dot segments in the PDP path before the data path', () => {
    // url-parse kept them verbatim and produced `/a/..v1/data/permit/`.
    expect(buildOpaBaseUrl('https://pdp.example.com/a/..')).toBe(
      'https://pdp.example.com:8181/v1/data/permit/',
    );
  });

  it.each(['localhost', '//localhost:7766'])(
    'throws a PermitError naming the pdp option for %j (no scheme)',
    (pdp) => {
      // Bare hosts and `//host:port` throw at construction; `localhost:7766` is misparsed,
      // not rejected.
      const error = errorThrownBy(() => buildOpaBaseUrl(pdp));
      expect(error).toBeInstanceOf(PermitError);
      expect((error as PermitError).message).toMatch(/"pdp" option.*absolute http\(s\) URL/);
    },
  );
});

describe('Permit with a configured PDP URL', () => {
  it('does not expose credentials from an invalid PDP URL', () => {
    const error = errorThrownBy(
      () => new Permit({ token: 'test-token', pdp: 'http://pdp-user:pdp-secret@localhost:bad' }),
    );
    expect(error).toBeInstanceOf(PermitError);
    // Serialize the way the SDK's pino logger would, so enumerable error fields are covered too.
    expect(JSON.stringify(pino.stdSerializers.err(error as Error))).not.toContain('pdp-secret');
  });

  it('posts a useOpa check to the OPA root derived from the configured PDP', async () => {
    const permit = new Permit({ token: 'test-token', pdp: CONFIGURED_PDP });
    const urls = captureRequestUrls((permit as unknown as PermitInternals).enforcer.opaClient);

    expect(await permit.check('user', 'read', 'document', {}, { useOpa: true })).toBe(true);
    expect(urls).toEqual([EXPECTED_OPA_CHECK_URL]);
  });

  it('posts a useOpa check through an injected opaAxiosInstance to the OPA root', async () => {
    const opaAxiosInstance = axios.create();
    const urls = captureRequestUrls(opaAxiosInstance);
    const permit = new Permit({ token: 'test-token', pdp: CONFIGURED_PDP, opaAxiosInstance });

    expect(await permit.check('user', 'read', 'document', {}, { useOpa: true })).toBe(true);
    expect(urls).toEqual([EXPECTED_OPA_CHECK_URL]);
  });
});
