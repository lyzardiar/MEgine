export type SpineRuntimeModule = typeof import('./spineCanvasRuntime');

let runtimePromise: Promise<SpineRuntimeModule> | null = null;

export function loadSpineRuntime(): Promise<SpineRuntimeModule> {
  runtimePromise ??= import('./spineCanvasRuntime');
  return runtimePromise;
}
