export type EditorUndoToken = { readonly id: number };

export type EditorUndoCheckpoint = {
  readonly undo: readonly EditorUndoEntry[];
  readonly redo: readonly EditorUndoEntry[];
};

export type EditorUndoSnapshot<T> = {
  scope: string;
  label: string;
  state: T;
  capture: () => T;
  restore: (state: T) => void;
};

type EditorUndoEntry = {
  id: number;
  scope: string;
  label: string;
  state: unknown;
  capture: () => unknown;
  restore: (state: unknown) => void;
};

export type EditorUndoService = ReturnType<typeof createEditorUndoService>;

function normalizedLabel(label: string): string {
  const value = label.trim();
  return value || 'Editor Change';
}

export function createEditorUndoService(limit = 128) {
  const capacity = Number.isInteger(limit) && limit > 0 ? limit : 128;
  let nextId = 1;
  let revision = 0;
  let restoring = false;
  let undoStack: EditorUndoEntry[] = [];
  let redoStack: EditorUndoEntry[] = [];
  const listeners = new Set<() => void>();

  const notify = () => {
    revision += 1;
    for (const listener of listeners) {
      try {
        listener();
      } catch (reason) {
        console.error('[EditorUndoService] history listener failed', reason);
      }
    }
  };

  const trim = (stack: EditorUndoEntry[]) => {
    if (stack.length > capacity) stack.splice(0, stack.length - capacity);
  };

  const recordSnapshot = <T>(snapshot: EditorUndoSnapshot<T>): EditorUndoToken => {
    if (restoring) throw new Error('Cannot record a new editor transaction while history is restoring.');
    const entry: EditorUndoEntry = {
      id: nextId++,
      scope: snapshot.scope.trim() || 'editor',
      label: normalizedLabel(snapshot.label),
      state: snapshot.state,
      capture: snapshot.capture,
      restore: snapshot.restore as (state: unknown) => void,
    };
    undoStack.push(entry);
    trim(undoStack);
    redoStack = [];
    notify();
    return { id: entry.id };
  };

  const restoreFrom = (source: EditorUndoEntry[], destination: EditorUndoEntry[]): boolean => {
    if (restoring) throw new Error('Editor history restore is already in progress.');
    const entry = source.at(-1);
    if (!entry) return false;
    const current = entry.capture();
    restoring = true;
    try {
      entry.restore(entry.state);
    } finally {
      restoring = false;
    }
    source.pop();
    destination.push({ ...entry, state: current });
    trim(destination);
    notify();
    return true;
  };

  return {
    recordSnapshot,
    undo() {
      return restoreFrom(undoStack, redoStack);
    },
    redo() {
      return restoreFrom(redoStack, undoStack);
    },
    clear(scope?: string) {
      if (restoring) throw new Error('Cannot clear editor history while it is restoring.');
      const previousUndo = undoStack.length;
      const previousRedo = redoStack.length;
      if (scope == null) {
        undoStack = [];
        redoStack = [];
      } else {
        undoStack = undoStack.filter((entry) => entry.scope !== scope);
        redoStack = redoStack.filter((entry) => entry.scope !== scope);
      }
      if (undoStack.length !== previousUndo || redoStack.length !== previousRedo) notify();
    },
    checkpoint(): EditorUndoCheckpoint {
      return { undo: [...undoStack], redo: [...redoStack] };
    },
    restoreCheckpoint(checkpoint: EditorUndoCheckpoint) {
      if (restoring) throw new Error('Cannot restore an editor history checkpoint while history is restoring.');
      undoStack = [...checkpoint.undo];
      redoStack = [...checkpoint.redo];
      trim(undoStack);
      trim(redoStack);
      notify();
    },
    isUndoTop(token: EditorUndoToken) {
      return undoStack.at(-1)?.id === token.id;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get revision() {
      return revision;
    },
    get isRestoring() {
      return restoring;
    },
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    get undoLabel() {
      return undoStack.at(-1)?.label ?? null;
    },
    get redoLabel() {
      return redoStack.at(-1)?.label ?? null;
    },
    get undoDepth() {
      return undoStack.length;
    },
    get redoDepth() {
      return redoStack.length;
    },
  };
}
