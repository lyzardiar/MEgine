// Author: MiYu. Correlate shared viewport leases and native transport measurements.
import { invoke } from '@tauri-apps/api/core';

type NativeSharedTransportProfile = { uiQueueMs: number; setupMs: number; allocateMs: number; copyMs: number; bytes: number; publicationReadyEpochMs?: number; pooled?: boolean; poolHit?: boolean; bufferId?: number };
export type SharedNativeViewportTransportProfile = NativeSharedTransportProfile & { requestId: string; receivedEpochMs: number; getBufferMs: number; requestElapsedMs: number; publicationReadyToEventMs?: number; releaseMs?: number };
export type NativeViewportWorldRequestProfile = { source: 'snapshot' | 'play-revision' | 'play-latest' | 'scene-cache'; sessionId?: number; revision?: number; snapshotEntityCount?: number; attempts: number; fallback?: 'play-revision-expired' | 'scene-revision-expired'; expiredRequestMs?: number; snapshotPrepareMs?: number; elapsedMs: number };
function snapshotEntityCount(args: Record<string, unknown>): number | undefined {
  const entities = (args.snapshot as { entities?: unknown } | undefined)?.entities;
  return Array.isArray(entities) ? entities.length : undefined;
}
const worldRequestProfiles = new WeakMap<ArrayBuffer, NativeViewportWorldRequestProfile>();
export function nativeViewportWorldRequestProfile(buffer: ArrayBuffer) { return worldRequestProfiles.get(buffer); }
type SharedFrameEvent = { additionalData?: { nativeViewportRequest?: string; nativeViewportPooled?: boolean; nativeViewportLease?: string; nativeViewportTransport?: NativeSharedTransportProfile }; getBuffer(): ArrayBuffer };
type SharedFrameWebView = { addEventListener(type: 'sharedbufferreceived', listener: (event: SharedFrameEvent) => void): void; releaseBuffer(buffer: ArrayBuffer): void };
const pending = new Map<string, { resolve(buffer: ArrayBuffer): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout>; startedAt: number }>();
const leases = new WeakMap<ArrayBuffer, { webview: SharedFrameWebView; request: string; nativeLease?: string }>();
const transportProfiles = new WeakMap<ArrayBuffer, SharedNativeViewportTransportProfile>();
type RetainedMapping = { webview: SharedFrameWebView; buffer: ArrayBuffer };
const mappings = new Map<number, RetainedMapping>();
const MAX_MAPPING_BYTES = 96 * 1024 * 1024;
let pageHidden = false;
function discardMapping(id: number, mapping: RetainedMapping): void {
  if (!leases.has(mapping.buffer)) mapping.webview.releaseBuffer(mapping.buffer);
  mappings.delete(id);
}
function clearMappings(): void {
  for (const [id, mapping] of mappings) {
    try { discardMapping(id, mapping); }
    catch (error) { console.warn('Native viewport mapping cleanup failed', error); }
  }
}
/** Retain at most the native pool capacity; an ACK ends pixel access, not the mapping lifetime. */
function retainMapping(webview: SharedFrameWebView, buffer: ArrayBuffer, event: SharedFrameEvent): ArrayBuffer {
  const data = event.additionalData, id = data?.nativeViewportTransport?.bufferId;
  if (unsupported || pageHidden || webview !== listening || data?.nativeViewportPooled !== true || !data.nativeViewportLease || !Number.isSafeInteger(id) || id! <= 0 || !buffer.byteLength || buffer.byteLength > MAX_MAPPING_BYTES) return buffer;
  const existing = mappings.get(id!);
  if (existing) {
    if (leases.has(existing.buffer)) return buffer;
    if (existing.webview === webview && existing.buffer.byteLength === buffer.byteLength) {
      if (existing.buffer !== buffer) webview.releaseBuffer(buffer);
      return existing.buffer;
    }
    discardMapping(id!, existing);
  }
  let bytes = [...mappings.values()].reduce((total, mapping) => total + mapping.buffer.byteLength, 0);
  for (const [key, mapping] of mappings) {
    if (mappings.size < 3 && bytes + buffer.byteLength <= MAX_MAPPING_BYTES) break;
    if (!leases.has(mapping.buffer)) { bytes -= mapping.buffer.byteLength; discardMapping(key, mapping); }
  }
  if (mappings.size < 3 && bytes + buffer.byteLength <= MAX_MAPPING_BYTES) mappings.set(id!, { webview, buffer });
  return buffer;
}
export function nativeViewportTransportProfile(buffer: ArrayBuffer) { return transportProfiles.get(buffer); }
let listening: SharedFrameWebView | undefined;
let unsupported = false;
let nextRequest = 0;
const requestEpoch = crypto.randomUUID();

export function isSharedNativeViewportFrame(buffer: ArrayBuffer): boolean { return leases.has(buffer); }

export function releaseNativeViewportFrame(buffer: ArrayBuffer): void {
  worldRequestProfiles.delete(buffer);
  const lease = leases.get(buffer);
  if (lease) {
    const profile = transportProfiles.get(buffer), startedAt = performance.now();
    try {
      if (![...mappings.values()].some(mapping => mapping.buffer === buffer)) lease.webview.releaseBuffer(buffer);
      leases.delete(buffer); transportProfiles.delete(buffer);
      if (lease.nativeLease) {
        void invoke<void>('release_native_viewport_frame', { request: lease.request, lease: lease.nativeLease }).catch(error => console.warn('Native viewport release acknowledgement failed', error));
      }
    }
    finally { if (profile) profile.releaseMs = performance.now() - startedAt; }
  }
}

