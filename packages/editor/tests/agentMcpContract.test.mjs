import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BridgeOutcomeUnknownError,
  bridgeExecuteParams,
  DANGEROUS_AGENT_COMMANDS,
  PROMPTS,
  RESOURCES,
  SERVER_INSTRUCTIONS,
  renderPrompt,
  screenshotContent,
  structuredError,
  toolAnnotations,
  ToolInputValidationError,
  TOOLS,
  validateToolArguments,
} from '../../agent/mcp/server.mjs';
import { COMMAND_META } from '../src/agent/commands.ts';
import { QUERY_PARAMS_SCHEMAS } from '../src/agent/querySchemas.ts';

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

function queryContractSchema(value) {
  if (Array.isArray(value)) return value.map(queryContractSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => key !== 'description' && key !== 'title')
      .map((key) => [key, queryContractSchema(value[key])]),
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

test('MCP tools expose conservative official safety annotations', () => {
  for (const tool of TOOLS) {
    const annotations = toolAnnotations(tool);
    assert.deepEqual(
      Object.keys(annotations).sort(),
      [
        'destructiveHint',
        'idempotentHint',
        'openWorldHint',
        'readOnlyHint',
      ],
    );
    for (const value of Object.values(annotations)) {
      assert.equal(typeof value, 'boolean');
    }
    if (typeof tool.bridgeCommand !== 'string') {
      assert.deepEqual(annotations, {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    } else {
      assert.equal(annotations.readOnlyHint, false);
    }
  }

  const annotations = (name) => {
    const tool = TOOLS.find((candidate) => candidate.name === name);
    assert.ok(tool, `missing tool ${name}`);
    return toolAnnotations(tool);
  };
  assert.deepEqual(annotations('create_gameobject'), {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  });
  assert.deepEqual(annotations('set_component'), {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  });
  assert.deepEqual(annotations('delete_scene'), {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  });
  assert.deepEqual(annotations('run_pc_player'), {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  });
});

test('MCP forwards approval tokens only for the native dangerous command set', () => {
  const nativeBridge = fs.readFileSync(
    path.join(editorRoot, 'src-tauri', 'src', 'agent_bridge.rs'),
    'utf8',
  );
  const nativeDeclaration = nativeBridge.match(
    /const DANGEROUS_AGENT_COMMANDS:\s*&\[&str\]\s*=\s*&\[([\s\S]*?)\];/,
  );
  assert.ok(nativeDeclaration, 'native dangerous command declaration must remain readable');
  const nativeCommands = [
    ...nativeDeclaration[1].matchAll(/"([^"]+)"/g),
  ].map((match) => match[1]);

  assert.ok(Object.isFrozen(DANGEROUS_AGENT_COMMANDS));
  assert.deepEqual(
    [...DANGEROUS_AGENT_COMMANDS].sort(),
    nativeCommands.sort(),
    'MCP and native dangerous command sets must not drift',
  );

  const previousToken = process.env.MENGINE_AGENT_APPROVAL_TOKEN;
  try {
    process.env.MENGINE_AGENT_APPROVAL_TOKEN = 'environment-secret';
    const ordinary = bridgeExecuteParams('scene.save', {}, {
      requestId: 'ordinary-write',
      approvalToken: 'explicit-secret',
    });
    assert.equal(Object.hasOwn(ordinary, 'approvalToken'), false);
    assert.doesNotMatch(JSON.stringify(ordinary), /secret/);

    const dangerous = bridgeExecuteParams('scene.delete', { path: 'Scene' }, {
      requestId: 'dangerous-write',
    });
    assert.equal(dangerous.approvalToken, 'environment-secret');

    const explicitlyApproved = bridgeExecuteParams('asset.trash', {}, {
      approvalToken: 'explicit-secret',
    });
    assert.equal(explicitlyApproved.approvalToken, 'explicit-secret');

    delete process.env.MENGINE_AGENT_APPROVAL_TOKEN;
    const unapproved = bridgeExecuteParams('build.start');
    assert.equal(Object.hasOwn(unapproved, 'approvalToken'), false);
  } finally {
    if (previousToken == null) {
      delete process.env.MENGINE_AGENT_APPROVAL_TOKEN;
    } else {
      process.env.MENGINE_AGENT_APPROVAL_TOKEN = previousToken;
    }
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
  validateToolArguments(tool('apply_intent'), {
    intent: { kind: 'SetTransform', entity: 1, position: [1, 2, 3] },
  });
  validateToolArguments(tool('set_transform'), {
    entity: 1,
    position: [1, 2, 3],
  });
  validateToolArguments(tool('set_rect_transform'), {
    entity: 1,
    anchorMin: [0, 0],
    anchorMax: [1, 1],
    sizeDelta: [0, 0],
  });
  validateToolArguments(tool('find_entities'), {
    limit: 1000,
    offset: 1000000,
    expectedSceneRevision: 0,
  });
  validateToolArguments(tool('list_assets'), {
    limit: 5000,
    offset: 1000000,
    expectedIndexRevision: 'asset-index-v1-5000-0123456789abcdef',
  });
  validateToolArguments(tool('list_asset_trash'), {
    limit: 1000,
    offset: 1000000,
    expectedTrashRevision: 'asset-trash-v1-5000-0123456789abcdef',
  });
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
  assert.doesNotThrow(
    () => validateToolArguments(tool('read_window_ui_content'), {
      selector: '#projection',
      expectedSnapshotRevision: 'ui-v9-42-0123456789abcdef',
      field: 'options',
      maxChars: 64,
    }),
  );
  assert.throws(
    () => validateToolArguments(tool('apply_batch'), {
      commands: [{ op: 'unknown', components: {} }],
    }),
    /Invalid arguments/,
  );
  assert.throws(
    () => validateToolArguments(tool('apply_intent'), {
      intent: { kind: 'SpawnEnemy', archetype: 'placeholder', at: [0, 0, 0] },
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
    () => validateToolArguments(tool('set_rect_transform'), {
      entity: 1,
      pivot: [0.5, 2],
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

test('direct MCP query tools preserve every authoritative parameter constraint', () => {
  for (const tool of TOOLS) {
    if (typeof tool.bridgeCommand === 'string') continue;
    const queryIds = [
      ...String(tool.handler).matchAll(/bridgeQuery\('([^']+)'/g),
    ].map((match) => match[1]);
    if (queryIds.length !== 1) continue;
    const querySchema = QUERY_PARAMS_SCHEMAS[queryIds[0]];
    if (!querySchema) continue;
    assert.deepEqual(
      queryContractSchema(tool.inputSchema),
      queryContractSchema(querySchema),
      `${tool.name} drifted from authoritative query ${queryIds[0]}`,
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
    'mengine://project/script/diagnostics',
    'mengine://editor/state',
    'mengine://editor/windows',
    'mengine://scene/snapshot',
    'mengine://schema/components',
    'mengine://queries',
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
  assert.match(SERVER_INSTRUCTIONS, /RATE_LIMITED/);
  assert.match(SERVER_INSTRUCTIONS, /retryAfterMs/);
  assert.match(SERVER_INSTRUCTIONS, /screenshot/);
  assert.match(SERVER_INSTRUCTIONS, /BRIDGE_CONNECTION/);
  assert.match(SERVER_INSTRUCTIONS, /UNKNOWN_OUTCOME/);
});

test('MCP prompts expose bounded background-safe autonomous workflows', () => {
  const names = PROMPTS.map((prompt) => prompt.name);
  assert.deepEqual(names, [
    'create_ui_button',
    'setup_3d_scene',
    'inspect_and_fix',
  ]);
  assert.equal(new Set(names).size, names.length);

  for (const prompt of PROMPTS) {
    assert.match(prompt.name, /^[a-z][a-z0-9_]*$/);
    assert.equal(typeof prompt.title, 'string');
    assert.ok(prompt.title.length > 0);
    assert.equal(typeof prompt.description, 'string');
    assert.ok(prompt.description.length > 0);
    const argumentNames = (prompt.arguments ?? []).map((argument) => argument.name);
    assert.equal(new Set(argumentNames).size, argumentNames.length);
    for (const argument of prompt.arguments ?? []) {
      assert.match(argument.name, /^[a-z][A-Za-z0-9]*$/);
      assert.equal(typeof argument.description, 'string');
      if (argument.required !== undefined) {
        assert.equal(typeof argument.required, 'boolean');
      }
    }
  }

  const ui = renderPrompt('create_ui_button', {
    label: 'Launch',
    parentEntity: '42',
    callback: 'StartGame',
  });
  assert.equal(ui.messages.length, 1);
  assert.equal(ui.messages[0].role, 'user');
  assert.equal(ui.messages[0].content.type, 'text');
  assert.match(ui.messages[0].content.text, /without activating, raising, focusing/);
  assert.match(ui.messages[0].content.text, /expectedSceneRevision/);
  assert.match(ui.messages[0].content.text, /create_typed/);
  assert.match(ui.messages[0].content.text, /take_screenshot/);
  assert.match(ui.messages[0].content.text, /Do not save/);
  assert.match(ui.messages[0].content.text, /"Launch"/);

  const scene = renderPrompt('setup_3d_scene', { cubeName: 'Subject' });
  assert.match(scene.messages[0].content.text, /"camera"/);
  assert.match(scene.messages[0].content.text, /"directional_light"/);
  assert.match(scene.messages[0].content.text, /"cube"/);
  assert.match(scene.messages[0].content.text, /Never set overwrite or discardDirty/);

  const inspect = renderPrompt('inspect_and_fix', { goal: 'Fix the selected light' });
  assert.match(inspect.messages[0].content.text, /minimal evidence-backed correction/);
  assert.match(inspect.messages[0].content.text, /If no defect is confirmed, make no write/);
  assert.match(inspect.messages[0].content.text, /before\/after comparison/);

  assert.throws(
    () => renderPrompt('inspect_and_fix'),
    /Missing required argument/,
  );
  assert.throws(
    () => renderPrompt('create_ui_button', { label: 42 }),
    /must be a string/,
  );
  assert.throws(
    () => renderPrompt('create_ui_button', { unknown: 'value' }),
    /Unknown argument/,
  );
  assert.throws(
    () => renderPrompt('create_ui_button', { label: 'x'.repeat(4_097) }),
    /exceeds 4096 characters/,
  );
  assert.throws(
    () => renderPrompt('missing_prompt'),
    /Unknown prompt/,
  );
});

test('MCP screenshot tool exposes bounded background capture controls', () => {
  const screenshot = TOOLS.find((tool) => tool.name === 'take_screenshot');
  assert.ok(screenshot);
  assert.equal(screenshot.inputSchema.additionalProperties, false);
  assert.equal(screenshot.inputSchema.properties.maxSize.minimum, 256);
  assert.equal(screenshot.inputSchema.properties.maxSize.maximum, 4_096);
  assert.match(screenshot.description, /serialized and rate-limited/);
});

test('MCP screenshot content keeps evidence metadata out of the base64 image payload', () => {
  const content = screenshotContent({
    dataUrl: 'data:image/png;base64,aGVsbG8=',
    width: 256,
    height: 160,
    sourceWidth: 2_160,
    sourceHeight: 1_350,
    scale: 256 / 2_160,
    capturedAt: 123_456,
    mime: 'image/png',
    windowLabel: 'main',
    captureMethod: 'webview2-devtools',
    backgroundSafe: true,
  }, {
    ok: true,
    screenshotRequested: true,
    screenshotCaptured: true,
  });

  assert.equal(content.length, 2);
  assert.deepEqual(JSON.parse(content[0].text), {
    ok: true,
    screenshotRequested: true,
    screenshotCaptured: true,
    screenshot: {
      width: 256,
      height: 160,
      sourceWidth: 2_160,
      sourceHeight: 1_350,
      scale: 256 / 2_160,
      capturedAt: 123_456,
      mime: 'image/png',
      windowLabel: 'main',
      captureMethod: 'webview2-devtools',
      backgroundSafe: true,
    },
  });
  assert.deepEqual(content[1], {
    type: 'image',
    data: 'aGVsbG8=',
    mimeType: 'image/png',
  });
  assert.doesNotMatch(content[0].text, /aGVsbG8=/);
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
