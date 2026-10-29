// A URL fit for a log line or an error message: the user, password, query and fragment are
// dropped, since any of them can carry a credential, and the scheme, host, port and path stay,
// so a misconfigured URL is still recognisable. A string that isn't a URL, such as
// `localhost:7766`, is kept as it is, less any of those parts.
export function redactUrl(url: string): string {
  const trimmed = url.trim();
  // One or more slashes, as Node's URL parser (which axios uses) accepts `http:/host`.
  const scheme = /^[a-z][a-z0-9+.-]*:\/+/i.exec(trimmed)?.[0] ?? '';
  let rest = trimmed.slice(scheme.length);
  if (scheme && isValidUrl(trimmed)) {
    // Read as the parser reads it, which is where requests go: a '?' or '#' starts the query
    // or fragment, so an '@' after one isn't user info.
    rest = withoutQuery(rest);
    rest = rest.slice(rest.lastIndexOf('@', authorityEnd(rest)) + 1);
  } else if (scheme) {
    // Not a valid URL, so remove more rather than less: everything up to the last '@', which
    // also covers a '/', '?' or '#' in a password.
    rest = withoutQuery(rest.slice(rest.lastIndexOf('@') + 1));
  } else {
    // No scheme, such as `user:pass@localhost:7766`: the user info up to the last '@' before
    // the path, then the query and fragment.
    rest = withoutQuery(rest.slice(rest.lastIndexOf('@', authorityEnd(rest)) + 1));
  }
  return scheme + rest;
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function authorityEnd(rest: string): number {
  const slash = rest.indexOf('/');
  return slash === -1 ? rest.length : slash;
}

function withoutQuery(rest: string): string {
  return rest.split(/[?#]/, 1)[0];
}
