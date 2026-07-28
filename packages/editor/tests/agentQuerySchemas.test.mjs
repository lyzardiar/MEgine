import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { RESOURCES, TOOLS } from '../../agent/mcp/server.mjs';
import { AGENT_EVENT_TOPICS } from '../src/agent/eventJournal.ts';
import { validateAgentJsonSchema } from '../src/agent/jsonSchemaValidation.ts';
import {
  QUERY_META,
  QUERY_PARAMS_SCHEMAS,
} from '../src/agent/querySchemas.ts';

const editorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every AgentBridge query has one strict authoritative parameter schema', () => {
  const source = fs.readFileSync(
    path.join(editorRoot, 'src', 'agent', 'AgentBridge.ts'),
    'utf8',
  );
  const queryStart = source.indexOf('async query(');
  const queryEnd = source.indexOf('private requireStore()', queryStart);
  assert.ok(queryStart >= 0 && queryEnd > queryStart);
  const queryIds = [
    ...source.slice(queryStart, queryEnd).matchAll(/case '([^']+)'/g),
  ].map((match) => match[1]);
  const metaIds = QUERY_META.map((query) => query.id);

  assert.equal(new Set(queryIds).size, queryIds.length);
  assert.equal(new Set(metaIds).size, metaIds.length);
  assert.deepEqual([...metaIds].sort(), [...queryIds].sort());
  assert.deepEqual(
    Object.keys(QUERY_PARAMS_SCHEMAS).sort(),
    [...queryIds].sort(),
  );

  for (const query of QUERY_META) {
    assert.equal(query.readOnly, true);
    assert.equal(query.paramsSchema.type, 'object');
    assert.equal(query.paramsSchema.additionalProperties, false);
  }
});

test('query schemas accept documented read shapes and reject malformed or extra fields', () => {
  for (const [queryId, params] of [
    ['project.state', {}],
    ['scene.diff', { fromRevision: 0 }],
    ['entity.get', { id: 0 }],
    ['entity.get', { name: 'Main Camera' }],
    ['view.screenshot', { target: 'game', format: 'image/jpeg', quality: 0.8 }],
    ['window.ui_snapshot', { windowLabel: 'main', maxElements: 2_000, offset: 0 }],
    ['window.ui_content', { selector: '#editor', field: 'text' }],
    ['events.get', { topics: [...AGENT_EVENT_TOPICS], limit: 1_000 }],
    ['queries.describe', { id: 'scene.snapshot' }],
  ]) {
    assert.deepEqual(
      validateAgentJsonSchema(params, QUERY_PARAMS_SCHEMAS[queryId]),
      [],
      queryId,
    );
  }

  for (const [queryId, params] of [
    ['project.state', { unexpected: true }],
    ['scene.diff', {}],
    ['scene.diff', { fromRevision: -1 }],
    ['entity.get', { name: '   ' }],
    ['view.screenshot', { target: 'window' }],
    ['view.screenshot', { quality: 2 }],
    ['window.ui_snapshot', { maxElements: 49 }],
    ['window.ui_content', { selector: '#editor', field: 'password' }],
    ['events.get', { topics: ['unknown'] }],
    ['asset.read_text', { path: 'Assets/a.txt', maxBytes: 8_388_609 }],
    ['queries.describe', { id: ' ' }],
  ]) {
    assert.ok(
      validateAgentJsonSchema(params, QUERY_PARAMS_SCHEMAS[queryId]).length > 0,
      `${queryId} should reject ${JSON.stringify(params)}`,
    );
  }
});

test('query discovery is exposed through MCP tools and a resource', () => {
  assert.ok(TOOLS.some((tool) => tool.name === 'list_queries'));
  assert.ok(TOOLS.some((tool) => tool.name === 'describe_query'));
  assert.ok(RESOURCES.some((resource) => (
    resource.uri === 'mengine://queries'
    && resource.bridgeQuery === 'queries.list'
  )));
});

test('AgentBridge validates query parameters before dispatch', () => {
  const source = fs.readFileSync(
    path.join(editorRoot, 'src', 'agent', 'AgentBridge.ts'),
    'utf8',
  );
  assert.match(
    source,
    /async query\([^]*?const parameterIssues = validateAgentJsonSchema\(params, paramsSchema\);[^]*?switch \(queryId\)/,
  );
});
