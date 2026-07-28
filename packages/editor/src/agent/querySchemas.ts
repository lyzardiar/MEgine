import { AGENT_EVENT_TOPICS } from './eventJournal.ts';
import type { AgentJsonSchema } from './commandSchemas.ts';

type SchemaProperties = Record<string, AgentJsonSchema>;

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

const stringValue = (description?: string): AgentJsonSchema => ({
  type: 'string',
  ...(description ? { description } : {}),
});

const nonEmptyString = (description?: string): AgentJsonSchema => ({
  type: 'string',
  minLength: 1,
  pattern: '\\S',
  ...(description ? { description } : {}),
});

const entityId = (description = 'Entity id'): AgentJsonSchema => ({
  type: 'integer',
  minimum: 0,
  description,
});

const boundedInteger = (
  minimum: number,
  maximum: number,
  description?: string,
): AgentJsonSchema => ({
  type: 'integer',
  minimum,
  maximum,
  ...(description ? { description } : {}),
});

const emptySchema = objectSchema();

export const QUERY_PARAMS_SCHEMAS: Record<string, AgentJsonSchema> = {
  'editor.state': emptySchema,
  'project.state': emptySchema,
  'project.recent': emptySchema,
  'dialog.state': objectSchema({
    windowLabel: stringValue('Window label from window.list; default main'),
  }),
  'project.settings': emptySchema,
  'selection.get': emptySchema,
  'scene.snapshot': emptySchema,
  'scene.diff': objectSchema({
    fromRevision: {
      type: 'integer',
      minimum: 0,
      description: 'Revision returned by scene.snapshot or a previous scene.diff result',
    },
  }, ['fromRevision']),
  'scene.hierarchy': emptySchema,
  'prefab.instance': objectSchema({
    entity: entityId('Any entity in the prefab instance'),
  }, ['entity']),
  'scene.list': emptySchema,
  'scene.delete_preview': objectSchema({
    name: nonEmptyString('Existing scene name, with or without .mscene'),
  }, ['name']),
  'entity.get': objectSchema({
    id: entityId(),
    name: nonEmptyString('Exact entity name'),
  }, [], {
    anyOf: [
      { required: ['id'] },
      { required: ['name'] },
    ],
  }),
  'entity.find': objectSchema({
    name: nonEmptyString('Case-insensitive entity name substring'),
    component: nonEmptyString('Exact component type'),
    active: { type: 'boolean', description: 'Filter by active state' },
    limit: boundedInteger(1, 1_000, 'Maximum matches; default 100'),
    offset: boundedInteger(0, 1_000_000, 'Zero-based match cursor; default 0'),
    expectedSceneRevision: boundedInteger(
      0,
      Number.MAX_SAFE_INTEGER,
      'sceneRevision from the first page; required when offset is greater than 0',
    ),
  }, [], {
    anyOf: [
      {
        properties: {
          offset: { type: 'integer', maximum: 0 },
        },
      },
      {
        required: ['offset', 'expectedSceneRevision'],
        properties: {
          offset: { type: 'integer', minimum: 1 },
        },
      },
    ],
  }),
  'entity.get_component': objectSchema({
    id: entityId(),
    component: nonEmptyString('Exact component type'),
  }, ['id', 'component']),
  'view.screenshot': objectSchema({
    target: {
      type: 'string',
      enum: ['scene', 'game'],
      description: 'Rendered viewport; default scene',
    },
    format: {
      type: 'string',
      enum: ['image/png', 'image/jpeg'],
      description: 'Image encoding; default image/png',
    },
    quality: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'JPEG quality from 0 to 1',
    },
  }),
  'view.window_screenshot': objectSchema({
    windowLabel: stringValue('Window label from window.list; default main'),
  }),
  'window.list': emptySchema,
  'window.types': emptySchema,
  'workspace.documents': emptySchema,
  'window.ui_snapshot': objectSchema({
    windowLabel: stringValue('Window label from window.list; default main'),
    maxElements: boundedInteger(50, 5_000, 'Maximum semantic elements; default 2000'),
    offset: boundedInteger(0, 1_000_000, 'Zero-based semantic element cursor; default 0'),
    expectedSnapshotRevision: {
      type: 'string',
      pattern: '^ui-v\\d+-\\d+-[0-9a-f]{16}$',
      maxLength: 64,
      description: 'snapshotRevision from the first page; required when offset is greater than 0',
    },
  }, [], {
    anyOf: [
      {
        properties: {
          offset: { type: 'integer', maximum: 0 },
        },
      },
      {
        required: ['offset', 'expectedSnapshotRevision'],
        properties: {
          offset: { type: 'integer', minimum: 1 },
        },
      },
    ],
  }),
  'window.ui_content': objectSchema({
    windowLabel: stringValue('Window label from window.list; default main'),
    selector: nonEmptyString('Exact selector returned by window.ui_snapshot'),
    field: {
      type: 'string',
      enum: ['text', 'value'],
      description: 'Exact content source to read',
    },
    offset: boundedInteger(0, 10_000_000, 'Zero-based UTF-16 character cursor; default 0'),
    maxChars: boundedInteger(1, 100_000, 'Maximum characters; default 10000'),
    expectedContentRevision: {
      type: 'string',
      pattern: '^content-v\\d+-\\d+-[0-9a-f]{16}$',
      maxLength: 72,
      description: 'contentRevision from the first page; required when offset is greater than 0',
    },
  }, ['selector', 'field'], {
    anyOf: [
      {
        properties: {
          offset: { type: 'integer', maximum: 0 },
        },
      },
      {
        required: ['offset', 'expectedContentRevision'],
        properties: {
          offset: { type: 'integer', minimum: 1 },
        },
      },
    ],
  }),
  'panel.get_layout': emptySchema,
  'menu.list': objectSchema({
    root: nonEmptyString('Optional exact root menu name'),
  }),
  'asset.list': objectSchema({
    search: stringValue('Case-insensitive path or name substring'),
    kind: stringValue('Exact asset kind'),
    folder: nonEmptyString('Assets folder prefix'),
    limit: boundedInteger(1, 5_000, 'Maximum assets; default 1000'),
    offset: boundedInteger(0, 1_000_000, 'Zero-based asset cursor; default 0'),
    expectedIndexRevision: {
      type: 'string',
      pattern: '^asset-index-v\\d+-\\d+-[0-9a-f]{16}$',
      maxLength: 80,
      description: 'indexRevision from the first page; required when offset is greater than 0',
    },
  }, [], {
    anyOf: [
      {
        properties: {
          offset: { type: 'integer', maximum: 0 },
        },
      },
      {
        required: ['offset', 'expectedIndexRevision'],
        properties: {
          offset: { type: 'integer', minimum: 1 },
        },
      },
    ],
  }),
  'asset.read_text': objectSchema({
    path: nonEmptyString('Project-relative text asset path under Assets/'),
    maxBytes: boundedInteger(1, 8_388_608, 'Maximum UTF-8 bytes; default 1 MiB'),
  }, ['path']),
  'asset.find_references': objectSchema({
    path: nonEmptyString('Project-relative asset path under Assets/'),
  }, ['path']),
  'asset.rename_preview': objectSchema({
    sourcePath: nonEmptyString('Existing source asset path under Assets/'),
    destinationPath: nonEmptyString('Unused destination path under Assets/'),
  }, ['sourcePath', 'destinationPath']),
  'asset.duplicate_preview': objectSchema({
    sourcePath: nonEmptyString('Existing source asset path under Assets/'),
    destinationPath: nonEmptyString('Unused destination path under Assets/'),
  }, ['sourcePath', 'destinationPath']),
  'asset.trash_preview': objectSchema({
    sourcePath: nonEmptyString('Existing source asset path under Assets/'),
  }, ['sourcePath']),
  'asset.trash_list': emptySchema,
  'build.settings': emptySchema,
  'build.status': emptySchema,
  'build.artifact_status': emptySchema,
  'build.history': objectSchema({
    limit: boundedInteger(1, 100, 'Maximum history entries; default 20'),
  }),
  'build.patches': objectSchema({
    limit: boundedInteger(1, 100, 'Maximum patch entries; default 50'),
  }),
  'build.history.compare': objectSchema({
    previousId: nonEmptyString('Older build history id'),
    currentId: nonEmptyString('Newer build history id'),
  }, ['previousId', 'currentId']),
  'console.get_logs': objectSchema({
    level: {
      type: 'string',
      enum: ['info', 'warn', 'error'],
      description: 'Optional log level',
    },
    since: { type: 'number', description: 'Minimum epoch-millisecond timestamp' },
    limit: boundedInteger(1, 300, 'Maximum recent entries'),
  }),
  'profiler.get_samples': objectSchema({
    source: {
      type: 'string',
      enum: ['scene', 'game'],
      description: 'Viewport sample source; default game',
    },
    limit: boundedInteger(1, 480, 'Maximum recent samples; default 120'),
  }),
  'events.get': objectSchema({
    afterSequence: {
      type: 'integer',
      minimum: 0,
      description: 'Exclusive event cursor; default 0',
    },
    topics: {
      type: 'array',
      items: { type: 'string', enum: [...AGENT_EVENT_TOPICS] },
      description: 'Optional event topic filter',
    },
    limit: boundedInteger(1, 1_000, 'Maximum events; default 100'),
  }),
  'events.wait': objectSchema({
    afterSequence: {
      type: 'integer',
      minimum: 0,
      description: 'Exact event cursor returned by editor.state, events.get, or events.wait',
    },
    topics: {
      type: 'array',
      items: { type: 'string', enum: [...AGENT_EVENT_TOPICS] },
      description: 'Optional event topic filter',
    },
    limit: boundedInteger(1, 1_000, 'Maximum events; default 100'),
    timeoutMs: boundedInteger(0, 15_000, 'Maximum wait duration; default 15000'),
  }, ['afterSequence']),
  'commands.list': emptySchema,
  'commands.describe': objectSchema({
    id: nonEmptyString('Exact command id returned by commands.list'),
  }, ['id']),
  'intents.list': emptySchema,
  'schema.components': emptySchema,
  'schema.component': objectSchema({
    type: nonEmptyString('Exact component type'),
  }),
  'queries.list': emptySchema,
  'queries.describe': objectSchema({
    id: nonEmptyString('Exact query id returned by queries.list'),
  }, ['id']),
};

