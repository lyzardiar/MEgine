#!/usr/bin/env node
/**
 * MEngine Editor MCP server (Phase 1, read-only).
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
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const PROTOCOL_VERSION = '2024-11-05';
const REQUEST_TIMEOUT_MS = 20000;

// ── Discovery ────────────────────────────────────────────────────────────

function defaultDiscoveryPath() {
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA
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
  } catch {
    throw new Error(
      `Cannot read AgentBridge discovery file at ${file}. ` +
        'Is the MEngine editor running? Set MENGINE_AGENT_BRIDGE_FILE to override.',
    );
  }
  const data = JSON.parse(raw);
  if (!data.port || !data.token) {
    throw new Error(`Discovery file ${file} is missing port/token`);
  }
  return { port: data.port, token: data.token };
}

// ── Bridge client (WebSocket) ────────────────────────────────────────────

let ws = null;
const pending = new Map();

function connectBridge(port, token) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`);
    const onError = () => reject(new Error(`Failed to connect to editor bridge on port ${port}`));
    ws.addEventListener('error', onError);
    ws.addEventListener('open', () => {
      ws.removeEventListener('error', onError);
      resolve();
    });
    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
      } catch {
        return;
      }
      if (msg.id && pending.has(msg.id)) {
        const cb = pending.get(msg.id);
        pending.delete(msg.id);
        cb(msg);
      }
    });
    ws.addEventListener('close', () => {
      for (const [id, cb] of pending) {
        pending.delete(id);
        cb({ id, error: { code: 'BRIDGE_CLOSED', message: 'Editor bridge connection closed' } });
      }
    });
  });
}

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('Not connected to the editor bridge'));
      return;
    }
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Editor bridge request timed out (${method})`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
      else resolve(msg.result);
    });
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  });
}

async function bridgeQuery(query, args = {}) {
  const result = await rpc('query', { query, args });
  return result?.data;
}

async function bridgeExecute(command, args = {}, options = {}) {
  return await rpc('execute', { command, args, screenshot: Boolean(options.screenshot) });
}

// ── Tool definitions ─────────────────────────────────────────────────────

function textContent(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
}

/** Build a tool that invokes a bridge `execute` command. */
function execTool(name, description, command, properties, mapArgs = (a) => a) {
  return {
    name,
    description,
    inputSchema: {
      type: 'object',
      properties: {
        ...properties,
        screenshot: {
          type: 'boolean',
          description: 'Capture a viewport screenshot after the action for visual verification',
        },
      },
    },
    handler: async (args) => {
      const wantScreenshot = Boolean(args.screenshot);
      const callArgs = { ...args };
      delete callArgs.screenshot;
      const result = await bridgeExecute(command, mapArgs(callArgs), { screenshot: wantScreenshot });
      const content = textContent(result?.data ?? result);
      if (result?.screenshot?.dataUrl) {
        const base64 = String(result.screenshot.dataUrl).split(',')[1] || '';
        content.push({ type: 'image', data: base64, mimeType: result.screenshot.mime || 'image/png' });
      }
      return content;
    },
  };
}

