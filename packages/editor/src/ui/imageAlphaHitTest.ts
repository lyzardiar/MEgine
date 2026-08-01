import type { SpriteBorder } from './nineSlice';

export type ImageAlphaHitTestGeometry = {
  imageType: 'Simple' | 'Sliced' | 'Tiled' | 'Filled';
  sourceSize: [number, number];
  sourceBorder: SpriteBorder;
  destinationBorder: SpriteBorder;
  pixelScale: number;
  fillCenter: boolean;
};

type Point = { x: number; y: number };

const MAX_TILED_IMAGE_QUADS = 16_250;

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function splitAxis(total: number, start: number, end: number): [number, number, number, number] {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(0, Number(end) || 0);
  const sum = safeStart + safeEnd;
  const scale = sum > safeTotal && sum > 0 ? safeTotal / sum : 1;
  return [0, safeStart * scale, safeTotal - safeEnd * scale, safeTotal];
}

function mapStretchedAxis(
  point: number,
  source: [number, number, number, number],
  destination: [number, number, number, number],
): number {
  if (point <= destination[1] && destination[1] > destination[0]) {
    return source[0] + (point - destination[0]) * (source[1] - source[0])
      / (destination[1] - destination[0]);
  }
  if (point >= destination[2] && destination[3] > destination[2]) {
    return source[2] + (point - destination[2]) * (source[3] - source[2])
      / (destination[3] - destination[2]);
  }
  const destinationCenter = destination[2] - destination[1];
  if (!positive(destinationCenter)) return source[1];
  return source[1] + (point - destination[1]) * (source[2] - source[1]) / destinationCenter;
}

function tiledScale(
  sourceSize: [number, number],
  destinationSize: [number, number],
  sourceBorder: SpriteBorder,
  destinationBorder: SpriteBorder,
  pixelScale: number,
  fillCenter: boolean,
): number {
  const sx = splitAxis(sourceSize[0], sourceBorder[0], sourceBorder[2]);
  const sy = splitAxis(sourceSize[1], sourceBorder[3], sourceBorder[1]);
  const dx = splitAxis(destinationSize[0], destinationBorder[0], destinationBorder[2]);
  const dy = splitAxis(destinationSize[1], destinationBorder[3], destinationBorder[1]);
  const sourceCenterWidth = sx[2] - sx[1];
  const sourceCenterHeight = sy[2] - sy[1];
  const destinationCenterWidth = dx[2] - dx[1];
  const destinationCenterHeight = dy[2] - dy[1];
  const baseScale = positive(pixelScale) ? pixelScale : 1;
  const leftValid = positive(sx[1] - sx[0]) && positive(dx[1] - dx[0]);
  const rightValid = positive(sx[3] - sx[2]) && positive(dx[3] - dx[2]);
  const topValid = positive(sy[1] - sy[0]) && positive(dy[1] - dy[0]);
  const bottomValid = positive(sy[3] - sy[2]) && positive(dy[3] - dy[2]);
  const hasBorder = sourceBorder.some((value) => positive(value));
  const renderCenter = fillCenter || !hasBorder;

  const quadCount = (scale: number): number => {
    const tileWidth = sourceCenterWidth * baseScale * scale;
    const tileHeight = sourceCenterHeight * baseScale * scale;
    const cap = MAX_TILED_IMAGE_QUADS + 1;
    const columns = positive(destinationCenterWidth) && positive(tileWidth)
      ? Math.min(cap, Math.ceil(destinationCenterWidth / tileWidth))
      : 0;
    const rows = positive(destinationCenterHeight) && positive(tileHeight)
      ? Math.min(cap, Math.ceil(destinationCenterHeight / tileHeight))
      : 0;
    return Math.min(
      cap,
      Number(leftValid && topValid)
        + Number(rightValid && topValid)
        + Number(leftValid && bottomValid)
        + Number(rightValid && bottomValid)
        + columns * (Number(topValid) + Number(bottomValid))
        + rows * (Number(leftValid) + Number(rightValid))
        + (renderCenter ? columns * rows : 0),
    );
  };

  if (quadCount(1) <= MAX_TILED_IMAGE_QUADS) return 1;
  let low = 1;
  let high = 2;
  while (quadCount(high) > MAX_TILED_IMAGE_QUADS) high *= 2;
  for (let iteration = 0; iteration < 40; iteration++) {
    const middle = (low + high) * 0.5;
    if (quadCount(middle) > MAX_TILED_IMAGE_QUADS) low = middle;
    else high = middle;
  }
  return high;
}

