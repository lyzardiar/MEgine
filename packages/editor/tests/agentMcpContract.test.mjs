import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BridgeOutcomeUnknownError,
  RESOURCES,
  SERVER_INSTRUCTIONS,
  structuredError,
  TOOLS,
} from '../../agent/mcp/server.mjs';
import { COMMAND_META } from '../src/agent/commands.ts';

test('every AgentBridge write command has exactly one MCP tool with exact required fields', () => {
  const writeTools = TOOLS.filter((tool) => typeof tool.bridgeCommand === 'string');
  const byCommand = new Map();
  for (const tool of writeTools) {
    const existing = byCommand.get(tool.bridgeCommand) ?? [];
    existing.push(tool);
    byCommand.set(tool.bridgeCommand, existing);
  }

  assert.equal(writeTools.length, COMMAND_META.length);
  assert.deepEqual(
    [...byCommand.keys()].sort(),
    COMMAND_META.map((command) => command.id).sort(),
  );

  for (const command of COMMAND_META) {
    const matches = byCommand.get(command.id) ?? [];
    assert.equal(matches.length, 1, `${command.id} must map to exactly one MCP tool`);
    assert.deepEqual(
      [...(matches[0].inputSchema.required ?? [])].sort(),
      [...(command.paramsSchema.required ?? [])].sort(),
      `${command.id} required fields drifted from its authoritative schema`,
    );
  }
});

test('MCP tool names are unique and every input schema is an object', () => {
  const names = TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  for (const tool of TOOLS) {
    assert.equal(tool.inputSchema?.type, 'object', `${tool.name} must accept an object`);
    assert.equal(
      typeof tool.inputSchema.properties,
      'object',
      `${tool.name} must declare properties`,
    );
  }
});

test('MCP resources expose unique, query-backed core editor context', () => {
  const uris = RESOURCES.map((resource) => resource.uri);
  assert.equal(new Set(uris).size, uris.length);

  for (const resource of RESOURCES) {
    assert.match(resource.uri, /^mengine:\/\/[a-z]+(?:\/[a-z]+)*$/);
    assert.equal(resource.mimeType, 'application/json');
    assert.equal(typeof resource.description, 'string');
    assert.ok(resource.description.length > 0);
    assert.equal(typeof resource.bridgeQuery, 'string');
    assert.ok(resource.bridgeQuery.length > 0);
  }

  const requiredContext = [
    'mengine://project/state',
    'mengine://editor/state',
    'mengine://editor/windows',
    'mengine://scene/snapshot',
    'mengine://schema/components',
    'mengine://commands',
    'mengine://build/settings',
  ];
  for (const uri of requiredContext) {
    assert.ok(uris.includes(uri), `${uri} must be discoverable`);
  }
});

test('MCP startup instructions teach the safe autonomous workflow', () => {
  assert.match(SERVER_INSTRUCTIONS, /without activating or raising/);
  assert.match(SERVER_INSTRUCTIONS, /expectedSceneRevision/);
  assert.match(SERVER_INSTRUCTIONS, /requestId/);
  assert.match(SERVER_INSTRUCTIONS, /serialized/);
  assert.match(SERVER_INSTRUCTIONS, /screenshot/);
  assert.match(SERVER_INSTRUCTIONS, /BRIDGE_CONNECTION/);
  assert.match(SERVER_INSTRUCTIONS, /UNKNOWN_OUTCOME/);
});

test('MCP reports process-loss writes as actionable unknown outcomes without tokens', () => {
  const error = new BridgeOutcomeUnknownError(
    'execute',
    { requestId: 'write-17' },
    { pid: 101, token: 'old-secret' },
    { pid: 202, token: 'new-secret' },
  );
  const payload = structuredError(error);

  assert.deepEqual(payload, {
    code: 'UNKNOWN_OUTCOME',
    message:
      'Editor process changed while execute was in flight; its outcome is unknown. ' +
      'Re-read editor state before issuing a new requestId.',
    data: {
      method: 'execute',
      requestId: 'write-17',
      previousEditorPid: 101,
      currentEditorPid: 202,
    },
  });
  assert.doesNotMatch(JSON.stringify(payload), /secret/);
});
