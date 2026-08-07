import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const FIGMA_API_ROOT = 'https://api.figma.com/v1';
const MAX_FIGMA_RESPONSE_BYTES = 32 * 1024 * 1024;
const MAX_FIGMA_ASSET_BYTES = 16 * 1024 * 1024;
const MAX_FIGMA_ASSET_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_FIGMA_ASSETS = 64;
const MAX_FIGMA_NODES = 1_000;
const MAX_FIGMA_DEPTH = 64;
const REQUEST_TIMEOUT_MS = 30_000;
const COMPONENT_KINDS = new Set([
  'button',
  'toggle',
  'slider',
  'input_field',
  'dropdown',
  'scroll_view',
  'panel',
  'image',
  'raw_image',
  'text',
]);

export class FigmaBridgeError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'FigmaBridgeError';
    this.code = code;
    this.data = data;
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanNodeId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d+-\d+$/u.test(trimmed)) return trimmed.replace('-', ':');
  return /^[A-Za-z0-9:;._-]{1,128}$/u.test(trimmed) ? trimmed : null;
}

export function parseFigmaUrl(value, explicitNodeId) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new FigmaBridgeError('INVALID_ARGS', 'url must be an absolute Figma design URL');
  }
  if (
    url.protocol !== 'https:'
    || !['figma.com', 'www.figma.com'].includes(url.hostname.toLocaleLowerCase())
  ) {
    throw new FigmaBridgeError('INVALID_ARGS', 'url must use https://www.figma.com');
  }
  const segments = url.pathname.split('/').filter(Boolean);
  if (!['design', 'file', 'proto'].includes(segments[0]) || !segments[1]) {
    throw new FigmaBridgeError(
      'INVALID_ARGS',
      'url must point to a Figma design, file, or prototype',
    );
  }
  const fileKey = segments[1];
  if (!/^[A-Za-z0-9_-]{6,128}$/u.test(fileKey)) {
    throw new FigmaBridgeError('INVALID_ARGS', 'The Figma URL contains an invalid file key');
  }
  const nodeId = cleanNodeId(explicitNodeId ?? url.searchParams.get('node-id'));
  if (!nodeId) {
    throw new FigmaBridgeError(
      'INVALID_ARGS',
      'Select a Figma frame and copy its URL so the node-id query parameter is present',
    );
  }
  return { fileKey, nodeId };
}

function validateMappings(value) {
  if (value === undefined) return {};
  if (!plainObject(value) || Object.keys(value).length > 512) {
    throw new FigmaBridgeError('INVALID_ARGS', 'componentMappings must be an object with at most 512 entries');
  }
  const result = {};
  for (const [componentId, kind] of Object.entries(value)) {
    if (!cleanNodeId(componentId) || !COMPONENT_KINDS.has(kind)) {
      throw new FigmaBridgeError(
        'INVALID_ARGS',
        `Invalid component mapping ${componentId} -> ${String(kind)}`,
      );
    }
    result[componentId] = kind;
  }
  return result;
}

function validateAssetFolder(value) {
  const folder = value ?? 'Assets/Figma';
  if (
    typeof folder !== 'string'
    || folder.length < 6
    || folder.length > 256
    || !/^Assets(?:\/[A-Za-z0-9 _.-]+)*$/u.test(folder)
    || folder.includes('..')
  ) {
    throw new FigmaBridgeError(
      'INVALID_ARGS',
      'assetFolder must be a project-relative folder under Assets without traversal',
    );
  }
  return folder.replace(/\/+$/u, '');
}

