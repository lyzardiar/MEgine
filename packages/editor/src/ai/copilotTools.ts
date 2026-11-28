import { agentBridge } from '../agent/AgentBridge';
import { COMMAND_PARAMS_SCHEMAS } from '../agent/commandSchemas';
import { QUERY_PARAMS_SCHEMAS } from '../agent/querySchemas';
import { createComponentDefaults } from '../componentCatalog';
import { eulerXYZToQuat, type Quat } from '../math3d';
import type { EditorStore } from '../store';
import type { PanelKind } from '../panels/DockWorkspace';

type SnapshotEntity = ReturnType<EditorStore['snapshot']>['entities'][number];

export type CopilotBridgeAdapter = {
  query: (queryId: string, params?: Record<string, unknown>, options?: { signal?: AbortSignal }) => Promise<unknown>;
  execute: (
    commandId: string,
    args?: Record<string, unknown>,
    options?: { screenshot?: boolean; expectedSceneRevision?: number },
  ) => Promise<unknown>;
};

export type CopilotToolDef = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type CopilotToolExecution = {
  id: string;
  name: string;
  ok: boolean;
  summary: string;
  argsPreview?: string;
};

export type CopilotToolContext = {
  store: EditorStore;
  bridge?: CopilotBridgeAdapter;
  signal?: AbortSignal;
  onRefresh: () => void;
  onSave: () => void;
  onTogglePlay: () => void;
  onFocusPanel: (panel: PanelKind) => void;
};

const RECT_KEY_ALIASES: Record<string, string> = {
  anchorMin: 'anchor_min',
  anchorMax: 'anchor_max',
  anchoredPosition: 'anchored_position',
  sizeDelta: 'size_delta',
  localRotation: 'local_rotation',
  localScale: 'local_scale',
};

export function normalizeComponentPatch(
  component: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(patch)) {
    const key = component === 'RectTransform' ? (RECT_KEY_ALIASES[rawKey] ?? rawKey) : rawKey;
    out[key] = value;
  }
  if (component === 'Transform' && Array.isArray(out.rotation_euler) && out.rotation_euler.length >= 3) {
    const [rx, ry, rz] = out.rotation_euler.map((v) => Number(v) || 0);
    const q: Quat = eulerXYZToQuat(rx, ry, rz);
    out.rotation = [q[0], q[1], q[2], q[3]];
    delete out.rotation_euler;
  }
  if (component === 'Transform' && Array.isArray(out.rotationEuler) && out.rotationEuler.length >= 3) {
    const [rx, ry, rz] = out.rotationEuler.map((v) => Number(v) || 0);
    const q: Quat = eulerXYZToQuat(rx, ry, rz);
    out.rotation = [q[0], q[1], q[2], q[3]];
    delete out.rotationEuler;
  }
  return out;
}

function resolveEntity(
  store: EditorStore,
  entityId?: unknown,
  entityName?: unknown,
): SnapshotEntity | null {
  const entities = store.snapshot().entities;
  if (typeof entityId === 'number' && Number.isFinite(entityId)) {
    const exact = entities.find((e) => e.entity === entityId);
    if (exact) return exact;
  }
  if (typeof entityName === 'string' && entityName.trim()) {
    const needle = entityName.trim().toLowerCase();
    const exact = entities.find((e) => (e.name ?? '').toLowerCase() === needle);
    if (exact) return exact;
    const partial = entities.find((e) => (e.name ?? '').toLowerCase().includes(needle));
    if (partial) return partial;
  }
  const primary = store.selected;
  if (primary != null) {
    return entities.find((e) => e.entity === primary) ?? null;
  }
  return null;
}

