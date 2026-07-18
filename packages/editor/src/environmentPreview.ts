import type { Camera } from './math3d.ts';
import { loadProjectImage, readProjectAssetBytes } from './projectAssets.ts';

export type LinearPanorama = {
  width: number;
  height: number;
  pixels: Float32Array;
  previews?: Map<number, HTMLCanvasElement>;
};

export type EnvironmentBackground = {
  sky_color?: unknown;
  equator_color?: unknown;
  ground_color?: unknown;
  texture?: unknown;
  rotation_degrees?: unknown;
  background_enabled?: unknown;
  background_intensity?: unknown;
  exposure?: unknown;
};

type ViewportRect = { x: number; y: number; w: number; h: number };
type PreviewEntry =
  | { state: 'loading' }
  | { state: 'ready'; panorama: LinearPanorama }
  | { state: 'failed' };

const previewCache = new Map<string, PreviewEntry>();

export function invalidateEnvironmentPreviews(): void {
  previewCache.clear();
}

export function drawEnvironmentBackground(
  context: CanvasRenderingContext2D,
  viewport: ViewportRect,
  camera: Camera,
  component: EnvironmentBackground | undefined,
): boolean {
  if (!component || component.background_enabled === false) return false;
  const intensity = finiteNumber(component.background_intensity, 1, 0, 65_504);
  const exposure = finiteNumber(component.exposure, 0, -16, 16);
  const effectiveExposure = intensity > 0 ? exposure + Math.log2(intensity) : -32;
  const texture = String(component.texture ?? '').trim().replace(/\\/g, '/');
  const panorama = texture ? requestPanorama(texture) : null;
  if (panorama) {
    drawPanorama(
      context,
      viewport,
      camera,
      panoramaCanvas(panorama, effectiveExposure),
      finiteNumber(component.rotation_degrees, 0, -1_000_000, 1_000_000),
    );
    return true;
  }

  const gradient = context.createLinearGradient(
    viewport.x,
    viewport.y,
    viewport.x,
    viewport.y + viewport.h,
  );
  gradient.addColorStop(
    0,
    toneMappedCss(color3(component.sky_color, [0.18, 0.28, 0.5]), effectiveExposure),
  );
  gradient.addColorStop(
    0.5,
    toneMappedCss(
      color3(component.equator_color, [0.12, 0.14, 0.18]),
      effectiveExposure,
    ),
  );
  gradient.addColorStop(
    1,
    toneMappedCss(
      color3(component.ground_color, [0.035, 0.04, 0.05]),
      effectiveExposure,
    ),
  );
  context.fillStyle = gradient;
  context.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);
  return true;
}

function requestPanorama(path: string): LinearPanorama | null {
  const cached = previewCache.get(path);
  if (cached?.state === 'ready') return cached.panorama;
  if (cached) return null;
  previewCache.set(path, { state: 'loading' });
  void loadPanorama(path)
    .then((panorama) => previewCache.set(path, { state: 'ready', panorama }))
    .catch(() => previewCache.set(path, { state: 'failed' }));
  return null;
}