export function normalizeFigmaRequest(value, { write = false } = {}) {
  if (!plainObject(value)) {
    throw new FigmaBridgeError('INVALID_ARGS', 'Figma request must be a JSON object');
  }
  const allowed = new Set([
    'url',
    'nodeId',
    'componentMappings',
    'maxNodes',
    ...(write
      ? ['parent', 'assetFolder', 'requestId', 'expectedSceneRevision', 'screenshot']
      : []),
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new FigmaBridgeError('INVALID_ARGS', `Figma request field "${key}" is not allowed`);
    }
  }
  if (typeof value.url !== 'string' || value.url.length > 2_048) {
    throw new FigmaBridgeError('INVALID_ARGS', 'url must be a Figma URL up to 2048 characters');
  }
  const parsed = parseFigmaUrl(value.url, value.nodeId);
  const maxNodes = value.maxNodes ?? MAX_FIGMA_NODES;
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_FIGMA_NODES) {
    throw new FigmaBridgeError('INVALID_ARGS', `maxNodes must be an integer from 1 to ${MAX_FIGMA_NODES}`);
  }
  const request = {
    url: value.url,
    ...parsed,
    componentMappings: validateMappings(value.componentMappings),
    maxNodes,
  };
  if (!write) return request;
  if (value.parent !== undefined && (!Number.isSafeInteger(value.parent) || value.parent < 0)) {
    throw new FigmaBridgeError('INVALID_ARGS', 'parent must be a non-negative entity id');
  }
  if (
    value.expectedSceneRevision !== undefined
    && (!Number.isSafeInteger(value.expectedSceneRevision) || value.expectedSceneRevision < 0)
  ) {
    throw new FigmaBridgeError('INVALID_ARGS', 'expectedSceneRevision must be a non-negative integer');
  }
  if (
    value.requestId !== undefined
    && (typeof value.requestId !== 'string' || value.requestId.length < 1 || value.requestId.length > 128)
  ) {
    throw new FigmaBridgeError('INVALID_ARGS', 'requestId must contain between 1 and 128 characters');
  }
  if (value.screenshot !== undefined && typeof value.screenshot !== 'boolean') {
    throw new FigmaBridgeError('INVALID_ARGS', 'screenshot must be a boolean');
  }
  return {
    ...request,
    ...(value.parent === undefined ? {} : { parent: value.parent }),
    assetFolder: validateAssetFolder(value.assetFolder),
    requestId: value.requestId ?? `figma:${randomUUID()}`,
    ...(value.expectedSceneRevision === undefined
      ? {}
      : { expectedSceneRevision: value.expectedSceneRevision }),
    screenshot: Boolean(value.screenshot),
  };
}

function tokenFromEnvironment(env) {
  const token = env.FIGMA_ACCESS_TOKEN;
  if (typeof token !== 'string' || token.length < 8 || token.length > 4_096) {
    throw new FigmaBridgeError(
      'FIGMA_TOKEN_MISSING',
      'Set FIGMA_ACCESS_TOKEN with file_content:read scope in the Agent process environment',
    );
  }
  return token;
}

function combinedSignal(signal) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function readBoundedResponse(response, limit, label) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    throw new FigmaBridgeError('FIGMA_RESPONSE_TOO_LARGE', `${label} exceeds the ${limit} byte limit`);
  }
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limit) {
      throw new FigmaBridgeError('FIGMA_RESPONSE_TOO_LARGE', `${label} exceeds the ${limit} byte limit`);
    }
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new FigmaBridgeError('FIGMA_RESPONSE_TOO_LARGE', `${label} exceeds the ${limit} byte limit`);
    }
    chunks.push(Buffer.from(value));
  }
  return new Uint8Array(Buffer.concat(chunks, total));
}

async function figmaJson(endpoint, { token, fetchImpl, signal }) {
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { 'X-Figma-Token': token },
      signal: combinedSignal(signal),
    });
  } catch (error) {
    throw new FigmaBridgeError(
      error?.name === 'AbortError' || error?.name === 'TimeoutError'
        ? 'FIGMA_TIMEOUT'
        : 'FIGMA_CONNECTION',
      `Figma request failed: ${error?.message || String(error)}`,
    );
  }
  const bytes = await readBoundedResponse(response, MAX_FIGMA_RESPONSE_BYTES, 'Figma response');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw new FigmaBridgeError('FIGMA_RESPONSE_INVALID', 'Figma returned invalid JSON');
  }
  if (!response.ok) {
    const message = typeof payload?.message === 'string'
      ? payload.message.slice(0, 512)
      : `Figma returned HTTP ${response.status}`;
    throw new FigmaBridgeError(
      response.status === 403
        ? 'FIGMA_PERMISSION_DENIED'
        : response.status === 404
          ? 'FIGMA_NOT_FOUND'
          : response.status === 429 ? 'RATE_LIMITED' : 'FIGMA_API_ERROR',
      message,
      { status: response.status },
    );
  }
  return payload;
}

