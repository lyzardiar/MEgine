export const ENTITY_REFERENCE_TOKEN = '$mengine_entity_ref';
export const ENTITY_REFERENCE_FIELDS_KEY = '__mengine_entity_reference_fields';

export type PrefabEntityReferenceToken = {
  [ENTITY_REFERENCE_TOKEN]:
    | { kind: 'prefab_node'; node: string }
    | { kind: 'missing'; entity: string };
};

export type SerializedEntityReference = {
  entity: number | null;
  missing: string | null;
};

/**
 * Component object fields that contain Unity-style persistent calls.
 * Keeping this registry centralized makes clone, Prefab, and scene rebuild paths agree.
 */
export const COMPONENT_ENTITY_REFERENCE_FIELDS = [
  ['Button', 'on_click'],
  ['Toggle', 'on_value_changed'],
  ['Slider', 'on_value_changed'],
  ['Scrollbar', 'on_value_changed'],
  ['InputField', 'on_value_changed'],
  ['InputField', 'on_submit'],
  ['Dropdown', 'on_value_changed'],
  ['ListView', 'on_value_changed'],
  ['ScrollView', 'on_value_changed'],
  ['TabView', 'on_value_changed'],
] as const;

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function decimalEntity(value: unknown): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null;
  const normalized = BigInt(value.trim());
  return normalized <= 0xffff_ffff_ffff_ffffn ? normalized.toString() : null;
}

function token(value: unknown): PrefabEntityReferenceToken[typeof ENTITY_REFERENCE_TOKEN] | null {
  const wrapper = object(value);
  const raw = object(wrapper?.[ENTITY_REFERENCE_TOKEN]);
  if (raw?.kind === 'prefab_node' && typeof raw.node === 'string' && raw.node.trim()) {
    return { kind: 'prefab_node', node: raw.node.trim() };
  }
  const entity = raw?.kind === 'missing' ? decimalEntity(raw.entity) : null;
  return entity == null ? null : { kind: 'missing', entity };
}

function targetSlots(
  components: Record<string, unknown>,
  componentName: string,
  fieldName: string,
): Record<string, unknown>[] {
  const component = object(components[componentName]);
  const field = component?.[fieldName];
  if (Array.isArray(field)) return field.map(object).filter((entry) => entry != null);
  const call = object(field);
  return call ? [call] : [];
}

function rewriteTargets(
  components: Record<string, unknown>,
  rewrite: (target: unknown) => unknown,
): void {
  for (const [component, field] of COMPONENT_ENTITY_REFERENCE_FIELDS) {
    for (const call of targetSlots(components, component, field)) {
      if (!Object.hasOwn(call, 'target') || call.target == null) continue;
      call.target = rewrite(call.target);
    }
  }
  for (const value of Object.values(components)) {
    const component = object(value);
    if (!component || !Array.isArray(component[ENTITY_REFERENCE_FIELDS_KEY])) continue;
    const fields = component[ENTITY_REFERENCE_FIELDS_KEY]
      .filter((field): field is string => typeof field === 'string' && field.length > 0);
    for (const field of fields) {
      if (!Object.hasOwn(component, field) || component[field] == null) continue;
      component[field] = rewrite(component[field]);
    }
  }
}

export function parseSerializedEntityReference(value: unknown): SerializedEntityReference {
  const entity = decimalEntity(value);
  if (entity != null) {
    const numeric = Number(entity);
    return Number.isSafeInteger(numeric)
      ? { entity: numeric, missing: null }
      : { entity: null, missing: entity };
  }
  const reference = token(value);
  if (reference?.kind === 'missing') return { entity: null, missing: reference.entity };
  if (reference?.kind === 'prefab_node') {
    return { entity: null, missing: `Prefab node ${reference.node}` };
  }
  return { entity: null, missing: null };
}

