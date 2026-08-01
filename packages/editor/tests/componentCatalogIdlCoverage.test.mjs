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
const { getComponentCatalog } = await server.ssrLoadModule('/src/componentCatalog.ts');
const { buildAgentComponentSchema } = await server.ssrLoadModule('/src/agent/componentSchema.ts');
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
