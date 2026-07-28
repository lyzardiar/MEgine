import { TYPED_ENTITY_KINDS } from './typedEntityKinds.ts';

export type AgentJsonSchema = Record<string, unknown>;

type SchemaProperties = Record<string, AgentJsonSchema>;

const stringValue = (description?: string): AgentJsonSchema => ({
  type: 'string',
  ...(description ? { description } : {}),
});

const booleanValue = (description?: string): AgentJsonSchema => ({
  type: 'boolean',
  ...(description ? { description } : {}),
});

const numberValue = (description?: string): AgentJsonSchema => ({
  type: 'number',
  ...(description ? { description } : {}),
});

const entityId = (description = 'Entity id'): AgentJsonSchema => ({
  type: 'integer',
  minimum: 0,
  description,
});

const entityIds = (description: string): AgentJsonSchema => ({
  type: 'array',
  items: entityId(),
  description,
});

const finiteTuple = (length: number, description: string): AgentJsonSchema => ({
  type: 'array',
  minItems: length,
  maxItems: length,
  items: { type: 'number' },
  description,
});

const objectSchema = (
  properties: SchemaProperties = {},
  required: string[] = [],
  extra: AgentJsonSchema = {},
): AgentJsonSchema => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
  ...extra,
});

const worldCommandSchema: AgentJsonSchema = {
  oneOf: [
    objectSchema({
      op: { const: 'spawn' },
      name: stringValue('Optional entity name'),
      components: {
        type: 'object',
        additionalProperties: { type: 'object' },
        description: 'Initial component map',
      },
    }, ['op', 'components']),
    objectSchema({
      op: { const: 'despawn' },
      entity: entityId(),
    }, ['op', 'entity']),
    objectSchema({
      op: { const: 'setComponent' },
      entity: entityId(),
      component: stringValue('Component type'),
      value: { type: 'object', description: 'Complete component value' },
    }, ['op', 'entity', 'component', 'value']),
    objectSchema({
      op: { const: 'removeComponent' },
      entity: entityId(),
      component: stringValue('Component type'),
    }, ['op', 'entity', 'component']),
    objectSchema({
      op: { const: 'setParent' },
      entity: entityId(),
      parent: {
        type: ['integer', 'null'],
        minimum: 0,
        description: 'New parent entity id, or null for a root entity',
      },
    }, ['op', 'entity']),
    objectSchema({
      op: { const: 'setClearColor' },
      r: { type: 'number', minimum: 0, maximum: 1 },
      g: { type: 'number', minimum: 0, maximum: 1 },
      b: { type: 'number', minimum: 0, maximum: 1 },
      a: { type: 'number', minimum: 0, maximum: 1 },
    }, ['op', 'r', 'g', 'b', 'a']),
  ],
};

const sceneName = stringValue('Scene name, with or without .mscene');
const previewToken = stringValue('Exact token returned by the matching preview query');
const assetPath = stringValue('Project-relative asset path under Assets/');
const componentType = stringValue('Exact component type');
const panelKind: AgentJsonSchema = {
  type: 'string',
  enum: [
    'hierarchy',
    'scene',
    'game',
    'inspector',
    'project',
    'console',
    'profiler',
    'timeline',
    'animator',
    'material',
    'shader',
    'spriteEditor',
    'spriteAtlas',
    'build',
    'projectSettings',
  ],
  description: 'Core editor panel kind',
};
const emptySchema = objectSchema();

