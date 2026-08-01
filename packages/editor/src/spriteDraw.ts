/** Load & draw project sprites for editor UI canvas. */

import {
  resolveSpriteId,
  resolveSpriteSourceRect,
  resolveSpriteTextureId,
  spriteAssetUrl,
} from './spriteLibrary';
import { readProjectAssetBytes } from './projectAssets';
import { isDesktopEditor } from './transport/editorTransport';
import { planNineSlice, type SpriteBorder } from './ui/nineSlice';
import { planTiledImage } from './ui/tiledImage';

const _cache = new Map<string, HTMLImageElement>();
const _alphaCache = new Map<string, {
  image: HTMLImageElement;
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
}>();

export function invalidateSpriteImage(sprite: string): void {
  const id = resolveSpriteTextureId(sprite);
  if (!id || id === 'white') return;
  _cache.delete(`desktop:${id}`);
  const url = spriteAssetUrl(id);
  if (url) _cache.delete(url);
  _alphaCache.clear();
}

export function getSpriteImage(sprite: string): HTMLImageElement | null {
  const id = resolveSpriteTextureId(sprite);
  if (!id || id === 'white') return null;
  if (isDesktopEditor()) {
    const cacheKey = `desktop:${id}`;
    let img = _cache.get(cacheKey);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      _cache.set(cacheKey, img);
      void readProjectAssetBytes(id)
        .then((bytes) => {
          const copy = new Uint8Array(bytes.byteLength);
          copy.set(bytes);
          const objectUrl = URL.createObjectURL(new Blob([copy.buffer]));
          img!.addEventListener('load', () => URL.revokeObjectURL(objectUrl), { once: true });
          img!.addEventListener('error', () => URL.revokeObjectURL(objectUrl), { once: true });
          img!.src = objectUrl;
        })
        .catch(() => _cache.delete(cacheKey));
    }
    return img;
  }
  const url = spriteAssetUrl(id);
  if (!url) return null;

  let img = _cache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    _cache.set(url, img);
  }
  return img;
}

export function getSpriteSourceRect(
  sprite: string,
  image: HTMLImageElement,
): [number, number, number, number] {
  const authored = resolveSpriteSourceRect(sprite);
  if (!authored) return [0, 0, image.naturalWidth, image.naturalHeight];
  const x = Math.max(0, Math.min(image.naturalWidth, authored[0]));
  const y = Math.max(0, Math.min(image.naturalHeight, authored[1]));
  const width = Math.max(0, Math.min(image.naturalWidth - x, authored[2]));
  const height = Math.max(0, Math.min(image.naturalHeight - y, authored[3]));
  return width > 0 && height > 0
    ? [x, y, width, height]
    : [0, 0, image.naturalWidth, image.naturalHeight];
}

function spriteAlphaPixels(sprite: string): {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
} | null {
  const image = getSpriteImage(sprite);
  if (!image || !image.complete || image.naturalWidth < 1 || image.naturalHeight < 1) return null;
  const source = getSpriteSourceRect(sprite, image);
  const width = Math.max(1, Math.round(source[2]));
  const height = Math.max(1, Math.round(source[3]));
  const key = `${resolveSpriteId(sprite)}:${source.join(',')}`;
  const cached = _alphaCache.get(key);
  if (cached?.image === image && cached.width === width && cached.height === height) return cached;
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, source[0], source[1], source[2], source[3], 0, 0, width, height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const alpha = new Uint8ClampedArray(width * height);
    for (let sourceIndex = 3, targetIndex = 0; sourceIndex < rgba.length; sourceIndex += 4) {
      alpha[targetIndex++] = rgba[sourceIndex];
    }
    const entry = { image, width, height, alpha };
    _alphaCache.set(key, entry);
    return entry;
  } catch {
    // Match Unity: an unreadable texture logs there but must not make the Graphic unclickable.
    return null;
  }
}

