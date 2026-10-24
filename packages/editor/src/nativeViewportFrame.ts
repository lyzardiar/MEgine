// Author: MiYu. Keep browser frame ownership complete while pruning inactive Scene render payloads.
import type { NativeViewportProfilePayload } from './editorProfiler';
import { createHierarchyActiveLookup } from './hierarchyActivation.ts';
import { isSharedNativeViewportFrame, nativeViewportTransportProfile, nativeViewportWorldRequestProfile, releaseNativeViewportFrame } from './nativeViewportTransport.ts';

/** Browser-owned drawing and UI hit testing require the same snapshot as the native base image. */
export function requiresBrowserViewportSnapshot(entities: readonly { active?: boolean; components: Record<string, unknown> }[]): boolean {
  return entities.some(({ active, components: c }) => active !== false && (c.SpineSkeleton || c.Button || c.Toggle || c.Slider || c.Scrollbar || c.InputField || c.Dropdown || c.ListView || c.ScrollView || c.TabView));
}

export type NativeViewportWorld<E> = { entities: E[]; clearColor: [number, number, number, number]; simulationTime: number };
export type NativeViewportWorldReference<E> = NativeViewportWorld<E> & { sessionId: number; revision: number };
export type NativeViewportFrameWorld<E> = NativeViewportWorld<E> & { runtimeSessionId?: number; sourceEntities: E[] };

/** Scene revisions keep filtered immutable browser records and the exact published native source revision. */
export function nativeSceneWorldReference<E extends { entity: number }>(owned: NativeViewportWorldReference<E> | undefined, source: E[], visible: E[], hidden: readonly number[]): NativeViewportWorldReference<E> | undefined {
  return owned ? { ...owned, entities: owned.entities === source ? visible : owned.entities.filter(entity => !hidden.includes(entity.entity)) } : undefined;
}

export function nativeViewportFrameWorldCurrent<E>(frame: NativeViewportFrameWorld<E>, props: { entities: E[]; runtimeSessionId?: number }): boolean {
  return frame.runtimeSessionId != null ? frame.runtimeSessionId === props.runtimeSessionId : props.runtimeSessionId == null && frame.sourceEntities === props.entities;
}

/** Reuse only an exact native revision rendered with identical viewport settings. */
export function nativeGameFrameMatchesRequest(frame: { world: { runtimeSessionId?: number }; worldRevision?: number; requestKey: string } | null, args: { playSessionId?: number; playRevision?: number; snapshot?: unknown }, requestKey: string): boolean {
  return frame != null && args.playSessionId != null && args.playRevision != null && frame.world.runtimeSessionId === args.playSessionId && frame.worldRevision === args.playRevision && frame.requestKey === requestKey;
}

/** MiYu: editing changes render immediately; unchanged previews still poll external resources. */
export function nativeGameRequestInterval<E>(playing: boolean, frame: { world: NativeViewportFrameWorld<E>; requestKey: string } | null, props: NativeViewportWorld<E> & { runtimeSessionId?: number }, requestKey: string): number {
  if (playing) return 1000 / 60;
  const unchanged = frame != null && nativeViewportFrameWorldCurrent(frame.world, props) && frame.requestKey === requestKey && frame.world.simulationTime === props.simulationTime && frame.world.clearColor.every((value, axis) => value === props.clearColor[axis]);
  return unchanged ? 300 : 0;
}

