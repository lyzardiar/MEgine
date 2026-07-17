/** Global engine bridge injected by mengine-script host. */
interface EngineApi {
  setClearColor(r: number, g: number, b: number, a?: number): void;
  pushCommandJson(json: string): void;
  loadScene(scene: string | number): boolean;
  reloadScene(): boolean;
  scene: EngineSceneInfo | null;
}

interface EngineSceneInfo {
  readonly name: string;
  readonly path: string;
  readonly buildIndex: number | null;
  readonly buildSceneCount: number;
}

declare const engine: EngineApi;

declare function onTick(dt: number, frame: number): void;
declare function onSceneLoaded(scene: EngineSceneInfo): void;