export function buildCompactSceneSummary(store: EditorStore): string {
  const entities = store.snapshot().entities;
  const selectedIds = new Set(store.selectedIds);
  const lines: string[] = [];
  const cap = 50;
  for (const e of entities.slice(0, cap)) {
    const comps = Object.keys(e.components).join(', ');
    const mark = selectedIds.has(e.entity) ? ' [SELECTED]' : '';
    const parentPart = e.parent != null ? ` parent=${e.parent}` : '';
    const activePart = e.active === false ? ' [INACTIVE]' : '';
    lines.push(`- #${e.entity} "${e.name ?? `Entity_${e.entity}`}"${parentPart}${activePart}${mark} (${comps})`);
  }
  if (entities.length > cap) {
    lines.push(`... (${entities.length - cap} more entities; call list_entities or get_entity to inspect)`);
  }

  const primary = store.selected != null
    ? entities.find((e) => e.entity === store.selected) ?? null
    : null;
  let selectedBlock = '';
  if (primary) {
    try {
      const json = JSON.stringify(primary.components);
      const clipped = json.length > 2200 ? `${json.slice(0, 2200)}…` : json;
      selectedBlock = `\nPrimary Selected Entity Detail (#${primary.entity} "${primary.name ?? ''}", parent=${primary.parent ?? 'null'}):\n${clipped}`;
    } catch {
      selectedBlock = '';
    }
  }
  return `Scene Hierarchy (${entities.length} entities):\n${lines.join('\n')}${selectedBlock}`;
}

