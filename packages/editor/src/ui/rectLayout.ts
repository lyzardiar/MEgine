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

/**
 * Unity RectTransform layout expressed as a top-left, screen-space rectangle.
 * Serialized RectTransform values keep Unity's bottom-left, Y-up convention.
 */
export function solveRectTransform(parent: Rect, raw: unknown): Rect {
  const rt = readRectTransform(raw);
  const [aminX, aminY] = rt.anchor_min;
  const [amaxX, amaxY] = rt.anchor_max;
  const [pivX, pivY] = rt.pivot;
  const [apX, apY] = rt.anchored_position;
  const [sdX, sdY] = rt.size_delta;
  const [sx, sy] = rt.local_scale;

  const anchorMinX = parent.x + aminX * parent.w;
  const anchorMaxX = parent.x + amaxX * parent.w;

  const anchorW = anchorMaxX - anchorMinX;
  const anchorH = (amaxY - aminY) * parent.h;

  const width = Math.max(0, (anchorW + sdX) * Math.abs(sx));
  const height = Math.max(0, (anchorH + sdY) * Math.abs(sy));

  // Convert Unity's Y-up anchor reference and anchored position at the screen boundary.
  const pivotX = anchorMinX + anchorW * pivX + apX;
  const anchorReferenceY = aminY + (amaxY - aminY) * pivY;
  const pivotY = parent.y + (1 - anchorReferenceY) * parent.h - apY;

  const x = pivotX - width * pivX;
  const y = pivotY - height * (1 - pivY);

  return { x, y, w: width, h: height };
}

export type CanvasScalerData = {
  ui_scale_mode?: string;
  uiScaleMode?: string;
  reference_pixels_per_unit?: number;
  referencePixelsPerUnit?: number;
  scale_factor?: number;
  scaleFactor?: number;
  reference_resolution?: Vec2;
  referenceResolution?: Vec2;
  screen_match_mode?: string;
  screenMatchMode?: string;
  match_width_or_height?: number;
  matchWidthOrHeight?: number;
  physical_unit?: string;
  physicalUnit?: string;
  fallback_screen_dpi?: number;
  fallbackScreenDpi?: number;
  default_sprite_dpi?: number;
  defaultSpriteDpi?: number;
  dynamic_pixels_per_unit?: number;
  dynamicPixelsPerUnit?: number;
};

function positiveFinite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function physicalTargetDpi(unit: string): number {
  return {
    Centimeters: 2.54,
    Millimeters: 25.4,
    Inches: 1,
    Points: 72,
    Picas: 6,
  }[unit] ?? 72;
}

export function canvasReferenceSize(scaler: unknown): { w: number; h: number } {
  const s = (scaler ?? {}) as CanvasScalerData;
  const ref = v2(s.reference_resolution ?? s.referenceResolution, [800, 600]);
  return {
    w: positiveFinite(ref[0], 800),
    h: positiveFinite(ref[1], 600),
  };
}

/** Unity-compatible screen-space CanvasScaler factor. Pass 0 when screen DPI is unknown. */
export function canvasScaleFactor(
  scaler: unknown,
  viewW: number,
  viewH: number,
  screenDpi = 0,
): number {
  const s = (scaler ?? {}) as CanvasScalerData;
  const mode = s.ui_scale_mode ?? s.uiScaleMode ?? 'ConstantPixelSize';
  if (mode === 'ConstantPixelSize') {
    return Math.max(0.01, positiveFinite(s.scale_factor ?? s.scaleFactor, 1));
  }
  if (mode === 'ConstantPhysicalSize') {
    const fallbackDpi = positiveFinite(s.fallback_screen_dpi ?? s.fallbackScreenDpi, 96);
    const dpi = positiveFinite(screenDpi, fallbackDpi);
    const unit = s.physical_unit ?? s.physicalUnit ?? 'Points';
    return dpi / physicalTargetDpi(unit);
  }
  const ref = canvasReferenceSize(s);
  const widthRatio = positiveFinite(viewW, 1) / ref.w;
  const heightRatio = positiveFinite(viewH, 1) / ref.h;
  const matchMode = s.screen_match_mode ?? s.screenMatchMode ?? 'MatchWidthOrHeight';
  if (matchMode === 'Expand') return Math.min(widthRatio, heightRatio);
  if (matchMode === 'Shrink') return Math.max(widthRatio, heightRatio);
  const rawMatch = Number(s.match_width_or_height ?? s.matchWidthOrHeight ?? 0);
  const match = Number.isFinite(rawMatch) ? Math.min(1, Math.max(0, rawMatch)) : 0;
  const logW = Math.log(widthRatio);
  const logH = Math.log(heightRatio);
  const logWeighted = logW * (1 - match) + logH * match;
  return Math.exp(logWeighted);
}

/**
 * CanvasScaler factor as displayed by a fitted Game view. Unity first lays UI out
 * at the selected output resolution, then the Game view scales that output to fit.
 */
export function canvasDisplayScaleFactor(
  scaler: unknown,
  viewW: number,
  viewH: number,
  logicalW = viewW,
  logicalH = viewH,
  screenDpi = 0,
): number {
  const safeViewW = positiveFinite(viewW, 1);
  const safeViewH = positiveFinite(viewH, 1);
  const safeLogicalW = positiveFinite(logicalW, safeViewW);
  const safeLogicalH = positiveFinite(logicalH, safeViewH);
  const previewScale = Math.min(safeViewW / safeLogicalW, safeViewH / safeLogicalH);
  return canvasScaleFactor(scaler, safeLogicalW, safeLogicalH, screenDpi) * previewScale;
}

/** Pixel density used by sliced sprites after Unity updates Canvas.referencePixelsPerUnit. */
export function canvasSpritePixelScale(scaler: unknown, layoutScale: number): number {
  const s = (scaler ?? {}) as CanvasScalerData;
  const mode = s.ui_scale_mode ?? s.uiScaleMode ?? 'ConstantPixelSize';
  if (mode !== 'ConstantPhysicalSize') return layoutScale;
  const unit = s.physical_unit ?? s.physicalUnit ?? 'Points';
  const spriteDpi = positiveFinite(s.default_sprite_dpi ?? s.defaultSpriteDpi, 96);
  return layoutScale * physicalTargetDpi(unit) / spriteDpi;
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
