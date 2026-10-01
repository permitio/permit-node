import { execFile, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const repo = process.cwd();
const fixtures = resolve('scripts/fixtures/migration');
const run = promisify(execFile);
let directory;
let consumer;
let skill;
let artifact;

function command(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', timeout: 120_000 });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Migration fixture ${executable} ${args[0]} failed: ` +
        `${result.error?.message ?? result.stderr + result.stdout}`,
    );
  }
  return result.stdout;
}

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'permit-migration-package-'));
  consumer = join(directory, 'consumer');
  await mkdir(consumer);
  const suppliedArtifact = process.env['PERMIT_PACKED_ARTIFACT'];
  if (!suppliedArtifact) command('pnpm', ['pack', '--pack-destination', directory], repo);
  const sdkManifest = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
  artifact = suppliedArtifact
    ? resolve(suppliedArtifact)
    : join(directory, `permitio-${sdkManifest.version}.tgz`);
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      dependencies: { permitio: `file:${artifact}` },
    }),
  );
  await writeFile(
    join(consumer, 'pnpm-workspace.yaml'),
    'packages: []\nignoreScripts: true\nminimumReleaseAge: 1440\nautoInstallPeers: false\n',
  );
  command(
    'pnpm',
    ['install', '--lockfile-only', '--no-frozen-lockfile', '--ignore-scripts'],
    consumer,
  );
  command('pnpm', ['audit', '--audit-level=moderate'], consumer);
  command('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], consumer);
  await cp(join(fixtures, 'after', 'consumer.mts'), join(consumer, 'consumer.mts'));
  await cp(join(fixtures, 'after', 'consumer.cts'), join(consumer, 'consumer.cts'));
  await cp(join(fixtures, 'types.mts'), join(consumer, 'types.mts'));
  await cp(join(fixtures, 'types.cts'), join(consumer, 'types.cts'));
  const guide = await readFile(join(repo, 'MIGRATION.md'), 'utf8');
  const complete = /```ts\n([\s\S]*?)\n```/u.exec(guide);
  if (!complete) throw new Error('Complete migration guide example is missing.');
  await writeFile(join(consumer, 'guide.mts'), complete[1]);
  await writeFile(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        noPropertyAccessFromIndexSignature: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        skipLibCheck: false,
        typeRoots: [join(repo, 'node_modules', '@types')],
        types: ['node'],
        outDir: 'compiled',
      },
      include: ['*.mts', '*.cts'],
    }),
  );
  command('pnpm', ['exec', 'tsc', '-p', join(consumer, 'tsconfig.json')], repo);
  const packedSkill = join(consumer, 'node_modules/permitio/skills/permit-node-3-migration');
  skill = join(directory, 'copied-skill');
  await cp(packedSkill, skill, { recursive: true });
  await cp(join(skill, 'compiler-lock.yaml'), join(skill, 'pnpm-lock.yaml'));
  command('pnpm', ['audit', '--audit-level=moderate'], skill);
  command('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], skill);
}, 300_000);

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true });
});

