import { INTENT_SCHEMA } from '@mengine/agent';
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
const uiInteractionContext: SchemaProperties = {
  windowLabel: stringValue('Window label; default main'),
  expectedSnapshotRevision: {
    type: 'string',
    pattern: '^ui-v\\d+-\\d+-[0-9a-f]{16}$',
    maxLength: 64,
    description: 'Exact snapshotRevision returned with the selector by window.ui_snapshot',
  },
};
const uiModifierContext: SchemaProperties = {
  shiftKey: booleanValue('Dispatch the interaction with Shift held'),
  ctrlKey: booleanValue('Dispatch the interaction with Control held'),
  altKey: booleanValue('Dispatch the interaction with Alt held'),
  metaKey: booleanValue('Dispatch the interaction with Meta held'),
};
const uiPointerOffsetContext: SchemaProperties = {
  offsetX: {
    type: 'number',
    minimum: -1_000_000,
    maximum: 1_000_000,
    description:
      'Optional horizontal CSS-pixel offset from the element left edge; defaults to center and must resolve inside current bounds',
  },
  offsetY: {
    type: 'number',
    minimum: -1_000_000,
    maximum: 1_000_000,
    description:
      'Optional vertical CSS-pixel offset from the element top edge; defaults to center and must resolve inside current bounds',
  },
};
const uiTargetPointerOffsetContext: SchemaProperties = {
  targetOffsetX: {
    type: 'number',
    minimum: -1_000_000,
    maximum: 1_000_000,
    description:
      'Optional horizontal CSS-pixel offset from the drag target left edge; defaults to center and must resolve inside current bounds',
  },
  targetOffsetY: {
    type: 'number',
    minimum: -1_000_000,
    maximum: 1_000_000,
    description:
      'Optional vertical CSS-pixel offset from the drag target top edge; defaults to center and must resolve inside current bounds',
  },
};
const uiInteractionRequired = ['selector', 'expectedSnapshotRevision'];

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
  'intent.apply': objectSchema({
    intent: {
      ...INTENT_SCHEMA,
      description: 'One supported high-level intent from intents.list',
    },
  }, ['intent']),
  'dialog.respond': objectSchema({
    windowLabel: stringValue('Window label from list_windows; default main'),
    dialogId: stringValue('Exact active dialog id from get_active_dialog'),
    action: {
      type: 'string',
      enum: ['accept', 'cancel'],
      description: 'Accept or cancel the active editor dialog',
    },
    value: {
      type: 'string',
      maxLength: 4096,
      description: 'Prompt value when action=accept; ignored for alert/confirm dialogs',
    },
  }, ['dialogId', 'action']),
  'console.clear': emptySchema,
  'profiler.clear': emptySchema,
  'project.open': objectSchema({
    root: stringValue('Absolute existing MEngine project root'),
  }, ['root']),
  'project.create': objectSchema({
    parent: stringValue('Absolute parent directory for the new project'),
    name: stringValue('New project directory and display name'),
  }, ['parent', 'name']),
  'project.close': objectSchema({
    discardDirty: booleanValue('Explicitly allow discarding all unsaved workspace changes'),
  }),
  'project.forget_recent': objectSchema({
    path: stringValue('Exact recent-project path to remove'),
  }, ['path']),
  'project.settings.set_sorting_layers': objectSchema({
    layers: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      items: objectSchema({
        id: {
          type: 'string',
          pattern: '^[A-Za-z0-9_-]{1,64}$',
          description: 'Stable ASCII identifier (letters, digits, underscore, or hyphen)',
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          description: 'Unique display name, at most 64 characters',
        },
      }, ['id', 'name']),
      description: 'Complete ordered sorting layer list including the Default layer',
    },
    expectedRevision: {
      type: ['string', 'null'],
      description: 'Exact current settings revision, or null only when the file is missing',
    },
  }, ['layers', 'expectedRevision']),
  'project.settings.set_tags_and_layers': objectSchema({
    tags: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      items: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
      },
      description: 'Complete unique tag list including Untagged',
    },
    gameLayers: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: objectSchema({
        index: {
          type: 'integer',
          minimum: 0,
          maximum: 31,
          description: 'Stable layer bit index',
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          description: 'Unique display name',
        },
      }, ['index', 'name']),
      description: 'Complete named GameObject layer list including index 0 Default',
    },
    expectedRevision: {
      type: ['string', 'null'],
      description: 'Exact current settings revision, or null only when the file is missing',
    },
  }, ['tags', 'gameLayers', 'expectedRevision']),
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
  'workspace.save_document': objectSchema({
    path: assetPath,
  }, ['path']),
  'workspace.discard_document': objectSchema({
    path: assetPath,
  }, ['path']),
  'workspace.reload_document': objectSchema({
    path: assetPath,
  }, ['path']),
  'workspace.close_document': objectSchema({
    path: assetPath,
    dirtyAction: {
      type: 'string',
      enum: ['reject', 'save', 'discard'],
      description: 'Dirty document policy; default reject',
    },
  }, ['path']),
  'scene.load_json': objectSchema({
    json: stringValue(
      'Complete MEngine scene JSON version 1, 2, or 3 (max 8 MiB and 20,000 entities)',
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
  'sprite.import_settings.set': objectSchema({
    path: assetPath,
    settings: objectSchema({
      mode: {
        type: 'string',
        enum: ['single', 'multiple'],
        description: 'Single texture sprite or named multiple slices',
      },
      pixelsPerUnit: {
        type: 'number',
        exclusiveMinimum: 0,
        maximum: 100_000,
      },
      slices: {
        type: 'array',
        maxItems: 4_096,
        items: objectSchema({
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          rect: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: { type: 'integer', minimum: 0 },
            description: 'Top-left pixel rectangle [x, y, width, height]',
          },
          pivot: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: { type: 'number', minimum: 0, maximum: 1 },
            description: 'Normalized bottom-left pivot [x, y]',
          },
        }, ['name', 'rect', 'pivot']),
      },
    }, ['mode', 'pixelsPerUnit', 'slices']),
    expectedRevision: {
      type: ['string', 'null'],
      description:
        'Exact revision from sprite.import_settings, or null while defaults are implicit',
    },
  }, ['path', 'settings', 'expectedRevision']),
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
    expectedRevision: stringValue('Exact project.json revision from build.settings'),
  }, ['scenes', 'expectedRevision']),
  'build.settings.set_asset_policy': objectSchema({
    assetMode: {
      type: 'string',
      enum: ['all', 'referenced'],
      description: 'Package all assets or only referenced assets plus alwaysInclude paths',
    },
    alwaysInclude: {
      type: 'array',
      maxItems: 256,
      uniqueItems: true,
      items: { type: 'string' },
      description: 'Existing Assets/ or Scripts/ paths that must always be packaged',
    },
    shaderVariantLimit: {
      type: 'integer',
      minimum: 1,
      maximum: 65_536,
      description: 'Maximum generated shader variants',
    },
    expectedRevision: stringValue('Exact project.json revision from build.settings'),
  }, ['assetMode', 'alwaysInclude', 'shaderVariantLimit', 'expectedRevision']),
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
  'build.run': objectSchema({
    executable: stringValue('Published Player executable inside the active project output'),
    allowForegroundLaunch: {
      type: 'boolean',
      const: true,
      description: 'Required explicit acknowledgement that launching the Player creates a window',
    },
  }, ['executable', 'allowForegroundLaunch']),
  'build.history.create_patch': objectSchema({
    previousId: stringValue('Older build history id from get_build_history'),
    currentId: stringValue('Newer build history id from get_build_history'),
  }, ['previousId', 'currentId']),
  'build.history.restore': objectSchema({
    historyId: stringValue('Signed archived build history id from get_build_history'),
    publicKeyPath: stringValue('Absolute trusted Ed25519 public-key file path'),
  }, ['historyId', 'publicKeyPath']),
  'build.patch.verify': objectSchema({
    patchId: stringValue('Exact patch id from get_build_patches'),
    publicKeyPath: stringValue('Absolute trusted Ed25519 public-key file path'),
  }, ['patchId', 'publicKeyPath']),
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
  'entity.set_actives': objectSchema({
    ids: {
      ...entityIds('Entity ids to activate or deactivate together'),
      minItems: 1,
      maxItems: 256,
    },
    active: booleanValue('Shared active state'),
  }, ['ids', 'active']),
  'entity.set_tag': objectSchema({
    id: entityId(),
    tag: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      description: 'GameObject classification tag',
    },
  }, ['id', 'tag']),
  'entity.set_tags': objectSchema({
    ids: {
      ...entityIds('Entity ids whose tags should be changed together'),
      minItems: 1,
      maxItems: 256,
    },
    tag: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      description: 'Shared GameObject classification tag',
    },
  }, ['ids', 'tag']),
  'entity.set_layer': objectSchema({
    id: entityId(),
    layer: {
      type: 'integer',
      minimum: 0,
      maximum: 31,
      description: 'GameObject layer index',
    },
  }, ['id', 'layer']),
  'entity.set_layers': objectSchema({
    ids: {
      ...entityIds('Entity ids whose GameObject layers should be changed together'),
      minItems: 1,
      maxItems: 256,
    },
    layer: {
      type: 'integer',
      minimum: 0,
      maximum: 31,
      description: 'Shared GameObject layer index',
    },
  }, ['ids', 'layer']),
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
    value: {
      type: 'object',
      description: 'Optional initial component value; known components use catalog defaults when omitted',
    },
  }, ['entity', 'type']),
  'component.add_many': objectSchema({
    entities: {
      ...entityIds('Entity ids that should receive the component together'),
      minItems: 1,
      maxItems: 256,
    },
    type: componentType,
    value: {
      type: 'object',
      description: 'Optional shared initial value; known components use catalog defaults when omitted',
    },
  }, ['entities', 'type']),
  'component.remove': objectSchema({
    entity: entityId(),
    type: componentType,
  }, ['entity', 'type']),
  'component.remove_many': objectSchema({
    entities: {
      ...entityIds('Entity ids that should lose the shared component together'),
      minItems: 1,
      maxItems: 256,
    },
    type: componentType,
  }, ['entities', 'type']),
  'component.set': objectSchema({
    entity: entityId(),
    type: componentType,
    value: { type: 'object', description: 'Complete component value' },
  }, ['entity', 'type', 'value']),
  'component.set_many': objectSchema({
    entities: {
      ...entityIds('Entity ids whose shared component should be replaced together'),
      minItems: 1,
      maxItems: 256,
    },
    type: componentType,
    value: { type: 'object', description: 'Complete shared component value' },
  }, ['entities', 'type', 'value']),
  'component.patch': objectSchema({
    entity: entityId(),
    type: componentType,
    patch: { type: 'object', description: 'Fields to shallow-merge' },
  }, ['entity', 'type', 'patch']),
  'component.patch_many': objectSchema({
    entities: {
      ...entityIds('Entity ids whose shared component should be patched together'),
      minItems: 1,
      maxItems: 256,
    },
    type: componentType,
    patch: { type: 'object', description: 'Shared fields to shallow-merge' },
  }, ['entities', 'type', 'patch']),
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
  'rect.set': objectSchema({
    entity: entityId(),
    anchoredPosition: finiteTuple(2, 'Anchored position [x, y]'),
    sizeDelta: finiteTuple(2, 'Size delta [width, height]'),
    pivot: {
      ...finiteTuple(2, 'Normalized pivot [x, y]'),
      items: { type: 'number', minimum: 0, maximum: 1 },
    },
    anchorMin: {
      ...finiteTuple(2, 'Normalized minimum anchor [x, y]'),
      items: { type: 'number', minimum: 0, maximum: 1 },
    },
    anchorMax: {
      ...finiteTuple(2, 'Normalized maximum anchor [x, y]'),
      items: { type: 'number', minimum: 0, maximum: 1 },
    },
    localRotation: numberValue('Local Z rotation in degrees'),
    localScale: finiteTuple(2, 'Local UI scale [x, y]'),
  }, ['entity'], {
    anyOf: [
      { required: ['anchoredPosition'] },
      { required: ['sizeDelta'] },
      { required: ['pivot'] },
      { required: ['anchorMin'] },
      { required: ['anchorMax'] },
      { required: ['localRotation'] },
      { required: ['localScale'] },
    ],
  }),
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
    distance: numberValue('Orbit distance; clamped to 0.5..1000000'),
    pivot: finiteTuple(3, 'Orbit pivot [x, y, z]'),
  }, [], {
    anyOf: [
      { required: ['yaw'] },
      { required: ['pitch'] },
      { required: ['distance'] },
      { required: ['pivot'] },
    ],
  }),
  'view.set_game_resolution': objectSchema({
    resolution: {
      oneOf: [
        objectSchema({
          width: {
            type: 'integer',
            minimum: 1,
            maximum: 16_384,
          },
          height: {
            type: 'integer',
            minimum: 1,
            maximum: 16_384,
          },
        }, ['width', 'height']),
        { type: 'null' },
      ],
      description: 'Exact Game View pixels, or null for Free Aspect',
    },
  }, ['resolution']),
  'view.set_game_display': objectSchema({
    display: {
      type: 'integer',
      minimum: 0,
      maximum: 7,
      description: 'Zero-based output display index (0 is Display 1)',
    },
  }, ['display']),
  'view.set_scene_preferences': objectSchema({
    mode2D: booleanValue('Lock the Scene view to its 2D canvas plane'),
    gridVisible: booleanValue('Show the Scene 2D pixel grid'),
    smartGuidesEnabled: booleanValue(
      'Snap RectTransforms to sibling and Canvas guides',
    ),
    pivotMode: {
      type: 'string',
      enum: ['pivot', 'center'],
      description: 'Place transform handles at the pivot or selection center',
    },
    handleOrientation: {
      type: 'string',
      enum: ['local', 'global'],
      description: 'Orient transform handles in local or global axes',
    },
    snap: objectSchema({
      enabled: booleanValue('Enable persistent transform snapping'),
      move: {
        type: 'number',
        exclusiveMinimum: 0,
        maximum: 1_000_000,
        description: 'Move snap increment',
      },
      rotate: {
        type: 'number',
        exclusiveMinimum: 0,
        maximum: 1_000_000,
        description: 'Rotation snap increment in degrees',
      },
      scale: {
        type: 'number',
        exclusiveMinimum: 0,
        maximum: 1_000_000,
        description: 'Scale snap increment',
      },
    }, [], {
      anyOf: [
        { required: ['enabled'] },
        { required: ['move'] },
        { required: ['rotate'] },
        { required: ['scale'] },
      ],
    }),
  }, [], {
    anyOf: [
      { required: ['mode2D'] },
      { required: ['gridVisible'] },
      { required: ['smartGuidesEnabled'] },
      { required: ['pivotMode'] },
      { required: ['handleOrientation'] },
      { required: ['snap'] },
    ],
  }),
  'view.set_timeline_preferences': objectSchema({
    animationTimeline: objectSchema({
      timeDisplayMode: {
        type: 'string',
        enum: ['frames', 'seconds'],
        description: 'Display Animation Timeline time as frames or seconds',
      },
      snapping: booleanValue(
        'Snap Animation Timeline keys and events to frame-aligned targets',
      ),
    }, [], {
      anyOf: [
        { required: ['timeDisplayMode'] },
        { required: ['snapping'] },
      ],
    }),
    sequencer: objectSchema({
      snapping: booleanValue(
        'Snap Sequencer clips and markers to editing targets',
      ),
      rippleMode: booleanValue(
        'Shift the affected track suffix while moving Sequencer items',
      ),
      inspectorOpen: booleanValue('Show the Sequencer Inspector'),
      loopPreview: booleanValue('Loop the Sequencer edit preview range'),
    }, [], {
      anyOf: [
        { required: ['snapping'] },
        { required: ['rippleMode'] },
        { required: ['inspectorOpen'] },
        { required: ['loopPreview'] },
      ],
    }),
  }, [], {
    anyOf: [
      { required: ['animationTimeline'] },
      { required: ['sequencer'] },
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
  'window.close': objectSchema({
    windowLabel: stringValue('Exact registered editor-* label returned by window.list'),
  }, ['windowLabel']),
  'window.open_editor': objectSchema({
    typeId: {
      type: 'string',
      minLength: 1,
      maxLength: 256,
      description: 'Exact registered type id returned by window.types',
    },
  }, ['typeId']),
  'window.ui_click': objectSchema({
    ...uiInteractionContext,
    ...uiModifierContext,
    ...uiPointerOffsetContext,
    selector: stringValue('Exact selector returned by window.ui_snapshot'),
  }, uiInteractionRequired),
  'window.ui_double_click': objectSchema({
    ...uiInteractionContext,
    ...uiModifierContext,
    ...uiPointerOffsetContext,
    selector: stringValue('Exact selector returned by window.ui_snapshot'),
  }, uiInteractionRequired),
  'window.ui_context_click': objectSchema({
    ...uiInteractionContext,
    ...uiModifierContext,
    ...uiPointerOffsetContext,
    selector: stringValue('Exact selector returned by window.ui_snapshot'),
  }, uiInteractionRequired),
  'window.ui_set_value': objectSchema({
    ...uiInteractionContext,
    selector: stringValue('Exact selector returned by window.ui_snapshot'),
    value: stringValue('New form control value'),
  }, [...uiInteractionRequired, 'value']),
  'window.ui_scroll_into_view': objectSchema({
    ...uiInteractionContext,
    selector: stringValue('Exact offscreen selector returned by window.ui_snapshot'),
  }, uiInteractionRequired),
  'window.ui_scroll': objectSchema({
    ...uiInteractionContext,
    ...uiModifierContext,
    ...uiPointerOffsetContext,
    selector: stringValue('Exact scrollable selector returned by window.ui_snapshot'),
    deltaX: {
      type: 'number',
      minimum: -1_000_000,
      maximum: 1_000_000,
      description: 'Horizontal CSS-pixel delta; default 0',
    },
    deltaY: {
      type: 'number',
      minimum: -1_000_000,
      maximum: 1_000_000,
      description: 'Vertical CSS-pixel delta; default 0',
    },
  }, uiInteractionRequired),
  'window.ui_drag_to': objectSchema({
    ...uiInteractionContext,
    ...uiModifierContext,
    ...uiPointerOffsetContext,
    ...uiTargetPointerOffsetContext,
    selector: stringValue('Exact draggable source selector returned by window.ui_snapshot'),
    targetSelector: stringValue('Exact drop target selector returned by window.ui_snapshot'),
  }, [...uiInteractionRequired, 'targetSelector']),
  'window.ui_drag_by': objectSchema({
    ...uiInteractionContext,
    ...uiModifierContext,
    ...uiPointerOffsetContext,
    selector: stringValue('Exact pointer-gesture selector returned by window.ui_snapshot'),
    button: {
      type: 'string',
      enum: ['left', 'middle', 'right'],
      description: 'Mouse button held during the pointer gesture; default left',
    },
    path: {
      type: 'array',
      minItems: 1,
      maxItems: 64,
      items: objectSchema({
        deltaX: {
          type: 'number',
          minimum: -1_000_000,
          maximum: 1_000_000,
          description: 'Cumulative horizontal CSS-pixel displacement from the gesture start',
        },
        deltaY: {
          type: 'number',
          minimum: -1_000_000,
          maximum: 1_000_000,
          description: 'Cumulative vertical CSS-pixel displacement from the gesture start',
        },
      }, ['deltaX', 'deltaY']),
      description: 'Optional bounded multi-segment path; mutually exclusive with deltaX and deltaY',
    },
    deltaX: {
      type: 'number',
      minimum: -1_000_000,
      maximum: 1_000_000,
      description: 'Horizontal CSS-pixel displacement; may be zero',
    },
    deltaY: {
      type: 'number',
      minimum: -1_000_000,
      maximum: 1_000_000,
      description: 'Vertical CSS-pixel displacement; may be zero',
    },
  }, uiInteractionRequired, {
    anyOf: [
      { required: ['deltaX', 'deltaY'] },
      { required: ['path'] },
    ],
  }),
  'window.ui_hover': objectSchema({
    ...uiInteractionContext,
    ...uiPointerOffsetContext,
    selector: stringValue('Exact hover-capable selector returned by window.ui_snapshot'),
    state: {
      type: 'string',
      enum: ['enter', 'leave'],
      description: 'Hover transition to dispatch; default enter',
    },
  }, uiInteractionRequired),
  'window.ui_press_key': objectSchema({
    ...uiInteractionContext,
    ...uiModifierContext,
    selector: stringValue('Exact keyboard target selector returned by window.ui_snapshot'),
    key: {
      anyOf: [
        {
          type: 'string',
          enum: [
            'Enter',
            'Escape',
            'Tab',
            'Space',
            'ArrowUp',
            'ArrowDown',
            'ArrowLeft',
            'ArrowRight',
            'Home',
            'End',
            'PageUp',
            'PageDown',
            'Backspace',
            'Delete',
            'F1',
            'F2',
            'F3',
            'F4',
            'F5',
            'F6',
            'F7',
            'F8',
            'F9',
            'F10',
            'F11',
            'F12',
            'F13',
            'F14',
            'F15',
            'F16',
            'F17',
            'F18',
            'F19',
            'F20',
            'F21',
            'F22',
            'F23',
            'F24',
          ],
        },
        {
          type: 'string',
          pattern: '^[^\\p{Cc}\\p{Cs}\\p{Z}]$',
        },
      ],
      description: 'Allow-listed semantic key or one printable non-whitespace character with optional modifier flags',
    },
  }, [...uiInteractionRequired, 'key']),
};

export const COMMAND_EXECUTION_OPTIONS_SCHEMA: AgentJsonSchema = objectSchema({
  screenshot: booleanValue('Capture a background-safe screenshot after the command'),
  expectedSceneRevision: {
    type: 'integer',
    minimum: 0,
    description: 'Optimistic scene revision lock checked before any command mutation',
  },
});
