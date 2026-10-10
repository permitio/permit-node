import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios';

const REDACTED = '[REDACTED]';
const MAX_TEXT = 1024;
const MAX_ITEMS = 8;
const BODY_FIELDS = new Set(['message', 'detail', 'error_code', 'code', 'msg', 'errors']);
const REQUEST_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'content-length',
  'content-type',
  'user-agent',
  'x-permit-sdk-version',
  'x-timeout-policy',
  'x-wait-timeout',
]);
const RESPONSE_HEADERS = new Set(['content-type', 'content-length', 'retry-after']);

interface CollectedSecrets {
  values: string[];
  complete: boolean;
}
type SecretContext = readonly string[] | CollectedSecrets;

const failurePrivacyKey = Symbol.for('permitio.diagnostics.failurePrivacy.v1');

function sharedFailurePrivacy(): WeakMap<object, CollectedSecrets> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, failurePrivacyKey);
  if (descriptor) {
    const value: unknown = descriptor.value;
    if (
      !('value' in descriptor) ||
      !(value instanceof WeakMap) ||
      descriptor.enumerable ||
      descriptor.writable ||
      descriptor.configurable
    ) {
      throw new TypeError(
        'Permit diagnostic privacy state is incompatible; load compatible SDK entry points.',
      );
    }
    return value;
  }
  const registry = new WeakMap<object, CollectedSecrets>();
  Object.defineProperty(globalThis, failurePrivacyKey, {
    value: registry,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return registry;
}

const failurePrivacy = sharedFailurePrivacy();

function mergeDiagnosticSecrets(left: SecretContext, right: SecretContext): CollectedSecrets {
  const result: CollectedSecrets = { values: [], complete: true };
  const seen = new Set<string>();
  let characters = 0;
  for (const context of [left, right]) {
    if ('complete' in context && !context.complete) return { values: [], complete: false };
    for (const value of 'complete' in context ? context.values : context) {
      if (!value || seen.has(value)) continue;
      characters += value.length;
      if (seen.size >= 512 || characters > 65_536) return { values: [], complete: false };
      seen.add(value);
      result.values.push(value);
    }
  }
  return result;
}

/**
 * Records bounded request privacy without changing the caller's thrown object or retaining requests.
 *
 * @internal
 * @param error - Original adapter, interceptor or retry-hook failure.
 * @param secrets - Request-private values; reused failures merge conservatively within fixed bounds.
 */
export function recordDiagnosticSecrets(error: unknown, secrets: SecretContext): void {
  if ((typeof error === 'object' && error !== null) || typeof error === 'function') {
    failurePrivacy.set(error, mergeDiagnosticSecrets(secrets, failurePrivacy.get(error) ?? []));
  }
}

/**
 * Recovers request privacy for unchanged caller failures at public error boundaries.
 *
 * @internal
 * @param error - Failure returned by an SDK-owned transport or a directly supplied cause.
 * @param secrets - Additional known values, including the SDK token.
 * @returns Bounded request privacy; uninspectable primitive failures fail closed.
 */
export function diagnosticErrorSecrets(
  error: unknown,
  secrets: SecretContext = [],
): CollectedSecrets {
  const recorded =
    (typeof error === 'object' && error !== null) || typeof error === 'function'
      ? (failurePrivacy.get(error) ?? [])
      : typeof error === 'string' || typeof error === 'number' || typeof error === 'boolean'
        ? { values: [], complete: false }
        : [];
  const privacy = mergeDiagnosticSecrets(secrets, recorded);
  return axios.isAxiosError<unknown>(error) ? diagnosticRequestSecrets(error, privacy) : privacy;
}

function redactPrivateValues(value: string, secrets: SecretContext): string {
  if (value.length > 65_536 || ('complete' in secrets && !secrets.complete)) return REDACTED;
  const values = 'complete' in secrets ? secrets.values : secrets;
  let text = value;
  for (const secret of [...new Set(values)].sort((left, right) => right.length - left.length)) {
    if (!secret) continue;
    const spellings = new Set([secret, JSON.stringify(secret).slice(1, -1)]);
    try {
      spellings.add(encodeURIComponent(secret));
      spellings.add(encodeURI(secret));
    } catch {
      // Lone surrogates have no valid URI spelling; the literal secret is still removed.
    }
    for (const spelling of spellings) text = text.split(spelling).join(REDACTED);
    const decoded = text.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) =>
      Buffer.from(encoded.replaceAll('%', ''), 'hex').toString('utf8'),
    );
    // Mixed percent spellings are detected without changing the original diagnostic route.
    if ([...spellings].some((spelling) => decoded.includes(spelling))) return REDACTED;
  }
  return text;
}

