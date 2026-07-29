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
import { TYPED_ENTITY_KINDS } from '../src/agent/typedEntityKinds.ts';

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
    COMMAND_PARAMS_SCHEMAS['project.settings.set_sorting_layers'].required,
    ['layers', 'expectedRevision'],
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['project.settings.set_sorting_layers'].properties.layers.maxItems,
    64,
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['project.settings.set_tags_and_layers'].required,
    ['tags', 'gameLayers', 'expectedRevision'],
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['project.settings.set_tags_and_layers'].properties.gameLayers.maxItems,
    32,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['entity.set_layer'].properties.layer.maximum,
    31,
  );
  for (const command of ['entity.set_actives', 'entity.set_tags', 'entity.set_layers']) {
    assert.equal(COMMAND_PARAMS_SCHEMAS[command].properties.ids.minItems, 1);
    assert.equal(COMMAND_PARAMS_SCHEMAS[command].properties.ids.maxItems, 256);
  }
  assert.equal(COMMAND_PARAMS_SCHEMAS['component.add_many'].properties.entities.minItems, 1);
  assert.equal(COMMAND_PARAMS_SCHEMAS['component.add_many'].properties.entities.maxItems, 256);
  assert.equal(COMMAND_PARAMS_SCHEMAS['component.remove_many'].properties.entities.minItems, 1);
  assert.equal(COMMAND_PARAMS_SCHEMAS['component.remove_many'].properties.entities.maxItems, 256);
  for (const command of ['component.set_many', 'component.patch_many']) {
    assert.equal(COMMAND_PARAMS_SCHEMAS[command].properties.entities.minItems, 1);
    assert.equal(COMMAND_PARAMS_SCHEMAS[command].properties.entities.maxItems, 256);
  }
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['scene.load_json'].required,
    ['json'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['asset.open'].required,
    ['path'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['workspace.save_document'].required,
    ['path'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['workspace.discard_document'].required,
    ['path'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['workspace.reload_document'].required,
    ['path'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['workspace.close_document'].required,
    ['path'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['workspace.close_document'].properties.dirtyAction.enum,
    ['reject', 'save', 'discard'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['asset.create'].required,
    ['kind'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['asset.create'].properties.kind.enum,
    [
      'animation',
      'animator',
      'avatar-mask',
      'material',
      'material-instance',
      'shader',
      'sprite-atlas',
      'timeline',
    ],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['asset.instantiate'].required,
    ['path'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['prefab.create'].required,
    ['entity'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['prefab.apply'].required,
    ['entity', 'expectedRevision'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['prefab.revert'].required,
    ['entity', 'expectedRevision'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['prefab.unpack'].required,
    ['entity'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['panel.detach'].required,
    ['kind'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['panel.dock'].required,
    ['kind'],
  );
  for (const command of [
    'window.ui_click',
    'window.ui_double_click',
    'window.ui_context_click',
    'window.ui_scroll',
    'window.ui_drag_to',
    'window.ui_drag_by',
    'window.ui_hover',
  ]) {
    assert.equal(COMMAND_PARAMS_SCHEMAS[command].properties.offsetX.minimum, -1_000_000);
    assert.equal(COMMAND_PARAMS_SCHEMAS[command].properties.offsetX.maximum, 1_000_000);
    assert.equal(COMMAND_PARAMS_SCHEMAS[command].properties.offsetY.minimum, -1_000_000);
    assert.equal(COMMAND_PARAMS_SCHEMAS[command].properties.offsetY.maximum, 1_000_000);
  }
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['window.ui_drag_to'].properties.targetOffsetX.minimum,
    -1_000_000,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['window.ui_drag_to'].properties.targetOffsetY.maximum,
    1_000_000,
  );
  assert.equal(COMMAND_PARAMS_SCHEMAS['window.ui_scroll'].properties.shiftKey.type, 'boolean');
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['window.ui_drag_by'].properties.button.enum,
    ['left', 'middle', 'right'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['window.ui_scroll'].required,
    ['selector', 'expectedSnapshotRevision'],
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['build.run'].required,
    ['executable', 'allowForegroundLaunch'],
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['build.run'].properties.allowForegroundLaunch.const,
    true,
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['asset.write_text'].required,
    ['path', 'contents', 'expectedRevision'],
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['batch.apply'].properties.commands.maxItems,
    256,
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['intent.apply'].required,
    ['intent'],
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['intent.apply'].properties.intent.oneOf.length,
    3,
  );
  assert.deepEqual(
    COMMAND_PARAMS_SCHEMAS['entity.create_typed'].properties.kind.enum,
    TYPED_ENTITY_KINDS,
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
    COMMAND_PARAMS_SCHEMAS['view.set_scene_preferences'].anyOf.length,
    6,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['view.set_scene_preferences']
      .properties.snap.anyOf.length,
    4,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['view.set_scene_preferences']
      .properties.snap.properties.move.exclusiveMinimum,
    0,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['view.set_timeline_preferences'].anyOf.length,
    2,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['view.set_timeline_preferences']
      .properties.animationTimeline.anyOf.length,
    2,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['view.set_timeline_preferences']
      .properties.sequencer.anyOf.length,
    4,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['sprite.import_settings.set']
      .properties.settings.properties.slices.maxItems,
    4_096,
  );
  assert.equal(
    COMMAND_PARAMS_SCHEMAS['sprite.import_settings.set']
      .properties.settings.properties.slices.items
      .properties.rect.maxItems,
    4,
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
