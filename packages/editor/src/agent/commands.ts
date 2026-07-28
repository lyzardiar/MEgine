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
import { BridgeError, type ScreenshotResult } from './protocol.ts';

export interface CommandContext {
  store: EditorStore;
  focusPanel: (kind: string) => boolean;
  resetPanelLayout: () => void;
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

function entityId(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be a non-negative safe integer`);
  }
  return value;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be a non-empty string`);
  }
  return value.trim();
}

function entityIdArray(args: Record<string, unknown>, key: string): number[] {
  const value = args[key];
  if (
    !Array.isArray(value)
    || value.some((item) => typeof item !== 'number' || !Number.isSafeInteger(item) || item < 0)
  ) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be an array of non-negative safe integers`);
  }
  return [...new Set(value as number[])];
}

function bool(args: Record<string, unknown>, key: string): boolean {
  const value = args[key];
  if (typeof value !== 'boolean') {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be a boolean`);
  }
  return value;
}

function record(
  args: Record<string, unknown>,
  key: string,
  fallback?: Record<string, unknown>,
): Record<string, unknown> {
  const value = args[key];
  if (value === undefined && fallback) return fallback;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be an object`);
  }
  return value as Record<string, unknown>;
}

function oneOf<T extends string>(
  args: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback?: T,
): T {
  const value = args[key] ?? fallback;
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be one of: ${values.join(', ')}`,
    );
  }
  return value as T;
}

function optionalIndex(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be a non-negative safe integer`);
  }
  return value;
}

function finiteTuple(
  args: Record<string, unknown>,
  key: string,
  length: number,
): number[] | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value)
    || value.length !== length
    || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must contain exactly ${length} finite numbers`,
    );
  }
  return value as number[];
}

function requireEntity(ctx: CommandContext, id: number) {
  const entity = ctx.store.snapshot().entities.find((candidate) => candidate.entity === id);
  if (!entity) {
    throw new BridgeError('ENTITY_NOT_FOUND', `Entity ${id} does not exist`);
  }
  return entity;
}

