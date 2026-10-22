export type UndoEntity = { entity: number };

export type EditorUndoState<T extends UndoEntity> = {
  entities: T[];
  selectedIds: number[];
  selectionAnchor: number | null;
  nextId: number;
  clearColor: [number, number, number, number];
};

export function captureEditorUndoState<T extends UndoEntity>(
  entities: T[],
  selectedIds: number[],
  selectionAnchor: number | null,
  nextId: number,
  clearColor: [number, number, number, number],
  previous?: EditorUndoState<T> | null,
): EditorUndoState<T> {
  // History owns these snapshots. Live and restored records never share their mutable data.
  const previousEntities = new Map(previous?.entities.map(entity => [entity.entity, entity]));
  return {
    entities: entities.map(entity => {
      const retained = previousEntities.get(entity.entity);
      return retained && undoValuesEqual(entity, retained) ? retained : structuredClone(entity);
    }),
    selectedIds: [...selectedIds],
    selectionAnchor,
    nextId,
    clearColor: [...clearColor],
  };
}

export function restoreEditorUndoState<T extends UndoEntity>(
  state: EditorUndoState<T>,
): EditorUndoState<T> {
  const entities = structuredClone(state.entities);
  const available = new Set(entities.map((entity) => entity.entity));
  const selectedIds = state.selectedIds.filter((id, index, ids) =>
    available.has(id) && ids.indexOf(id) === index,
  );
  const selectionAnchor = state.selectionAnchor != null && available.has(state.selectionAnchor)
    ? state.selectionAnchor
    : selectedIds[selectedIds.length - 1] ?? null;
  const minimumNextId = Math.max(1, ...entities.map((entity) => entity.entity + 1));
  return {
    entities,
    selectedIds,
    selectionAnchor,
    nextId: Math.max(minimumNextId, state.nextId),
    clearColor: [...state.clearColor],
  };
}

function undoValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => undoValuesEqual(value, right[index]));
  }
  // Scene records are plain data. Other structured-clone types must get their own copy.
  if (Object.getPrototypeOf(left) !== Object.prototype || Object.getPrototypeOf(right) !== Object.prototype) return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(rightRecord, key)
    && undoValuesEqual(leftRecord[key], rightRecord[key]),
  );
}

export function editorUndoStatesEqual<T extends UndoEntity>(
  left: EditorUndoState<T>,
  right: EditorUndoState<T>,
): boolean {
  return undoValuesEqual(left, right);
}
