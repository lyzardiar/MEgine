import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TOOLS,
  validateToolArguments,
} from '../../agent/mcp/server.mjs';
import { COMMAND_PARAMS_SCHEMAS } from '../src/agent/commandSchemas.ts';
import { validateAgentJsonSchema } from '../src/agent/jsonSchemaValidation.ts';

function mcpTool(commandId) {
  const tool = TOOLS.find((candidate) => candidate.bridgeCommand === commandId);
  assert.ok(tool, `Missing MCP tool for ${commandId}`);
  return tool;
}

function assertParity(commandId, args, valid) {
  const issues = validateAgentJsonSchema(args, COMMAND_PARAMS_SCHEMAS[commandId]);
  if (valid) {
    assert.deepEqual(issues, [], `${commandId}: ${issues.join('; ')}`);
    assert.doesNotThrow(() => validateToolArguments(mcpTool(commandId), args));
  } else {
    assert.ok(issues.length > 0, `${commandId} should be invalid`);
    assert.throws(() => validateToolArguments(mcpTool(commandId), args));
  }
}

const UI_REVISION = 'ui-v2-42-0123456789abcdef';

test('direct AgentBridge schema validation matches MCP for valid command arguments', () => {
  for (const [commandId, args] of [
    ['project.create', { parent: 'C:\\projects', name: 'Example' }],
    ['entity.create', { name: 'Child', parent: null, components: {} }],
    ['transform.set', { entity: 1, position: [1, 2, 3] }],
    ['playback.step', { deltaTime: 1 / 60 }],
    ['window.ui_press_key', {
      selector: '#dialog-input',
      key: 'Enter',
      expectedSnapshotRevision: UI_REVISION,
    }],
    ['window.ui_drag_to', {
      selector: '#source',
      targetSelector: '#target',
      expectedSnapshotRevision: UI_REVISION,
    }],
    ['window.ui_drag_by', {
      selector: '#splitter',
      deltaX: 40,
      deltaY: 0,
      expectedSnapshotRevision: UI_REVISION,
    }],
    ['window.ui_hover', {
      selector: '#submenu',
      expectedSnapshotRevision: UI_REVISION,
    }],
    ['build.run', { executable: 'Builds\\Game.exe', allowForegroundLaunch: true }],
    ['intent.apply', {
      intent: { kind: 'SetClearColor', color: [0.1, 0.2, 0.3, 1] },
    }],
    ['batch.apply', {
      commands: [{ op: 'setParent', entity: 2, parent: null }],
    }],
    ['project.settings.set_sorting_layers', {
      layers: [{ id: 'Default', name: 'Default' }],
      expectedRevision: null,
    }],
  ]) {
    assertParity(commandId, args, true);
  }
});

test('direct AgentBridge schema validation matches MCP for malformed or extra arguments', () => {
  for (const [commandId, args] of [
    ['project.create', { parent: 'C:\\projects', name: 'Example', extra: true }],
    ['entity.create', { parent: -1 }],
    ['transform.set', { entity: 1 }],
    ['transform.set', { entity: 1, position: [1, 2] }],
    ['playback.step', { deltaTime: 0 }],
    ['window.ui_press_key', {
      selector: '#dialog-input',
      key: 'A',
      expectedSnapshotRevision: UI_REVISION,
    }],
    ['window.ui_drag_to', {
      selector: '#source',
      expectedSnapshotRevision: UI_REVISION,
    }],
    ['window.ui_drag_by', {
      selector: '#splitter',
      deltaX: 40,
      expectedSnapshotRevision: UI_REVISION,
    }],
    ['window.ui_hover', {}],
    ['build.run', { executable: 'Builds\\Game.exe', allowForegroundLaunch: false }],
    ['intent.apply', {
      intent: { kind: 'SetClearColor', color: [0.1, 0.2, 3, 1] },
    }],
    ['batch.apply', {
      commands: [{ op: 'not-supported', entity: 1 }],
    }],
    ['project.settings.set_sorting_layers', {
      layers: [{ id: 'not valid', name: 'Default' }],
      expectedRevision: null,
    }],
  ]) {
    assertParity(commandId, args, false);
  }
});

test('schema validation reports bounded deterministic issues for hostile objects', () => {
  const hostile = Object.fromEntries(
    Array.from({ length: 100 }, (_, index) => [`unexpected${index}`, true]),
  );
  const issues = validateAgentJsonSchema(
    hostile,
    COMMAND_PARAMS_SCHEMAS['history.undo'],
  );
  assert.equal(issues.length, 32);
  assert.equal(issues[0], '$.unexpected0 is not allowed');
  assert.equal(issues.at(-1), '$.unexpected31 is not allowed');
});
