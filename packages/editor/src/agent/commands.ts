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
import type { WorldCommand } from '@mengine/api';
import {
  expandIntent,
  validateIntent,
  type Intent,
} from '@mengine/agent';
import { getBehaviour } from '@mengine/behaviour';
import {
  componentRemovalBlockers,
  createComponentDefaults,
} from '../componentCatalog.ts';
import type { EditorStore } from '../store';
import { readRectTransform } from '../ui/rectLayout.ts';
import { BridgeError, type ScreenshotResult } from './protocol.ts';
import {
  COMMAND_PARAMS_SCHEMAS,
  type AgentJsonSchema,
} from './commandSchemas.ts';
import { TYPED_ENTITY_KINDS, type TypedEntityKind } from './typedEntityKinds.ts';

export interface CommandContext {
  store: EditorStore;
  focusPanel: (kind: string) => boolean;
  resetPanelLayout: () => void;
}

export interface CommandResult {
  ok: true;
  data?: unknown;
  /** Scene revision after the command completed. */
  sceneRevision?: number;
  /** Event cursor after the command completed. */
  eventSequence?: number;
  /** Optional post-action viewport screenshot for visual verification. */
  screenshot?: ScreenshotResult;
  /** True when the caller explicitly requested post-action visual verification. */
  screenshotRequested?: boolean;
  /** Whether the requested post-action screenshot was captured. */
  screenshotCaptured?: boolean;
  /** Bounded diagnostic when the write completed but screenshot capture failed. */
  screenshotError?: string;
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

function nonEmptyEntityIdArray(args: Record<string, unknown>, key: string): number[] {
  const ids = entityIdArray(args, key);
  if (!ids.length) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must contain at least one entity id`);
  }
  return ids;
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

function optionalFiniteNumber(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be a finite number`);
  }
  return value;
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

function requireRemovableComponent(
  ctx: CommandContext,
  entityIdValue: number,
  type: string,
) {
  const entity = requireEntity(ctx, entityIdValue);
  requireComponent(ctx, entityIdValue, type);
  if (type === 'Transform') {
    throw new BridgeError('INVALID_ARGS', 'The required Transform component cannot be removed');
  }
  const blockers = componentRemovalBlockers(entity.components, type);
  if (blockers.length) {
    throw new BridgeError(
      'INVALID_ARGS',
      `Entity ${entityIdValue} cannot remove "${type}" because it is required by: ${blockers.join(', ')}`,
    );
  }
  return entity;
}

type BatchEntity = {
  parent: number | null;
  components: Record<string, unknown>;
};

function batchCommandRecord(value: unknown, index: number): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeError('INVALID_ARGS', `commands[${index}] must be an object`);
  }
  return value as Record<string, unknown>;
}

function batchEntityId(
  command: Record<string, unknown>,
  key: string,
  index: number,
): number {
  const value = command[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new BridgeError(
      'INVALID_ARGS',
      `commands[${index}].${key} must be a non-negative safe integer`,
    );
  }
  return value;
}

function batchString(
  command: Record<string, unknown>,
  key: string,
  index: number,
): string {
  const value = command[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BridgeError(
      'INVALID_ARGS',
      `commands[${index}].${key} must be a non-empty string`,
    );
  }
  return value.trim();
}

function batchRecord(
  command: Record<string, unknown>,
  key: string,
  index: number,
): Record<string, unknown> {
  const value = command[key];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeError(
      'INVALID_ARGS',
      `commands[${index}].${key} must be an object`,
    );
  }
  return value as Record<string, unknown>;
}

function requireBatchEntity(
  entities: Map<number, BatchEntity>,
  entity: number,
  index: number,
): BatchEntity {
  const found = entities.get(entity);
  if (!found) {
    throw new BridgeError(
      'ENTITY_NOT_FOUND',
      `commands[${index}] references missing entity ${entity}`,
    );
  }
  return found;
}

function removeBatchSubtree(entities: Map<number, BatchEntity>, root: number): void {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    for (const [entity, value] of entities) {
      if (value.parent === current) pending.push(entity);
    }
    entities.delete(current);
  }
}

function assertBatchParent(
  entities: Map<number, BatchEntity>,
  entity: number,
  parent: number | null,
  index: number,
): void {
  if (parent == null) return;
  requireBatchEntity(entities, parent, index);
  let current: number | null = parent;
  const visited = new Set<number>();
  while (current != null) {
    if (current === entity) {
      throw new BridgeError(
        'INVALID_ARGS',
        `commands[${index}] would create a hierarchy cycle`,
      );
    }
    if (visited.has(current)) {
      throw new BridgeError(
        'INVALID_ARGS',
        `commands[${index}] encountered an invalid hierarchy cycle`,
      );
    }
    visited.add(current);
    current = entities.get(current)?.parent ?? null;
  }
}

/**
 * Validate the complete batch against a simulated hierarchy before the store
 * sees any command. This is what makes malformed batches all-or-nothing.
 */
