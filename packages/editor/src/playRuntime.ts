// Author: MiYu. Native Play lifecycle, delta validation and immutable publication.
import { invoke } from '@tauri-apps/api/core';
import type { WorldSnapshotView } from '@mengine/api';
import { toWorldSnapshotView, type HostWorldSnapshot } from './transport/editorTransport';
import { retainPlayWorld, type RetainedPlayWorld } from './playWorldSync';

export type PlayInput = {
  keys: string[]; pressedKeys: string[]; releasedKeys: string[];
  pointer: [number, number]; pointerDelta?: [number, number]; pointerLocked?: boolean; viewport: [number, number];
  buttons: number[]; pressedButtons: number[]; releasedButtons: number[];
};

export const emptyPlayInput = (): PlayInput => ({ keys: [], pressedKeys: [], releasedKeys: [], pointer: [0, 0], pointerDelta: [0, 0], pointerLocked: false, viewport: [1, 1], buttons: [], pressedButtons: [], releasedButtons: [] });

export type PlayRuntimeWorld = WorldSnapshotView & { nativeSessionId?: number; nativeRevision?: number };
const nativePublications = new WeakSet<object>();
export function retainedNativePlayWorld(world: PlayRuntimeWorld): RetainedPlayWorld | undefined { return nativePublications.has(world) ? world as RetainedPlayWorld : undefined; }

function publishNativeWorld(world: PlayRuntimeWorld, previous?: PlayRuntimeWorld): PlayRuntimeWorld {
  const owned = retainPlayWorld(world, previous && retainedNativePlayWorld(previous));
  nativePublications.add(owned);
  return owned;
}

export type PlayRuntimeDriver = {
  readonly retainsWorld?: boolean;
  readonly sessionId?: number | null;
  readonly quitRequested?: boolean;
  start(snapshot: WorldSnapshotView): Promise<PlayRuntimeWorld | void>;
  step(snapshot: WorldSnapshotView | undefined, input: PlayInput, dt: number): Promise<PlayRuntimeWorld>;
  stop(): void;
  onError(error: unknown): void;
};

export type PlayWorldUpdate = {
  snapshot: HostWorldSnapshot;
  /** MiYu: absent when the native entity set and order are unchanged. Resets always include it. */
  entityOrder?: number[];
  baseRevision: number;
  revision: number;
  reset: boolean;
  quitRequested?: boolean;
};

export function applyPlayWorldUpdate(previous: WorldSnapshotView, revision: number, update: PlayWorldUpdate): WorldSnapshotView {
  if (update.baseRevision !== revision || update.revision !== revision + 1) throw new Error('Play snapshot revision mismatch');
  if (update.reset && update.entityOrder === undefined) throw new Error('Invalid Play snapshot entity order');
  const changed = toWorldSnapshotView(update.snapshot);
  const entities = new Map((update.reset ? [] : previous.entities).map(entity => [entity.entity, entity]));
  for (const entity of changed.entities) {
    if (update.entityOrder === undefined && !entities.has(entity.entity)) throw new Error('Invalid Play snapshot entity order');
    entities.set(entity.entity, entity);
  }
  const seen = new Set<number>();
  return { ...changed, entities: (update.entityOrder ?? previous.entities.map(entity => entity.entity)).map(id => {
    const entity = entities.get(id);
    if (!entity || seen.has(id)) throw new Error('Invalid Play snapshot entity order');
    seen.add(id);
    return entity;
  }) };
}

/** MiYu: reuse validated entity indices while preserving direct live-world edits and reset semantics. */
export function createPlayWorldUpdater() {
  let ids: number[] | null = null;
  let indices = new Map<number, number>();
  return (previous: WorldSnapshotView, revision: number, update: PlayWorldUpdate): WorldSnapshotView => {
    if (update.baseRevision !== revision || update.revision !== revision + 1) throw new Error('Play snapshot revision mismatch');
    let stable = !update.reset && ids !== null && ids.length === previous.entities.length && (update.entityOrder === undefined || ids.length === update.entityOrder.length);
    if (stable) for (let i = 0; i < ids!.length; i++) if (previous.entities[i].entity !== ids![i] || update.entityOrder !== undefined && update.entityOrder[i] !== ids![i]) { stable = false; break; }
    if (stable) {
      const changed = toWorldSnapshotView(update.snapshot), entities = previous.entities.slice();
      for (const entity of changed.entities) {
        const index = indices.get(entity.entity);
        if (index === undefined && update.entityOrder === undefined) throw new Error('Invalid Play snapshot entity order');
        if (index !== undefined) entities[index] = entity;
      }
      return { ...changed, entities };
    }
    const result = applyPlayWorldUpdate(previous, revision, update);
    ids = result.entities.map(entity => entity.entity);
    indices = new Map(ids.map((id, index) => [id, index]));
    return result;
  };
}

export function createNativePlayRuntime(onError: PlayRuntimeDriver['onError']): PlayRuntimeDriver {
  let sessionId: number | null = null;
  let generation = 0;
  let world: PlayRuntimeWorld | null = null;
  let revision = 0;
  let backendSessionId: number | null = null;
  let lifecycle: Promise<void> = Promise.resolve();
  let quitRequested = false;
  let applyUpdate = createPlayWorldUpdater();
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
      if (result && current === generation) { sessionId = result.sessionId; revision = 0; world = publishNativeWorld({ ...toWorldSnapshotView(result.snapshot), nativeSessionId: result.sessionId, nativeRevision: 0 }); applyUpdate = createPlayWorldUpdater(); return world; }
    },
    async step(snapshot, input, dt) {
      if (sessionId === null || world === null) throw new Error('Play Mode is initializing');
      const current = generation;
      const update = await invoke<PlayWorldUpdate>('step_editor_play', { sessionId, snapshot, input, dt });
      if (current !== generation || world === null) throw new Error('Play session expired');
      world = publishNativeWorld({ ...applyUpdate(world, revision, update), nativeSessionId: sessionId, nativeRevision: update.revision }, world);
      revision = update.revision;
      quitRequested = update.quitRequested === true;
      return world;
    },
    stop() {
      quitRequested = false;
      generation++; sessionId = null; world = null; revision = 0;
      applyUpdate = createPlayWorldUpdater();
      lifecycle = lifecycle.then(async () => {
        const stopped = backendSessionId;
        backendSessionId = null;
        if (stopped !== null) await invoke('stop_editor_play', { sessionId: stopped });
      }).catch(onError);
    },
    onError,
  };
}
