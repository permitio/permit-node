import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, onTestFinished, test } from 'vitest';

import { discoverTestFiles, evaluateTestReport } from '#scripts/test-report.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sharedProject = { id: 'proj', key: 'provided-project', name: 'Provided Project' };

async function integrationFixture({ lostProjectReply = false, absenceStatus = 404 } = {}) {
  const projects = new Map([[sharedProject.key, sharedProject]]);
  const environments = new Map();
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
        const captured = { method: request.method, path, body };
        requests.push(captured);
        function reply(status, value) {
          captured.status = status;
          response.writeHead(status, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify(value));
        }
        if (path === '/v2/api-key/scope' && request.method === 'GET') {
          const token = request.headers.authorization;
          if (token === 'Bearer org-key') return reply(200, { organization_id: 'org' });
          if (token === 'Bearer project-key') {
            return reply(200, { organization_id: 'org', project_id: sharedProject.id });
          }
          if (token === 'Bearer env-key') {
            return reply(200, {
              organization_id: 'org',
              project_id: 'proj',
              environment_id: 'env',
            });
          }
          throw new Error('Unexpected loopback scope key');
        }
        if (path === '/v2/facts/proj/env/users' && request.method === 'GET') {
          expect(url.searchParams.get('search')).toMatch(/^absent-/);
          expect(url.searchParams.get('page')).toBe('1');
          expect(url.searchParams.get('per_page')).toBe('2');
          return reply(200, { data: [], total_count: 0 });
        }
        if (path === '/v2/projects' && request.method === 'POST') {
          expect(body.key).toMatch(/^node-proj-/);
          const project = { ...body, id: `id-${body.key}`, description: null };
          projects.set(project.key, project);
          if (lostProjectReply) return response.destroy();
          return reply(201, project);
        }
        const segments = path.split('/').filter(Boolean);
        if (segments[0] === 'v2' && segments[1] === 'projects') {
          const project = [...projects.values()].find((value) =>
            [value.key, value.id].includes(segments[2]),
          );
          if (segments.length === 3) {
            if (request.method === 'GET') {
              return reply(project ? 200 : absenceStatus, project ?? { message: 'absent' });
            }
            if (request.method === 'DELETE') {
              expect(segments[2]).not.toBe(sharedProject.key);
              expect(segments[2]).not.toBe(sharedProject.id);
              projects.delete(segments[2]);
              for (const key of environments.keys()) {
                if (key.startsWith(`${segments[2]}/`)) environments.delete(key);
              }
              return reply(204, undefined);
            }
          }
          if (project && segments[3] === 'envs') {
            const key = `${project.key}/${segments[4]}`;
            if (request.method === 'POST' && segments.length === 4) {
              expect(body.key).toMatch(/^node-env-/);
              const environment = {
                ...body,
                id: `id-${body.key}`,
                project_id: project.id,
                description: null,
              };
              environments.set(`${project.key}/${body.key}`, environment);
              return reply(201, environment);
            }
            if (request.method === 'GET' && segments.length === 4) {
              return reply(
                200,
                [...environments.entries()]
                  .filter(([entry]) => entry.startsWith(`${project.key}/`))
                  .map(([, value]) => value),
              );
            }
            if (request.method === 'DELETE' && segments.length === 5) {
              environments.delete(key);
              return reply(204, undefined);
            }
            if (request.method === 'GET' && segments.length === 5) {
              const environment = environments.get(key);
              return reply(environment ? 200 : absenceStatus, environment ?? { message: 'absent' });
            }
          }
          if (!project && segments[3] === 'envs') {
            return reply(absenceStatus, { message: 'project absent' });
          }
        }
        throw new Error(`Unqueued integration fixture request: ${request.method} ${path}`);
      } catch (error) {
        failures.push(error);
        response.writeHead(500).end('{"message":"integration fixture failed"}');
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
  return { url: `http://127.0.0.1:${server.address().port}`, projects, environments, requests };
}

