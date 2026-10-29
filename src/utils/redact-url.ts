// A URL fit for a log line or an error message: the user, password, query and fragment are
// dropped, since any of them can carry a credential, and the scheme, host, port and path stay,
// so a misconfigured URL is still recognisable. A string that isn't a URL, such as
// `localhost:7766`, is kept as it is, less any of those parts.
export function redactUrl(url: string): string {
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(url)?.[0] ?? '';
  let rest = url.slice(scheme.length);
  // The user info first, up to the last '@' before the path, so that a '?' or '#' in a
  // password can't hide the '@'; then the query and fragment.
  const slash = rest.indexOf('/');
  const at = rest.lastIndexOf('@', slash === -1 ? rest.length : slash);
  if (at !== -1) {
    rest = rest.slice(at + 1);
  }
  return scheme + rest.split(/[?#]/, 1)[0];
}
