import { readFile, rm } from 'node:fs/promises';

import { build } from 'esbuild';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await rm('build', { recursive: true, force: true });
for (const format of ['cjs', 'esm']) {
  await build({
    entryPoints: ['src/index.ts'],
    tsconfig: 'tsconfig.build.json',
    bundle: true,
    packages: 'external',
    platform: 'node',
    target: 'node22',
    format,
    outfile: format === 'cjs' ? 'build/index.js' : 'build/index.mjs',
    // src/version.ts: the SDK's own version, not the host application's npm_package_version.
    define: { __PERMIT_SDK_VERSION__: JSON.stringify(version) },
  });
}
