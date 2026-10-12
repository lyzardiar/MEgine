// Author: MiYu. Correlate shared viewport leases and native transport measurements.
import { invoke } from '@tauri-apps/api/core';

type NativeSharedTransportProfile = { uiQueueMs: number; setupMs: number; allocateMs: number; copyMs: number; bytes: number; publicationReadyEpochMs?: number; pooled?: boolean; poolHit?: boolean; bufferId?: number };
export type SharedNativeViewportTransportProfile = NativeSharedTransportProfile & { requestId: string; receivedEpochMs: number; getBufferMs: number; requestElapsedMs: number; publicationReadyToEventMs?: number; releaseMs?: number };
type SharedFrameEvent = { additionalData?: { nativeViewportRequest?: string; nativeViewportPooled?: boolean; nativeViewportLease?: string; nativeViewportTransport?: NativeSharedTransportProfile }; getBuffer(): ArrayBuffer };
type SharedFrameWebView = { addEventListener(type: 'sharedbufferreceived', listener: (event: SharedFrameEvent) => void): void; releaseBuffer(buffer: ArrayBuffer): void };
const pending = new Map<string, { resolve(buffer: ArrayBuffer): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout>; startedAt: number }>();
const leases = new WeakMap<ArrayBuffer, { webview: SharedFrameWebView; request: string; nativeLease?: string }>();
const transportProfiles = new WeakMap<ArrayBuffer, SharedNativeViewportTransportProfile>();
export function nativeViewportTransportProfile(buffer: ArrayBuffer) { return transportProfiles.get(buffer); }
let listening: SharedFrameWebView | undefined;
let unsupported = false;
let nextRequest = 0;
const requestEpoch = crypto.randomUUID();

export function isSharedNativeViewportFrame(buffer: ArrayBuffer): boolean { return leases.has(buffer); }

export function releaseNativeViewportFrame(buffer: ArrayBuffer): void {
  const lease = leases.get(buffer);
  if (lease) {
    const profile = transportProfiles.get(buffer), startedAt = performance.now();
    try {
      lease.webview.releaseBuffer(buffer);
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
    webview.addEventListener('sharedbufferreceived', event => {
      const id = event.additionalData?.nativeViewportRequest;
      if (!id) return;
      const receivedAt = performance.now(), buffer = event.getBuffer(), getBufferMs = performance.now() - receivedAt, request = pending.get(id);
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
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      clearTimeout(request.timer);
      resolve(buffer);
    }).catch(fail);
  });
}

/** Only an evicted revision falls back to the same owned browser snapshot; other failures propagate. */
export async function requestRevisionedNativeViewportFrame(command: string, args: Record<string, unknown>, snapshotFallback: () => Record<string, unknown>): Promise<ArrayBuffer> {
  try { return await requestNativeViewportFrame(command, args); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.sceneWorldKey != null && message.includes('Scene viewport revision expired')) return requestNativeViewportFrame(command, { ...args, ...snapshotFallback() });
    if (args.playRevision == null || !message.includes('Play viewport revision expired')) throw error;
    const { playSessionId: _session, playRevision: _revision, ...view } = args;
    return requestNativeViewportFrame(command, { ...view, ...snapshotFallback() });
  }
}
