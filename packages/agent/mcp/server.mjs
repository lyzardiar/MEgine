#!/usr/bin/env node
/**
 * MEngine Editor MCP server.
 *
 * A self-contained Model Context Protocol server that lets any MCP client
 * (Claude Desktop, Cursor, QoderWork, …) observe the running MEngine editor.
 * It connects to the editor's AgentBridge over a local WebSocket (discovered
 * via the discovery file the editor writes) and exposes the editor's read
 * surface as MCP tools and resources.
 *
 * Runs directly on Node >= 22 (uses the built-in global WebSocket). No build
 * step and no runtime dependencies.
 *
 *   node packages/agent/mcp/server.mjs
 *
 * Configure the editor location with MENGINE_AGENT_BRIDGE_FILE, or rely on the
 * default Tauri app-config path (<APPDATA>/com.mengine.editor/agent-bridge.json).
 */

import fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]);
const PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
const REQUEST_TIMEOUT_MS = 20000;
const BUILD_ARTIFACT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
const BRIDGE_CONNECT_ATTEMPTS = 30;
const BRIDGE_CONNECT_RETRY_MS = 200;
const SUBSCRIPTION_RECONNECT_MS = 1_000;
const MAX_PENDING_BRIDGE_REQUESTS = 64;
const MAX_ACTIVE_MCP_REQUESTS = 128;
const MAX_MCP_SESSION_REQUEST_IDS = 65_536;
const MAX_MCP_INPUT_LINE_BYTES = 64 * 1024 * 1024;
const MAX_MCP_OUTBOUND_QUEUED_BYTES = 192 * 1024 * 1024;
const MCP_OUTPUT_PAUSE_BYTES = 64 * 1024 * 1024;
const MCP_RATE_LIMIT_RETRY_AFTER_MS = 250;
const MCP_SESSION_ID = crypto.randomUUID();
const DANGEROUS_AGENT_COMMANDS = Object.freeze([
  'scene.delete',
  'asset.trash',
  'build.start',
  'build.run',
  'build.history.create_patch',
  'build.history.restore',
]);
const DANGEROUS_AGENT_COMMAND_SET = new Set(DANGEROUS_AGENT_COMMANDS);

// ── Discovery ────────────────────────────────────────────────────────────

function defaultDiscoveryPath() {
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'com.mengine.editor', 'agent-bridge.json');
}

function readDiscovery() {
  const file = process.env.MENGINE_AGENT_BRIDGE_FILE || defaultDiscoveryPath();
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf-8');
  } catch (error) {
    throw new BridgeConnectionError(
      `Cannot read AgentBridge discovery file at ${file}. ` +
        'Is the MEngine editor running? Set MENGINE_AGENT_BRIDGE_FILE to override.',
      { cause: error },
    );
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new BridgeConnectionError(
      `AgentBridge discovery file at ${file} is not valid JSON`,
      { cause: error },
    );
  }
  if (
    !Number.isInteger(data.port)
    || data.port < 1
    || data.port > 65_535
    || typeof data.token !== 'string'
    || data.token.length < 1
    || data.token.length > 1_024
  ) {
    throw new BridgeConnectionError(
      `Discovery file ${file} must contain a valid TCP port and authentication token`,
    );
  }
  return {
    port: data.port,
    token: data.token,
    pid: Number.isSafeInteger(data.pid) && data.pid > 0 ? data.pid : null,
  };
}

// ── Bridge client (WebSocket) ────────────────────────────────────────────

let activeConnection = null;
let connectionAttempt = null;
let subscriptionReconnectTimer = null;
let successfulConnections = 0;
const pending = new Map();
const mcpRequestContext = new AsyncLocalStorage();

class BridgeConnectionError extends Error {
  constructor(message, { sent = false, discovery = null, cause } = {}) {
    super(message);
    this.name = 'BridgeConnectionError';
    this.sent = sent;
    this.discovery = discovery;
    this.cause = cause;
  }
}

class BridgeRpcError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = 'BridgeRpcError';
    this.code = code || 'INTERNAL';
    this.data = data;
  }
}

class BridgeOutcomeUnknownError extends Error {
  constructor(method, params, previousDiscovery, currentDiscovery, cause) {
    super(
      `Editor process changed while ${method} was in flight; its outcome is unknown. ` +
        'Re-read editor state before issuing a new requestId.',
    );
    this.name = 'BridgeOutcomeUnknownError';
    this.data = {
      method,
      requestId: typeof params?.requestId === 'string' ? params.requestId : null,
      previousEditorPid: previousDiscovery?.pid ?? null,
      currentEditorPid: currentDiscovery?.pid ?? null,
    };
    this.cause = cause;
  }
}

class McpRequestCancelledError extends Error {
  constructor() {
    super('MCP request cancelled');
    this.name = 'McpRequestCancelledError';
  }
}

class ToolInputValidationError extends Error {
  constructor(toolName, issues) {
    super(`Invalid arguments for tool "${toolName}"`);
    this.name = 'ToolInputValidationError';
    this.data = { tool: toolName, issues };
  }
}