export const COPILOT_TOOLS: readonly CopilotToolDef[] = [
  {
    name: 'list_entities',
    description: 'List entities in the active scene with their id, name, parent id, active state, and component names.',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Optional case-insensitive substring filter by entity name or component name.' },
      },
    },
  },
  {
    name: 'get_entity',
    description: 'Read full component data of an entity by id or name. Omit both to inspect the currently selected entity.',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'number', description: 'Numeric entity ID.' },
        name: { type: 'string', description: 'Entity name (used if entity ID is omitted).' },
      },
    },
  },
  {
    name: 'select_entity',
    description: 'Select and reveal an entity in the Hierarchy and Inspector.',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'number', description: 'Numeric entity ID.' },
        name: { type: 'string', description: 'Entity name.' },
      },
    },
  },
  {
    name: 'patch_component',
    description: 'Update one or more fields on an existing component of an entity (records Undo). For RectTransform, fields are anchor_min [x,y], anchor_max [x,y], pivot [x,y], anchored_position [x,y], size_delta [w,h], local_rotation (deg), local_scale [x,y] (Unity bottom-left Y-up: top-left anchor is [0,1]). For Transform, fields are position [x,y,z], rotation [x,y,z,w] (or rotation_euler [rx,ry,rz] in degrees), scale [x,y,z].',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'number', description: 'Numeric entity ID (defaults to currently selected entity).' },
        name: { type: 'string', description: 'Entity name (used if entity ID is omitted).' },
        component: { type: 'string', description: 'Component type name, e.g. RectTransform, Transform, Image, Button, Text, DirectionalLight, PointLight, Camera3D.' },
        patch: { type: 'object', description: 'Object containing the component fields to merge/update.' },
      },
      required: ['component', 'patch'],
    },
  },
  {
    name: 'add_component',
    description: 'Add a new component to an entity (using defaults merged with optional fields, records Undo).',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'number', description: 'Numeric entity ID (defaults to selected entity).' },
        name: { type: 'string', description: 'Entity name.' },
        component: { type: 'string', description: 'Component type name to add, e.g. PointLight, BoxCollider3D, AudioSource, ParticleEmitter3D.' },
        fields: { type: 'object', description: 'Optional initial field overrides.' },
      },
      required: ['component'],
    },
  },
  {
    name: 'remove_component',
    description: 'Remove a component from an entity (cannot remove Transform, records Undo).',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'number', description: 'Numeric entity ID (defaults to selected entity).' },
        name: { type: 'string', description: 'Entity name.' },
        component: { type: 'string', description: 'Component type name to remove.' },
      },
      required: ['component'],
    },
  },
  {
    name: 'spawn_entity',
    description: 'Create a new GameObject, 3D primitive, light, camera, particle system, or UI control in the scene (records Undo).',
    parameters: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          description: 'One of: Cube, Empty, Camera, Camera2D, DirectionalLight, PointLight, SpotLight, Canvas, Button, Image, Text, Panel, Slider, Toggle, InputField, Sprite, ParticleEmitter3D, ParticleEmitter2D.',
        },
        name: { type: 'string', description: 'Optional custom name for the spawned entity.' },
        parent: { type: 'number', description: 'Optional parent entity ID.' },
        position: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional 3D world/local position [x, y, z] for Transform.',
        },
      },
      required: ['preset'],
    },
  },
  {
    name: 'update_entity',
    description: 'Rename an entity, toggle its active flag, set its tag/layer, or change its parent (records Undo).',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'number', description: 'Numeric entity ID (defaults to selected entity).' },
        name: { type: 'string', description: 'Current entity name (if entity ID is omitted).' },
        new_name: { type: 'string', description: 'New name to assign.' },
        active: { type: 'boolean', description: 'Whether the entity is active.' },
        tag: { type: 'string', description: 'Tag string.' },
        layer: { type: 'number', description: 'Layer index (0-31).' },
        parent: { type: ['number', 'null'], description: 'New parent entity ID, or null for scene root.' },
      },
    },
  },
  {
    name: 'delete_entity',
    description: 'Delete an entity and its children from the scene (records Undo).',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'number', description: 'Numeric entity ID.' },
        name: { type: 'string', description: 'Entity name.' },
      },
    },
  },
  {
    name: 'duplicate_entity',
    description: 'Duplicate an entity (and its subtree) in the scene (records Undo).',
    parameters: {
      type: 'object',
      properties: {
        entity: { type: 'number', description: 'Numeric entity ID (defaults to selected entity).' },
        name: { type: 'string', description: 'Entity name.' },
      },
    },
  },
  {
    name: 'editor_action',
    description: 'Trigger an editor command: save_scene, toggle_play, undo, redo, frame_selected, or focus_panel.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['save_scene', 'toggle_play', 'undo', 'redo', 'frame_selected', 'focus_panel'],
          description: 'Action to execute.',
        },
        panel: {
          type: 'string',
          description: 'Panel name when action is focus_panel (e.g. scene, game, inspector, build, console, profiler, project).',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'editor_discover',
    description: 'Discover any of the 171 full-editor AgentBridge APIs (63 read queries + 108 write commands) and component schemas on demand. Use this before calling unfamiliar editor_query or editor_command operations.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['queries', 'commands', 'query_schema', 'command_schema', 'components', 'component_schema'],
          description: 'What to list or inspect.',
        },
        name: {
          type: 'string',
          description: 'Exact query id, command id, or component type when kind is *_schema.',
        },
        filter: {
          type: 'string',
          description: 'Optional case-insensitive substring filter when listing (e.g. "asset", "prefab", "scene", "build", "console", "view", "profiler", "script").',
        },
      },
      required: ['kind'],
    },
  },
  {
    name: 'editor_query',
    description: 'Run any read-only AgentBridge editor query (63 total): assets (asset.list, asset.read_text, asset.find_references, sprite.list), scenes (scene.list, scene.hierarchy), prefabs (prefab.instance), console & diagnostics (console.get_logs, project.script_diagnostics), profiler (profiler.get_samples, profiler.get_timeline), project/build settings (project.settings, build.settings, build.status, build.history), UI/panels/menus (panel.list, menu.list), etc.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Exact AgentBridge query id, e.g. "asset.list", "asset.read_text", "console.get_logs", "scene.list", "build.settings".' },
        params: { type: 'object', description: 'Query parameters object (optional; use editor_discover(kind="query_schema") if unsure).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'editor_command',
    description: 'Execute any write AgentBridge editor command (108 total): assets & scripts (asset.create, asset.write_text, asset.rename, asset.duplicate, asset.trash, asset.restore, asset.import_file, asset.instantiate, sprite.import_settings.set), prefabs (prefab.create, prefab.apply, prefab.revert, prefab.unpack), scenes (scene.new, scene.open, scene.save_all, scene.rename, scene.delete), project settings (project.settings.set_tags_and_layers, project.settings.set_sorting_layers), build (build.settings.set_scenes, build.start, build.verify, build.run), viewport/playback (view.set_camera, view.set_game_resolution, view.set_game_display, gizmo.set, playback.step, playback.input), menus/panels/batch (menu.invoke, panel.reset_layout, effekseer.compose, figma.import_ui, batch.apply, console.clear).',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Exact AgentBridge command id, e.g. "asset.write_text", "prefab.create", "scene.open", "view.set_game_resolution", "build.start".' },
        args: { type: 'object', description: 'Command arguments object (use editor_discover(kind="command_schema") if unsure).' },
      },
      required: ['command'],
    },
  },
];

