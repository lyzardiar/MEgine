import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BoundedNdjsonDecoder,
  BoundedWriteQueue,
  incomingMessageError,
  negotiateProtocolVersion,
  rpcOnce,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '../../agent/mcp/server.mjs';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(editorRoot, '..', '..');
const serverPath = path.join(repositoryRoot, 'packages', 'agent', 'mcp', 'server.mjs');

async function runStdioSession(lines) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      MENGINE_AGENT_BRIDGE_FILE: path.join(
        repositoryRoot,
        '.missing-agent-bridge-for-protocol-test.json',
      ),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  child.stdin.end(`${lines.join('\n')}\n`);
  const [exitCode] = await once(child, 'exit');
  assert.equal(exitCode, 0, stderr);

  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('MCP negotiates every supported protocol version and falls back to the latest', () => {
  assert.equal(SUPPORTED_PROTOCOL_VERSIONS[0], '2025-11-25');
  for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
    assert.equal(negotiateProtocolVersion(version), version);
  }
  assert.equal(negotiateProtocolVersion('2099-01-01'), SUPPORTED_PROTOCOL_VERSIONS[0]);
  assert.equal(negotiateProtocolVersion(undefined), SUPPORTED_PROTOCOL_VERSIONS[0]);
});

test('MCP rejects malformed request envelopes before dispatch', () => {
  assert.equal(incomingMessageError(null), 'Message must be a JSON object');
  assert.equal(incomingMessageError([]), 'Message must be a JSON object');
  assert.equal(
    incomingMessageError({ jsonrpc: '1.0', id: 1, method: 'ping' }),
    'jsonrpc must be "2.0"',
  );
  assert.equal(
    incomingMessageError({ jsonrpc: '2.0', id: null, method: 'ping' }),
    'id must be a string or safe integer',
  );
  assert.equal(
    incomingMessageError({ jsonrpc: '2.0', id: 1, method: 'ping', params: [] }),
    'params must be an object',
  );
  assert.equal(incomingMessageError({ jsonrpc: '2.0', id: 1, method: 'ping' }), null);
});

test('MCP stdio decoder bounds fragmented lines and recovers after overflow', () => {
  const lines = [];
  const overflows = [];
  const decoder = new BoundedNdjsonDecoder(5, {
    onLine: (line) => lines.push(line),
    onOverflow: (limit) => overflows.push(limit),
  });

  decoder.write(Buffer.from('one\r\nab'));
  decoder.write(Buffer.from('c\n123456\nok'));
  decoder.end();

  assert.deepEqual(lines, ['one', 'abc', 'ok']);
  assert.deepEqual(overflows, [5]);
});

test('MCP stdout queue serializes writes and enforces its byte budget', async () => {
  const writes = [];
  const callbacks = [];
  const overflows = [];
  const queue = new BoundedWriteQueue({
    write(value, callback) {
      writes.push(value);
      callbacks.push(callback);
    },
  }, 9, {
    onOverflow: (details) => overflows.push(details),
  });

  assert.equal(queue.enqueue('1234'), true);
  assert.equal(queue.enqueue('56789'), true);
  assert.equal(queue.enqueue('x'), false);
  assert.deepEqual(writes, ['1234']);
  assert.equal(queue.queuedBytes, 9);
  assert.equal(queue.idle, false);
  assert.deepEqual(overflows, [{
    byteLength: 1,
    queuedBytes: 9,
    maxQueuedBytes: 9,
  }]);

  callbacks.shift()();
  await Promise.resolve();
  assert.deepEqual(writes, ['1234', '56789']);
  callbacks.shift()();
  await Promise.resolve();
  assert.equal(queue.queuedBytes, 0);
  assert.equal(queue.idle, true);
});

test('MCP bridge timeout closes the socket so native request slots are released', async () => {
  const sent = [];
  const closed = [];
  const socket = {
    readyState: WebSocket.OPEN,
    send(message) {
      sent.push(JSON.parse(message));
    },
    close(code, reason) {
      closed.push({ code, reason });
      this.readyState = WebSocket.CLOSING;
    },
  };

  await assert.rejects(
    rpcOnce(
      { socket, discovery: { port: 4707, token: 'secret', pid: 42 } },
      'query',
      { query: 'events.wait', args: { afterSequence: 0 } },
      5,
    ),
    (error) => {
      assert.equal(error.name, 'BridgeConnectionError');
      assert.equal(error.sent, true);
      assert.match(error.message, /timed out \(query\)/);
      return true;
    },
  );
  assert.equal(sent.length, 1);
  assert.deepEqual(closed, [{
    code: 1011,
    reason: 'AgentBridge request timed out',
  }]);
});

