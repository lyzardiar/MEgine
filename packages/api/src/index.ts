import type { ComponentName, Transform, WorldCommand } from './generated';

export * from './generated';

export type EntityId = number;

export interface SpawnComponents {
  transform?: Partial<Transform> & { position?: [number, number, number] };
  meshRenderer?: { mesh?: string; material?: string };
  camera3D?: { fov_y_degrees?: number; near?: number; far?: number; primary?: boolean };
  name?: string;
  [key: string]: unknown;
}

/** Host bridge — runtime / editor injects a transport. */
export interface EngineTransport {
  push(commands: WorldCommand[]): void;
  snapshot(): Promise<WorldSnapshotView>;
}

export interface WorldSnapshotView {
  entities: Array<{
    entity: number;
    name?: string | null;
    parent?: number | null;
    components: Record<string, unknown>;
  }>;
  frame: number;
  simFrame: number;
  clearColor: [number, number, number, number];
  selected?: number | null;
}

/**
 * Semantic facade used by game scripts, editor, and AI agents.
 * All mutations become WorldCommands — never touch GPU directly.
 */
export class World {
  private _commands: WorldCommand[] = [];
  private _transport?: EngineTransport;

  constructor(transport?: EngineTransport) {
    this._transport = transport;
  }

  get commands(): CommandWriter {
    return new CommandWriter(this._commands);
  }

  spawn(archetype: string, components: SpawnComponents = {}): EntityId {
    const mapped: Record<string, unknown> = {};
    if (components.transform) {
      mapped.Transform = {
        position: components.transform.position ?? [0, 0, 0],
        rotation: components.transform.rotation ?? [0, 0, 0, 1],
        scale: components.transform.scale ?? [1, 1, 1],
      };
    }
    if (components.meshRenderer) {
      mapped.MeshRenderer = {
        mesh: components.meshRenderer.mesh ?? 'cube',
        material: components.meshRenderer.material ?? 'default',
      };
    }
    if (components.camera3D) {
      mapped.Camera3D = {
        fov_y_degrees: components.camera3D.fov_y_degrees ?? 60,
        near: components.camera3D.near ?? 0.1,
        far: components.camera3D.far ?? 1000,
        primary: components.camera3D.primary ?? true,
      };
    }
    for (const [k, v] of Object.entries(components)) {
      if (['transform', 'meshRenderer', 'camera3D', 'name'].includes(k)) continue;
      mapped[k] = v;
    }
    this._commands.push({
      op: 'spawn',
      name: components.name ?? archetype,
      components: mapped,
    });
    // Optimistic local id — host assigns real id on commit.
    return -this._commands.length;
  }

  commit(): void {
    if (this._transport && this._commands.length) {
      this._transport.push([...this._commands]);
    }
    this._commands.length = 0;
  }

  async querySnapshot(): Promise<WorldSnapshotView> {
    if (!this._transport) {
      return {
        entities: [],
        frame: 0,
        simFrame: 0,
        clearColor: [0.1, 0.1, 0.14, 1],
      };
    }
    return this._transport.snapshot();
  }
}

export class CommandWriter {
  constructor(private readonly buf: WorldCommand[]) {}

  set(entity: EntityId, component: ComponentName | string, value: Record<string, unknown>): void {
    this.buf.push({
      op: 'setComponent',
      entity,
      component,
      value,
    });
  }

  despawn(entity: EntityId): void {
    this.buf.push({ op: 'despawn', entity });
  }

  setClearColor(r: number, g: number, b: number, a = 1): void {
    this.buf.push({ op: 'setClearColor', r, g, b, a });
  }

  push(cmd: WorldCommand): void {
    this.buf.push(cmd);
  }
}

export function defineSystem(
  name: string,
  opts: {
    reads?: string[];
    writes?: string[];
    stage?: 'Startup' | 'PreUpdate' | 'Update' | 'PostUpdate' | 'PreRender' | 'Render';
    run: (ctx: { dt: number; frame: number; world: World }) => void;
  },
): typeof opts & { name: string } {
  return { name, ...opts };
}
