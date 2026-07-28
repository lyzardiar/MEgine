import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schema = fs.readFileSync(
  path.join(root, 'src', 'agent', 'componentSchema.ts'),
  'utf8',
);
const inspector = fs.readFileSync(
  path.join(root, 'src', 'inspectorMetadata.ts'),
  'utf8',
);
const behaviour = fs.readFileSync(
  path.join(root, 'src', 'behaviours', 'AutoRotate.ts'),
  'utf8',
);

test('component discovery merges real Inspector and Behaviour authoring metadata', () => {
  assert.match(schema, /BUILTIN_INSPECTOR_FIELDS/);
  assert.match(schema, /behaviour\.fields/);
  assert.match(schema, /behaviour\?\.methods\.map/);
  assert.match(schema, /field\.enumOptions/);
  assert.match(schema, /field\.assetKinds/);
  assert.match(schema, /field\.showIf/);
  assert.match(schema, /metadata\?\.visibleWhen/);
  assert.match(schema, /editable: !field\.hideInInspector && !field\.readOnly/);
  assert.match(schema, /type: 'Transform'/);
});

test('source metadata includes conditional built-ins and invokable Behaviour methods', () => {
  assert.match(inspector, /Camera3D:[\s\S]*projection:[\s\S]*kind: 'enum'/);
  assert.match(inspector, /fov_y_degrees:[\s\S]*min: 1,[\s\S]*max: 179/);
  assert.match(inspector, /visibleWhen: \{ field: 'projection', equals: 'perspective' \}/);
  assert.match(behaviour, /@Range\(0, 720\)/);
  assert.match(behaviour, /@Button\('Reset Angle'\)/);
  assert.match(behaviour, /@ContextMenu\('Zero Rotation Rate'\)/);
});
