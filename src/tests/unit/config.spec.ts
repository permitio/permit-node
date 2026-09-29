import test from 'ava';

import { ConfigFactory } from '../../config';
import { Permit } from '../../index';

/** Runs `read` with PERMIT_LOG_JSON set to `value`, or unset when `value` is undefined. */
function withLogJsonEnv<T>(value: string | undefined, read: () => T): T {
  const previous = process.env.PERMIT_LOG_JSON;
  if (value === undefined) {
    delete process.env.PERMIT_LOG_JSON;
  } else {
    process.env.PERMIT_LOG_JSON = value;
  }
  try {
    return read();
  } finally {
    if (previous === undefined) {
      delete process.env.PERMIT_LOG_JSON;
    } else {
      process.env.PERMIT_LOG_JSON = previous;
    }
  }
}

function describe(value: string | undefined): string {
  return value === undefined ? 'unset' : JSON.stringify(value);
}

const envCases: [string | undefined, boolean][] = [
  [undefined, true],
  ['true', true],
  ['TRUE', true],
  [' True ', true],
  ['false', false],
  ['False', false],
  [' FALSE\n', false],
  ['yes', true],
  ['no', true],
  ['', true],
  ['0', true],
  ['{', true],
];
for (const [value, expected] of envCases) {
  test.serial(`PER-16493: PERMIT_LOG_JSON=${describe(value)} gives log.json ${expected}`, (t) => {
    t.is(
      withLogJsonEnv(value, () => ConfigFactory.build({}).log.json),
      expected,
    );
  });
}

const overrideCases: [string | undefined, boolean][] = [
  [undefined, false],
  ['true', false],
  ['false', true],
  ['FALSE', true],
  ['yes', false],
  ['', true],
];
for (const [value, json] of overrideCases) {
  test.serial(`PER-16493: log.json ${json} overrides PERMIT_LOG_JSON=${describe(value)}`, (t) => {
    t.is(
      withLogJsonEnv(value, () => ConfigFactory.build({ log: { json } }).log.json),
      json,
    );
  });
}

test.serial('PER-16493: an unrecognized PERMIT_LOG_JSON does not break new Permit()', (t) => {
  const permit = withLogJsonEnv(
    'yes',
    () => new Permit({ token: 'test-token', log: { level: 'silent', json: false } }),
  );
  t.false(permit.config.log.json);
});
