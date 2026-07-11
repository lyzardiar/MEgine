/** Load & draw project sprites for editor UI canvas. */

import { resolveSpriteId, spriteAssetUrl } from './spriteLibrary';

const _cache = new Map<string, HTMLImageElement>();

export function getSpriteImage(sprite: string): HTMLImageElement | null {
  const id = resolveSpriteId(sprite);
  if (!id || id === 'white') return null;
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
    return Promise.resolve({ w: img.naturalWidth, h: img.naturalHeight });
  }

  return new Promise((resolve) => {
    const done = () => {
      if (img.naturalWidth > 0) {
        resolve({ w: img.naturalWidth, h: img.naturalHeight });
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

  const [cr, cg, cb, ca] = color;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, ca));
  ctx.drawImage(img, x, y, w, h);

  if (cr < 0.998 || cg < 0.998 || cb < 0.998) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${(cr * 255) | 0},${(cg * 255) | 0},${(cb * 255) | 0})`;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.globalAlpha = 1;
    ctx.drawImage(img, x, y, w, h);
  }
  ctx.restore();
  return true;
}
