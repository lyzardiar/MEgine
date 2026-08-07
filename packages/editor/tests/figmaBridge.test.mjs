import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FigmaBridgeError,
  importFigmaUi,
  normalizeFigmaSelection,
  parseFigmaUrl,
  previewFigmaUi,
} from '../../agent/figma/bridge.mjs';

const figmaPayload = {
  name: 'Game HUD',
  version: 'v7',
  document: {
    id: '0:0',
    type: 'DOCUMENT',
    children: [{
      id: '0:1',
      type: 'CANVAS',
      children: [{
        id: '1:2',
        name: 'HUD',
        type: 'FRAME',
        absoluteBoundingBox: { x: 100, y: 100, width: 320, height: 640 },
        layoutMode: 'VERTICAL',
        itemSpacing: 8,
        fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }],
        children: [{
          id: '1:3',
          name: 'Title',
          type: 'TEXT',
          characters: 'Inventory',
          absoluteBoundingBox: { x: 120, y: 120, width: 280, height: 32 },
          fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
          style: { fontSize: 20, fontWeight: 700, textAlignHorizontal: 'CENTER' },
        }],
      }],
    }],
  },
};

function jsonResponse(payload) {
  const body = Buffer.from(JSON.stringify(payload));
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-length': String(body.length) },
  });
}

test('Figma URLs require a selected node and normalize copied hyphen ids', () => {
  assert.deepEqual(
    parseFigmaUrl('https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2'),
    { fileKey: 'AbCdEf123456', nodeId: '1:2' },
  );
  assert.throws(
    () => parseFigmaUrl('https://www.figma.com/design/AbCdEf123456/Game'),
    (error) => error instanceof FigmaBridgeError && error.code === 'INVALID_ARGS',
  );
  assert.throws(
    () => parseFigmaUrl('https://example.com/design/AbCdEf123456/Game?node-id=1-2'),
    /figma\.com/u,
  );
});

test('Figma REST nodes normalize into a bounded editor-owned import source', () => {
  const source = normalizeFigmaSelection(figmaPayload, 'AbCdEf123456', '1:2', 100);
  assert.equal(source.rootId, '1:2');
  assert.deepEqual(source.nodes.map((node) => node.id), ['1:2', '1:3']);
  assert.equal(source.nodes[0].layout.mode, 'VERTICAL');
  assert.equal(source.nodes[1].textStyle.fontWeight, 700);
  const truncated = normalizeFigmaSelection(figmaPayload, 'AbCdEf123456', '1:2', 1);
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.nodes.length, 1);
});

test('preview keeps the Figma token in the Agent process and sends only normalized source to Editor', async () => {
  let editorArgs;
  let requestHeaders;
  const result = await previewFigmaUi({
    url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
  }, {
    env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
    fetchImpl: async (_url, options) => {
      requestHeaders = options.headers;
      return jsonResponse(figmaPayload);
    },
    query: async (query, args) => {
      if (query === 'figma.settings') return {
        assetFolder: 'Assets/Figma',
        maxNodes: 500,
        imageScale: 2,
        componentMappings: { '9:9': 'button' },
      };
      assert.equal(query, 'figma.import_plan');
      editorArgs = args;
      return { readyToImport: true, planRevision: 'figma-plan-v1-0000000000000000', assets: [] };
    },
  });
  assert.equal(requestHeaders['X-Figma-Token'], 'figma-secret-token');
  assert.equal(JSON.stringify(editorArgs).includes('figma-secret-token'), false);
  assert.equal(editorArgs.maxNodes, 500);
  assert.equal(editorArgs.componentMappings['9:9'], 'button');
  assert.equal(result.figma.nodeCount, 2);
});