function worldCommandBatch(
  ctx: CommandContext,
  args: Record<string, unknown>,
): WorldCommand[] {
  const raw = args.commands;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 256) {
    throw new BridgeError(
      'INVALID_ARGS',
      '"commands" must contain between 1 and 256 WorldCommand objects',
    );
  }
  const entities = new Map<number, BatchEntity>(
    ctx.store.snapshot().entities.map((entity) => [
      entity.entity,
      {
        parent: entity.parent ?? null,
        components: structuredClone(entity.components),
      },
    ]),
  );
  const commands: WorldCommand[] = [];
  raw.forEach((value, index) => {
    const command = batchCommandRecord(value, index);
    const op = batchString(command, 'op', index);
    if (op === 'spawn') {
      const name = command.name === undefined
        ? undefined
        : batchString(command, 'name', index);
      const components = batchRecord(command, 'components', index);
      for (const [type, component] of Object.entries(components)) {
        if (!type.trim()) {
          throw new BridgeError(
            'INVALID_ARGS',
            `commands[${index}].components contains an empty component type`,
          );
        }
        if (component === null || typeof component !== 'object' || Array.isArray(component)) {
          throw new BridgeError(
            'INVALID_ARGS',
            `commands[${index}].components.${type} must be an object`,
          );
        }
      }
      commands.push({
        op: 'spawn',
        ...(name ? { name } : {}),
        components: structuredClone(components),
      });
      return;
    }
    if (op === 'despawn') {
      const entity = batchEntityId(command, 'entity', index);
      requireBatchEntity(entities, entity, index);
      removeBatchSubtree(entities, entity);
      commands.push({ op: 'despawn', entity });
      return;
    }
    if (op === 'setComponent') {
      const entity = batchEntityId(command, 'entity', index);
      const simulated = requireBatchEntity(entities, entity, index);
      const component = batchString(command, 'component', index);
      const componentValue = structuredClone(batchRecord(command, 'value', index));
      simulated.components[component] = componentValue;
      commands.push({ op: 'setComponent', entity, component, value: componentValue });
      return;
    }
    if (op === 'removeComponent') {
      const entity = batchEntityId(command, 'entity', index);
      const simulated = requireBatchEntity(entities, entity, index);
      const component = batchString(command, 'component', index);
      if (component === 'Transform') {
        throw new BridgeError(
          'INVALID_ARGS',
          `commands[${index}] cannot remove the required Transform component`,
        );
      }
      if (!Object.prototype.hasOwnProperty.call(simulated.components, component)) {
        throw new BridgeError(
          'COMPONENT_NOT_FOUND',
          `commands[${index}] references missing component "${component}" on entity ${entity}`,
        );
      }
      delete simulated.components[component];
      commands.push({ op: 'removeComponent', entity, component });
      return;
    }
    if (op === 'setParent') {
      const entity = batchEntityId(command, 'entity', index);
      const simulated = requireBatchEntity(entities, entity, index);
      const parent = command.parent === undefined || command.parent === null
        ? null
        : batchEntityId(command, 'parent', index);
      assertBatchParent(entities, entity, parent, index);
      simulated.parent = parent;
      commands.push({
        op: 'setParent',
        entity,
        ...(parent == null ? {} : { parent }),
      });
      return;
    }
    if (op === 'setClearColor') {
      const channels = (['r', 'g', 'b', 'a'] as const).map((key) => command[key]);
      if (
        channels.some((channel) => (
          typeof channel !== 'number'
          || !Number.isFinite(channel)
          || channel < 0
          || channel > 1
        ))
      ) {
        throw new BridgeError(
          'INVALID_ARGS',
          `commands[${index}] clear-color channels must be finite numbers from 0 to 1`,
        );
      }
      commands.push({
        op: 'setClearColor',
        r: channels[0] as number,
        g: channels[1] as number,
        b: channels[2] as number,
        a: channels[3] as number,
      });
      return;
    }
    throw new BridgeError(
      'INVALID_ARGS',
      `commands[${index}] has unsupported op "${op}"`,
    );
  });
  return commands;
}

function applyWorldCommands(
  ctx: CommandContext,
  commands: WorldCommand[],
): {
  commandCount: number;
  entityCount: number;
  created: number[];
  removed: number[];
} {
  const beforeIds = new Set(ctx.store.snapshot().entities.map((entity) => entity.entity));
  if (!ctx.store.applyCommands(commands)) {
    throw new BridgeError('INTERNAL', 'The editor did not apply the validated command batch');
  }
  const after = ctx.store.snapshot().entities;
  const afterIds = new Set(after.map((entity) => entity.entity));
  return {
    commandCount: commands.length,
    entityCount: after.length,
    created: [...afterIds].filter((entity) => !beforeIds.has(entity)),
    removed: [...beforeIds].filter((entity) => !afterIds.has(entity)),
  };
}

/** Capture the selected object created by a spawn call, including composite spawns. */
function captureSpawned(ctx: CommandContext, spawn: () => void): number | null {
  const before = new Set(ctx.store.snapshot().entities.map((e) => e.entity));
  spawn();
  const created = ctx.store.snapshot().entities
    .map((entity) => entity.entity)
    .filter((entity) => !before.has(entity));
  const selected = ctx.store.selected;
  if (selected != null && created.includes(selected)) return selected;
  return created.at(-1) ?? null;
}

