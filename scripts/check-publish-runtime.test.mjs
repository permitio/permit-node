import { expect, test } from 'vitest';

import { checkPublishingRuntime } from '#scripts/check-publish-runtime.mjs';

for (const versions of [
  { node: '22.14.0', npm: '11.5.1' },
  { node: '24.15.0', npm: '11.12.1' },
]) {
  test(`Trusted Publishing supports ${JSON.stringify(versions)}`, () => {
    expect(() => checkPublishingRuntime(versions)).not.toThrow();
  });
}
for (const versions of [
  { node: '22.13.0', npm: '11.5.1' },
  { node: '24.0.0', npm: '11.5.0' },
  { node: 'invalid', npm: '11.5.1' },
  { node: '24.0.0', npm: 'invalid' },
]) {
  test(`Trusted Publishing rejects ${JSON.stringify(versions)}`, () => {
    expect(() => checkPublishingRuntime(versions)).toThrow(/Trusted Publishing needs/);
  });
}
