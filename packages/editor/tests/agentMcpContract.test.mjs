import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BridgeOutcomeUnknownError,
  RESOURCES,
  SERVER_INSTRUCTIONS,
  structuredError,
  ToolInputValidationError,
  TOOLS,
  validateToolArguments,
} from '../../agent/mcp/server.mjs';
import { COMMAND_META } from '../src/agent/commands.ts';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXECUTION_SCHEMA_KEYS = new Set([
  'requestId',
  'screenshot',
  'expectedSceneRevision',
]);

function contractSchema(value) {
  if (Array.isArray(value)) return value.map(contractSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => (
        key !== 'description'
        && key !== 'title'
        && !EXECUTION_SCHEMA_KEYS.has(key)
      ))
      .map((key) => [key, contractSchema(value[key])]),
  );
}

test('every AgentBridge write command has exactly one MCP tool with its exact parameter schema', () => {
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
    assert.deepEqual(
      contractSchema(matches[0].inputSchema),
      contractSchema(command.paramsSchema),
      `${command.id} parameter schema drifted from its authoritative schema`,
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
    assert.equal(
      tool.inputSchema.additionalProperties,
      false,
      `${tool.name} must reject undeclared top-level arguments`,
    );
  }
});

test('MCP validates tool arguments before dispatch with bounded structured issues', () => {
  const tool = (name) => {
    const result = TOOLS.find((candidate) => candidate.name === name);
    assert.ok(result, `missing tool ${name}`);
    return result;
  };

  validateToolArguments(tool('create_project'), {
    parent: 'C:\\projects',
    name: 'Example',
  });
  validateToolArguments(tool('create_gameobject'), {
    parent: null,
  });
  validateToolArguments(tool('apply_batch'), {
    commands: [{ op: 'spawn', name: 'Cube', components: {} }],
  });
  validateToolArguments(tool('set_transform'), {
    entity: 1,
    position: [1, 2, 3],
  });
  validateToolArguments(tool('find_entities'), { limit: 1000, offset: 1000000 });
  validateToolArguments(tool('list_assets'), { limit: 5000, offset: 1000000 });
  validateToolArguments(tool('get_entity'), { id: 0 });
  validateToolArguments(tool('get_entity'), { name: 'Player' });
  validateToolArguments(tool('compare_build_history'), {
    previousId: 'history-old',
    currentId: 'history-new',
  });
  validateToolArguments(tool('restore_build_history'), {
    historyId: 'history-new',
    publicKeyPath: 'C:\\keys\\trusted.pub',
  });
  validateToolArguments(tool('verify_build_patch'), {
    patchId: 'history-old--history-new',
    publicKeyPath: 'C:\\keys\\trusted.pub',
  });

  assert.throws(
    () => validateToolArguments(tool('create_project'), {
      parent: 'C:\\projects',
      unexpected: true,
    }),
    (error) => {
      assert.ok(error instanceof ToolInputValidationError);
      const payload = structuredError(error);
      assert.equal(payload.code, 'INVALID_ARGS');
      assert.equal(payload.data.tool, 'create_project');
      assert.ok(payload.data.issues.includes('$.name is required'));
      assert.ok(payload.data.issues.includes('$.unexpected is not allowed'));
      return true;
    },
  );
  assert.throws(
    () => validateToolArguments(tool('read_window_ui_content'), {
      selector: '#editor',
      field: 'password',
      offset: -1,
    }),
    /Invalid arguments/,
  );
  assert.throws(
    () => validateToolArguments(tool('apply_batch'), {
      commands: [{ op: 'unknown', components: {} }],
    }),
    /Invalid arguments/,
  );
  assert.throws(
    () => validateToolArguments(tool('set_transform'), { entity: 1 }),
    /Invalid arguments/,
  );
  assert.throws(
    () => validateToolArguments(tool('set_transform'), {
      entity: 1.5,
      position: [1, 2],
    }),
    /Invalid arguments/,
  );
  assert.throws(
    () => validateToolArguments(tool('find_entities'), { offset: 1.5 }),
    /Invalid arguments/,
  );
  assert.throws(
    () => validateToolArguments(tool('get_entity'), {}),
    /Invalid arguments/,
  );
  assert.throws(
    () => validateToolArguments(tool('get_entity'), { id: -1 }),
    /Invalid arguments/,
  );
  assert.throws(
    () => validateToolArguments(tool('get_entity'), {
      name: 'Player',
      unexpected: true,
    }),
    /Invalid arguments/,
  );
});

test('every AgentBridge query is exposed by an MCP tool or resource with no stale mappings', () => {
  const source = fs.readFileSync(
    path.join(editorRoot, 'src', 'agent', 'AgentBridge.ts'),
    'utf8',
  );
  const queryStart = source.indexOf('async query(');
  const queryEnd = source.indexOf('private requireStore()', queryStart);
  assert.ok(queryStart >= 0 && queryEnd > queryStart);
  const queryIds = new Set(
    [...source.slice(queryStart, queryEnd).matchAll(/case '([^']+)'/g)]
      .map((match) => match[1]),
  );

  const exposedQueryIds = new Set(
    RESOURCES.map((resource) => resource.bridgeQuery),
  );
  for (const tool of TOOLS) {
    const handlerQueries = [
      ...String(tool.handler).matchAll(/bridgeQuery\('([^']+)'/g),
    ].map((match) => match[1]);
    if (typeof tool.bridgeCommand !== 'string') {
      assert.ok(handlerQueries.length > 0, `${tool.name} must map to a Bridge query`);
    }
    for (const queryId of handlerQueries) exposedQueryIds.add(queryId);
  }

  assert.deepEqual([...exposedQueryIds].sort(), [...queryIds].sort());
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
