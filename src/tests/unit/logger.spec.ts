import {
  assertLogs,
  buildLoggerChild,
  captureLogs,
  LoggerChild,
  LogMode,
} from '../helpers/logger-test-process';

describe('LoggerFactory (unit)', () => {
  let child: LoggerChild;

  beforeAll(async () => {
    child = await buildLoggerChild();
    return child.remove;
  });

  const modes: LogMode[] = ['default', 'json', 'env', 'pretty', 'env-pretty'];
  for (const mode of modes) {
    it(`PER-16493: ${mode} logging creates 12 instances without warnings or leaks`, async () => {
      assertLogs(await captureLogs(child, mode, undefined, { instances: 12 }), mode);
    });
  }
});