const TOOLS = [
  {
    name: 'get_editor_state',
    description:
      'Get the global MEngine editor state: edit/play mode, active gizmo, undo/redo availability, current scene name and dirty flag.',
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
    name: 'get_scene_snapshot',
    description:
      'Get the complete scene snapshot including every entity and all of its component data. Large — prefer get_hierarchy for an overview.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('scene.snapshot')),
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
    name: 'take_screenshot',
    description:
      'Capture a PNG screenshot. target=scene/game captures the rendered viewport; target=window captures the ENTIRE editor window (menu bar, panels, chrome) via the OS — use it to inspect the editor UI itself. Returns an image — use it to verify the visual result of your actions.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: ['scene', 'game', 'window'],
          description: 'What to capture: the scene/game viewport, or the whole editor window (default: scene)',
        },
      },
    },
    handler: async (args) => {
      const target = args.target || 'scene';
      const shot =
        target === 'window'
          ? await bridgeQuery('view.window_screenshot', {})
          : await bridgeQuery('view.screenshot', { target });
      const base64 = String(shot.dataUrl).split(',')[1] || '';
      return [{ type: 'image', data: base64, mimeType: shot.mime || 'image/png' }];
    },
  },
  {
    name: 'list_windows',
    description:
      'List every editor window currently open: the main window, detached panels (panel-*), and floating editor windows (editor-*), with title, position, size and focus.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('window.list')),
  },
  {
    name: 'get_console_logs',
    description: 'Get structured editor console logs (level, message, time). Filter by level and limit.',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['info', 'warn', 'error'], description: 'Filter by level' },
        limit: { type: 'number', description: 'Return at most this many recent entries' },
      },
    },
    handler: async (args) => {
      const queryArgs = {};
      if (args.level) queryArgs.level = args.level;
      if (typeof args.limit === 'number') queryArgs.limit = args.limit;
      return textContent(await bridgeQuery('console.get_logs', queryArgs));
    },
  },

  {
    name: 'list_commands',
    description: 'List every editor command (id, category, description, readOnly) the agent can invoke via the write tools.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => textContent(await bridgeQuery('commands.list')),
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
    'create_gameobject',
    'Create a new GameObject with optional components and parent. Returns the new entity id.',
    'entity.create',
    {
      name: { type: 'string', description: 'Entity name' },
      components: { type: 'object', description: 'Component map, e.g. { Transform: {...}, MeshRenderer: {...} }' },
      parent: { type: 'number', description: 'Parent entity id (null = root)' },
    },
  ),
  execTool(
    'create_typed',
    'Create a common GameObject by kind: empty, cube, camera, camera2d, directional_light, point_light, spot_light, environment_light, audio_source, ui_canvas, ui_image, ui_button, ui_text, ui_toggle, ui_slider, ui_panel, particle_3d, grid, tilemap, line2d, … Returns the new entity id.',
    'entity.create_typed',
    { kind: { type: 'string', description: 'The kind of object to create' } },
  ),
  execTool(
    'delete_entities',
    'Delete entities. Pass ids to delete specific ones, or omit to delete the current selection.',
    'entity.delete',
    { ids: { type: 'array', items: { type: 'number' }, description: 'Entity ids to delete (default: current selection)' } },
  ),
  execTool(
    'duplicate_entities',
    'Duplicate entities. Pass ids or omit to duplicate the current selection.',
    'entity.duplicate',
    { ids: { type: 'array', items: { type: 'number' }, description: 'Entity ids to duplicate (default: current selection)' } },
  ),
  execTool('rename_entity', 'Rename an entity.', 'entity.rename', {
    id: { type: 'number', description: 'Entity id' },
    name: { type: 'string', description: 'New name' },
  }),
  execTool('set_active', 'Enable or disable an entity.', 'entity.set_active', {
    id: { type: 'number', description: 'Entity id' },
    active: { type: 'boolean', description: 'Active flag' },
  }),
  execTool('reparent_entities', 'Reparent entities under a new parent.', 'entity.reparent', {
    ids: { type: 'array', items: { type: 'number' }, description: 'Entity ids to reparent' },
    parent: { type: ['number', 'null'], description: 'New parent id (null = root)' },
    index: { type: 'number', description: 'Sibling index (optional)' },
  }),
  execTool('add_component', 'Add a component to an entity.', 'component.add', {
    entity: { type: 'number', description: 'Entity id' },
    type: { type: 'string', description: 'Component type, e.g. MeshRenderer, Rigidbody, AutoRotate' },
    value: { type: 'object', description: 'Initial component value (optional)' },
  }),
  execTool('remove_component', 'Remove a component from an entity.', 'component.remove', {
    entity: { type: 'number', description: 'Entity id' },
    type: { type: 'string', description: 'Component type to remove' },
  }),
  execTool('set_component', 'Replace a component value on an entity.', 'component.set', {
    entity: { type: 'number', description: 'Entity id' },
    type: { type: 'string', description: 'Component type' },
    value: { type: 'object', description: 'Full component value' },
  }),
  execTool('patch_component', 'Shallow-merge fields into a component on an entity.', 'component.patch', {
    entity: { type: 'number', description: 'Entity id' },
    type: { type: 'string', description: 'Component type' },
    patch: { type: 'object', description: 'Fields to merge' },
  }),
  execTool('set_transform', 'Set position/rotation/scale on an entity (omitted fields keep current values). Rotation is a quaternion [x,y,z,w].', 'transform.set', {
    entity: { type: 'number', description: 'Entity id' },
    position: { type: 'array', items: { type: 'number' }, description: '[x, y, z]' },
    rotation: { type: 'array', items: { type: 'number' }, description: 'quaternion [x, y, z, w]' },
    scale: { type: 'array', items: { type: 'number' }, description: '[x, y, z]' },
  }),
  execTool('set_selection', 'Set the selection to the given entity ids.', 'selection.set', {
    ids: { type: 'array', items: { type: 'number' }, description: 'Entity ids to select' },
    mode: { type: 'string', enum: ['replace', 'add', 'toggle'], description: 'Selection mode (default replace)' },
  }),
  execTool('play', 'Enter play mode.', 'playback.play', {}),
  execTool('pause', 'Toggle pause during playback.', 'playback.pause', {}),
  execTool('stop', 'Stop playback and return to edit mode.', 'playback.stop', {}),
  execTool('undo', 'Undo the last edit.', 'history.undo', {}),
  execTool('redo', 'Redo the last undone edit.', 'history.redo', {}),
  execTool('set_gizmo', 'Set the active transform gizmo.', 'gizmo.set', {
    mode: { type: 'string', enum: ['translate', 'rotate', 'scale', 'rect'], description: 'Gizmo mode' },
  }),
  execTool('focus_panel', 'Open/focus an editor panel by kind (hierarchy, inspector, project, console, scene, game, …).', 'panel.focus', {
    kind: { type: 'string', description: 'Panel kind' },
  }),
];

