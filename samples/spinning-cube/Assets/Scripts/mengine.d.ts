/** Global MEngine scripting bridge injected by the player runtime. */
interface EngineApi {
  setClearColor(r: number, g: number, b: number, a?: number): void;
  pushCommandJson(json: string): void;
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
  scene: EngineSceneInfo | null;
}

interface EngineSceneInfo {
  readonly name: string;
  readonly path: string;
  readonly buildIndex: number | null;
  readonly buildSceneCount: number;
}

interface PhysicsCollisionInfo {
  readonly firstEntity: string;
  readonly secondEntity: string;
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
