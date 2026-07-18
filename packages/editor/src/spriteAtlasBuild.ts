import {
  loadProjectImage,
  writeProjectAssetBytes,
  writeProjectAssetText,
} from './projectAssets';
import {
  refreshSprites,
  resolveSpritePivot,
  resolveSpriteSourceRect,
  resolveSpriteTextureId,
} from './spriteLibrary';
import {
  serializeSpriteImportSettings,
  spriteImportPath,
  type SpriteImportSettings,
} from './spriteImport';
import {
  planSpriteAtlas,
  spriteAtlasTexturePath,
  type SpriteAtlasAsset,
  type SpriteAtlasPlan,
} from './spriteAtlas';

export type BuiltSpriteAtlas = {
  texturePath: string;
  importPath: string;
  plan: SpriteAtlasPlan;
};

function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('browser could not encode the sprite atlas PNG'));
        return;
      }
      void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png');
  });
}

function drawExtrudedSprite(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: [number, number, number, number],
  destination: [number, number, number, number],
  extrusion: number,
): void {
  const [sx, sy, sw, sh] = source;
  const [dx, dy, dw, dh] = destination;
  context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
  if (extrusion <= 0) return;
  context.drawImage(image, sx, sy, 1, sh, dx - extrusion, dy, extrusion, dh);
  context.drawImage(image, sx + sw - 1, sy, 1, sh, dx + dw, dy, extrusion, dh);
  context.drawImage(image, sx, sy, sw, 1, dx, dy - extrusion, dw, extrusion);
  context.drawImage(image, sx, sy + sh - 1, sw, 1, dx, dy + dh, dw, extrusion);
  context.drawImage(image, sx, sy, 1, 1, dx - extrusion, dy - extrusion, extrusion, extrusion);
  context.drawImage(image, sx + sw - 1, sy, 1, 1, dx + dw, dy - extrusion, extrusion, extrusion);
  context.drawImage(image, sx, sy + sh - 1, 1, 1, dx - extrusion, dy + dh, extrusion, extrusion);
  context.drawImage(image, sx + sw - 1, sy + sh - 1, 1, 1, dx + dw, dy + dh, extrusion, extrusion);
}

export async function buildSpriteAtlas(
  assetPath: string,
  asset: SpriteAtlasAsset,
): Promise<BuiltSpriteAtlas> {
  if (!asset.sprites.length) throw new Error('add at least one sprite before packing the atlas');
  await refreshSprites();
  const texturePath = spriteAtlasTexturePath(assetPath);
  const imageCache = new Map<string, Promise<HTMLImageElement>>();
  const loaded = await Promise.all(asset.sprites.map(async (reference) => {
    const sourceTexture = resolveSpriteTextureId(reference);
    if (sourceTexture.toLocaleLowerCase() === texturePath.toLocaleLowerCase()) {
      throw new Error('an atlas cannot include its own generated texture');
    }
    let promise = imageCache.get(sourceTexture);
    if (!promise) {
      promise = loadProjectImage(sourceTexture);
      imageCache.set(sourceTexture, promise);
    }
    const image = await promise;
    const authored = resolveSpriteSourceRect(reference);
    const x = Math.max(0, Math.min(image.naturalWidth, Number(authored?.[0] ?? 0)));
    const y = Math.max(0, Math.min(image.naturalHeight, Number(authored?.[1] ?? 0)));
    const width = Math.max(0, Math.min(image.naturalWidth - x, Number(authored?.[2] ?? image.naturalWidth)));
    const height = Math.max(0, Math.min(image.naturalHeight - y, Number(authored?.[3] ?? image.naturalHeight)));
    if (width <= 0 || height <= 0) throw new Error(`sprite '${reference}' has an empty source rectangle`);
    return {
      reference,
      image,
      source: [x, y, width, height] as [number, number, number, number],
      pivot: resolveSpritePivot(reference),
    };
  }));
  const plan = planSpriteAtlas(loaded.map((source) => ({
    reference: source.reference,
    width: source.source[2],
    height: source.source[3],
    pivot: source.pivot,
  })), asset.max_size, asset.padding);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable for sprite atlas packing');
  context.clearRect(0, 0, plan.width, plan.height);
  context.imageSmoothingEnabled = false;
  const sourceByReference = new Map(loaded.map((source) => [source.reference.toLocaleLowerCase(), source]));
  const extrusion = Math.floor(asset.padding * 0.5);
  for (const entry of plan.entries) {
    const source = sourceByReference.get(entry.reference.toLocaleLowerCase());
    if (!source) throw new Error(`atlas source disappeared: ${entry.reference}`);
    drawExtrudedSprite(
      context,
      source.image,
      source.source,
      entry.rect,
      extrusion,
    );
  }
  const png = await canvasPng(canvas);
  const importSettings: SpriteImportSettings = {
    version: 1,
    mode: 'multiple',
    pixels_per_unit: asset.pixels_per_unit,
    slices: plan.entries.map((entry) => ({
      name: entry.name,
      rect: [...entry.rect],
      pivot: [...entry.pivot],
    })),
  };
  const importPath = spriteImportPath(texturePath);
  await writeProjectAssetBytes(texturePath, png);
  await writeProjectAssetText(
    importPath,
    serializeSpriteImportSettings(importSettings, [plan.width, plan.height]),
  );
  return { texturePath, importPath, plan };
}
