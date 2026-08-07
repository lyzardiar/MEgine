import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createAgentHttpServer,
  parseHttpServerArguments,
  removeOwnedHttpDiscoveryFile,
  validateHttpExecuteBody,
  validateHttpQueryBody,
  writeHttpDiscoveryFile,
} from '../../agent/http/server.mjs';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(editorRoot, '..', '..');
const httpServerPath = path.join(
  repositoryRoot,
  'packages',
  'agent',
  'http',
  'server.mjs',
);
const token = 'test-agent-http-token-123456';

async function listenTestServer(options) {
  const server = createAgentHttpServer({ token, ...options });
  server.listen({ host: '127.0.0.1', port: 0, exclusive: true });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  };
}

async function closeTestServer(server) {
  if (!server.listening) return;
  await new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

async function jsonRequest(origin, pathname, options = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
}

test('Agent HTTP validates startup arguments, payloads, and package entrypoint', () => {
  const discoveryFile = path.resolve('agent-http-test.json');
  assert.deepEqual(
    parseHttpServerArguments(
      ['--port', '4708', '--discovery-file', discoveryFile],
      {},
    ),
    {
      help: false,
      port: 4708,
      discoveryFile,
    },
  );
  assert.deepEqual(parseHttpServerArguments(['--help'], {}), { help: true });
  for (const argv of [
    ['--port', '-1'],
    ['--port', '65536'],
    ['--port', '1.5'],
    ['--port', '1', '--port', '2'],
    ['--discovery-file'],
    ['--unknown'],
  ]) {
    assert.throws(() => parseHttpServerArguments(argv, {}));
  }

  assert.deepEqual(validateHttpQueryBody({
    query: 'window.ui_snapshot',
    args: { windowLabel: 'main' },
  }), {
    query: 'window.ui_snapshot',
    args: { windowLabel: 'main' },
  });
  assert.deepEqual(validateHttpExecuteBody({
    command: 'history.undo',
    requestId: 'http:undo:1',
    options: { expectedSceneRevision: 7, screenshot: true },
  }), {
    command: 'history.undo',
    args: {},
    requestId: 'http:undo:1',
    options: { expectedSceneRevision: 7, screenshot: true },
  });
  assert.throws(
    () => validateHttpQueryBody({ query: 'editor.state', extra: true }),
    /not allowed/,
  );
  assert.throws(
    () => validateHttpExecuteBody({ command: 'history.undo' }),
    /requestId/,
  );

  const agentPackage = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, 'packages', 'agent', 'package.json'),
    'utf8',
  ));
  assert.equal(agentPackage.bin['mengine-agent-http'], './http/server.mjs');
  const help = spawnSync(process.execPath, [httpServerPath, '--help'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /POST \/v1\/execute/);
});

test('Agent HTTP discovery updates atomically and removes only its own record', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mengine-agent-http-test-'));
  try {
    const file = path.join(temporary, 'nested', 'agent-http.json');
    const first = {
      schemaVersion: 1,
      host: '127.0.0.1',
      port: 4708,
      token: 'first-token',
      pid: 10,
    };
    const second = {
      ...first,
      port: 4709,
      token: 'second-token',
      pid: 11,
    };
    writeHttpDiscoveryFile(file, first);
    writeHttpDiscoveryFile(file, second);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), second);
    assert.equal(removeOwnedHttpDiscoveryFile(file, first), false);
    assert.equal(fs.existsSync(file), true);
    assert.equal(removeOwnedHttpDiscoveryFile(file, second), true);
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('Agent HTTP exits if its discovery record cannot be published', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'mengine-agent-http-startup-'));
  try {
    const occupiedDirectory = path.join(temporary, 'occupied');
    fs.mkdirSync(occupiedDirectory);
    const failed = spawnSync(
      process.execPath,
      [httpServerPath, '--port', '0', '--discovery-file', occupiedDirectory],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5_000,
      },
    );
    assert.equal(failed.error, undefined);
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /"ok":false/);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('Agent HTTP serves authenticated bounded query and execute envelopes', async () => {
  const calls = [];
  const { server, origin } = await listenTestServer({
    maxBodyBytes: 512,
    query: async (query, args, options) => {
      calls.push({ operation: 'query', query, args, signal: options.signal });
      return { query, args };
    },
    execute: async (command, args, options) => {
      calls.push({ operation: 'execute', command, args, options });
      return { ok: true, data: { command } };
    },
  });
  try {
    const unauthorized = await fetch(`${origin}/v1/health`);
    assert.equal(unauthorized.status, 401);
    assert.equal((await unauthorized.json()).error.code, 'UNAUTHORIZED');

    const health = await jsonRequest(origin, '/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.service, 'mengine-agent-http');
    assert.equal(health.headers.get('cache-control'), 'no-store');

    const query = await jsonRequest(origin, '/v1/query', {
      method: 'POST',
      body: JSON.stringify({
        query: 'window.ui_snapshot',
        args: { windowLabel: 'main' },
      }),
    });
    assert.deepEqual(query, {
      status: 200,
      headers: query.headers,
      body: {
        ok: true,
        operation: 'query',
        id: 'window.ui_snapshot',
        data: {
          query: 'window.ui_snapshot',
          args: { windowLabel: 'main' },
        },
      },
    });

    const execute = await jsonRequest(origin, '/v1/execute', {
      method: 'POST',
      body: JSON.stringify({
        command: 'history.undo',
        args: {},
        requestId: 'http:undo:1',
        options: { screenshot: true, expectedSceneRevision: 9 },
      }),
    });
    assert.equal(execute.status, 200);
    assert.equal(execute.body.requestId, 'http:undo:1');
    assert.deepEqual(calls[1].options, {
      screenshot: true,
      expectedSceneRevision: 9,
      requestId: 'http:undo:1',
      signal: calls[1].options.signal,
    });
    assert.equal(calls[1].options.signal.aborted, false);

    const missingRequestId = await jsonRequest(origin, '/v1/execute', {
      method: 'POST',
      body: JSON.stringify({ command: 'history.undo' }),
    });
    assert.equal(missingRequestId.status, 400);
    assert.equal(missingRequestId.body.error.code, 'INVALID_ARGS');

    const wrongMediaType = await jsonRequest(origin, '/v1/query', {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'text/plain' },
    });
    assert.equal(wrongMediaType.status, 415);

    const tooLarge = await jsonRequest(origin, '/v1/query', {
      method: 'POST',
      body: JSON.stringify({ query: 'editor.state', args: { value: 'x'.repeat(600) } }),
    });
    assert.equal(tooLarge.status, 413);

    const wrongMethod = await jsonRequest(origin, '/v1/query');
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'POST');
  } finally {
    await closeTestServer(server);
  }
});