const MAX_TOOL_PAYLOAD_CHARS = 14_000;

function stripHugeBlobs(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[max-depth]';
  if (typeof value === 'string') {
    if (value.startsWith('data:image/') && value.length > 256) {
      return `[base64 image omitted, ${value.length} chars]`;
    }
    if (value.length > 6000) {
      return `${value.slice(0, 6000)}… [truncated ${value.length - 6000} chars]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    const cap = 120;
    const mapped = value.slice(0, cap).map((item) => stripHugeBlobs(item, depth + 1));
    if (value.length > cap) {
      mapped.push(`[... ${value.length - cap} more items truncated]`);
    }
    return mapped;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'screenshot' && typeof v === 'string' && v.length > 256) {
        out[k] = `[screenshot omitted, ${v.length} chars]`;
        continue;
      }
      out[k] = stripHugeBlobs(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function compactToolResult(value: unknown): unknown {
  const cleaned = stripHugeBlobs(value);
  try {
    const serialized = JSON.stringify(cleaned);
    if (serialized.length <= MAX_TOOL_PAYLOAD_CHARS) return cleaned;
    return {
      truncated: true,
      totalChars: serialized.length,
      preview: `${serialized.slice(0, MAX_TOOL_PAYLOAD_CHARS)}…`,
    };
  } catch {
    return String(cleaned);
  }
}

function summarizeArgs(args: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(args);
    return text.length > 96 ? `${text.slice(0, 96)}…` : text;
  } catch {
    return '';
  }
}

export async function executeCopilotTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: CopilotToolContext,
): Promise<{ ok: boolean; summary: string; result: unknown; argsPreview: string }> {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
  const argsPreview = summarizeArgs(args);
  const { store } = ctx;

  if (name === 'list_entities') {
    const filter = typeof args.filter === 'string' ? args.filter.trim().toLowerCase() : '';
    const all = store.snapshot().entities;
    const rows = all
      .filter((e) => {
        if (!filter) return true;
        return (
          (e.name ?? '').toLowerCase().includes(filter)
          || Object.keys(e.components).some((c) => c.toLowerCase().includes(filter))
        );
      })
      .slice(0, 120)
      .map((e) => ({
        entity: e.entity,
        name: e.name,
        parent: e.parent ?? null,
        active: e.active !== false,
        tag: e.tag,
        layer: e.layer,
        components: Object.keys(e.components),
      }));
    return {
      ok: true,
      summary: `列出 ${rows.length} 个实体`,
      argsPreview,
      result: { count: rows.length, selectedIds: store.selectedIds, entities: rows },
    };
  }

  if (name === 'get_entity') {
    const target = resolveEntity(store, args.entity, args.name);
    if (!target) {
      return { ok: false, summary: '未找到目标实体', argsPreview, result: { error: 'Entity not found' } };
    }
    return {
      ok: true,
      summary: `读取 #${target.entity} ${target.name}`,
      argsPreview,
      result: {
        entity: target.entity,
        name: target.name,
        parent: target.parent ?? null,
        active: target.active !== false,
        tag: target.tag,
        layer: target.layer,
        components: target.components,
      },
    };
  }

  if (name === 'select_entity') {
    const target = resolveEntity(store, args.entity, args.name);
    if (!target) {
      return { ok: false, summary: '未找到目标实体', argsPreview, result: { error: 'Entity not found' } };
    }
    store.revealEntity(target.entity);
    ctx.onRefresh();
    return {
      ok: true,
      summary: `已选中 ${target.name} (#${target.entity})`,
      argsPreview,
      result: { selected: target.entity, name: target.name },
    };
  }

  if (name === 'patch_component') {
    const target = resolveEntity(store, args.entity, args.name);
    const component = typeof args.component === 'string' ? args.component.trim() : '';
    const patch = args.patch && typeof args.patch === 'object' && !Array.isArray(args.patch)
      ? (args.patch as Record<string, unknown>)
      : null;
    if (!target) {
      return { ok: false, summary: '未找到目标实体', argsPreview, result: { error: 'Entity not found' } };
    }
    if (!component || !patch) {
      return { ok: false, summary: '缺少组件名或属性补丁', argsPreview, result: { error: 'component and patch object are required' } };
    }
    if (target.components[component] == null) {
      return {
        ok: false,
        summary: `${target.name} 不含 ${component}`,
        argsPreview,
        result: {
          error: `Entity #${target.entity} "${target.name}" does not have component "${component}"`,
          availableComponents: Object.keys(target.components),
        },
      };
    }
    const normalized = normalizeComponentPatch(component, patch);
    store.patchComponent(target.entity, component, normalized);
    ctx.onRefresh();
    const updated = store.snapshot().entities.find((e) => e.entity === target.entity);
    return {
      ok: true,
      summary: `已更新 ${target.name}.${component}`,
      argsPreview,
      result: {
        entity: target.entity,
        name: target.name,
        component,
        value: updated?.components[component] ?? null,
      },
    };
  }

  if (name === 'add_component') {
    const target = resolveEntity(store, args.entity, args.name);
    const component = typeof args.component === 'string' ? args.component.trim() : '';
    if (!target || !component) {
      return { ok: false, summary: '缺少目标实体或组件名', argsPreview, result: { error: 'Entity and component are required' } };
    }
    if (target.components[component] != null) {
      return { ok: false, summary: `${target.name} 已有 ${component}`, argsPreview, result: { error: `Component "${component}" already exists on entity` } };
    }
    const defaults = (createComponentDefaults(component) ?? {}) as Record<string, unknown>;
    const rawFields = args.fields && typeof args.fields === 'object' && !Array.isArray(args.fields)
      ? normalizeComponentPatch(component, args.fields as Record<string, unknown>)
      : {};
    const added = store.addComponent(target.entity, component, { ...defaults, ...rawFields });
    ctx.onRefresh();
    return {
      ok: added,
      summary: added ? `已为 ${target.name} 添加 ${component}` : `添加 ${component} 失败`,
      argsPreview,
      result: { added, entity: target.entity, name: target.name, component },
    };
  }

  if (name === 'remove_component') {
    const target = resolveEntity(store, args.entity, args.name);
    const component = typeof args.component === 'string' ? args.component.trim() : '';
    if (!target || !component) {
      return { ok: false, summary: '缺少目标实体或组件名', argsPreview, result: { error: 'Entity and component are required' } };
    }
    const removed = store.removeComponent(target.entity, component);
    ctx.onRefresh();
    return {
      ok: removed,
      summary: removed ? `已移除 ${target.name}.${component}` : `无法移除 ${component}`,
      argsPreview,
      result: { removed, entity: target.entity, name: target.name, component },
    };
  }

  if (name === 'spawn_entity') {
    const preset = typeof args.preset === 'string' ? args.preset.trim() : 'Cube';
    const parent = typeof args.parent === 'number' && Number.isFinite(args.parent) ? args.parent : undefined;
    const beforeIds = new Set(store.snapshot().entities.map((e) => e.entity));

    switch (preset.toLowerCase()) {
      case 'empty': store.createEmpty(parent ?? null); break;
      case 'camera': store.spawnCamera(); break;
      case 'camera2d': store.spawnCamera2D(); break;
      case 'directionallight': store.spawnDirectionalLight(); break;
      case 'pointlight': store.spawnPointLight(); break;
      case 'spotlight': store.spawnSpotLight(); break;
      case 'canvas': store.spawnUiCanvas(); break;
      case 'button': store.spawnUiButton(parent); break;
      case 'image': store.spawnUiImage(parent); break;
      case 'text': store.spawnUiText(parent); break;
      case 'panel': store.spawnUiPanel(parent); break;
      case 'slider': store.spawnUiSlider(parent); break;
      case 'toggle': store.spawnUiToggle(parent); break;
      case 'inputfield': store.spawnUiInputField(parent); break;
      case 'sprite': store.spawnSpriteQuad(); break;
      case 'particleemitter3d': store.spawnParticleEmitter3D(); break;
      case 'particleemitter2d': store.spawnParticleEmitter2D(); break;
      default: store.spawnPrefab(preset); break;
    }

    const createdList = store.snapshot().entities.filter((e) => !beforeIds.has(e.entity));
    const created = createdList[createdList.length - 1] ?? null;
    if (created) {
      if (typeof args.name === 'string' && args.name.trim()) {
        store.rename(created.entity, args.name.trim());
      }
      if (parent != null && (created.parent ?? null) !== parent) {
        store.setParent([created.entity], parent);
      }
      if (Array.isArray(args.position) && args.position.length >= 3 && created.components.Transform) {
        const pos = args.position.slice(0, 3).map((v) => Number(v) || 0);
        store.patchComponent(created.entity, 'Transform', { position: pos });
      }
    }
    ctx.onRefresh();
    const finalEntity = created
      ? store.snapshot().entities.find((e) => e.entity === created.entity) ?? created
      : null;
    return {
      ok: finalEntity != null,
      summary: finalEntity ? `已创建 ${finalEntity.name} (#${finalEntity.entity})` : `创建 ${preset} 失败`,
      argsPreview,
      result: finalEntity
        ? { entity: finalEntity.entity, name: finalEntity.name, components: Object.keys(finalEntity.components) }
        : { error: 'Failed to spawn entity (editor may be in Play mode)' },
    };
  }

  if (name === 'update_entity') {
    const target = resolveEntity(store, args.entity, args.name);
    if (!target) {
      return { ok: false, summary: '未找到目标实体', argsPreview, result: { error: 'Entity not found' } };
    }
    const changes: string[] = [];
    if (typeof args.new_name === 'string' && args.new_name.trim()) {
      store.rename(target.entity, args.new_name.trim());
      changes.push(`name=${args.new_name.trim()}`);
    }
    if (typeof args.active === 'boolean') {
      store.setActive(target.entity, args.active);
      changes.push(`active=${args.active}`);
    }
    if (typeof args.tag === 'string') {
      store.setTag(target.entity, args.tag);
      changes.push(`tag=${args.tag}`);
    }
    if (typeof args.layer === 'number' && Number.isFinite(args.layer)) {
      store.setLayer(target.entity, args.layer);
      changes.push(`layer=${args.layer}`);
    }
    if (args.parent === null || (typeof args.parent === 'number' && Number.isFinite(args.parent))) {
      store.setParent([target.entity], args.parent);
      changes.push(`parent=${args.parent}`);
    }
    ctx.onRefresh();
    return {
      ok: true,
      summary: `已更新 #${target.entity} (${changes.join(', ') || '无变更'})`,
      argsPreview,
      result: { entity: target.entity, changes },
    };
  }

  if (name === 'delete_entity') {
    const target = resolveEntity(store, args.entity, args.name);
    if (!target) {
      return { ok: false, summary: '未找到目标实体', argsPreview, result: { error: 'Entity not found' } };
    }
    store.select(target.entity);
    const deleted = store.deleteSelection();
    ctx.onRefresh();
    return {
      ok: deleted,
      summary: deleted ? `已删除 ${target.name} (#${target.entity})` : `删除 ${target.name} 失败`,
      argsPreview,
      result: { deleted, entity: target.entity, name: target.name },
    };
  }

  if (name === 'duplicate_entity') {
    const target = resolveEntity(store, args.entity, args.name);
    if (!target) {
      return { ok: false, summary: '未找到目标实体', argsPreview, result: { error: 'Entity not found' } };
    }
    store.select(target.entity);
    const clonedId = store.duplicateSelection();
    ctx.onRefresh();
    return {
      ok: clonedId != null,
      summary: clonedId != null ? `已复制 ${target.name} -> #${clonedId}` : '复制失败',
      argsPreview,
      result: { source: target.entity, duplicatedEntity: clonedId },
    };
  }

  if (name === 'editor_action') {
    const action = typeof args.action === 'string' ? args.action : '';
    switch (action) {
      case 'save_scene':
        ctx.onSave();
        return { ok: true, summary: '已保存当前场景', argsPreview, result: { action, ok: true } };
      case 'toggle_play':
        ctx.onTogglePlay();
        return { ok: true, summary: '已切换播放状态', argsPreview, result: { action, ok: true } };
      case 'undo': {
        const ok = store.undo();
        ctx.onRefresh();
        return { ok, summary: ok ? '已撤销上一步操作' : '无可撤销步骤', argsPreview, result: { action, ok } };
      }
      case 'redo': {
        const ok = store.redo();
        ctx.onRefresh();
        return { ok, summary: ok ? '已重做操作' : '无可重做步骤', argsPreview, result: { action, ok } };
      }
      case 'frame_selected':
        store.frameSelected();
        ctx.onRefresh();
        return { ok: true, summary: '已聚焦选中物体', argsPreview, result: { action, ok: true } };
      case 'focus_panel': {
        const panel = typeof args.panel === 'string' ? (args.panel as PanelKind) : 'scene';
        ctx.onFocusPanel(panel);
        return { ok: true, summary: `已切换到 ${panel} 面板`, argsPreview, result: { action, panel, ok: true } };
      }
      default:
        return { ok: false, summary: `未知动作: ${action}`, argsPreview, result: { error: `Unknown editor_action "${action}"` } };
    }
  }

  const bridge: CopilotBridgeAdapter = ctx.bridge ?? agentBridge;

  if (name === 'editor_discover') {
    const kind = typeof args.kind === 'string' ? args.kind : '';
    const filter = typeof args.filter === 'string' ? args.filter.trim().toLowerCase() : '';
    const targetName = typeof args.name === 'string' ? args.name.trim() : '';

    if (kind === 'queries') {
      const all = Object.keys(QUERY_PARAMS_SCHEMAS);
      const matched = filter ? all.filter((id) => id.toLowerCase().includes(filter)) : all;
      return {
        ok: true,
        summary: `发现 ${matched.length} 项查询 API`,
        argsPreview,
        result: { total: all.length, matched },
      };
    }
    if (kind === 'commands') {
      const all = Object.keys(COMMAND_PARAMS_SCHEMAS);
      const matched = filter ? all.filter((id) => id.toLowerCase().includes(filter)) : all;
      return {
        ok: true,
        summary: `发现 ${matched.length} 项命令 API`,
        argsPreview,
        result: { total: all.length, matched },
      };
    }
    if (kind === 'query_schema') {
      const schema = QUERY_PARAMS_SCHEMAS[targetName];
      if (!schema) {
        return {
          ok: false,
          summary: `未知查询: ${targetName}`,
          argsPreview,
          result: { error: `Unknown query "${targetName}"`, hint: 'Call editor_discover(kind="queries") to list valid ids.' },
        };
      }
      return {
        ok: true,
        summary: `查询参数: ${targetName}`,
        argsPreview,
        result: { query: targetName, paramsSchema: schema },
      };
    }
    if (kind === 'command_schema') {
      const schema = COMMAND_PARAMS_SCHEMAS[targetName];
      if (!schema) {
        return {
          ok: false,
          summary: `未知命令: ${targetName}`,
          argsPreview,
          result: { error: `Unknown command "${targetName}"`, hint: 'Call editor_discover(kind="commands") to list valid ids.' },
        };
      }
      return {
        ok: true,
        summary: `命令参数: ${targetName}`,
        argsPreview,
        result: { command: targetName, argsSchema: schema },
      };
    }
    if (kind === 'components') {
      try {
        const raw = await bridge.query('schema.components', {}, { signal: ctx.signal });
        return {
          ok: true,
          summary: '已获取组件类型目录',
          argsPreview,
          result: compactToolResult(raw),
        };
      } catch (reason) {
        return {
          ok: false,
          summary: '读取组件目录失败',
          argsPreview,
          result: { error: reason instanceof Error ? reason.message : String(reason) },
        };
      }
    }
    if (kind === 'component_schema') {
      try {
        const raw = await bridge.query('schema.component', { type: targetName }, { signal: ctx.signal });
        return {
          ok: true,
          summary: `组件定义: ${targetName}`,
          argsPreview,
          result: compactToolResult(raw),
        };
      } catch (reason) {
        return {
          ok: false,
          summary: `读取组件 ${targetName} 失败`,
          argsPreview,
          result: { error: reason instanceof Error ? reason.message : String(reason) },
        };
      }
    }
    return {
      ok: false,
      summary: `未知 discover 类型: ${kind}`,
      argsPreview,
      result: { error: `Unknown discover kind "${kind}"` },
    };
  }

  if (name === 'editor_query') {
    const queryId = typeof args.query === 'string' ? args.query.trim() : '';
    const params = args.params && typeof args.params === 'object' && !Array.isArray(args.params)
      ? (args.params as Record<string, unknown>)
      : {};
    if (!queryId) {
      return { ok: false, summary: '缺少 query 名称', argsPreview, result: { error: 'query string is required' } };
    }
    try {
      const raw = await bridge.query(queryId, params, { signal: ctx.signal });
      return {
        ok: true,
        summary: `查询 ${queryId}`,
        argsPreview,
        result: compactToolResult(raw),
      };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      const schema = QUERY_PARAMS_SCHEMAS[queryId];
      return {
        ok: false,
        summary: `查询 ${queryId} 失败`,
        argsPreview,
        result: {
          error: message,
          ...(schema ? { expectedParamsSchema: schema } : { hint: 'Use editor_discover(kind="queries") to check valid query ids.' }),
        },
      };
    }
  }

  if (name === 'editor_command') {
    const commandId = typeof args.command === 'string' ? args.command.trim() : '';
    const cmdArgs = args.args && typeof args.args === 'object' && !Array.isArray(args.args)
      ? (args.args as Record<string, unknown>)
      : {};
    if (!commandId) {
      return { ok: false, summary: '缺少 command 名称', argsPreview, result: { error: 'command string is required' } };
    }
    try {
      const raw = await bridge.execute(commandId, cmdArgs, { screenshot: false });
      ctx.onRefresh();
      return {
        ok: true,
        summary: `执行 ${commandId}`,
        argsPreview,
        result: compactToolResult(raw),
      };
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      const schema = COMMAND_PARAMS_SCHEMAS[commandId];
      return {
        ok: false,
        summary: `执行 ${commandId} 失败`,
        argsPreview,
        result: {
          error: message,
          ...(schema ? { expectedArgsSchema: schema } : { hint: 'Use editor_discover(kind="commands") to check valid command ids.' }),
        },
      };
    }
  }

  return {
    ok: false,
    summary: `未知工具: ${name}`,
    argsPreview,
    result: { error: `Unknown tool "${name}"` },
  };
}