export interface QuerySummary {
  id: string;
  category: string;
  description: string;
  readOnly: true;
}

export interface QueryMeta extends QuerySummary {
  paramsSchema: AgentJsonSchema;
}

const QUERY_SUMMARIES: QuerySummary[] = [
  { id: 'editor.state', category: 'editor', description: 'Read mounted editor, scene, history, view, and revision state', readOnly: true },
  { id: 'project.state', category: 'project', description: 'Read project lifecycle state before or after a project opens', readOnly: true },
  { id: 'project.recent', category: 'project', description: 'List recent projects without opening a dialog', readOnly: true },
  { id: 'dialog.state', category: 'dialog', description: 'Read the active non-blocking editor dialog for one window', readOnly: true },
  { id: 'project.settings', category: 'project', description: 'Read revision-safe project tags, layers, and sorting layers', readOnly: true },
  { id: 'selection.get', category: 'selection', description: 'Read the current entity selection', readOnly: true },
  { id: 'scene.snapshot', category: 'scene', description: 'Read the complete authored scene snapshot and revision', readOnly: true },
  { id: 'scene.diff', category: 'scene', description: 'Read incremental scene changes since a revision', readOnly: true },
  { id: 'scene.hierarchy', category: 'scene', description: 'Read the complete scene hierarchy as a compact tree', readOnly: true },
  { id: 'prefab.instance', category: 'prefab', description: 'Resolve prefab linkage and the exact asset revision for an entity', readOnly: true },
  { id: 'scene.list', category: 'scene', description: 'List saved scenes and the active scene', readOnly: true },
  { id: 'scene.delete_preview', category: 'scene', description: 'Preview permanent scene deletion and obtain a guarded token', readOnly: true },
  { id: 'entity.get', category: 'entity', description: 'Read one entity and all its components by id or name', readOnly: true },
  { id: 'entity.find', category: 'entity', description: 'Find entities by name, component, or active state', readOnly: true },
  { id: 'entity.get_component', category: 'entity', description: 'Read one exact component value from an entity', readOnly: true },
  { id: 'view.screenshot', category: 'view', description: 'Capture a Scene or Game viewport without activating a window', readOnly: true },
  { id: 'view.window_screenshot', category: 'window', description: 'Capture a complete editor window without activating it', readOnly: true },
  { id: 'window.list', category: 'window', description: 'List every native editor window with visibility and focus state', readOnly: true },
  { id: 'window.types', category: 'window', description: 'List registered auxiliary editor window types', readOnly: true },
  { id: 'workspace.documents', category: 'workspace', description: 'List open scene and resource documents with dirty state', readOnly: true },
  { id: 'window.ui_snapshot', category: 'window', description: 'Read paged semantic content for any editor window', readOnly: true },
  { id: 'window.ui_content', category: 'window', description: 'Read exact paged text or value content for a semantic selector', readOnly: true },
  { id: 'panel.get_layout', category: 'panel', description: 'Read the complete dock, tab, and detached-panel layout', readOnly: true },
  { id: 'menu.list', category: 'menu', description: 'List registered menu items and Agent-safe invocation metadata', readOnly: true },
  { id: 'asset.list', category: 'asset', description: 'List and filter the paged project asset index', readOnly: true },
  { id: 'asset.read_text', category: 'asset', description: 'Read a bounded UTF-8 text asset and its revision', readOnly: true },
  { id: 'asset.find_references', category: 'asset', description: 'Find project references to an exact asset', readOnly: true },
  { id: 'asset.rename_preview', category: 'asset', description: 'Preview a reference-aware asset rename', readOnly: true },
  { id: 'asset.duplicate_preview', category: 'asset', description: 'Preview a GUID-safe asset duplicate', readOnly: true },
  { id: 'asset.trash_preview', category: 'asset', description: 'Preview guarded recoverable asset deletion', readOnly: true },
  { id: 'asset.trash_list', category: 'asset', description: 'List recoverable project Trash entries', readOnly: true },
  { id: 'build.settings', category: 'build', description: 'Read revision-safe PC build settings', readOnly: true },
  { id: 'build.status', category: 'build', description: 'Read the active or latest PC build job', readOnly: true },
  { id: 'build.artifact_status', category: 'build', description: 'Read the active or latest build artifact job', readOnly: true },
  { id: 'build.history', category: 'build', description: 'Read bounded PC build history', readOnly: true },
  { id: 'build.patches', category: 'build', description: 'Read bounded signed build patch inventory', readOnly: true },
  { id: 'build.history.compare', category: 'build', description: 'Compare two exact archived build manifests', readOnly: true },
  { id: 'console.get_logs', category: 'console', description: 'Read filtered structured editor logs', readOnly: true },
  { id: 'profiler.get_samples', category: 'profiler', description: 'Read bounded editor Canvas preview timing samples', readOnly: true },
  { id: 'events.get', category: 'events', description: 'Read currently buffered editor events from an exact cursor', readOnly: true },
  { id: 'events.wait', category: 'events', description: 'Wait up to 15 seconds for matching editor events without polling', readOnly: true },
  { id: 'commands.list', category: 'discovery', description: 'List every supported write command', readOnly: true },
  { id: 'commands.describe', category: 'discovery', description: 'Describe one write command and its complete parameter schema', readOnly: true },
  { id: 'intents.list', category: 'discovery', description: 'List supported high-level editor intents and schemas', readOnly: true },
  { id: 'schema.components', category: 'schema', description: 'List all component schemas', readOnly: true },
  { id: 'schema.component', category: 'schema', description: 'Describe one exact component type', readOnly: true },
  { id: 'queries.list', category: 'discovery', description: 'List every supported read query', readOnly: true },
  { id: 'queries.describe', category: 'discovery', description: 'Describe one read query and its complete parameter schema', readOnly: true },
];

export const QUERY_META: QueryMeta[] = QUERY_SUMMARIES.map((summary) => {
  const paramsSchema = QUERY_PARAMS_SCHEMAS[summary.id];
  if (!paramsSchema) {
    throw new Error(`Agent query "${summary.id}" is missing its params schema`);
  }
  return { ...summary, paramsSchema };
});
