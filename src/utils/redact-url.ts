// A URL fit for a log line or an error message: the user, password, query and fragment are
// dropped, since any of them can carry a credential, and the scheme, host, port and path stay,
// so a misconfigured URL is still recognisable. A string that isn't a URL, such as
// `localhost:7766`, is kept as it is, less any of those parts.
export function redactUrl(url: string): string {
  const trimmed = url.trim();
  try {
    // An http(s) URL, the only kind axios requests, is rebuilt from what Node's URL parser
    // (which axios uses) reads, after its own clean-up of the text: where requests go, without
    // the user info, query or fragment.
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      const path = parsed.pathname === '/' ? '' : parsed.pathname;
      return `${parsed.protocol}//${parsed.host}${path}`;
    }
  } catch {
    // Not a URL the parser accepts: handled below.
  }
  // Anything else removes more rather than less: everything up to the last '@', then the
  // query and fragment. A scheme in front is kept, so the value stays recognisable.
  const scheme = /^[a-z][a-z0-9+.-]*:\/+/i.exec(trimmed)?.[0] ?? '';
  const rest = trimmed.slice(scheme.length);
  return scheme + rest.slice(rest.lastIndexOf('@') + 1).split(/[?#]/, 1)[0];
}
