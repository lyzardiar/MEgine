import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { RESOURCES, TOOLS } from '../../agent/mcp/server.mjs';
import { QUERY_META } from '../src/agent/querySchemas.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Agent scene snapshot discovery distinguishes active and authored worlds', () => {
  const activeQuery = QUERY_META.find((query) => query.id === 'scene.snapshot');
  const authoredQuery = QUERY_META.find(
    (query) => query.id === 'scene.authored_snapshot',
  );
  assert.match(activeQuery?.description ?? '', /active scene snapshot/i);
  assert.match(activeQuery?.description ?? '', /live runtime clone/i);
  assert.match(authoredQuery?.description ?? '', /authored scene/i);

  const activeTool = TOOLS.find((tool) => tool.name === 'get_scene_snapshot');
  const authoredTool = TOOLS.find(
    (tool) => tool.name === 'get_authored_scene_snapshot',
  );
  assert.match(activeTool?.description ?? '', /active scene snapshot/i);
  assert.match(activeTool?.description ?? '', /Play or Pause/i);
  assert.match(authoredTool?.description ?? '', /untouched authored scene/i);

  const activeResource = RESOURCES.find(
    (resource) => resource.uri === 'mengine://scene/snapshot',
  );
  const authoredResource = RESOURCES.find(
    (resource) => resource.uri === 'mengine://scene/authored',
  );
  assert.equal(activeResource?.bridgeQuery, 'scene.snapshot');
  assert.equal(authoredResource?.bridgeQuery, 'scene.authored_snapshot');
});

test('AgentBridge returns explicit active and authored snapshot sources', () => {
  const bridge = fs.readFileSync(
    path.join(root, 'src', 'agent', 'AgentBridge.ts'),
    'utf8',
  );
  const active = bridge.slice(
    bridge.indexOf('getSceneSnapshot(): unknown'),
    bridge.indexOf('getAuthoredSceneSnapshot(): unknown'),
  );
  const authored = bridge.slice(
    bridge.indexOf('getAuthoredSceneSnapshot(): unknown'),
    bridge.indexOf('getHierarchy(): HierarchyNode[]'),
  );

  assert.match(active, /source: 'active'/);
  assert.match(active, /mode: store\.mode/);
  assert.match(active, /\.\.\.store\.snapshot\(\)/);
  assert.match(authored, /source: 'authored'/);
  assert.match(authored, /entities: store\.authoredEntities\(\)/);
  assert.match(authored, /contentFingerprint: store\.sceneContentFingerprint\(\)/);
});
