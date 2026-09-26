import { invoke } from '@tauri-apps/api/core';

type SharedFrameEvent = { additionalData?: { nativeViewportRequest?: string }; getBuffer(): ArrayBuffer };
type SharedFrameWebView = { addEventListener(type: 'sharedbufferreceived', listener: (event: SharedFrameEvent) => void): void; releaseBuffer(buffer: ArrayBuffer): void };
const pending = new Map<string, { resolve(buffer: ArrayBuffer): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> }>();
const leases = new WeakMap<ArrayBuffer, SharedFrameWebView>();
let listening: SharedFrameWebView | undefined;
let unsupported = false;
let nextRequest = 0;
const requestEpoch = crypto.randomUUID();

export function isSharedNativeViewportFrame(buffer: ArrayBuffer): boolean { return leases.has(buffer); }

export function releaseNativeViewportFrame(buffer: ArrayBuffer): void {
  const webview = leases.get(buffer);
  if (webview) { leases.delete(buffer); webview.releaseBuffer(buffer); }
}

/** Windows WebView2 shares pixel pages; other platforms retain the binary IPC response. */
export function requestNativeViewportFrame(command: string, args: Record<string, unknown>): Promise<ArrayBuffer> {
  const webview = (window as Window & { chrome?: { webview?: SharedFrameWebView } }).chrome?.webview;
  if (unsupported || !webview?.releaseBuffer) return invoke<ArrayBuffer>(command, { ...args, raw: true });
  if (listening !== webview) {
    webview.addEventListener('sharedbufferreceived', event => {
      const id = event.additionalData?.nativeViewportRequest;
      if (!id) return;
      const buffer = event.getBuffer(), request = pending.get(id);
      if (!request) { webview.releaseBuffer(buffer); return; }
      pending.delete(id);
      clearTimeout(request.timer);
      leases.set(buffer, webview);
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
    pending.set(id, { resolve, reject, timer });
    void invoke<ArrayBuffer>(command, { ...args, raw: true, sharedRequest: id }).then(buffer => {
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
