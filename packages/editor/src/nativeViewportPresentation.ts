// Author: MiYu. Reuse derived hierarchy and camera data only for the browser-owned displayed frame.
import { createHierarchyActiveLookup } from './hierarchyActivation';
import { timelineGameCamera, type ResolvedGameCamera } from './gameCamera';
import type { TimelineCameraPreview } from './timelineScenePreview';
import { requiresBrowserViewportSnapshot, type NativeViewportFrameWorld } from './nativeViewportFrame';

type Entity = { entity: number; parent?: number | null; active?: boolean; components: Record<string, unknown> };

/** Live editable worlds never enter this cache; a decoded frame owns its fixed revision's records. */
export function createNativeViewportPresentationReader<E extends Entity>() {
  let previous: NativeViewportFrameWorld<E> | undefined;
  let presentation: ReturnType<typeof prepare> | undefined;
  function prepare(world: NativeViewportFrameWorld<E>) {
    const active = createHierarchyActiveLookup(world.entities);
    let cameraInput: readonly unknown[] | undefined, camera: ResolvedGameCamera | null = null;
    return {
      active,
      hasSpine: world.entities.some(entity => !!entity.components.SpineSkeleton),
      requiresBrowserSnapshot: requiresBrowserViewportSnapshot(world.entities),
      gameCamera(preview: TimelineCameraPreview | null | undefined, display: number) {
        const input = [!!preview, preview?.source, preview?.target, preview?.weight, display];
        if (!cameraInput || input.some((value, index) => !Object.is(value, cameraInput![index]))) { camera = timelineGameCamera(world.entities, preview, active, display); cameraInput = input; }
        return camera;
      },
    };
  }
  return (world: NativeViewportFrameWorld<E>) => {
    if (previous !== world) { previous = world; presentation = prepare(world); }
    return presentation!;
  };
}