function findNode(node, wantedId) {
  if (!plainObject(node)) return null;
  if (node.id === wantedId) return node;
  for (const child of Array.isArray(node.children) ? node.children : []) {
    const found = findNode(child, wantedId);
    if (found) return found;
  }
  return null;
}

function number(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function rgba(paint, nodeOpacity = 1) {
  if (!plainObject(paint) || paint.type !== 'SOLID' || paint.visible === false) return undefined;
  const source = paint.color;
  if (!plainObject(source)) return undefined;
  return [
    Math.min(1, Math.max(0, number(source.r))),
    Math.min(1, Math.max(0, number(source.g))),
    Math.min(1, Math.max(0, number(source.b))),
    Math.min(1, Math.max(0, number(source.a, 1) * number(paint.opacity, 1) * nodeOpacity)),
  ];
}

function firstSolid(paints, opacity) {
  if (!Array.isArray(paints)) return undefined;
  for (const paint of paints) {
    const value = rgba(paint, opacity);
    if (value) return value;
  }
  return undefined;
}

function visiblePaints(paints) {
  return Array.isArray(paints) ? paints.filter((paint) => paint?.visible !== false) : [];
}

function rasterizationReason(node) {
  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length > 0 || node.type === 'TEXT') return null;
  const geometricTypes = new Set([
    'VECTOR',
    'BOOLEAN_OPERATION',
    'STAR',
    'POLYGON',
    'LINE',
    'TEXT_PATH',
    'ELLIPSE',
  ]);
  if (geometricTypes.has(node.type)) return `Figma ${node.type.toLocaleLowerCase()} geometry`;
  const paints = [...visiblePaints(node.fills), ...visiblePaints(node.strokes)];
  if (paints.some((paint) => paint.type !== 'SOLID')) return 'gradient, image, or non-solid paint';
  if (paints.length > 2) return 'multiple layered paints';
  if (visiblePaints(node.effects).length > 0) return 'visual effects';
  if (number(node.cornerRadius) > 0 || Array.isArray(node.rectangleCornerRadii)) {
    return 'rounded geometry';
  }
  if (!['RECTANGLE', 'FRAME', 'GROUP', 'SECTION'].includes(node.type)) {
    return `unsupported ${String(node.type).toLocaleLowerCase()} visual`;
  }
  return null;
}

