import { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import { Permit } from '../../index';

/**
 * A single HTTP request captured by a {@link MockTransport} adapter.
 *
 * The generated openapi client bakes query parameters into the URL string and
 * pre-serializes the request body to a JSON string. To keep assertions
 * ergonomic, the capturing adapter normalizes both:
 * - `origin` and `path` come from the URL axios dispatches to (`baseURL` joined
 *   with `url`), so a spec can compare the exact pathname.
 * - `params` is parsed from that URL's query string (so the values are strings,
 *   e.g. `page: '1'`, never the numbers the caller passed).
 * - `data` is parsed back from the JSON string into an object.
 */
export interface CapturedRequest {
  /** Upper-cased HTTP method, e.g. `'GET'` / `'POST'` (axios lower-cases it internally). */
  method: string | undefined;
  /** The request URL. For REST this is absolute; for PDP/OPA it is relative to `baseURL`. */
  url: string | undefined;
  /** The axios `baseURL` (set for the PDP/OPA instances, undefined for REST). */
  baseURL: string | undefined;
  /** Scheme, host and port of the dispatched URL, e.g. `http://localhost:8000`. */
  origin: string;
  /** Percent-encoded pathname of the dispatched URL, without the query string. */
  path: string;
  /** Query parameters parsed from the dispatched URL (values are strings). */
  params: Record<string, string>;
  /** Request body, parsed from JSON back into an object when possible. */
  data: unknown;
  /** The finalized request headers. */
  headers: InternalAxiosRequestConfig['headers'];
}

/**
 * Captures the requests dispatched on one axios instance and lets a test queue
 * the responses those requests resolve/reject with.
 *
 * Queued responses are consumed FIFO: each request shifts the next queued entry.
 * When the queue is empty a request resolves with `200 {}` so simple
 * "did the SDK dispatch the right request?" assertions need no setup.
 */
export interface MockTransport {
  /** Every request captured so far, in dispatch order. */
  readonly requests: CapturedRequest[];
  /** The most recently captured request, or `undefined` if none yet. */
  readonly last: CapturedRequest | undefined;
  /** Queue the next response. Defaults to status `200` with `{}` data. */
  resolveWith(data?: unknown, status?: number): void;
  /** Queue a synthetic {@link AxiosError} so `handleApiError` maps it to `PermitApiError`. */
  rejectWith(status: number, data?: unknown): void;
  /** Clear both captured requests and the queued responses. */
  reset(): void;
}

/** Options for {@link createMockPermit}. All fields are optional. */
export interface MockPermitOptions {
  /**
   * Route facts modules (users, tenants, role-assignments, ...) through the PDP
   * base URL instead of the REST API. The facts modules still dispatch on the
   * REST axios instance, so the `rest` transport captures them either way; only
   * the captured `url`/`origin` changes.
   */
  proxyFactsViaPdp?: boolean;
  /** Organization key seeded into the SDK context. Defaults to `'org'`. */
  org?: string;
  /** Project key seeded into the SDK context. Defaults to `'proj'`. */
  project?: string;
  /** Environment key seeded into the SDK context. Defaults to `'env'`. */
  environment?: string;
  /** Which context level to pre-seed (gates which modules can run). Defaults to `'environment'`. */
  contextLevel?: 'environment' | 'project' | 'organization';
  /** The API token passed to the SDK. Defaults to `'test-token'`. */
  token?: string;
}

/** The result of {@link createMockPermit}. */
export interface MockPermit {
  /** A fully constructed {@link Permit} whose three axios instances are mocked. */
  permit: Permit;
  /** Captures REST / control-plane calls (`permit.api.*`). */
  rest: MockTransport;
  /** Captures PDP calls (`permit.check`, `permit.bulkCheck`, `permit.getUserPermissions`). */
  pdp: MockTransport;
  /** Captures OPA calls (`permit.check(..., { useOpa: true })`). */
  opa: MockTransport;
}

/** The REST API origin the mocked SDK is configured with. */
export const MOCK_API_ORIGIN = 'http://localhost:8000';

/** The PDP origin the mocked SDK is configured with. */
export const MOCK_PDP_ORIGIN = 'http://localhost:7766';

interface QueuedResponse {
  kind: 'resolve' | 'reject';
  status: number;
  data: unknown;
}

/**
 * Builds a synthetic {@link AxiosError} that mirrors a real HTTP error response.
 *
 * `handleApiError` checks `axios.isAxiosError(err)` and reads `err.response`, so
 * the error must carry `isAxiosError`, a `response` (with `status`/`data`), the
 * live request `config` and a `toJSON` method. The `data` defaults to `{}` so
 * `handleApiError`'s `err.response?.data.message` access never throws.
 *
 * @param status - The HTTP status code to report.
 * @param data - The response body (defaults to `{}`).
 * @param config - The request config to attach (defaults to an empty config).
 * @returns An `AxiosError` ready to be thrown from an adapter.
 */
export function synthAxiosError(
  status: number,
  data: unknown = {},
  config: InternalAxiosRequestConfig = {} as InternalAxiosRequestConfig,
): AxiosError {
  const error = new Error(`Request failed with status code ${status}`) as AxiosError;
  error.isAxiosError = true;
  error.config = config;
  error.toJSON = () => ({});
  error.response = {
    status,
    statusText: 'Error',
    headers: {},
    config,
    data,
  };
  return error;
}

class MockTransportImpl implements MockTransport {
  public readonly requests: CapturedRequest[] = [];
  private readonly queue: QueuedResponse[] = [];

  public get last(): CapturedRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  public resolveWith(data: unknown = {}, status = 200): void {
    this.queue.push({ kind: 'resolve', status, data });
  }

  public rejectWith(status: number, data: unknown = {}): void {
    this.queue.push({ kind: 'reject', status, data });
  }

  public reset(): void {
    this.requests.length = 0;
    this.queue.length = 0;
  }

  public capture(request: CapturedRequest): void {
    this.requests.push(request);
  }

  public next(): QueuedResponse | undefined {
    return this.queue.shift();
  }
}

function parseBody(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }
  try {
    return JSON.parse(data);
  } catch {
    // Not JSON (e.g. a form/string body); return it verbatim.
    return data;
  }
}