/** Exact built-in kind → the same Store spawn path used by GameObject menus. */
const KIND_SPAWNERS: Record<TypedEntityKind, (store: EditorStore) => void> = {
  empty: (store) => store.spawnEmpty(),
  cube: (store) => store.spawnPrefab('Cube'),
  camera: (store) => store.spawnCamera(),
  camera2d: (store) => store.spawnCamera2D(),
  sprite: (store) => store.spawnSpriteQuad(),
  animated_sprite: (store) => store.spawnAnimatedSprite2D(),
  line2d: (store) => store.spawnLine2D(),
  grid: (store) => store.spawnGrid(),
  tilemap: (store) => store.spawnTilemap(),
  spine_skeleton: (store) => store.spawnSpineSkeleton(),
  particle_3d: (store) => store.spawnParticleEmitter3D(),
  particle_2d: (store) => store.spawnParticleEmitter2D(),
  directional_light: (store) => store.spawnDirectionalLight(),
  point_light: (store) => store.spawnPointLight(),
  spot_light: (store) => store.spawnSpotLight(),
  environment_light: (store) => store.spawnEnvironmentLight(),
  global_light_2d: (store) => store.spawnLight2D('global'),
  point_light_2d: (store) => store.spawnLight2D('point'),
  audio_source: (store) => store.spawnAudioSource(),
  audio_listener: (store) => store.spawnAudioListener(),
  audio_mixer: (store) => store.spawnAudioMixer(),
  ui_canvas: (store) => store.spawnUiCanvas(),
  ui_image: (store) => store.spawnUiImage(),
  ui_raw_image: (store) => store.spawnUiRawImage(),
  ui_button: (store) => store.spawnUiButton(),
  ui_text: (store) => store.spawnUiText(),
  ui_toggle: (store) => store.spawnUiToggle(),
  ui_slider: (store) => store.spawnUiSlider(),
  ui_scrollbar: (store) => store.spawnUiScrollbar(),
  ui_progress_bar: (store) => store.spawnUiProgressBar(),
  ui_input_field: (store) => store.spawnUiInputField(),
  ui_dropdown: (store) => store.spawnUiDropdown(),
  ui_list_view: (store) => store.spawnUiListView(),
  ui_scroll_view: (store) => store.spawnUiScrollView(),
  ui_tab_view: (store) => store.spawnUiTabView(),
  ui_panel: (store) => store.spawnUiPanel(),
  ui_layout_group: (store) => store.spawnUiLayoutGroup(),
};

