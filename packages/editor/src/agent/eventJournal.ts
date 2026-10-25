// Author: MiYu. Editor event cursors and scene changes, including immutable Play record signatures.
import { isRetainedPlayRecord, isRetainedPlayWorld, retainedPlayWorldChanges, type RetainedPlayWorld } from '../playWorldSync.ts';

const nativeStringify = JSON.stringify, arrayIterator = Array.prototype[Symbol.iterator];
const nativeSerialization = [nativeStringify, arrayIterator].every(fn => Function.prototype.toString.call(fn).includes('[native code]'));
function ordinarySerialization(): boolean { return nativeSerialization && JSON.stringify === nativeStringify && Array.prototype[Symbol.iterator] === arrayIterator && !('toJSON' in Object.prototype) && !('toJSON' in Array.prototype); }

export const AGENT_EVENT_TOPICS = [
  'scene.changed',
  'selection.changed',
  'mode.changed',
  'dialog.changed',
  'log.added',
  'log.cleared',
  'panel.changed',
  'workspace.changed',
  'window.changed',
  'window.types.changed',
  'menu.changed',
  'view.changed',
  'build.progress',
  'build.artifacts',
  'build.settings',
  'project.settings',
  'asset.changed',
  'project.changed',
] as const;

export const MAX_AGENT_EVENT_WAITERS = 64;

export type AgentEventTopic = (typeof AGENT_EVENT_TOPICS)[number];

export type AgentEvent = {
  sequence: number;
  topic: AgentEventTopic;
  time: number;
  data: unknown;
};

export type AgentEventPage = {
  afterSequence: number;
  currentSequence: number;
  nextSequence: number;
  oldestSequence: number;
  truncated: boolean;
  hasMore: boolean;
  events: AgentEvent[];
};

export type AgentEventWaitPage = AgentEventPage & {
  timedOut: boolean;
  waitedMs: number;
};

export class AgentEventJournal {
  private readonly events: AgentEvent[] = [];
  private readonly waiters = new Set<() => void>();
  private nextSequence = 1;
  private readonly capacity: number;

  constructor(capacity = 512) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error('Agent event journal capacity must be a positive safe integer');
    }
    this.capacity = capacity;
  }

  get currentSequence(): number {
    return this.nextSequence - 1;
  }

  append(topic: AgentEventTopic, data: unknown, time = Date.now()): AgentEvent {
    const event: AgentEvent = {
      sequence: this.nextSequence,
      topic,
      time,
      data: clone(data),
    };
    this.nextSequence += 1;
    this.events.push(event);
    if (this.events.length > this.capacity) {
      this.events.splice(0, this.events.length - this.capacity);
    }
    for (const waiter of [...this.waiters]) waiter();
    return clone(event);
  }

  list(options: {
    afterSequence?: number;
    topics?: readonly AgentEventTopic[];
    limit?: number;
  } = {}): AgentEventPage {
    const afterSequence = options.afterSequence ?? 0;
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) {
      throw new Error('afterSequence must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error('limit must be a positive safe integer');
    }
    const topics = options.topics?.length ? new Set(options.topics) : null;
    const oldestSequence = this.events[0]?.sequence ?? this.nextSequence;
    const matching = this.events.filter((event) => (
      event.sequence > afterSequence
      && (!topics || topics.has(event.topic))
    ));
    const page = matching.slice(0, limit);
    const hasMore = matching.length > page.length;
    return {
      afterSequence,
      currentSequence: this.currentSequence,
      nextSequence: hasMore
        ? page.at(-1)?.sequence ?? afterSequence
        : this.currentSequence,
      oldestSequence,
      truncated: afterSequence < oldestSequence - 1,
      hasMore,
      events: clone(page),
    };
  }

  wait(
    options: {
      afterSequence?: number;
      topics?: readonly AgentEventTopic[];
      limit?: number;
    } = {},
    timeoutMs = 15_000,
    signal?: AbortSignal,
  ): Promise<AgentEventWaitPage> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 15_000) {
      throw new Error('timeoutMs must be an integer from 0 to 15000');
    }
    if (signal?.aborted) {
      return Promise.reject(eventWaitAbortError());
    }
    const startedAt = Date.now();
    const initial = this.list(options);
    if (initial.truncated || initial.events.length > 0 || timeoutMs === 0) {
      return Promise.resolve({
        ...initial,
        timedOut: initial.events.length === 0 && !initial.truncated,
        waitedMs: 0,
      });
    }
    if (this.waiters.size >= MAX_AGENT_EVENT_WAITERS) {
      throw new Error('Agent event wait limit reached');
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        this.waiters.delete(wake);
        if (timer !== null) clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
      };
      const finish = (page: AgentEventPage, timedOut: boolean) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({
          ...page,
          timedOut,
          waitedMs: Math.max(0, Date.now() - startedAt),
        });
      };
      const cancel = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(eventWaitAbortError());
      };
      const wake = () => {
        const page = this.list(options);
        if (page.truncated || page.events.length > 0) finish(page, false);
      };
      this.waiters.add(wake);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      timer = setTimeout(
        () => finish(this.list(options), true),
        timeoutMs,
      );
    });
  }
}