async function loadPanorama(path: string): Promise<LinearPanorama> {
  if (/\.hdr$/i.test(path)) {
    return decodeRadianceHdr(await readProjectAssetBytes(path));
  }
  if (/\.exr$/i.test(path)) {
    throw new Error('OpenEXR browser preview is not available');
  }
  const image = await loadProjectImage(path);
  const scale = Math.min(
    1,
    1024 / Math.max(1, image.naturalWidth),
    512 / Math.max(1, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas is unavailable');
  context.drawImage(image, 0, 0, width, height);
  const rgba = context.getImageData(0, 0, width, height).data;
  const pixels = new Float32Array(width * height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    pixels[target] = srgbToLinear(rgba[source] / 255);
    pixels[target + 1] = srgbToLinear(rgba[source + 1] / 255);
    pixels[target + 2] = srgbToLinear(rgba[source + 2] / 255);
  }
  return { width, height, pixels };
}

function panoramaCanvas(panorama: LinearPanorama, exposure: number): HTMLCanvasElement {
  const key = Math.round(Math.max(-32, Math.min(32, exposure)) * 16);
  panorama.previews ??= new Map();
  const cached = panorama.previews.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = panorama.width;
  canvas.height = panorama.height;
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const image = context.createImageData(panorama.width, panorama.height);
  const multiplier = 2 ** (key / 16);
  for (
    let source = 0, target = 0;
    source < panorama.pixels.length;
    source += 3, target += 4
  ) {
    image.data[target] = displayByte(panorama.pixels[source] * multiplier);
    image.data[target + 1] = displayByte(panorama.pixels[source + 1] * multiplier);
    image.data[target + 2] = displayByte(panorama.pixels[source + 2] * multiplier);
    image.data[target + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  panorama.previews.set(key, canvas);
  if (panorama.previews.size > 8) {
    panorama.previews.delete(panorama.previews.keys().next().value!);
  }
  return canvas;
}

function drawPanorama(
  context: CanvasRenderingContext2D,
  viewport: ViewportRect,
  camera: Camera,
  panorama: HTMLCanvasElement,
  rotationDegrees: number,
): void {
  const forward = normalize([
    camera.target[0] - camera.eye[0],
    camera.target[1] - camera.eye[1],
    camera.target[2] - camera.eye[2],
  ]);
  const rotation = (rotationDegrees * Math.PI) / 180;
  const rotated = [
    Math.cos(rotation) * forward[0] + Math.sin(rotation) * forward[2],
    forward[1],
    -Math.sin(rotation) * forward[0] + Math.cos(rotation) * forward[2],
  ];
  const longitude = Math.atan2(rotated[2], rotated[0]);
  const latitude = Math.acos(Math.max(-1, Math.min(1, rotated[1])));
  const centerU = longitude / (Math.PI * 2) + 0.5;
  const centerV = latitude / Math.PI;
  const fovY = Math.max(1, Math.min(179, camera.fovYDeg)) * Math.PI / 180;
  const fovX = camera.projection === 'orthographic'
    ? fovY * Math.max(1, viewport.w / Math.max(1, viewport.h))
    : 2 * Math.atan(Math.tan(fovY * 0.5) * viewport.w / Math.max(1, viewport.h));
  const sourceWidth = Math.max(1, panorama.width * fovX / (Math.PI * 2));
  const sourceHeight = Math.max(
    1,
    Math.min(panorama.height, panorama.height * fovY / Math.PI),
  );
  const sourceStart = centerU * panorama.width - sourceWidth * 0.5;
  const sourceEnd = sourceStart + sourceWidth;
  const sourceY = Math.max(
    0,
    Math.min(
      panorama.height - sourceHeight,
      centerV * panorama.height - sourceHeight * 0.5,
    ),
  );
  const firstTile = Math.floor(sourceStart / panorama.width);
  const lastTile = Math.floor((sourceEnd - Number.EPSILON) / panorama.width);
  for (let tile = firstTile; tile <= lastTile; tile++) {
    const segmentStart = Math.max(sourceStart, tile * panorama.width);
    const segmentEnd = Math.min(sourceEnd, (tile + 1) * panorama.width);
    const segmentWidth = segmentEnd - segmentStart;
    if (segmentWidth <= 0) continue;
    const destinationX = viewport.x
      + (segmentStart - sourceStart) / sourceWidth * viewport.w;
    const destinationWidth = segmentWidth / sourceWidth * viewport.w;
    context.drawImage(
      panorama,
      segmentStart - tile * panorama.width,
      sourceY,
      segmentWidth,
      sourceHeight,
      destinationX,
      viewport.y,
      destinationWidth,
      viewport.h,
    );
  }
}

export function decodeRadianceHdr(
  bytes: Uint8Array,
  maxWidth = 1024,
  maxHeight = 512,
): LinearPanorama {
  let offset = 0;
  const decoder = new TextDecoder();
  const readLine = (): string => {
    const start = offset;
    while (offset < bytes.length && bytes[offset] !== 10) offset++;
    if (offset >= bytes.length) throw new Error('truncated Radiance HDR header');
    const end = offset > start && bytes[offset - 1] === 13 ? offset - 1 : offset;
    offset++;
    return decoder.decode(bytes.subarray(start, end));
  };
  if (!readLine().startsWith('#?')) throw new Error('invalid Radiance HDR signature');
  while (readLine() !== '') {
    // Metadata is optional; the engine only needs RGBE scanlines.
  }
  const resolution = /^([+-])Y\s+(\d+)\s+([+-])X\s+(\d+)$/i.exec(readLine().trim());
  if (!resolution) throw new Error('unsupported Radiance HDR orientation');
  const ySign = resolution[1];
  const sourceHeight = Number(resolution[2]);
  const xSign = resolution[3];
  const sourceWidth = Number(resolution[4]);
  if (
    !Number.isInteger(sourceWidth)
    || !Number.isInteger(sourceHeight)
    || sourceWidth <= 0
    || sourceHeight <= 0
  ) {
    throw new Error('invalid Radiance HDR dimensions');
  }
  if (sourceWidth > 65_535 || sourceHeight > 65_535) {
    throw new Error('Radiance HDR dimensions exceed editor preview limits');
  }
  const previewWidth = finiteNumber(maxWidth, 1024, 1, 4096);
  const previewHeight = finiteNumber(maxHeight, 512, 1, 4096);
  const scale = Math.min(1, previewWidth / sourceWidth, previewHeight / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const pixels = new Float32Array(width * height * 3);
  const scanline = new Uint8Array(sourceWidth * 4);
  const channels = Array.from({ length: 4 }, () => new Uint8Array(sourceWidth));

  for (let sourceY = 0; sourceY < sourceHeight; sourceY++) {
    const modernRle = sourceWidth >= 8
      && sourceWidth <= 0x7fff
      && offset + 4 <= bytes.length
      && bytes[offset] === 2
      && bytes[offset + 1] === 2
      && (bytes[offset + 2] & 0x80) === 0;
    if (modernRle) {
      const encodedWidth = (bytes[offset + 2] << 8) | bytes[offset + 3];
      offset += 4;
      if (encodedWidth !== sourceWidth) {
        throw new Error('Radiance HDR scanline width mismatch');
      }
      for (let channel = 0; channel < 4; channel++) {
        let cursor = 0;
        while (cursor < sourceWidth) {
          if (offset >= bytes.length) throw new Error('truncated Radiance HDR RLE data');
          const code = bytes[offset++];
          if (code > 128) {
            const count = code - 128;
            if (count === 0 || cursor + count > sourceWidth || offset >= bytes.length) {
              throw new Error('invalid Radiance HDR RLE run');
            }
            channels[channel].fill(bytes[offset++], cursor, cursor + count);
            cursor += count;
          } else {
            const count = code;
            if (
              count === 0
              || cursor + count > sourceWidth
              || offset + count > bytes.length
            ) {
              throw new Error('invalid Radiance HDR RLE literal');
            }
            channels[channel].set(bytes.subarray(offset, offset + count), cursor);
            offset += count;
            cursor += count;
          }
        }
      }
      for (let x = 0; x < sourceWidth; x++) {
        scanline[x * 4] = channels[0][x];
        scanline[x * 4 + 1] = channels[1][x];
        scanline[x * 4 + 2] = channels[2][x];
        scanline[x * 4 + 3] = channels[3][x];
      }
    } else {
      let cursor = 0;
      let repeatShift = 0;
      while (cursor < sourceWidth) {
        if (offset + 4 > bytes.length) throw new Error('truncated Radiance HDR pixel data');
        const red = bytes[offset++];
        const green = bytes[offset++];
        const blue = bytes[offset++];
        const exponent = bytes[offset++];
        if (red === 1 && green === 1 && blue === 1) {
          const count = exponent * 2 ** repeatShift;
          if (cursor === 0 || count <= 0 || cursor + count > sourceWidth) {
            throw new Error('invalid legacy Radiance HDR RLE run');
          }
          const previous = (cursor - 1) * 4;
          for (let repeat = 0; repeat < count; repeat++, cursor++) {
            scanline.set(scanline.subarray(previous, previous + 4), cursor * 4);
          }
          repeatShift += 8;
        } else {
          const target = cursor * 4;
          scanline[target] = red;
          scanline[target + 1] = green;
          scanline[target + 2] = blue;
          scanline[target + 3] = exponent;
          cursor++;
          repeatShift = 0;
        }
      }
    }

    const orientedY = ySign === '-' ? sourceY : sourceHeight - 1 - sourceY;
    const targetY = Math.min(
      height - 1,
      Math.floor((orientedY + 0.5) * height / sourceHeight),
    );
    for (let targetX = 0; targetX < width; targetX++) {
      let sourceX = Math.min(
        sourceWidth - 1,
        Math.floor((targetX + 0.5) * sourceWidth / width),
      );
      if (xSign === '-') sourceX = sourceWidth - 1 - sourceX;
      const source = sourceX * 4;
      const exponent = scanline[source + 3];
      const target = (targetY * width + targetX) * 3;
      if (exponent === 0) continue;
      const factor = 2 ** (exponent - 136);
      pixels[target] = scanline[source] * factor;
      pixels[target + 1] = scanline[source + 1] * factor;
      pixels[target + 2] = scanline[source + 2] * factor;
    }
  }
  return { width, height, pixels };
}

function normalize(value: number[]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length > 1e-8
    ? [value[0] / length, value[1] / length, value[2] / length]
    : [0, 0, -1];
}

function finiteNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function color3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value)) return fallback;
  return [0, 1, 2].map((index) =>
    finiteNumber(value[index], fallback[index], 0, 65_504)) as [number, number, number];
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

function acesFitted(value: number): number {
  return Math.max(
    0,
    Math.min(
      1,
      value * (2.51 * value + 0.03) / (value * (2.43 * value + 0.59) + 0.14),
    ),
  );
}

function displayByte(value: number): number {
  return Math.round(
    Math.max(0, Math.min(1, linearToSrgb(acesFitted(Math.max(0, value))))) * 255,
  );
}

function toneMappedCss(color: [number, number, number], exposure: number): string {
  const multiplier = 2 ** Math.max(-32, Math.min(32, exposure));
  return `rgb(${displayByte(color[0] * multiplier)},${displayByte(color[1] * multiplier)},${displayByte(color[2] * multiplier)})`;
}