const RESOURCES = [
  { uri: 'mengine://editor/state', name: 'Editor State', mimeType: 'application/json' },
  { uri: 'mengine://scene/hierarchy', name: 'Scene Hierarchy', mimeType: 'application/json' },
  { uri: 'mengine://console/logs', name: 'Console Logs', mimeType: 'application/json' },
];

const RESOURCE_READERS = {
  'mengine://editor/state': () => bridgeQuery('editor.state'),
  'mengine://scene/hierarchy': () => bridgeQuery('scene.hierarchy'),
  'mengine://console/logs': () => bridgeQuery('console.get_logs', {}),
};

// ── MCP stdio protocol ───────────────────────────────────────────────────

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      respond(id, {
        protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'mengine-editor', version: '0.1.0' },
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
        const content = await tool.handler(params?.arguments || {});
        respond(id, { content, isError: false });
      } catch (error) {
        respond(id, {
          content: [{ type: 'text', text: `Error: ${error?.message || String(error)}` }],
          isError: true,
        });
      }
      return;
    }
    case 'resources/list':
      respond(id, { resources: RESOURCES });
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
        respondError(id, -32603, `Failed to read resource: ${error?.message || String(error)}`);
      }
      return;
    }
    default:
      if (id !== undefined && id !== null) {
        respondError(id, -32601, `Method not found: ${method}`);
      }
  }
}

// ── Entry point ──────────────────────────────────────────────────────────

async function main() {
  const { port, token } = readDiscovery();
  await connectBridge(port, token);
  process.stderr.write(`[mengine-mcp] connected to editor bridge on port ${port}\n`);

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
        respondError(msg.id, -32603, String(error?.message || error));
      }
    });
  });
  rl.on('close', () => process.exit(0));
}

main().catch((error) => {
  process.stderr.write(`[mengine-mcp] fatal: ${error?.message || String(error)}\n`);
  process.exit(1);
});
