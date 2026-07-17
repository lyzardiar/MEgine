export type SpriteBorder = [left: number, bottom: number, right: number, top: number];

export type NineSliceRegion = {
  source: { x: number; y: number; w: number; h: number };
  destination: { x: number; y: number; w: number; h: number };
};

function split(total: number, start: number, end: number): [number, number, number, number] {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeStart = Math.max(0, Number(start) || 0);
  const safeEnd = Math.max(0, Number(end) || 0);
  const sum = safeStart + safeEnd;
  const scale = sum > safeTotal && sum > 0 ? safeTotal / sum : 1;
  return [0, safeStart * scale, safeTotal - safeEnd * scale, safeTotal];
}

export function planNineSlice(
  sourceSize: [number, number],
  destinationSize: [number, number],
  sourceBorder: SpriteBorder,
  destinationBorder: SpriteBorder = sourceBorder,
): NineSliceRegion[] {
  const [sourceWidth, sourceHeight] = sourceSize.map((value) => Math.max(0, Number(value) || 0)) as [number, number];
  const [destinationWidth, destinationHeight] = destinationSize.map((value) => Math.max(0, Number(value) || 0)) as [number, number];
  if (sourceWidth <= 0 || sourceHeight <= 0 || destinationWidth <= 0 || destinationHeight <= 0) return [];

  const sx = split(sourceWidth, sourceBorder[0], sourceBorder[2]);
  const sy = split(sourceHeight, sourceBorder[3], sourceBorder[1]);
  const dx = split(destinationWidth, destinationBorder[0], destinationBorder[2]);
  const dy = split(destinationHeight, destinationBorder[3], destinationBorder[1]);
  const regions: NineSliceRegion[] = [];
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      const sourceW = sx[column + 1] - sx[column];
      const sourceH = sy[row + 1] - sy[row];
      const destinationW = dx[column + 1] - dx[column];
      const destinationH = dy[row + 1] - dy[row];
      if (sourceW <= 0 || sourceH <= 0 || destinationW <= 0 || destinationH <= 0) continue;
      regions.push({
        source: { x: sx[column], y: sy[row], w: sourceW, h: sourceH },
        destination: { x: dx[column], y: dy[row], w: destinationW, h: destinationH },
      });
    }
  }
  return regions;
}