describe('packed customer migration tooling', () => {
  it('ships an isolated compiler without adding SDK runtime dependencies', async () => {
    const manifest = JSON.parse(await readFile(join(skill, 'package.json'), 'utf8'));
    expect(manifest.dependencies).toEqual({ typescript: '6.0.3' });
    const require = createRequire(pathToFileURL(join(skill, 'package.json')));
    const compiler = require.resolve('typescript');
    expect(compiler.startsWith(join(await realpath(skill), 'node_modules'))).toBe(true);
    expect(require('typescript').version).toBe('6.0.3');
    const lock = await readFile(join(skill, 'pnpm-lock.yaml'), 'utf8');
    expect(lock).toContain('y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38');
    const sdk = JSON.parse(await readFile(join(consumer, 'node_modules/permitio/package.json')));
    const source = JSON.parse(await readFile(join(repo, 'package.json'), 'utf8'));
    expect(sdk.version).toBe(source.version);
    expect(Object.keys(sdk.dependencies)).toEqual(['axios', 'lodash', 'pino', 'pino-pretty']);
    const files = command('tar', ['-tzf', artifact], directory);
    expect(files).not.toContain('/node_modules/');
    expect(files).not.toContain('/tools/compiler/');
  });

  it('detects old sites and compiles its emitted result migrations', async () => {
    const result = spawnSync(
      process.execPath,
      [join(skill, 'scripts/scan.mjs'), join(fixtures, 'before')],
      { cwd: directory, encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('COMPLETE');
    expect(report.findings.filter((item) => item.id === 'A1')).toHaveLength(29);
    expect(new Set(report.findings.map((item) => item.id))).toEqual(
      new Set(['A1', 'A3', 'P1', 'C1']),
    );
    expect(result.stderr).toBe('');
    const listAction = report.findings.find((item) => item.action.includes('api.users.list('));
    const syncAction = report.findings.find((item) => item.action.includes('api.users.sync('));
    expect(listAction.action).toContain('(await api.users.list()).data');
    expect(syncAction.action).toContain('(await api.users.sync(data)).user');
    const listExpression = listAction.action.slice(4).split(';')[0];
    const syncExpression = syncAction.action.slice(4).split(';')[0];
    const migrated = [
      "import type { IPermitApi } from 'permitio';",
      'declare const api: IPermitApi;',
      "declare const data: Parameters<IPermitApi['users']['sync']>[0];",
      `const users = ${listExpression};`,
      `const user = ${syncExpression};`,
      'void [users, user];',
    ].join('\n');
    await writeFile(join(consumer, 'emitted-hints.mts'), migrated);
    command('pnpm', ['exec', 'tsc', '-p', join(consumer, 'tsconfig.json')], repo);
  });

  it('keeps the migrated strict dual-entry fixture clean within declared syntax coverage', () => {
    const result = spawnSync(
      process.execPath,
      [join(skill, 'scripts/scan.mjs'), join(fixtures, 'after')],
      { cwd: directory, encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.status).toBe('COMPLETE');
    expect(report.findings).toEqual([]);
    expect(report.scanned).toEqual(['consumer.cts', 'consumer.mts', 'package.json']);
  });

  it('fails clearly when the copied compiler prerequisite is absent', async () => {
    const bare = join(directory, 'bare-skill');
    await cp(join(consumer, 'node_modules/permitio/skills/permit-node-3-migration'), bare, {
      recursive: true,
    });
    const result = spawnSync(
      process.execPath,
      [join(bare, 'scripts/scan.mjs'), join(fixtures, 'after')],
      { cwd: directory, encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Cannot find package');
    expect(result.stdout).toBe('');
  });

  it('keeps all stable IDs in the guide, skill reference and unreleased notes', async () => {
    const docs = await Promise.all(
      ['MIGRATION.md', 'CHANGELOG.md', 'skills/permit-node-3-migration/references/changes.md'].map(
        (name) => readFile(join(repo, name), 'utf8'),
      ),
    );
    const headings = [...docs[0].matchAll(/^### ([A-Z]\d+) —/gmu)].map((match) => match[1]);
    expect(headings).toHaveLength(24);
    expect(new Set([...docs[2].matchAll(/^### ([A-Z]\d+) —/gmu)].map((match) => match[1]))).toEqual(
      new Set(headings),
    );
    expect(
      new Set([...docs[1].matchAll(/^- \*\*([A-Z]\d+)\*\*/gmu)].map((match) => match[1])),
    ).toEqual(new Set(headings));
    const reference = await readFile(join(skill, 'references/changes.md'), 'utf8');
    const link = /\[the customer migration skill\]\(([^)]+)\)/u.exec(reference);
    expect(link).not.toBeNull();
    const linkedSkill = await readFile(resolve(skill, 'references', link[1]), 'utf8');
    expect(linkedSkill).toContain('# Permit Node SDK 3.0 migration');
    const { scan } = await import(pathToFileURL(join(skill, 'scripts/scan.mjs')).href);
    const report = await scan(join(fixtures, 'before'));
    for (const item of report.findings) expect(headings).toContain(item.id);
  });

  it.each(['esm', 'commonjs'])(
    'runs strict %s consumer through meaningful real loopback requests',
    async (entry) => {
      const requests = [];
      const failures = [];
      const user = {
        id: 'id',
        key: 'customer',
        email: null,
        first_name: null,
        last_name: null,
        attributes: {},
        roles: [],
        associated_tenants: [],
      };
      const rule = {
        id: 'rule-id',
        user_set: 'set',
        resource_set: 'resource-set',
        permission: 'document:read',
        tenant: null,
      };
      const server = createServer(async (request, response) => {
        let text = '';
        for await (const chunk of request) text += chunk;
        const path = new URL(request.url, 'http://localhost');
        requests.push({
          method: request.method,
          path: path.pathname,
          query: [...path.searchParams],
          auth: request.headers.authorization,
          body: text ? JSON.parse(text) : undefined,
        });
        let reply;
        const method = request.method;
        if (method === 'GET' && path.pathname === '/v2/api-key/scope') {
          reply = { organization_id: 'org', project_id: 'project', environment_id: 'env' };
        } else if (method === 'GET' && path.pathname === '/v2/facts/project/env/users') {
          reply = { data: [user], total_count: 1 };
        } else if (method === 'PUT' && path.pathname === '/v2/facts/project/env/users/customer') {
          reply = user;
        } else if (method === 'POST' && path.pathname === '/v2/facts/project/env/set_rules') {
          reply = [rule];
        } else if (method === 'GET' && path.pathname === '/v2/facts/project/env/set_rules') {
          reply = [rule];
        } else if (
          method === 'DELETE' &&
          path.pathname === '/v2/facts/project/env/role_assignments'
        ) {
          reply = {};
        } else if (method === 'POST' && path.pathname === '/allowed') {
          reply = { allow: true };
        } else {
          failures.push(`${method} ${path.pathname}`);
          response.writeHead(500).end();
          return;
        }
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(reply));
      });
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const url = `http://127.0.0.1:${server.address().port}`;
      const runner =
        entry === 'esm'
          ? "import run from './compiled/consumer.mjs'; console.log(JSON.stringify(await run()));"
          : "const run = require('./compiled/consumer.cjs'); " +
            'run().then(r=>console.log(JSON.stringify(r)));';
      try {
        const args = entry === 'esm' ? ['--input-type=module', '-e', runner] : ['-e', runner];
        const result = await run(process.execPath, args, {
          cwd: consumer,
          timeout: 10_000,
          env: {
            ...process.env,
            PERMIT_API_KEY: 'opaque-example',
            PERMIT_API_URL: url,
            PERMIT_PDP_URL: url,
          },
        });
        expect(JSON.parse(result.stdout)).toEqual({
          users: [user],
          user,
          created: false,
          rule,
          rules: [rule],
          allow: true,
        });
        expect(result.stderr).toBe('');
        expect(failures).toEqual([]);
        expect(requests).toHaveLength(7);
        expect(requests.map((item) => `${item.method} ${item.path}`)).toEqual([
          'GET /v2/api-key/scope',
          'GET /v2/facts/project/env/users',
          'PUT /v2/facts/project/env/users/customer',
          'POST /v2/facts/project/env/set_rules',
          'GET /v2/facts/project/env/set_rules',
          'DELETE /v2/facts/project/env/role_assignments',
          'POST /allowed',
        ]);
        expect(requests.every((item) => item.auth === 'Bearer opaque-example')).toBe(true);
        expect(requests[1].query).toEqual([
          ['page', '2'],
          ['per_page', '3'],
        ]);
        expect(requests[2].body).toEqual({ key: 'customer' });
        expect(requests[3].body).toEqual({
          user_set: 'set',
          resource_set: 'resource-set',
          permission: 'document:read',
        });
        expect(requests[4].query).toEqual([
          ['permission', 'read'],
          ['page', '1'],
          ['per_page', '100'],
        ]);
        expect(requests[5].body).toEqual({ user: 'customer', role: 'reader', tenant: 'tenant' });
        expect(requests[6].body).toEqual({
          user: { key: 'customer' },
          action: 'read',
          resource: { type: 'document', tenant: 'tenant' },
          context: {},
        });
      } finally {
        server.closeAllConnections();
        await new Promise((done) => server.close(done));
      }
    },
  );
});
