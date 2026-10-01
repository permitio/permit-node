import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, onTestFinished, test } from 'vitest';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const resourcesPath = '/v2/schema/proj/env/resources';
const usersPath = '/v2/facts/proj/env/users';
const bulkUsersPath = '/v2/facts/proj/env/bulk/users';
const tuplesPath = '/v2/facts/proj/env/relationship_tuples';

async function bulkFixture(fault) {
  const resources = new Map();
  const users = new Map();
  const instances = new Set();
  const tuples = [];
  const requests = [];
  const failures = [];
  const server = createServer((request, response) => {
    let text = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      text += chunk;
    });
    request.on('end', () => {
      try {
        const url = new URL(request.url, 'http://127.0.0.1');
        const path = url.pathname;
        const body = text ? JSON.parse(text) : undefined;
        const captured = { method: request.method, path, body, query: [...url.searchParams] };
        requests.push(captured);
        expect(request.headers.authorization).toBe('Bearer fixture-key');
        expect(request.headers['x-permit-sdk-version']).toMatch(/^node:/);
        if (body) expect(request.headers['content-type']).toContain('application/json');
        function reply(status, value) {
          captured.status = status;
          response.writeHead(status, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(value));
        }
        if (path === '/v2/api-key/scope' && request.method === 'GET') {
          return reply(200, {
            organization_id: 'org',
            project_id: 'proj',
            environment_id: 'env',
          });
        }
        if (path === resourcesPath && request.method === 'POST') {
          expect(body.key).toMatch(/^bulk_(folders|docs)_/);
          expect(body.actions).toStrictEqual({ read: {} });
          resources.set(body.key, body);
          return reply(201, { ...body, id: body.key });
        }
        if (path.startsWith(`${resourcesPath}/`)) {
          const [, key, child] = path.slice(resourcesPath.length).split('/');
          if (child === 'relations' && request.method === 'POST') {
            expect(resources.has(key)).toBe(true);
            expect(body.key).toBe('parent');
            expect(resources.has(body.subject_resource)).toBe(true);
            return reply(201, { ...body, id: 'relation', object_resource: key });
          }
          if (!child && request.method === 'DELETE') {
            resources.delete(key);
            for (const instance of instances) {
              if (instance.startsWith(`${key}:`)) instances.delete(instance);
            }
            for (let index = tuples.length - 1; index >= 0; index--) {
              if (
                [tuples[index].subject, tuples[index].object].some((id) => id.startsWith(`${key}:`))
              ) {
                tuples.splice(index, 1);
              }
            }
            return reply(204, undefined);
          }
          if (!child && request.method === 'GET') {
            return reply(
              resources.has(key) ? 200 : 404,
              resources.get(key) ?? { message: 'absent' },
            );
          }
        }
        if (path === '/v2/facts/proj/env/resource_instances' && request.method === 'POST') {
          expect(resources.has(body.resource)).toBe(true);
          expect(body.tenant).toBe('default');
          instances.add(`${body.resource}:${body.key}`);
          return reply(201, { ...body, id: `${body.resource}:${body.key}` });
        }
        if (path === `${tuplesPath}/bulk` && request.method === 'POST') {
          expect(Object.keys(body)).toStrictEqual(['operations']);
          expect(body.operations).toHaveLength(2);
          for (const [index, tuple] of body.operations.entries()) {
            expect(instances.has(tuple.subject)).toBe(true);
            expect(instances.has(tuple.object)).toBe(true);
            expect(tuple.relation).toBe('parent');
            expect(tuple.tenant).toBe('default');
            if (fault !== 'missing tuples') tuples.push({ ...tuple, id: `tuple-${index}` });
          }
          return reply(200, {});
        }
        if (path === tuplesPath && request.method === 'GET') {
          expect([...url.searchParams.keys()].sort()).toStrictEqual([
            'object',
            'relation',
            'subject',
            'tenant',
          ]);
          const values = tuples.filter((tuple) =>
            [...url.searchParams].every(([key, value]) => tuple[key] === value),
          );
          return reply(
            200,
            fault === 'tuple fields' ? values.map((tuple) => ({ ...tuple, id: null })) : values,
          );
        }
        if (path === bulkUsersPath) {
          if (request.method === 'POST' || request.method === 'PUT') {
            expect(Object.keys(body)).toStrictEqual(['operations']);
            expect(body.operations).toHaveLength(2);
            for (const user of body.operations) {
              expect(user.key).toMatch(/^bulk_user_maya_/);
              if (request.method === 'PUT') expect(['1', '2']).toContain(user.first_name);
              if (fault === 'missing users' && request.method === 'POST') continue;
              if (fault === 'unchanged replacement' && request.method === 'PUT') continue;
              users.set(user.key, { ...user, id: user.key });
            }
            return reply(200, {});
          }
          if (request.method === 'DELETE') {
            expect(Object.keys(body)).toStrictEqual(['idents']);
            expect(body.idents).toHaveLength(2);
            for (const key of body.idents) {
              expect(users.has(key)).toBe(true);
              users.delete(key);
            }
            return reply(200, {});
          }
        }
        if (path === usersPath && request.method === 'GET') {
          expect([...url.searchParams.keys()]).toStrictEqual(['search']);
          const search = url.searchParams.get('search');
          expect(search).toMatch(/^bulk_user_maya_/);
          const data = [...users.values()].filter((user) => user.key.includes(search));
          return reply(200, { data, total_count: data.length });
        }
        if (path.startsWith(`${usersPath}/`)) {
          const key = path.slice(usersPath.length + 1);
          expect(key).toMatch(/^bulk_user_maya_/);
          if (request.method === 'DELETE') {
            const deleted = users.delete(key);
            return reply(deleted ? 204 : 404, deleted ? undefined : { message: 'absent' });
          }
          if (request.method === 'GET') {
            return reply(users.has(key) ? 200 : 404, users.get(key) ?? { message: 'absent' });
          }
        }
        throw new Error(`Unqueued bulk fixture request: ${request.method} ${path}`);
      } catch (error) {
        failures.push(error);
        response.writeHead(500).end('{"message":"bulk fixture failed"}');
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  onTestFinished(async () => {
    await new Promise((resolve) => server.close(resolve));
    expect(failures).toStrictEqual([]);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    resources,
    users,
    instances,
    tuples,
  };
}

async function runBulk(fixture) {
  const directory = mkdtempSync(join(tmpdir(), 'permit-bulk-fixture-'));
  const output = join(directory, 'report.json');
  onTestFinished(() => {
    unlinkSync(output);
    rmdirSync(directory);
  });
  const child = spawn(
    process.execPath,
    [
      join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--project',
      'e2e',
      'src/tests/e2e/bulk.e2e.spec.ts',
      '--testTimeout=2000',
      '--hookTimeout=5000',
      '--maxWorkers=1',
      '--reporter=json',
      `--outputFile=${output}`,
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PDP_API_KEY: 'fixture-key',
        PDP_CONTROL_PLANE: fixture.url,
        PDP_URL: fixture.url,
        NO_PROXY: '127.0.0.1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let diagnostics = '';
  child.stdout.on('data', (chunk) => {
    diagnostics += chunk;
  });
  child.stderr.on('data', (chunk) => {
    diagnostics += chunk;
  });
  const timer = setTimeout(() => child.kill(), 15_000);
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  }).finally(() => clearTimeout(timer));
  return { code, diagnostics, report: JSON.parse(readFileSync(output, 'utf8')) };
}

function expectClean(fixture) {
  expect(fixture.resources.size).toBe(0);
  expect(fixture.users.size).toBe(0);
  expect(fixture.instances.size).toBe(0);
  expect(fixture.tuples).toStrictEqual([]);
  for (const request of fixture.requests.filter(
    (entry) => entry.method === 'DELETE' && entry.path !== bulkUsersPath,
  )) {
    expect(
      fixture.requests
        .slice(fixture.requests.indexOf(request) + 1)
        .some((read) => read.method === 'GET' && read.path === request.path && read.status === 404),
    ).toBe(true);
  }
}

test('the actual bulk suite proves persisted tuples, create, replace, delete and cleanup', async () => {
  const fixture = await bulkFixture();
  const run = await runBulk(fixture);
  expect(run.code, run.diagnostics).toBe(0);
  expect(run.report).toMatchObject({ success: true, numPassedTests: 4, numPendingTests: 0 });
  expect(fixture.requests).toHaveLength(33);
  expect(fixture.requests.filter((request) => request.path === '/v2/api-key/scope')).toHaveLength(
    1,
  );
  expect(
    fixture.requests.filter((request) => request.method === 'GET' && request.path === tuplesPath),
  ).toHaveLength(2);
  expect(
    fixture.requests.filter((request) => request.method === 'GET' && request.path === usersPath),
  ).toHaveLength(6);
  expectClean(fixture);
}, 20_000);

test.each([
  ['missing tuples', 'Bulk relationship tuples test'],
  ['missing users', 'Bulk users test'],
  ['unchanged replacement', 'Bulk users replace test'],
  ['tuple fields', 'Bulk relationship tuples test'],
])(
  'an accepted bulk write with %s fails the actual suite and still cleans up',
  async (fault, failedTest) => {
    const fixture = await bulkFixture(fault);
    const run = await runBulk(fixture);
    expect(run.code, run.diagnostics).toBe(1);
    expect(run.report).toMatchObject({ success: false, numFailedTests: 1 });
    const failures = run.report.testResults
      .flatMap((file) => file.assertionResults)
      .filter((entry) => entry.status === 'failed');
    expect(failures.map((entry) => entry.fullName)).toStrictEqual([failedTest]);
    const messages = failures.flatMap((entry) => entry.failureMessages).join('\n');
    expect(messages).toMatch(fault === 'tuple fields' ? /string|String/ : /timed out/);
    expectClean(fixture);
  },
  20_000,
);
