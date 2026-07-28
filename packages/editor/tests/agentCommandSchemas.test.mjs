import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMAND_EXECUTION_OPTIONS_SCHEMA,
  COMMAND_PARAMS_SCHEMAS,
} from '../src/agent/commandSchemas.ts';
import {
  COMMAND_META,
  WRITE_COMMANDS,
} from '../src/agent/commands.ts';

test('every AgentBridge write command has one complete discoverable parameter schema', () => {
  const ids = COMMAND_META.map((command) => command.id);
  const schemaIds = Object.keys(COMMAND_PARAMS_SCHEMAS);

  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(schemaIds.sort(), [...ids].sort());
  for (const command of COMMAND_META) {
    assert.equal(command.paramsSchema, COMMAND_PARAMS_SCHEMAS[command.id]);
    assert.equal(command.paramsSchema.type, 'object');
    assert.equal(command.paramsSchema.additionalProperties, false);
    assert.doesNotThrow(() => JSON.stringify(command.paramsSchema));
  }
  for (const commandId of Object.keys(WRITE_COMMANDS)) {
    assert.ok(ids.includes(commandId), `${commandId} is missing command metadata`);
  }
});

test('command schemas expose exact high-risk guards and shared optimistic options', () => {
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['scene.delete'].required,
    ['name', 'previewToken'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['asset.write_text'].required,
    ['path', 'contents', 'expectedRevision'],
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['batch.apply'].properties.commands.maxItems,
    256,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['transform.translate'].properties.delta.minItems,
    3,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['transform.translate'].properties.delta.maxItems,
    3,
  );
  assert.equal(
    COMMAND_EXECUTION_OPTIONS_SCHEMA.properties.expectedSceneRevision.minimum,
    0,
  );
  assert.equal(
    COMMAND_EXECUTION_OPTIONS_SCHEMA.properties.screenshot.type,
    'boolean',
  );
});
