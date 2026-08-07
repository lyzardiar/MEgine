import type { AgentJsonSchema } from './commandSchemas.ts';
import { FIGMA_COMPONENT_KINDS, FIGMA_IMPORT_MAX_NODES } from '../ui/figmaImport.ts';

const nodeId: AgentJsonSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9:;._-]+$',
};

const color: AgentJsonSchema = {
  type: 'array',
  minItems: 4,
  maxItems: 4,
  items: { type: 'number', minimum: 0, maximum: 1 },
};

const bounds: AgentJsonSchema = {
  type: 'object',
  required: ['x', 'y', 'width', 'height'],
  properties: {
    x: { type: 'number' },
    y: { type: 'number' },
    width: { type: 'number', minimum: 0 },
    height: { type: 'number', minimum: 0 },
  },
  additionalProperties: false,
};

const textStyle: AgentJsonSchema = {
  type: 'object',
  properties: {
    fontFamily: { type: 'string', maxLength: 128 },
    fontSize: { type: 'number', minimum: 0, maximum: 2_048 },
    fontWeight: { type: 'number', minimum: 1, maximum: 1_000 },
    italic: { type: 'boolean' },
    textAlignHorizontal: { type: 'string', enum: ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'] },
    textAlignVertical: { type: 'string', enum: ['TOP', 'CENTER', 'BOTTOM'] },
    lineHeightPx: { type: 'number', minimum: 0, maximum: 8_192 },
    textAutoResize: { type: 'string', enum: ['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'] },
  },
  additionalProperties: false,
};

const layout: AgentJsonSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID'] },
    wrap: { type: 'string', enum: ['NO_WRAP', 'WRAP'] },
    itemSpacing: { type: 'number', minimum: -10_000, maximum: 10_000 },
    paddingLeft: { type: 'number', minimum: 0, maximum: 100_000 },
    paddingRight: { type: 'number', minimum: 0, maximum: 100_000 },
    paddingTop: { type: 'number', minimum: 0, maximum: 100_000 },
    paddingBottom: { type: 'number', minimum: 0, maximum: 100_000 },
    primaryAlign: { type: 'string', enum: ['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'] },
    counterAlign: { type: 'string', enum: ['MIN', 'CENTER', 'MAX', 'BASELINE'] },
    sizingHorizontal: { type: 'string', enum: ['FIXED', 'HUG', 'FILL'] },
    sizingVertical: { type: 'string', enum: ['FIXED', 'HUG', 'FILL'] },
  },
  additionalProperties: false,
};

const constraints: AgentJsonSchema = {
  type: 'object',
  properties: {
    horizontal: { type: 'string', enum: ['LEFT', 'RIGHT', 'CENTER', 'LEFT_RIGHT', 'SCALE'] },
    vertical: { type: 'string', enum: ['TOP', 'BOTTOM', 'CENTER', 'TOP_BOTTOM', 'SCALE'] },
  },
  additionalProperties: false,
};

const importNode: AgentJsonSchema = {
  type: 'object',
  required: ['id', 'parentId', 'name', 'type'],
  properties: {
    id: nodeId,
    parentId: { ...nodeId, type: ['string', 'null'] },
    name: { type: 'string', minLength: 1, maxLength: 256 },
    type: { type: 'string', minLength: 1, maxLength: 64 },
    componentId: nodeId,
    visible: { type: 'boolean' },
    opacity: { type: 'number', minimum: 0, maximum: 1 },
    rotation: { type: 'number', minimum: -360_000, maximum: 360_000 },
    clipsContent: { type: 'boolean' },
    bounds,
    fillColor: color,
    strokeColor: color,
    strokeWeight: { type: 'number', minimum: 0, maximum: 100_000 },
    cornerRadius: { type: 'number', minimum: 0, maximum: 100_000 },
    characters: { type: 'string', maxLength: 65_536 },
    textStyle,
    layout,
    constraints,
    requiresRasterization: { type: 'boolean' },
    rasterizeReason: { type: 'string', maxLength: 256 },
  },
  additionalProperties: false,
};

export const FIGMA_IMPORT_SOURCE_SCHEMA: AgentJsonSchema = {
  type: 'object',
  required: ['schemaVersion', 'fileKey', 'fileName', 'version', 'rootId', 'rootName', 'nodes'],
  properties: {
    schemaVersion: { const: 1 },
    fileKey: {
      type: 'string',
      minLength: 6,
      maxLength: 128,
      pattern: '^[A-Za-z0-9_-]+$',
    },
    fileName: { type: 'string', minLength: 1, maxLength: 256 },
    version: { type: 'string', minLength: 1, maxLength: 256 },
    rootId: nodeId,
    rootName: { type: 'string', minLength: 1, maxLength: 256 },
    truncated: { type: 'boolean' },
    nodes: {
      type: 'array',
      minItems: 1,
      maxItems: FIGMA_IMPORT_MAX_NODES,
      items: importNode,
    },
  },
  additionalProperties: false,
};

const componentMappings: AgentJsonSchema = {
  type: 'object',
  maxProperties: 512,
  additionalProperties: { type: 'string', enum: [...FIGMA_COMPONENT_KINDS] },
};

const commonProperties = {
  source: FIGMA_IMPORT_SOURCE_SCHEMA,
  componentMappings,
  maxNodes: {
    type: 'integer',
    minimum: 1,
    maximum: FIGMA_IMPORT_MAX_NODES,
  },
};

export const FIGMA_IMPORT_PLAN_PARAMS_SCHEMA: AgentJsonSchema = {
  type: 'object',
  required: ['source'],
  properties: commonProperties,
  additionalProperties: false,
};

export const FIGMA_IMPORT_COMMAND_PARAMS_SCHEMA: AgentJsonSchema = {
  type: 'object',
  required: ['source', 'expectedPlanRevision'],
  properties: {
    ...commonProperties,
    parent: {
      type: 'integer',
      minimum: 0,
      description: 'Existing Canvas or RectTransform parent; defaults to the current UI context',
    },
    expectedPlanRevision: {
      type: 'string',
      pattern: '^figma-plan-v1-[0-9a-f]{16}$',
      maxLength: 40,
    },
    assetPaths: {
      type: 'object',
      maxProperties: 256,
      additionalProperties: {
        type: 'string',
        minLength: 12,
        maxLength: 512,
        pattern: '^Assets/.+\\.png$',
      },
    },
  },
  additionalProperties: false,
};