/** Scene masks use exact published revisions; filtered camera previews and mutable edits use snapshots. */
export function createNativeViewportWorldArgs<E extends { entity?: number; parent?: number | null; active?: boolean; components: Record<string, unknown> }>(props: NativeViewportWorld<E> & { readonly nativeSessionId?: number; readonly nativeWorldReference?: NativeViewportWorldReference<E>; readonly nativeSceneWorldReference?: NativeViewportWorldReference<E>; runtimeSessionId?: number }, activeSceneOnly = false) {
  let browserSnapshot: boolean | undefined, referenceRead = false;
  let reference: NativeViewportWorldReference<E> | undefined;
  let sceneReferenceRead = false, sceneReference: NativeViewportWorldReference<E> | undefined;
  let captured: NativeViewportFrameWorld<E> | undefined;
  let args: { playSessionId: number; playRevision?: number } | { snapshot: NativeViewportWorld<E> } | undefined;
  let snapshot: NativeViewportWorld<E> | undefined;
  let sceneWorldKey: string | undefined, sceneWorldUploaded = false;
  const requiresBrowserSnapshot = () => browserSnapshot ??= requiresBrowserViewportSnapshot(props.entities);
  const worldReference = () => { if (!referenceRead) { reference = props.nativeWorldReference; referenceRead = true; } return reference; };
  const sceneWorldReference = () => { if (!sceneReferenceRead) { sceneReference = props.nativeSceneWorldReference; sceneReferenceRead = true; } return sceneReference; };
  const frameWorld = () => {
    if (captured) return captured;
    const retained = worldReference() ?? sceneWorldReference();
    const world = retained ? { entities: retained.entities, clearColor: retained.clearColor, simulationTime: retained.simulationTime } : JSON.parse(JSON.stringify({ entities: props.entities, clearColor: props.clearColor, simulationTime: props.simulationTime })) as NativeViewportWorld<E>;
    return captured = { ...world, runtimeSessionId: props.runtimeSessionId ?? retained?.sessionId, sourceEntities: props.entities };
  };
  const snapshotArgs = () => {
    if (!snapshot) {
      const world = frameWorld();
      const active = activeSceneOnly ? createHierarchyActiveLookup(world.entities as (E & { entity: number })[]) : undefined;
      snapshot = { entities: active ? world.entities.filter(entity => entity.entity == null || active(entity.entity)) : world.entities, clearColor: world.clearColor, simulationTime: world.simulationTime };
    }
    return { snapshot, ...(frameWorld().runtimeSessionId != null ? { playSessionId: frameWorld().runtimeSessionId } : {}) };
  };
  const worldArgs = () => {
    if (args) return args;
    const retained = worldReference();
    if (retained) return args = { playSessionId: retained.sessionId, playRevision: retained.revision };
    return args = snapshotArgs();
  };
  const sceneWorldArgs = () => ({ sceneWorldKey: sceneWorldKey ??= crypto.randomUUID(), ...(!sceneWorldUploaded ? snapshotArgs() : {}) });
  const scenePlayWorldArgs = () => { const retained = sceneWorldReference(); return retained ? { playSessionId: retained.sessionId, playRevision: retained.revision } : worldArgs(); };
  const markSceneWorldUploaded = () => { sceneWorldUploaded = true; };
  const requestKey = () => { const retained = worldReference() ?? sceneWorldReference(); return retained ? `${retained.sessionId}:${retained.revision}` : sceneWorldKey ??= crypto.randomUUID(); };
  return { requestKey, worldArgs, snapshotArgs, frameWorld, requiresBrowserSnapshot, sceneWorldArgs, scenePlayWorldArgs, markSceneWorldUploaded };
}

/** Match the pixels actually displayed; explicit captures still render at the requested output size. */
export function nativeGamePreviewSize(width: number, height: number, displayWidth: number, displayHeight: number, fixedPixelCanvas = false) {
  const scale = Math.min(1, fixedPixelCanvas ? 1 : displayWidth / width, fixedPixelCanvas ? 1 : displayHeight / height, 4096 / width, 4096 / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function parseNativeViewportFrame(buffer: ArrayBuffer) {
  if (buffer.byteLength < 16) throw new Error('Truncated native viewport frame');
  const header = new DataView(buffer);
  const width = header.getUint32(4, true), height = header.getUint32(8, true), metadataBytes = header.getUint32(12, true);
  const pixelsOffset = 16 + metadataBytes;
  if (header.getUint32(0, true) !== 0x3146474d || width < 1 || height < 1 || width > 4096 || height > 4096 || pixelsOffset + width * height * 4 !== buffer.byteLength) throw new Error('Invalid native viewport frame');
  const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 16, metadataBytes))) as { hasAuthoredCamera: boolean; profile: NativeViewportProfilePayload };
  return { width, height, ...metadata, rgba: new Uint8ClampedArray(buffer, pixelsOffset, width * height * 4) };
}

export function uploadNativeViewportFrame(buffer: ArrayBuffer, previous?: HTMLImageElement | HTMLCanvasElement) {
  try {
    const started = performance.now();
    const frame = parseNativeViewportFrame(buffer);
    const image = previous instanceof HTMLCanvasElement ? previous : document.createElement('canvas');
    if (image.width !== frame.width) image.width = frame.width;
    if (image.height !== frame.height) image.height = frame.height;
    const context = image.getContext('2d');
    if (!context) throw new Error('Native viewport canvas is unavailable');
    context.putImageData(new ImageData(frame.rgba, frame.width, frame.height), 0, 0);
    const profile = { ...frame.profile, worldRequest: nativeViewportWorldRequestProfile(buffer), sharedTransport: nativeViewportTransportProfile(buffer), uploadMs: performance.now() - started, nativeTransport: isSharedNativeViewportFrame(buffer) ? 'shared-buffer' as const : 'binary-ipc' as const };
    return { width: frame.width, height: frame.height, hasAuthoredCamera: frame.hasAuthoredCamera, profile, image };
  } finally { releaseNativeViewportFrame(buffer); }
}