function eventWaitAbortError(): Error {
  const error = new Error('Agent event wait cancelled');
  error.name = 'AbortError';
  return error;
}

export type SceneEntityView = {
  entity: number;
  [key: string]: unknown;
};

export type SceneStateView = Record<string, unknown>;

export type SceneDelta = {
  previousRevision: number;
  revision: number;
  sceneName: string | null;
  resetRequired: boolean;
  sceneStateChanged: boolean;
  added: number[];
  removed: number[];
  changed: number[];
};

export type SceneDiff = {
  fromRevision: number;
  toRevision: number;
  resetRequired: boolean;
  sceneStateChanged: boolean;
  sceneState: SceneStateView | null;
  added: number[];
  removed: number[];
  changed: number[];
  entities: SceneEntityView[];
};

export class SceneChangeTracker {
  private revisionValue = 0;
  private sceneName: string | null = null;
  private sceneStateSignature = '';
  private entities = new Map<number, string>();
  private immutableSignatures = new WeakMap<SceneEntityView, string>();
  private retainedWorld: WeakRef<RetainedPlayWorld> | undefined;
  private retainedEntities: RetainedPlayWorld['entities'] | undefined;
  private readonly deltas: SceneDelta[] = [];
  private readonly capacity: number;

  constructor(capacity = 256) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new Error('Scene change tracker capacity must be a positive safe integer');
    }
    this.capacity = capacity;
  }

  get revision(): number {
    return this.revisionValue;
  }

  reset(): void {
    this.revisionValue = 0;
    this.sceneName = null;
    this.sceneStateSignature = '';
    this.entities.clear();
    this.immutableSignatures = new WeakMap();
    this.retainedWorld = undefined;
    this.retainedEntities = undefined;
    this.deltas.splice(0);
  }

  observe(
    sceneName: string | null,
    entities: readonly SceneEntityView[],
    sceneState: SceneStateView = {},
    owned?: RetainedPlayWorld,
  ): SceneDelta | null {
    const retained = owned && isRetainedPlayWorld(owned) && (owned.entities as readonly unknown[]) === entities && ordinarySerialization() ? owned : undefined;
    const previousWorld = retained ? this.retainedWorld?.deref() : undefined;
    let indices = previousWorld && retained ? previousWorld.entities === retained.entities ? [] : retainedPlayWorldChanges(previousWorld, retained) : undefined;
    const previousEntities = this.retainedEntities;
    if (!indices && retained && previousEntities?.length === entities.length) {
      // Observations can skip simulation versions; retain one frozen pointer list, never a world chain.
      const changedIndices: number[] = [];
      let stable = true;
      for (let i = 0; i < entities.length; i++) {
        if ((previousEntities[i] as object) === entities[i]) continue;
        if (previousEntities[i].entity !== entities[i].entity || changedIndices.length >= entities.length / 2) { stable = false; break; }
        changedIndices.push(i);
      }
      if (stable) indices = changedIndices;
    }
    let sparse = indices && indices.length <= entities.length / 2;
    const baseline = this.entities, observedRevision = this.revisionValue, signatures = this.immutableSignatures;
    let current: Map<number, string>;
    if (sparse && indices) {
      const records: SceneEntityView[] = [];
      for (const index of indices) records.push(entities[index]);
      current = entitySignatures(records, this.immutableSignatures);
    } else current = entitySignatures(entities, this.immutableSignatures);
    const currentSceneStateSignature = JSON.stringify(clone(sceneState));
    if (sparse && (this.entities !== baseline || this.revisionValue !== observedRevision)) {
      // A state getter may reenter/reset this tracker; restore the complete pre-getter signatures.
      current = new Map();
      for (const entity of entities) current.set(entity.entity, signatures.get(entity)!);
      sparse = false;
    }
    // MiYu: state getters can install serialization hooks; only ordinary completed observations certify reuse.
    const nextRetained = retained && ordinarySerialization() ? new WeakRef(retained) : undefined;
    const nextEntities = nextRetained ? retained!.entities : undefined;
    if (this.revisionValue === 0) {
      this.revisionValue = 1;
      this.sceneName = sceneName;
      this.sceneStateSignature = currentSceneStateSignature;
      this.entities = current;
      this.retainedWorld = nextRetained;
      this.retainedEntities = nextEntities;
      return this.pushDelta({
        previousRevision: 0,
        revision: 1,
        sceneName,
        resetRequired: true,
        sceneStateChanged: true,
        added: [],
        removed: [],
        changed: [],
      });
    }

    const sceneChanged = sceneName !== this.sceneName;
    const sceneStateChanged = (
      sceneChanged
      || currentSceneStateSignature !== this.sceneStateSignature
    );
    const added: number[] = [];
    const removed: number[] = [];
    const changed: number[] = [];
    if (!sceneChanged) {
      for (const [id, record] of current) {
        const previous = this.entities.get(id);
        if (!previous) added.push(id);
        else if (previous !== record) changed.push(id);
      }
      if (!sparse) for (const id of this.entities.keys()) if (!current.has(id)) removed.push(id);
    }
    if (
      !sceneChanged
      && !sceneStateChanged
      && !added.length
      && !removed.length
      && !changed.length
    ) { this.retainedWorld = nextRetained; this.retainedEntities = nextEntities; return null; }

    const previousRevision = this.revisionValue;
    this.revisionValue += 1;
    this.sceneName = sceneName;
    this.sceneStateSignature = currentSceneStateSignature;
    if (sparse) for (const [id, signature] of current) this.entities.set(id, signature);
    else this.entities = current;
    this.retainedWorld = nextRetained;
    this.retainedEntities = nextEntities;
    return this.pushDelta({
      previousRevision,
      revision: this.revisionValue,
      sceneName,
      resetRequired: sceneChanged,
      sceneStateChanged,
      added: added.sort(numberOrder),
      removed: removed.sort(numberOrder),
      changed: changed.sort(numberOrder),
    });
  }

  diff(
    fromRevision: number,
    currentEntities: readonly SceneEntityView[],
    currentSceneState: SceneStateView = {},
  ): SceneDiff {
    if (
      !Number.isSafeInteger(fromRevision)
      || fromRevision < 0
      || fromRevision > this.revisionValue
    ) {
      throw new Error(`fromRevision must be between 0 and ${this.revisionValue}`);
    }
    if (fromRevision === this.revisionValue) {
      return emptySceneDiff(fromRevision, this.revisionValue);
    }
    const deltas = this.deltas.filter((delta) => delta.revision > fromRevision);
    if (
      !deltas.length
      || deltas[0].previousRevision !== fromRevision
      || deltas.some((delta) => delta.resetRequired)
    ) {
      return {
        ...emptySceneDiff(fromRevision, this.revisionValue),
        resetRequired: true,
        sceneStateChanged: true,
        sceneState: clone(currentSceneState),
        entities: clone([...currentEntities]),
      };
    }

    const states = new Map<number, 'added' | 'removed' | 'changed'>();
    for (const delta of deltas) {
      for (const id of delta.added) {
        states.set(id, states.get(id) === 'removed' ? 'changed' : 'added');
      }
      for (const id of delta.changed) {
        if (states.get(id) !== 'added') states.set(id, 'changed');
      }
      for (const id of delta.removed) {
        if (states.get(id) === 'added') states.delete(id);
        else states.set(id, 'removed');
      }
    }
    const added = idsWithState(states, 'added');
    const removed = idsWithState(states, 'removed');
    const changed = idsWithState(states, 'changed');
    const sceneStateChanged = deltas.some((delta) => delta.sceneStateChanged);
    const included = new Set([...added, ...changed]);
    return {
      fromRevision,
      toRevision: this.revisionValue,
      resetRequired: false,
      sceneStateChanged,
      sceneState: sceneStateChanged ? clone(currentSceneState) : null,
      added,
      removed,
      changed,
      entities: clone(currentEntities.filter((entity) => included.has(entity.entity))),
    };
  }

  private pushDelta(delta: SceneDelta): SceneDelta {
    this.deltas.push(delta);
    if (this.deltas.length > this.capacity) {
      this.deltas.splice(0, this.deltas.length - this.capacity);
    }
    return clone(delta);
  }
}