function normalizeBounds(value) {
  if (!plainObject(value)) return undefined;
  const width = number(value.width);
  const height = number(value.height);
  return {
    x: number(value.x),
    y: number(value.y),
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

function normalizeTextStyle(value) {
  if (!plainObject(value)) return undefined;
  return {
    ...(typeof value.fontFamily === 'string' ? { fontFamily: value.fontFamily.slice(0, 128) } : {}),
    ...(Number.isFinite(value.fontSize) ? { fontSize: number(value.fontSize) } : {}),
    ...(Number.isFinite(value.fontWeight) ? { fontWeight: number(value.fontWeight) } : {}),
    ...(typeof value.italic === 'boolean' ? { italic: value.italic } : {}),
    ...(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'].includes(value.textAlignHorizontal)
      ? { textAlignHorizontal: value.textAlignHorizontal }
      : {}),
    ...(['TOP', 'CENTER', 'BOTTOM'].includes(value.textAlignVertical)
      ? { textAlignVertical: value.textAlignVertical }
      : {}),
    ...(Number.isFinite(value.lineHeightPx) ? { lineHeightPx: number(value.lineHeightPx) } : {}),
    ...(['NONE', 'WIDTH_AND_HEIGHT', 'HEIGHT', 'TRUNCATE'].includes(value.textAutoResize)
      ? { textAutoResize: value.textAutoResize }
      : {}),
  };
}

function normalizeLayout(node) {
  const mode = ['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID'].includes(node.layoutMode)
    ? node.layoutMode
    : 'NONE';
  return {
    mode,
    wrap: node.layoutWrap === 'WRAP' ? 'WRAP' : 'NO_WRAP',
    itemSpacing: number(node.itemSpacing),
    paddingLeft: Math.max(0, number(node.paddingLeft)),
    paddingRight: Math.max(0, number(node.paddingRight)),
    paddingTop: Math.max(0, number(node.paddingTop)),
    paddingBottom: Math.max(0, number(node.paddingBottom)),
    ...(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN'].includes(node.primaryAxisAlignItems)
      ? { primaryAlign: node.primaryAxisAlignItems }
      : {}),
    ...(['MIN', 'CENTER', 'MAX', 'BASELINE'].includes(node.counterAxisAlignItems)
      ? { counterAlign: node.counterAxisAlignItems }
      : {}),
    ...(['FIXED', 'HUG', 'FILL'].includes(node.layoutSizingHorizontal)
      ? { sizingHorizontal: node.layoutSizingHorizontal }
      : {}),
    ...(['FIXED', 'HUG', 'FILL'].includes(node.layoutSizingVertical)
      ? { sizingVertical: node.layoutSizingVertical }
      : {}),
  };
}

function normalizeConstraints(value) {
  if (!plainObject(value)) return undefined;
  return {
    ...(['LEFT', 'RIGHT', 'CENTER', 'LEFT_RIGHT', 'SCALE'].includes(value.horizontal)
      ? { horizontal: value.horizontal }
      : {}),
    ...(['TOP', 'BOTTOM', 'CENTER', 'TOP_BOTTOM', 'SCALE'].includes(value.vertical)
      ? { vertical: value.vertical }
      : {}),
  };
}

function normalizeNode(node, parentId) {
  const opacity = Math.min(1, Math.max(0, number(node.opacity, 1)));
  const reason = rasterizationReason(node);
  return {
    id: String(node.id),
    parentId,
    name: String(node.name || node.type || 'Figma Node').slice(0, 256),
    type: String(node.type || 'UNKNOWN').slice(0, 64),
    ...(typeof node.componentId === 'string' ? { componentId: node.componentId } : {}),
    visible: node.visible !== false,
    opacity,
    rotation: number(node.rotation),
    clipsContent: node.clipsContent === true,
    ...(normalizeBounds(node.absoluteBoundingBox) ? { bounds: normalizeBounds(node.absoluteBoundingBox) } : {}),
    ...(firstSolid(node.fills, 1) ? { fillColor: firstSolid(node.fills, 1) } : {}),
    ...(firstSolid(node.strokes, 1) ? { strokeColor: firstSolid(node.strokes, 1) } : {}),
    strokeWeight: Math.max(0, number(node.strokeWeight)),
    cornerRadius: Math.max(0, number(node.cornerRadius)),
    ...(typeof node.characters === 'string' ? { characters: node.characters.slice(0, 65_536) } : {}),
    ...(normalizeTextStyle(node.style) ? { textStyle: normalizeTextStyle(node.style) } : {}),
    layout: normalizeLayout(node),
    ...(normalizeConstraints(node.constraints) ? { constraints: normalizeConstraints(node.constraints) } : {}),
    requiresRasterization: reason !== null,
    ...(reason ? { rasterizeReason: reason } : {}),
  };
}

export function normalizeFigmaSelection(payload, fileKey, nodeId, maxNodes = MAX_FIGMA_NODES) {
  const root = findNode(payload?.document, nodeId);
  if (!root) {
    throw new FigmaBridgeError('FIGMA_NODE_NOT_FOUND', `Figma node ${nodeId} is not in the file response`);
  }
  const nodes = [];
  let truncated = false;
  const visit = (node, parentId, depth) => {
    if (nodes.length >= maxNodes || depth > MAX_FIGMA_DEPTH) {
      truncated = true;
      return;
    }
    if (node?.visible === false) return;
    nodes.push(normalizeNode(node, parentId));
    for (const child of Array.isArray(node.children) ? node.children : []) {
      visit(child, String(node.id), depth + 1);
    }
  };
  visit(root, null, 0);
  if (nodes.length === 0) {
    throw new FigmaBridgeError('FIGMA_NODE_NOT_FOUND', `Figma node ${nodeId} has no visible importable content`);
  }
  return {
    schemaVersion: 1,
    fileKey,
    fileName: String(payload.name || 'Figma').slice(0, 256),
    version: String(payload.version || payload.lastModified || 'current').slice(0, 256),
    rootId: String(root.id),
    rootName: String(root.name || 'Figma UI').slice(0, 256),
    ...(truncated ? { truncated: true } : {}),
    nodes,
  };
}

export async function loadFigmaSource(
  request,
  {
    env = process.env,
    fetchImpl = globalThis.fetch,
    signal,
  } = {},
) {
  const token = tokenFromEnvironment(env);
  const endpoint = new URL(`${FIGMA_API_ROOT}/files/${encodeURIComponent(request.fileKey)}`);
  endpoint.searchParams.set('ids', request.nodeId);
  const payload = await figmaJson(endpoint, { token, fetchImpl, signal });
  return normalizeFigmaSelection(payload, request.fileKey, request.nodeId, request.maxNodes);
}

function planArgs(source, request, assetPaths) {
  return {
    source,
    componentMappings: request.componentMappings,
    maxNodes: request.maxNodes,
    ...(assetPaths ? { assetPaths } : {}),
  };
}

export async function previewFigmaUi(
  rawRequest,
  {
    query,
    env = process.env,
    fetchImpl = globalThis.fetch,
    signal,
  },
) {
  const request = normalizeFigmaRequest(rawRequest);
  const source = await loadFigmaSource(request, { env, fetchImpl, signal });
  const plan = await query('figma.import_plan', planArgs(source, request), { signal });
  return {
    figma: {
      fileName: source.fileName,
      version: source.version,
      rootId: source.rootId,
      rootName: source.rootName,
      nodeCount: source.nodes.length,
    },
    plan,
  };
}

async function exportedImageUrls(request, assets, { env, fetchImpl, signal }) {
  if (assets.length > MAX_FIGMA_ASSETS) {
    throw new FigmaBridgeError(
      'FIGMA_ASSET_LIMIT',
      `The import requires ${assets.length} raster assets; the limit is ${MAX_FIGMA_ASSETS}`,
    );
  }
  const token = tokenFromEnvironment(env);
  const urls = {};
  for (let offset = 0; offset < assets.length; offset += 50) {
    const chunk = assets.slice(offset, offset + 50);
    const endpoint = new URL(`${FIGMA_API_ROOT}/images/${encodeURIComponent(request.fileKey)}`);
    endpoint.searchParams.set('ids', chunk.map((asset) => asset.nodeId).join(','));
    endpoint.searchParams.set('format', 'png');
    endpoint.searchParams.set('scale', '1');
    const payload = await figmaJson(endpoint, { token, fetchImpl, signal });
    for (const asset of chunk) {
      const url = payload?.images?.[asset.nodeId];
      if (typeof url !== 'string' || !url.startsWith('https://')) {
        throw new FigmaBridgeError(
          'FIGMA_ASSET_EXPORT_FAILED',
          `Figma could not render node ${asset.nodeId} as PNG`,
        );
      }
      urls[asset.nodeId] = url;
    }
  }
  return urls;
}

function safeSegment(value, fallback) {
  const sanitized = String(value)
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9 _.-]+/gu, '-')
    .replace(/[. ]+$/gu, '')
    .trim()
    .slice(0, 64);
  return sanitized || fallback;
}

