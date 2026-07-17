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
): EditorUndoState<T> {
  return {
    entities: structuredClone(entities),
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
