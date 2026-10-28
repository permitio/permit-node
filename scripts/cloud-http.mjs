const CLOUD_CONTROL_ORIGIN = 'https://api.permit.io';

/**
 * Creates a bounded public HTTP boundary with explicit credential ownership and no raw diagnostics.
 * @param options - Trusted step-only credential and the fetch network boundary.
 * @returns One non-retrying request function; response bodies remain confined to its caller.
 * @throws With a constant diagnostic on invalid inputs, redirects, oversized bodies or transport
 * errors.
 */
export function cloudControlRequest({ credential, fetch: fetchBoundary = globalThis.fetch }) {
  if (
    typeof credential !== 'string' ||
    !/^[\x21-\x7e]+$/u.test(credential) ||
    typeof fetchBoundary !== 'function'
  )
    throw new Error('Cloud HTTP boundary requires an explicit valid step credential.');
  return async ({ method, path, body, credential: scoped }) => {
    try {
      const selected = scoped ?? credential;
      if (
        !['GET', 'POST', 'DELETE'].includes(method) ||
        typeof path !== 'string' ||
        !path.startsWith('/v2/') ||
        path.startsWith('//') ||
        path.includes('#') ||
        path.includes('\\') ||
        path
          .split('?')[0]
          .split('/')
          .some((part) => {
            const decoded = decodeURIComponent(part);
            return ['.', '..'].includes(decoded) || /[/\\]/u.test(decoded);
          }) ||
        typeof selected !== 'string' ||
        !/^[\x21-\x7e]+$/u.test(selected)
      )
        throw new Error('Invalid cloud HTTP inputs.');
      const target = new URL(path, CLOUD_CONTROL_ORIGIN);
      if (target.origin !== CLOUD_CONTROL_ORIGIN || !target.pathname.startsWith('/v2/'))
        throw new Error('Invalid cloud HTTP destination.');
      const response = await fetchBoundary(target, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Bearer ${selected}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599)
        throw new Error('Invalid cloud HTTP response status.');
      const chunks = [];
      let size = 0;
      if (response.body) {
        const reader = response.body.getReader();
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1024 * 1024) {
              await reader.cancel();
              throw new Error('Cloud HTTP response exceeds its size limit.');
            }
            chunks.push(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }
      }
      const text = Buffer.concat(chunks).toString('utf8');
      return { status: response.status, body: text ? JSON.parse(text) : null };
    } catch {
      throw new Error('Cloud control-plane operation failed; no raw response is reported.');
    }
  };
}
