// A URL fit for a log line or an error message: the user, password, query and fragment are
// dropped, since any of them can carry a credential, and the scheme, host, port and path stay,
// so a misconfigured URL is still recognisable. A string that isn't a URL, such as
// `localhost:7766`, is kept as it is, less any of those parts.
export function redactUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/, 1)[0];
  return withoutQuery.replace(/^([a-z][a-z0-9+.-]*:\/\/)?[^/]*@/i, '$1');
}
