/**
 * AgentBridge write Dispatcher (Phase 2).
 *
 * Maps agent command ids onto `EditorStore` methods — the SAME path the UI and
 * menus use — so there is a single source of truth (the store), which then
 * syncs to the Rust host through the existing desktop session queue. After each
 * command the caller refreshes the UI and returns a result to the agent.
 *
 * Scene-mutating commands require edit mode; playback/selection/view commands
 * work in any mode.
 */
import type { EditorStore } from '../store';
import { BridgeError, type ScreenshotResult } from './protocol';

export interface CommandContext {
  store: EditorStore;
  focusPanel: (kind: string) => void;
}

export interface CommandResult {
  ok: true;
  data?: unknown;
  /** Optional post-action viewport screenshot for visual verification. */
  screenshot?: ScreenshotResult;
}

type CommandHandler = (ctx: CommandContext, args: Record<string, unknown>) => CommandResult;

function requireEditMode(ctx: CommandContext): void {
  if (ctx.store.mode !== 'edit') {
    throw new BridgeError('READONLY', 'Scene edits require edit mode (stop playback first)');
  }
}

function num(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be a number`);
  }
  return value;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be a non-empty string`);
  }
  return value;
}

function numArray(args: Record<string, unknown>, key: string): number[] {
  const value = args[key];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'number')) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be an array of numbers`);
  }
  return value as number[];
}

/** Capture the entity id created by a spawn call (most spawn* don't return it). */
function captureSpawned(ctx: CommandContext, spawn: () => void): number | null {
  const before = new Set(ctx.store.snapshot().entities.map((e) => e.entity));
  spawn();
  const after = ctx.store.snapshot().entities.map((e) => e.entity);
  return after.find((id) => !before.has(id)) ?? null;
}

/** kind → spawn method name for entity.create_typed. */
const KIND_SPAWNERS: Record<string, string> = {
  empty: 'spawnEmpty',
  camera: 'spawnCamera',
  camera2d: 'spawnCamera2D',
  cube: 'spawnCubeChild',
  directional_light: 'spawnDirectionalLight',
  point_light: 'spawnPointLight',
  spot_light: 'spawnSpotLight',
  environment_light: 'spawnEnvironmentLight',
  audio_source: 'spawnAudioSource',
  audio_listener: 'spawnAudioListener',
  audio_mixer: 'spawnAudioMixer',
  ui_canvas: 'spawnUiCanvas',
  ui_image: 'spawnUiImage',
  ui_raw_image: 'spawnUiRawImage',
  ui_button: 'spawnUiButton',
  ui_text: 'spawnUiText',
  ui_toggle: 'spawnUiToggle',
  ui_slider: 'spawnUiSlider',
  ui_scrollbar: 'spawnUiScrollbar',
  ui_panel: 'spawnUiPanel',
  ui_input_field: 'spawnUiInputField',
  ui_dropdown: 'spawnUiDropdown',
  ui_progress_bar: 'spawnUiProgressBar',
  particle_3d: 'spawnParticleEmitter3D',
  particle_2d: 'spawnParticleEmitter2D',
  grid: 'spawnGrid',
  tilemap: 'spawnTilemap',
  line2d: 'spawnLine2D',
};

export const WRITE_COMMANDS: Record<string, CommandHandler> = {
  // ── Selection ──────────────────────────────────────────────────────────
  'selection.set': (ctx, args) => {
    const ids = numArray(args, 'ids');
    const mode = (args.mode as 'replace' | 'add' | 'toggle') ?? 'replace';
    ctx.store.selectMany(ids, mode);
    return { ok: true, data: { selectedIds: ctx.store.selectedIds } };
  },
  'selection.reveal': (ctx, args) => {
    ctx.store.revealEntity(num(args, 'id'));
    return { ok: true, data: { selected: ctx.store.selected } };
  },

  // ── Entity lifecycle ───────────────────────────────────────────────────
  'entity.create': (ctx, args) => {
    requireEditMode(ctx);
    const name = typeof args.name === 'string' && args.name ? args.name : 'GameObject';
    const components = (args.components as Record<string, unknown>) ?? {};
    const parent = typeof args.parent === 'number' ? args.parent : null;
    const id = ctx.store.createGameObject(name, components, parent);
    if (id != null) ctx.store.select(id);
    return { ok: true, data: { entity: id } };
  },
  'entity.create_typed': (ctx, args) => {
    requireEditMode(ctx);
    const kind = str(args, 'kind');
    const method = KIND_SPAWNERS[kind];
    if (!method) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Unknown kind "${kind}". Known kinds: ${Object.keys(KIND_SPAWNERS).join(', ')}`,
      );
    }
    const spawn = (ctx.store as unknown as Record<string, () => void>)[method];
    if (typeof spawn !== 'function') {
      throw new BridgeError('INTERNAL', `Spawn method "${method}" is unavailable`);
    }
    const id = captureSpawned(ctx, () => spawn.call(ctx.store));
    if (id != null) ctx.store.select(id);
    return { ok: true, data: { entity: id, kind } };
  },
  'entity.delete': (ctx, args) => {
    requireEditMode(ctx);
    if (Array.isArray(args.ids)) ctx.store.selectMany(numArray(args, 'ids'), 'replace');
    ctx.store.deleteSelection();
    return { ok: true, data: { remaining: ctx.store.snapshot().entities.length } };
  },
  'entity.duplicate': (ctx, args) => {
    requireEditMode(ctx);
    if (Array.isArray(args.ids)) ctx.store.selectMany(numArray(args, 'ids'), 'replace');
    const duplicated = ctx.store.duplicateSelection();
    return { ok: true, data: { entity: duplicated } };
  },
  'entity.rename': (ctx, args) => {
    requireEditMode(ctx);
    ctx.store.rename(num(args, 'id'), str(args, 'name'));
    return { ok: true };
  },
  'entity.set_active': (ctx, args) => {
    requireEditMode(ctx);
    ctx.store.setActive(num(args, 'id'), Boolean(args.active));
    return { ok: true };
  },
  'entity.reparent': (ctx, args) => {
    requireEditMode(ctx);
    const ids = numArray(args, 'ids');
    const parent = args.parent === null ? null : num(args, 'parent');
    const index = typeof args.index === 'number' ? args.index : undefined;
    ctx.store.setParent(ids, parent, index);
    return { ok: true };
  },

  // ── Components ─────────────────────────────────────────────────────────
  'component.add': (ctx, args) => {
    requireEditMode(ctx);
    const entity = num(args, 'entity');
    const type = str(args, 'type');
    const value = (args.value as Record<string, unknown>) ?? {};
    const added = ctx.store.addComponent(entity, type, value);
    if (!added) throw new BridgeError('INVALID_ARGS', `Cannot add component "${type}" to entity ${entity}`);
    return { ok: true, data: { entity, component: type } };
  },
  'component.remove': (ctx, args) => {
    requireEditMode(ctx);
    const entity = num(args, 'entity');
    const type = str(args, 'type');
    const removed = ctx.store.removeComponent(entity, type);
    if (!removed) throw new BridgeError('INVALID_ARGS', `Cannot remove component "${type}" from entity ${entity}`);
    return { ok: true };
  },
  'component.set': (ctx, args) => {
    requireEditMode(ctx);
    ctx.store.setComponent(num(args, 'entity'), str(args, 'type'), (args.value as Record<string, unknown>) ?? {});
    return { ok: true };
  },
  'component.patch': (ctx, args) => {
    requireEditMode(ctx);
    ctx.store.patchComponent(num(args, 'entity'), str(args, 'type'), (args.patch as Record<string, unknown>) ?? {});
    return { ok: true };
  },

  // ── Transform ──────────────────────────────────────────────────────────
  'transform.set': (ctx, args) => {
    requireEditMode(ctx);
    const entity = num(args, 'entity');
    const current = ctx.store.getTransform(entity);
    if (!current) throw new BridgeError('ENTITY_NOT_FOUND', `Entity ${entity} has no Transform`);
    const next = {
      position: Array.isArray(args.position) ? (args.position as [number, number, number]) : current.position,
      rotation: Array.isArray(args.rotation) ? (args.rotation as [number, number, number, number]) : current.rotation,
      scale: Array.isArray(args.scale) ? (args.scale as [number, number, number]) : current.scale,
    };
    ctx.store.setTransform(entity, next);
    return { ok: true, data: { entity, transform: next } };
  },

  // ── Playback / history / view ──────────────────────────────────────────
  'playback.play': (ctx) => {
    ctx.store.play();
    return { ok: true, data: { mode: ctx.store.mode } };
  },
  'playback.pause': (ctx) => {
    ctx.store.pause();
    return { ok: true, data: { mode: ctx.store.mode } };
  },
  'playback.stop': (ctx) => {
    ctx.store.stop();
    return { ok: true, data: { mode: ctx.store.mode } };
  },
  'history.undo': (ctx) => {
    ctx.store.undo();
    return { ok: true, data: { canUndo: ctx.store.canUndo } };
  },
  'history.redo': (ctx) => {
    ctx.store.redo();
    return { ok: true, data: { canRedo: ctx.store.canRedo } };
  },
  'gizmo.set': (ctx, args) => {
    const mode = str(args, 'mode') as 'translate' | 'rotate' | 'scale' | 'rect';
    ctx.store.setGizmo(mode);
    return { ok: true, data: { gizmo: ctx.store.gizmo } };
  },
  'view.frame_selected': (ctx) => {
    ctx.store.frameSelected();
    return { ok: true };
  },

  // ── Panels ─────────────────────────────────────────────────────────────
  'panel.focus': (ctx, args) => {
    ctx.focusPanel(str(args, 'kind'));
    return { ok: true, data: { panel: args.kind } };
  },
};

