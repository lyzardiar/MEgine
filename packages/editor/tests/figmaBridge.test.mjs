// Author: MiYu

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
        primaryAxisSizingMode: 'AUTO',
        counterAxisSizingMode: 'FIXED',
        layoutWrap: 'WRAP',
        itemSpacing: 8,
        counterAxisSpacing: 12,
        primaryAxisAlignItems: 'SPACE_BETWEEN',
        counterAxisAlignItems: 'BASELINE',
        counterAxisAlignContent: 'SPACE_BETWEEN',
        itemReverseZIndex: true,
        fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.2, b: 0.3, a: 1 } }],
        children: [{
          id: '1:3',
          name: 'Title',
          type: 'TEXT',
          characters: 'Inventory',
          absoluteBoundingBox: { x: 120, y: 120, width: 280, height: 32 },
          layoutSizingHorizontal: 'FILL',
          layoutSizingVertical: 'HUG',
          layoutPositioning: 'ABSOLUTE',
          layoutGrow: 1,
          fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
          style: { fontSize: 20, fontWeight: 700, textAlignHorizontal: 'CENTER' },
        }],
      }],
    }],
  },
};

function jsonResponse(payload, options = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json');
  headers.set('content-length', String(body.length));
  return new Response(body, {
    status: options.status ?? 200,
    headers,
  });
}

function fileNodesPayload(payload = figmaPayload) {
  return {
    name: payload.name,
    version: payload.version,
    nodes: {
      '1:2': { document: payload.document.children[0].children[0] },
    },
  };
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
  assert.equal(source.nodes[0].layout.wrap, 'WRAP');
  assert.equal(source.nodes[0].layout.counterAxisSpacing, 12);
  assert.equal(source.nodes[0].layout.primaryAlign, 'SPACE_BETWEEN');
  assert.equal(source.nodes[0].layout.counterAlign, 'BASELINE');
  assert.equal(source.nodes[0].layout.counterAlignContent, 'SPACE_BETWEEN');
  assert.equal(source.nodes[0].layout.itemReverseZIndex, true);
  assert.equal(source.nodes[0].layout.sizingHorizontal, 'FIXED');
  assert.equal(source.nodes[0].layout.sizingVertical, 'HUG');
  assert.equal(source.nodes[1].textStyle.fontWeight, 700);
  assert.equal(source.nodes[1].layout.positioning, 'ABSOLUTE');
  assert.equal(source.nodes[1].layout.grow, 1);
  assert.equal(source.nodes[1].requiresRasterization, false);
  assert.equal(source.nodes[1].rasterizeReason, undefined);
  const truncated = normalizeFigmaSelection(figmaPayload, 'AbCdEf123456', '1:2', 1);
  assert.equal(truncated.truncated, true);
  assert.equal(truncated.nodes.length, 1);
});

test('large editable text hierarchies do not consume the raster asset budget', () => {
  const payload = structuredClone(figmaPayload);
  payload.document.children[0].children[0].children = Array.from({ length: 143 }, (_, index) => ({
    id: `2:${index + 1}`,
    name: `Label ${index + 1}`,
    type: 'TEXT',
    characters: `Label ${index + 1}`,
    absoluteBoundingBox: { x: 120, y: 120 + index * 24, width: 280, height: 20 },
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
    style: { fontSize: 16 },
  }));
  const source = normalizeFigmaSelection(payload, 'AbCdEf123456', '1:2', 200);
  assert.equal(source.nodes.length, 144);
  assert.equal(source.nodes.filter((node) => node.requiresRasterization).length, 0);
});