function toCaptured(instance: AxiosInstance, config: InternalAxiosRequestConfig): CapturedRequest {
  // getUri joins baseURL and url the same way the real adapter does.
  const dispatched = new URL(instance.getUri(config));
  const params: Record<string, string> = {};
  dispatched.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return {
    method: config.method?.toUpperCase(),
    url: config.url,
    baseURL: config.baseURL,
    origin: dispatched.origin,
    path: dispatched.pathname,
    params,
    data: parseBody(config.data),
    headers: config.headers,
  };
}

/**
 * Installs a network-free capturing adapter on one axios instance and returns
 * the {@link MockTransport} that controls it.
 */
function installAdapter(instance: AxiosInstance): MockTransport {
  const transport = new MockTransportImpl();
  instance.defaults.adapter = async (
    config: InternalAxiosRequestConfig,
  ): Promise<AxiosResponse> => {
    transport.capture(toCaptured(instance, config));
    const queued = transport.next();
    if (queued && queued.kind === 'reject') {
      throw synthAxiosError(queued.status, queued.data, config);
    }
    return {
      data: queued?.data ?? {},
      status: queued?.status ?? 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  return transport;
}

function seedContext(
  permit: Permit,
  level: 'environment' | 'project' | 'organization',
  org: string,
  project: string,
  environment: string,
): void {
  const ctx = permit.config.apiContext;
  if (level === 'organization') {
    ctx._saveApiKeyAccessibleScope(org);
    ctx.setOrganizationLevelContext(org);
    return;
  }
  if (level === 'project') {
    ctx._saveApiKeyAccessibleScope(org, project);
    ctx.setProjectLevelContext(org, project);
    return;
  }
  ctx._saveApiKeyAccessibleScope(org, project, environment);
  ctx.setEnvironmentLevelContext(org, project, environment);
}

/**
 * Constructs a {@link Permit} SDK whose REST, PDP and OPA axios instances are all
 * replaced with network-free capturing adapters, and pre-seeds the SDK context
 * so API methods skip the `getApiKeyScope` HTTP call.
 *
 * Usage:
 * ```ts
 * const { permit, rest } = createMockPermit();
 * rest.resolveWith([{ key: 'doc' }]);          // queue the next response
 * await permit.api.resources.list();
 * expect(rest.last?.method).toBe('GET');       // assert the dispatched request
 * expect(rest.last?.path).toBe('/v2/schema/proj/env/resources');
 * ```
 *
 * Notes for spec authors:
 * - Responses are FIFO. Queue one `resolveWith`/`rejectWith` per request the SDK
 *   will make; an unqueued request resolves with `200 {}`.
 * - `path` is the exact pathname, so assert it with `toBe`. `origin` shows
 *   whether a facts request went to the REST API or to the PDP.
 * - `params` values are strings (parsed from the URL query), e.g. `page: '1'`.
 * - `data` is the parsed request body, so assert with `toEqual(payload)`.
 * - `rejectWith(status)` produces a `PermitApiError` whose `.response.status`
 *   equals `status` (the SDK maps AxiosErrors via `handleApiError`).
 * - The SDK is constructed with retries left disabled (the default), so every
 *   request hits the adapter exactly once.
 *
 * @param opts - See {@link MockPermitOptions}.
 * @returns The constructed permit plus the three transports.
 */
export function createMockPermit(opts: MockPermitOptions = {}): MockPermit {
  const {
    proxyFactsViaPdp = false,
    org = 'org',
    project = 'proj',
    environment = 'env',
    contextLevel = 'environment',
    token = 'test-token',
  } = opts;

  const permit = new Permit({
    token,
    pdp: MOCK_PDP_ORIGIN,
    apiUrl: MOCK_API_ORIGIN,
    proxyFactsViaPdp,
  });

  const enforcer = (
    permit as unknown as {
      enforcer: { client: AxiosInstance; opaClient: AxiosInstance };
    }
  ).enforcer;

  const rest = installAdapter(permit.config.axiosInstance);
  const pdp = installAdapter(enforcer.client);
  const opa = installAdapter(enforcer.opaClient);

  seedContext(permit, contextLevel, org, project, environment);

  return { permit, rest, pdp, opa };
}
