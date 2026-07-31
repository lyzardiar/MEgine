import { BridgeError } from './protocol.ts';
import { CURRENT_SCENE_VERSION, LEGACY_SCENE_VERSION } from '../sceneMigration.ts';

const MAX_SCENE_JSON_BYTES = 8 * 1024 * 1024;
const MAX_SCENE_ENTITIES = 20_000;
const MAX_COMPONENTS_PER_ENTITY = 256;

export type AgentSceneJsonSummary = {
  version: typeof LEGACY_SCENE_VERSION | typeof CURRENT_SCENE_VERSION;
  name: string | null;
  entityCount: number;
  rootCount: number;
  componentCount: number;
};

export function validateAgentSceneJson(json: string): AgentSceneJsonSummary {
  if (new TextEncoder().encode(json).byteLength > MAX_SCENE_JSON_BYTES) {
    throw new BridgeError(
      'INVALID_ARGS',
      `Scene JSON exceeds the ${MAX_SCENE_JSON_BYTES / (1024 * 1024)} MiB limit`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw invalid(`Scene JSON is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const document = plainRecord(parsed, 'Scene JSON root');
  if (document.version !== LEGACY_SCENE_VERSION && document.version !== CURRENT_SCENE_VERSION) {
    throw invalid(`Scene JSON "version" must be ${LEGACY_SCENE_VERSION} or ${CURRENT_SCENE_VERSION}`);
  }
  if (document.name !== undefined && document.name !== null && typeof document.name !== 'string') {
    throw invalid('Scene JSON "name" must be a string or null');
  }
  const world = plainRecord(document.world, 'Scene JSON "world"');
  if (!Array.isArray(world.entities)) {
    throw invalid('Scene JSON "world.entities" must be an array');
  }
  if (world.entities.length > MAX_SCENE_ENTITIES) {
    throw invalid(`Scene JSON cannot contain more than ${MAX_SCENE_ENTITIES} entities`);
  }

  const ids = new Set<number>();
  const parents = new Map<number, number | null>();
  const siblingSlots = new Set<string>();
  let rootCount = 0;
  let componentCount = 0;
  world.entities.forEach((candidate, index) => {
    const entity = plainRecord(candidate, `world.entities[${index}]`);
    const id = safeEntityId(entity.entity, `world.entities[${index}].entity`);
    if (ids.has(id)) throw invalid(`Duplicate entity id ${id}`);
    ids.add(id);

    if (entity.name !== undefined && entity.name !== null && typeof entity.name !== 'string') {
      throw invalid(`world.entities[${index}].name must be a string or null`);
    }
    if (entity.active !== undefined && typeof entity.active !== 'boolean') {
      throw invalid(`world.entities[${index}].active must be a boolean`);
    }
    const parent = entity.parent === undefined || entity.parent === null
      ? null
      : safeEntityId(entity.parent, `world.entities[${index}].parent`);
    if (parent === id) throw invalid(`Entity ${id} cannot parent itself`);
    parents.set(id, parent);
    if (parent === null) rootCount += 1;

    const siblingIndex = entity.siblingIndex === undefined
      ? index
      : safeEntityId(
        entity.siblingIndex,
        `world.entities[${index}].siblingIndex`,
      );
    const slot = `${parent ?? 'root'}:${siblingIndex}`;
    if (siblingSlots.has(slot)) {
      throw invalid(
        `Entities under parent ${parent ?? 'root'} have duplicate effective siblingIndex ${siblingIndex}`,
      );
    }
    siblingSlots.add(slot);

    const components = plainRecord(
      entity.components,
      `world.entities[${index}].components`,
    );
    const entries = Object.entries(components);
    if (entries.length > MAX_COMPONENTS_PER_ENTITY) {
      throw invalid(
        `Entity ${id} cannot contain more than ${MAX_COMPONENTS_PER_ENTITY} components`,
      );
    }
    for (const [type, value] of entries) {
      if (!type.trim()) throw invalid(`Entity ${id} has an empty component type`);
      plainRecord(value, `Entity ${id} component "${type}"`);
    }
    componentCount += entries.length;
  });

  for (const [id, parent] of parents) {
    if (parent !== null && !ids.has(parent)) {
      throw invalid(`Entity ${id} references missing parent ${parent}`);
    }
  }
  assertAcyclicParents(parents);
  validateSelection(world, ids);
  if (world.clearColor !== undefined) {
    finiteTuple(world.clearColor, 4, 'world.clearColor', { minimum: 0, maximum: 1 });
  }

  return {
    version: document.version,
    name: typeof document.name === 'string' ? document.name : null,
    entityCount: ids.size,
    rootCount,
    componentCount,
  };
}

function validateSelection(world: Record<string, unknown>, ids: ReadonlySet<number>): void {
  if (world.selected !== undefined && world.selected !== null) {
    const selected = safeEntityId(world.selected, 'world.selected');
    if (!ids.has(selected)) throw invalid(`world.selected references missing entity ${selected}`);
  }
  if (world.selectedIds === undefined) return;
  if (!Array.isArray(world.selectedIds)) {
    throw invalid('world.selectedIds must be an array');
  }
  const seen = new Set<number>();
  world.selectedIds.forEach((candidate, index) => {
    const id = safeEntityId(candidate, `world.selectedIds[${index}]`);
    if (!ids.has(id)) throw invalid(`world.selectedIds references missing entity ${id}`);
    if (seen.has(id)) throw invalid(`world.selectedIds contains duplicate entity ${id}`);
    seen.add(id);
  });
}

function assertAcyclicParents(parents: ReadonlyMap<number, number | null>): void {
  const complete = new Set<number>();
  for (const id of parents.keys()) {
    if (complete.has(id)) continue;
    const path = new Set<number>();
    let current: number | null = id;
    while (current !== null) {
      if (path.has(current)) throw invalid(`Scene hierarchy contains a cycle at entity ${current}`);
      if (complete.has(current)) break;
      path.add(current);
      current = parents.get(current) ?? null;
    }
    for (const visited of path) complete.add(visited);
  }
}

function safeEntityId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalid(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function finiteTuple(
  value: unknown,
  length: number,
  label: string,
  bounds: { minimum?: number; maximum?: number } = {},
): number[] {
  if (
    !Array.isArray(value)
    || value.length !== length
    || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    throw invalid(`${label} must contain exactly ${length} finite numbers`);
  }
  const numbers = value as number[];
  if (bounds.minimum !== undefined && numbers.some((item) => item < bounds.minimum!)) {
    throw invalid(`${label} values must be at least ${bounds.minimum}`);
  }
  if (bounds.maximum !== undefined && numbers.some((item) => item > bounds.maximum!)) {
    throw invalid(`${label} values must be at most ${bounds.maximum}`);
  }
  return numbers;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw invalid(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function invalid(message: string): BridgeError {
  return new BridgeError('INVALID_ARGS', message);
}