function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 10);
}

function destinationPath(request, source, asset) {
  const design = `${safeSegment(source.rootName, 'UI')}-${shortHash(request.fileKey)}`;
  const version = shortHash(source.version);
  const node = safeSegment(asset.nodeId.replaceAll(':', '-'), 'node');
  return `${request.assetFolder}/${design}/${version}/${node}.png`;
}

async function existingAsset(destination, query, signal) {
  const folder = destination.slice(0, destination.lastIndexOf('/'));
  const page = await query('asset.list', {
    search: destination,
    folder,
    limit: 50,
  }, { signal });
  const asset = Array.isArray(page?.assets)
    ? page.assets.find((entry) => entry?.relPath === destination)
    : null;
  if (asset && asset.metaStatus !== 'ready') {
    throw new FigmaBridgeError(
      'FIGMA_ASSET_CONFLICT',
      `Existing Figma asset metadata is not ready: ${destination}`,
      { path: destination, metaStatus: asset.metaStatus ?? null },
    );
  }
  return asset?.relPath ?? null;
}

async function downloadPng(url, { fetchImpl, signal }) {
  let response;
  try {
    response = await fetchImpl(url, { signal: combinedSignal(signal) });
  } catch (error) {
    throw new FigmaBridgeError(
      'FIGMA_CONNECTION',
      `Figma asset download failed: ${error?.message || String(error)}`,
    );
  }
  if (!response.ok || !String(response.url || url).startsWith('https://')) {
    throw new FigmaBridgeError('FIGMA_ASSET_EXPORT_FAILED', `Figma asset download returned HTTP ${response.status}`);
  }
  const bytes = await readBoundedResponse(response, MAX_FIGMA_ASSET_BYTES, 'Figma PNG asset');
  if (
    bytes.byteLength < 8
    || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  ) {
    throw new FigmaBridgeError('FIGMA_ASSET_EXPORT_FAILED', 'Figma asset response is not a PNG file');
  }
  return bytes;
}