async function runIntegration(fixture, optionalKeys = {}, testName) {
  const directory = mkdtempSync(join(tmpdir(), 'permit-integration-fixture-'));
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
      'integration',
      '--reporter=json',
      `--outputFile=${output}`,
      '--maxWorkers=1',
      ...(testName ? ['--testNamePattern', testName] : []),
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        PDP_API_KEY: 'env-key',
        PERMIT_API_KEY: 'env-key',
        ORG_PDP_API_KEY: '',
        PROJECT_PDP_API_KEY: '',
        PDP_CONTROL_PLANE: fixture.url,
        PDP_URL: fixture.url,
        NO_PROXY: '127.0.0.1',
        ...optionalKeys,
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

test.each(['', '  '])(
  'absent optional keys %j report unavailable while the real environment suite executes',
  async (key) => {
    const fixture = await integrationFixture();
    const run = await runIntegration(fixture, { ORG_PDP_API_KEY: key, PROJECT_PDP_API_KEY: key });
    expect(run.code, run.diagnostics).toBe(0);
    const summary = evaluateTestReport(run.report, {
      root,
      expectedFiles: discoverTestFiles(root, ['integration']),
      env: {},
    });
    expect(summary).toMatchObject({ status: 'PARTIAL', executed: 1, errors: [] });
    expect(summary.limitations).toHaveLength(2);
    expect(summary.limitations.every((entry) => entry.status === 'UNAVAILABLE')).toBe(true);
    expect(fixture.requests.map(({ method, path }) => `${method} ${path}`)).toStrictEqual([
      'GET /v2/api-key/scope',
      'GET /v2/facts/proj/env/users',
    ]);
  },
  20_000,
);

test('a supplied wrong-scope key fails without writing any fixture', async () => {
  const fixture = await integrationFixture();
  const run = await runIntegration(fixture, { ORG_PDP_API_KEY: 'env-key' });
  expect(run.code, run.diagnostics).toBe(1);
  expect(run.report.numFailedTests).toBe(1);
  expect(fixture.requests.every((request) => request.method === 'GET')).toBe(true);
  expect(fixture.projects.size).toBe(1);
}, 20_000);

test('owned projects and environments are removed and verified without deleting the supplied project', async () => {
  const fixture = await integrationFixture();
  const run = await runIntegration(fixture, {
    ORG_PDP_API_KEY: 'org-key',
    PROJECT_PDP_API_KEY: 'project-key',
  });
  expect(run.code, run.diagnostics).toBe(0);
  expect(run.report.numPassedTests).toBe(3);
  expect([...fixture.projects.values()]).toStrictEqual([sharedProject]);
  expect(fixture.environments.size).toBe(0);
  const removed = fixture.requests.filter((request) => request.method === 'DELETE');
  expect(removed).toHaveLength(5);
  for (const request of removed) {
    expect(
      fixture.requests
        .slice(fixture.requests.indexOf(request) + 1)
        .some((read) => read.method === 'GET' && read.path === request.path && read.status === 404),
    ).toBe(true);
  }
}, 20_000);

test('project cleanup is registered before a committed create loses its response', async () => {
  const fixture = await integrationFixture({ lostProjectReply: true });
  const run = await runIntegration(
    fixture,
    { ORG_PDP_API_KEY: 'org-key' },
    'environment creation with org level api key',
  );
  expect(run.code, run.diagnostics).toBe(1);
  expect([...fixture.projects.values()]).toStrictEqual([sharedProject]);
  const create = fixture.requests.find((request) => request.method === 'POST');
  expect(create).toBeDefined();
  const path = `/v2/projects/${create.body.key}`;
  expect(fixture.requests.slice(-2).map(({ method, path }) => `${method} ${path}`)).toStrictEqual([
    `DELETE ${path}`,
    `GET ${path}`,
  ]);
}, 20_000);

test('non-404 cleanup verification errors fail the actual integration suite', async () => {
  const fixture = await integrationFixture({ absenceStatus: 403 });
  const run = await runIntegration(
    fixture,
    { ORG_PDP_API_KEY: 'org-key' },
    'environment creation with org level api key',
  );
  expect(run.code, run.diagnostics).toBe(1);
  expect(run.report.numFailedTests).toBe(1);
  expect([...fixture.projects.values()]).toStrictEqual([sharedProject]);
  expect(
    run.report.testResults
      .flatMap((file) => file.assertionResults)
      .flatMap((entry) => entry.failureMessages)
      .join('\n'),
  ).toContain('cleanup failed:');
}, 20_000);
