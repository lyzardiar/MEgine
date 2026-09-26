import type { NativeViewportProfilePayload } from './editorProfiler';
import { isSharedNativeViewportFrame, releaseNativeViewportFrame } from './nativeViewportTransport.ts';

/** Browser-owned drawing and UI hit testing require the same snapshot as the native base image. */
export function requiresBrowserViewportSnapshot(entities: readonly { components: Record<string, unknown> }[]): boolean {
  return entities.some(({ components: c }) => c.SpineSkeleton || c.Button || c.Toggle || c.Slider || c.Scrollbar || c.InputField || c.Dropdown || c.ListView || c.ScrollView || c.TabView);
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
    const profile = { ...frame.profile, uploadMs: performance.now() - started, nativeTransport: isSharedNativeViewportFrame(buffer) ? 'shared-buffer' as const : 'binary-ipc' as const };
    return { width: frame.width, height: frame.height, hasAuthoredCamera: frame.hasAuthoredCamera, profile, image };
  } finally { releaseNativeViewportFrame(buffer); }
}
