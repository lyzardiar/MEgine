import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const idlSchema = JSON.parse(fs.readFileSync(
  path.resolve(root, '..', 'api', 'src', 'generated', 'schema.json'),
  'utf8',
));
const server = await createServer({
  root,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true },
});
const {
  componentRequirements,
  getComponentCatalog,
} = await server.ssrLoadModule('/src/componentCatalog.ts');
const { buildAgentComponentSchema } = await server.ssrLoadModule('/src/agent/componentSchema.ts');
const { BUILTIN_INSPECTOR_FIELDS } = await server.ssrLoadModule('/src/inspectorMetadata.ts');
test.after(() => server.close());

test('every IDL-backed component catalog default covers its exact serialized fields', () => {
  for (const entry of getComponentCatalog()) {
    const schema = idlSchema[entry.type];
    if (!schema) continue;
    const defaults = entry.create() ?? {};
    assert.deepEqual(
      Object.keys(defaults).sort(),
      Object.keys(schema.properties ?? {}).sort(),
      `${entry.type} defaults drifted from its generated IDL schema`,
    );
  }
});

test('Inspector metadata never targets a missing catalog field', () => {
  const catalog = new Map(getComponentCatalog().map((entry) => [entry.type, entry]));
  for (const [type, metadata] of Object.entries(BUILTIN_INSPECTOR_FIELDS)) {
    const entry = catalog.get(type);
    assert.ok(entry, `${type} Inspector metadata has no component catalog entry`);
    const defaults = entry.create() ?? {};
    for (const field of Object.keys(metadata)) {
      assert.ok(field in defaults, `${type}.${field} Inspector metadata targets a missing field`);
    }
  }
});

test('rendered and layout UI components require an authored RectTransform', () => {
  const rectTransformComponents = [
    'CanvasRenderer',
    'AspectRatioFitter',
    'ContentSizeFitter',
    'Image',
    'RawImage',
    'Button',
    'Text',
    'Toggle',
    'Slider',
    'Scrollbar',
    'Panel',
    'LayoutGroup',
    'RectMask2D',
    'Mask',
    'ProgressBar',
    'InputField',
    'Dropdown',
    'ListView',
    'ScrollView',
    'TabView',
  ];
  for (const type of rectTransformComponents) {
    assert.ok(
      componentRequirements(type).includes('RectTransform'),
      `${type} must add and retain RectTransform`,
    );
    assert.ok(
      buildAgentComponentSchema(type)?.requires.includes('RectTransform'),
      `${type} Agent schema must expose the RectTransform dependency`,
    );
  }
});

test('authored Graphic components require a CanvasRenderer visible to Agents', () => {
  for (const type of ['Image', 'RawImage', 'Text', 'Panel']) {
    assert.ok(
      componentRequirements(type).includes('CanvasRenderer'),
      `${type} must retain its CanvasRenderer`,
    );
    assert.ok(
      buildAgentComponentSchema(type)?.requires.includes('CanvasRenderer'),
      `${type} Agent schema must expose its CanvasRenderer dependency`,
    );
  }
  const renderer = buildAgentComponentSchema('CanvasRenderer');
  assert.deepEqual(renderer?.fields.map(({ name, default: value, editable, hidden }) => ({
    name,
    default: value,
    editable,
    hidden,
  })), [{
    name: 'cull_transparent_mesh',
    default: true,
    editable: true,
    hidden: false,
  }]);
});

test('Agent schema exposes Canvas additional shader channels as an editable mask', () => {
  const field = buildAgentComponentSchema('Canvas')?.fields.find(
    ({ name }) => name === 'additional_shader_channels',
  );
  assert.deepEqual({
    type: field?.type,
    default: field?.default,
    editable: field?.editable,
    hidden: field?.hidden,
  }, {
    type: 'number',
    default: 0,
    editable: true,
    hidden: false,
  });
});

test('AudioSource playback time is authorable through Inspector and Agent schema', () => {
  const audioSource = buildAgentComponentSchema('AudioSource');
  const time = audioSource?.fields.find((field) => field.name === 'time');
  assert.deepEqual(time, {
    name: 'time',
    type: 'number',
    default: 0,
    editable: true,
    hidden: false,
    label: undefined,
    kind: undefined,
    options: undefined,
    assetKinds: undefined,
    referenceType: undefined,
    allowNone: undefined,
    noneValue: undefined,
    min: 0,
    max: undefined,
    step: 0.01,
    visibleWhen: undefined,
    multiline: false,
  });
});

test('Canvas sorting and batching controls are exposed to Agents', () => {
  const canvas = buildAgentComponentSchema('Canvas');
  assert.equal(canvas?.fields.find((field) => field.name === 'sorting_layer')?.kind, 'enum');
  assert.deepEqual(
    canvas?.fields.find((field) => field.name === 'normalized_sorting_grid_size'),
    {
      name: 'normalized_sorting_grid_size',
      type: 'number',
      default: 0.1,
      editable: true,
      hidden: false,
      label: 'Normalized Sorting Grid Size',
      kind: undefined,
      options: undefined,
      assetKinds: undefined,
      referenceType: undefined,
      allowNone: undefined,
      noneValue: undefined,
      min: 0,
      max: undefined,
      step: 0.01,
      visibleWhen: undefined,
      multiline: false,
    },
  );
});
