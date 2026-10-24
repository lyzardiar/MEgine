// Author: MiYu. Reuse derived hierarchy and camera data for the same owned displayed entity records.
import { createOwnedHierarchyActiveReader } from './hierarchyActivation';
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
  const readActive = createOwnedHierarchyActiveReader();
  function prepare(world: NativeViewportFrameWorld<E>) {
    const active = readActive(world.entities);
    let transforms: ReturnType<typeof buildWorldTransforms> | undefined;
    let uiEntities: E[] | undefined;
    type Entry = { e: E; t: NonNullable<ReturnType<typeof resolvedTransform>>; hierarchyOrder: number };
    let entries: Entry[] | undefined;
    let spineEntries: typeof entries, overlayEntries: typeof entries;
    let sceneFrame: { transforms: ReturnType<typeof buildWorldTransforms>; entries: Entry[]; hitEntries(): Entry[] } | undefined;
    let sceneSelection: ReadonlySet<number> | undefined;
    let scenePrimary: number | null | undefined;
    let sceneDeferred = false;
    let cameraInput: readonly unknown[] | undefined, camera: ResolvedGameCamera | null = null;
    const collectEntries = (include: (entity: E) => boolean = () => true, nodes?: ReturnType<typeof buildWorldTransforms>) => world.entities.flatMap((e, hierarchyOrder) => {
      if (!include(e) || !active(e.entity)) return [];
      const t = resolvedTransform(nodes ?? (transforms ??= readTransforms(world.entities)), e.entity);
      return t ? [{ e, t, hierarchyOrder }] : [];
    });
    const sceneBrowserFrame = (selected: ReadonlySet<number>, primary: number | null = null, deferHits = false) => {
      if (!sceneFrame || sceneDeferred !== deferHits || !Object.is(scenePrimary, primary) || selected.size !== sceneSelection!.size || [...selected].some(id => !sceneSelection!.has(id))) {
        const selection = new Set(selected);
        const includeBrowser = (e: E, isSelected = selection.has(e.entity)) => { const c = e.components; return isSelected || !c.MeshRenderer || !!(c.Camera2D || c.Camera3D || c.SpineSkeleton || c.ParticleEmitter2D || c.ParticleEmitter3D || c.TrailRenderer2D); };
        const resolveEntries = (values: Array<{ e: E; hierarchyOrder: number }>, nodes: ReturnType<typeof buildWorldTransforms>) => values.flatMap(({ e, hierarchyOrder }) => { const t = resolvedTransform(nodes, e.entity); return t ? [{ e, t, hierarchyOrder }] : []; });
        const candidates: Array<{ e: E; hierarchyOrder: number }> = [], roots: number[] = [];
        for (let hierarchyOrder = 0; hierarchyOrder < world.entities.length; hierarchyOrder++) {
          const e = world.entities[hierarchyOrder], c = e.components, isSelected = selection.has(e.entity), include = deferHits ? isSelected : includeBrowser(e, isSelected);
          const needed = deferHits ? isSelected || !!(c.Camera2D || c.Camera3D || c.SpineSkeleton || c.ParticleEmitter2D || c.ParticleEmitter3D || c.TrailRenderer2D || c.Light2D || !c.MeshRenderer && (c.PointLight || c.SpotLight || c.DirectionalLight)) : include || !!c.Light2D;
          const isActive = needed && active(e.entity);
          if (include && isActive) candidates.push({ e, hierarchyOrder });
          // Lighting can use a mesh-bearing Light2D; inactive selections still need Transform handles.
          if (isActive || isSelected || e.entity === primary) roots.push(e.entity);
        }
        const nodes = transforms ?? readTransforms(world.entities, roots);
        const browserEntries = resolveEntries(candidates, nodes);
        let hitRows = deferHits ? undefined : browserEntries;
        const hitEntries = () => {
          if (hitRows) return hitRows;
          const candidates = world.entities.flatMap((e, hierarchyOrder) => includeBrowser(e) && active(e.entity) ? [{ e, hierarchyOrder }] : []);
          const hitNodes = transforms ?? readTransforms(world.entities, candidates.map(({ e }) => e.entity));
          return hitRows = resolveEntries(candidates, hitNodes);
        };
        sceneFrame = { transforms: nodes, entries: browserEntries, hitEntries }; sceneSelection = selection; scenePrimary = primary; sceneDeferred = deferHits;
      }
      return sceneFrame;
    };
    return {
      active,
      hasSpine: world.entities.some(entity => !!entity.components.SpineSkeleton),
      requiresBrowserSnapshot: requiresBrowserViewportSnapshot(world.entities),
      worldTransforms() { return transforms ??= readTransforms(world.entities); },
      worldEntries(spineOnly = false) {
        return spineOnly ? spineEntries ??= collectEntries(e => !!e.components.SpineSkeleton) : entries ??= collectEntries();
      },
      /** Only browser consumers and their ancestor chains resolve transforms for token-owned Scene frames. */
      sceneBrowserFrame,
      /** Native tokens own ordinary mesh hits; browser helpers and selected collider/gizmo entries still participate. */
      sceneBrowserEntries(selected: ReadonlySet<number>) {
        return sceneBrowserFrame(selected).entries;
      },
      sceneOverlayEntries() {
        return overlayEntries ??= collectEntries(e => {
          const c = e.components;
          return !!(c.Camera2D || c.Camera3D || c.SpineSkeleton || !c.MeshRenderer && (c.PointLight || c.SpotLight || c.Light2D || c.DirectionalLight));
        }, sceneFrame?.transforms);
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
