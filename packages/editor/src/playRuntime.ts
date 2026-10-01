import { invoke } from '@tauri-apps/api/core';
import type { WorldSnapshotView } from '@mengine/api';
import { toWorldSnapshotView, type HostWorldSnapshot } from './transport/editorTransport';

export type PlayInput = {
  keys: string[]; pressedKeys: string[]; releasedKeys: string[];
  pointer: [number, number]; pointerDelta?: [number, number]; pointerLocked?: boolean; viewport: [number, number];
  buttons: number[]; pressedButtons: number[]; releasedButtons: number[];
};

export const emptyPlayInput = (): PlayInput => ({ keys: [], pressedKeys: [], releasedKeys: [], pointer: [0, 0], pointerDelta: [0, 0], pointerLocked: false, viewport: [1, 1], buttons: [], pressedButtons: [], releasedButtons: [] });

export type PlayRuntimeDriver = {
  readonly retainsWorld?: boolean;
  readonly sessionId?: number | null;
  readonly quitRequested?: boolean;
  start(snapshot: WorldSnapshotView): Promise<WorldSnapshotView | void>;
  step(snapshot: WorldSnapshotView | undefined, input: PlayInput, dt: number): Promise<WorldSnapshotView>;
  stop(): void;
  onError(error: unknown): void;
};

export type PlayWorldUpdate = {
  snapshot: HostWorldSnapshot;
  entityOrder: number[];
  baseRevision: number;
  revision: number;
  reset: boolean;
  quitRequested?: boolean;
};

export function applyPlayWorldUpdate(previous: WorldSnapshotView, revision: number, update: PlayWorldUpdate): WorldSnapshotView {
  if (update.baseRevision !== revision || update.revision !== revision + 1) throw new Error('Play snapshot revision mismatch');
  const changed = toWorldSnapshotView(update.snapshot);
  const entities = new Map((update.reset ? [] : previous.entities).map(entity => [entity.entity, entity]));
  for (const entity of changed.entities) entities.set(entity.entity, entity);
  const seen = new Set<number>();
  return { ...changed, entities: update.entityOrder.map(id => {
    const entity = entities.get(id);
    if (!entity || seen.has(id)) throw new Error('Invalid Play snapshot entity order');
    seen.add(id);
    return entity;
  }) };
}

export function createNativePlayRuntime(onError: PlayRuntimeDriver['onError']): PlayRuntimeDriver {
  let sessionId: number | null = null;
  let generation = 0;
  let world: WorldSnapshotView | null = null;
  let revision = 0;
  let backendSessionId: number | null = null;
  let lifecycle: Promise<void> = Promise.resolve();
  let quitRequested = false;
  return {
    retainsWorld: true,
    get sessionId() { return sessionId; },
    get quitRequested() { return quitRequested; },
    async start(snapshot) {
      quitRequested = false;
      const current = ++generation;
      const starting = lifecycle.then(async () => {
        if (current !== generation) return;
        const result = await invoke<{ sessionId: number; snapshot: HostWorldSnapshot }>('start_editor_play', { snapshot });
        backendSessionId = result.sessionId;
        return result;
      });
      lifecycle = starting.then(() => {}, () => {});
      const result = await starting;
      if (result && current === generation) { sessionId = result.sessionId; revision = 0; world = toWorldSnapshotView(result.snapshot); return world; }
    },
    async step(snapshot, input, dt) {
      if (sessionId === null || world === null) throw new Error('Play Mode is initializing');
      const current = generation;
      const update = await invoke<PlayWorldUpdate>('step_editor_play', { sessionId, snapshot, input, dt });
      if (current !== generation || world === null) throw new Error('Play session expired');
      world = applyPlayWorldUpdate(world, revision, update);
      revision = update.revision;
      quitRequested = update.quitRequested === true;
      return world;
    },
    stop() {
      quitRequested = false;
      generation++; sessionId = null; world = null; revision = 0;
      lifecycle = lifecycle.then(async () => {
        const stopped = backendSessionId;
        backendSessionId = null;
        if (stopped !== null) await invoke('stop_editor_play', { sessionId: stopped });
      }).catch(onError);
    },
    onError,
  };
}