export const COMMAND_PARAMS_SCHEMAS: Record<string, AgentJsonSchema> = {
  'batch.apply': objectSchema({
    commands: {
      type: 'array',
      minItems: 1,
      maxItems: 256,
      items: worldCommandSchema,
      description: 'WorldCommands validated and applied as one undo transaction',
    },
  }, ['commands']),
  'project.open': objectSchema({
    root: stringValue('Absolute existing MEngine project root'),
  }, ['root']),
  'project.create': objectSchema({
    parent: stringValue('Absolute parent directory for the new project'),
    name: stringValue('New project directory and display name'),
  }, ['parent', 'name']),
  'project.forget_recent': objectSchema({
    path: stringValue('Exact recent-project path to remove'),
  }, ['path']),
  'scene.new': objectSchema({
    name: sceneName,
    overwrite: booleanValue('Allow replacing an existing scene; default false'),
    discardDirty: booleanValue('Allow discarding current unsaved scene changes; default false'),
  }, ['name']),
  'scene.open': objectSchema({
    name: sceneName,
    discardDirty: booleanValue('Allow discarding current unsaved scene changes; default false'),
  }, ['name']),
  'scene.save': objectSchema({
    name: stringValue('Optional destination scene name'),
    overwrite: booleanValue('Allow replacing an existing destination; default false'),
  }),
  'scene.save_all': objectSchema({
    name: stringValue('Name to use only when the dirty scene is unnamed'),
    overwrite: booleanValue('Allow replacing that unnamed-scene destination; default false'),
  }),
  'scene.load_json': objectSchema({
    json: stringValue(
      'Complete version 1 MEngine scene JSON (max 8 MiB and 20,000 entities)',
    ),
  }, ['json']),
  'scene.rename': objectSchema({
    oldName: sceneName,
    newName: sceneName,
  }, ['oldName', 'newName']),
  'scene.delete': objectSchema({
    name: sceneName,
    previewToken,
  }, ['name', 'previewToken']),
  'asset.import_file': objectSchema({
    sourcePath: stringValue('Absolute regular local source file'),
    destinationPath: assetPath,
  }, ['sourcePath', 'destinationPath']),
  'asset.create': objectSchema({
    kind: {
      type: 'string',
      enum: [
        'animation',
        'animator',
        'avatar-mask',
        'material',
        'material-instance',
        'shader',
        'sprite-atlas',
        'timeline',
      ],
      description: 'Default authored resource type to create',
    },
    parentPath: stringValue('Optional parent material path for material-instance'),
  }, ['kind']),
  'asset.instantiate': objectSchema({
    path: assetPath,
  }, ['path']),
  'prefab.create': objectSchema({
    entity: entityId('Root entity to capture and link'),
  }, ['entity']),
  'prefab.apply': objectSchema({
    entity: entityId('Any entity in the linked prefab instance'),
    expectedRevision: stringValue('Exact current prefab asset revision'),
  }, ['entity', 'expectedRevision']),
  'prefab.revert': objectSchema({
    entity: entityId('Any entity in the linked prefab instance'),
    expectedRevision: stringValue('Exact current prefab asset revision'),
  }, ['entity', 'expectedRevision']),
  'prefab.unpack': objectSchema({
    entity: entityId('Any entity in the linked prefab instance'),
  }, ['entity']),
  'asset.open': objectSchema({
    path: assetPath,
  }, ['path']),
  'asset.write_text': objectSchema({
    path: assetPath,
    contents: stringValue('Complete UTF-8 file contents, at most 8 MiB'),
    expectedRevision: {
      type: ['string', 'null'],
      description: 'Current asset revision, or null only when creating a missing file',
    },
  }, ['path', 'contents', 'expectedRevision']),
  'asset.rename': objectSchema({
    sourcePath: assetPath,
    destinationPath: assetPath,
    previewToken,
    allowManualReferences: booleanValue('Accept references that cannot be rewritten automatically'),
    allowSkippedFiles: booleanValue('Accept files skipped by reference scanning'),
  }, ['sourcePath', 'destinationPath', 'previewToken']),
  'asset.duplicate': objectSchema({
    sourcePath: assetPath,
    destinationPath: assetPath,
    previewToken,
    allowManualReferences: booleanValue('Accept source references requiring manual review'),
  }, ['sourcePath', 'destinationPath', 'previewToken']),
  'asset.trash': objectSchema({
    sourcePath: assetPath,
    previewToken,
    allowSkippedFiles: booleanValue('Accept files skipped by reference scanning'),
  }, ['sourcePath', 'previewToken']),
  'asset.restore': objectSchema({
    trashId: stringValue('Trash entry id returned by asset.trash_list'),
    expectedRecordRevision: stringValue('Exact record revision returned by asset.trash_list'),
  }, ['trashId', 'expectedRecordRevision']),
  'build.settings.set_scenes': objectSchema({
    scenes: {
      type: 'array',
      minItems: 1,
      uniqueItems: true,
      items: { type: 'string' },
      description: 'Exact ordered scene paths from build.settings.availableScenes',
    },
  }, ['scenes']),
  'build.start': objectSchema({
    profile: {
      type: 'string',
      enum: ['debug', 'release'],
      description: 'Build profile; default debug',
    },
    clean: booleanValue('Clean output before building; default true'),
  }),
  'build.cancel': emptySchema,
  'build.verify': objectSchema({
    executable: stringValue('Published Player executable inside the active project output'),
    expectedContentHash: {
      type: 'string',
      pattern: '^[0-9a-fA-F]{64}$',
      description: 'Exact 64-character content hash from a successful build',
    },
  }, ['executable', 'expectedContentHash']),
  'selection.set': objectSchema({
    ids: entityIds('Entity ids to select'),
    mode: {
      type: 'string',
      enum: ['replace', 'add', 'toggle'],
      description: 'Selection mode; default replace',
    },
  }, ['ids']),
  'selection.reveal': objectSchema({ id: entityId() }, ['id']),
  'entity.create': objectSchema({
    name: stringValue('Entity name; default GameObject'),
    components: {
      type: 'object',
      additionalProperties: { type: 'object' },
      description: 'Initial component map',
    },
    parent: {
      type: ['integer', 'null'],
      minimum: 0,
      description: 'Parent entity id, or null for root',
    },
  }),
  'entity.create_typed': objectSchema({
    kind: {
      type: 'string',
      enum: [...TYPED_ENTITY_KINDS],
      description: 'Built-in object kind',
    },
  }, ['kind']),
  'entity.delete': objectSchema({
    ids: entityIds('Entity ids to delete; omit to use current selection'),
  }),
  'entity.duplicate': objectSchema({
    ids: entityIds('Entity ids to duplicate; omit to use current selection'),
  }),
  'entity.rename': objectSchema({
    id: entityId(),
    name: stringValue('New entity name'),
  }, ['id', 'name']),
  'entity.set_active': objectSchema({
    id: entityId(),
    active: booleanValue('New active state'),
  }, ['id', 'active']),
  'entity.reparent': objectSchema({
    ids: entityIds('Entity ids to reparent'),
    parent: {
      type: ['integer', 'null'],
      minimum: 0,
      description: 'New parent id, or null for root',
    },
    index: { type: 'integer', minimum: 0, description: 'Optional destination sibling index' },
  }, ['ids', 'parent']),
  'entity.reorder': objectSchema({
    id: entityId(),
    index: { type: 'integer', minimum: 0, description: 'Destination sibling index' },
  }, ['id', 'index']),
  'component.add': objectSchema({
    entity: entityId(),
    type: componentType,
    value: { type: 'object', description: 'Optional initial component value' },
  }, ['entity', 'type']),
  'component.remove': objectSchema({
    entity: entityId(),
    type: componentType,
  }, ['entity', 'type']),
  'component.set': objectSchema({
    entity: entityId(),
    type: componentType,
    value: { type: 'object', description: 'Complete component value' },
  }, ['entity', 'type', 'value']),
  'component.patch': objectSchema({
    entity: entityId(),
    type: componentType,
    patch: { type: 'object', description: 'Fields to shallow-merge' },
  }, ['entity', 'type', 'patch']),
  'component.invoke': objectSchema({
    entity: entityId(),
    type: componentType,
    method: stringValue('Exact registered Behaviour method name'),
  }, ['entity', 'type', 'method']),
  'transform.set': objectSchema({
    entity: entityId(),
    position: finiteTuple(3, 'Local position [x, y, z]'),
    rotation: finiteTuple(4, 'Local quaternion [x, y, z, w]'),
    scale: finiteTuple(3, 'Local scale [x, y, z]'),
  }, ['entity'], {
    anyOf: [
      { required: ['position'] },
      { required: ['rotation'] },
      { required: ['scale'] },
    ],
  }),
  'transform.translate': objectSchema({
    entity: entityId(),
    delta: finiteTuple(3, 'Local-position delta [x, y, z]'),
  }, ['entity', 'delta']),
  'playback.play': emptySchema,
  'playback.pause': emptySchema,
  'playback.stop': emptySchema,
  'playback.step': objectSchema({
    deltaTime: {
      type: 'number',
      exclusiveMinimum: 0,
      maximum: 1,
      description: 'Simulation seconds for the step; default 1/60',
    },
  }),
  'history.undo': emptySchema,
  'history.redo': emptySchema,
  'gizmo.set': objectSchema({
    mode: {
      type: 'string',
      enum: ['translate', 'rotate', 'scale', 'rect'],
      description: 'Transform gizmo mode',
    },
  }, ['mode']),
  'view.frame_selected': emptySchema,
  'view.set_camera': objectSchema({
    yaw: numberValue('Orbit yaw in degrees'),
    pitch: numberValue('Orbit pitch in degrees; clamped to -89..89'),
    distance: numberValue('Orbit distance; clamped to 0.5..200'),
    pivot: finiteTuple(3, 'Orbit pivot [x, y, z]'),
  }, [], {
    anyOf: [
      { required: ['yaw'] },
      { required: ['pitch'] },
      { required: ['distance'] },
      { required: ['pivot'] },
    ],
  }),
  'panel.focus': objectSchema({
    kind: panelKind,
  }, ['kind']),
  'panel.detach': objectSchema({ kind: panelKind }, ['kind']),
  'panel.dock': objectSchema({ kind: panelKind }, ['kind']),
  'panel.reset_layout': emptySchema,
  'menu.invoke': objectSchema({
    path: stringValue('Exact registered menu path'),
  }, ['path']),
  'window.ui_click': objectSchema({
    windowLabel: stringValue('Window label; default main'),
    selector: stringValue('Exact selector returned by window.ui_snapshot'),
  }, ['selector']),
  'window.ui_set_value': objectSchema({
    windowLabel: stringValue('Window label; default main'),
    selector: stringValue('Exact selector returned by window.ui_snapshot'),
    value: stringValue('New form control value'),
  }, ['selector', 'value']),
};

export const COMMAND_EXECUTION_OPTIONS_SCHEMA: AgentJsonSchema = objectSchema({
  screenshot: booleanValue('Capture a background-safe screenshot after the command'),
  expectedSceneRevision: {
    type: 'integer',
    minimum: 0,
    description: 'Optimistic scene revision lock checked before any command mutation',
  },
});
