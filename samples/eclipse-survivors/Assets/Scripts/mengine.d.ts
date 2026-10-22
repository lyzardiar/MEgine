/** Author: MiYu */
/** Global engine bridge injected by mengine-script host. */
interface EnginePointerSnapshot {
  readonly x: number;
  readonly y: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly left: boolean;
  readonly right: boolean;
  readonly inside: boolean;
}

interface EngineInputSnapshot {
  readonly held: readonly string[];
  readonly pressed: readonly string[];
  readonly pointer: EnginePointerSnapshot;
}

interface EngineEntityInfo {
  readonly id: string;
  readonly name: string;
}

interface EngineApi {
  setClearColor(r: number, g: number, b: number, a?: number): void;
  pushCommandJson(json: string): boolean;
  findEntity(name: string): string | null;
  findEntities(prefix: string): string[];
  isKeyHeld(key: string): boolean;
  isKeyPressed(key: string): boolean;
  spawnEntity(name: string, components: Record<string, unknown>): boolean;
  setComponent(entity: number | string, component: string, value: Record<string, unknown>): boolean;
  removeComponent(entity: number | string, component: string): boolean;
  destroyEntity(entity: number | string): boolean;
  save(): boolean;
  clearSave(): boolean;
  loadScene(scene: string | number): boolean;
  reloadScene(): boolean;
  instantiatePrefab(path: string, parent?: number | string): boolean;
  setAnimatorParameter(entity: number | string, name: string, value: boolean | number): boolean;
  setAnimatorTrigger(entity: number | string, name: string): boolean;
  playAnimatorState(entity: number | string, state: string): boolean;
  playAnimation(entity: number | string, restart?: boolean): boolean;
  pauseAnimation(entity: number | string): boolean;
  stopAnimation(entity: number | string): boolean;
  seekAnimation(entity: number | string, time: number): boolean;
  playAudio(entity: number | string): boolean;
  pauseAudio(entity: number | string): boolean;
  stopAudio(entity: number | string): boolean;
  seekAudio(entity: number | string, time: number): boolean;
  readonly scene: EngineSceneInfo | null;
  readonly input: EngineInputSnapshot;
  readonly entities: readonly EngineEntityInfo[];
  readonly data: Readonly<Record<string, unknown>>;
  storage: Record<string, unknown>;
}

interface EngineSceneInfo {
  readonly name: string;
  readonly path: string;
  readonly buildIndex: number | null;
  readonly buildSceneCount: number;
}

interface PhysicsCollisionInfo {
  /** Exact generation/index-packed entity identifier. */
  readonly firstEntity: string;
  /** Exact generation/index-packed entity identifier. */
  readonly secondEntity: string;
  /** Physics world that produced this transition. */
  readonly dimension: '2d' | '3d';
}

interface EngineAnimationEventInfo {
  readonly entity: string;
  readonly function: string;
  readonly time: number;
  readonly parameter: boolean | number | number[] | string | null;
  readonly state: string | null;
  readonly weight: number;
}

interface EngineUiActionInfo {
  readonly entity: string;
  readonly name: string;
  readonly action: 'click' | 'submit' | 'valueChanged' | 'selectionChanged';
  readonly value: unknown;
  readonly callback: unknown;
}

declare const engine: EngineApi;

declare function onTick(dt: number, frame: number): void;
declare function onSceneLoaded(scene: EngineSceneInfo): void;
declare function onCollisionEnter(event: PhysicsCollisionInfo): void;
declare function onCollisionExit(event: PhysicsCollisionInfo): void;
declare function onTriggerEnter(event: PhysicsCollisionInfo): void;
declare function onTriggerExit(event: PhysicsCollisionInfo): void;
declare function onCollisionEnter2D(event: PhysicsCollisionInfo): void;
declare function onCollisionExit2D(event: PhysicsCollisionInfo): void;
declare function onTriggerEnter2D(event: PhysicsCollisionInfo): void;
declare function onTriggerExit2D(event: PhysicsCollisionInfo): void;
declare function onAnimationEvent(event: EngineAnimationEventInfo): void;
declare function onUiAction(event: EngineUiActionInfo): void;