/** Bilinear Sprite alpha sampling for Image.alphaHitTestMinimumThreshold. */
export function sampleSpriteAlpha(sprite: string, u: number, v: number): number | null {
  const id = resolveSpriteId(sprite);
  if (!id || id === 'white') return 1;
  const pixels = spriteAlphaPixels(sprite);
  if (!pixels) return null;
  const x = Math.max(0, Math.min(pixels.width - 1, u * pixels.width - 0.5));
  const y = Math.max(0, Math.min(pixels.height - 1, v * pixels.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(pixels.width - 1, x0 + 1);
  const y1 = Math.min(pixels.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (px: number, py: number) => pixels.alpha[py * pixels.width + px] / 255;
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Pixel size of sprite (Unity SetNativeSize). Resolves when image loads. */
export function loadSpriteNativeSize(
  sprite: string,
): Promise<{ w: number; h: number } | null> {
  const id = resolveSpriteId(sprite);
  if (!id || id === 'white') {
    return Promise.resolve({ w: 100, h: 100 });
  }
  const img = getSpriteImage(sprite);
  if (!img) return Promise.resolve(null);

  if (img.complete && img.naturalWidth > 0) {
    const source = getSpriteSourceRect(sprite, img);
    return Promise.resolve({ w: source[2], h: source[3] });
  }

  return new Promise((resolve) => {
    const done = () => {
      if (img.naturalWidth > 0) {
        const source = getSpriteSourceRect(sprite, img);
        resolve({ w: source[2], h: source[3] });
      } else {
        resolve(null);
      }
    };
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
  });
}

/** Draw sprite into rect; applies rgba tint. Returns true if texture drawn. */
export function drawSpriteInRect(
  ctx: CanvasRenderingContext2D,
  sprite: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
): boolean {
  const img = getSpriteImage(sprite);
  if (!img || !img.complete || img.naturalWidth < 1) return false;

  drawSpriteRegion(
    ctx,
    img,
    getSpriteSourceRect(sprite, img),
    [x, y, w, h],
    color,
  );
  return true;
}

export function drawSpriteSlicedInRect(
  ctx: CanvasRenderingContext2D,
  sprite: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
  sourceBorder: SpriteBorder,
  destinationBorder: SpriteBorder = sourceBorder,
  sourceSize?: [number, number],
  fillCenter = true,
): boolean {
  const img = getSpriteImage(sprite);
  if (!img || !img.complete || img.naturalWidth < 1 || img.naturalHeight < 1) return false;
  const sourceRect = getSpriteSourceRect(sprite, img);
  const logicalSource: [number, number] = [
    Math.max(1, Number(sourceSize?.[0]) || sourceRect[2]),
    Math.max(1, Number(sourceSize?.[1]) || sourceRect[3]),
  ];
  const regions = planNineSlice(
    logicalSource,
    [w, h],
    sourceBorder,
    destinationBorder,
    fillCenter,
  );
  if (!regions.length) return false;
  for (const region of regions) {
    drawSpriteRegion(
      ctx,
      img,
      [
        sourceRect[0] + region.source.x * sourceRect[2] / logicalSource[0],
        sourceRect[1] + region.source.y * sourceRect[3] / logicalSource[1],
        region.source.w * sourceRect[2] / logicalSource[0],
        region.source.h * sourceRect[3] / logicalSource[1],
      ],
      [x + region.destination.x, y + region.destination.y, region.destination.w, region.destination.h],
      color,
    );
  }
  return true;
}

export function drawSpriteTiledInRect(
  ctx: CanvasRenderingContext2D,
  sprite: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
  sourceBorder: SpriteBorder,
  destinationBorder: SpriteBorder,
  sourceSize: [number, number],
  pixelScale: number,
  fillCenter = true,
): boolean {
  const img = getSpriteImage(sprite);
  if (!img || !img.complete || img.naturalWidth < 1 || img.naturalHeight < 1) return false;
  const sourceRect = getSpriteSourceRect(sprite, img);
  const logicalSource: [number, number] = [
    Math.max(1, Number(sourceSize[0]) || sourceRect[2]),
    Math.max(1, Number(sourceSize[1]) || sourceRect[3]),
  ];
  const regions = planTiledImage(
    logicalSource,
    [w, h],
    sourceBorder,
    destinationBorder,
    pixelScale,
    fillCenter,
  );
  if (!regions.length) return false;
  for (const region of regions) {
    drawSpriteRegion(
      ctx,
      img,
      [
        sourceRect[0] + region.source.x * sourceRect[2] / logicalSource[0],
        sourceRect[1] + region.source.y * sourceRect[3] / logicalSource[1],
        region.source.w * sourceRect[2] / logicalSource[0],
        region.source.h * sourceRect[3] / logicalSource[1],
      ],
      [x + region.destination.x, y + region.destination.y, region.destination.w, region.destination.h],
      color,
    );
  }
  return true;
}

export function drawSpriteUvInRect(
  ctx: CanvasRenderingContext2D,
  sprite: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: [number, number, number, number],
  uvRect: [number, number, number, number],
): boolean {
  const img = getSpriteImage(sprite);
  if (!img || !img.complete || img.naturalWidth < 1 || img.naturalHeight < 1) return false;
  const sourceRect = getSpriteSourceRect(sprite, img);
  const u0 = Math.max(0, Math.min(1, Number(uvRect[0]) || 0));
  const v0 = Math.max(0, Math.min(1, Number(uvRect[1]) || 0));
  const u1 = Math.max(0, Math.min(1, u0 + (Number(uvRect[2]) || 0)));
  const v1 = Math.max(0, Math.min(1, v0 + (Number(uvRect[3]) || 0)));
  if (u1 <= u0 || v1 <= v0) return false;
  drawSpriteRegion(
    ctx,
    img,
    [
      sourceRect[0] + u0 * sourceRect[2],
      sourceRect[1] + v0 * sourceRect[3],
      (u1 - u0) * sourceRect[2],
      (v1 - v0) * sourceRect[3],
    ],
    [x, y, w, h],
    color,
  );
  return true;
}

function drawSpriteRegion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  source: [number, number, number, number],
  destination: [number, number, number, number],
  color: [number, number, number, number],
): void {
  const [sx, sy, sw, sh] = source;
  const [x, y, w, h] = destination;

  const [cr, cg, cb, ca] = color;
  ctx.save();
  // destination-in 会清掉 clip 外像素；必须限制在目标矩形内
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.globalAlpha = Math.max(0, Math.min(1, ca));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);

  if (cr < 0.998 || cg < 0.998 || cb < 0.998) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0})`;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }
  ctx.restore();
}
