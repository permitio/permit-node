import test from 'ava';

import { redactUrl } from '../../utils/redact-url';

for (const [url, expected] of [
  ['http://localhost:7766', 'http://localhost:7766'],
  ['https://api.example.com/v2/facts?page=2#top', 'https://api.example.com/v2/facts'],
  ['http://user:password@pdp.example.com:7766/path?sig=secret', 'http://pdp.example.com:7766/path'],
  ['HTTP://User:Password@Host:7766', 'HTTP://Host:7766'],
  ['http://user:password@[::1]:7766/x', 'http://[::1]:7766/x'],
  // A '?' or '#' in the password doesn't stop the user info being removed.
  ['http://user:pa#ss@host:7766', 'http://host:7766'],
  ['http://user:pa?ss@host:7766/path', 'http://host:7766/path'],
  ['http://user:p@ss@host:7766', 'http://host:7766'],
  // An '@' after the host belongs to the path or query, not to user info.
  ['http://host:7766/users/a@example.com', 'http://host:7766/users/a@example.com'],
  ['http://host:7766/path?email=a@example.com', 'http://host:7766/path'],
  // Not a URL, but recognisable.
  ['localhost:7766', 'localhost:7766'],
  ['user:password@localhost:7766', 'localhost:7766'],
  ['', ''],
]) {
  test(`redactUrl(${JSON.stringify(url)})`, (t) => {
    t.is(redactUrl(url), expected);
  });
}
