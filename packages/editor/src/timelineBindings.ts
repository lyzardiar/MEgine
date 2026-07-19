export const MAX_TIMELINE_BINDINGS = 256;

export type TimelineEntityBinding = {
  entity: string;
  name: string;
  missing?: boolean;
};

export type TimelineBindingTable = {
  version: 1;
  bindings: Record<string, TimelineEntityBinding>;
};

export type TimelineBindingEntity = {
  entity: number;
  name?: string | null;
};

export type TimelineBindingResolution =
  | { status: 'legacy' }
  | { status: 'bound'; binding: TimelineEntityBinding; entity: TimelineBindingEntity }
  | { status: 'stale'; binding: TimelineEntityBinding };

function object(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function normalizeTimelineBindingTarget(raw: string): string {
  const normalized = raw.trim().replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/')) throw new Error('Timeline binding target must be a descendant path');
  if (normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Timeline binding target cannot contain empty, . or .. segments');
  }
  return normalized;
}

function normalizeEntityId(value: unknown): string {
  const raw = typeof value === 'number'
    ? (Number.isSafeInteger(value) && value >= 0 ? String(value) : '')
    : String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) throw new Error(`Timeline binding entity '${raw}' is not an unsigned decimal id`);
  const entity = BigInt(raw);
  if (entity > 0xffff_ffff_ffff_ffffn || (entity & 0xffff_ffffn) === 0xffff_ffffn) {
    throw new Error(`Timeline binding entity '${raw}' is invalid`);
  }
  return entity.toString();
}

export function parseTimelineBindingTable(raw: unknown): TimelineBindingTable {
  const value = typeof raw === 'string'
    ? (raw.trim() ? JSON.parse(raw) : {})
    : raw ?? {};
  const table = object(value, 'Timeline binding table');
  const version = Number(table.version ?? 1);
  if (version !== 1) throw new Error(`unsupported Timeline binding table version ${version}`);
  const source = object(table.bindings ?? {}, 'Timeline bindings');
  const entries = Object.entries(source);
  if (entries.length > MAX_TIMELINE_BINDINGS) {
    throw new Error(`Timeline binding table exceeds ${MAX_TIMELINE_BINDINGS} entries`);
  }
  const bindings: Record<string, TimelineEntityBinding> = Object.create(null) as Record<string, TimelineEntityBinding>;
  for (const [rawTarget, rawBinding] of entries) {
    const target = normalizeTimelineBindingTarget(rawTarget);
    if (Object.hasOwn(bindings, target)) throw new Error(`Timeline binding target '${target}' is duplicated`);
    const binding = object(rawBinding, `Timeline binding '${target}'`);
    bindings[target] = {
      entity: normalizeEntityId(binding.entity),
      name: String(binding.name ?? '').trim().slice(0, 256),
      ...(binding.missing === true ? { missing: true } : {}),
    };
  }
  return { version: 1, bindings };
}

export function serializeTimelineBindingTable(table: TimelineBindingTable): string {
  return JSON.stringify(parseTimelineBindingTable(table));
}

export function setTimelineBinding(
  raw: unknown,
  target: string,
  entity: TimelineBindingEntity,
): string {
  const table = parseTimelineBindingTable(raw);
  const key = normalizeTimelineBindingTarget(target);
  table.bindings[key] = {
    entity: normalizeEntityId(entity.entity),
    name: String(entity.name ?? '').trim().slice(0, 256),
  };
  if (Object.keys(table.bindings).length > MAX_TIMELINE_BINDINGS) {
    throw new Error(`Timeline binding table exceeds ${MAX_TIMELINE_BINDINGS} entries`);
  }
  return serializeTimelineBindingTable(table);
}

export function clearTimelineBinding(raw: unknown, target: string): string {
  const table = parseTimelineBindingTable(raw);
  delete table.bindings[normalizeTimelineBindingTarget(target)];
  return serializeTimelineBindingTable(table);
}

export function moveTimelineBinding(raw: unknown, fromTarget: string, toTarget: string): string {
  const table = parseTimelineBindingTable(raw);
  const from = normalizeTimelineBindingTarget(fromTarget);
  const to = normalizeTimelineBindingTarget(toTarget);
  if (from === to || !Object.hasOwn(table.bindings, from)) return serializeTimelineBindingTable(table);
  if (Object.hasOwn(table.bindings, to)) throw new Error(`Timeline binding target '${to}' already exists`);
  table.bindings[to] = table.bindings[from];
  delete table.bindings[from];
  return serializeTimelineBindingTable(table);
}

export function resolveTimelineBinding(
  raw: unknown,
  target: string,
  entities: readonly TimelineBindingEntity[],
): TimelineBindingResolution {
  const table = parseTimelineBindingTable(raw);
  const binding = table.bindings[normalizeTimelineBindingTarget(target)];
  if (!binding) return { status: 'legacy' };
  const entity = binding.missing
    ? undefined
    : entities.find((candidate) => String(candidate.entity) === binding.entity);
  return entity ? { status: 'bound', binding, entity } : { status: 'stale', binding };
}

export function resetTimelineBindingsOnAssetChange(
  current: unknown,
  next: Record<string, unknown>,
): Record<string, unknown> {
  if (!Object.hasOwn(next, 'asset')) return next;
  const currentAsset = current != null && typeof current === 'object' && !Array.isArray(current)
    ? String((current as { asset?: unknown }).asset ?? '')
    : '';
  return String(next.asset ?? '') === currentAsset
    ? next
    : { ...next, bindings_json: '{}' };
}
