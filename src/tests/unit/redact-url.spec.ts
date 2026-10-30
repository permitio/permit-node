import test from 'ava';

import { redactUrl } from '../../utils/redact-url';

for (const [url, expected] of [
  ['http://localhost:7766', 'http://localhost:7766'],
  ['https://api.example.com/v2/facts?page=2#top', 'https://api.example.com/v2/facts'],
  ['http://user:password@pdp.example.com:7766/path?sig=secret', 'http://pdp.example.com:7766/path'],
  // The parser lowercases the scheme and host.
  ['HTTP://User:Password@Host:7766', 'http://host:7766'],
  ['http://user:password@[::1]:7766/x', 'http://[::1]:7766/x'],
  // A '?' or '#' in the password doesn't stop the user info being removed.
  ['http://user:pa#ss@host:7766', 'http://host:7766'],
  ['http://user:pa?ss@host:7766/path', 'http://host:7766/path'],
  ['http://user:p@ss@host:7766', 'http://host:7766'],
  // An '@' after the host belongs to the path or query, not to user info.
  ['http://host:7766/users/a@example.com', 'http://host:7766/users/a@example.com'],
  ['http://host:7766/path?email=a@example.com', 'http://host:7766/path'],
  // An '@' in the query or fragment of a URL without a path isn't user info.
  ['http://host:7766?a=b@c', 'http://host:7766'],
  ['http://pdp?sig=a@b/c', 'http://pdp'],
  ['http://host#x@y', 'http://host'],
  // A '/' in the password: not a valid URL, so everything up to the last '@' goes.
  ['http://user:pa/ss@host:7766', 'http://host:7766'],
  // What Node's URL parser accepts: surrounding whitespace, and one slash after the scheme.
  [' http://user:pass@pdp:7766\n', 'http://pdp:7766'],
  ['http:/user:pass@pdp:7766', 'http://pdp:7766'],
  // What the parser cleans up before it parses: a tab or newline inside the text, a '\\'
  // read as '/'. axios still sends these with the user info, so it is removed.
  ['ht\ttp://user:pass@pdp:7766', 'http://pdp:7766'],
  ['http://pdp:7766/a\nb', 'http://pdp:7766/ab'],
  ['http:\\\\user:pass@pdp:7766\\path', 'http://pdp:7766/path'],
  // Not an http(s) URL to the parser, and a '/' before the '@': everything up to the last '@'.
  ['http//user:pass@pdp:7766', 'pdp:7766'],
  ['http//user:p@ss@pdp:7766', 'pdp:7766'],
  ['htp:/x/user:pass@pdp:7766/path', 'htp:/pdp:7766/path'],
  ['localhost:7766/a/user:pass@pdp', 'pdp'],
  // Not a URL, but recognisable.
  ['localhost:7766', 'localhost:7766'],
  ['user:password@localhost:7766', 'localhost:7766'],
  ['user:p@ss@localhost:7766/path?x=y', 'localhost:7766/path'],
  ['', ''],
]) {
  test(`redactUrl(${JSON.stringify(url)})`, (t) => {
    t.is(redactUrl(url), expected);
  });
}
