// Author: MiYu. Reuse derived hierarchy and camera data for the same owned displayed entity records.
import { createHierarchyActiveLookup } from './hierarchyActivation';
import { timelineGameCamera, type ResolvedGameCamera } from './gameCamera';
import type { TimelineCameraPreview } from './timelineScenePreview';
import { requiresBrowserViewportSnapshot, type NativeViewportFrameWorld } from './nativeViewportFrame';
import { buildWorldTransforms, createOwnedWorldTransformReader, resolvedTransform } from './worldTransform';
import { createSceneUiEntityReader } from './ui/uiLayout';

type Entity = { entity: number; parent?: number | null; active?: boolean; components: Record<string, unknown> };

export type NativeGamePaintState = { frame: unknown; surface: unknown; key: string; epoch: number; browserRendering: boolean };

/** Request scheduling remains active while an unchanged native-only Game image stays on its canvas. */
export function nativeGamePaintUnchanged(previous: NativeGamePaintState | null, current: NativeGamePaintState): boolean {
  return current.frame != null && !current.browserRendering && previous != null && !previous.browserRendering && previous.frame === current.frame && previous.surface === current.surface && previous.key === current.key && previous.epoch === current.epoch;
}

/** Live editable worlds never enter this cache; a decoded frame owns its fixed revision's records. */
export function createNativeViewportPresentationReader<E extends Entity>() {
  let previousEntities: E[] | undefined;
  let presentation: ReturnType<typeof prepare> | undefined;
  const readTransforms = createOwnedWorldTransformReader();
  const readSceneUiEntities = createSceneUiEntityReader<E>();
  function prepare(world: NativeViewportFrameWorld<E>) {
    const active = createHierarchyActiveLookup(world.entities);
    let transforms: ReturnType<typeof buildWorldTransforms> | undefined;
    let uiEntities: E[] | undefined;
    let entries: Array<{ e: E; t: NonNullable<ReturnType<typeof resolvedTransform>>; hierarchyOrder: number }> | undefined;
    let spineEntries: typeof entries, overlayEntries: typeof entries;
    let cameraInput: readonly unknown[] | undefined, camera: ResolvedGameCamera | null = null;
    const collectEntries = (spineOnly: boolean) => world.entities.flatMap((e, hierarchyOrder) => {
      if (spineOnly && !e.components.SpineSkeleton || !active(e.entity)) return [];
      const t = resolvedTransform(transforms ??= readTransforms(world.entities), e.entity);
      return t ? [{ e, t, hierarchyOrder }] : [];
    });
    return {
      active,
      hasSpine: world.entities.some(entity => !!entity.components.SpineSkeleton),
      requiresBrowserSnapshot: requiresBrowserViewportSnapshot(world.entities),
      worldTransforms() { return transforms ??= readTransforms(world.entities); },
      worldEntries(spineOnly = false) {
        return spineOnly ? spineEntries ??= collectEntries(true) : entries ??= collectEntries(false);
      },
      sceneOverlayEntries() {
        return overlayEntries ??= this.worldEntries().filter(({ e }) => {
          const c = e.components;
          return c.Camera2D || c.Camera3D || c.SpineSkeleton || !c.MeshRenderer && (c.PointLight || c.SpotLight || c.Light2D || c.DirectionalLight);
        });
      },
      sceneUiEntities() { return uiEntities ??= readSceneUiEntities(world.entities); },
      gameCamera(preview: TimelineCameraPreview | null | undefined, display: number) {
        const input = [!!preview, preview?.source, preview?.target, preview?.weight, display];
        if (!cameraInput || input.some((value, index) => !Object.is(value, cameraInput![index]))) { camera = timelineGameCamera(world.entities, preview, active, display); cameraInput = input; }
        return camera;
      },
    };
  }
  return (world: NativeViewportFrameWorld<E>) => {
    if (previousEntities !== world.entities) { previousEntities = world.entities; presentation = prepare(world); }
    return presentation!;
  };
}
