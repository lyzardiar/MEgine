/** Global engine bridge injected by mengine-script host. */
interface EngineApi {
  setClearColor(r: number, g: number, b: number, a?: number): void;
  pushCommandJson(json: string): void;
  loadScene(scene: string | number): boolean;
  reloadScene(): boolean;
  setAnimatorParameter(entity: number | string, name: string, value: boolean | number): boolean;
  setAnimatorTrigger(entity: number | string, name: string): boolean;
  playAnimatorState(entity: number | string, state: string): boolean;
  playAudio(entity: number | string): boolean;
  pauseAudio(entity: number | string): boolean;
  stopAudio(entity: number | string): boolean;
  scene: EngineSceneInfo | null;
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
}

declare const engine: EngineApi;

declare function onTick(dt: number, frame: number): void;
declare function onSceneLoaded(scene: EngineSceneInfo): void;
declare function onCollisionEnter(event: PhysicsCollisionInfo): void;
declare function onCollisionExit(event: PhysicsCollisionInfo): void;
