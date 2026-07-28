export const AGENT_EVENT_TOPICS = [
  'scene.changed',
  'selection.changed',
  'mode.changed',
  'log.added',
  'log.cleared',
  'panel.changed',
  'build.progress',
  'build.settings',
  'asset.changed',
  'project.changed',
] as const;

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

export class AgentEventJournal {
  private readonly events: AgentEvent[] = [];
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
}

export type SceneEntityView = {
  entity: number;
  [key: string]: unknown;
};

export type SceneDelta = {
  previousRevision: number;
  revision: number;
  sceneName: string | null;
  resetRequired: boolean;
  added: number[];
  removed: number[];
  changed: number[];
};

export type SceneDiff = {
  fromRevision: number;
  toRevision: number;
  resetRequired: boolean;
  added: number[];
  removed: number[];
  changed: number[];
  entities: SceneEntityView[];
};

type SceneEntityRecord = {
  signature: string;
  value: SceneEntityView;
};

export class SceneChangeTracker {
  private revisionValue = 0;
  private sceneName: string | null = null;
  private entities = new Map<number, SceneEntityRecord>();
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
    this.entities.clear();
    this.deltas.splice(0);
  }

  observe(sceneName: string | null, entities: readonly SceneEntityView[]): SceneDelta | null {
    const current = entityRecords(entities);
    if (this.revisionValue === 0) {
      this.revisionValue = 1;
      this.sceneName = sceneName;
      this.entities = current;
      return this.pushDelta({
        previousRevision: 0,
        revision: 1,
        sceneName,
        resetRequired: true,
        added: [],
        removed: [],
        changed: [],
      });
    }

    const sceneChanged = sceneName !== this.sceneName;
    const added: number[] = [];
    const removed: number[] = [];
    const changed: number[] = [];
    if (!sceneChanged) {
      for (const [id, record] of current) {
        const previous = this.entities.get(id);
        if (!previous) added.push(id);
        else if (previous.signature !== record.signature) changed.push(id);
      }
      for (const id of this.entities.keys()) {
        if (!current.has(id)) removed.push(id);
      }
    }
    if (!sceneChanged && !added.length && !removed.length && !changed.length) return null;

    const previousRevision = this.revisionValue;
    this.revisionValue += 1;
    this.sceneName = sceneName;
    this.entities = current;
    return this.pushDelta({
      previousRevision,
      revision: this.revisionValue,
      sceneName,
      resetRequired: sceneChanged,
      added: added.sort(numberOrder),
      removed: removed.sort(numberOrder),
      changed: changed.sort(numberOrder),
    });
  }

  diff(fromRevision: number, currentEntities: readonly SceneEntityView[]): SceneDiff {
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
    const included = new Set([...added, ...changed]);
    return {
      fromRevision,
      toRevision: this.revisionValue,
      resetRequired: false,
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

function entityRecords(
  entities: readonly SceneEntityView[],
): Map<number, SceneEntityRecord> {
  const records = new Map<number, SceneEntityRecord>();
  for (const entity of entities) {
    if (!Number.isSafeInteger(entity.entity) || records.has(entity.entity)) {
      throw new Error(`Scene contains an invalid or duplicate entity id: ${String(entity.entity)}`);
    }
    const value = clone(entity);
    records.set(entity.entity, { signature: JSON.stringify(value), value });
  }
  return records;
}

function emptySceneDiff(fromRevision: number, toRevision: number): SceneDiff {
  return {
    fromRevision,
    toRevision,
    resetRequired: false,
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