async function importRasterAssets(request, source, plan, operations) {
  const { query, execute, env, fetchImpl, signal } = operations;
  const assetPaths = {};
  if (plan.assets.length === 0) return assetPaths;
  const urls = await exportedImageUrls(request, plan.assets, { env, fetchImpl, signal });
  let totalBytes = 0;
  for (const asset of plan.assets) {
    const destination = destinationPath(request, source, asset);
    const existing = await existingAsset(destination, query, signal);
    if (existing) {
      assetPaths[asset.nodeId] = existing;
      continue;
    }
    const bytes = await downloadPng(urls[asset.nodeId], { fetchImpl, signal });
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_FIGMA_ASSET_TOTAL_BYTES) {
      throw new FigmaBridgeError(
        'FIGMA_ASSET_LIMIT',
        `Figma raster assets exceed the ${MAX_FIGMA_ASSET_TOTAL_BYTES} byte total limit`,
      );
    }
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mengine-figma-'));
    const temporaryFile = path.join(temporaryDirectory, 'asset.png');
    try {
      fs.writeFileSync(temporaryFile, bytes, { flag: 'wx', mode: 0o600 });
      await execute('asset.import_file', {
        sourcePath: temporaryFile,
        destinationPath: destination,
      }, {
        requestId: `figma-asset:${shortHash(request.requestId)}:${shortHash(asset.nodeId)}`,
        signal,
      });
      assetPaths[asset.nodeId] = destination;
    } finally {
      try { fs.unlinkSync(temporaryFile); } catch { /* already absent */ }
      try { fs.rmdirSync(temporaryDirectory); } catch { /* never widen cleanup scope */ }
    }
  }
  return assetPaths;
}

export async function importFigmaUi(
  rawRequest,
  {
    query,
    execute,
    env = process.env,
    fetchImpl = globalThis.fetch,
    signal,
  },
) {
  const request = normalizeFigmaRequest(rawRequest, { write: true });
  const source = await loadFigmaSource(request, { env, fetchImpl, signal });
  const plan = await query('figma.import_plan', planArgs(source, request), { signal });
  if (!plan?.readyToImport) {
    throw new FigmaBridgeError(
      'FIGMA_IMPORT_BLOCKED',
      'The Figma import preview contains blocking diagnostics',
      { diagnostics: plan?.diagnostics ?? [] },
    );
  }
  const assetPaths = await importRasterAssets(request, source, plan, {
    query,
    execute,
    env,
    fetchImpl,
    signal,
  });
  const args = {
    ...planArgs(source, request, assetPaths),
    ...(request.parent === undefined ? {} : { parent: request.parent }),
    expectedPlanRevision: plan.planRevision,
  };
  const result = await execute('figma.import_ui', args, {
    requestId: request.requestId,
    expectedSceneRevision: request.expectedSceneRevision,
    screenshot: request.screenshot,
    signal,
  });
  return {
    figma: {
      fileName: source.fileName,
      version: source.version,
      rootId: source.rootId,
      rootName: source.rootName,
      nodeCount: source.nodes.length,
    },
    planRevision: plan.planRevision,
    assetPaths,
    result,
  };
}
