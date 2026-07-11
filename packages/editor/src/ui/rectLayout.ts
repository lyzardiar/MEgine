/**
 * Unity-like RectTransform layout (Screen Space Overlay).
 * Parent rect in canvas/root space → child screen rect.
 */

export type Vec2 = [number, number];

export type Rect = { x: number; y: number; w: number; h: number };

export type RectTransformData = {
  anchor_min?: Vec2;
  anchor_max?: Vec2;
  pivot?: Vec2;
  anchored_position?: Vec2;
  size_delta?: Vec2;
  local_rotation?: number;
  local_scale?: Vec2;
  // camelCase aliases from codegen
  anchorMin?: Vec2;
  anchorMax?: Vec2;
  anchoredPosition?: Vec2;
  sizeDelta?: Vec2;
  localRotation?: number;
  localScale?: Vec2;
};

function v2(a?: Vec2, fallback: Vec2 = [0, 0]): Vec2 {
  if (!a || a.length < 2) return fallback;
  return [Number(a[0]) || 0, Number(a[1]) || 0];
}

export function readRectTransform(raw: unknown): Required<{
  anchor_min: Vec2;
  anchor_max: Vec2;
  pivot: Vec2;
  anchored_position: Vec2;
  size_delta: Vec2;
  local_rotation: number;
  local_scale: Vec2;
}> {
  const r = (raw ?? {}) as RectTransformData;
  return {
    anchor_min: v2(r.anchor_min ?? r.anchorMin, [0.5, 0.5]),
    anchor_max: v2(r.anchor_max ?? r.anchorMax, [0.5, 0.5]),
    pivot: v2(r.pivot, [0.5, 0.5]),
    anchored_position: v2(r.anchored_position ?? r.anchoredPosition, [0, 0]),
    size_delta: v2(r.size_delta ?? r.sizeDelta, [100, 100]),
    local_rotation: Number(r.local_rotation ?? r.localRotation ?? 0) || 0,
    local_scale: v2(r.local_scale ?? r.localScale, [1, 1]),
  };
}

/** Unity RectTransform: anchors define min/max corners in parent, sizeDelta expands. */
export function solveRectTransform(parent: Rect, raw: unknown): Rect {
  const rt = readRectTransform(raw);
  const [aminX, aminY] = rt.anchor_min;
  const [amaxX, amaxY] = rt.anchor_max;
  const [pivX, pivY] = rt.pivot;
  const [apX, apY] = rt.anchored_position;
  const [sdX, sdY] = rt.size_delta;
  const [sx, sy] = rt.local_scale;

  const anchorMinX = parent.x + aminX * parent.w;
  const anchorMinY = parent.y + aminY * parent.h;
  const anchorMaxX = parent.x + amaxX * parent.w;
  const anchorMaxY = parent.y + amaxY * parent.h;

  const anchorW = anchorMaxX - anchorMinX;
  const anchorH = anchorMaxY - anchorMinY;

  const width = Math.max(0, (anchorW + sdX) * Math.abs(sx));
  const height = Math.max(0, (anchorH + sdY) * Math.abs(sy));

  // Pivot point in parent space = lerp(anchorMin, anchorMax) + anchoredPosition
  const pivotX = anchorMinX + anchorW * pivX + apX;
  const pivotY = anchorMinY + anchorH * pivY + apY;

  // Rect bottom-left (y-up in Unity; our canvas is y-down — keep y-down screen space)
  // We treat parent.y as top of rect in screen coords (y grows down), matching Canvas 2D.
  // Convert: Unity y-up local → screen y-down by flipping within parent.
  // Simpler approach for Overlay: treat all coords as screen y-down directly
  // (anchored_position y positive = down), matching HTML canvas.
  const x = pivotX - width * pivX;
  const y = pivotY - height * pivY;

  return { x, y, w: width, h: height };
}

export type CanvasScalerData = {
  ui_scale_mode?: string;
  uiScaleMode?: string;
  reference_resolution?: Vec2;
  referenceResolution?: Vec2;
  match_width_or_height?: number;
  matchWidthOrHeight?: number;
  scale_factor?: number;
  scaleFactor?: number;
};

/** Scale factor for ScaleWithScreenSize (Unity CanvasScaler). */
export function canvasScaleFactor(scaler: unknown, viewW: number, viewH: number): number {
  const s = (scaler ?? {}) as CanvasScalerData;
  const mode = s.ui_scale_mode ?? s.uiScaleMode ?? 'ScaleWithScreenSize';
  if (mode === 'ConstantPixelSize') {
    return Number(s.scale_factor ?? s.scaleFactor ?? 1) || 1;
  }
  const ref = v2(s.reference_resolution ?? s.referenceResolution, [1920, 1080]);
  const match = Number(s.match_width_or_height ?? s.matchWidthOrHeight ?? 0.5);
  const logW = Math.log(viewW / Math.max(1, ref[0]));
  const logH = Math.log(viewH / Math.max(1, ref[1]));
  const logWeighted = logW * (1 - match) + logH * match;
  return Math.exp(logWeighted);
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function defaultRectTransform(partial?: Partial<ReturnType<typeof readRectTransform>>) {
  return {
    anchor_min: [0.5, 0.5] as Vec2,
    anchor_max: [0.5, 0.5] as Vec2,
    pivot: [0.5, 0.5] as Vec2,
    anchored_position: [0, 0] as Vec2,
    size_delta: [100, 100] as Vec2,
    local_rotation: 0,
    local_scale: [1, 1] as Vec2,
    ...partial,
  };
}

/** Stretch full parent (Unity stretch anchors). */
export function stretchRectTransform() {
  return defaultRectTransform({
    anchor_min: [0, 0],
    anchor_max: [1, 1],
    pivot: [0.5, 0.5],
    anchored_position: [0, 0],
    size_delta: [0, 0],
  });
}
