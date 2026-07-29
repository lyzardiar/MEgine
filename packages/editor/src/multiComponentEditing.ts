export type MultiComponentEntity = {
  entity: number;
  components: Record<string, unknown>;
};

export type MultiComponentFieldState = {
  fields: string[];
  mixedFields: Set<string>;
  mixedArrayIndices: Record<string, boolean[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function inspectorValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => inspectorValuesEqual(value, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => (
        key === rightKeys[index]
        && inspectorValuesEqual(left[key], right[key])
      ));
  }
  return false;
}

function componentValue(
  entity: MultiComponentEntity,
  type: string,
): Record<string, unknown> {
  const value = entity.components[type];
  return isRecord(value) ? value : {};
}

export function inspectMultiComponentFields(
  entities: readonly MultiComponentEntity[],
  type: string,
): MultiComponentFieldState {
  const values = entities.map((entity) => componentValue(entity, type));
  const fields = [...new Set(
    values.flatMap((value) => Object.keys(value).filter((key) => !key.startsWith('__'))),
  )];
  const mixedFields = new Set(fields.filter((field) => (
    values.some((value) => !inspectorValuesEqual(value[field], values[0]?.[field]))
  )));
  const mixedArrayIndices: Record<string, boolean[]> = {};
  for (const field of fields) {
    const arrays = values.map((value) => value[field]);
    if (
      arrays.length > 0
      && arrays.every((value) => (
        Array.isArray(value)
        && value.length === (arrays[0] as unknown[]).length
      ))
    ) {
      mixedArrayIndices[field] = (arrays[0] as unknown[]).map((_, index) => (
        arrays.some((value) => (
          !inspectorValuesEqual(
            (value as unknown[])[index],
            (arrays[0] as unknown[])[index],
          )
        ))
      ));
    }
  }
  return { fields, mixedFields, mixedArrayIndices };
}

function applyEditedValue(current: unknown, before: unknown, after: unknown): unknown {
  if (inspectorValuesEqual(before, after)) return structuredClone(current);
  if (
    Array.isArray(current)
    && Array.isArray(before)
    && Array.isArray(after)
    && current.length === before.length
    && before.length === after.length
  ) {
    return after.map((value, index) => (
      applyEditedValue(current[index], before[index], value)
    ));
  }
  if (isRecord(current) && isRecord(before) && isRecord(after)) {
    const result = structuredClone(current);
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (inspectorValuesEqual(before[key], after[key])) continue;
      if (!Object.hasOwn(after, key)) {
        delete result[key];
      } else {
        result[key] = applyEditedValue(current[key], before[key], after[key]);
      }
    }
    return result;
  }
  return structuredClone(after);
}

function applyEditedPath(
  current: unknown,
  after: unknown,
  path: readonly (string | number)[],
): unknown {
  if (!path.length) return structuredClone(after);
  const [segment, ...rest] = path;
  if (typeof segment === 'number') {
    const result = Array.isArray(current) ? structuredClone(current) : [];
    result[segment] = applyEditedPath(result[segment], (after as unknown[])?.[segment], rest);
    return result;
  }
  const result = isRecord(current) ? structuredClone(current) : {};
  result[segment] = applyEditedPath(result[segment], (after as Record<string, unknown>)?.[segment], rest);
  return result;
}

export function planMultiComponentEdit(
  entities: readonly MultiComponentEntity[],
  type: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  editedPath?: readonly (string | number)[],
): Array<{ entity: number; patch: Record<string, unknown> }> {
  const explicitlyEditedField = typeof editedPath?.[0] === 'string'
    ? editedPath[0]
    : null;
  const changedFields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((field) => (
      !field.startsWith('__')
      && (
        field === explicitlyEditedField
        || !inspectorValuesEqual(before[field], after[field])
      )
    ));
  if (!changedFields.length) return [];
  return entities.map((entity) => {
    const current = componentValue(entity, type);
    const patch: Record<string, unknown> = {};
    for (const field of changedFields) {
      const explicitTail = field === explicitlyEditedField
        ? editedPath!.slice(1)
        : null;
      patch[field] = explicitTail?.length
        ? applyEditedPath(current[field], after[field], explicitTail)
        : inspectorValuesEqual(before[field], after[field])
          ? structuredClone(after[field])
          : applyEditedValue(current[field], before[field], after[field]);
    }
    return { entity: entity.entity, patch };
  });
}
