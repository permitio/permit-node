// Replaced at build time (scripts/build.mjs) and in tests (vitest.config.mts) with the
// package's own version. `process.env.npm_package_version` is the host application's.
declare const __PERMIT_SDK_VERSION__: string | undefined;

/** The version of this SDK, as sent in the X-Permit-SDK-Version header. */
export const SDK_VERSION: string =
  typeof __PERMIT_SDK_VERSION__ === 'string' ? __PERMIT_SDK_VERSION__ : 'unknown';