test('zero-height Figma vectors use positive render bounds from their stroke', () => {
  const payload = structuredClone(figmaPayload);
  payload.document.children[0].children[0].children.push({
    id: '1:4',
    name: 'Divider',
    type: 'VECTOR',
    strokeWeight: 2,
    absoluteBoundingBox: { x: 120, y: 180, width: 40, height: 0 },
    absoluteRenderBounds: { x: 119, y: 179, width: 42, height: 2 },
  });
  const source = normalizeFigmaSelection(payload, 'AbCdEf123456', '1:2', 100);
  assert.deepEqual(
    source.nodes.find((node) => node.id === '1:4').bounds,
    { x: 119, y: 179, width: 42, height: 2 },
  );
});

test('preview keeps the Figma token in the Agent process and sends only normalized source to Editor', async () => {
  let editorArgs;
  let requestHeaders;
  let requestUrl;
  const result = await previewFigmaUi({
    url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
  }, {
    env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
    fetchImpl: async (url, options) => {
      requestUrl = new URL(url);
      requestHeaders = options.headers;
      return jsonResponse(fileNodesPayload());
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
  assert.equal(requestUrl.pathname, '/v1/files/AbCdEf123456/nodes');
  assert.equal(requestUrl.searchParams.get('ids'), '1:2');
  assert.equal(requestUrl.searchParams.get('plugin_data'), 'shared');
  assert.equal(JSON.stringify(editorArgs).includes('figma-secret-token'), false);
  assert.equal(editorArgs.maxNodes, 500);
  assert.equal(editorArgs.componentMappings['9:9'], 'button');
  assert.equal(result.figma.nodeCount, 2);
});

test('short Figma rate limits retry once without user intervention', async () => {
  let requests = 0;
  const result = await previewFigmaUi({
    url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
  }, {
    env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
    fetchImpl: async () => {
      requests += 1;
      if (requests === 1) {
        return jsonResponse({ message: 'Slow down' }, {
          status: 429,
          headers: { 'retry-after': '0' },
        });
      }
      return jsonResponse(figmaPayload);
    },
    query: async (query) => query === 'figma.settings'
      ? { assetFolder: 'Assets/Figma', maxNodes: 1000, imageScale: 1, componentMappings: {} }
      : { readyToImport: true, planRevision: 'figma-plan-v1-0000000000000000', assets: [] },
  });
  assert.equal(result.figma.nodeCount, 2);
  assert.equal(requests, 2);
});

test('long Figma rate limits return retry, plan, seat, and trusted upgrade details', async () => {
  await assert.rejects(
    previewFigmaUi({
      url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
    }, {
      env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
      fetchImpl: async () => jsonResponse({ message: 'Monthly limit reached' }, {
        status: 429,
        headers: {
          'retry-after': '3600',
          'x-figma-plan-tier': 'starter',
          'x-figma-rate-limit-type': 'low',
          'x-figma-upgrade-link': 'https://www.figma.com/pricing/',
        },
      }),
      query: async () => ({
        assetFolder: 'Assets/Figma', maxNodes: 1000, imageScale: 1, componentMappings: {},
      }),
    }),
    (error) => {
      assert.equal(error.code, 'RATE_LIMITED');
      assert.match(error.message, /Retry after 1h/u);
      assert.deepEqual(error.data, {
        status: 429,
        retryAfterSeconds: 3600,
        planTier: 'starter',
        rateLimitType: 'low',
        upgradeLink: 'https://www.figma.com/pricing/',
      });
      return true;
    },
  );
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

test('desktop import reuses the exact preview source without a second Figma file request', async (t) => {
  const previewCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mengine-figma-preview-test-'));
  t.after(() => fs.rmSync(previewCacheDir, { recursive: true, force: true }));
  let fileRequests = 0;
  const query = async (operation) => operation === 'figma.settings'
    ? { assetFolder: 'Assets/Figma', maxNodes: 1000, imageScale: 1, componentMappings: {} }
    : {
      readyToImport: true,
      planRevision: 'figma-plan-v1-0000000000000000',
      assets: [],
      diagnostics: [],
    };
  const request = {
    url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
  };
  await previewFigmaUi(request, {
    env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
    previewCacheDir,
    fetchImpl: async () => {
      fileRequests += 1;
      return jsonResponse(fileNodesPayload());
    },
    query,
  });
  await importFigmaUi({
    ...request,
    requestId: 'figma-cached-import',
    usePreviewCache: true,
  }, {
    env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
    previewCacheDir,
    fetchImpl: async () => {
      throw new Error('Import must not refetch the previewed Figma source');
    },
    query,
    execute: async () => ({ ok: true, data: { root: 101 } }),
  });
  assert.equal(fileRequests, 1);
  assert.deepEqual(fs.readdirSync(previewCacheDir), []);
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

test('direct import does not request Figma image exports for existing versioned assets', async () => {
  let imageExportRequests = 0;
  const result = await importFigmaUi({
    url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
    requestId: 'figma-existing-raster-import',
  }, {
    env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/files/')) return jsonResponse(fileNodesPayload());
      if (value.includes('/images/')) imageExportRequests += 1;
      throw new Error(`Unexpected URL ${value}`);
    },
    query: async (operation, args) => {
      if (operation === 'figma.settings') {
        return { assetFolder: 'Assets/Figma', maxNodes: 1000, imageScale: 1, componentMappings: {} };
      }
      if (operation === 'figma.import_plan') {
        return {
          readyToImport: true,
          planRevision: 'figma-plan-v1-3333333333333333',
          assets: [{ nodeId: '1:4', name: 'Vector Icon', reason: 'vector' }],
          diagnostics: [],
        };
      }
      if (operation === 'asset.list') {
        return { assets: [{ relPath: args.search, metaStatus: 'ready' }] };
      }
      throw new Error(`Unexpected query ${operation}`);
    },
    execute: async (command) => {
      assert.equal(command, 'figma.import_ui');
      return { ok: true, data: { root: 102 } };
    },
  });
  assert.equal(imageExportRequests, 0);
  assert.equal(result.assetPaths['1:4'].endsWith('/1-4.png'), true);
});

test('direct import batches more than 128 genuine raster assets instead of rejecting them', async () => {
  const assets = Array.from({ length: 143 }, (_, index) => ({
    nodeId: `9:${index + 1}`,
    name: `Raster ${index + 1}`,
    reason: 'vector',
  }));
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  let imageExportRequests = 0;
  let importedAssets = 0;
  const result = await importFigmaUi({
    url: 'https://www.figma.com/design/AbCdEf123456/Game?node-id=1-2',
    requestId: 'figma-large-raster-import',
  }, {
    env: { FIGMA_ACCESS_TOKEN: 'figma-secret-token' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/files/')) return jsonResponse(figmaPayload);
      if (value.includes('/images/')) {
        imageExportRequests += 1;
        const ids = new URL(value).searchParams.get('ids').split(',');
        return jsonResponse({
          images: Object.fromEntries(ids.map((id) => [id, `https://cdn.example.test/${id}.png`])),
        });
      }
      if (value.startsWith('https://cdn.example.test/')) {
        return new Response(png, {
          status: 200,
          headers: { 'content-length': String(png.length), 'content-type': 'image/png' },
        });
      }
      throw new Error(`Unexpected URL ${value}`);
    },
    query: async (query) => {
      if (query === 'figma.settings') {
        return { assetFolder: 'Assets/Figma', maxNodes: 1000, imageScale: 1, componentMappings: {} };
      }
      if (query === 'figma.import_plan') {
        return {
          readyToImport: true,
          planRevision: 'figma-plan-v1-2222222222222222',
          assets,
          diagnostics: [],
        };
      }
      if (query === 'asset.list') return { assets: [] };
      throw new Error(`Unexpected query ${query}`);
    },
    execute: async (command) => {
      if (command === 'asset.import_file') importedAssets += 1;
      return { ok: true, data: {} };
    },
  });
  assert.equal(imageExportRequests, 3);
  assert.equal(importedAssets, 143);
  assert.equal(Object.keys(result.assetPaths).length, 143);
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