test('MCP bridge cancellation releases one request without closing its shared socket', async () => {
  const sent = [];
  const closed = [];
  const controller = new AbortController();
  const socket = {
    readyState: WebSocket.OPEN,
    send(message) {
      sent.push(JSON.parse(message));
    },
    close(code, reason) {
      closed.push({ code, reason });
      this.readyState = WebSocket.CLOSING;
    },
  };

  const pending = rpcOnce(
    { socket, discovery: { port: 4707, token: 'secret', pid: 42 } },
    'query',
    { query: 'events.wait', args: { afterSequence: 0 } },
    1_000,
    controller.signal,
  );
  controller.abort();

  await assert.rejects(
    pending,
    (error) => error?.name === 'McpRequestCancelledError',
  );
  assert.equal(sent.length, 2);
  assert.equal(sent[0].method, 'query');
  assert.deepEqual(sent[1], {
    jsonrpc: '2.0',
    method: 'cancel',
    params: { requestId: sent[0].id },
  });
  assert.deepEqual(closed, []);
});

test('MCP stdio serves negotiated initialization, resource templates, and protocol errors', async () => {
  const responses = await runStdioSession([
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'protocol-test', version: '1.0.0' },
      },
    }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/templates/list',
      params: {},
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'read_asset_text',
        arguments: { path: '   ' },
      },
    }),
    '{"jsonrpc":"2.0",',
    JSON.stringify({ jsonrpc: '2.0', id: null, method: 'ping' }),
    JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }),
  ]);

  assert.equal(responses.length, 6);
  assert.equal(responses[0].id, 1);
  assert.equal(responses[0].result.protocolVersion, '2025-11-25');
  assert.deepEqual(responses[0].result.capabilities.prompts, {});
  assert.match(responses[0].result.instructions, /background-safe/);
  assert.deepEqual(responses[1], {
    jsonrpc: '2.0',
    id: 2,
    result: { resourceTemplates: [] },
  });
  assert.equal(responses[2].id, 4);
  assert.equal(responses[2].result.isError, true);
  const toolError = JSON.parse(responses[2].result.content[0].text);
  assert.equal(toolError.error.code, 'INVALID_ARGS');
  assert.ok(toolError.error.data.issues.includes('$.path does not match the required pattern'));
  assert.deepEqual(responses[3], {
    jsonrpc: '2.0',
    id: null,
    error: { code: -32700, message: 'Parse error' },
  });
  assert.equal(responses[4].id, null);
  assert.equal(responses[4].error.code, -32600);
  assert.equal(responses[4].error.data.reason, 'id must be a string or safe integer');
  assert.deepEqual(responses[5], { jsonrpc: '2.0', id: 3, result: {} });
});

test('MCP stdio lists and renders safe workflow prompts with protocol errors', async () => {
  const responses = await runStdioSession([
    JSON.stringify({
      jsonrpc: '2.0',
      id: 10,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'prompt-test', version: '1.0.0' },
      },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 11,
      method: 'prompts/list',
      params: {},
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 12,
      method: 'prompts/get',
      params: {
        name: 'create_ui_button',
        arguments: { label: 'Launch', parentEntity: '42' },
      },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 13,
      method: 'prompts/get',
      params: {
        name: 'inspect_and_fix',
        arguments: {},
      },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 14,
      method: 'prompts/get',
      params: {
        name: 'missing_prompt',
      },
    }),
    JSON.stringify({
      jsonrpc: '2.0',
      id: 15,
      method: 'tools/list',
      params: {},
    }),
  ]);

  assert.equal(responses.length, 6);
  assert.deepEqual(responses[0].result.capabilities.prompts, {});
  assert.deepEqual(
    responses[1].result.prompts.map((prompt) => prompt.name),
    ['create_ui_button', 'setup_3d_scene', 'inspect_and_fix'],
  );
  assert.equal(responses[2].result.messages[0].role, 'user');
  assert.match(responses[2].result.messages[0].content.text, /"Launch"/);
  assert.match(responses[2].result.messages[0].content.text, /expectedSceneRevision/);
  assert.deepEqual(responses[3], {
    jsonrpc: '2.0',
    id: 13,
    error: {
      code: -32602,
      message: 'Missing required argument for inspect_and_fix: goal',
    },
  });
  assert.deepEqual(responses[4], {
    jsonrpc: '2.0',
    id: 14,
    error: {
      code: -32602,
      message: 'Unknown prompt: missing_prompt',
    },
  });
  const listedTools = responses[5].result.tools;
  assert.equal(responses[5].id, 15);
  assert.deepEqual(
    listedTools.find((tool) => tool.name === 'get_project_state').annotations,
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  );
  assert.deepEqual(
    listedTools.find((tool) => tool.name === 'run_pc_player').annotations,
    {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  );
});
