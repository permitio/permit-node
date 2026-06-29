import { AxiosError, AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import { Permit } from '../../index';

/**
 * A single HTTP request captured by a {@link MockTransport} adapter.
 *
 * The generated openapi client bakes query parameters into the URL string and
 * pre-serializes the request body to a JSON string. To keep assertions
 * ergonomic, the capturing adapter normalizes both:
 * - `params` is parsed from the URL query string (so the values are strings,
 *   e.g. `page: '1'`, never the numbers the caller passed).
 * - `data` is parsed back from the JSON string into an object.
 */
export interface CapturedRequest {
  /** Upper-cased HTTP method, e.g. `'GET'` / `'POST'` (axios lower-cases it internally). */
  method?: string;
  /** The request URL. For REST this is absolute; for PDP/OPA it is relative to `baseURL`. */
  url?: string;
  /** The axios `baseURL` (set for the PDP/OPA instances, undefined for REST). */
  baseURL?: string;
  /** Query parameters parsed from the URL (values are strings) merged with any `config.params`. */
  params?: any;
  /** Request body, parsed from JSON back into an object when possible. */
  data?: any;
  /** The finalized request headers (an `AxiosHeaders` instance). */
  headers?: any;
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
   * the captured `url`/`baseURL` changes.
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

  public capture(config: InternalAxiosRequestConfig): void {
    this.requests.push(toCaptured(config));
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

function extractParams(config: InternalAxiosRequestConfig): Record<string, any> {
  const params: Record<string, any> = {};
  try {
    const url = new URL(config.url ?? '', config.baseURL || 'http://mock.local');
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
  } catch {
    // URL not parseable; fall through to whatever config.params holds.
  }
  if (config.params && typeof config.params === 'object') {
    Object.assign(params, config.params);
  }
  return params;
}

function toCaptured(config: InternalAxiosRequestConfig): CapturedRequest {
  return {
    method: config.method?.toUpperCase(),
    url: config.url,
    baseURL: config.baseURL,
    params: extractParams(config),
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
    transport.capture(config);
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
 * expect(rest.last?.url).toContain('/resources');
 * ```
 *
 * Notes for spec authors:
 * - Responses are FIFO. Queue one `resolveWith`/`rejectWith` per request the SDK
 *   will make; an unqueued request resolves with `200 {}`.
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
    pdp: 'http://localhost:7766',
    apiUrl: 'http://localhost:8000',
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

/** A pino-shaped logger whose methods are `vi.fn()` mocks, for util/logger specs. */
export interface FakeLogger {
  debug: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  child: () => FakeLogger;
}

/**
 * Returns a minimal pino-compatible logger backed by `vi.fn()` spies.
 *
 * `child()` returns a fresh {@link FakeLogger} so nested loggers are also
 * inspectable. Relies on the global `vi` provided by Vitest (`globals: true`).
 */
export function fakeLogger(): FakeLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => fakeLogger(),
  };
}