/**
 * Returns a bounded URL with user information, query values and fragments removed.
 *
 * @param value - Absolute HTTP(S) URL or relative request path.
 * @param secrets - Values removed before URL normalization or output truncation.
 * @returns A safe route, undefined for an absent URL, or a redaction marker for invalid input.
 */
export function diagnosticUrl(
  value: string | undefined,
  secrets: SecretContext = [],
): string | undefined {
  if (value === undefined) return undefined;
  value = redactPrivateValues(value, secrets);
  if (value === REDACTED) return REDACTED;
  try {
    const absolute = /^https?:\/\//i.test(value);
    const url = new URL(value, 'http://diagnostic.invalid/');
    if (!['http:', 'https:'].includes(url.protocol)) return REDACTED;
    const path = url.pathname.replace(/permit_key_[\w-]+/gi, REDACTED);
    return (
      absolute
        ? `${url.protocol}//${url.host}${path}`
        : value.startsWith('/')
          ? path
          : path.replace(/^\//, '')
    ).slice(0, MAX_TEXT);
  } catch {
    return REDACTED;
  }
}

/**
 * Bounds text and removes supplied secrets, bearer credentials and URL credential components.
 *
 * @param value - Description to sanitize, including valid strings with unpaired surrogates.
 * @param secrets - Known private values; incomplete collection redacts the entire description.
 * @returns Bounded text that contains none of the supplied values or credential URL components.
 */
export function diagnosticText(value: string, secrets: SecretContext = []): string {
  let text = redactPrivateValues(value, secrets);
  text = text
    .replace(/https?:\/\/[^\s<>"']+/gi, (url) => diagnosticUrl(url) ?? REDACTED)
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;"']+/gi, REDACTED)
    .replace(/permit_key_[\w-]+/gi, REDACTED)
    .replace(/\b(?:api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;"']+/gi, REDACTED)
    .replace(/[\r\n\t]/g, ' ');
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)} [truncated]` : text;
}

/**
 * Collects string and numeric values that may be echoed in diagnostics without invoking getters.
 *
 * @param value - Request data, parameters, credentials or omitted response fields.
 * @returns Private values and whether the bounded traversal could inspect every value safely.
 */
export function diagnosticSecrets(value: unknown): CollectedSecrets {
  const result: CollectedSecrets = { values: [], complete: true };
  const seen = new Set<object>();
  let remaining = 512;
  let characters = 65_536;
  function visit(item: unknown, depth: number): void {
    if (!result.complete) return;
    if (remaining-- <= 0 || depth > 12) {
      result.complete = false;
      return;
    }
    if (typeof item === 'number' && Number.isFinite(item)) item = String(item);
    if (typeof item === 'string') {
      characters -= item.length;
      if (characters < 0) result.complete = false;
      else if (item) result.values.push(item);
      return;
    }
    if (item === null || typeof item !== 'object' || seen.has(item)) return;
    seen.add(item);
    for (const key of Object.keys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (descriptor && 'value' in descriptor) visit(descriptor.value, depth + 1);
      else result.complete = false;
      if (!result.complete) return;
    }
  }
  if (typeof value === 'string') {
    if (value.length > 65_536) result.complete = false;
    else {
      try {
        visit(JSON.parse(value), 0);
      } catch {
        visit(value, 0);
      }
    }
  } else visit(value, 0);
  return result;
}

function omittedResponseSecrets(value: unknown, secrets: SecretContext): CollectedSecrets {
  const privacy: CollectedSecrets = { values: [], complete: true };
  let fields = 64;
  function collectOmitted(item: unknown, depth: number): void {
    if (item === null || typeof item !== 'object') return;
    if (depth >= 4) {
      privacy.complete = false;
      return;
    }
    if (Array.isArray(item)) {
      if (item.length > MAX_ITEMS) {
        privacy.complete = false;
        return;
      }
      const keys = Object.keys(item);
      if (keys.length > MAX_ITEMS) {
        privacy.complete = false;
        return;
      }
      for (const key of keys) {
        const field = Object.getOwnPropertyDescriptor(item, key);
        const index = Number(key);
        if (
          !field ||
          !('value' in field) ||
          !Number.isInteger(index) ||
          index < 0 ||
          String(index) !== key ||
          index >= item.length
        ) {
          privacy.complete = false;
          return;
        }
      }
      for (let index = 0; index < Math.min(item.length, MAX_ITEMS); index++) {
        const field = Object.getOwnPropertyDescriptor(item, String(index));
        if (field && 'value' in field) collectOmitted(field.value, depth + 1);
        else privacy.complete = false;
      }
      return;
    }
    for (const key of Object.keys(item)) {
      if (fields-- <= 0) {
        privacy.complete = false;
        return;
      }
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !('value' in descriptor)) {
        privacy.complete = false;
        continue;
      }
      if (BODY_FIELDS.has(key)) collectOmitted(descriptor.value, depth + 1);
      else {
        const found = diagnosticSecrets(descriptor.value);
        privacy.values.push(...found.values);
        privacy.complete &&= found.complete && privacy.values.length <= 512;
      }
    }
  }
  collectOmitted(value, 0);
  return mergeDiagnosticSecrets(secrets, privacy);
}

/**
 * Retains bounded error-description fields while excluding private response attributes.
 *
 * @param value - Untrusted JSON or text response body.
 * @param secrets - Known private values to remove from retained descriptions.
 * @returns A bounded diagnostic body. The shape differs from the raw response and is unknown.
 */
export function diagnosticBody(value: unknown, secrets: SecretContext = []): unknown {
  const privacy = omittedResponseSecrets(value, secrets);
  let remaining = 16;
  let characters = 2048;
  function visit(item: unknown, depth: number): unknown {
    if (remaining-- <= 0) return REDACTED;
    if (item === null || item === undefined || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      return Number.isFinite(item) && diagnosticText(String(item), privacy) === String(item)
        ? item
        : REDACTED;
    }
    if (typeof item === 'string') {
      if (characters === 0) return REDACTED;
      const text = diagnosticText(item, privacy).slice(0, characters);
      characters -= text.length;
      return text;
    }
    if (typeof item !== 'object' || depth >= 4) return REDACTED;
    if (Array.isArray(item)) {
      const array: unknown[] = [];
      for (let index = 0; index < Math.min(item.length, MAX_ITEMS); index++) {
        const field = Object.getOwnPropertyDescriptor(item, String(index));
        array.push(field && 'value' in field ? visit(field.value, depth + 1) : REDACTED);
      }
      return array;
    }
    const body: Record<string, unknown> = {};
    for (const key of BODY_FIELDS) {
      const field = Object.getOwnPropertyDescriptor(item, key);
      if (field && 'value' in field) body[key] = visit(field.value, depth + 1);
    }
    return body;
  }
  return visit(value, 0);
}

/**
 * Accepts only actual HTTP status values for errors and structured request logs.
 *
 * @param value - Untrusted status supplied by a response or caller adapter.
 * @returns The integer HTTP status, or undefined for missing or malformed metadata.
 */
export function diagnosticStatus(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

/**
 * Reads HTTP status and transport code without copying arbitrary error properties.
 *
 * @param error - Failed request or detached error cause.
 * @param secrets - Private values to exclude from custom transport codes.
 * @returns Valid HTTP status and bounded code metadata when safely available.
 */
export function diagnosticMetadata(
  error: unknown,
  secrets: SecretContext = [],
): { status?: number; code?: string } {
  if (!(error instanceof Error) && !axios.isAxiosError(error)) return {};
  const record = error as Error & { status?: unknown; code?: unknown };
  const status = diagnosticStatus(
    axios.isAxiosError(error) ? (error.response?.status ?? error.status) : record.status,
  );
  const code = record.code;
  return {
    ...(status !== undefined ? { status } : {}),
    ...(typeof code === 'string' &&
    /^[A-Z][A-Z0-9_]{0,63}$/.test(code) &&
    diagnosticText(code, secrets) === code
      ? { code }
      : {}),
  };
}

/**
 * Selects message/detail/text diagnostics with an actionable fallback for missing bodies.
 *
 * @param error - Axios error, other Error, string rejection or unknown failure.
 * @param secrets - Known credentials and private values to redact.
 * @returns A bounded failure description, HTTP status fallback or configuration guidance.
 */
export function diagnosticMessage(error: unknown, secrets: SecretContext = []): string {
  if (axios.isAxiosError<unknown>(error)) {
    const body = diagnosticBody(error.response?.data, secrets);
    function message(value: unknown): string | undefined {
      if (typeof value === 'string') return value.trim() || undefined;
      if (Array.isArray(value)) return value.map(message).filter(Boolean).join('; ') || undefined;
      if (value !== null && typeof value === 'object') {
        const fields = value as Record<string, unknown>;
        return message(fields['message']) ?? message(fields['detail']) ?? message(fields['msg']);
      }
      return undefined;
    }
    const description = message(body);
    if (description && description !== REDACTED) return diagnosticText(description, secrets);
    const status = diagnosticMetadata(error, secrets).status;
    if (status !== undefined) return `Permit API request failed with HTTP ${status}.`;
  }
  if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
    const description = diagnosticText(error.message, secrets);
    if (description !== REDACTED) return description;
  }
  if (typeof error === 'string' && error.trim()) {
    const description = diagnosticText(error, secrets);
    if (description !== REDACTED) return description;
  }
  return 'Permit request failed without an error description; check connectivity and configuration.';
}

/**
 * Makes a detached Error cause containing a safe message, status and transport code.
 *
 * @param error - Original failure, whose cause, stack and custom properties are never retained.
 * @param secrets - Additional known credentials and private values.
 * @returns A safe Error with bounded SDK stack frames and useful metadata.
 */
export function diagnosticCause(error: unknown, secrets: SecretContext = []): Error {
  const privacy = diagnosticErrorSecrets(error, secrets);
  const cause = new Error(diagnosticMessage(error, privacy));
  cause.name = axios.isAxiosError(error) ? 'AxiosError' : 'Error';
  if (cause.stack !== undefined) cause.stack = cause.stack.split('\n').slice(0, 5).join('\n');
  return Object.assign(cause, diagnosticMetadata(error, privacy));
}

/**
 * Collects secrets from omitted request/response values, headers and URL credentials.
 *
 * @param error - Request/response metadata to inspect without mutation.
 * @param secrets - Additional credentials, including the SDK token and caller default headers.
 * @returns Private values and a flag that causes redaction when collection exceeds its limits.
 */
export function diagnosticRequestSecrets(
  error: Pick<AxiosError<unknown>, 'config' | 'response'>,
  secrets: SecretContext = [],
): CollectedSecrets {
  const config = error.config;
  const result = mergeDiagnosticSecrets(secrets, failurePrivacy.get(error) ?? []);
  function collect(value: unknown): void {
    const found = diagnosticSecrets(value);
    result.values.push(...found.values);
    result.complete &&= found.complete && result.values.length <= 512;
  }
  collect(config?.data);
  collect(config?.params);
  collect(config?.auth);
  for (const [name, value] of Object.entries(config?.headers ?? {})) {
    if (!REQUEST_HEADERS.has(name.toLowerCase())) {
      collect(value);
      if (typeof value === 'string') collect(value.replace(/^(Bearer|Basic)\s+/i, ''));
    }
  }
  for (const [name, value] of Object.entries(error.response?.headers ?? {})) {
    if (!RESPONSE_HEADERS.has(name.toLowerCase())) collect(value);
  }
  for (const address of [config?.url, config?.baseURL]) {
    if (!address) continue;
    try {
      const url = new URL(address, 'http://diagnostic.invalid/');
      collect(decodeURIComponent(url.username));
      collect(decodeURIComponent(url.password));
      for (const value of url.searchParams.values()) collect(value);
      collect(url.hash.slice(1));
    } catch {
      // Malformed URLs are omitted in diagnosticUrl; keep the original value out of text too.
      collect(address);
    }
  }
  const privacy = omittedResponseSecrets(error.response?.data, result);
  failurePrivacy.set(error, privacy);
  return privacy;
}

/**
 * Makes an Axios snapshot without request bodies, sockets, hooks or the original cause/stack.
 *
 * @param error - Original Axios failure. The caller's error is never mutated.
 * @param secrets - Additional known credentials, including the SDK token.
 * @returns A detached Axios error with bounded request, response and failure diagnostics.
 */
export function diagnosticAxiosError(
  error: AxiosError<unknown>,
  secrets: SecretContext = [],
): AxiosError<unknown> {
  const config = error.config;
  const privateValues = diagnosticRequestSecrets(error, secrets);
  const headers = new AxiosHeaders();
  for (const [name, value] of Object.entries(config?.headers ?? {}).slice(0, 32)) {
    headers.set(
      diagnosticText(name, privateValues),
      REQUEST_HEADERS.has(name.toLowerCase())
        ? diagnosticText(String(value), privateValues)
        : REDACTED,
    );
  }
  const safeConfig: InternalAxiosRequestConfig = {
    headers,
    ...(config?.method !== undefined && { method: diagnosticText(config.method, privateValues) }),
    ...(config?.url !== undefined && {
      url: diagnosticUrl(config.url, privateValues) ?? REDACTED,
    }),
    ...(config?.baseURL !== undefined && {
      baseURL: diagnosticUrl(config.baseURL, privateValues) ?? REDACTED,
    }),
    ...(config?.timeout !== undefined &&
      Number.isFinite(config.timeout) && { timeout: config.timeout }),
  };
  const metadata = diagnosticMetadata(error, privateValues);
  const snapshot = new AxiosError(
    diagnosticMessage(error, privateValues),
    metadata.code,
    safeConfig,
  );
  if (snapshot.stack !== undefined)
    snapshot.stack = snapshot.stack.split('\n').slice(0, 5).join('\n');
  if (error.response && metadata.status !== undefined) {
    const responseHeaders = new AxiosHeaders();
    for (const [name, value] of Object.entries(error.response.headers).slice(0, 32)) {
      responseHeaders.set(
        diagnosticText(name, privateValues),
        RESPONSE_HEADERS.has(name.toLowerCase())
          ? diagnosticText(String(value), privateValues)
          : REDACTED,
      );
    }
    snapshot.response = {
      status: metadata.status,
      statusText: '',
      headers: responseHeaders,
      data: diagnosticBody(error.response.data, privateValues),
      config: safeConfig,
    };
  }
  if (metadata.status !== undefined) snapshot.status = metadata.status;
  return snapshot;
}
