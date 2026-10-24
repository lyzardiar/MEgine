// Author: MiYu. Preview uses the standard runtime bridge; keep declarations local for standalone projects.
interface EngineApi {
  snapshot: { entities: Array<{ entity: number; name: string | null; parent: number | null; components: Record<string, any> }> };
  input: { keys: string[]; pressedKeys: string[] };
  pushCommandJson(json: string): void;
  setClearColor(r: number, g: number, b: number, a?: number): void;
}
declare const engine: EngineApi;