function entitySignatures(
  entities: readonly SceneEntityView[],
  immutableSignatures: WeakMap<SceneEntityView, string>,
): Map<number, string> {
  const records = new Map<number, string>();
  for (const entity of entities) {
    if (!Number.isSafeInteger(entity.entity) || records.has(entity.entity)) {
      throw new Error(`Scene contains an invalid or duplicate entity id: ${String(entity.entity)}`);
    }
    // Scene payloads are JSON data; diff() clones the requested values at the return boundary.
    const retained = isRetainedPlayRecord(entity) && !('toJSON' in Object.prototype) && !('toJSON' in Array.prototype);
    let signature = retained ? immutableSignatures.get(entity) : undefined;
    if (signature === undefined) {
      signature = JSON.stringify(entity);
      if (retained) immutableSignatures.set(entity, signature);
    }
    records.set(entity.entity, signature);
  }
  return records;
}

function emptySceneDiff(fromRevision: number, toRevision: number): SceneDiff {
  return {
    fromRevision,
    toRevision,
    resetRequired: false,
    sceneStateChanged: false,
    sceneState: null,
    added: [],
    removed: [],
    changed: [],
    entities: [],
  };
}

function idsWithState(
  states: ReadonlyMap<number, 'added' | 'removed' | 'changed'>,
  state: 'added' | 'removed' | 'changed',
): number[] {
  return [...states]
    .filter(([, value]) => value === state)
    .map(([id]) => id)
    .sort(numberOrder);
}

function numberOrder(left: number, right: number): number {
  return left - right;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