export const WRITE_COMMANDS: Record<string, CommandHandler> = {
  'batch.apply': (ctx, args) => {
    requireEditMode(ctx);
    const commands = worldCommandBatch(ctx, args);
    return {
      ok: true,
      data: applyWorldCommands(ctx, commands),
    };
  },
  'intent.apply': (ctx, args) => {
    requireEditMode(ctx);
    const validation = validateIntent(args.intent);
    if (!validation.ok) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Invalid intent: ${validation.errors.join('; ')}`,
      );
    }
    const intent = args.intent as Intent;
    if (intent.kind === 'SetTransform') {
      requireEntity(ctx, intent.entity);
      if (!ctx.store.getTransform(intent.entity)) {
        throw new BridgeError(
          'COMPONENT_NOT_FOUND',
          `Entity ${intent.entity} has no Transform component`,
        );
      }
    }
    let expanded: WorldCommand[];
    try {
      expanded = expandIntent(intent, {
        getTransform: (entity) => ctx.store.getTransform(entity),
      });
    } catch (error) {
      throw new BridgeError(
        'INVALID_ARGS',
        error instanceof Error ? error.message : 'Invalid intent',
      );
    }
    const commands = worldCommandBatch(ctx, { commands: expanded });
    return {
      ok: true,
      data: {
        intentKind: intent.kind,
        ...applyWorldCommands(ctx, commands),
      },
    };
  },

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
    if (!TYPED_ENTITY_KINDS.includes(kind as TypedEntityKind)) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Unknown kind "${kind}". Known kinds: ${Object.keys(KIND_SPAWNERS).join(', ')}`,
      );
    }
    const spawn = KIND_SPAWNERS[kind as TypedEntityKind];
    const id = captureSpawned(ctx, () => spawn(ctx.store));
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
  'entity.set_actives': (ctx, args) => {
    requireEditMode(ctx);
    const ids = nonEmptyEntityIdArray(args, 'ids');
    const active = bool(args, 'active');
    requireEntities(ctx, ids);
    const changed = ctx.store.setActives(ids, active);
    return { ok: true, data: { entities: ids, active, changed } };
  },
  'entity.set_tag': (ctx, args) => {
    requireEditMode(ctx);
    const id = entityId(args, 'id');
    const tag = str(args, 'tag');
    requireEntity(ctx, id);
    ctx.store.setTag(id, tag);
    return { ok: true, data: { entity: id, tag } };
  },
  'entity.set_tags': (ctx, args) => {
    requireEditMode(ctx);
    const ids = nonEmptyEntityIdArray(args, 'ids');
    const tag = str(args, 'tag');
    requireEntities(ctx, ids);
    const changed = ctx.store.setTags(ids, tag);
    return { ok: true, data: { entities: ids, tag, changed } };
  },
  'entity.set_layer': (ctx, args) => {
    requireEditMode(ctx);
    const id = entityId(args, 'id');
    const layer = entityId(args, 'layer');
    if (layer > 31) {
      throw new BridgeError('INVALID_ARGS', '"layer" must be an integer from 0 to 31');
    }
    requireEntity(ctx, id);
    ctx.store.setLayer(id, layer);
    return { ok: true, data: { entity: id, layer } };
  },
  'entity.set_layers': (ctx, args) => {
    requireEditMode(ctx);
    const ids = nonEmptyEntityIdArray(args, 'ids');
    const layer = entityId(args, 'layer');
    if (layer > 31) {
      throw new BridgeError('INVALID_ARGS', '"layer" must be an integer from 0 to 31');
    }
    requireEntities(ctx, ids);
    const changed = ctx.store.setLayers(ids, layer);
    return { ok: true, data: { entities: ids, layer, changed } };
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
  'entity.reorder': (ctx, args) => {
    requireEditMode(ctx);
    const id = entityId(args, 'id');
    const index = optionalIndex(args, 'index');
    const current = requireEntity(ctx, id);
    if (index === undefined) {
      throw new BridgeError('INVALID_ARGS', '"index" is required');
    }
    const siblings = ctx.store.snapshot().entities
      .filter((entity) => (entity.parent ?? null) === (current.parent ?? null))
      .sort((left, right) => (
        (left.siblingIndex ?? 0) - (right.siblingIndex ?? 0)
        || left.entity - right.entity
      ));
    const currentIndex = siblings.findIndex((entity) => entity.entity === id);
    const targetIndex = Math.min(index, Math.max(0, siblings.length - 1));
    if (currentIndex === targetIndex) {
      return {
        ok: true,
        data: {
          entity: id,
          parent: current.parent ?? null,
          siblingIndex: current.siblingIndex,
          changed: false,
        },
      };
    }
    if (!ctx.store.setParent([id], current.parent ?? null, targetIndex)) {
      throw new BridgeError('INVALID_ARGS', `Entity ${id} could not be reordered`);
    }
    const updated = requireEntity(ctx, id);
    return {
      ok: true,
      data: {
        entity: id,
        parent: updated.parent ?? null,
        siblingIndex: updated.siblingIndex,
        changed: true,
      },
    };
  },

  // ── Components ─────────────────────────────────────────────────────────
  'component.add': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    const type = str(args, 'type');
    requireEntity(ctx, entity);
    const value = args.value === undefined
      ? createComponentDefaults(type)
      : record(args, 'value');
    if (!value) {
      throw new BridgeError(
        'COMPONENT_NOT_FOUND',
        `Unknown component type "${type}"; provide an explicit value for a custom component`,
      );
    }
    const added = ctx.store.addComponent(entity, type, value);
    if (!added) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Entity ${entity} already has component "${type}" or it cannot be added`,
      );
    }
    return { ok: true, data: { entity, component: type } };
  },
  'component.add_many': (ctx, args) => {
    requireEditMode(ctx);
    const entities = nonEmptyEntityIdArray(args, 'entities');
    const type = str(args, 'type');
    requireEntities(ctx, entities, 'entities');
    const records = entities.map((entity) => requireEntity(ctx, entity));
    const existing = records
      .filter((entity) => entity.components[type] != null)
      .map((entity) => entity.entity);
    if (existing.length) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Component "${type}" already exists on entities: ${existing.join(', ')}`,
      );
    }
    const value = args.value === undefined
      ? createComponentDefaults(type)
      : record(args, 'value');
    if (!value) {
      throw new BridgeError(
        'COMPONENT_NOT_FOUND',
        `Unknown component type "${type}"; provide an explicit value for a custom component`,
      );
    }
    const changed = ctx.store.addComponents(entities, type, value);
    if (changed !== entities.length) {
      throw new BridgeError(
        'INTERNAL',
        `The editor added "${type}" to ${changed} of ${entities.length} entities`,
      );
    }
    return { ok: true, data: { entities, component: type, changed } };
  },
  'component.remove': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    const type = str(args, 'type');
    requireRemovableComponent(ctx, entity, type);
    const removed = ctx.store.removeComponent(entity, type);
    if (!removed) {
      throw new BridgeError('INTERNAL', `The editor did not remove component "${type}"`);
    }
    return { ok: true, data: { entity, component: type } };
  },
  'component.remove_many': (ctx, args) => {
    requireEditMode(ctx);
    const entities = nonEmptyEntityIdArray(args, 'entities');
    const type = str(args, 'type');
    for (const entity of entities) {
      requireRemovableComponent(ctx, entity, type);
    }
    const changed = ctx.store.removeComponents(entities, type);
    if (changed !== entities.length) {
      throw new BridgeError(
        'INTERNAL',
        `The editor removed "${type}" from ${changed} of ${entities.length} entities`,
      );
    }
    return { ok: true, data: { entities, component: type, changed } };
  },
  'component.set': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    const type = str(args, 'type');
    requireComponent(ctx, entity, type);
    ctx.store.setComponent(entity, type, record(args, 'value'));
    return { ok: true, data: { entity, component: type } };
  },
  'component.set_many': (ctx, args) => {
    requireEditMode(ctx);
    const entities = nonEmptyEntityIdArray(args, 'entities');
    const type = str(args, 'type');
    for (const entity of entities) requireComponent(ctx, entity, type);
    const value = record(args, 'value');
    const changed = ctx.store.setComponents(
      type,
      entities.map((entity) => ({ entity, value })),
    );
    if (!changed) {
      throw new BridgeError('INTERNAL', `The editor did not replace component "${type}"`);
    }
    return {
      ok: true,
      data: { entities, component: type, changed: entities.length },
    };
  },
  'component.patch': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    const type = str(args, 'type');
    requireComponent(ctx, entity, type);
    ctx.store.patchComponent(entity, type, record(args, 'patch'));
    return { ok: true, data: { entity, component: type } };
  },
  'component.patch_many': (ctx, args) => {
    requireEditMode(ctx);
    const entities = nonEmptyEntityIdArray(args, 'entities');
    const type = str(args, 'type');
    for (const entity of entities) requireComponent(ctx, entity, type);
    const patch = record(args, 'patch');
    const changed = ctx.store.patchComponents(
      type,
      entities.map((entity) => ({ entity, patch })),
    );
    if (!changed) {
      throw new BridgeError('INTERNAL', `The editor did not patch component "${type}"`);
    }
    return {
      ok: true,
      data: { entities, component: type, changed: entities.length },
    };
  },
  'component.invoke': (ctx, args) => {
    const entity = entityId(args, 'entity');
    const type = str(args, 'type');
    const method = str(args, 'method');
    requireComponent(ctx, entity, type);
    const behaviour = getBehaviour(type);
    if (!behaviour) {
      throw new BridgeError(
        'COMPONENT_NOT_FOUND',
        `Component "${type}" is not an invokable Behaviour`,
      );
    }
    if (!behaviour.methods.some((candidate) => candidate.key === method)) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Behaviour "${type}" has no registered method "${method}"`,
      );
    }
    ctx.store.invokeBehaviourMethod(entity, type, method);
    const value = requireComponent(ctx, entity, type);
    return {
      ok: true,
      data: {
        entity,
        component: type,
        method,
        value: structuredClone(value),
      },
    };
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
  'transform.translate': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    requireEntity(ctx, entity);
    const current = ctx.store.getTransform(entity);
    if (!current) {
      throw new BridgeError('COMPONENT_NOT_FOUND', `Entity ${entity} has no Transform component`);
    }
    const delta = finiteTuple(args, 'delta', 3);
    if (!delta) throw new BridgeError('INVALID_ARGS', '"delta" is required');
    const position = current.position.map((value, index) => value + delta[index]);
    if (position.some((value) => !Number.isFinite(value))) {
      throw new BridgeError('INVALID_ARGS', 'Translated position must remain finite');
    }
    const next = {
      ...current,
      position: position as [number, number, number],
    };
    ctx.store.setTransform(entity, next);
    return { ok: true, data: { entity, delta, transform: next } };
  },
  'rect.set': (ctx, args) => {
    requireEditMode(ctx);
    const entity = entityId(args, 'entity');
    const current = readRectTransform(requireComponent(ctx, entity, 'RectTransform'));
    const anchoredPosition = finiteTuple(args, 'anchoredPosition', 2);
    const sizeDelta = finiteTuple(args, 'sizeDelta', 2);
    const pivot = finiteTuple(args, 'pivot', 2);
    const anchorMin = finiteTuple(args, 'anchorMin', 2);
    const anchorMax = finiteTuple(args, 'anchorMax', 2);
    const localRotation = optionalFiniteNumber(args, 'localRotation');
    const localScale = finiteTuple(args, 'localScale', 2);
    if (
      !anchoredPosition
      && !sizeDelta
      && !pivot
      && !anchorMin
      && !anchorMax
      && localRotation === undefined
      && !localScale
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        'rect.set requires at least one RectTransform field',
      );
    }
    const requireUnitTuple = (value: number[] | undefined, key: string): void => {
      if (value?.some((item) => item < 0 || item > 1)) {
        throw new BridgeError('INVALID_ARGS', `"${key}" values must be between 0 and 1`);
      }
    };
    requireUnitTuple(pivot, 'pivot');
    requireUnitTuple(anchorMin, 'anchorMin');
    requireUnitTuple(anchorMax, 'anchorMax');
    const nextAnchorMin = (anchorMin ?? current.anchor_min) as [number, number];
    const nextAnchorMax = (anchorMax ?? current.anchor_max) as [number, number];
    if (
      nextAnchorMin[0] > nextAnchorMax[0]
      || nextAnchorMin[1] > nextAnchorMax[1]
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"anchorMin" must not exceed "anchorMax" on either axis',
      );
    }
    const next = {
      ...current,
      ...(anchoredPosition
        ? { anchored_position: anchoredPosition as [number, number] }
        : {}),
      ...(sizeDelta ? { size_delta: sizeDelta as [number, number] } : {}),
      ...(pivot ? { pivot: pivot as [number, number] } : {}),
      ...(anchorMin ? { anchor_min: nextAnchorMin } : {}),
      ...(anchorMax ? { anchor_max: nextAnchorMax } : {}),
      ...(localRotation === undefined ? {} : { local_rotation: localRotation }),
      ...(localScale ? { local_scale: localScale as [number, number] } : {}),
    };
    ctx.store.setComponent(entity, 'RectTransform', next);
    return { ok: true, data: { entity, rectTransform: structuredClone(next) } };
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
  'playback.step': (ctx, args) => {
    if (ctx.store.mode !== 'pause') {
      throw new BridgeError('READONLY', 'Single-frame stepping requires paused Play Mode');
    }
    const deltaTime = args.deltaTime ?? 1 / 60;
    if (
      typeof deltaTime !== 'number'
      || !Number.isFinite(deltaTime)
      || deltaTime <= 0
      || deltaTime > 1
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"deltaTime" must be a finite number greater than 0 and at most 1 second',
      );
    }
    if (!ctx.store.step(deltaTime)) {
      throw new BridgeError('READONLY', 'Single-frame stepping requires paused Play Mode');
    }
    return {
      ok: true,
      data: {
        mode: ctx.store.mode,
        frame: ctx.store.snapshot().frame,
        deltaTime,
      },
    };
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
    return { ok: true, data: { sceneCamera: ctx.store.sceneCamera } };
  },
  'view.set_camera': (ctx, args) => {
    const yaw = optionalFiniteNumber(args, 'yaw');
    const pitch = optionalFiniteNumber(args, 'pitch');
    const distance = optionalFiniteNumber(args, 'distance');
    const pivot = finiteTuple(args, 'pivot', 3);
    if (
      yaw === undefined
      && pitch === undefined
      && distance === undefined
      && pivot === undefined
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        'view.set_camera requires at least one of "yaw", "pitch", "distance", or "pivot"',
      );
    }
    ctx.store.setSceneCamera({
      ...(yaw === undefined ? {} : { yaw }),
      ...(pitch === undefined ? {} : { pitch }),
      ...(distance === undefined ? {} : { distance }),
      ...(pivot === undefined
        ? {}
        : { pivot: pivot as [number, number, number] }),
    });
    return { ok: true, data: { sceneCamera: ctx.store.sceneCamera } };
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
export interface CommandSummary {
  id: string;
  category: string;
  description: string;
  readOnly: boolean;
}

export interface CommandMeta extends CommandSummary {
  paramsSchema: AgentJsonSchema;
}

const COMMAND_SUMMARIES: CommandSummary[] = [
  { id: 'batch.apply', category: 'batch', description: 'Validate and apply up to 256 WorldCommands as one undo transaction', readOnly: false },
  { id: 'intent.apply', category: 'intent', description: 'Validate, expand, and atomically apply one supported high-level intent', readOnly: false },
  { id: 'dialog.respond', category: 'dialog', description: 'Accept or cancel the exact active non-blocking editor dialog', readOnly: false },
  { id: 'console.clear', category: 'console', description: 'Clear structured logs and the visible Console panel as one background-safe write', readOnly: false },
  { id: 'profiler.clear', category: 'profiler', description: 'Clear Scene and Game editor-profiler samples across all editor windows', readOnly: false },
  { id: 'project.open', category: 'project', description: 'Open a project from the welcome page without a dialog', readOnly: false },
  { id: 'project.create', category: 'project', description: 'Create and open a project from the welcome page without a dialog', readOnly: false },
  { id: 'project.close', category: 'project', description: 'Close the active project and return to the project hub', readOnly: false },
  { id: 'project.forget_recent', category: 'project', description: 'Remove a path from the recent-project list', readOnly: false },
  { id: 'project.settings.set_sorting_layers', category: 'project', description: 'Revision-safely replace the ordered project sorting layers', readOnly: false },
  { id: 'project.settings.set_tags_and_layers', category: 'project', description: 'Revision-safely replace project tags and named GameObject layers', readOnly: false },
  { id: 'scene.new', category: 'scene', description: 'Create and save a named scene without opening a dialog', readOnly: false },
  { id: 'scene.open', category: 'scene', description: 'Open a named scene without opening a dialog', readOnly: false },
  { id: 'scene.save', category: 'scene', description: 'Save the current scene, optionally under a new name', readOnly: false },
  { id: 'scene.save_all', category: 'scene', description: 'Save the scene and every open resource document', readOnly: false },
  { id: 'workspace.save_document', category: 'workspace', description: 'Save exactly one open resource document by path without saving other drafts', readOnly: false },
  { id: 'workspace.discard_document', category: 'workspace', description: 'Discard exactly one open dirty resource draft by path without changing its file or other drafts', readOnly: false },
  { id: 'workspace.reload_document', category: 'workspace', description: 'Discard one exact draft if needed and reload that resource document from disk', readOnly: false },
  { id: 'workspace.close_document', category: 'workspace', description: 'Close exactly one open resource document with an explicit dirty-document policy', readOnly: false },
  { id: 'scene.load_json', category: 'scene', description: 'Atomically replace the current authored scene world from validated JSON', readOnly: false },
  { id: 'scene.rename', category: 'scene', description: 'Rename a scene asset while preserving its identity and build references', readOnly: false },
  { id: 'scene.delete', category: 'scene', description: 'Permanently delete a scene after revalidating an exact preview token', readOnly: false },
  { id: 'asset.import_file', category: 'asset', description: 'Import one external local file to an exact unused project asset path', readOnly: false },
  { id: 'asset.create', category: 'asset', description: 'Create a default authored resource without opening or focusing its editor', readOnly: false },
  { id: 'asset.instantiate', category: 'asset', description: 'Instantiate an indexed prefab, model, or sprite asset as one scene entity transaction', readOnly: false },
  { id: 'prefab.create', category: 'prefab', description: 'Create and link a new prefab asset from an authored entity hierarchy', readOnly: false },
  { id: 'prefab.apply', category: 'prefab', description: 'Revision-safely apply an instance hierarchy to its prefab asset', readOnly: false },
  { id: 'prefab.revert', category: 'prefab', description: 'Revert an instance hierarchy from an exact prefab asset revision', readOnly: false },
  { id: 'prefab.unpack', category: 'prefab', description: 'Remove prefab linkage while preserving the authored hierarchy', readOnly: false },
  { id: 'asset.open', category: 'asset', description: 'Open a supported resource asset only in a hidden, unfocused editor host', readOnly: false },
  { id: 'asset.write_text', category: 'asset', description: 'Create or revision-safely update a UTF-8 text asset', readOnly: false },
  { id: 'sprite.import_settings.set', category: 'asset', description: 'Apply normalized Sprite Editor settings with an exact sidecar revision guard', readOnly: false },
  { id: 'asset.rename', category: 'asset', description: 'Apply a previewed reference-aware asset rename', readOnly: false },
  { id: 'asset.duplicate', category: 'asset', description: 'Apply a previewed asset duplicate with a new GUID', readOnly: false },
  { id: 'asset.trash', category: 'asset', description: 'Move an unreferenced previewed asset to project Trash', readOnly: false },
  { id: 'asset.restore', category: 'asset', description: 'Restore an exact project Trash entry revision', readOnly: false },
  { id: 'build.settings.set_scenes', category: 'build', description: 'Revision-safely set the exact ordered enabled scene list in Build Settings', readOnly: false },
  { id: 'build.settings.set_asset_policy', category: 'build', description: 'Revision-safely set Build Settings content inclusion and shader variant policy', readOnly: false },
  { id: 'build.start', category: 'build', description: 'Start an asynchronous PC Player build', readOnly: false },
  { id: 'build.cancel', category: 'build', description: 'Request cancellation of the active AgentBridge build', readOnly: false },
  { id: 'build.verify', category: 'build', description: 'Verify a published Player and packaged content without opening a window', readOnly: false },
  { id: 'build.run', category: 'build', description: 'Launch a validated published Player after explicit foreground acknowledgement', readOnly: false },
  { id: 'build.history.create_patch', category: 'build', description: 'Start signed patch creation between two archived build artifacts', readOnly: false },
  { id: 'build.history.restore', category: 'build', description: 'Start trusted verification and atomic publication of one archived build', readOnly: false },
  { id: 'build.patch.verify', category: 'build', description: 'Start trusted verification of a signed build patch against an archived base', readOnly: false },
  { id: 'selection.set', category: 'selection', description: 'Set the selection to the given entity ids', readOnly: false },
  { id: 'selection.reveal', category: 'selection', description: 'Select an entity and expand its ancestors (ping)', readOnly: false },
  { id: 'entity.create', category: 'entity', description: 'Create a GameObject with optional components and parent', readOnly: false },
  { id: 'entity.create_typed', category: 'entity', description: 'Create any built-in GameObject kind with composite parent handling', readOnly: false },
  { id: 'entity.delete', category: 'entity', description: 'Delete the given (or currently selected) entities', readOnly: false },
  { id: 'entity.duplicate', category: 'entity', description: 'Duplicate the given (or currently selected) entities', readOnly: false },
  { id: 'entity.rename', category: 'entity', description: 'Rename an entity', readOnly: false },
  { id: 'entity.set_active', category: 'entity', description: 'Enable or disable an entity', readOnly: false },
  { id: 'entity.set_actives', category: 'entity', description: 'Enable or disable entities as one undo transaction', readOnly: false },
  { id: 'entity.set_tag', category: 'entity', description: 'Set an entity classification tag', readOnly: false },
  { id: 'entity.set_tags', category: 'entity', description: 'Set one classification tag on entities as one undo transaction', readOnly: false },
  { id: 'entity.set_layer', category: 'entity', description: 'Set an entity GameObject layer index', readOnly: false },
  { id: 'entity.set_layers', category: 'entity', description: 'Set one GameObject layer on entities as one undo transaction', readOnly: false },
  { id: 'entity.reparent', category: 'entity', description: 'Reparent entities under a new parent', readOnly: false },
  { id: 'entity.reorder', category: 'entity', description: 'Move an entity to a sibling index under its current parent', readOnly: false },
  { id: 'component.add', category: 'component', description: 'Add a component to an entity, using catalog defaults when value is omitted', readOnly: false },
  { id: 'component.add_many', category: 'component', description: 'Add one component to entities as one undo transaction', readOnly: false },
  { id: 'component.remove', category: 'component', description: 'Remove a component from an entity', readOnly: false },
  { id: 'component.remove_many', category: 'component', description: 'Remove one shared component from entities as one undo transaction', readOnly: false },
  { id: 'component.set', category: 'component', description: 'Replace a component value on an entity', readOnly: false },
  { id: 'component.set_many', category: 'component', description: 'Replace one shared component on entities as one undo transaction', readOnly: false },
  { id: 'component.patch', category: 'component', description: 'Shallow-merge fields into a component on an entity', readOnly: false },
  { id: 'component.patch_many', category: 'component', description: 'Shallow-merge fields into one shared component on entities as one undo transaction', readOnly: false },
  { id: 'component.invoke', category: 'component', description: 'Invoke one registered Behaviour method on an entity', readOnly: false },
  { id: 'transform.set', category: 'transform', description: 'Set position/rotation/scale on an entity transform', readOnly: false },
  { id: 'transform.translate', category: 'transform', description: 'Translate an entity by a local-position delta', readOnly: false },
  { id: 'rect.set', category: 'rect', description: 'Set exact RectTransform fields while preserving omitted values', readOnly: false },
  { id: 'playback.play', category: 'playback', description: 'Enter play mode', readOnly: false },
  { id: 'playback.pause', category: 'playback', description: 'Toggle pause', readOnly: false },
  { id: 'playback.stop', category: 'playback', description: 'Stop playback and return to edit mode', readOnly: false },
  { id: 'playback.step', category: 'playback', description: 'Advance paused Play Mode by one deterministic step', readOnly: false },
  { id: 'history.undo', category: 'history', description: 'Undo the last edit', readOnly: false },
  { id: 'history.redo', category: 'history', description: 'Redo the last undone edit', readOnly: false },
  { id: 'gizmo.set', category: 'view', description: 'Set the active transform gizmo (translate/rotate/scale/rect)', readOnly: false },
  { id: 'view.frame_selected', category: 'view', description: 'Frame the selected object in the scene view', readOnly: false },
  { id: 'view.set_camera', category: 'view', description: 'Set the background-safe Scene view orbit camera', readOnly: false },
  { id: 'view.set_game_resolution', category: 'view', description: 'Persist an exact Game View resolution or Free Aspect', readOnly: false },
  { id: 'view.set_scene_preferences', category: 'view', description: 'Persist Scene 2D, grid, smart-guide, and snapping preferences across editor windows', readOnly: false },
  { id: 'view.set_timeline_preferences', category: 'view', description: 'Persist Animation Timeline and Sequencer editing preferences across editor windows', readOnly: false },
  { id: 'panel.focus', category: 'panel', description: 'Activate a panel only when its host mutation cannot disturb a foreground window', readOnly: false },
  { id: 'panel.detach', category: 'panel', description: 'Detach a clean panel only while the main workspace is hidden and unfocused', readOnly: false },
  { id: 'panel.dock', category: 'panel', description: 'Dock a clean panel only while both affected windows are hidden and unfocused', readOnly: false },
  { id: 'panel.reset_layout', category: 'panel', description: 'Reset layout only while every affected panel host is hidden and unfocused', readOnly: false },
  { id: 'menu.invoke', category: 'menu', description: 'Invoke a registered Unity-style menu item by exact path', readOnly: false },
  { id: 'window.close', category: 'window', description: 'Close one exact hidden, unfocused auxiliary editor window created by this Agent session', readOnly: false },
  { id: 'window.open_editor', category: 'window', description: 'Open or safely reuse one hidden, unfocused registered auxiliary editor window', readOnly: false },
  { id: 'window.ui_click', category: 'window', description: 'Click a semantic UI element with optional modifiers inside a hidden, unfocused editor window', readOnly: false },
  { id: 'window.ui_double_click', category: 'window', description: 'Double-click a semantic UI element with optional modifiers inside a hidden, unfocused editor window', readOnly: false },
  { id: 'window.ui_context_click', category: 'window', description: 'Open a semantic context menu with optional modifiers inside a hidden, unfocused editor window', readOnly: false },
  { id: 'window.ui_set_value', category: 'window', description: 'Set an input value inside a hidden, unfocused editor window', readOnly: false },
  { id: 'window.ui_scroll', category: 'window', description: 'Dispatch a precise semantic wheel gesture inside a hidden, unfocused editor window', readOnly: false },
  { id: 'window.ui_drag_to', category: 'window', description: 'Drag one semantic UI element to another with optional modifiers inside a hidden, unfocused editor window', readOnly: false },
  { id: 'window.ui_drag_by', category: 'window', description: 'Perform a bounded pointer drag with optional modifiers inside a hidden, unfocused editor WebView', readOnly: false },
  { id: 'window.ui_hover', category: 'window', description: 'Hover one semantic UI element inside a hidden, unfocused editor window', readOnly: false },
  { id: 'window.ui_press_key', category: 'window', description: 'Press an allow-listed semantic key with optional modifiers inside a hidden, unfocused editor window', readOnly: false },
];

export const COMMAND_META: CommandMeta[] = COMMAND_SUMMARIES.map((summary) => {
  const paramsSchema = COMMAND_PARAMS_SCHEMAS[summary.id];
  if (!paramsSchema) {
    throw new Error(`Agent command "${summary.id}" is missing its params schema`);
  }
  return { ...summary, paramsSchema };
});
