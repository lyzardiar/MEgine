import type { NineSliceRegion, SpriteBorder } from './nineSlice';

/** Unity uGUI limits generated Tiled Image meshes to this many quads. */
export const MAX_TILED_IMAGE_QUADS = 16_250;

function splitAxis(total: number, start: number, end: number): [number, number, number, number] {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(0, Number(end) || 0);
  const sum = safeStart + safeEnd;
  const scale = sum > safeTotal && sum > 0 ? safeTotal / sum : 1;
  return [0, safeStart * scale, safeTotal - safeEnd * scale, safeTotal];
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function planTiledImage(
  sourceSize: [number, number],
  destinationSize: [number, number],
  sourceBorder: SpriteBorder,
  destinationBorder: SpriteBorder = sourceBorder,
  pixelScale = 1,
  fillCenter = true,
  maxQuads = MAX_TILED_IMAGE_QUADS,
): NineSliceRegion[] {
  const sourceWidth = Math.max(0, Number(sourceSize[0]) || 0);
  const sourceHeight = Math.max(0, Number(sourceSize[1]) || 0);
  const destinationWidth = Math.max(0, Number(destinationSize[0]) || 0);
  const destinationHeight = Math.max(0, Number(destinationSize[1]) || 0);
  if (!positive(sourceWidth) || !positive(sourceHeight) || !positive(destinationWidth) || !positive(destinationHeight)) return [];

  const sx = splitAxis(sourceWidth, sourceBorder[0], sourceBorder[2]);
  const sy = splitAxis(sourceHeight, sourceBorder[3], sourceBorder[1]);
  const dx = splitAxis(destinationWidth, destinationBorder[0], destinationBorder[2]);
  const dy = splitAxis(destinationHeight, destinationBorder[3], destinationBorder[1]);
  const sourceCenterWidth = sx[2] - sx[1];
  const sourceCenterHeight = sy[2] - sy[1];
  const destinationCenterWidth = dx[2] - dx[1];
  const destinationCenterHeight = dy[2] - dy[1];
  const baseScale = positive(Number(pixelScale)) ? Number(pixelScale) : 1;
  const hasBorder = sourceBorder.some((value) => positive(Number(value)));
  const renderCenter = fillCenter || !hasBorder;
  const budget = Math.max(9, Math.min(MAX_TILED_IMAGE_QUADS, Math.trunc(Number(maxQuads)) || MAX_TILED_IMAGE_QUADS));

  const leftValid = positive(sx[1] - sx[0]) && positive(dx[1] - dx[0]);
  const rightValid = positive(sx[3] - sx[2]) && positive(dx[3] - dx[2]);
  const topValid = positive(sy[1] - sy[0]) && positive(dy[1] - dy[0]);
  const bottomValid = positive(sy[3] - sy[2]) && positive(dy[3] - dy[2]);

  const counts = (scale: number) => {
    const tileWidth = sourceCenterWidth * baseScale * scale;
    const tileHeight = sourceCenterHeight * baseScale * scale;
    const cap = budget + 1;
    const columns = positive(destinationCenterWidth) && positive(tileWidth)
      ? Math.min(cap, Math.ceil(destinationCenterWidth / tileWidth))
      : 0;
    const rows = positive(destinationCenterHeight) && positive(tileHeight)
      ? Math.min(cap, Math.ceil(destinationCenterHeight / tileHeight))
      : 0;
    let total = 0;
    total += Number(leftValid && topValid) + Number(rightValid && topValid);
    total += Number(leftValid && bottomValid) + Number(rightValid && bottomValid);
    total += columns * (Number(topValid) + Number(bottomValid));
    total += rows * (Number(leftValid) + Number(rightValid));
    if (renderCenter) total += columns * rows;
    return { columns, rows, tileWidth, tileHeight, total: Math.min(cap, total) };
  };

  let tileScale = 1;
  if (counts(tileScale).total > budget) {
    let low = 1;
    let high = 2;
    while (counts(high).total > budget) high *= 2;
    for (let iteration = 0; iteration < 40; iteration++) {
      const middle = (low + high) * 0.5;
      if (counts(middle).total > budget) low = middle;
      else high = middle;
    }
    tileScale = high;
  }
  const { columns, rows, tileWidth, tileHeight } = counts(tileScale);
  const regions: NineSliceRegion[] = [];
  const add = (
    sourceX: number,
    sourceY: number,
    sourceW: number,
    sourceH: number,
    destinationX: number,
    destinationY: number,
    destinationW: number,
    destinationH: number,
  ) => {
    if (![sourceW, sourceH, destinationW, destinationH].every(positive)) return;
    regions.push({
      source: { x: sourceX, y: sourceY, w: sourceW, h: sourceH },
      destination: { x: destinationX, y: destinationY, w: destinationW, h: destinationH },
    });
  };

  add(sx[0], sy[0], sx[1] - sx[0], sy[1] - sy[0], dx[0], dy[0], dx[1] - dx[0], dy[1] - dy[0]);
  add(sx[2], sy[0], sx[3] - sx[2], sy[1] - sy[0], dx[2], dy[0], dx[3] - dx[2], dy[1] - dy[0]);
  add(sx[0], sy[2], sx[1] - sx[0], sy[3] - sy[2], dx[0], dy[2], dx[1] - dx[0], dy[3] - dy[2]);
  add(sx[2], sy[2], sx[3] - sx[2], sy[3] - sy[2], dx[2], dy[2], dx[3] - dx[2], dy[3] - dy[2]);

  for (let column = 0; column < columns; column++) {
    const destinationX = dx[1] + column * tileWidth;
    const width = Math.min(tileWidth, dx[2] - destinationX);
    const sourceW = sourceCenterWidth * width / tileWidth;
    add(sx[1], sy[0], sourceW, sy[1] - sy[0], destinationX, dy[0], width, dy[1] - dy[0]);
    add(sx[1], sy[2], sourceW, sy[3] - sy[2], destinationX, dy[2], width, dy[3] - dy[2]);
  }
  for (let row = 0; row < rows; row++) {
    const destinationY = dy[1] + row * tileHeight;
    const height = Math.min(tileHeight, dy[2] - destinationY);
    const sourceH = sourceCenterHeight * height / tileHeight;
    add(sx[0], sy[1], sx[1] - sx[0], sourceH, dx[0], destinationY, dx[1] - dx[0], height);
    add(sx[2], sy[1], sx[3] - sx[2], sourceH, dx[2], destinationY, dx[3] - dx[2], height);
  }
  if (renderCenter) {
    for (let row = 0; row < rows; row++) {
      const destinationY = dy[1] + row * tileHeight;
      const height = Math.min(tileHeight, dy[2] - destinationY);
      const sourceH = sourceCenterHeight * height / tileHeight;
      for (let column = 0; column < columns; column++) {
        const destinationX = dx[1] + column * tileWidth;
        const width = Math.min(tileWidth, dx[2] - destinationX);
        add(
          sx[1],
          sy[1],
          sourceCenterWidth * width / tileWidth,
          sourceH,
          destinationX,
          destinationY,
          width,
          height,
        );
      }
    }
  }
  return regions;
}