test('Agent HTTP exposes the same direct Figma preview and import workflows', async () => {
  const calls = [];
  const { server, origin } = await listenTestServer({
    figmaPreview: async (body, options) => {
      calls.push({ operation: 'preview', body, signal: options.signal });
      return { plan: { planRevision: 'figma-plan-v1-0000000000000000' } };
    },
    figmaImport: async (body, options) => {
      calls.push({ operation: 'import', body, signal: options.signal });
      return { result: { data: { root: 42 } } };
    },
  });
  try {
    const request = {
      url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
      componentMappings: { '9:9': 'button' },
    };
    const preview = await jsonRequest(origin, '/v1/figma/preview', {
      method: 'POST',
      body: JSON.stringify(request),
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.operation, 'figma-preview');

    const imported = await jsonRequest(origin, '/v1/figma/import', {
      method: 'POST',
      body: JSON.stringify({ ...request, requestId: 'http-figma-import' }),
    });
    assert.equal(imported.status, 200);
    assert.equal(imported.body.operation, 'figma-import');
    assert.equal(imported.body.data.result.data.root, 42);
    assert.deepEqual(calls.map((call) => call.operation), ['preview', 'import']);
    assert.equal(calls.every((call) => call.signal.aborted === false), true);
  } finally {
    await closeTestServer(server);
  }
});

test('Agent HTTP bounds active work and cancels a request when its client disconnects', async () => {
  let releaseSlow;
  let slowStartedResolve;
  const slowStarted = new Promise((resolve) => { slowStartedResolve = resolve; });
  let cancelStartedResolve;
  const cancelStarted = new Promise((resolve) => { cancelStartedResolve = resolve; });
  let cancelledResolve;
  const cancelled = new Promise((resolve) => { cancelledResolve = resolve; });
  const { server, origin } = await listenTestServer({
    maxActiveRequests: 1,
    query: async (query, _args, options) => {
      if (query === 'slow.query') {
        slowStartedResolve();
        return await new Promise((resolve) => { releaseSlow = resolve; });
      }
      if (query === 'cancel.query') {
        cancelStartedResolve();
        return await new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            cancelledResolve();
            const error = new Error('cancelled');
            error.name = 'AbortError';
            reject(error);
          }, { once: true });
        });
      }
      return {};
    },
  });
  try {
    const slowResponse = jsonRequest(origin, '/v1/query', {
      method: 'POST',
      body: JSON.stringify({ query: 'slow.query' }),
    });
    await slowStarted;
    const limited = await jsonRequest(origin, '/v1/query', {
      method: 'POST',
      body: JSON.stringify({ query: 'editor.state' }),
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.error.data.maxActiveRequests, 1);
    releaseSlow({ finished: true });
    assert.equal((await slowResponse).status, 200);

    const controller = new AbortController();
    const cancelledFetch = fetch(`${origin}/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'cancel.query' }),
      signal: controller.signal,
    });
    await cancelStarted;
    controller.abort();
    await assert.rejects(cancelledFetch, (error) => error?.name === 'AbortError');
    await cancelled;
  } finally {
    await closeTestServer(server);
  }
});

test('Agent HTTP rejects non-loopback Host headers before routing', async () => {
  const { server } = await listenTestServer({
    query: async () => ({}),
    execute: async () => ({}),
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const result = await new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1',
        port: address.port,
        path: '/v1/health',
        method: 'GET',
        headers: {
          Host: 'attacker.example',
          Authorization: `Bearer ${token}`,
        },
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
        }));
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(result.status, 403);
    assert.equal(result.body.error.code, 'INVALID_HOST');
  } finally {
    await closeTestServer(server);
  }
});
