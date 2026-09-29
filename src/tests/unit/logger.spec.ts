import test from 'ava';

import { assertLogs, captureLogs, LogMode } from './logger-test-process';

const modes: LogMode[] = ['default', 'json', 'env', 'pretty', 'env-pretty'];
for (const mode of modes) {
  test(`PER-16493: ${mode} logging creates 12 instances without warnings or leaks`, async (t) => {
    assertLogs(t, await captureLogs(mode, undefined, { instances: 12 }), mode);
  });
}