function requireEntities(ctx: CommandContext, ids: number[], key = 'ids'): void {
  if (!ids.length) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must contain at least one entity id`);
  }
  for (const id of ids) requireEntity(ctx, id);
}

function requireComponent(ctx: CommandContext, entityIdValue: number, type: string) {
  const entity = requireEntity(ctx, entityIdValue);
  if (!Object.prototype.hasOwnProperty.call(entity.components, type)) {
    throw new BridgeError(
      'COMPONENT_NOT_FOUND',
      `Entity ${entityIdValue} has no component "${type}"`,
    );
  }
  return entity.components[type];
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
    const ids = entityIdArray(args, 'ids');
    for (const id of ids) requireEntity(ctx, id);
    const mode = oneOf(args, 'mode', ['replace', 'add', 'toggle'] as const, 'replace');
    ctx.store.selectMany(ids, mode);
    return { ok: true, data: { selectedIds: ctx.store.selectedIds } };
  },
  'selection.reveal': (ctx, args) => {
    const id = entityId(args, 'id');
    requireEntity(ctx, id);
    ctx.store.revealEntity(id);
    return { ok: true, data: { selected: ctx.store.selected } };
  },

  // ── Entity lifecycle ───────────────────────────────────────────────────
  'entity.create': (ctx, args) => {
    requireEditMode(ctx);
    const name = args.name === undefined ? 'GameObject' : str(args, 'name');
    const components = record(args, 'components', {});
    const parent = args.parent === undefined || args.parent === null
      ? null
      : entityId(args, 'parent');
    if (parent != null) requireEntity(ctx, parent);
    const id = ctx.store.createGameObject(name, components, parent);
    if (id == null) throw new BridgeError('INTERNAL', 'The editor did not create an entity');
    ctx.store.select(id);
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
    if (id == null) {
      throw new BridgeError('INTERNAL', `The editor did not create a "${kind}" entity`);
    }
    ctx.store.select(id);
    return { ok: true, data: { entity: id, kind } };
  },
  'entity.delete': (ctx, args) => {
    requireEditMode(ctx);
    const ids = args.ids === undefined ? ctx.store.selectedIds : entityIdArray(args, 'ids');
    requireEntities(ctx, ids);
    ctx.store.selectMany(ids, 'replace');
    ctx.store.deleteSelection();
    return { ok: true, data: { remaining: ctx.store.snapshot().entities.length } };
  },
  'entity.duplicate': (ctx, args) => {
    requireEditMode(ctx);
    const ids = args.ids === undefined ? ctx.store.selectedIds : entityIdArray(args, 'ids');
    requireEntities(ctx, ids);
    ctx.store.selectMany(ids, 'replace');
    const duplicated = ctx.store.duplicateSelection();
    if (duplicated == null) {
      throw new BridgeError('INTERNAL', 'The editor did not duplicate the selected entities');
    }
    return {
      ok: true,
      data: { entity: duplicated, selectedIds: ctx.store.selectedIds },
    };
  },
  'entity.rename': (ctx, args) => {
    requireEditMode(ctx);
    const id = entityId(args, 'id');
    const name = str(args, 'name');
    requireEntity(ctx, id);
    ctx.store.rename(id, name);
    return { ok: true, data: { entity: id, name } };
  },
  'entity.set_active': (ctx, args) => {
    requireEditMode(ctx);
    const id = entityId(args, 'id');
    const active = bool(args, 'active');
    requireEntity(ctx, id);
    ctx.store.setActive(id, active);
    return { ok: true, data: { entity: id, active } };
  },
  'entity.reparent': (ctx, args) => {
    requireEditMode(ctx);
    const ids = entityIdArray(args, 'ids');
    requireEntities(ctx, ids);
    const parent = args.parent === null ? null : entityId(args, 'parent');
    if (parent != null) requireEntity(ctx, parent);
    const index = optionalIndex(args, 'index');
    if (!ctx.store.setParent(ids, parent, index)) {
      throw new BridgeError(
        'INVALID_ARGS',
        'Cannot reparent these entities (the move is invalid or would create a cycle)',
      );
    }
    return { ok: true, data: { entities: ids, parent, index: index ?? null } };
  },

  // ── Components ─────────────────────────────────────────────────────────
  'component.add': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    const type = str(args, 'type');
    requireEntity(ctx, entity);
    const value = record(args, 'value', {});
    const added = ctx.store.addComponent(entity, type, value);
    if (!added) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Entity ${entity} already has component "${type}" or it cannot be added`,
      );
    }
    return { ok: true, data: { entity, component: type } };
  },
  'component.remove': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    const type = str(args, 'type');
    requireComponent(ctx, entity, type);
    if (type === 'Transform') {
      throw new BridgeError('INVALID_ARGS', 'The required Transform component cannot be removed');
    }
    const removed = ctx.store.removeComponent(entity, type);
    if (!removed) {
      throw new BridgeError('INTERNAL', `The editor did not remove component "${type}"`);
    }
    return { ok: true };
  },
  'component.set': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    const type = str(args, 'type');
    requireComponent(ctx, entity, type);
    ctx.store.setComponent(entity, type, record(args, 'value'));
    return { ok: true, data: { entity, component: type } };
  },
  'component.patch': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    const type = str(args, 'type');
    requireComponent(ctx, entity, type);
    ctx.store.patchComponent(entity, type, record(args, 'patch'));
    return { ok: true, data: { entity, component: type } };
  },

  // ── Transform ──────────────────────────────────────────────────────────
  'transform.set': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    requireEntity(ctx, entity);
    const current = ctx.store.getTransform(entity);
    if (!current) {
      throw new BridgeError('COMPONENT_NOT_FOUND', `Entity ${entity} has no Transform component`);
    }
    const position = finiteTuple(args, 'position', 3);
    const rotation = finiteTuple(args, 'rotation', 4);
    const scale = finiteTuple(args, 'scale', 3);
    if (!position && !rotation && !scale) {
      throw new BridgeError(
        'INVALID_ARGS',
        'transform.set requires at least one of "position", "rotation", or "scale"',
      );
    }
    const next = {
      position: position ? (position as [number, number, number]) : current.position,
      rotation: rotation
        ? (rotation as [number, number, number, number])
        : current.rotation,
      scale: scale ? (scale as [number, number, number]) : current.scale,
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
    const mode = oneOf(
      args,
      'mode',
      ['translate', 'rotate', 'scale', 'rect'] as const,
    );
    ctx.store.setGizmo(mode);
    return { ok: true, data: { gizmo: ctx.store.gizmo } };
  },
  'view.frame_selected': (ctx) => {
    ctx.store.frameSelected();
    return { ok: true };
  },

  // ── Panels ─────────────────────────────────────────────────────────────
  'panel.focus': (ctx, args) => {
    const kind = str(args, 'kind');
    if (!ctx.focusPanel(kind)) {
      throw new BridgeError('INVALID_ARGS', `Unknown panel kind "${kind}"`);
    }
    return { ok: true, data: { panel: kind, backgroundSafe: true } };
  },
  'panel.reset_layout': (ctx) => {
    ctx.resetPanelLayout();
    return { ok: true };
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
  { id: 'scene.new', category: 'scene', description: 'Create and save a named scene without opening a dialog', readOnly: false },
  { id: 'scene.open', category: 'scene', description: 'Open a named scene without opening a dialog', readOnly: false },
  { id: 'scene.save', category: 'scene', description: 'Save the current scene, optionally under a new name', readOnly: false },
  { id: 'scene.save_all', category: 'scene', description: 'Save the scene and every open resource document', readOnly: false },
  { id: 'asset.write_text', category: 'asset', description: 'Create or revision-safely update a UTF-8 text asset', readOnly: false },
  { id: 'build.start', category: 'build', description: 'Start an asynchronous PC Player build', readOnly: false },
  { id: 'build.cancel', category: 'build', description: 'Request cancellation of the active AgentBridge build', readOnly: false },
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
  { id: 'panel.focus', category: 'panel', description: 'Activate a docked panel without raising the editor window', readOnly: false },
  { id: 'panel.reset_layout', category: 'panel', description: 'Reset the dock workspace to its default layout', readOnly: false },
  { id: 'menu.invoke', category: 'menu', description: 'Invoke a registered Unity-style menu item by exact path', readOnly: false },
  { id: 'window.ui_click', category: 'window', description: 'Click a semantic UI element in an editor window without activating it', readOnly: false },
  { id: 'window.ui_set_value', category: 'window', description: 'Set an input value in an editor window without activating it', readOnly: false },
];
