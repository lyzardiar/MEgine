export type ImageFillMethod =
  | 'Horizontal'
  | 'Vertical'
  | 'Radial90'
  | 'Radial180'
  | 'Radial360';

export type ImageFillPoint = [number, number];
export type ImageFillQuad = [
  ImageFillPoint,
  ImageFillPoint,
  ImageFillPoint,
  ImageFillPoint,
];

const EMPTY_FILL_THRESHOLD = 0.001;
const FULL_FILL_THRESHOLD = 0.999;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function normalizedOrigin(method: ImageFillMethod, origin: number): number {
  const maximum = method === 'Horizontal' || method === 'Vertical' ? 1 : 3;
  const value = Number.isFinite(origin) ? Math.trunc(origin) : 0;
  return value >= 0 && value <= maximum ? value : 0;
}

function unityQuad(
  x0 = 0,
  y0 = 0,
  x1 = 1,
  y1 = 1,
): ImageFillQuad {
  // Unity's Image mesh order is bottom-left, top-left, top-right, bottom-right.
  return [[x0, y0], [x0, y1], [x1, y1], [x1, y0]];
}

function toTopLeftCoordinates(points: ImageFillQuad): ImageFillQuad {
  return points.map(([x, y]) => [x, 1 - y] as ImageFillPoint) as ImageFillQuad;
}

/** Port of Unity uGUI Image.RadialCut for one quadrant. */
function radialCut(points: ImageFillQuad, rawFill: number, rawInvert: boolean, corner: number): boolean {
  const fill = clamp01(rawFill);
  if (fill < EMPTY_FILL_THRESHOLD) return false;

  let invert = rawInvert;
  if ((corner & 1) === 1) invert = !invert;
  if (!invert && fill > FULL_FILL_THRESHOLD) return true;

  let angle = invert ? 1 - fill : fill;
  angle *= Math.PI * 0.5;
  let cos = Math.cos(angle);
  let sin = Math.sin(angle);
  const i0 = corner;
  const i1 = (corner + 1) % 4;
  const i2 = (corner + 2) % 4;
  const i3 = (corner + 3) % 4;

  if ((corner & 1) === 1) {
    if (sin > cos) {
      cos /= sin;
      sin = 1;
      if (invert) {
        points[i1][0] = points[i0][0] + (points[i2][0] - points[i0][0]) * cos;
        points[i2][0] = points[i1][0];
      }
    } else if (cos > sin) {
      sin /= cos;
      cos = 1;
      if (!invert) {
        points[i2][1] = points[i0][1] + (points[i2][1] - points[i0][1]) * sin;
        points[i3][1] = points[i2][1];
      }
    } else {
      cos = 1;
      sin = 1;
    }
    if (!invert) {
      points[i3][0] = points[i0][0] + (points[i2][0] - points[i0][0]) * cos;
    } else {
      points[i1][1] = points[i0][1] + (points[i2][1] - points[i0][1]) * sin;
    }
  } else {
    if (cos > sin) {
      sin /= cos;
      cos = 1;
      if (!invert) {
        points[i1][1] = points[i0][1] + (points[i2][1] - points[i0][1]) * sin;
        points[i2][1] = points[i1][1];
      }
    } else if (sin > cos) {
      cos /= sin;
      sin = 1;
      if (invert) {
        points[i2][0] = points[i0][0] + (points[i2][0] - points[i0][0]) * cos;
        points[i3][0] = points[i2][0];
      }
    } else {
      cos = 1;
      sin = 1;
    }
    if (invert) {
      points[i3][1] = points[i0][1] + (points[i2][1] - points[i0][1]) * sin;
    } else {
      points[i1][0] = points[i0][0] + (points[i2][0] - points[i0][0]) * cos;
    }
  }
  return true;
}

/**
 * Generates the same normalized quads as Unity uGUI Image.GenerateFilledSprite.
 * Returned points use editor coordinates (top-left origin, positive Y downward).
 */
export function planFilledImage(
  method: ImageFillMethod,
  rawAmount: number,
  clockwise = true,
  rawOrigin = 0,
): ImageFillQuad[] {
  const amount = clamp01(rawAmount);
  if (amount < EMPTY_FILL_THRESHOLD) return [];
  const origin = normalizedOrigin(method, rawOrigin);

  if (method === 'Horizontal') {
    return [toTopLeftCoordinates(origin === 1
      ? unityQuad(1 - amount, 0, 1, 1)
      : unityQuad(0, 0, amount, 1))];
  }
  if (method === 'Vertical') {
    return [toTopLeftCoordinates(origin === 1
      ? unityQuad(0, 1 - amount, 1, 1)
      : unityQuad(0, 0, 1, amount))];
  }
  if (amount >= 1) return [toTopLeftCoordinates(unityQuad())];

  if (method === 'Radial90') {
    const quad = unityQuad();
    return radialCut(quad, amount, clockwise, origin)
      ? [toTopLeftCoordinates(quad)]
      : [];
  }

  if (method === 'Radial180') {
    const output: ImageFillQuad[] = [];
    for (let side = 0; side < 2; side += 1) {
      const even = origin > 1 ? 1 : 0;
      let fx0: number;
      let fx1: number;
      let fy0: number;
      let fy1: number;
      if (origin === 0 || origin === 2) {
        fy0 = 0;
        fy1 = 1;
        [fx0, fx1] = side === even ? [0, 0.5] : [0.5, 1];
      } else {
        fx0 = 0;
        fx1 = 1;
        [fy0, fy1] = side === even ? [0.5, 1] : [0, 0.5];
      }
      const quad = unityQuad(fx0, fy0, fx1, fy1);
      const value = clockwise ? amount * 2 - side : amount * 2 - (1 - side);
      if (radialCut(quad, value, clockwise, (side + origin + 3) % 4)) {
        output.push(toTopLeftCoordinates(quad));
      }
    }
    return output;
  }

  const output: ImageFillQuad[] = [];
  for (let corner = 0; corner < 4; corner += 1) {
    const fx0 = corner < 2 ? 0 : 0.5;
    const fx1 = corner < 2 ? 0.5 : 1;
    const fy0 = corner === 0 || corner === 3 ? 0 : 0.5;
    const fy1 = corner === 0 || corner === 3 ? 0.5 : 1;
    const quad = unityQuad(fx0, fy0, fx1, fy1);
    const phase = (corner + origin) % 4;
    const value = clockwise ? amount * 4 - phase : amount * 4 - (3 - phase);
    if (radialCut(quad, value, clockwise, (corner + 2) % 4)) {
      output.push(toTopLeftCoordinates(quad));
    }
  }
  return output;
}

export function traceFilledImagePath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  quads: readonly ImageFillQuad[],
): void {
  context.beginPath();
  for (const quad of quads) {
    context.moveTo(x + quad[0][0] * width, y + quad[0][1] * height);
    for (let index = 1; index < quad.length; index += 1) {
      context.lineTo(x + quad[index][0] * width, y + quad[index][1] * height);
    }
    context.closePath();
  }
}