/** Metadata for self-description (Phase 3 discoverability). */
export interface CommandMeta {
  id: string;
  category: string;
  description: string;
  readOnly: boolean;
}

export const COMMAND_META: CommandMeta[] = [
  { id: 'selection.set', category: 'selection', description: 'Set the selection to the given entity ids', readOnly: false },
  { id: 'selection.reveal', category: 'selection', description: 'Select an entity and expand its ancestors (ping)', readOnly: false },
  { id: 'entity.create', category: 'entity', description: 'Create a GameObject with optional components and parent', readOnly: false },
  { id: 'entity.create_typed', category: 'entity', description: 'Create a common GameObject by kind (cube, camera, light, ui_button, …)', readOnly: false },
  { id: 'entity.delete', category: 'entity', description: 'Delete the given (or currently selected) entities', readOnly: false },
  { id: 'entity.duplicate', category: 'entity', description: 'Duplicate the given (or currently selected) entities', readOnly: false },
  { id: 'entity.rename', category: 'entity', description: 'Rename an entity', readOnly: false },
  { id: 'entity.set_active', category: 'entity', description: 'Enable or disable an entity', readOnly: false },
  { id: 'entity.reparent', category: 'entity', description: 'Reparent entities under a new parent', readOnly: false },
  { id: 'component.add', category: 'component', description: 'Add a component to an entity', readOnly: false },
  { id: 'component.remove', category: 'component', description: 'Remove a component from an entity', readOnly: false },
  { id: 'component.set', category: 'component', description: 'Replace a component value on an entity', readOnly: false },
  { id: 'component.patch', category: 'component', description: 'Shallow-merge fields into a component on an entity', readOnly: false },
  { id: 'transform.set', category: 'transform', description: 'Set position/rotation/scale on an entity transform', readOnly: false },
  { id: 'playback.play', category: 'playback', description: 'Enter play mode', readOnly: false },
  { id: 'playback.pause', category: 'playback', description: 'Toggle pause', readOnly: false },
  { id: 'playback.stop', category: 'playback', description: 'Stop playback and return to edit mode', readOnly: false },
  { id: 'history.undo', category: 'history', description: 'Undo the last edit', readOnly: false },
  { id: 'history.redo', category: 'history', description: 'Redo the last undone edit', readOnly: false },
  { id: 'gizmo.set', category: 'view', description: 'Set the active transform gizmo (translate/rotate/scale/rect)', readOnly: false },
  { id: 'view.frame_selected', category: 'view', description: 'Frame the selected object in the scene view', readOnly: false },
  { id: 'panel.focus', category: 'panel', description: 'Open/focus a panel by kind', readOnly: false },
];
