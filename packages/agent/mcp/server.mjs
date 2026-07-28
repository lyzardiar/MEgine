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
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

const PROTOCOL_VERSION = '2024-11-05';
const REQUEST_TIMEOUT_MS = 20000;
const BRIDGE_CONNECT_ATTEMPTS = 30;
const BRIDGE_CONNECT_RETRY_MS = 200;
const MCP_SESSION_ID = crypto.randomUUID();

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
let successfulConnections = 0;
const pending = new Map();

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
      resolve(connection);
    });
    socket.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      } catch {
        return;
      }
      if (msg.id != null && pending.has(msg.id)) {
        const entry = pending.get(msg.id);
        if (entry.socket !== socket) return;
        pending.delete(msg.id);
        clearTimeout(entry.timer);
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
        clearTimeout(entry.timer);
        entry.reject(new BridgeConnectionError(
          'Editor bridge connection closed',
          { sent: true, discovery },
        ));
      }
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

function rpcOnce(connection, method, params) {
  return new Promise((resolve, reject) => {
    const { socket, discovery } = connection;
    if (socket.readyState !== WebSocket.OPEN) {
      reject(new BridgeConnectionError(
        'Not connected to the editor bridge',
        { discovery },
      ));
      return;
    }
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new BridgeConnectionError(
        `Editor bridge request timed out (${method})`,
        { sent: true, discovery },
      ));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, {
      socket,
      timer,
      resolve,
      reject,
    });
    try {
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    } catch (error) {
      pending.delete(id);
      clearTimeout(timer);
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

async function rpc(method, params, { retryAcrossEditorRestart = false } = {}) {
  const firstConnection = await ensureBridgeConnected();
  try {
    return await rpcOnce(firstConnection, method, params);
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
    return await rpcOnce(retryConnection, method, params);
  }
}

async function bridgeQuery(query, args = {}) {
  const result = await rpc(
    'query',
    { query, args },
    { retryAcrossEditorRestart: true },
  );
  return result?.data;
}

async function bridgeExecute(command, args = {}, options = {}) {
  return await rpc('execute', {
    command,
    args,
    requestId: options.requestId,
    screenshot: Boolean(options.screenshot),
    expectedSceneRevision: options.expectedSceneRevision,
  });
}

// ── Tool definitions ─────────────────────────────────────────────────────

function textContent(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

/** Build a tool that invokes a bridge `execute` command. */
function execTool(name, description, command, properties, required, mapArgs = (a) => a) {
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
          type: 'number',
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
      const content = textContent(response);
      if (result?.screenshot?.dataUrl) {
        const base64 = String(result.screenshot.dataUrl).split(',')[1] || '';
        content.push({ type: 'image', data: base64, mimeType: result.screenshot.mime || 'image/png' });
      }
      return content;
    },
  };
}

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
        entity: { type: 'number', minimum: 0 },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['op', 'entity', 'component', 'value'],
      properties: {
        op: { const: 'setComponent' },
        entity: { type: 'number', minimum: 0 },
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
        entity: { type: 'number', minimum: 0 },
        component: { type: 'string' },
      },
      additionalProperties: false,
    },
    {
      type: 'object',
      required: ['op', 'entity'],
      properties: {
        op: { const: 'setParent' },
        entity: { type: 'number', minimum: 0 },
        parent: { type: ['number', 'null'], minimum: 0 },
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
      'Read persisted Project Settings without opening or focusing the settings panel. Returns the ordered Sorting Layers and the exact file revision required for updates.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('project.settings')),
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
        name: { type: 'string', description: 'Existing scene name, with or without .mscene' },
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
          type: 'number',
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
      'Read cursor-based editor events without foreground polling. Topics cover project lifecycle, scene, selection, mode, logs, panels, builds, and assets. Continue with nextSequence; truncated=true means older events expired.',
    inputSchema: {
      type: 'object',
      properties: {
        afterSequence: {
          type: 'number',
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
              'log.added',
              'log.cleared',
              'panel.changed',
              'view.changed',
              'build.progress',
              'build.settings',
              'project.settings',
              'asset.changed',
              'project.changed',
            ],
          },
          description: 'Optional topic filter',
        },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum events in chronological order (default 100)',
        },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('events.get', args)),
  },
  {
    name: 'get_entity',
    description: 'Get a single entity (with all components) by numeric id or by name.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Entity id' },
        name: { type: 'string', description: 'Entity name (used if id is omitted)' },
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
      'Find live scene entities by case-insensitive name substring, exact component type, and/or active state. Returns compact records; use get_entity or get_entity_component for values.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Case-insensitive entity name substring' },
        component: { type: 'string', description: 'Exact component type to require' },
        active: { type: 'boolean', description: 'Filter by active state' },
        limit: {
          type: 'number',
          minimum: 1,
          maximum: 1000,
          description: 'Maximum matches to return (default 100)',
        },
      },
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
        id: { type: 'number', minimum: 0, description: 'Entity id' },
        component: { type: 'string', description: 'Exact component type' },
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
        entity: { type: 'number', minimum: 0, description: 'Any entity in the prefab instance' },
      },
      additionalProperties: false,
    },
    handler: async (args) => textContent(await bridgeQuery('prefab.instance', args)),
  },
  {
    name: 'take_screenshot',
    description:
      'Capture a PNG screenshot. target=scene/game captures the rendered viewport; target=window captures an editor window off-screen without activating it, so foreground work is not interrupted. Returns an image for visual verification.',
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
      },
    },
    handler: async (args) => {
      const target = args.target || 'scene';
      const shot =
        target === 'window'
          ? await bridgeQuery('view.window_screenshot', {
              windowLabel: args.windowLabel || 'main',
            })
          : await bridgeQuery('view.screenshot', { target });
      const base64 = String(shot.dataUrl).split(',')[1] || '';
      return [{ type: 'image', data: base64, mimeType: shot.mime || 'image/png' }];
    },
  },
  {
    name: 'list_windows',
    description:
      'List every editor window currently open: the main window, detached panels (panel-*), and floating editor windows (editor-*), with title, position, size, visibility and focus.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('window.list')),
  },
  {
    name: 'list_open_documents',
    description:
      'List the current scene and every open resource document with dirty state, active/detached state, and the exact window label to inspect or capture.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('workspace.documents')),
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
      'Get one page of a background-safe semantic editor-window snapshot: visible text, accessible roles/names, control values and states, bounds, supported actions, and stable CSS selectors. Continue with nextOffset until null to retrieve all semantic content without OCR, scrolling, or activating the editor.',
    inputSchema: {
      type: 'object',
      properties: {
        windowLabel: {
          type: 'string',
          description: 'A label returned by list_windows (default: main)',
        },
        maxElements: {
          type: 'number',
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
      },
    },
    handler: async (args) =>
      textContent(await bridgeQuery('window.ui_snapshot', {
        windowLabel: args.windowLabel || 'main',
        maxElements: typeof args.maxElements === 'number' ? args.maxElements : 2000,
        offset: typeof args.offset === 'number' ? args.offset : 0,
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
        limit: { type: 'number', description: 'Return at most this many recent entries' },
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
  {
    name: 'clear_console_logs',
    description:
      'Clear both the structured AgentBridge log buffer and the visible editor Console panel.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('console.clear')),
  },
  {
    name: 'list_assets',
    description:
      'List the current project asset index with paths, kinds, GUID/meta health, sizes, and optimistic-lock revisions. Supports search, kind, folder, and bounded limit filters.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Case-insensitive path/name substring' },
        kind: { type: 'string', description: 'Exact asset kind filter' },
        folder: { type: 'string', description: 'Assets folder prefix, e.g. Assets/Scripts' },
        limit: { type: 'number', minimum: 1, maximum: 5000, description: 'Maximum rows (default 1000)' },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('asset.list', args)),
  },
  {
    name: 'read_asset_text',
    description:
      'Read a UTF-8 project text asset and return its exact revision. Use that revision with write_asset_text to prevent overwriting concurrent edits.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: 'Asset path under Assets/' },
        maxBytes: { type: 'number', minimum: 1, maximum: 8388608, description: 'Read limit (default 1 MiB)' },
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
        path: { type: 'string', description: 'Asset path under Assets/' },
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
        sourcePath: { type: 'string', description: 'Existing asset path under Assets/' },
        destinationPath: { type: 'string', description: 'Unused destination path with the same extension' },
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
        sourcePath: { type: 'string', description: 'Existing asset path under Assets/' },
        destinationPath: { type: 'string', description: 'Unused destination path with the same extension' },
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
        sourcePath: { type: 'string', description: 'Existing asset path under Assets/' },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('asset.trash_preview', args)),
  },
  {
    name: 'list_asset_trash',
    description:
      'List recoverable project Trash entries with exact record revisions required by restore_asset.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('asset.trash_list')),
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
    name: 'get_build_history',
    description: 'Get recent PC build history entries and validation counts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', minimum: 1, maximum: 100, description: 'Maximum history entries (default 20)' },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('build.history', args)),
  },

  {
    name: 'list_commands',
    description: 'List every editor command (id, category, description, readOnly) the agent can invoke via the write tools.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('commands.list')),
  },
  {
    name: 'describe_command',
    description:
      'Get the complete JSON Schema for one AgentBridge command argument object plus shared execution options such as screenshot and expectedSceneRevision.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Exact id returned by list_commands' },
      },
    },
    handler: async (args) => textContent(await bridgeQuery('commands.describe', args)),
  },
  {
    name: 'list_menu_items',
    description:
      'List registered Unity-style editor menu items with exact path, shortcut, priority, and current enabled state. Optionally filter by root such as Window, Assets, or GameObject.',
    inputSchema: {
      type: 'object',
      properties: {
        root: { type: 'string', description: 'Optional exact root menu name' },
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
    'Open a supported material, material-instance, shader, animator, avatar-mask, animation, timeline, sprite-compatible texture, or sprite-atlas asset in its docked editor without raising or focusing a native window. Refuses to switch away from unsaved resource work.',
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
      entity: { type: 'number', minimum: 0, description: 'Root entity to capture and link' },
    },
    ['entity'],
  ),
  execTool(
    'apply_prefab',
    'Apply one linked instance hierarchy to its prefab asset without a dialog or foreground focus. Requires the exact asset revision returned by get_prefab_instance or list_assets and fails on concurrent disk edits.',
    'prefab.apply',
    {
      entity: { type: 'number', minimum: 0, description: 'Any entity in the prefab instance' },
      expectedRevision: { type: 'string', description: 'Exact current prefab asset revision' },
    },
    ['entity', 'expectedRevision'],
  ),
  execTool(
    'revert_prefab',
    'Replace one linked instance hierarchy from an exact prefab asset revision as one undoable scene edit. The asset is read in the background and is not modified.',
    'prefab.revert',
    {
      entity: { type: 'number', minimum: 0, description: 'Any entity in the prefab instance' },
      expectedRevision: { type: 'string', description: 'Exact current prefab asset revision' },
    },
    ['entity', 'expectedRevision'],
  ),
  execTool(
    'unpack_prefab',
    'Remove prefab linkage from one complete instance while preserving its authored entities and components as one undoable scene edit.',
    'prefab.unpack',
    {
      entity: { type: 'number', minimum: 0, description: 'Any entity in the prefab instance' },
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
        description: 'Exact 64-character contentHash from the build result',
      },
    },
    ['executable', 'expectedContentHash'],
  ),
  execTool(
    'create_gameobject',
    'Create a new GameObject with optional components and parent. Returns the new entity id.',
    'entity.create',
    {
      name: { type: 'string', description: 'Entity name' },
      components: { type: 'object', description: 'Component map, e.g. { Transform: {...}, MeshRenderer: {...} }' },
      parent: { type: 'number', description: 'Parent entity id (null = root)' },
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
    { ids: { type: 'array', items: { type: 'number' }, description: 'Entity ids to delete (default: current selection)' } },
    [],
  ),
  execTool(
    'duplicate_entities',
    'Duplicate entities. Pass ids or omit to duplicate the current selection.',
    'entity.duplicate',
    { ids: { type: 'array', items: { type: 'number' }, description: 'Entity ids to duplicate (default: current selection)' } },
    [],
  ),
  execTool('rename_entity', 'Rename an entity.', 'entity.rename', {
    id: { type: 'number', description: 'Entity id' },
    name: { type: 'string', description: 'New name' },
  }, ['id', 'name']),
  execTool('set_active', 'Enable or disable an entity.', 'entity.set_active', {
    id: { type: 'number', description: 'Entity id' },
    active: { type: 'boolean', description: 'Active flag' },
  }, ['id', 'active']),
  execTool('reparent_entities', 'Reparent entities under a new parent.', 'entity.reparent', {
    ids: { type: 'array', items: { type: 'number' }, description: 'Entity ids to reparent' },
    parent: { type: ['number', 'null'], description: 'New parent id (null = root)' },
    index: { type: 'number', description: 'Sibling index (optional)' },
  }, ['ids', 'parent']),
  execTool('reorder_entity', 'Move an entity to a sibling index under its current parent.', 'entity.reorder', {
    id: { type: 'number', description: 'Entity id' },
    index: { type: 'number', minimum: 0, description: 'Destination sibling index' },
  }, ['id', 'index']),
  execTool('add_component', 'Add a component to an entity.', 'component.add', {
    entity: { type: 'number', description: 'Entity id' },
    type: { type: 'string', description: 'Component type, e.g. MeshRenderer, Rigidbody, AutoRotate' },
    value: { type: 'object', description: 'Initial component value (optional)' },
  }, ['entity', 'type']),
  execTool('remove_component', 'Remove a component from an entity.', 'component.remove', {
    entity: { type: 'number', description: 'Entity id' },
    type: { type: 'string', description: 'Component type to remove' },
  }, ['entity', 'type']),
  execTool('set_component', 'Replace a component value on an entity.', 'component.set', {
    entity: { type: 'number', description: 'Entity id' },
    type: { type: 'string', description: 'Component type' },
    value: { type: 'object', description: 'Full component value' },
  }, ['entity', 'type', 'value']),
  execTool('patch_component', 'Shallow-merge fields into a component on an entity.', 'component.patch', {
    entity: { type: 'number', description: 'Entity id' },
    type: { type: 'string', description: 'Component type' },
    patch: { type: 'object', description: 'Fields to merge' },
  }, ['entity', 'type', 'patch']),
  execTool(
    'invoke_component_method',
    'Invoke one method registered by a Behaviour component. Query get_component_schema first for the exact method list. The edit-mode path is undoable when the method changes serialized fields.',
    'component.invoke',
    {
      entity: { type: 'number', description: 'Entity id' },
      type: { type: 'string', description: 'Behaviour component type' },
      method: { type: 'string', description: 'Exact registered method name' },
    },
    ['entity', 'type', 'method'],
  ),
  execTool('set_transform', 'Set position/rotation/scale on an entity (omitted fields keep current values). Rotation is a quaternion [x,y,z,w].', 'transform.set', {
    entity: { type: 'number', description: 'Entity id' },
    position: { type: 'array', items: { type: 'number' }, description: '[x, y, z]' },
    rotation: { type: 'array', items: { type: 'number' }, description: 'quaternion [x, y, z, w]' },
    scale: { type: 'array', items: { type: 'number' }, description: '[x, y, z]' },
  }, ['entity']),
  execTool('translate_entity', 'Translate an entity by a local-position delta as one undoable edit.', 'transform.translate', {
    entity: { type: 'number', description: 'Entity id' },
    delta: { type: 'array', items: { type: 'number' }, description: 'Local-position delta [x, y, z]' },
  }, ['entity', 'delta']),
  execTool('set_selection', 'Set the selection to the given entity ids.', 'selection.set', {
    ids: { type: 'array', items: { type: 'number' }, description: 'Entity ids to select' },
    mode: { type: 'string', enum: ['replace', 'add', 'toggle'], description: 'Selection mode (default replace)' },
  }, ['ids']),
  execTool('reveal_entity', 'Select an entity and expand its hierarchy ancestors.', 'selection.reveal', {
    id: { type: 'number', description: 'Entity id' },
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
      pivot: { type: 'array', items: { type: 'number' }, description: 'Orbit pivot [x, y, z]' },
    },
    [],
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
  execTool('focus_panel', 'Activate a docked editor panel by kind without raising or focusing the native editor window. Detached panels remain detached and are not raised.', 'panel.focus', {
    kind: { type: 'string', description: 'Panel kind' },
  }, ['kind']),
  execTool(
    'detach_panel',
    'Detach a clean panel into its own hidden, background-observable editor window. The new native window is created with visible=false and focus=false.',
    'panel.detach',
    {
      kind: { type: 'string', description: 'Core editor panel kind' },
    },
    ['kind'],
  ),
  execTool(
    'dock_panel',
    'Dock a clean detached panel back into the main workspace without raising or focusing either native window.',
    'panel.dock',
    {
      kind: { type: 'string', description: 'Core editor panel kind' },
    },
    ['kind'],
  ),
  execTool(
    'reset_panel_layout',
    'Reset the dock workspace to its default layout. This also closes detached panel windows.',
    'panel.reset_layout',
    {},
    [],
  ),
  execTool(
    'invoke_menu_item',
    'Invoke a registered Unity-style menu item by the exact path returned by list_menu_items. Menu actions may intentionally open native dialogs or windows; prefer domain-specific tools for background work.',
    'menu.invoke',
    {
      path: { type: 'string', description: 'Exact registered path, e.g. Window/General/Console' },
    },
    ['path'],
  ),
  execTool(
    'click_window_ui',
    'Click an element returned by get_window_ui without activating or raising the editor window. Prefer domain-specific tools when available.',
    'window.ui_click',
    {
      windowLabel: { type: 'string', description: 'Window label (default: main)' },
      selector: { type: 'string', description: 'Exact selector returned by get_window_ui' },
    },
    ['selector'],
  ),
  execTool(
    'set_window_ui_value',
    'Set an input, textarea, select, or contenteditable value returned by get_window_ui without activating the editor window.',
    'window.ui_set_value',
    {
      windowLabel: { type: 'string', description: 'Window label (default: main)' },
      selector: { type: 'string', description: 'Exact selector returned by get_window_ui' },
      value: { type: 'string', description: 'New value' },
    },
    ['selector', 'value'],
  ),
];

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
    'mengine://editor/documents',
    'Open Resource Documents',
    'Open docked resource editors with dirty and active state.',
    'workspace.documents',
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

const SERVER_INSTRUCTIONS = [
  'MEngine MCP controls the running editor without activating or raising its native windows.',
  'Start by reading mengine://project/state and mengine://editor/state. If a project is open, inspect mengine://scene/snapshot, mengine://schema/components, and mengine://commands before editing.',
  'Read tools may run concurrently. Editor writes are serialized in arrival order.',
  'For revision-sensitive writes, pass the latest expectedSceneRevision. Reuse the same requestId only when retrying the exact same write; using it with different arguments is rejected.',
  'BRIDGE_CONNECTION means the editor is unavailable and the request was not accepted. UNKNOWN_OUTCOME means a sent write lost its editor process; re-read state before deciding whether a new write is needed.',
  'Prefer domain tools over semantic window UI actions. UI inspection and interaction are available for surfaces without a domain API and remain background-safe.',
  'After edits, verify semantic state and use a scene, game, or whole-window screenshot when visual correctness matters. Poll get_events for incremental observation during longer workflows.',
].join('\n');

// ── MCP stdio protocol ───────────────────────────────────────────────────

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
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

function structuredError(error) {
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

async function handleMessage(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      respond(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'mengine-editor', version: '0.1.0' },
        instructions: SERVER_INSTRUCTIONS,
      });
      return;
    case 'notifications/initialized':
    case 'initialized':
      return; // notification, no response
    case 'ping':
      respond(id, {});
      return;
    case 'tools/list':
      respond(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });
      return;
    case 'tools/call': {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) {
        respondError(id, -32602, `Unknown tool: ${params?.name}`);
        return;
      }
      try {
        const content = await tool.handler(params?.arguments || {}, {
          requestId: automaticWriteRequestId(msg),
        });
        respond(id, { content, isError: false });
      } catch (error) {
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
    case 'resources/read': {
      const reader = RESOURCE_READERS[params?.uri];
      if (!reader) {
        respondError(id, -32602, `Unknown resource: ${params?.uri}`);
        return;
      }
      try {
        const data = await reader();
        respond(id, {
          contents: [{ uri: params.uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
        });
      } catch (error) {
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

  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return;
    }
    handleMessage(msg).catch((error) => {
      if (msg.id !== undefined && msg.id !== null) {
        respondError(
          msg.id,
          -32603,
          String(error?.message || error),
          structuredError(error),
        );
      }
    });
  });
  rl.on('close', () => process.exit(0));
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
  RESOURCES,
  SERVER_INSTRUCTIONS,
  structuredError,
  TOOLS,
};