/** Remap only references whose source entity participates in a clone operation. */
export function remapComponentEntityReferences(
  source: Record<string, unknown>,
  entityMap: ReadonlyMap<number, number>,
): Record<string, unknown> {
  const components = structuredClone(source);
  rewriteTargets(components, (target) => {
    const entity = decimalEntity(target);
    if (entity == null) return target;
    const numeric = Number(entity);
    return Number.isSafeInteger(numeric) && entityMap.has(numeric)
      ? entityMap.get(numeric)!
      : target;
  });
  return components;
}

/** Convert live scene ids to stable Prefab node ids before writing a reusable asset. */
export function localizePrefabEntityReferences(
  source: Record<string, unknown>,
  entityToNode: ReadonlyMap<number, string>,
): Record<string, unknown> {
  const components = structuredClone(source);
  rewriteTargets(components, (target) => {
    if (token(target)) return target;
    const entity = decimalEntity(target);
    if (entity == null) return target;
    const numeric = Number(entity);
    const node = Number.isSafeInteger(numeric) ? entityToNode.get(numeric) : undefined;
    return node
      ? { [ENTITY_REFERENCE_TOKEN]: { kind: 'prefab_node', node } }
      : { [ENTITY_REFERENCE_TOKEN]: { kind: 'missing', entity } };
  });
  return components;
}

/** Resolve stable Prefab node references after all instance entities have been allocated. */
export function resolvePrefabEntityReferences(
  source: Record<string, unknown>,
  nodeToEntity: ReadonlyMap<string, number>,
): Record<string, unknown> {
  const components = structuredClone(source);
  rewriteTargets(components, (target) => {
    const reference = token(target);
    if (reference?.kind === 'prefab_node') {
      const entity = nodeToEntity.get(reference.node);
      return entity ?? {
        [ENTITY_REFERENCE_TOKEN]: { kind: 'missing', entity: '0' },
      };
    }
    if (reference?.kind === 'missing' || target == null) return target;
    const legacyEntity = decimalEntity(target);
    return legacyEntity == null
      ? target
      : { [ENTITY_REFERENCE_TOKEN]: { kind: 'missing', entity: legacyEntity } };
  });
  return components;
}

export function validatePrefabEntityReferences(
  components: Record<string, unknown>,
  nodeIds: ReadonlySet<string>,
): void {
  const validate = (target: unknown, label: string) => {
    const reference = token(target);
    const wrapper = object(target);
    if (wrapper && Object.hasOwn(wrapper, ENTITY_REFERENCE_TOKEN) && !reference) {
      throw new Error(`${label} contains an invalid serialized entity reference`);
    }
    if (reference?.kind === 'prefab_node' && !nodeIds.has(reference.node)) {
      throw new Error(`${label} references missing prefab node '${reference.node}'`);
    }
  };
  for (const [component, field] of COMPONENT_ENTITY_REFERENCE_FIELDS) {
    for (const call of targetSlots(components, component, field)) {
      if (!Object.hasOwn(call, 'target') || call.target == null) continue;
      validate(call.target, `${component}.${field}`);
    }
  }
  for (const [componentName, value] of Object.entries(components)) {
    const component = object(value);
    if (!component || !Object.hasOwn(component, ENTITY_REFERENCE_FIELDS_KEY)) continue;
    const rawFields = component[ENTITY_REFERENCE_FIELDS_KEY];
    if (!Array.isArray(rawFields) || rawFields.length > 256) {
      throw new Error(`${componentName}.${ENTITY_REFERENCE_FIELDS_KEY} must be an array of at most 256 fields`);
    }
    for (const field of rawFields) {
      if (typeof field !== 'string' || !field || field === ENTITY_REFERENCE_FIELDS_KEY) {
        throw new Error(`${componentName}.${ENTITY_REFERENCE_FIELDS_KEY} contains an invalid field`);
      }
      if (component[field] == null) continue;
      validate(component[field], `${componentName}.${field}`);
    }
  }
}