/** Windows WebView2 shares pixel pages; other platforms retain the binary IPC response. */
export function requestNativeViewportFrame(command: string, args: Record<string, unknown>): Promise<ArrayBuffer> {
  const webview = (window as Window & { chrome?: { webview?: SharedFrameWebView } }).chrome?.webview;
  if (unsupported || !webview?.releaseBuffer) return invoke<ArrayBuffer>(command, { ...args, raw: true });
  if (listening !== webview) {
    clearMappings();
    if (!listening) {
      window.addEventListener?.('pagehide', () => { pageHidden = true; clearMappings(); });
      window.addEventListener?.('pageshow', () => { pageHidden = false; });
    }
    webview.addEventListener('sharedbufferreceived', event => {
      const id = event.additionalData?.nativeViewportRequest;
      if (!id) return;
      const receivedAt = performance.now(), incoming = event.getBuffer(), request = pending.get(id);
      let buffer = incoming;
      if (request) {
        try { buffer = retainMapping(webview, incoming, event); }
        catch (error) { console.warn('Native viewport mapping reuse failed', error); }
      }
      const getBufferMs = performance.now() - receivedAt;
      leases.set(buffer, { webview, request: id, nativeLease: event.additionalData?.nativeViewportPooled === true ? event.additionalData.nativeViewportLease : undefined });
      if (!request) { releaseNativeViewportFrame(buffer); return; }
      pending.delete(id);
      clearTimeout(request.timer);
      if (event.additionalData?.nativeViewportTransport) {
        const native = event.additionalData.nativeViewportTransport, receivedEpochMs = performance.timeOrigin + receivedAt;
        const publicationReadyToEventMs = Number.isFinite(native.publicationReadyEpochMs) && native.publicationReadyEpochMs! > 0 ? receivedEpochMs - native.publicationReadyEpochMs! : undefined;
        transportProfiles.set(buffer, { ...native, requestId: id, receivedEpochMs, publicationReadyToEventMs, getBufferMs, requestElapsedMs: receivedAt - request.startedAt });
      }
      request.resolve(buffer);
    });
    listening = webview;
  }
  const id = `${requestEpoch}-${++nextRequest}`;
  return new Promise((resolve, reject) => {
    const fail = (error: unknown) => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      clearTimeout(request.timer);
      reject(error);
    };
    const timer = setTimeout(() => fail(new Error('Native viewport shared frame timed out')), 15_000);
    pending.set(id, { resolve, reject, timer, startedAt: performance.now() });
    void invoke<ArrayBuffer>(command, { ...args, raw: true, sharedRequest: id, sharedBufferReuse: true }).then(buffer => {
      if (!buffer.byteLength) return; // Shared pixels arrive through sharedbufferreceived.
      unsupported = true;
      clearMappings();
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      clearTimeout(request.timer);
      resolve(buffer);
    }).catch(fail);
  });
}

/** Only an evicted revision falls back to the same owned browser snapshot; other failures propagate. */
export async function requestRevisionedNativeViewport<T>(args: Record<string, unknown>, snapshotFallback: () => Record<string, unknown>, request: (args: Record<string, unknown>) => Promise<T>, completed?: (result: T, profile: NativeViewportWorldRequestProfile) => void): Promise<T> {
  const started = performance.now();
  const profile: NativeViewportWorldRequestProfile = { source: args.snapshot != null ? 'snapshot' : args.playRevision != null ? 'play-revision' : args.playSessionId != null ? 'play-latest' : 'scene-cache', sessionId: typeof args.playSessionId === 'number' ? args.playSessionId : undefined, revision: typeof args.playRevision === 'number' ? args.playRevision : undefined, snapshotEntityCount: snapshotEntityCount(args), attempts: 1, elapsedMs: 0 };
  let result: T;
  try { result = await request(args); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sceneExpired = args.sceneWorldKey != null && message.includes('Scene viewport revision expired');
    if (!sceneExpired && (args.playRevision == null || !message.includes('Play viewport revision expired'))) throw error;
    profile.fallback = sceneExpired ? 'scene-revision-expired' : 'play-revision-expired';
    profile.expiredRequestMs = performance.now() - started;
    const preparing = performance.now(), snapshot = snapshotFallback();
    profile.snapshotPrepareMs = performance.now() - preparing;
    profile.snapshotEntityCount = snapshotEntityCount(snapshot);
    profile.attempts = 2;
    const { playSessionId: _session, playRevision: _revision, ...view } = args;
    result = await request({ ...(sceneExpired ? args : view), ...snapshot });
  }
  profile.elapsedMs = performance.now() - started;
  completed?.(result, profile);
  return result;
}

export function requestRevisionedNativeViewportFrame(command: string, args: Record<string, unknown>, snapshotFallback: () => Record<string, unknown>): Promise<ArrayBuffer> {
  return requestRevisionedNativeViewport(args, snapshotFallback, next => requestNativeViewportFrame(command, next), (buffer, profile) => worldRequestProfiles.set(buffer, profile));
}