test('direct import previews first and sends one guarded scene command when no raster assets are needed', async () => {
  const calls = [];
  const result = await importFigmaUi({
    url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
    requestId: 'figma-test-import',
    expectedSceneRevision: 12,
  }, {
    env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
    fetchImpl: async () => jsonResponse(figmaPayload),
    query: async (query, args) => {
      calls.push({ operation: 'query', query, args });
      if (query === 'figma.settings') return {
        assetFolder: 'Assets/Figma', maxNodes: 1000, imageScale: 1, componentMappings: {},
      };
      return {
        readyToImport: true,
        planRevision: 'figma-plan-v1-0000000000000000',
        assets: [],
        diagnostics: [],
      };
    },
    execute: async (command, args, options) => {
      calls.push({ operation: 'execute', command, args, options });
      return { ok: true, data: { root: 99 } };
    },
  });
  assert.deepEqual(calls.map((call) => call.operation), ['query', 'query', 'execute']);
  assert.equal(calls[2].command, 'figma.import_ui');
  assert.equal(calls[2].args.expectedPlanRevision, 'figma-plan-v1-0000000000000000');
  assert.equal(calls[2].options.expectedSceneRevision, 12);
  assert.equal(JSON.stringify(calls[2]).includes('figma-secret-token'), false);
  assert.equal(result.result.data.root, 99);
});

test('direct import exports bounded PNGs through the existing asset importer before the scene transaction', async () => {
  const payload = structuredClone(figmaPayload);
  payload.document.children[0].children[0].children.push({
    id: '1:4',
    name: 'Vector Icon',
    type: 'VECTOR',
    absoluteBoundingBox: { x: 140, y: 180, width: 32, height: 32 },
  });
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const calls = [];
  let finalArgs;
  const result = await importFigmaUi({
    url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
    requestId: 'figma-raster-import',
  }, {
    env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/files/')) return jsonResponse(payload);
      if (value.includes('/images/')) return jsonResponse({
        images: { '1:4': 'https://cdn.example.test/vector.png' },
      });
      if (value === 'https://cdn.example.test/vector.png') {
        return new Response(png, {
          status: 200,
          headers: { 'content-length': String(png.length), 'content-type': 'image/png' },
        });
      }
      throw new Error(`Unexpected URL ${value}`);
    },
    query: async (query) => {
      calls.push(query);
      if (query === 'figma.settings') {
        return { assetFolder: 'Assets/Figma', maxNodes: 1000, imageScale: 3, componentMappings: {} };
      }
      if (query === 'figma.import_plan') {
        return {
          readyToImport: true,
          planRevision: 'figma-plan-v1-1111111111111111',
          assets: [{ nodeId: '1:4', name: 'Vector Icon', reason: 'vector' }],
          diagnostics: [],
        };
      }
      if (query === 'asset.list') return { assets: [] };
      throw new Error(`Unexpected query ${query}`);
    },
    execute: async (command, args) => {
      calls.push(command);
      if (command === 'asset.import_file') {
        assert.equal(args.destinationPath.startsWith('Assets/Figma/'), true);
        return { ok: true };
      }
      assert.equal(command, 'figma.import_ui');
      finalArgs = args;
      return { ok: true, data: { root: 100 } };
    },
  });
  const resultPath = result.assetPaths['1:4'];
  assert.match(resultPath, /^Assets\/Figma\/.+\/1-4\.png$/u);
  assert.equal(finalArgs.assetPaths['1:4'], resultPath);
  assert.equal(result.imageScale, 3);
  assert.deepEqual(calls, ['figma.settings', 'figma.import_plan', 'asset.list', 'asset.import_file', 'figma.import_ui']);
});

test('missing tokens fail before any network or editor request', async () => {
  let called = false;
  await assert.rejects(
    previewFigmaUi({
      url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
    }, {
      env: {},
      fetchImpl: async () => { called = true; },
      query: async () => { called = true; },
    }),
    (error) => error instanceof FigmaBridgeError && error.code === 'FIGMA_TOKEN_MISSING',
  );
  assert.equal(called, false);
});