function mapTiledAxis(
  point: number,
  source: [number, number, number, number],
  destination: [number, number, number, number],
  tileSize: number,
): number {
  if (point <= destination[1] || point >= destination[2]) {
    return mapStretchedAxis(point, source, destination);
  }
  const sourceCenter = source[2] - source[1];
  if (!positive(sourceCenter) || !positive(tileSize)) {
    return mapStretchedAxis(point, source, destination);
  }
  const offset = Math.max(0, point - destination[1]);
  const withinTile = offset % tileSize;
  return source[1] + withinTile * sourceCenter / tileSize;
}

/** Map a top-left destination point to normalized Sprite texture coordinates. */
export function mapImageAlphaPoint(
  point: Point,
  destinationSize: [number, number],
  geometry: ImageAlphaHitTestGeometry,
): Point | null {
  const sourceWidth = Number(geometry.sourceSize[0]);
  const sourceHeight = Number(geometry.sourceSize[1]);
  const destinationWidth = Number(destinationSize[0]);
  const destinationHeight = Number(destinationSize[1]);
  if (![sourceWidth, sourceHeight, destinationWidth, destinationHeight].every(positive)) return null;

  const x = Math.max(0, Math.min(destinationWidth, point.x));
  const y = Math.max(0, Math.min(destinationHeight, point.y));
  if (geometry.imageType === 'Simple' || geometry.imageType === 'Filled') {
    return { x: x / destinationWidth, y: y / destinationHeight };
  }

  const sx = splitAxis(sourceWidth, geometry.sourceBorder[0], geometry.sourceBorder[2]);
  const sy = splitAxis(sourceHeight, geometry.sourceBorder[3], geometry.sourceBorder[1]);
  const dx = splitAxis(destinationWidth, geometry.destinationBorder[0], geometry.destinationBorder[2]);
  const dy = splitAxis(destinationHeight, geometry.destinationBorder[3], geometry.destinationBorder[1]);
  if (geometry.imageType === 'Sliced') {
    return {
      x: mapStretchedAxis(x, sx, dx) / sourceWidth,
      y: mapStretchedAxis(y, sy, dy) / sourceHeight,
    };
  }

  const scale = tiledScale(
    geometry.sourceSize,
    destinationSize,
    geometry.sourceBorder,
    geometry.destinationBorder,
    geometry.pixelScale,
    geometry.fillCenter,
  );
  const baseScale = positive(geometry.pixelScale) ? geometry.pixelScale : 1;
  return {
    x: mapTiledAxis(x, sx, dx, (sx[2] - sx[1]) * baseScale * scale) / sourceWidth,
    y: mapTiledAxis(y, sy, dy, (sy[2] - sy[1]) * baseScale * scale) / sourceHeight,
  };
}

/** Unity Image.IsRaycastLocationValid semantics; unreadable textures fail open. */
export function imageAlphaHitTest(
  point: Point,
  destinationSize: [number, number],
  geometry: ImageAlphaHitTestGeometry,
  threshold: number,
  sampleAlpha: (u: number, v: number) => number | null,
): boolean {
  if (!Number.isFinite(threshold) || threshold <= 0) return true;
  const mapped = mapImageAlphaPoint(point, destinationSize, geometry);
  if (!mapped) return true;
  const alpha = sampleAlpha(mapped.x, mapped.y);
  return alpha == null || alpha >= threshold;
}

/** Perspective-correct UV lookup for projected World Space Canvas quads. */
export function projectedQuadUv(
  corners: Point[],
  point: Point,
  inverseW?: readonly number[],
): Point | null {
  if (corners.length !== 4) return null;
  const triangles = [
    { indices: [0, 1, 2], uv: [[0, 0], [1, 0], [1, 1]] },
    { indices: [0, 2, 3], uv: [[0, 0], [1, 1], [0, 1]] },
  ] as const;
  for (const triangle of triangles) {
    const [a, b, c] = triangle.indices.map((index) => corners[index]);
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) <= 1e-6) continue;
    const barycentric = [
      ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / denominator,
      ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / denominator,
    ];
    barycentric.push(1 - barycentric[0] - barycentric[1]);
    if (barycentric.some((weight) => weight < -1e-4)) continue;
    const corrected = barycentric.map((weight, index) => {
      const vertex = triangle.indices[index];
      const invW = inverseW?.[vertex];
      return weight * (Number.isFinite(invW) && Number(invW) > 0 ? Number(invW) : 1);
    });
    const weight = corrected[0] + corrected[1] + corrected[2];
    if (weight <= 1e-8) continue;
    return {
      x: corrected.reduce((sum, value, index) => sum + value * triangle.uv[index][0], 0) / weight,
      y: corrected.reduce((sum, value, index) => sum + value * triangle.uv[index][1], 0) / weight,
    };
  }
  return null;
}
