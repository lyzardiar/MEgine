/** Global engine bridge injected by mengine-script host. */
interface EngineApi {
  setClearColor(r: number, g: number, b: number, a?: number): void;
  pushCommandJson(json: string): void;
}

declare const engine: EngineApi;

declare function onTick(dt: number, frame: number): void;
