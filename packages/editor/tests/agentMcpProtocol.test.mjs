import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  incomingMessageError,
  negotiateProtocolVersion,
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
    '{"jsonrpc":"2.0",',
    JSON.stringify({ jsonrpc: '2.0', id: null, method: 'ping' }),
    JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }),
  ]);

  assert.equal(responses.length, 5);
  assert.equal(responses[0].id, 1);
  assert.equal(responses[0].result.protocolVersion, '2025-11-25');
  assert.match(responses[0].result.instructions, /background-safe/);
  assert.deepEqual(responses[1], {
    jsonrpc: '2.0',
    id: 2,
    result: { resourceTemplates: [] },
  });
  assert.deepEqual(responses[2], {
    jsonrpc: '2.0',
    id: null,
    error: { code: -32700, message: 'Parse error' },
  });
  assert.equal(responses[3].id, null);
  assert.equal(responses[3].error.code, -32600);
  assert.equal(responses[3].error.data.reason, 'id must be a string or safe integer');
  assert.deepEqual(responses[4], { jsonrpc: '2.0', id: 3, result: {} });
});