function connectBridge(discovery) {
  const { port, token } = discovery;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`,
    );
    let opened = false;
    const onError = () => {
      if (opened) return;
      reject(new BridgeConnectionError(
        `Failed to connect to editor bridge on port ${port}`,
        { discovery },
      ));
    };
    socket.addEventListener('error', onError);
    socket.addEventListener('open', () => {
      opened = true;
      socket.removeEventListener('error', onError);
      const connection = { socket, discovery };
      activeConnection = connection;
      successfulConnections += 1;
      if (successfulConnections > 1) {
        process.stderr.write(
          `[mengine-mcp] reconnected to editor bridge on port ${discovery.port}\n`,
        );
      }
      resourceSubscriptions.invalidateAll();
      resolve(connection);
    });
    socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      } catch {
        return;
      }
      if (resourceSubscriptions.handleBridgeMessage(msg)) return;
      if (msg.id != null && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        if (entry.socket !== socket) return;
        pending.delete(msg.id);
        entry.cleanup();
        if (msg.error) {
          entry.reject(new BridgeRpcError(
            msg.error.code,
            msg.error.message,
            msg.error.data,
          ));
        } else {
          entry.resolve(msg.result);
        }
      }
    });
    socket.addEventListener('close', () => {
      if (activeConnection?.socket === socket) activeConnection = null;
      if (!opened) {
        reject(new BridgeConnectionError(
          `Editor bridge on port ${port} closed during connection`,
          { discovery },
        ));
      }
      for (const [id, entry] of pending) {
        if (entry.socket !== socket) continue;
        pending.delete(id);
        entry.cleanup();
        entry.reject(new BridgeConnectionError(
          'Editor bridge connection closed',
          { sent: true, discovery },
        ));
      }
      scheduleSubscriptionReconnect();
    });
  });
}

async function ensureBridgeConnected() {
  if (activeConnection?.socket.readyState === WebSocket.OPEN) {
    return activeConnection;
  }
  if (connectionAttempt) return await connectionAttempt;
  connectionAttempt = connectLatestBridge();
  try {
    return await connectionAttempt;
  } finally {
    connectionAttempt = null;
  }
}

async function connectLatestBridge() {
  let lastError;
  for (let attempt = 0; attempt < BRIDGE_CONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await connectBridge(readDiscovery());
    } catch (error) {
      lastError = error;
      if (attempt + 1 < BRIDGE_CONNECT_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, BRIDGE_CONNECT_RETRY_MS));
      }
    }
  }
  throw lastError;
}

function scheduleSubscriptionReconnect(delayMs = SUBSCRIPTION_RECONNECT_MS) {
  if (
    inputClosed
    || outputFailed
    || !resourceSubscriptions.hasSubscriptions
    || activeConnection?.socket.readyState === WebSocket.OPEN
    || subscriptionReconnectTimer
  ) return;
  subscriptionReconnectTimer = setTimeout(async () => {
    subscriptionReconnectTimer = null;
    if (
      inputClosed
      || outputFailed
      || !resourceSubscriptions.hasSubscriptions
      || activeConnection?.socket.readyState === WebSocket.OPEN
    ) return;
    try {
      const connection = await ensureBridgeConnected();
      if (connection.socket.readyState !== WebSocket.OPEN) {
        scheduleSubscriptionReconnect();
      }
    } catch {
      scheduleSubscriptionReconnect();
    }
  }, delayMs);
  subscriptionReconnectTimer.unref();
}

function cancelSubscriptionReconnectIfIdle() {
  if (resourceSubscriptions.hasSubscriptions || !subscriptionReconnectTimer) return;
  clearTimeout(subscriptionReconnectTimer);
  subscriptionReconnectTimer = null;
}

function rpcOnce(
  connection,
  method,
  params,
  timeoutMs = REQUEST_TIMEOUT_MS,
  signal = mcpRequestContext.getStore()?.signal,
) {
  return new Promise((resolve, reject) => {
    const { socket, discovery } = connection;
    if (signal?.aborted) {
      reject(new McpRequestCancelledError());
      return;
    }
    if (socket.readyState !== WebSocket.OPEN) {
      reject(new BridgeConnectionError(
        'Not connected to the editor bridge',
        { discovery },
      ));
      return;
    }
    if (pending.size >= MAX_PENDING_BRIDGE_REQUESTS) {
      reject(new BridgeRpcError(
        'RATE_LIMITED',
        'Too many MCP requests are already waiting for the editor bridge',
        {
          pendingBridgeRequests: pending.size,
          maxPendingBridgeRequests: MAX_PENDING_BRIDGE_REQUESTS,
          retryAfterMs: MCP_RATE_LIMIT_RETRY_AFTER_MS,
        },
      ));
      return;
    }
    const id = crypto.randomUUID();
    let sent = false;
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      if (!pending.delete(id)) return;
      cleanup();
      if (sent && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'cancel',
            params: { requestId: id },
          }));
        } catch {
          // Cancellation remains local if the bridge is already unavailable.
        }
      }
      reject(new McpRequestCancelledError());
    };
    timer = setTimeout(() => {
      pending.delete(id);
      cleanup();
      if (activeConnection?.socket === socket) activeConnection = null;
      try {
        socket.close(1011, 'AgentBridge request timed out');
      } catch {
        // The timeout error below remains authoritative even if the socket
        // implementation is already closing.
      }
      reject(new BridgeConnectionError(
        `Editor bridge request timed out (${method})`,
        { sent: true, discovery },
      ));
    }, timeoutMs);
    pending.set(id, {
      socket,
      timer,
      cleanup,
      resolve,
      reject,
    });
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) {
      cancel();
      return;
    }
    try {
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      sent = true;
    } catch (error) {
      pending.delete(id);
      cleanup();
      reject(new BridgeConnectionError(
        `Could not send editor bridge request: ${error?.message || String(error)}`,
        { discovery },
      ));
    }
  });
}

function sameEditorProcess(left, right) {
  if (!left || !right) return false;
  if (left.pid != null && right.pid != null) {
    return left.pid === right.pid && left.token === right.token;
  }
  return left.port === right.port && left.token === right.token;
}

async function rpc(
  method,
  params,
  {
    retryAcrossEditorRestart = false,
    timeoutMs = REQUEST_TIMEOUT_MS,
    signal,
  } = {},
) {
  const firstConnection = await ensureBridgeConnected();
  try {
    return await rpcOnce(firstConnection, method, params, timeoutMs, signal);
  } catch (error) {
    if (!(error instanceof BridgeConnectionError)) throw error;

    let latestDiscovery = null;
    try {
      latestDiscovery = readDiscovery();
    } catch (discoveryError) {
      if (error.sent && !retryAcrossEditorRestart) {
        throw new BridgeOutcomeUnknownError(
          method,
          params,
          firstConnection.discovery,
          null,
          discoveryError,
        );
      }
    }
    const sameProcess = sameEditorProcess(firstConnection.discovery, latestDiscovery);
    if (error.sent && !sameProcess && !retryAcrossEditorRestart) {
      throw new BridgeOutcomeUnknownError(
        method,
        params,
        firstConnection.discovery,
        latestDiscovery,
      );
    }

    let retryConnection = firstConnection;
    if (
      firstConnection.socket.readyState !== WebSocket.OPEN
      || !sameEditorProcess(firstConnection.discovery, latestDiscovery)
    ) {
      if (activeConnection?.socket === firstConnection.socket) activeConnection = null;
      retryConnection = await ensureBridgeConnected();
    }
    if (
      error.sent
      && !retryAcrossEditorRestart
      && !sameEditorProcess(firstConnection.discovery, retryConnection.discovery)
    ) {
      throw new BridgeOutcomeUnknownError(
        method,
        params,
        firstConnection.discovery,
        retryConnection.discovery,
      );
    }
    return await rpcOnce(retryConnection, method, params, timeoutMs, signal);
  }
}

async function bridgeQuery(query, args = {}, options = {}) {
  const result = await rpc(
    'query',
    { query, args },
    {
      retryAcrossEditorRestart: true,
      signal: options.signal,
    },
  );
  return result?.data;
}

function bridgeExecuteParams(command, args = {}, options = {}) {
  const params = {
    command,
    args,
    requestId: options.requestId,
    screenshot: Boolean(options.screenshot),
    expectedSceneRevision: options.expectedSceneRevision,
  };
  if (DANGEROUS_AGENT_COMMAND_SET.has(command)) {
    const approvalToken =
      options.approvalToken ?? process.env.MENGINE_AGENT_APPROVAL_TOKEN;
    if (approvalToken != null) {
      params.approvalToken = approvalToken;
    }
  }
  return params;
}

async function bridgeExecute(command, args = {}, options = {}) {
  const longRunning = command === 'build.verify';
  return await rpc(
    'execute',
    bridgeExecuteParams(command, args, options),
    {
      timeoutMs: longRunning
        ? BUILD_ARTIFACT_REQUEST_TIMEOUT_MS
        : REQUEST_TIMEOUT_MS,
      signal: options.signal,
    },
  );
}

function closeBridgeConnection() {
  const connection = activeConnection;
  activeConnection = null;
  if (connection?.socket.readyState === WebSocket.OPEN) {
    connection.socket.close();
  }
}

// ── Tool definitions ─────────────────────────────────────────────────────

function textContent(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

function screenshotContent(screenshot, envelope) {
  if (!screenshot || typeof screenshot !== 'object') {
    return textContent(envelope);
  }
  const { dataUrl, ...metadata } = screenshot;
  const payload = envelope === undefined
    ? metadata
    : envelope && typeof envelope === 'object' && !Array.isArray(envelope)
      ? { ...envelope, screenshot: metadata }
      : { result: envelope, screenshot: metadata };
  const content = textContent(payload);
  const base64 = typeof dataUrl === 'string' ? dataUrl.split(',')[1] || '' : '';
  if (base64) {
    content.push({
      type: 'image',
      data: base64,
      mimeType: screenshot.mime || 'image/png',
    });
  }
  return content;
}

function schemaTypeMatches(value, expected) {
  switch (expected) {
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'integer':
      return Number.isSafeInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
    case 'boolean':
      return typeof value === expected;
    default:
      return true;
  }
}

function schemaValuesEqual(left, right) {
  return JSON.stringify(stableJson(left)) === JSON.stringify(stableJson(right));
}

function validateSchemaValue(value, schema, path, issues) {
  if (!schema || typeof schema !== 'object' || issues.length >= 32) return;

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => {
      const candidateIssues = [];
      validateSchemaValue(value, candidate, path, candidateIssues);
      return candidateIssues.length === 0;
    });
    if (matches.length !== 1) {
      issues.push(`${path} must match exactly one allowed shape`);
    }
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.some((candidate) => {
      const candidateIssues = [];
      validateSchemaValue(value, candidate, path, candidateIssues);
      return candidateIssues.length === 0;
    });
    if (!matches) issues.push(`${path} must match at least one allowed shape`);
  }

  const expectedTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type == null
      ? []
      : [schema.type];
  if (
    expectedTypes.length > 0
    && !expectedTypes.some((expected) => schemaTypeMatches(value, expected))
  ) {
    issues.push(`${path} must be ${expectedTypes.join(' or ')}`);
    return;
  }

  if ('const' in schema && !schemaValuesEqual(value, schema.const)) {
    issues.push(`${path} must equal ${JSON.stringify(schema.const)}`);
  }
  if (
    Array.isArray(schema.enum)
    && !schema.enum.some((candidate) => schemaValuesEqual(value, candidate))
  ) {
    issues.push(`${path} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(', ')}`);
  }

  if (typeof value === 'string') {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
      issues.push(`${path} must contain at least ${schema.minLength} characters`);
    }
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
      issues.push(`${path} must contain at most ${schema.maxLength} characters`);
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern, 'u').test(value)) {
      issues.push(`${path} does not match the required pattern`);
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (typeof schema.minimum === 'number' && value < schema.minimum) {
      issues.push(`${path} must be at least ${schema.minimum}`);
    }
    if (typeof schema.maximum === 'number' && value > schema.maximum) {
      issues.push(`${path} must be at most ${schema.maximum}`);
    }
    if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      issues.push(`${path} must be greater than ${schema.exclusiveMinimum}`);
    }
    if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
      issues.push(`${path} must be less than ${schema.exclusiveMaximum}`);
    }
  }

  if (Array.isArray(value)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      issues.push(`${path} must contain at least ${schema.minItems} items`);
    }
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
      issues.push(`${path} must contain at most ${schema.maxItems} items`);
    }
    if (schema.uniqueItems) {
      const keys = value.map((item) => JSON.stringify(stableJson(item)));
      if (new Set(keys).size !== keys.length) issues.push(`${path} must contain unique items`);
    }
    if (schema.items && typeof schema.items === 'object') {
      value.forEach((item, index) => {
        validateSchemaValue(item, schema.items, `${path}[${index}]`, issues);
      });
    }
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const properties = schema.properties && typeof schema.properties === 'object'
      ? schema.properties
      : {};
    for (const key of schema.required || []) {
      if (!Object.hasOwn(value, key) || value[key] === undefined) {
        issues.push(`${path}.${key} is required`);
      }
    }
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateSchemaValue(item, properties[key], `${path}.${key}`, issues);
      } else if (schema.additionalProperties === false) {
        issues.push(`${path}.${key} is not allowed`);
      } else if (
        schema.additionalProperties
        && typeof schema.additionalProperties === 'object'
      ) {
        validateSchemaValue(item, schema.additionalProperties, `${path}.${key}`, issues);
      }
      if (issues.length >= 32) break;
    }
  }
}

function validateToolArguments(tool, args) {
  const issues = [];
  validateSchemaValue(args, tool.inputSchema, '$', issues);
  if (issues.length > 0) throw new ToolInputValidationError(tool.name, issues);
}

/** Build a tool that invokes a bridge `execute` command. */
function execTool(
  name,
  description,
  command,
  properties,
  required,
  mapArgs = (a) => a,
  schemaExtras = {},
) {
  if (!Array.isArray(required)) {
    throw new Error(`MCP write tool "${name}" must declare its required fields`);
  }
  return {
    name,
    description,
    bridgeCommand: command,
    inputSchema: {
      type: 'object',
      properties: {
        ...properties,
        screenshot: {
          type: 'boolean',
          description: 'Capture a viewport screenshot after the action for visual verification',
        },
        expectedSceneRevision: {
          type: 'integer',
          minimum: 0,
          description:
            'Optional optimistic lock from get_editor_state/get_scene_snapshot. The command fails with STALE_REVISION if the scene changed.',
        },
        requestId: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description:
            'Stable idempotency key for safe retries. Reuse the exact key when retrying the same write. If omitted, this MCP process derives one from the current tool call.',
        },
      },
      ...(required.length ? { required } : {}),
      additionalProperties: false,
      ...schemaExtras,
    },
    handler: async (args, context = {}) => {
      const wantScreenshot = Boolean(args.screenshot);
      const expectedSceneRevision = args.expectedSceneRevision;
      const requestId = args.requestId || context.requestId || crypto.randomUUID();
      const callArgs = { ...args };
      delete callArgs.screenshot;
      delete callArgs.expectedSceneRevision;
      delete callArgs.requestId;
      const result = await bridgeExecute(command, mapArgs(callArgs), {
        screenshot: wantScreenshot,
        expectedSceneRevision,
        requestId,
      });
      const response = result && typeof result === 'object'
        ? Object.fromEntries(
            Object.entries(result).filter(([key]) => key !== 'screenshot'),
          )
        : result;
      return screenshotContent(result?.screenshot, response);
    },
  };
}

const ENTITY_ID_SCHEMA = { type: 'integer', minimum: 0 };
const PANEL_KIND_VALUES = [
  'hierarchy',
  'scene',
  'game',
  'inspector',
  'project',
  'console',
  'profiler',
  'timeline',
  'animator',
  'material',
  'shader',
  'spriteEditor',
  'spriteAtlas',
  'build',
  'projectSettings',
];
const PANEL_KIND_SCHEMA = { type: 'string', enum: PANEL_KIND_VALUES };
const finiteNumberTuple = (length) => ({
  type: 'array',
  minItems: length,
  maxItems: length,
  items: { type: 'number' },
});

const WORLD_COMMAND_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      required: ['op', 'components'],
      properties: {
        op: { const: 'spawn' },
        name: { type: 'string' },
        components: {
          type: 'object',
          additionalProperties: { type: 'object' },
        },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['op', 'entity'],
      properties: {
        op: { const: 'despawn' },
        entity: ENTITY_ID_SCHEMA,
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['op', 'entity', 'component', 'value'],
      properties: {
        op: { const: 'setComponent' },
        entity: ENTITY_ID_SCHEMA,
        component: { type: 'string' },
        value: { type: 'object' },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['op', 'entity', 'component'],
      properties: {
        op: { const: 'removeComponent' },
        entity: ENTITY_ID_SCHEMA,
        component: { type: 'string' },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['op', 'entity'],
      properties: {
        op: { const: 'setParent' },
        entity: ENTITY_ID_SCHEMA,
        parent: { type: ['integer', 'null'], minimum: 0 },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['op', 'r', 'g', 'b', 'a'],
      properties: {
        op: { const: 'setClearColor' },
        r: { type: 'number', minimum: 0, maximum: 1 },
        g: { type: 'number', minimum: 0, maximum: 1 },
        b: { type: 'number', minimum: 0, maximum: 1 },
        a: { type: 'number', minimum: 0, maximum: 1 },
      },
      additionalProperties: false,
    },
  ],
};

const INTENT_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      properties: {
        kind: { const: 'SpawnMesh' },
        mesh: { type: 'string', minLength: 1, maxLength: 1024 },
        material: { type: 'string', minLength: 1, maxLength: 1024 },
        at: finiteNumberTuple(3),
        name: { type: 'string', minLength: 1, maxLength: 1024 },
      },
      required: ['kind', 'mesh', 'at'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        kind: { const: 'SetTransform' },
        entity: ENTITY_ID_SCHEMA,
        position: finiteNumberTuple(3),
        rotation: finiteNumberTuple(4),
        scale: finiteNumberTuple(3),
      },
      required: ['kind', 'entity'],
      additionalProperties: false,
      anyOf: [
        { required: ['position'] },
        { required: ['rotation'] },
        { required: ['scale'] },
      ],
    },
    {
      type: 'object',
      properties: {
        kind: { const: 'SetClearColor' },
        color: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          items: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
      required: ['kind', 'color'],
      additionalProperties: false,
    },
  ],
};

const UI_SNAPSHOT_REVISION_SCHEMA = Object.freeze({
  type: 'string',
  pattern: '^ui-v\\d+-\\d+-[0-9a-f]{16}$',
  maxLength: 64,
  description: 'Exact snapshotRevision returned with the selector by get_window_ui',
});

function nonEmptyStringSchema(description) {
  return {
    type: 'string',
    minLength: 1,
    pattern: '\\S',
    description,
  };
}

function uiInteractionProperties(selectorDescription) {
  return {
    windowLabel: { type: 'string', description: 'Window label (default: main)' },
    selector: { type: 'string', description: selectorDescription },
    expectedSnapshotRevision: UI_SNAPSHOT_REVISION_SCHEMA,
  };
}

const TOOLS = [
  {
    name: 'get_project_state',
    description:
      'Get project-hub state even before a project is open: lifecycle phase, active project summary, editorReady mount status, busy/error state, recent count, and event cursor.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('project.state')),
  },
  {
    name: 'list_recent_projects',
    description:
      'List recent MEngine projects from the native editor profile without opening a dialog.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('project.recent')),
  },
  {
    name: 'get_project_settings',
    description:
      'Read persisted Project Settings without opening or focusing the settings panel. Returns Tags, named GameObject Layers, ordered Sorting Layers, and the exact file revision required for updates.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('project.settings')),
  },
  {
    name: 'validate_project_scripts',
    description:
      'Run the exact PC Player TypeScript checks without emitting files, changing build output, or opening a window. Returns a stable source revision plus bounded structured diagnostics with project-relative file, one-based line/column, TypeScript error code, and message.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('project.script_diagnostics')),
  },
  execTool(
    'open_project',
    'Open a validated MEngine project path without a dialog while the editor is on the welcome page. Project switching is blocked once a project is open.',
    'project.open',
    {
      root: { type: 'string', description: 'Absolute path to a directory containing project.json' },
    },
    ['root'],
  ),
  execTool(
    'create_project',
    'Create and open a new MEngine project without a dialog while the editor is on the welcome page.',
    'project.create',
    {
      parent: { type: 'string', description: 'Existing absolute parent directory' },
      name: { type: 'string', description: 'New project directory and project name' },
    },
    ['parent', 'name'],
  ),
  execTool(
    'close_project',
    'Close the active project, destroy its detached/floating editor windows, and return to the project hub without exiting the editor process. Refuses Play Mode and active builds. Unsaved workspace changes require discardDirty=true.',
    'project.close',
    {
      discardDirty: {
        type: 'boolean',
        description: 'Explicitly discard every unsaved scene/resource change (default: false)',
      },
    },
    [],
  ),
  execTool(
    'forget_recent_project',
    'Remove a path from the native recent-project list without deleting the project directory.',
    'project.forget_recent',
    {
      path: { type: 'string', description: 'Exact recent project path to forget' },
    },
    ['path'],
  ),
  execTool(
    'set_sorting_layers',
    'Strictly validate and revision-safely replace the complete ordered Sorting Layer list without opening or focusing a window. Include the Default layer and pass the exact revision from get_project_settings, or null only while the settings file is missing.',
    'project.settings.set_sorting_layers',
    {
      layers: {
        type: 'array',
        minItems: 1,
        maxItems: 64,
        items: {
          type: 'object',
          required: ['id', 'name'],
          properties: {
            id: {
              type: 'string',
              pattern: '^[A-Za-z0-9_-]{1,64}$',
              description: 'Stable serialized identifier',
            },
            name: { type: 'string', minLength: 1, maxLength: 64 },
          },
          additionalProperties: false,
        },
      },
      expectedRevision: {
        type: ['string', 'null'],
        description: 'Exact current revision, or null only when the file is missing',
      },
    },
    ['layers', 'expectedRevision'],
  ),
  execTool(
    'set_tags_and_layers',
    'Strictly validate and revision-safely replace the complete Tag and named GameObject Layer lists without opening or focusing a window. Include Untagged and layer 0 Default, then pass the exact revision from get_project_settings.',
    'project.settings.set_tags_and_layers',
    {
      tags: {
        type: 'array',
        minItems: 1,
        maxItems: 64,
        items: { type: 'string', minLength: 1, maxLength: 64 },
      },
      gameLayers: {
        type: 'array',
        minItems: 1,
        maxItems: 32,
        items: {
          type: 'object',
          required: ['index', 'name'],
          properties: {
            index: { type: 'integer', minimum: 0, maximum: 31 },
            name: { type: 'string', minLength: 1, maxLength: 64 },
          },
          additionalProperties: false,
        },
      },
      expectedRevision: {
        type: ['string', 'null'],
        description: 'Exact current revision, or null only when the file is missing',
      },
    },
    ['tags', 'gameLayers', 'expectedRevision'],
  ),
  {
    name: 'get_editor_state',
    description:
      'Get the mounted editor state: edit/play mode, simulation time, gizmo, Scene orbit camera, undo/redo, current scene, revisions and dirty flag. Use get_project_state before a project is open.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('editor.state')),
  },
  {
    name: 'get_selection',
    description: 'Get the currently selected entity id(s) in the hierarchy.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('selection.get')),
  },
  {
    name: 'get_hierarchy',
    description:
      'Get the full scene hierarchy as a tree of { id, name, active, components, children }. Token-efficient overview of every GameObject.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('scene.hierarchy')),
  },
  {
    name: 'list_scenes',
    description:
      'List saved scenes with active scene, dirty flag, timestamps, and scene-library readiness.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('scene.list')),
  },
  {
    name: 'preview_scene_delete',
    description:
      'Prepare permanent scene deletion. Returns the exact file revision, active/build blockers, and a previewToken that delete_scene must revalidate.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: nonEmptyStringSchema('Existing scene name, with or without .mscene'),
      },
    },
    handler: async (args) => textContent(await bridgeQuery('scene.delete_preview', args)),
  },
  {
    name: 'get_scene_snapshot',
    description:
      'Get the complete scene snapshot, its monotonic revision, and every entity/component. Large; retain revision and use get_scene_changes for incremental observation.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('scene.snapshot')),
  },
  {
    name: 'get_scene_changes',
    description:
      'Get entities added, removed, or changed since a scene revision. Returns current payloads for added/changed entities; resetRequired=true includes a full snapshot after scene switches or expired history.',
    inputSchema: {
      type: 'object',
      required: ['fromRevision'],
      properties: {
        fromRevision: {
          type: 'integer',
          minimum: 0,
          description: 'Revision returned by get_scene_snapshot, get_editor_state, or a previous change result',
        },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('scene.diff', args)),
  },
  {
    name: 'get_editor_events',
    description:
      'Read currently buffered cursor-based editor events. Topics cover project lifecycle, scene, selection, mode, logs, panels, builds, and assets. Continue with nextSequence; truncated=true means older events expired.',
    inputSchema: {
      type: 'object',
      properties: {
        afterSequence: {
          type: 'integer',
          minimum: 0,
          description: 'Exclusive cursor from get_editor_state or a previous event page (default 0)',
        },
        topics: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'scene.changed',
              'selection.changed',
              'mode.changed',
              'dialog.changed',
              'log.added',
              'log.cleared',
              'panel.changed',
              'workspace.changed',
              'window.changed',
              'window.types.changed',
              'menu.changed',
              'view.changed',
              'build.progress',
              'build.artifacts',
              'build.settings',
              'project.settings',
              'asset.changed',
              'project.changed',
            ],
          },
          description: 'Optional topic filter',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum events in chronological order (default 100)',
        },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('events.get', args)),
  },
  {
    name: 'wait_for_editor_events',
    description:
      'Wait up to 15 seconds for matching editor events instead of polling. Pass the exact cursor from editor state or the previous event page; timedOut=true is a normal empty result. At most 64 waits may be pending; excess requests return RATE_LIMITED with retry guidance.',
    inputSchema: {
      type: 'object',
      required: ['afterSequence'],
      properties: {
        afterSequence: {
          type: 'integer',
          minimum: 0,
          description: 'Exact cursor from editor state, get_editor_events, or a previous wait',
        },
        topics: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'scene.changed',
              'selection.changed',
              'mode.changed',
              'dialog.changed',
              'log.added',
              'log.cleared',
              'panel.changed',
              'workspace.changed',
              'window.changed',
              'window.types.changed',
              'menu.changed',
              'view.changed',
              'build.progress',
              'build.artifacts',
              'build.settings',
              'project.settings',
              'asset.changed',
              'project.changed',
            ],
          },
          description: 'Optional topic filter',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum events in chronological order (default 100)',
        },
        timeoutMs: {
          type: 'integer',
          minimum: 0,
          maximum: 15000,
          description: 'Maximum wait duration (default 15000)',
        },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('events.wait', args)),
  },
  {
    name: 'get_entity',
    description: 'Get a single entity (with all components) by numeric id or by name.',
    inputSchema: {
      type: 'object',
      anyOf: [
        { required: ['id'] },
        { required: ['name'] },
      ],
      properties: {
        id: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
        name: {
          type: 'string',
          minLength: 1,
          pattern: '\\S',
          description: 'Entity name (used if id is omitted)',
        },
      },
    },
    handler: async (args) => {
      const queryArgs = typeof args.id === 'number' ? { id: args.id } : { name: args.name };
      return textContent(await bridgeQuery('entity.get', queryArgs));
    },
  },
  {
    name: 'find_entities',
    description:
      'Find live scene entities by case-insensitive name substring, exact component type, and/or active state. Returns compact paged records; continue with nextOffset until null and pass the first page sceneRevision as expectedSceneRevision on every continuation. Scene changes fail with STALE_REVISION instead of returning a torn entity list.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: nonEmptyStringSchema('Case-insensitive entity name substring'),
        component: nonEmptyStringSchema('Exact component type to require'),
        active: { type: 'boolean', description: 'Filter by active state' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum matches to return (default 100)',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          maximum: 1000000,
          description: 'Zero-based match cursor from the previous page (default 0)',
        },
        expectedSceneRevision: {
          type: 'integer',
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
          description: 'sceneRevision from the first page; required when offset is greater than 0',
        },
      },
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
    },
    handler: async (args) => textContent(await bridgeQuery('entity.find', args)),
  },
  {
    name: 'get_entity_component',
    description: 'Get one exact component value from a live scene entity.',
    inputSchema: {
      type: 'object',
      required: ['id', 'component'],
      properties: {
        id: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
        component: nonEmptyStringSchema('Exact component type'),
      },
    },
    handler: async (args) => textContent(await bridgeQuery('entity.get_component', args)),
  },
  {
    name: 'get_prefab_instance',
    description:
      'Resolve any entity in a prefab instance to its root, stable instance id, source asset, GUID, metadata health, and exact current revision. Use the returned revision for apply_prefab or revert_prefab.',
    inputSchema: {
      type: 'object',
      required: ['entity'],
      properties: {
        entity: { ...ENTITY_ID_SCHEMA, description: 'Any entity in the prefab instance' },
      },
      additionalProperties: false,
    },
    handler: async (args) => textContent(await bridgeQuery('prefab.instance', args)),
  },
  {
    name: 'take_screenshot',
    description:
      'Capture a bounded PNG screenshot. target=scene/game captures the rendered viewport; target=window captures an editor window off-screen without activating it, so foreground work is not interrupted. Bitmap captures are serialized and rate-limited. Returns an image for visual verification.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['scene', 'game', 'window'],
          description: 'What to capture: the scene/game viewport, or the whole editor window (default: scene)',
        },
        windowLabel: {
          type: 'string',
          description: 'For target=window, a label returned by list_windows (default: main)',
        },
        maxSize: {
          type: 'integer',
          minimum: 256,
          maximum: 4096,
          description: 'Maximum output width or height in pixels (default: 2048)',
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => {
      const target = args.target || 'scene';
      const maxSize = args.maxSize || 2048;
      const shot =
        target === 'window'
          ? await bridgeQuery('view.window_screenshot', {
              windowLabel: args.windowLabel || 'main',
              maxSize,
            })
          : await bridgeQuery('view.screenshot', { target, maxSize });
      return screenshotContent(shot);
    },
  },
  {
    name: 'capture_window_region',
    description:
      'Capture only one CSS-pixel rectangle from any editor window without activating it. Coordinates align with element rects returned by get_window_ui, making this the efficient visual-evidence path for a specific panel, field, or control. The complete region must fit inside the current WebView viewport.',
    inputSchema: {
      type: 'object',
      required: ['x', 'y', 'width', 'height'],
      properties: {
        windowLabel: {
          type: 'string',
          description: 'Window label returned by list_windows (default: main)',
        },
        x: { type: 'integer', minimum: 0, maximum: 100000 },
        y: { type: 'integer', minimum: 0, maximum: 100000 },
        width: { type: 'integer', minimum: 1, maximum: 100000 },
        height: { type: 'integer', minimum: 1, maximum: 100000 },
        maxSize: {
          type: 'integer',
          minimum: 256,
          maximum: 4096,
          description: 'Maximum output width or height in pixels (default: 2048)',
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => screenshotContent(await bridgeQuery('view.capture_region', {
      windowLabel: args.windowLabel || 'main',
      x: args.x,
      y: args.y,
      width: args.width,
      height: args.height,
      maxSize: args.maxSize || 2048,
    })),
  },
  {
    name: 'list_windows',
    description:
      'List every editor window currently open: the main window, detached panels (panel-*), and floating editor windows (editor-*), with title, position, size, visibility and focus.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('window.list')),
  },
  {
    name: 'list_editor_window_types',
    description:
      'List every registered auxiliary editor window type with its exact typeId, title, default size, and project requirement. Use open_editor_window after a project is ready.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => textContent(await bridgeQuery('window.types')),
  },
  {
    name: 'get_active_dialog',
    description:
      'Read the active non-blocking editor alert, confirmation, or prompt with its exact id, full message, labels, and prompt default. Returns null when no editor dialog is open.',
    inputSchema: {
      type: 'object',
      properties: {
        windowLabel: {
          type: 'string',
          description: 'A label returned by list_windows (default: main)',
        },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('dialog.state', {
      windowLabel: args.windowLabel || 'main',
    })),
  },
  {
    name: 'list_active_dialogs',
    description:
      'List every active non-blocking alert, confirmation, or prompt across all editor windows, including exact window labels and dialog ids.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: async () => textContent(await bridgeQuery('dialog.list')),
  },
  {
    name: 'list_open_documents',
    description:
      'List the current scene and every open resource document with dirty state, active/detached state, and the exact window label to inspect or capture.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('workspace.documents')),
  },
  {
    name: 'list_panels',
    description:
      'List every editor panel with its title, active/docked/detached state, stable dock path, exact host window label, and native visibility/focus state. The response retries briefly across detach/dock transitions and reports whether the dock and native-window snapshots agree.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('panel.list')),
  },
  {
    name: 'get_panel_layout',
    description:
      'Get the exact live dock layout: split/tab tree, active tabs, docked panels, and detached panels with their native window labels. This is a background-safe read.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('panel.get_layout')),
  },
  {
    name: 'get_window_ui',
    description:
      'Get one page of a background-safe semantic editor-window snapshot: visible text, accessible roles/names, control values and states, bounds, supported actions, and stable CSS selectors. Continue with nextOffset until null and pass the first page snapshotRevision as expectedSnapshotRevision on every continuation; stale pages fail instead of skipping or duplicating changed content.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        windowLabel: {
          type: 'string',
          description: 'A label returned by list_windows (default: main)',
        },
        maxElements: {
          type: 'integer',
          minimum: 50,
          maximum: 5000,
          description: 'Maximum semantic elements to return (default: 2000)',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          maximum: 1000000,
          description: 'Zero-based semantic element cursor from the previous page (default: 0)',
        },
        expectedSnapshotRevision: {
          type: 'string',
          pattern: '^ui-v\\d+-\\d+-[0-9a-f]{16}$',
          maxLength: 64,
          description: 'snapshotRevision from the first page; required when offset is greater than 0',
        },
      },
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
    },
    handler: async (args) =>
      textContent(await bridgeQuery('window.ui_snapshot', {
        windowLabel: args.windowLabel || 'main',
        maxElements: typeof args.maxElements === 'number' ? args.maxElements : 2000,
        offset: typeof args.offset === 'number' ? args.offset : 0,
        expectedSnapshotRevision: typeof args.expectedSnapshotRevision === 'string'
          ? args.expectedSnapshotRevision
          : undefined,
      })),
  },
  {
    name: 'read_window_ui_content',
    description:
      'Read exact, unnormalized text or value content from one selector returned by get_window_ui. Pass that same snapshotRevision as expectedSnapshotRevision on every page. Use nextOffset until null and pass the first page contentRevision as expectedContentRevision on every continuation; changed selectors or content fail instead of returning the wrong element or a torn read. Password values are never returned.',
    inputSchema: {
      type: 'object',
      required: ['selector', 'expectedSnapshotRevision', 'field'],
      properties: {
        windowLabel: {
          type: 'string',
          description: 'A label returned by list_windows (default: main)',
        },
        selector: nonEmptyStringSchema('Exact selector returned by get_window_ui'),
        expectedSnapshotRevision: UI_SNAPSHOT_REVISION_SCHEMA,
        field: {
          type: 'string',
          enum: ['text', 'value'],
          description: 'Exact content source to read',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          maximum: 10000000,
          description: 'Zero-based UTF-16 character cursor (default: 0)',
        },
        maxChars: {
          type: 'integer',
          minimum: 1,
          maximum: 100000,
          description: 'Maximum characters on this page (default: 10000)',
        },
        expectedContentRevision: {
          type: 'string',
          pattern: '^content-v\\d+-\\d+-[0-9a-f]{16}$',
          maxLength: 72,
          description: 'contentRevision from the first page; required when offset is greater than 0',
        },
      },
      additionalProperties: false,
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
    },
    handler: async (args) =>
      textContent(await bridgeQuery('window.ui_content', {
        windowLabel: args.windowLabel || 'main',
        selector: args.selector,
        expectedSnapshotRevision: args.expectedSnapshotRevision,
        field: args.field,
        offset: typeof args.offset === 'number' ? args.offset : 0,
        maxChars: typeof args.maxChars === 'number' ? args.maxChars : 10000,
        expectedContentRevision: typeof args.expectedContentRevision === 'string'
          ? args.expectedContentRevision
          : undefined,
      })),
  },
  {
    name: 'get_console_logs',
    description: 'Get structured editor console logs (level, message, time). Filter by level and limit.',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['info', 'warn', 'error'], description: 'Filter by level' },
        since: { type: 'number', description: 'Only entries at or after this epoch-millisecond time' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 300,
          description: 'Return at most this many recent entries',
        },
      },
    },
    handler: async (args) => {
      const queryArgs = {};
      if (args.level) queryArgs.level = args.level;
      if (typeof args.since === 'number') queryArgs.since = args.since;
      if (typeof args.limit === 'number') queryArgs.limit = args.limit;
      return textContent(await bridgeQuery('console.get_logs', queryArgs));
    },
  },
  execTool(
    'clear_console_logs',
    'Clear both the structured AgentBridge log buffer and the visible editor Console panel as an idempotent background-safe write.',
    'console.clear',
    {},
    [],
  ),
  {
    name: 'get_profiler_samples',
    description:
      'Read bounded Scene or Game editor Canvas preview samples plus latest, average, p95, and peak frame/paint metrics. This is editor CPU telemetry, not native Player GPU or memory profiling.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['scene', 'game'],
          description: 'Viewport source; defaults to game',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 480,
          description: 'Recent samples to return; defaults to 120',
        },
      },
      additionalProperties: false,
    },
    handler: async (args) => textContent(await bridgeQuery('profiler.get_samples', args)),
  },
  execTool(
    'clear_profiler_samples',
    'Clear Scene and Game editor-profiler samples across every editor window as an idempotent background-safe write.',
    'profiler.clear',
    {},
    [],
  ),
  {
    name: 'list_assets',
    description:
      'List the current project asset index with paths, kinds, GUID/meta health, sizes, and optimistic-lock revisions. Supports filters and bounded pages; continue with nextOffset until null and pass the first page indexRevision as expectedIndexRevision on every continuation. Disk or editor changes fail with STALE_REVISION instead of returning a torn index.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        search: { type: 'string', description: 'Case-insensitive path/name substring' },
        kind: { type: 'string', description: 'Exact asset kind filter' },
        folder: nonEmptyStringSchema('Assets folder prefix, e.g. Assets/Scripts'),
        limit: { type: 'integer', minimum: 1, maximum: 5000, description: 'Maximum rows (default 1000)' },
        offset: {
          type: 'integer',
          minimum: 0,
          maximum: 1000000,
          description: 'Zero-based asset cursor from the previous page (default 0)',
        },
        expectedIndexRevision: {
          type: 'string',
          pattern: '^asset-index-v\\d+-\\d+-[0-9a-f]{16}$',
          maxLength: 80,
          description: 'indexRevision from the first page; required when offset is greater than 0',
        },
      },
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
    },
    handler: async (args) => textContent(await bridgeQuery('asset.list', args)),
  },
  {
    name: 'list_sprites',
    description:
      'List stable sprite ids, source texture paths, slice names, source rectangles, pivots, and pixels-per-unit values. Supports filtered revision-safe pages; pass the first spriteRevision on every continuation so changed imports fail with STALE_REVISION instead of returning torn references.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        search: { type: 'string', description: 'Case-insensitive id, name, path, or slice-name substring' },
        folder: nonEmptyStringSchema('Assets folder prefix'),
        limit: { type: 'integer', minimum: 1, maximum: 5000, description: 'Maximum rows (default 1000)' },
        offset: {
          type: 'integer',
          minimum: 0,
          maximum: 1000000,
          description: 'Zero-based sprite cursor from the previous page (default 0)',
        },
        expectedSpriteRevision: {
          type: 'string',
          pattern: '^sprite-index-v\\d+-\\d+-[0-9a-f]{16}$',
          maxLength: 80,
          description: 'spriteRevision from the first page; required when offset is greater than 0',
        },
      },
      anyOf: [
        {
          properties: {
            offset: { type: 'integer', maximum: 0 },
          },
        },
        {
          required: ['offset', 'expectedSpriteRevision'],
          properties: {
            offset: { type: 'integer', minimum: 1 },
          },
        },
      ],
    },
    handler: async (args) => textContent(await bridgeQuery('sprite.list', args)),
  },
  {
    name: 'read_asset_text',
    description:
      'Read a UTF-8 project text asset and return its exact revision. Use that revision with write_asset_text to prevent overwriting concurrent edits.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: nonEmptyStringSchema('Asset path under Assets/'),
        maxBytes: { type: 'integer', minimum: 1, maximum: 8388608, description: 'Read limit (default 1 MiB)' },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('asset.read_text', args)),
  },
  {
    name: 'find_asset_references',
    description:
      'Scan the project for exact, subresource, relative, manifest, and script references to an asset before changing it.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: nonEmptyStringSchema('Asset path under Assets/'),
      },
    },
    handler: async (args) => textContent(await bridgeQuery('asset.find_references', args)),
  },
  {
    name: 'preview_asset_rename',
    description:
      'Prepare a reference-aware asset rename. Returns a previewToken, automatic rewrites, skipped-file count, and bounded manual references. Pass the token unchanged to rename_asset.',
    inputSchema: {
      type: 'object',
      required: ['sourcePath', 'destinationPath'],
      properties: {
        sourcePath: nonEmptyStringSchema('Existing asset path under Assets/'),
        destinationPath: nonEmptyStringSchema(
          'Unused destination path with the same extension',
        ),
      },
    },
    handler: async (args) => textContent(await bridgeQuery('asset.rename_preview', args)),
  },
  {
    name: 'preview_asset_duplicate',
    description:
      'Prepare a GUID-safe asset duplicate and report any source references requiring review. Pass the returned previewToken unchanged to duplicate_asset.',
    inputSchema: {
      type: 'object',
      required: ['sourcePath', 'destinationPath'],
      properties: {
        sourcePath: nonEmptyStringSchema('Existing asset path under Assets/'),
        destinationPath: nonEmptyStringSchema(
          'Unused destination path with the same extension',
        ),
      },
    },
    handler: async (args) => textContent(await bridgeQuery('asset.duplicate_preview', args)),
  },
  {
    name: 'preview_asset_trash',
    description:
      'Scan exact, manifest, relative, subresource, and script references before moving an asset to project Trash. Referenced assets cannot be trashed.',
    inputSchema: {
      type: 'object',
      required: ['sourcePath'],
      properties: {
        sourcePath: nonEmptyStringSchema('Existing asset path under Assets/'),
      },
    },
    handler: async (args) => textContent(await bridgeQuery('asset.trash_preview', args)),
  },
  {
    name: 'list_asset_trash',
    description:
      'List recoverable project Trash entries with exact record revisions required by restore_asset. Continuation pages require the first trashRevision so concurrent Trash changes fail instead of returning torn results.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum Trash entries (default 100)',
        },
        offset: {
          type: 'integer',
          minimum: 0,
          maximum: 1000000,
          description: 'Zero-based Trash cursor from the previous page (default 0)',
        },
        expectedTrashRevision: {
          type: 'string',
          pattern: '^asset-trash-v\\d+-\\d+-[0-9a-f]{16}$',
          maxLength: 80,
          description: 'trashRevision from the first page; required when offset is greater than 0',
        },
      },
      anyOf: [
        {
          properties: {
            offset: { type: 'integer', maximum: 0 },
          },
        },
        {
          required: ['offset', 'expectedTrashRevision'],
          properties: {
            offset: { type: 'integer', minimum: 1 },
          },
        },
      ],
    },
    handler: async (args) => textContent(await bridgeQuery('asset.trash_list', args)),
  },
  {
    name: 'get_build_settings',
    description:
      'Get ordered scenes in build, available scenes, content inclusion mode, always-included paths, and shader variant limit.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('build.settings')),
  },
  {
    name: 'get_build_status',
    description:
      'Get the active or most recent AgentBridge PC build job, including progress, result, failure, and timestamps. Returns idle before any agent build.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('build.status')),
  },
  {
    name: 'get_build_artifact_status',
    description:
      'Get the active or most recent asynchronous history-patch, history-restore, or patch-verify job. Poll until status is succeeded or failed; these integrity-sensitive jobs are not cancellable.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('build.artifact_status')),
  },
  {
    name: 'get_build_history',
    description: 'Get recent PC build history entries and validation counts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum history entries (default 20)' },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('build.history', args)),
  },
  {
    name: 'get_build_patches',
    description:
      'Get signed automatic and historical build patches, including exact ids, hashes, sizes, signing keys, and whether an archived base is available for verification.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum patch entries (default 50)' },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('build.patches', args)),
  },
  {
    name: 'compare_build_history',
    description:
      'Compare two exact build history entries without opening or focusing Build Settings. Returns added, removed, changed, and unchanged packaged files.',
    inputSchema: {
      type: 'object',
      required: ['previousId', 'currentId'],
      properties: {
        previousId: nonEmptyStringSchema('Older history id from get_build_history'),
        currentId: nonEmptyStringSchema('Newer history id from get_build_history'),
      },
    },
    handler: async (args) => textContent(await bridgeQuery('build.history.compare', args)),
  },

  {
    name: 'list_commands',
    description: 'List every editor command (id, category, description, readOnly) the agent can invoke via the write tools.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('commands.list')),
  },
  {
    name: 'list_queries',
    description:
      'List every transport-level read query (id, category, description, readOnly) available through the native WebSocket and one-shot CLI.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('queries.list')),
  },
  {
    name: 'describe_query',
    description:
      'Get the complete JSON Schema for one transport-level read query argument object.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1, pattern: '\\S', description: 'Exact id returned by list_queries' },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('queries.describe', args)),
  },
  {
    name: 'list_intents',
    description:
      'List supported high-level editor intents with their complete JSON Schemas before applying one.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('intents.list')),
  },
  {
    name: 'describe_command',
    description:
      'Get the complete JSON Schema for one AgentBridge command argument object plus shared execution options such as screenshot and expectedSceneRevision.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: nonEmptyStringSchema('Exact id returned by list_commands'),
      },
    },
    handler: async (args) => textContent(await bridgeQuery('commands.describe', args)),
  },
  {
    name: 'list_menu_items',
    description:
      'List registered Unity-style editor menu items with exact path, shortcut, priority, enabled state, and whether Agent invocation is safe. Foreground-only items include the domain-tool alternative when one exists.',
    inputSchema: {
      type: 'object',
      properties: {
        root: nonEmptyStringSchema('Optional exact root menu name'),
      },
    },
    handler: async (args) =>
      textContent(await bridgeQuery('menu.list', args.root ? { root: args.root } : {})),
  },
  {
    name: 'get_component_schema',
    description:
      'Describe addable components and their fields (type, label, description, required components, and fields with inferred types/defaults). Omit type to list all components; pass type to inspect one. Use this to learn what a component accepts before add_component/set_component.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Component type to inspect (omit for all)' },
      },
    },
    handler: async (args) => {
      if (args.type) return textContent(await bridgeQuery('schema.component', { type: args.type }));
      return textContent(await bridgeQuery('schema.components'));
    },
  },

  // ── Write tools (Phase 2) ────────────────────────────────────────────
  execTool(
    'apply_batch',
    'Validate and apply 1-256 WorldCommands as one undo transaction. Validation simulates hierarchy changes before mutation, so an invalid command leaves the scene untouched. Spawned entity ids are returned after success and cannot be referenced inside the same batch.',
    'batch.apply',
    {
      commands: {
        type: 'array',
        minItems: 1,
        maxItems: 256,
        items: WORLD_COMMAND_SCHEMA,
      },
    },
    ['commands'],
  ),
  execTool(
    'apply_intent',
    'Validate, expand, and atomically apply one supported high-level intent without activating the editor window.',
    'intent.apply',
    {
      intent: INTENT_SCHEMA,
    },
    ['intent'],
  ),
  execTool(
    'new_scene',
    'Create and immediately save a named scene without a dialog. Refuses to discard dirty work or overwrite an existing scene unless explicitly allowed.',
    'scene.new',
    {
      name: { type: 'string', description: 'Scene name, with or without .mscene' },
      overwrite: { type: 'boolean', description: 'Allow replacing an existing scene (default false)' },
      discardDirty: { type: 'boolean', description: 'Allow discarding unsaved current-scene changes (default false)' },
    },
    ['name'],
  ),
  execTool(
    'open_scene',
    'Open a saved scene by name without a dialog. Refuses to discard current unsaved scene changes unless explicitly allowed.',
    'scene.open',
    {
      name: { type: 'string', description: 'Scene name, with or without .mscene' },
      discardDirty: { type: 'boolean', description: 'Allow discarding unsaved current-scene changes (default false)' },
    },
    ['name'],
  ),
  execTool(
    'save_scene',
    'Save the current scene, optionally under a new name. Existing destinations require overwrite=true.',
    'scene.save',
    {
      name: { type: 'string', description: 'Optional destination scene name' },
      overwrite: { type: 'boolean', description: 'Allow replacing an existing destination (default false)' },
    },
    [],
  ),
  execTool(
    'save_all',
    'Save the current scene and every open resource document without a dialog. Provide name for a dirty unnamed scene.',
    'scene.save_all',
    {
      name: { type: 'string', description: 'Name to use only when the dirty scene is unnamed' },
      overwrite: { type: 'boolean', description: 'Allow replacing that unnamed-scene destination (default false)' },
    },
    [],
  ),
  execTool(
    'load_scene_json',
    'Strictly validate and atomically replace the current authored scene world in memory. The operation creates one undo step, does not save to disk, and preserves the current Scene-view camera and project game resolution.',
    'scene.load_json',
    {
      json: {
        type: 'string',
        description: 'Complete version 1 MEngine scene JSON (max 8 MiB and 20,000 entities)',
      },
    },
    ['json'],
  ),
  execTool(
    'rename_scene',
    'Rename a saved scene while preserving its GUID and automatically updating active-scene and Build Settings references. Unsaved workspace changes block the operation.',
    'scene.rename',
    {
      oldName: { type: 'string', description: 'Existing scene name, with or without .mscene' },
      newName: { type: 'string', description: 'Unused destination scene name, with or without .mscene' },
    },
    ['oldName', 'newName'],
  ),
  execTool(
    'delete_scene',
    'Permanently delete a non-active scene that is not in Build Settings. Requires an exact token from preview_scene_delete and revalidates file revision and blockers immediately before deletion.',
    'scene.delete',
    {
      name: { type: 'string', description: 'Scene name returned by preview_scene_delete' },
      previewToken: { type: 'string', description: 'Exact token returned by preview_scene_delete' },
    },
    ['name', 'previewToken'],
  ),
  execTool(
    'import_asset_file',
    'Import one external local file into the project without a file picker or foreground focus. The source must be an absolute regular non-symlink file of a type accepted by the editor (max 64 MiB). The exact destination under Assets/ must be unused and keep the source extension.',
    'asset.import_file',
    {
      sourcePath: { type: 'string', description: 'Absolute local source file path' },
      destinationPath: {
        type: 'string',
        description: 'Exact unused destination path under Assets/ with the same extension',
      },
    },
    ['sourcePath', 'destinationPath'],
  ),
  execTool(
    'create_asset',
    'Create one default authored resource without a dialog, opening an editor, or foreground focus. Returns the primary indexed asset and every newly generated companion asset with GUID and revision. Use parentPath only to choose the parent of a material instance.',
    'asset.create',
    {
      kind: {
        type: 'string',
        enum: [
          'animation',
          'animator',
          'avatar-mask',
          'material',
          'material-instance',
          'shader',
          'sprite-atlas',
          'timeline',
        ],
        description: 'Authored resource type',
      },
      parentPath: {
        type: 'string',
        description: 'Optional existing .mmat, .mat, or .minst parent for material-instance',
      },
    },
    ['kind'],
  ),
  execTool(
    'open_asset',
    'Open a supported material, material-instance, shader, animator, avatar-mask, animation, timeline, sprite-compatible texture, or sprite-atlas asset in its docked editor without raising or focusing a native window. Refuses when the target host is visible or focused, and returns only after the exact document is active.',
    'asset.open',
    {
      path: {
        type: 'string',
        description: 'Exact project-relative asset path under Assets/',
      },
    },
    ['path'],
  ),
  execTool(
    'instantiate_asset',
    'Instantiate one indexed prefab, glTF/GLB model, or sprite-compatible texture into the authored scene without a dialog or foreground focus. The asset must have healthy metadata and the operation creates one undo step.',
    'asset.instantiate',
    {
      path: {
        type: 'string',
        description: 'Exact prefab, model, or PNG/JPEG/WebP/GIF path under Assets/',
      },
    },
    ['path'],
  ),
  execTool(
    'create_prefab',
    'Capture one authored entity hierarchy as a new uniquely named prefab asset, then link that hierarchy as its first instance. Resource-document edits block the write, while intentional unsaved scene edits are preserved. Returns the indexed asset, exact revision, link identity, and root entity.',
    'prefab.create',
    {
      entity: { ...ENTITY_ID_SCHEMA, description: 'Root entity to capture and link' },
    },
    ['entity'],
  ),
  execTool(
    'apply_prefab',
    'Apply one linked instance hierarchy to its prefab asset without a dialog or foreground focus. Requires the exact asset revision returned by get_prefab_instance or list_assets and fails on concurrent disk edits.',
    'prefab.apply',
    {
      entity: { ...ENTITY_ID_SCHEMA, description: 'Any entity in the prefab instance' },
      expectedRevision: { type: 'string', description: 'Exact current prefab asset revision' },
    },
    ['entity', 'expectedRevision'],
  ),
  execTool(
    'revert_prefab',
    'Replace one linked instance hierarchy from an exact prefab asset revision as one undoable scene edit. The asset is read in the background and is not modified.',
    'prefab.revert',
    {
      entity: { ...ENTITY_ID_SCHEMA, description: 'Any entity in the prefab instance' },
      expectedRevision: { type: 'string', description: 'Exact current prefab asset revision' },
    },
    ['entity', 'expectedRevision'],
  ),
  execTool(
    'unpack_prefab',
    'Remove prefab linkage from one complete instance while preserving its authored entities and components as one undoable scene edit.',
    'prefab.unpack',
    {
      entity: { ...ENTITY_ID_SCHEMA, description: 'Any entity in the prefab instance' },
    },
    ['entity'],
  ),
  execTool(
    'write_asset_text',
    'Create or update a UTF-8 text asset under Assets/ with optimistic concurrency. Pass the exact revision returned by list_assets/read_asset_text, or null only when creating a missing file. Refuses while any editor window has unsaved work.',
    'asset.write_text',
    {
      path: { type: 'string', description: 'Asset path under Assets/' },
      contents: { type: 'string', description: 'Complete UTF-8 file contents (max 8 MiB)' },
      expectedRevision: {
        type: ['string', 'null'],
        description: 'Current asset revision, or null only for creation',
      },
    },
    ['path', 'contents', 'expectedRevision'],
  ),
  execTool(
    'rename_asset',
    'Apply an asset rename prepared by preview_asset_rename. The exact preview token is mandatory and is revalidated immediately before the atomic transaction.',
    'asset.rename',
    {
      sourcePath: { type: 'string', description: 'Source path used for the preview' },
      destinationPath: { type: 'string', description: 'Destination path used for the preview' },
      previewToken: { type: 'string', description: 'Exact token returned by preview_asset_rename' },
      allowManualReferences: { type: 'boolean', description: 'Explicitly accept references that cannot be rewritten automatically' },
      allowSkippedFiles: { type: 'boolean', description: 'Explicitly accept files skipped by reference scanning' },
    },
    ['sourcePath', 'destinationPath', 'previewToken'],
  ),
  execTool(
    'duplicate_asset',
    'Apply an asset duplicate prepared by preview_asset_duplicate. Creates a new GUID and revalidates the exact preview before writing.',
    'asset.duplicate',
    {
      sourcePath: { type: 'string', description: 'Source path used for the preview' },
      destinationPath: { type: 'string', description: 'Destination path used for the preview' },
      previewToken: { type: 'string', description: 'Exact token returned by preview_asset_duplicate' },
      allowManualReferences: { type: 'boolean', description: 'Explicitly accept source references requiring manual review' },
    },
    ['sourcePath', 'destinationPath', 'previewToken'],
  ),
  execTool(
    'trash_asset',
    'Move an unreferenced asset to recoverable project Trash after revalidating preview_asset_trash. Existing references or a truncated scan always block the operation.',
    'asset.trash',
    {
      sourcePath: { type: 'string', description: 'Source path used for the preview' },
      previewToken: { type: 'string', description: 'Exact token returned by preview_asset_trash' },
      allowSkippedFiles: { type: 'boolean', description: 'Explicitly accept files skipped by reference scanning' },
    },
    ['sourcePath', 'previewToken'],
  ),
  execTool(
    'restore_asset',
    'Restore an exact project Trash entry without overwriting an occupied destination.',
    'asset.restore',
    {
      trashId: { type: 'string', description: 'Trash entry id returned by list_asset_trash' },
      expectedRecordRevision: { type: 'string', description: 'Exact record revision returned by list_asset_trash' },
    },
    ['trashId', 'expectedRecordRevision'],
  ),
  execTool(
    'set_build_scenes',
    'Revision-safely set the exact ordered scene list in Build Settings without focusing a window. Query get_build_settings first; the first item is the entry scene.',
    'build.settings.set_scenes',
    {
      scenes: {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: { type: 'string' },
        description: 'Exact ordered paths from availableScenes, e.g. Assets/Scenes/Main.mscene',
      },
      expectedRevision: {
        type: 'string',
        description: 'Exact project.json revision returned by get_build_settings',
      },
    },
    ['scenes', 'expectedRevision'],
  ),
  execTool(
    'set_build_asset_policy',
    'Revision-safely set content inclusion mode, always-included project paths, and shader variant limit without changing the build scene order or focusing a window.',
    'build.settings.set_asset_policy',
    {
      assetMode: {
        type: 'string',
        enum: ['all', 'referenced'],
        description: 'Package all assets or only referenced assets plus alwaysInclude paths',
      },
      alwaysInclude: {
        type: 'array',
        maxItems: 256,
        uniqueItems: true,
        items: { type: 'string' },
        description: 'Existing Assets/ or Scripts/ paths that must always be packaged',
      },
      shaderVariantLimit: {
        type: 'integer',
        minimum: 1,
        maximum: 65536,
        description: 'Maximum generated shader variants',
      },
      expectedRevision: {
        type: 'string',
        description: 'Exact project.json revision returned by get_build_settings',
      },
    },
    ['assetMode', 'alwaysInclude', 'shaderVariantLimit', 'expectedRevision'],
  ),
  execTool(
    'start_pc_build',
    'Start an asynchronous PC Player build after verifying the whole workspace is saved. Poll get_build_status for progress/result.',
    'build.start',
    {
      profile: { type: 'string', enum: ['debug', 'release'], description: 'Build profile (default debug)' },
      clean: { type: 'boolean', description: 'Clean output before building (default true)' },
    },
    [],
  ),
  execTool(
    'cancel_pc_build',
    'Request safe cancellation of the active AgentBridge PC Player build.',
    'build.cancel',
    {},
    [],
  ),
  execTool(
    'verify_pc_build',
    'Run the published Player package validator without creating a window. Use executable and contentHash from a successful get_build_status result or build history entry.',
    'build.verify',
    {
      executable: {
        type: 'string',
        description: 'Published Player executable inside the project build output',
      },
      expectedContentHash: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{64}$',
        description: 'Exact 64-character contentHash from the build result',
      },
    },
    ['executable', 'expectedContentHash'],
  ),
  execTool(
    'run_pc_player',
    'Launch a validated published Player. This creates a visible application window and may take foreground, so call it only after the user explicitly requests a launch and pass allowForegroundLaunch=true.',
    'build.run',
    {
      executable: {
        type: 'string',
        description: 'Published Player executable from a successful build result or current build history',
      },
      allowForegroundLaunch: {
        type: 'boolean',
        const: true,
        description: 'Required acknowledgement that the launched Player creates a visible window',
      },
    },
    ['executable', 'allowForegroundLaunch'],
  ),
  execTool(
    'create_build_history_patch',
    'Start asynchronous creation and verification of a signed patch between two archived builds without opening Build Settings. Poll get_build_artifact_status. Both ids must be compatible signed content archives, and MENGINE_SIGNING_KEY must be configured.',
    'build.history.create_patch',
    {
      previousId: { type: 'string', description: 'Older history id from get_build_history' },
      currentId: { type: 'string', description: 'Newer history id from get_build_history' },
    },
    ['previousId', 'currentId'],
  ),
  execTool(
    'restore_build_history',
    'Start asynchronous reconstruction of one signed archived build, verify it with an explicit trusted Ed25519 public-key path, and atomically publish it. Poll get_build_artifact_status. The previous published build is preserved on failure.',
    'build.history.restore',
    {
      historyId: { type: 'string', description: 'Signed archived history id from get_build_history' },
      publicKeyPath: { type: 'string', description: 'Absolute trusted Ed25519 public-key file path' },
    },
    ['historyId', 'publicKeyPath'],
  ),
  execTool(
    'verify_build_patch',
    'Start asynchronous verification of one signed build patch against a matching archived base using an explicit trusted Ed25519 public-key path. Poll get_build_artifact_status. No editor window or native picker is opened.',
    'build.patch.verify',
    {
      patchId: { type: 'string', description: 'Exact patch id from get_build_patches' },
      publicKeyPath: { type: 'string', description: 'Absolute trusted Ed25519 public-key file path' },
    },
    ['patchId', 'publicKeyPath'],
  ),
  execTool(
    'create_gameobject',
    'Create a new GameObject with optional components and parent. Returns the new entity id.',
    'entity.create',
    {
      name: { type: 'string', description: 'Entity name' },
      components: {
        type: 'object',
        additionalProperties: { type: 'object' },
        description: 'Component map, e.g. { Transform: {...}, MeshRenderer: {...} }',
      },
      parent: {
        type: ['integer', 'null'],
        minimum: 0,
        description: 'Parent entity id (null = root)',
      },
    },
    [],
  ),
  execTool(
    'create_typed',
    'Create any built-in GameObject exposed by the editor GameObject menu. Composite objects such as Tilemap and UI controls return the selected authored object rather than their implicit Grid or Canvas parent.',
    'entity.create_typed',
    {
      kind: {
        type: 'string',
        enum: [
          'empty',
          'cube',
          'camera',
          'camera2d',
          'sprite',
          'animated_sprite',
          'line2d',
          'grid',
          'tilemap',
          'spine_skeleton',
          'particle_3d',
          'particle_2d',
          'directional_light',
          'point_light',
          'spot_light',
          'environment_light',
          'global_light_2d',
          'point_light_2d',
          'audio_source',
          'audio_listener',
          'audio_mixer',
          'ui_canvas',
          'ui_image',
          'ui_raw_image',
          'ui_button',
          'ui_text',
          'ui_toggle',
          'ui_slider',
          'ui_scrollbar',
          'ui_progress_bar',
          'ui_input_field',
          'ui_dropdown',
          'ui_list_view',
          'ui_scroll_view',
          'ui_tab_view',
          'ui_panel',
          'ui_layout_group',
        ],
        description: 'Exact built-in object kind',
      },
    },
    ['kind'],
  ),
  execTool(
    'delete_entities',
    'Delete entities. Pass ids to delete specific ones, or omit to delete the current selection.',
    'entity.delete',
    { ids: { type: 'array', items: ENTITY_ID_SCHEMA, description: 'Entity ids to delete (default: current selection)' } },
    [],
  ),
  execTool(
    'duplicate_entities',
    'Duplicate entities. Pass ids or omit to duplicate the current selection.',
    'entity.duplicate',
    { ids: { type: 'array', items: ENTITY_ID_SCHEMA, description: 'Entity ids to duplicate (default: current selection)' } },
    [],
  ),
  execTool('rename_entity', 'Rename an entity.', 'entity.rename', {
    id: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    name: { type: 'string', description: 'New name' },
  }, ['id', 'name']),
  execTool('set_active', 'Enable or disable an entity.', 'entity.set_active', {
    id: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    active: { type: 'boolean', description: 'Active flag' },
  }, ['id', 'active']),
  execTool('set_entities_active', 'Enable or disable entities as one undo transaction.', 'entity.set_actives', {
    ids: { type: 'array', minItems: 1, maxItems: 256, items: ENTITY_ID_SCHEMA, description: 'Entity ids to activate or deactivate together' },
    active: { type: 'boolean', description: 'Shared active state' },
  }, ['ids', 'active']),
  execTool('set_entity_tag', 'Set an entity classification tag.', 'entity.set_tag', {
    id: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    tag: { type: 'string', minLength: 1, maxLength: 64, description: 'Tag value' },
  }, ['id', 'tag']),
  execTool('set_entity_tags', 'Set one classification tag on entities as one undo transaction.', 'entity.set_tags', {
    ids: { type: 'array', minItems: 1, maxItems: 256, items: ENTITY_ID_SCHEMA, description: 'Entity ids whose tags should be changed together' },
    tag: { type: 'string', minLength: 1, maxLength: 64, description: 'Shared GameObject classification tag' },
  }, ['ids', 'tag']),
  execTool('set_entity_layer', 'Set an entity GameObject layer index.', 'entity.set_layer', {
    id: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    layer: { type: 'integer', minimum: 0, maximum: 31, description: 'Layer index' },
  }, ['id', 'layer']),
  execTool('set_entity_layers', 'Set one GameObject layer on entities as one undo transaction.', 'entity.set_layers', {
    ids: { type: 'array', minItems: 1, maxItems: 256, items: ENTITY_ID_SCHEMA, description: 'Entity ids whose GameObject layers should be changed together' },
    layer: { type: 'integer', minimum: 0, maximum: 31, description: 'Shared GameObject layer index' },
  }, ['ids', 'layer']),
  execTool('reparent_entities', 'Reparent entities under a new parent.', 'entity.reparent', {
    ids: { type: 'array', items: ENTITY_ID_SCHEMA, description: 'Entity ids to reparent' },
    parent: { type: ['integer', 'null'], minimum: 0, description: 'New parent id (null = root)' },
    index: { type: 'integer', minimum: 0, description: 'Sibling index (optional)' },
  }, ['ids', 'parent']),
  execTool('reorder_entity', 'Move an entity to a sibling index under its current parent.', 'entity.reorder', {
    id: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    index: { type: 'integer', minimum: 0, description: 'Destination sibling index' },
  }, ['id', 'index']),
  execTool('add_component', 'Add a component to an entity.', 'component.add', {
    entity: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    type: { type: 'string', description: 'Component type, e.g. MeshRenderer, Rigidbody, AutoRotate' },
    value: { type: 'object', description: 'Initial component value (optional)' },
  }, ['entity', 'type']),
  execTool('add_component_to_entities', 'Add one component to entities as one undo transaction.', 'component.add_many', {
    entities: {
      type: 'array',
      minItems: 1,
      maxItems: 256,
      items: ENTITY_ID_SCHEMA,
      description: 'Entity ids that should receive the component together',
    },
    type: { type: 'string', description: 'Component type, e.g. MeshRenderer, Rigidbody, AutoRotate' },
    value: { type: 'object', description: 'Optional shared initial value; known components use catalog defaults when omitted' },
  }, ['entities', 'type']),
  execTool('remove_component', 'Remove a component from an entity.', 'component.remove', {
    entity: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    type: { type: 'string', description: 'Component type to remove' },
  }, ['entity', 'type']),
  execTool('remove_component_from_entities', 'Remove one shared component from entities as one undo transaction.', 'component.remove_many', {
    entities: {
      type: 'array',
      minItems: 1,
      maxItems: 256,
      items: ENTITY_ID_SCHEMA,
      description: 'Entity ids that should lose the shared component together',
    },
    type: { type: 'string', description: 'Shared component type to remove' },
  }, ['entities', 'type']),
  execTool('set_component', 'Replace a component value on an entity.', 'component.set', {
    entity: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    type: { type: 'string', description: 'Component type' },
    value: { type: 'object', description: 'Full component value' },
  }, ['entity', 'type', 'value']),
  execTool('set_component_on_entities', 'Replace one shared component on entities as one undo transaction.', 'component.set_many', {
    entities: {
      type: 'array',
      minItems: 1,
      maxItems: 256,
      items: ENTITY_ID_SCHEMA,
      description: 'Entity ids whose shared component should be replaced together',
    },
    type: { type: 'string', description: 'Shared component type' },
    value: { type: 'object', description: 'Complete shared component value' },
  }, ['entities', 'type', 'value']),
  execTool('patch_component', 'Shallow-merge fields into a component on an entity.', 'component.patch', {
    entity: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    type: { type: 'string', description: 'Component type' },
    patch: { type: 'object', description: 'Fields to merge' },
  }, ['entity', 'type', 'patch']),
  execTool('patch_component_on_entities', 'Shallow-merge fields into one shared component on entities as one undo transaction.', 'component.patch_many', {
    entities: {
      type: 'array',
      minItems: 1,
      maxItems: 256,
      items: ENTITY_ID_SCHEMA,
      description: 'Entity ids whose shared component should be patched together',
    },
    type: { type: 'string', description: 'Shared component type' },
    patch: { type: 'object', description: 'Shared fields to shallow-merge' },
  }, ['entities', 'type', 'patch']),
  execTool(
    'invoke_component_method',
    'Invoke one method registered by a Behaviour component. Query get_component_schema first for the exact method list. The edit-mode path is undoable when the method changes serialized fields.',
    'component.invoke',
    {
      entity: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
      type: { type: 'string', description: 'Behaviour component type' },
      method: { type: 'string', description: 'Exact registered method name' },
    },
    ['entity', 'type', 'method'],
  ),
  execTool(
    'set_transform',
    'Set position/rotation/scale on an entity (omitted fields keep current values). Rotation is a quaternion [x,y,z,w].',
    'transform.set',
    {
      entity: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
      position: { ...finiteNumberTuple(3), description: '[x, y, z]' },
      rotation: { ...finiteNumberTuple(4), description: 'quaternion [x, y, z, w]' },
      scale: { ...finiteNumberTuple(3), description: '[x, y, z]' },
    },
    ['entity'],
    undefined,
    {
      anyOf: [
        { required: ['position'] },
        { required: ['rotation'] },
        { required: ['scale'] },
      ],
    },
  ),
  execTool('translate_entity', 'Translate an entity by a local-position delta as one undoable edit.', 'transform.translate', {
    entity: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
    delta: { ...finiteNumberTuple(3), description: 'Local-position delta [x, y, z]' },
  }, ['entity', 'delta']),
  execTool(
    'set_rect_transform',
    'Set exact serialized RectTransform fields as one undoable edit. Omitted fields retain their current values; anchors and pivot are normalized 0..1 tuples.',
    'rect.set',
    {
      entity: { ...ENTITY_ID_SCHEMA, description: 'Entity id with RectTransform' },
      anchoredPosition: { ...finiteNumberTuple(2), description: '[x, y]' },
      sizeDelta: { ...finiteNumberTuple(2), description: '[width, height]' },
      pivot: {
        ...finiteNumberTuple(2),
        items: { type: 'number', minimum: 0, maximum: 1 },
        description: 'Normalized pivot [x, y]',
      },
      anchorMin: {
        ...finiteNumberTuple(2),
        items: { type: 'number', minimum: 0, maximum: 1 },
        description: 'Normalized minimum anchor [x, y]',
      },
      anchorMax: {
        ...finiteNumberTuple(2),
        items: { type: 'number', minimum: 0, maximum: 1 },
        description: 'Normalized maximum anchor [x, y]',
      },
      localRotation: { type: 'number', description: 'Local Z rotation in degrees' },
      localScale: { ...finiteNumberTuple(2), description: 'Local UI scale [x, y]' },
    },
    ['entity'],
    undefined,
    {
      anyOf: [
        { required: ['anchoredPosition'] },
        { required: ['sizeDelta'] },
        { required: ['pivot'] },
        { required: ['anchorMin'] },
        { required: ['anchorMax'] },
        { required: ['localRotation'] },
        { required: ['localScale'] },
      ],
    },
  ),
  execTool('set_selection', 'Set the selection to the given entity ids.', 'selection.set', {
    ids: { type: 'array', items: ENTITY_ID_SCHEMA, description: 'Entity ids to select' },
    mode: { type: 'string', enum: ['replace', 'add', 'toggle'], description: 'Selection mode (default replace)' },
  }, ['ids']),
  execTool('reveal_entity', 'Select an entity and expand its hierarchy ancestors.', 'selection.reveal', {
    id: { ...ENTITY_ID_SCHEMA, description: 'Entity id' },
  }, ['id']),
  execTool(
    'frame_selection',
    'Frame the current selection in the Scene view without raising the editor window.',
    'view.frame_selected',
    {},
    [],
  ),
  execTool(
    'set_scene_camera',
    'Set the Scene view orbit camera without raising or focusing the editor window. Omitted fields retain their current values; pitch and distance are clamped to editor-safe limits.',
    'view.set_camera',
    {
      yaw: { type: 'number', description: 'Orbit yaw in degrees' },
      pitch: { type: 'number', description: 'Orbit pitch in degrees (clamped to -89..89)' },
      distance: { type: 'number', description: 'Orbit distance (clamped to 0.5..200)' },
      pivot: { ...finiteNumberTuple(3), description: 'Orbit pivot [x, y, z]' },
    },
    [],
    undefined,
    {
      anyOf: [
        { required: ['yaw'] },
        { required: ['pitch'] },
        { required: ['distance'] },
        { required: ['pivot'] },
      ],
    },
  ),
  execTool(
    'set_game_resolution',
    'Persist an exact Game View resolution, or use null for Free Aspect, without raising or focusing the editor window. Use this before background Game screenshots to verify landscape, portrait, square, or free layouts.',
    'view.set_game_resolution',
    {
      resolution: {
        oneOf: [
          {
            type: 'object',
            required: ['width', 'height'],
            properties: {
              width: { type: 'integer', minimum: 1, maximum: 16384 },
              height: { type: 'integer', minimum: 1, maximum: 16384 },
            },
            additionalProperties: false,
          },
          { type: 'null' },
        ],
        description: 'Exact Game View pixels, or null for Free Aspect',
      },
    },
    ['resolution'],
  ),
  execTool(
    'set_scene_view_preferences',
    'Persist Scene View editing preferences without raising or focusing the editor. Omitted fields retain their current values and changes propagate to every window in the current editor instance.',
    'view.set_scene_preferences',
    {
      mode2D: {
        type: 'boolean',
        description: 'Lock the Scene view to its 2D canvas plane',
      },
      gridVisible: {
        type: 'boolean',
        description: 'Show the pixel grid while the Scene view is in 2D mode',
      },
      smartGuidesEnabled: {
        type: 'boolean',
        description: 'Snap RectTransforms to Canvas and sibling guides',
      },
      pivotMode: {
        type: 'string',
        enum: ['pivot', 'center'],
        description: 'Place transform handles at the pivot or selection center',
      },
      handleOrientation: {
        type: 'string',
        enum: ['local', 'global'],
        description: 'Orient transform handles in local or global axes',
      },
      snap: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Enable persistent transform snapping',
          },
          move: {
            type: 'number',
            exclusiveMinimum: 0,
            maximum: 1000000,
            description: 'Move snap increment',
          },
          rotate: {
            type: 'number',
            exclusiveMinimum: 0,
            maximum: 1000000,
            description: 'Rotation snap increment in degrees',
          },
          scale: {
            type: 'number',
            exclusiveMinimum: 0,
            maximum: 1000000,
            description: 'Scale snap increment',
          },
        },
        additionalProperties: false,
        anyOf: [
          { required: ['enabled'] },
          { required: ['move'] },
          { required: ['rotate'] },
          { required: ['scale'] },
        ],
      },
    },
    [],
    undefined,
    {
      anyOf: [
        { required: ['mode2D'] },
        { required: ['gridVisible'] },
        { required: ['smartGuidesEnabled'] },
        { required: ['pivotMode'] },
        { required: ['handleOrientation'] },
        { required: ['snap'] },
      ],
    },
  ),
  execTool(
    'set_timeline_preferences',
    'Persist Animation Timeline and Sequencer editing preferences without raising or focusing the editor. Omitted fields retain their current values and changes propagate to every window in the current editor instance.',
    'view.set_timeline_preferences',
    {
      animationTimeline: {
        type: 'object',
        properties: {
          timeDisplayMode: {
            type: 'string',
            enum: ['frames', 'seconds'],
            description:
              'Display Animation Timeline time as frames or seconds',
          },
          snapping: {
            type: 'boolean',
            description:
              'Snap Animation Timeline keys and events to frame-aligned targets',
          },
        },
        additionalProperties: false,
        anyOf: [
          { required: ['timeDisplayMode'] },
          { required: ['snapping'] },
        ],
      },
      sequencer: {
        type: 'object',
        properties: {
          snapping: {
            type: 'boolean',
            description: 'Snap Sequencer clips and markers to editing targets',
          },
          rippleMode: {
            type: 'boolean',
            description:
              'Shift the affected track suffix while moving Sequencer items',
          },
          inspectorOpen: {
            type: 'boolean',
            description: 'Show the Sequencer Inspector',
          },
          loopPreview: {
            type: 'boolean',
            description: 'Loop the Sequencer edit preview range',
          },
        },
        additionalProperties: false,
        anyOf: [
          { required: ['snapping'] },
          { required: ['rippleMode'] },
          { required: ['inspectorOpen'] },
          { required: ['loopPreview'] },
        ],
      },
    },
    [],
    undefined,
    {
      anyOf: [
        { required: ['animationTimeline'] },
        { required: ['sequencer'] },
      ],
    },
  ),
  execTool('play', 'Enter play mode.', 'playback.play', {}, []),
  execTool('pause', 'Toggle pause during playback.', 'playback.pause', {}, []),
  execTool('stop', 'Stop playback and return to edit mode.', 'playback.stop', {}, []),
  execTool(
    'step',
    'Advance paused Play Mode by one deterministic simulation step while remaining paused.',
    'playback.step',
    {
      deltaTime: {
        type: 'number',
        exclusiveMinimum: 0,
        maximum: 1,
        description: 'Simulation seconds for the step (default 1/60)',
      },
    },
    [],
  ),
  execTool('undo', 'Undo the last edit.', 'history.undo', {}, []),
  execTool('redo', 'Redo the last undone edit.', 'history.redo', {}, []),
  execTool('set_gizmo', 'Set the active transform gizmo.', 'gizmo.set', {
    mode: { type: 'string', enum: ['translate', 'rotate', 'scale', 'rect'], description: 'Gizmo mode' },
  }, ['mode']),
  execTool('focus_panel', 'Activate an editor panel by kind without raising or focusing its native window, and return only after layout state confirms it is active. If activation would change a visible or focused host, the command refuses; already-active panels return unchanged.', 'panel.focus', {
    kind: { ...PANEL_KIND_SCHEMA, description: 'Panel kind' },
  }, ['kind']),
  execTool(
    'detach_panel',
    'Detach a clean panel into its own hidden, background-observable editor window. Refuses when changing the main layout would disturb a visible or focused window. The new native window is created with visible=false and focus=false.',
    'panel.detach',
    {
      kind: { ...PANEL_KIND_SCHEMA, description: 'Core editor panel kind' },
    },
    ['kind'],
  ),
  execTool(
    'dock_panel',
    'Dock a clean detached panel back into the main workspace only while both affected native windows are hidden and unfocused.',
    'panel.dock',
    {
      kind: { ...PANEL_KIND_SCHEMA, description: 'Core editor panel kind' },
    },
    ['kind'],
  ),
  execTool(
    'reset_panel_layout',
    'Reset the dock workspace to its complete default layout only while every affected native window is hidden and unfocused. Already-default layouts return unchanged.',
    'panel.reset_layout',
    {},
    [],
  ),
  execTool(
    'invoke_menu_item',
    'Invoke an Agent-safe registered menu item by the exact path returned by list_menu_items. Commands requiring foreground input or stricter domain safety are rejected; use the returned agentAlternative domain tool. Editor confirmations remain observable through get_active_dialog.',
    'menu.invoke',
    {
      path: { type: 'string', description: 'Exact registered path, e.g. Window/General/Console' },
    },
    ['path'],
  ),
  execTool(
    'respond_to_dialog',
    'Accept or cancel the exact active editor dialog without activating or raising its native window. Read get_active_dialog first and pass its current dialogId; prompt values are bounded to 4096 characters.',
    'dialog.respond',
    {
      windowLabel: { type: 'string', description: 'Window label (default: main)' },
      dialogId: { type: 'string', description: 'Exact current id from get_active_dialog' },
      action: { type: 'string', enum: ['accept', 'cancel'] },
      value: {
        type: 'string',
        maxLength: 4096,
        description: 'Prompt value when accepting a prompt dialog',
      },
    },
    ['dialogId', 'action'],
  ),
  execTool(
    'close_editor_window',
    'Close one exact hidden, unfocused registered auxiliary editor window created by this Agent session. Visible, focused, pre-existing, main, and panel windows are refused so background automation cannot disrupt the user.',
    'window.close',
    {
      windowLabel: {
        type: 'string',
        description: 'Exact editor-* label returned by list_windows',
      },
    },
    ['windowLabel'],
  ),
  execTool(
    'open_editor_window',
    'Open one exact registered auxiliary editor window as a hidden, unfocused native WebView after a project is ready. Reuses an existing window only when it is already hidden and unfocused; never hides, focuses, or claims a foreground window.',
    'window.open_editor',
    {
      typeId: {
        type: 'string',
        minLength: 1,
        maxLength: 256,
        description: 'Exact typeId returned by list_editor_window_types',
      },
    },
    ['typeId'],
  ),
  execTool(
    'click_window_ui',
    'Click an element returned by get_window_ui only when its editor window is hidden and unfocused. Prefer domain-specific tools when available.',
    'window.ui_click',
    {
      ...uiInteractionProperties('Exact selector returned by get_window_ui'),
    },
    ['selector', 'expectedSnapshotRevision'],
  ),
  execTool(
    'double_click_window_ui',
    'Double-click an element marked with the doubleClick action by get_window_ui only when its editor window is hidden and unfocused.',
    'window.ui_double_click',
    {
      ...uiInteractionProperties('Exact selector returned by get_window_ui'),
    },
    ['selector', 'expectedSnapshotRevision'],
  ),
  execTool(
    'open_window_ui_context_menu',
    'Open the context menu for an element marked with the contextClick action by get_window_ui only when its editor window is hidden and unfocused.',
    'window.ui_context_click',
    {
      ...uiInteractionProperties('Exact selector returned by get_window_ui'),
    },
    ['selector', 'expectedSnapshotRevision'],
  ),
  execTool(
    'set_window_ui_value',
    'Set an input, textarea, select, or contenteditable value returned by get_window_ui only when its editor window is hidden and unfocused.',
    'window.ui_set_value',
    {
      ...uiInteractionProperties('Exact selector returned by get_window_ui'),
      value: { type: 'string', description: 'New value' },
    },
    ['selector', 'expectedSnapshotRevision', 'value'],
  ),
  execTool(
    'scroll_window_ui',
    'Scroll a container marked with the scroll action by get_window_ui only when its editor window is hidden and unfocused. This enables inspection of virtualized content without foreground input.',
    'window.ui_scroll',
    {
      ...uiInteractionProperties('Exact scrollable selector returned by get_window_ui'),
      deltaX: {
        type: 'number',
        minimum: -1000000,
        maximum: 1000000,
        description: 'Horizontal CSS-pixel delta (default: 0)',
      },
      deltaY: {
        type: 'number',
        minimum: -1000000,
        maximum: 1000000,
        description: 'Vertical CSS-pixel delta',
      },
    },
    ['selector', 'expectedSnapshotRevision', 'deltaY'],
  ),
  execTool(
    'drag_window_ui',
    'Drag a source marked with the dragTo action by get_window_ui onto another semantic element. The editor window must be hidden and unfocused; the HTML drag events never move the OS cursor.',
    'window.ui_drag_to',
    {
      ...uiInteractionProperties('Exact draggable source selector returned by get_window_ui'),
      targetSelector: { type: 'string', description: 'Exact drop target selector returned by get_window_ui' },
    },
    ['selector', 'expectedSnapshotRevision', 'targetSelector'],
  ),
  execTool(
    'drag_window_ui_by',
    'Perform a bounded pointer drag from the center of an element marked with the dragBy action by get_window_ui. The editor window must be hidden and unfocused, and the endpoint must stay inside the same WebView.',
    'window.ui_drag_by',
    {
      ...uiInteractionProperties('Exact pointer-gesture selector returned by get_window_ui'),
      deltaX: {
        type: 'number',
        minimum: -1000000,
        maximum: 1000000,
        description: 'Horizontal CSS-pixel displacement; may be zero',
      },
      deltaY: {
        type: 'number',
        minimum: -1000000,
        maximum: 1000000,
        description: 'Vertical CSS-pixel displacement; may be zero',
      },
    },
    ['selector', 'expectedSnapshotRevision', 'deltaX', 'deltaY'],
  ),
  execTool(
    'hover_window_ui',
    'Hover an element marked with the hover action by get_window_ui only when its editor window is hidden and unfocused. Hover transitions never move the OS cursor.',
    'window.ui_hover',
    {
      ...uiInteractionProperties('Exact hover-capable selector returned by get_window_ui'),
    },
    ['selector', 'expectedSnapshotRevision'],
  ),
  execTool(
    'press_window_ui_key',
    'Press an allow-listed semantic key on an element marked with the keyPress action by get_window_ui only when its editor window is hidden and unfocused.',
    'window.ui_press_key',
    {
      ...uiInteractionProperties('Exact keyboard target selector returned by get_window_ui'),
      key: {
        type: 'string',
        enum: [
          'Enter',
          'Escape',
          'Tab',
          'Space',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Home',
          'End',
          'PageUp',
          'PageDown',
          'Backspace',
          'Delete',
        ],
        description: 'Allow-listed semantic key without modifiers',
      },
    },
    ['selector', 'expectedSnapshotRevision', 'key'],
  ),
];

for (const tool of TOOLS) {
  if (tool.inputSchema.additionalProperties === undefined) {
    tool.inputSchema.additionalProperties = false;
  }
}

const ADDITIVE_BRIDGE_COMMANDS = new Set([
  'project.create',
  'asset.import_file',
  'asset.create',
  'asset.instantiate',
  'prefab.create',
  'asset.duplicate',
  'entity.create',
  'entity.create_typed',
  'entity.duplicate',
  'component.add',
  'component.add_many',
  'window.open_editor',
]);

const IDEMPOTENT_BRIDGE_COMMANDS = new Set([
  'console.clear',
  'profiler.clear',
  'project.forget_recent',
  'project.settings.set_sorting_layers',
  'project.settings.set_tags_and_layers',
  'scene.save',
  'scene.save_all',
  'asset.open',
  'build.settings.set_scenes',
  'build.settings.set_asset_policy',
  'build.cancel',
  'build.verify',
  'selection.set',
  'selection.reveal',
  'entity.rename',
  'entity.set_active',
  'entity.set_actives',
  'entity.set_tag',
  'entity.set_tags',
  'entity.set_layer',
  'entity.set_layers',
  'entity.reparent',
  'entity.reorder',
  'component.set',
  'component.set_many',
  'component.patch',
  'component.patch_many',
  'transform.set',
  'playback.play',
  'playback.stop',
  'gizmo.set',
  'view.frame_selected',
  'view.set_camera',
  'view.set_game_resolution',
  'view.set_scene_preferences',
  'view.set_timeline_preferences',
  'panel.focus',
  'panel.reset_layout',
  'window.open_editor',
]);

const OPEN_WORLD_BRIDGE_COMMANDS = new Set([
  'project.open',
  'project.create',
  'asset.import_file',
  'build.start',
  'build.verify',
  'build.run',
  'build.history.create_patch',
  'build.history.restore',
  'build.patch.verify',
]);

function toolAnnotations(tool) {
  const bridgeCommand = tool.bridgeCommand;
  if (typeof bridgeCommand !== 'string') {
    return {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    };
  }
  return {
    readOnlyHint: false,
    destructiveHint: !ADDITIVE_BRIDGE_COMMANDS.has(bridgeCommand),
    idempotentHint: IDEMPOTENT_BRIDGE_COMMANDS.has(bridgeCommand),
    openWorldHint: OPEN_WORLD_BRIDGE_COMMANDS.has(bridgeCommand),
  };
}

function bridgeResource(uri, name, description, query, args = {}) {
  return {
    uri,
    name,
    description,
    mimeType: 'application/json',
    bridgeQuery: query,
    bridgeArgs: args,
  };
}

const RESOURCES = [
  bridgeResource(
    'mengine://project/state',
    'Project Lifecycle State',
    'Current project identity, readiness, lifecycle operation, and failure state.',
    'project.state',
  ),
  bridgeResource(
    'mengine://project/settings',
    'Project Settings',
    'Revision-safe project settings including ordered sorting layers.',
    'project.settings',
  ),
  bridgeResource(
    'mengine://project/script/diagnostics',
    'Project Script Diagnostics',
    'Revisioned TypeScript diagnostics from the exact PC Player compiler settings, without emitted files.',
    'project.script_diagnostics',
  ),
  bridgeResource(
    'mengine://project/recent',
    'Recent Projects',
    'Bounded recent-project list used by the desktop project hub.',
    'project.recent',
  ),
  bridgeResource(
    'mengine://editor/state',
    'Editor State',
    'Current editor, scene revision, selection, playback, history, view, and project summary.',
    'editor.state',
  ),
  bridgeResource(
    'mengine://editor/scenes',
    'Project Scenes',
    'Indexed scene assets and the currently open scene.',
    'scene.list',
  ),
  bridgeResource(
    'mengine://editor/windows',
    'Editor Windows',
    'All native editor windows with labels, visibility, focus, geometry, and panel identity.',
    'window.list',
  ),
  bridgeResource(
    'mengine://editor/window/types',
    'Editor Window Type Catalog',
    'Registered auxiliary editor window types available for background-safe creation.',
    'window.types',
  ),
  bridgeResource(
    'mengine://editor/menus',
    'Editor Menu Catalog',
    'Complete Unity-style menu catalog with live enabled state and Agent alternatives.',
    'menu.list',
  ),
  bridgeResource(
    'mengine://editor/dialogs',
    'Active Editor Dialogs',
    'Active non-blocking alerts, confirmations, and prompts across every editor window.',
    'dialog.list',
  ),
  bridgeResource(
    'mengine://editor/documents',
    'Open Resource Documents',
    'Open docked resource editors with dirty and active state.',
    'workspace.documents',
  ),
  bridgeResource(
    'mengine://assets/index',
    'Project Asset Index',
    'First bounded revision-safe page of project assets.',
    'asset.list',
  ),
  bridgeResource(
    'mengine://assets/sprites',
    'Project Sprite Index',
    'First bounded revision-safe page of texture and sprite-slice references.',
    'sprite.list',
  ),
  bridgeResource(
    'mengine://assets/trash',
    'Project Asset Trash',
    'Recoverable project asset Trash entries.',
    'asset.trash_list',
  ),
  bridgeResource(
    'mengine://editor/panels',
    'Editor Panel Layout',
    'Dock tree, tabs, active panels, and detached editor windows.',
    'panel.get_layout',
  ),
  bridgeResource(
    'mengine://scene/snapshot',
    'Scene Snapshot',
    'Complete authored scene snapshot with revision and entity component data.',
    'scene.snapshot',
  ),
  bridgeResource(
    'mengine://scene/hierarchy',
    'Scene Hierarchy',
    'Current scene hierarchy optimized for structural inspection.',
    'scene.hierarchy',
  ),
  bridgeResource(
    'mengine://scene/selection',
    'Scene Selection',
    'Currently selected scene entities.',
    'selection.get',
  ),
  bridgeResource(
    'mengine://schema/components',
    'Component Schemas',
    'All built-in component types, defaults, field schemas, and editor metadata.',
    'schema.components',
  ),
  bridgeResource(
    'mengine://commands',
    'Agent Command Catalog',
    'All supported write commands with categories, descriptions, and read-only metadata.',
    'commands.list',
  ),
  bridgeResource(
    'mengine://queries',
    'Agent Query Catalog',
    'All supported transport-level read queries with categories and descriptions.',
    'queries.list',
  ),
  bridgeResource(
    'mengine://build/settings',
    'PC Build Settings',
    'Revision-safe scene ordering, content policy, shader policy, and output configuration.',
    'build.settings',
  ),
  bridgeResource(
    'mengine://build/status',
    'PC Build Status',
    'Current asynchronous PC build progress and outcome.',
    'build.status',
  ),
  bridgeResource(
    'mengine://build/artifact',
    'Build Artifact Job Status',
    'Current asynchronous history patch, restore, or verification job state.',
    'build.artifact_status',
  ),
  bridgeResource(
    'mengine://build/history',
    'Build History',
    'Most recent signed PC build history entries with bounded default pagination.',
    'build.history',
  ),
  bridgeResource(
    'mengine://build/patches',
    'Build Patch Inventory',
    'Most recent signed build patches with bounded default pagination.',
    'build.patches',
  ),
  bridgeResource(
    'mengine://console/logs',
    'Console Logs',
    'Recent structured editor console entries.',
    'console.get_logs',
  ),
];

const RESOURCE_READERS = Object.fromEntries(
  RESOURCES.map((resource) => [
    resource.uri,
    () => bridgeQuery(resource.bridgeQuery, resource.bridgeArgs),
  ]),
);

const EVENT_RESOURCE_URIS = Object.freeze({
  'project.changed': Object.freeze([
    'mengine://project/state',
    'mengine://project/recent',
    'mengine://editor/state',
    'mengine://editor/scenes',
    'mengine://editor/windows',
    'mengine://editor/window/types',
    'mengine://editor/menus',
    'mengine://editor/documents',
    'mengine://assets/index',
    'mengine://assets/sprites',
    'mengine://assets/trash',
    'mengine://editor/panels',
    'mengine://scene/snapshot',
    'mengine://scene/hierarchy',
    'mengine://scene/selection',
    'mengine://project/settings',
    'mengine://project/script/diagnostics',
    'mengine://build/settings',
    'mengine://build/status',
    'mengine://build/artifact',
    'mengine://build/history',
    'mengine://build/patches',
  ]),
  'scene.changed': Object.freeze([
    'mengine://editor/state',
    'mengine://editor/scenes',
    'mengine://editor/menus',
    'mengine://scene/snapshot',
    'mengine://scene/hierarchy',
  ]),
  'selection.changed': Object.freeze([
    'mengine://editor/state',
    'mengine://editor/menus',
    'mengine://scene/selection',
  ]),
  'mode.changed': Object.freeze([
    'mengine://editor/state',
    'mengine://editor/menus',
  ]),
  'dialog.changed': Object.freeze(['mengine://editor/dialogs']),
  'panel.changed': Object.freeze([
    'mengine://editor/state',
    'mengine://editor/windows',
    'mengine://editor/documents',
    'mengine://editor/panels',
  ]),
  'workspace.changed': Object.freeze(['mengine://editor/documents']),
  'window.changed': Object.freeze(['mengine://editor/windows']),
  'window.types.changed': Object.freeze(['mengine://editor/window/types']),
  'menu.changed': Object.freeze(['mengine://editor/menus']),
  'view.changed': Object.freeze(['mengine://editor/state']),
  'build.progress': Object.freeze([
    'mengine://build/status',
    'mengine://build/artifact',
  ]),
  'build.artifacts': Object.freeze([
    'mengine://build/history',
    'mengine://build/patches',
  ]),
  'build.settings': Object.freeze(['mengine://build/settings']),
  'project.settings': Object.freeze(['mengine://project/settings']),
  'asset.changed': Object.freeze([
    'mengine://project/state',
    'mengine://editor/scenes',
    'mengine://editor/documents',
    'mengine://assets/index',
    'mengine://assets/sprites',
    'mengine://assets/trash',
    'mengine://project/script/diagnostics',
  ]),
  'log.added': Object.freeze(['mengine://console/logs']),
  'log.cleared': Object.freeze(['mengine://console/logs']),
});

class ResourceSubscriptions {
  constructor(resourceUris, eventResourceUris, notify) {
    this.resourceUris = new Set(resourceUris);
    this.eventResourceUris = eventResourceUris;
    this.notify = notify;
    this.subscribed = new Set();
    this.pending = new Set();
    this.flushScheduled = false;
  }

  get hasSubscriptions() {
    return this.subscribed.size > 0;
  }

  subscribe(uri) {
    if (!this.resourceUris.has(uri)) {
      throw new Error(`Unknown resource: ${String(uri)}`);
    }
    this.subscribed.add(uri);
  }

  unsubscribe(uri) {
    if (!this.resourceUris.has(uri)) {
      throw new Error(`Unknown resource: ${String(uri)}`);
    }
    if (!this.subscribed.delete(uri)) {
      throw new Error(`Resource is not subscribed: ${uri}`);
    }
    this.pending.delete(uri);
  }

  invalidateAll() {
    for (const uri of this.subscribed) this.pending.add(uri);
    this.scheduleFlush();
  }

  handleBridgeMessage(message) {
    if (
      !message
      || typeof message !== 'object'
      || message.jsonrpc !== '2.0'
      || message.method !== 'event'
      || typeof message.params?.topic !== 'string'
    ) return false;
    const resourceUris = this.eventResourceUris[message.params.topic];
    if (!resourceUris) return true;
    for (const uri of resourceUris) {
      if (this.subscribed.has(uri)) this.pending.add(uri);
    }
    this.scheduleFlush();
    return true;
  }

  scheduleFlush() {
    if (this.pending.size === 0 || this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => this.flush());
  }

  flush() {
    this.flushScheduled = false;
    const uris = [...this.pending];
    this.pending.clear();
    for (const uri of uris) {
      if (this.subscribed.has(uri)) this.notify(uri);
    }
  }
}

const resourceSubscriptions = new ResourceSubscriptions(
  RESOURCES.map((resource) => resource.uri),
  EVENT_RESOURCE_URIS,
  (uri) => {
    if (mcpLifecycleState !== 'operational' || inputClosed) return;
    send({
      jsonrpc: '2.0',
      method: 'notifications/resources/updated',
      params: { uri },
    });
  },
);

const MAX_PROMPT_ARGUMENT_LENGTH = 4_096;

const PROMPTS = Object.freeze([
  Object.freeze({
    name: 'create_ui_button',
    title: 'Create a UI Button',
    description:
      'Create and verify a background-safe UI button using current component schemas and revision-guarded domain tools.',
    arguments: Object.freeze([
      Object.freeze({
        name: 'label',
        title: 'Button Label',
        description: 'Visible button label (default: Button).',
      }),
      Object.freeze({
        name: 'parentEntity',
        title: 'Parent Entity',
        description: 'Optional numeric parent entity id, supplied as a string.',
      }),
      Object.freeze({
        name: 'callback',
        title: 'Callback',
        description: 'Optional desired callback behaviour or exact registered component method.',
      }),
    ]),
  }),
  Object.freeze({
    name: 'setup_3d_scene',
    title: 'Set Up a Basic 3D Scene',
    description:
      'Create and verify a camera, directional light, and cube without overwriting existing work.',
    arguments: Object.freeze([
      Object.freeze({
        name: 'sceneName',
        title: 'Scene Name',
        description: 'Optional new scene name. Existing scenes are never overwritten by this workflow.',
      }),
      Object.freeze({
        name: 'cubeName',
        title: 'Cube Name',
        description: 'Optional cube name (default: Cube).',
      }),
    ]),
  }),
  Object.freeze({
    name: 'inspect_and_fix',
    title: 'Inspect and Fix the Current Scene',
    description:
      'Inspect semantic state, logs, and background visual evidence, then make the smallest verifiable fix.',
    arguments: Object.freeze([
      Object.freeze({
        name: 'goal',
        title: 'Inspection Goal',
        description: 'What should be checked or corrected.',
        required: true,
      }),
    ]),
  }),
]);

const AUTONOMOUS_WORKFLOW_PREAMBLE = [
  'Execute this workflow through the MEngine MCP server without activating, raising, focusing, or otherwise disturbing any editor window.',
  'Safety and discovery rules:',
  '1. Read mengine://project/state and mengine://editor/state first. Stop and report the observed state if no project is open or the editor is not ready.',
  '2. Read mengine://scene/snapshot and mengine://schema/components before editing. Prefer domain tools; use semantic window UI only when no domain tool exists.',
  '3. Before each revision-sensitive write, use the latest scene revision as expectedSceneRevision. After a successful write, use its returned revision or refresh the snapshot before the next write.',
  '4. Treat RATE_LIMITED as retryable only after retryAfterMs. Re-read state after UNKNOWN_OUTCOME. Never guess whether a timed-out write succeeded.',
  '5. Do not discard dirty work, overwrite a scene, delete content, or save changes unless the original user request explicitly authorizes that action.',
].join('\n');

class PromptInputValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PromptInputValidationError';
  }
}

function promptArgumentValue(args, name, fallback) {
  const value = args[name];
  return value == null || value.length === 0 ? fallback : value;
}

const PROMPT_RENDERERS = Object.freeze({
  create_ui_button: (args) => {
    const label = promptArgumentValue(args, 'label', 'Button');
    const parentEntity = promptArgumentValue(args, 'parentEntity', '<not specified>');
    const callback = promptArgumentValue(args, 'callback', '<not specified>');
    return [
      AUTONOMOUS_WORKFLOW_PREAMBLE,
      '',
      'Goal: create one functional UI button and verify both its authored state and rendered appearance.',
      `Requested label: ${JSON.stringify(label)}`,
      `Requested parent entity id: ${JSON.stringify(parentEntity)}`,
      `Requested callback: ${JSON.stringify(callback)}`,
      '',
      'Workflow:',
      '1. Inspect the current selection and scene hierarchy. Read get_component_schema for the UI components actually present; never invent component field names.',
      '2. Use create_typed with kind "ui_button". It will create required implicit UI parents when needed. If a parent id was supplied, validate it with get_entity and use reparent_entities only after creation.',
      '3. Inspect the returned entity and its children. Apply the requested label through the exact UI Text schema using patch_component or set_component, preserving unrelated fields.',
      '4. If a callback was requested, bind it only through a callback/event field or registered component method confirmed by get_component_schema. If the requested binding is unsupported, leave the button intact and report the limitation instead of fabricating a field.',
      '5. Re-read the created entity and get_scene_changes from the baseline revision. Capture a game screenshot with take_screenshot to confirm the label and layout without bringing the editor forward.',
      '6. Report created entity ids, component changes, scene revision, screenshot result, and any unsupported callback detail. Do not save unless the original request requires it.',
    ].join('\n');
  },
  setup_3d_scene: (args) => {
    const sceneName = promptArgumentValue(args, 'sceneName', '<use current scene>');
    const cubeName = promptArgumentValue(args, 'cubeName', 'Cube');
    return [
      AUTONOMOUS_WORKFLOW_PREAMBLE,
      '',
      'Goal: create a minimal, inspectable 3D scene containing a Camera, Directional Light, and Cube.',
      `Requested scene name: ${JSON.stringify(sceneName)}`,
      `Requested cube name: ${JSON.stringify(cubeName)}`,
      '',
      'Workflow:',
      '1. Read list_scenes and the full scene snapshot. If a new scene name was supplied, call new_scene only when that name does not exist and current dirty work will not be discarded. Never set overwrite or discardDirty for this workflow.',
      '2. Reuse suitable existing active Camera, Directional Light, or Cube entities when that avoids duplicates. Otherwise create them with create_typed using kinds "camera", "directional_light", and "cube".',
      '3. Read each created or reused entity. Use set_transform with current expectedSceneRevision to place the camera so the cube is visible, keep the cube near the origin, and orient the light through schema-supported values. Preserve unrelated component fields.',
      '4. Verify the final entities with get_entity and get_scene_changes from the baseline revision. Capture both scene and game screenshots with take_screenshot; correct only evidence-backed framing or lighting problems.',
      '5. Report entity ids, whether each entity was reused or created, final revision, and screenshot evidence. Do not save the scene unless the original request explicitly asks for persistence.',
    ].join('\n');
  },
  inspect_and_fix: (args) => [
    AUTONOMOUS_WORKFLOW_PREAMBLE,
    '',
    'Goal: inspect the current editor state and apply only a minimal evidence-backed correction.',
    `Inspection goal: ${JSON.stringify(args.goal)}`,
    '',
    'Workflow:',
    '1. Record the baseline scene revision. Read the current selection, selected entities and components, recent console logs, and relevant component schemas.',
    '2. Capture a background-safe scene screenshot. Capture the game view or a bounded whole-window screenshot only when it materially helps diagnose the stated goal.',
    '3. Explain the observed defect from semantic state, logs, or pixels before changing anything. If no defect is confirmed, make no write and report what was checked.',
    '4. Apply the smallest domain-tool change that addresses the confirmed cause. Preserve unrelated values and pass the exact current expectedSceneRevision.',
    '5. Verify with get_scene_changes from the baseline revision, re-read every changed entity/component, review new error logs, and capture the same screenshot target for before/after comparison.',
    '6. Report the confirmed cause, exact edits, final revision, and verification evidence. Do not save unless the original request explicitly asks for it.',
  ].join('\n'),
});

function renderPrompt(name, args = {}) {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new PromptInputValidationError('prompts/get requires a non-empty name');
  }
  const prompt = PROMPTS.find((candidate) => candidate.name === name);
  if (!prompt) {
    throw new PromptInputValidationError(`Unknown prompt: ${name}`);
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new PromptInputValidationError('Prompt arguments must be an object of strings');
  }

  const argumentMetadata = new Map(
    (prompt.arguments ?? []).map((argument) => [argument.name, argument]),
  );
  for (const argumentName of Object.keys(args)) {
    if (!argumentMetadata.has(argumentName)) {
      throw new PromptInputValidationError(
        `Unknown argument for ${name}: ${argumentName}`,
      );
    }
  }
  for (const argument of argumentMetadata.values()) {
    const value = args[argument.name];
    if (value === undefined) {
      if (argument.required) {
        throw new PromptInputValidationError(
          `Missing required argument for ${name}: ${argument.name}`,
        );
      }
      continue;
    }
    if (typeof value !== 'string') {
      throw new PromptInputValidationError(
        `Prompt argument ${argument.name} must be a string`,
      );
    }
    if (argument.required && value.trim().length === 0) {
      throw new PromptInputValidationError(
        `Prompt argument ${argument.name} must not be empty`,
      );
    }
    if (value.length > MAX_PROMPT_ARGUMENT_LENGTH) {
      throw new PromptInputValidationError(
        `Prompt argument ${argument.name} exceeds ${MAX_PROMPT_ARGUMENT_LENGTH} characters`,
      );
    }
  }

  return {
    description: prompt.description,
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: PROMPT_RENDERERS[prompt.name](args),
      },
    }],
  };
}

const SERVER_INSTRUCTIONS = [
  'MEngine MCP controls the running editor without activating or raising its native windows.',
  'Start by reading mengine://project/state and mengine://editor/state. If a project is open, inspect mengine://scene/snapshot, mengine://schema/components, mengine://queries, and mengine://commands before editing.',
  'Read tools may run concurrently. Editor writes are serialized in arrival order.',
  'The MCP adapter bounds active and in-flight requests; RATE_LIMITED includes current capacity and retryAfterMs when a caller should retry later.',
  'For revision-sensitive writes, pass the latest expectedSceneRevision. Reuse the same requestId only when retrying the exact same write; using it with different arguments is rejected.',
  'BRIDGE_CONNECTION means the editor is unavailable and the request was not accepted. UNKNOWN_OUTCOME means a sent write lost its editor process; re-read state before deciding whether a new write is needed.',
  'Dangerous scene deletion, asset trash, build, Player launch, and build-artifact commands may return PERMISSION_DENIED when the editor policy is deny or token. Approved adapters forward MENGINE_AGENT_APPROVAL_TOKEN automatically; never place approval tokens in tool arguments or logs.',
  'Prefer domain tools over semantic window UI actions. UI inspection and interaction are available for surfaces without a domain API and remain background-safe. Every UI write must pass expectedSnapshotRevision from the same get_window_ui snapshot as its selector; stale revisions are rejected before dispatch. Successful UI writes settle two target-window render opportunities and return a postSnapshotRevision when post-action semantic observation succeeds.',
  'If an editor confirmation or prompt is open, read get_active_dialog for its window label and exact id, then use respond_to_dialog; stale ids are rejected.',
  'After edits, verify semantic state and use a scene, game, or whole-window screenshot when visual correctness matters. A requested command screenshot reports screenshotRequested and screenshotCaptured; if capture fails after the write, screenshotError is returned instead of silently claiming visual verification. Use get_editor_events or wait_for_editor_events for incremental observation during longer workflows.',
  'MCP hosts may subscribe to any listed mengine:// resource. Editor events emit coalesced notifications/resources/updated invalidations, and a Bridge reconnect invalidates every active subscription so the host can re-read authoritative state.',
].join('\n');

// ── MCP stdio protocol ───────────────────────────────────────────────────

class BoundedNdjsonDecoder {
  constructor(maxLineBytes, { onLine, onOverflow }) {
    if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 1) {
      throw new Error('maxLineBytes must be a positive safe integer');
    }
    this.maxLineBytes = maxLineBytes;
    this.onLine = onLine;
    this.onOverflow = onOverflow;
    this.chunks = [];
    this.lineBytes = 0;
    this.discarding = false;
  }

  write(chunk) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let start = 0;
    while (start < buffer.length) {
      const newline = buffer.indexOf(0x0A, start);
      const end = newline < 0 ? buffer.length : newline;
      this.append(buffer.subarray(start, end));
      if (newline < 0) return;
      this.finishLine();
      start = newline + 1;
    }
  }

  end() {
    if (this.discarding) {
      this.reset();
      return;
    }
    if (this.lineBytes > 0 || this.chunks.length > 0) this.finishLine();
  }

  append(segment) {
    if (this.discarding || segment.length === 0) return;
    if (this.lineBytes + segment.length > this.maxLineBytes) {
      this.chunks = [];
      this.lineBytes = 0;
      this.discarding = true;
      this.onOverflow(this.maxLineBytes);
      return;
    }
    // Copy the slice so a short unfinished line cannot retain a very large
    // source chunk after the data callback returns.
    this.chunks.push(Buffer.from(segment));
    this.lineBytes += segment.length;
  }

  finishLine() {
    if (this.discarding) {
      this.reset();
      return;
    }
    let line = Buffer.concat(this.chunks, this.lineBytes).toString('utf8');
    this.reset();
    if (line.endsWith('\r')) line = line.slice(0, -1);
    this.onLine(line);
  }

  reset() {
    this.chunks = [];
    this.lineBytes = 0;
    this.discarding = false;
  }
}

class BoundedWriteQueue {
  constructor(stream, maxQueuedBytes, {
    onError = () => {},
    onOverflow = () => {},
    onStateChange = () => {},
  } = {}) {
    if (!Number.isSafeInteger(maxQueuedBytes) || maxQueuedBytes < 1) {
      throw new Error('maxQueuedBytes must be a positive safe integer');
    }
    this.stream = stream;
    this.maxQueuedBytes = maxQueuedBytes;
    this.onError = onError;
    this.onOverflow = onOverflow;
    this.onStateChange = onStateChange;
    this.entries = [];
    this.queuedBytes = 0;
    this.writing = false;
  }

  enqueue(value) {
    const byteLength = Buffer.byteLength(value, 'utf8');
    if (
      byteLength > this.maxQueuedBytes
      || this.queuedBytes + byteLength > this.maxQueuedBytes
    ) {
      this.onOverflow({
        byteLength,
        queuedBytes: this.queuedBytes,
        maxQueuedBytes: this.maxQueuedBytes,
      });
      return false;
    }
    this.entries.push({ value, byteLength });
    this.queuedBytes += byteLength;
    this.onStateChange(this);
    this.flush();
    return true;
  }

  get idle() {
    return !this.writing && this.entries.length === 0;
  }

  flush() {
    if (this.writing || this.entries.length === 0) return;
    this.writing = true;
    const entry = this.entries[0];
    const complete = (error) => {
      if (!this.writing) return;
      this.writing = false;
      if (error) {
        this.entries = [];
        this.queuedBytes = 0;
        this.onError(error);
        this.onStateChange(this);
        return;
      }
      this.entries.shift();
      this.queuedBytes -= entry.byteLength;
      this.onStateChange(this);
      queueMicrotask(() => this.flush());
    };
    try {
      this.stream.write(entry.value, complete);
    } catch (error) {
      complete(error);
    }
  }
}

let activeMcpRequests = 0;
let inputClosed = false;
let outputFailed = false;
let mcpExitCode = 0;
let mcpLifecycleState = 'awaitingInitialize';
const activeMcpRequestControllers = new Map();
const seenMcpRequestIds = new Set();

const outputQueue = new BoundedWriteQueue(
  process.stdout,
  MAX_MCP_OUTBOUND_QUEUED_BYTES,
  {
    onError: (error) => failMcpOutput(
      `stdout failed: ${error?.message || String(error)}`,
    ),
    onOverflow: ({ byteLength, queuedBytes, maxQueuedBytes }) => failMcpOutput(
      `stdout queue limit exceeded (${byteLength} byte response, `
        + `${queuedBytes}/${maxQueuedBytes} bytes already queued)`,
    ),
    onStateChange: () => {
      updateMcpInputFlow();
      maybeFinishMcpProcess();
    },
  },
);

function updateMcpInputFlow() {
  if (inputClosed) return;
  if (
    activeMcpRequests >= MAX_ACTIVE_MCP_REQUESTS
    || outputQueue.queuedBytes >= MCP_OUTPUT_PAUSE_BYTES
  ) {
    process.stdin.pause();
  } else {
    process.stdin.resume();
  }
}

function failMcpOutput(message) {
  if (outputFailed) return;
  outputFailed = true;
  mcpExitCode = 1;
  inputClosed = true;
  process.stderr.write(`[mengine-mcp] fatal: ${message}\n`);
  process.stdin.destroy();
  closeBridgeConnection();
  maybeFinishMcpProcess();
}

function maybeFinishMcpProcess() {
  if (!inputClosed || activeMcpRequests > 0 || !outputQueue.idle) return;
  closeBridgeConnection();
  process.exit(mcpExitCode);
}

function send(message) {
  if (outputFailed) return;
  outputQueue.enqueue(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message, data) {
  send({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  });
}

function negotiateProtocolVersion(requestedVersion) {
  return SUPPORTED_PROTOCOL_VERSIONS.includes(requestedVersion)
    ? requestedVersion
    : PROTOCOL_VERSION;
}

function requestIdFromMessage(message) {
  const id = message?.id;
  return typeof id === 'string' || Number.isSafeInteger(id) ? id : null;
}

function incomingMessageError(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return 'Message must be a JSON object';
  }
  if (message.jsonrpc !== '2.0') return 'jsonrpc must be "2.0"';
  if (typeof message.method !== 'string' || message.method.length === 0) {
    return 'method must be a non-empty string';
  }
  if (
    Object.hasOwn(message, 'id')
    && typeof message.id !== 'string'
    && !Number.isSafeInteger(message.id)
  ) {
    return 'id must be a string or safe integer';
  }
  if (
    Object.hasOwn(message, 'params')
    && (
      !message.params
      || typeof message.params !== 'object'
      || Array.isArray(message.params)
    )
  ) {
    return 'params must be an object';
  }
  return null;
}

function structuredError(error) {
  if (error instanceof ToolInputValidationError) {
    return {
      code: 'INVALID_ARGS',
      message: error.message,
      data: error.data,
    };
  }
  if (error instanceof BridgeRpcError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.data === undefined ? {} : { data: error.data }),
    };
  }
  if (error instanceof BridgeConnectionError) {
    return {
      code: 'BRIDGE_CONNECTION',
      message: error.message,
      sent: error.sent,
    };
  }
  if (error instanceof BridgeOutcomeUnknownError) {
    return {
      code: 'UNKNOWN_OUTCOME',
      message: error.message,
      data: error.data,
    };
  }
  return {
    code: 'INTERNAL',
    message: error?.message || String(error),
  };
}

function toolErrorContent(error) {
  return textContent({
    ok: false,
    error: structuredError(error),
  });
}

function initializeParamsError(params) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return 'initialize requires parameters';
  }
  if (typeof params.protocolVersion !== 'string' || params.protocolVersion.length === 0) {
    return 'initialize requires a non-empty protocolVersion';
  }
  if (
    !params.capabilities
    || typeof params.capabilities !== 'object'
    || Array.isArray(params.capabilities)
  ) {
    return 'initialize requires a capabilities object';
  }
  if (
    !params.clientInfo
    || typeof params.clientInfo !== 'object'
    || Array.isArray(params.clientInfo)
    || typeof params.clientInfo.name !== 'string'
    || params.clientInfo.name.length === 0
    || typeof params.clientInfo.version !== 'string'
    || params.clientInfo.version.length === 0
  ) {
    return 'initialize requires clientInfo with non-empty name and version';
  }
  return null;
}

async function handleMessage(msg, signal) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize': {
      if (mcpLifecycleState !== 'awaitingInitialize') {
        respondError(id, -32600, 'MCP session is already initialized');
        return;
      }
      const paramsError = initializeParamsError(params);
      if (paramsError) {
        respondError(id, -32602, paramsError);
        return;
      }
      mcpLifecycleState = 'awaitingInitialized';
      respond(id, {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        capabilities: { tools: {}, resources: { subscribe: true }, prompts: {} },
        serverInfo: { name: 'mengine-editor', version: '0.1.0' },
        instructions: SERVER_INSTRUCTIONS,
      });
      return;
    }
    case 'notifications/initialized':
    case 'initialized':
      if (mcpLifecycleState === 'awaitingInitialized') {
        mcpLifecycleState = 'operational';
      }
      return; // notification, no response
    case 'ping':
      respond(id, {});
      return;
    case 'prompts/list':
      respond(id, { prompts: PROMPTS });
      return;
    case 'prompts/get':
      try {
        respond(id, renderPrompt(params?.name, params?.arguments ?? {}));
      } catch (error) {
        if (!(error instanceof PromptInputValidationError)) throw error;
        respondError(id, -32602, error.message);
      }
      return;
    case 'tools/list':
      respond(id, {
        tools: TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: toolAnnotations(tool),
        })),
      });
      return;
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) {
        respondError(id, -32602, `Unknown tool: ${params?.name}`);
        return;
      }
      try {
        const args = params?.arguments ?? {};
        validateToolArguments(tool, args);
        const content = await tool.handler(args, {
          requestId: automaticWriteRequestId(msg),
        });
        if (signal.aborted) return;
        respond(id, { content, isError: false });
      } catch (error) {
        if (signal.aborted || error instanceof McpRequestCancelledError) return;
        respond(id, {
          content: toolErrorContent(error),
          isError: true,
        });
      }
      return;
    }
    case 'resources/list':
      respond(id, {
        resources: RESOURCES.map(
          ({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType }),
        ),
      });
      return;
    case 'resources/templates/list':
      respond(id, { resourceTemplates: [] });
      return;
    case 'resources/subscribe':
      try {
        resourceSubscriptions.subscribe(params?.uri);
        scheduleSubscriptionReconnect(0);
        respond(id, {});
      } catch (error) {
        respondError(id, -32602, error.message);
      }
      return;
    case 'resources/unsubscribe':
      try {
        resourceSubscriptions.unsubscribe(params?.uri);
        cancelSubscriptionReconnectIfIdle();
        respond(id, {});
      } catch (error) {
        respondError(id, -32602, error.message);
      }
      return;
    case 'resources/read': {
      const reader = RESOURCE_READERS[params?.uri];
      if (!reader) {
        respondError(id, -32602, `Unknown resource: ${params?.uri}`);
        return;
      }
      try {
        const data = await reader();
        if (signal.aborted) return;
        respond(id, {
          contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
        });
      } catch (error) {
        if (signal.aborted || error instanceof McpRequestCancelledError) return;
        respondError(
          id,
          -32603,
          `Failed to read resource: ${error?.message || String(error)}`,
          structuredError(error),
        );
      }
      return;
    }
    default:
      if (id !== undefined && id !== null) {
        respondError(id, -32601, `Method not found: ${method}`);
      }
  }
}

function mcpRequestKey(requestId) {
  return `${typeof requestId}:${String(requestId)}`;
}

const MCP_REQUEST_METHODS = new Set([
  'initialize',
  'ping',
  'prompts/list',
  'prompts/get',
  'tools/list',
  'tools/call',
  'resources/list',
  'resources/templates/list',
  'resources/subscribe',
  'resources/unsubscribe',
  'resources/read',
]);

const MCP_NOTIFICATION_METHODS = new Set([
  'notifications/initialized',
  'initialized',
  'notifications/cancelled',
]);

function admitMcpRequestId(message) {
  if (!Object.hasOwn(message, 'id')) return true;
  const requestKey = mcpRequestKey(message.id);
  if (seenMcpRequestIds.has(requestKey)) {
    respondError(message.id, -32600, 'Request id was already used in this MCP session');
    return false;
  }
  if (seenMcpRequestIds.size >= MAX_MCP_SESSION_REQUEST_IDS) {
    respondError(
      message.id,
      -32000,
      'MCP session request-id capacity reached; restart the MCP server',
      {
        code: 'RATE_LIMITED',
        maxSessionRequestIds: MAX_MCP_SESSION_REQUEST_IDS,
      },
    );
    return false;
  }
  seenMcpRequestIds.add(requestKey);
  return true;
}

function validateMcpMethodEnvelope(message) {
  const hasRequestId = Object.hasOwn(message, 'id');
  if (MCP_REQUEST_METHODS.has(message.method) && !hasRequestId) {
    // A JSON-RPC notification must never receive a response, even when the
    // method is only valid as an MCP request.
    return false;
  }
  if (MCP_NOTIFICATION_METHODS.has(message.method) && hasRequestId) {
    respondError(message.id, -32600, `${message.method} must be a notification`);
    return false;
  }
  return true;
}

function validateMcpLifecycle(message) {
  if (
    message.method === 'initialize'
    || message.method === 'ping'
    || MCP_NOTIFICATION_METHODS.has(message.method)
  ) {
    return true;
  }
  if (mcpLifecycleState === 'operational') return true;
  if (Object.hasOwn(message, 'id')) {
    respondError(
      message.id,
      -32002,
      mcpLifecycleState === 'awaitingInitialize'
        ? 'Server not initialized; send initialize first'
        : 'Server initialization is incomplete; send notifications/initialized',
      { lifecycleState: mcpLifecycleState },
    );
  }
  return false;
}

function cancelMcpRequest(message) {
  if (Object.hasOwn(message, 'id')) return;
  const requestId = message.params?.requestId;
  if (typeof requestId !== 'string' && !Number.isSafeInteger(requestId)) return;
  const entry = activeMcpRequestControllers.get(mcpRequestKey(requestId));
  if (!entry || entry.method === 'initialize') return;
  entry.controller.abort();
  process.stderr.write(
    `[mengine-mcp] cancelled request ${JSON.stringify(requestId)}\n`,
  );
}

function dispatchMcpMessage(msg) {
  if (!admitMcpRequestId(msg) || !validateMcpMethodEnvelope(msg)) return;
  if (msg.method === 'notifications/cancelled') {
    cancelMcpRequest(msg);
    return;
  }
  if (!validateMcpLifecycle(msg)) return;
  if (activeMcpRequests >= MAX_ACTIVE_MCP_REQUESTS) {
    if (msg.id !== undefined && msg.id !== null) {
      respondError(
        msg.id,
        -32000,
        'Too many MCP requests are already active',
        {
          code: 'RATE_LIMITED',
          activeRequests: activeMcpRequests,
          maxActiveRequests: MAX_ACTIVE_MCP_REQUESTS,
          retryAfterMs: MCP_RATE_LIMIT_RETRY_AFTER_MS,
        },
      );
    }
    return;
  }
  const hasRequestId = msg.id !== undefined && msg.id !== null;
  const requestKey = hasRequestId ? mcpRequestKey(msg.id) : null;
  const controller = new AbortController();
  if (requestKey) {
    activeMcpRequestControllers.set(requestKey, {
      controller,
      method: msg.method,
    });
  }
  activeMcpRequests += 1;
  updateMcpInputFlow();
  mcpRequestContext.run(
    { signal: controller.signal },
    () => handleMessage(msg, controller.signal),
  )
    .catch((error) => {
      if (hasRequestId && !controller.signal.aborted) {
        respondError(
          msg.id,
          -32603,
          String(error?.message || error),
          structuredError(error),
        );
      }
    })
    .finally(() => {
      if (
        requestKey
        && activeMcpRequestControllers.get(requestKey)?.controller === controller
      ) {
        activeMcpRequestControllers.delete(requestKey);
      }
      activeMcpRequests -= 1;
      updateMcpInputFlow();
      maybeFinishMcpProcess();
    });
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : stableJson(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, stableJson(value[key])]),
    );
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
}

function automaticWriteRequestId(message) {
  const fingerprint = JSON.stringify(stableJson({
    id: message.id ?? null,
    name: message.params?.name ?? null,
    arguments: message.params?.arguments ?? {},
  }));
  const digest = createHash('sha256').update(fingerprint).digest('hex').slice(0, 24);
  return `mcp:${MCP_SESSION_ID}:${digest}`;
}

// ── Entry point ──────────────────────────────────────────────────────────

async function main() {
  process.stderr.write('[mengine-mcp] ready; editor bridge connects on first read or write\n');

  const consumeLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      respondError(null, -32700, 'Parse error');
      return;
    }
    const validationError = incomingMessageError(msg);
    if (validationError) {
      respondError(requestIdFromMessage(msg), -32600, 'Invalid Request', {
        reason: validationError,
      });
      return;
    }
    dispatchMcpMessage(msg);
  };
  const decoder = new BoundedNdjsonDecoder(MAX_MCP_INPUT_LINE_BYTES, {
    onLine: consumeLine,
    onOverflow: (maxLineBytes) => respondError(
      null,
      -32600,
      'Invalid Request',
      {
        reason: `Request line exceeds the ${maxLineBytes} byte limit`,
        maxLineBytes,
      },
    ),
  });
  process.stdin.on('data', (chunk) => decoder.write(chunk));
  process.stdin.on('end', () => {
    decoder.end();
    inputClosed = true;
    maybeFinishMcpProcess();
  });
  process.stdin.on('error', (error) => {
    mcpExitCode = 1;
    process.stderr.write(
      `[mengine-mcp] stdin failed: ${error?.message || String(error)}\n`,
    );
    inputClosed = true;
    maybeFinishMcpProcess();
  });
  process.stdin.resume();
}

const launchedAsMain =
  process.argv[1] != null
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (launchedAsMain) {
  main().catch((error) => {
    process.stderr.write(`[mengine-mcp] fatal: ${error?.message || String(error)}\n`);
    process.exit(1);
  });
}

export {
  BridgeOutcomeUnknownError,
  EVENT_RESOURCE_URIS,
  RESOURCES,
  ResourceSubscriptions,
  SERVER_INSTRUCTIONS,
  PROMPTS,
  BoundedNdjsonDecoder,
  BoundedWriteQueue,
  bridgeExecuteParams,
  bridgeExecute,
  bridgeQuery,
  closeBridgeConnection,
  DANGEROUS_AGENT_COMMANDS,
  incomingMessageError,
  negotiateProtocolVersion,
  rpcOnce,
  renderPrompt,
  SUPPORTED_PROTOCOL_VERSIONS,
  screenshotContent,
  structuredError,
  toolAnnotations,
  ToolInputValidationError,
  TOOLS,
  validateToolArguments,
};
