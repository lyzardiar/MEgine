/** Build screen-space / Scene-world rects for UI trees (Canvas Overlay). */

import {
  canvasDisplayScaleFactor,
  canvasReferenceSize,
  canvasScaleFactor,
  canvasSpritePixelScale,
  pointInRect,
  readRectTransform,
  solveRectTransform,
  type Rect,
} from './rectLayout';
import { rectLocalAxes, rectPivot } from '../rectGizmo';
import {
  drawSpriteInRect,
  drawSpriteSlicedInRect,
  drawSpriteTiledInRect,
  drawSpriteUvInRect,
} from '../spriteDraw';
import { planNineSlice, type SpriteBorder } from './nineSlice';
import { fitImageAspectRect } from './imageGeometry';
import { planTiledImage } from './tiledImage';
import {
  planFilledImage,
  traceFilledImagePath,
  type ImageFillMethod,
} from './imageFill';
import { applyAspectRatio } from './aspectRatioFitter';
import { applyContentSize, measureLayoutContent, type LayoutMetrics } from './contentSizeFitter';
import { graphicEffectFilter, type UiGraphicEffect } from './graphicEffect';
import { resolveSpriteId } from '../spriteLibrary';
import { add, cross, norm, project, quatRotateVec, scale as scaleVec3, sub, type Camera, type Quat, type Vec3 } from '../math3d';
import { rectComponentSceneScale } from '../rectSceneScale';
import { buildWorldTransforms } from '../worldTransform';
import { getSortingLayerRank } from '../sortingLayers';
import { gameCameraForEntity } from '../gameCamera';
import { normalizeGameDisplay } from '../gameResolution';
import {
  isVerticalRange,
  normalizedRangePosition,
  scrollbarHandleRange,
  scrollbarValueFromPosition,
  type UiRangeDirection,
} from './uiRange';
import {
  parseUiBlockingObjects,
  uiGraphicPhysicallyBlocked,
  type UiBlockingObjects,
  type UiRaycastPlane,
} from './uiPhysicsRaycast';

/** World pixels-per-unit for Scene view Overlay canvas plane. */
export const UI_SCENE_PPU = 100;

export type UiEnt = {
  entity: number;
  name?: string | null;
  parent?: number | null;
  siblingIndex?: number;
  active?: boolean;
  components: Record<string, unknown>;
};

export type UiMaskRegion = {
  rect: Rect;
  rotation: number;
  pivot: [number, number];
  screenCorners?: Array<{ x: number; y: number }>;
};

export type UiDrawItem = {
  entity: number;
  rect: Rect;
  depth: number;
  role: 'canvas' | 'graphic';
  rotation: number;
  pivot: [number, number];
  opacity: number;
  /** Pointer raycasts are rejected when a CanvasGroup disables them. */
  blocksRaycasts?: boolean;
  /** Unity GraphicRaycaster back-face filtering for projected World Space quads. */
  ignoreReversedGraphics?: boolean;
  /** Unity GraphicRaycaster physics dimensions checked in front of this graphic. */
  blockingObjects?: UiBlockingObjects;
  /** Signed 32-bit LayerMask used by physics blocking. */
  blockingMask?: number;
  /** Plane and Camera used to compare graphic distance with collider hits. */
  raycastPlane?: UiRaycastPlane;
  raycastCamera?: Camera;
  clip?: Rect;
  /** Enabled Unity Mask on this Graphic. Its alpha becomes the child stencil shape. */
  mask?: { showGraphic: boolean };
  /** Ancestor Mask Graphic entity ids, ordered outermost to innermost. */
  maskStack?: number[];
  /** Ancestor Mask rectangles used by Unity-style ICanvasRaycastFilter. */
  maskRegions?: UiMaskRegion[];
  image?: {
    color: [number, number, number, number];
    sprite: string;
    imageType: 'Simple' | 'Sliced' | 'Tiled' | 'Filled';
    preserveAspect: boolean;
    fillCenter: boolean;
    fillMethod: ImageFillMethod;
    fillAmount: number;
    fillClockwise: boolean;
    fillOrigin: number;
    spritePixelScale: number;
    border: SpriteBorder;
    displayBorder: SpriteBorder;
    sourceSize: [number, number];
    raycastTarget: boolean;
  };
  button?: {
    interactable: boolean;
    transition: string;
    label: string;
    textColor: [number, number, number, number];
    fontSize: number;
    onClick: unknown;
  };
  text?: {
    text: string;
    color: [number, number, number, number];
    fontSize: number;
    outlineColor: [number, number, number, number];
    outlineWidth: number;
    alignment: 'Left' | 'Center' | 'Right';
    verticalAlign: 'Top' | 'Middle' | 'Bottom';
    raycastTarget: boolean;
  };
  rawImage?: {
    color: [number, number, number, number];
    texture: string;
    uvRect: [number, number, number, number];
    raycastTarget: boolean;
  };
  shadow?: UiGraphicEffect;
  outline?: UiGraphicEffect;
  toggle?: {
    isOn: boolean;
    interactable: boolean;
    label: string;
    color: [number, number, number, number];
    textColor: [number, number, number, number];
    fontSize: number;
    onValueChanged: unknown;
  };
  slider?: {
    min: number;
    max: number;
    value: number;
    wholeNumbers: boolean;
    interactable: boolean;
    direction: 'LeftToRight' | 'RightToLeft' | 'BottomToTop' | 'TopToBottom';
    fillColor: [number, number, number, number];
    backgroundColor: [number, number, number, number];
    handleColor: [number, number, number, number];
    onValueChanged: unknown;
  };
  scrollbar?: {
    value: number;
    size: number;
    numberOfSteps: number;
    interactable: boolean;
    direction: UiRangeDirection;
    backgroundColor: [number, number, number, number];
    handleColor: [number, number, number, number];
    onValueChanged: unknown;
  };
  panel?: {
    color: [number, number, number, number];
    borderColor: [number, number, number, number];
    borderWidth: number;
    raycastTarget: boolean;
  };
  progress?: {
    min: number;
    max: number;
    value: number;
    direction: 'LeftToRight' | 'RightToLeft' | 'BottomToTop' | 'TopToBottom';
    backgroundColor: [number, number, number, number];
    fillColor: [number, number, number, number];
    textColor: [number, number, number, number];
    showLabel: boolean;
    fontSize: number;
  };
  input?: {
    text: string;
    placeholder: string;
    textColor: [number, number, number, number];
    placeholderColor: [number, number, number, number];
    backgroundColor: [number, number, number, number];
    fontSize: number;
    interactable: boolean;
    multiline: boolean;
    characterLimit: number;
    onValueChanged: unknown;
    onSubmit: unknown;
  };
  dropdown?: {
    options: string[];
    selectedIndex: number;
    expanded: boolean;
    interactable: boolean;
    backgroundColor: [number, number, number, number];
    itemColor: [number, number, number, number];
    selectedColor: [number, number, number, number];
    textColor: [number, number, number, number];
    fontSize: number;
    onValueChanged: unknown;
  };
  list?: {
    items: string[];
    selectedIndex: number;
    itemHeight: number;
    spacing: number;
    scrollOffset: number;
    interactable: boolean;
    backgroundColor: [number, number, number, number];
    itemColor: [number, number, number, number];
    selectedColor: [number, number, number, number];
    textColor: [number, number, number, number];
    fontSize: number;
    onValueChanged: unknown;
  };
  scroll?: {
    horizontal: boolean;
    vertical: boolean;
    normalizedPosition: [number, number];
    scrollSensitivity: number;
    viewportColor: [number, number, number, number];
    showScrollbar: boolean;
    onValueChanged: unknown;
  };
  tabs?: {
    labels: string[];
    selectedIndex: number;
    tabHeight: number;
    interactable: boolean;
    backgroundColor: [number, number, number, number];
    tabColor: [number, number, number, number];
    selectedColor: [number, number, number, number];
    textColor: [number, number, number, number];
    fontSize: number;
    onValueChanged: unknown;
  };
  selected: boolean;
  /** Projected pivot (Scene 3D). */
  pivotScreen?: { x: number; y: number };
  /** Exact unrotated size in Scene screen pixels (rect is the rotated AABB). */
  unrotatedSize?: { w: number; h: number };
  /** Parent layout rectangle used to visualize/edit anchors. */
  anchorParentRect?: Rect;
  /** Exact projected quad for World Space Canvas selection and pointer interaction. */
  screenCorners?: Array<{ x: number; y: number }>;
};

function color4(raw: unknown, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!Array.isArray(raw) || raw.length < 4) return fallback;
  return [
    Number(raw[0]) || 0,
    Number(raw[1]) || 0,
    Number(raw[2]) || 0,
    Number(raw[3]) ?? 1,
  ];
}

function number(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function canvasEventCamera(
  entities: readonly UiEnt[],
  transforms: ReturnType<typeof buildWorldTransforms> | null,
  canvas: Record<string, unknown>,
  fallback: Camera,
): Camera {
  const raw = canvas.render_camera ?? canvas.renderCamera;
  if (raw == null || String(raw).trim() === '') return fallback;
  const entity = Number(raw);
  if (!Number.isSafeInteger(entity) || entity < 0) return fallback;
  return gameCameraForEntity(entities, entity, transforms ?? buildWorldTransforms(entities))
    ?? fallback;
}

function enumValue<T extends string>(raw: unknown, values: readonly T[], fallback: T): T {
  return typeof raw === 'string' && values.includes(raw as T) ? (raw as T) : fallback;
}

function stringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((value) => String(value)) : [];
}

function number2(raw: unknown, fallback: [number, number]): [number, number] {
  return Array.isArray(raw) && raw.length >= 2
    ? [number(raw[0], fallback[0]), number(raw[1], fallback[1])]
    : fallback;
}

function number4(raw: unknown, fallback: SpriteBorder): SpriteBorder {
  return Array.isArray(raw) && raw.length >= 4
    ? [
        number(raw[0], fallback[0]),
        number(raw[1], fallback[1]),
        number(raw[2], fallback[2]),
        number(raw[3], fallback[3]),
      ]
    : fallback;
}

function intersectRect(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

function insetRect(rect: Rect, raw: unknown, scale: number): Rect {
  const p = Array.isArray(raw) ? raw : [0, 0, 0, 0];
  const left = number(p[0], 0) * scale;
  const top = number(p[1], 0) * scale;
  const right = number(p[2], 0) * scale;
  const bottom = number(p[3], 0) * scale;
  return {
    x: rect.x + left,
    y: rect.y + top,
    w: Math.max(0, rect.w - left - right),
    h: Math.max(0, rect.h - top - bottom),
  };
}

function layoutChildRect(
  parent: Rect,
  group: Record<string, unknown>,
  index: number,
  count: number,
  scale: number,
): Rect {
  const content = insetRect(parent, group.padding, scale);
  const spacing = number2(group.spacing, [6, 6]);
  const cell = number2(group.cell_size ?? group.cellSize, [120, 32]);
  const sx = spacing[0] * scale;
  const sy = spacing[1] * scale;
  const expand = group.child_force_expand !== false && group.childForceExpand !== false;
  const direction = String(group.direction ?? 'Vertical');
  if (direction === 'Horizontal') {
    const w = expand && count > 0
      ? Math.max(0, content.w - sx * Math.max(0, count - 1)) / count
      : cell[0] * scale;
    return {
      x: content.x + index * (w + sx),
      y: content.y,
      w,
      h: expand ? content.h : cell[1] * scale,
    };
  }
  if (direction === 'Grid') {
    const columns = Math.max(1, Math.trunc(number(group.constraint_count ?? group.constraintCount, 1)));
    const column = index % columns;
    const row = Math.floor(index / columns);
    const w = expand
      ? Math.max(0, content.w - sx * Math.max(0, columns - 1)) / columns
      : cell[0] * scale;
    const h = cell[1] * scale;
    return { x: content.x + column * (w + sx), y: content.y + row * (h + sy), w, h };
  }
  const h = expand && count > 0
    ? Math.max(0, content.h - sy * Math.max(0, count - 1)) / count
    : cell[1] * scale;
  return {
    x: content.x,
    y: content.y + index * (h + sy),
    w: expand ? content.w : cell[0] * scale,
    h,
  };
}

function layoutMetrics(group: Record<string, unknown>): LayoutMetrics {
  return {
    direction: String(group.direction ?? 'Vertical'),
    padding: number4(group.padding, [8, 8, 8, 8]),
    spacing: number2(group.spacing, [6, 6]),
    cellSize: number2(group.cell_size ?? group.cellSize, [120, 32]),
    constraintCount: Math.max(
      1,
      Math.trunc(number(group.constraint_count ?? group.constraintCount, 1)),
    ),
  };
}

function childrenOf(entities: UiEnt[], parent: number | null): UiEnt[] {
  return entities
    .filter((e) => (e.parent ?? null) === parent && e.active !== false)
    .sort((a, b) => (a.siblingIndex ?? 0) - (b.siblingIndex ?? 0));
}

/** Pixel (canvas y-down) → world XY plane (Y-up), canvas centered at origin. */
export function uiPixelToWorld(
  px: number,
  py: number,
  canvasW: number,
  canvasH: number,
  ppu = UI_SCENE_PPU,
): Vec3 {
  return [(px - canvasW * 0.5) / ppu, (canvasH * 0.5 - py) / ppu, 0];
}

function pixelCorners(
  rect: Rect,
  rotation: number,
  pivot: [number, number],
): Array<[number, number]> {
  const piv = rectPivot(rect, pivot);
  const axes = rectLocalAxes(rotation);
  const [px, py] = pivot;
  const { w, h } = rect;
  const locals: Array<[number, number]> = [
    [-w * px, -h * py],
    [w * (1 - px), -h * py],
    [w * (1 - px), h * (1 - py)],
    [-w * px, h * (1 - py)],
  ];
  return locals.map(([u, v]) => [
    piv.x + u * axes.x.dx + v * axes.y.dx,
    piv.y + u * axes.x.dy + v * axes.y.dy,
  ]);
}

function screenRect(corners: Array<{ x: number; y: number }>): Rect {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
  };
}

function scaleSceneVisuals(item: UiDrawItem, scale: number): UiDrawItem {
  const s = Math.max(0.01, scale);
  const font = (value: number) => Math.max(10, value * s);
  return {
    ...item,
    image: item.image
      ? {
          ...item.image,
          displayBorder: item.image.displayBorder.map((value) => value * s) as SpriteBorder,
        }
      : undefined,
    shadow: item.shadow
      ? { ...item.shadow, distance: item.shadow.distance.map((value) => value * s) as [number, number] }
      : undefined,
    outline: item.outline
      ? { ...item.outline, distance: item.outline.distance.map((value) => value * s) as [number, number] }
      : undefined,
    button: item.button ? { ...item.button, fontSize: font(item.button.fontSize) } : undefined,
    text: item.text
      ? {
          ...item.text,
          fontSize: font(item.text.fontSize),
          outlineWidth: Math.max(0, item.text.outlineWidth * s),
        }
      : undefined,
    toggle: item.toggle ? { ...item.toggle, fontSize: font(item.toggle.fontSize) } : undefined,
    panel: item.panel ? { ...item.panel, borderWidth: item.panel.borderWidth * s } : undefined,
    progress: item.progress ? { ...item.progress, fontSize: font(item.progress.fontSize) } : undefined,
    input: item.input ? { ...item.input, fontSize: font(item.input.fontSize) } : undefined,
    dropdown: item.dropdown
      ? { ...item.dropdown, fontSize: font(item.dropdown.fontSize) }
      : undefined,
    list: item.list
      ? {
          ...item.list,
          itemHeight: item.list.itemHeight * s,
          spacing: item.list.spacing * s,
          scrollOffset: item.list.scrollOffset * s,
          fontSize: font(item.list.fontSize),
        }
      : undefined,
    tabs: item.tabs
      ? {
          ...item.tabs,
          tabHeight: item.tabs.tabHeight * s,
          fontSize: font(item.tabs.fontSize),
        }
      : undefined,
  };
}

function inCanvasTree(entities: UiEnt[], entityId: number, canvasId: number): boolean {
  let cur: number | null = entityId;
  const guard = new Set<number>();
  while (cur != null) {
    if (cur === canvasId) return true;
    if (guard.has(cur)) break;
    guard.add(cur);
    cur = entities.find((e) => e.entity === cur)?.parent ?? null;
  }
  return false;
}

function hasCanvasAncestor(entities: UiEnt[], entity: UiEnt): boolean {
  let current = entity.parent ?? null;
  const guard = new Set<number>();
  while (current != null && !guard.has(current)) {
    guard.add(current);
    const parent = entities.find((candidate) => candidate.entity === current);
    if (!parent) break;
    if (parent.components.Canvas != null) return true;
    current = parent.parent ?? null;
  }
  return false;
}

function isCanvasLayoutRoot(entities: UiEnt[], entity: UiEnt): boolean {
  const canvas = entity.components.Canvas as { override_sorting?: boolean; overrideSorting?: boolean };
  return !hasCanvasAncestor(entities, entity)
    || canvas.override_sorting === true
    || canvas.overrideSorting === true;
}

function isActiveInHierarchy(entities: UiEnt[], entity: UiEnt): boolean {
  let current: UiEnt | undefined = entity;
  const guard = new Set<number>();
  while (current) {
    if (guard.has(current.entity)) return false;
    guard.add(current.entity);
    if (current.active === false) return false;
    const parentId: number | null = current.parent ?? null;
    if (parentId == null) return true;
    current = entities.find((candidate) => candidate.entity === parentId);
    if (!current) return false;
  }
  return false;
}

function canvasChainEnabled(entities: UiEnt[], entity: UiEnt): boolean {
  let current: UiEnt | undefined = entity;
  const guard = new Set<number>();
  while (current) {
    if (guard.has(current.entity)) return false;
    guard.add(current.entity);
    const canvas = current.components.Canvas as { enabled?: boolean } | undefined;
    if (canvas?.enabled === false) return false;
    const parentId: number | null = current.parent ?? null;
    if (parentId == null) return true;
    current = entities.find((candidate) => candidate.entity === parentId);
    if (!current) return false;
  }
  return false;
}

function canvasRenderRootEnabled(entities: UiEnt[], entity: UiEnt): boolean {
  return isActiveInHierarchy(entities, entity) && canvasChainEnabled(entities, entity);
}

function canvasLayoutRootForEntity(entities: UiEnt[], entityId: number): UiEnt | undefined {
  let current = entities.find((entity) => entity.entity === entityId);
  let outermost: UiEnt | undefined;
  const guard = new Set<number>();
  while (current && !guard.has(current.entity)) {
    guard.add(current.entity);
    const canvas = current.components.Canvas as
      | { override_sorting?: boolean; overrideSorting?: boolean }
      | undefined;
    if (canvas) {
      outermost = current;
      if (canvas.override_sorting === true || canvas.overrideSorting === true) {
        return current;
      }
    }
    const parent = current.parent ?? null;
    current = parent == null
      ? undefined
      : entities.find((entity) => entity.entity === parent);
  }
  return outermost;
}

function outermostCanvas(entities: UiEnt[], entity: UiEnt): UiEnt {
  let result = entity;
  let current = entity.parent ?? null;
  const guard = new Set<number>();
  while (current != null && !guard.has(current)) {
    guard.add(current);
    const parent = entities.find((candidate) => candidate.entity === current);
    if (!parent) break;
    if (parent.components.Canvas != null) result = parent;
    current = parent.parent ?? null;
  }
  return result;
}

function canvasSortingOrder(entities: UiEnt[], entity: UiEnt): number {
  const authored = entity.components.Canvas as {
    override_sorting?: boolean;
    overrideSorting?: boolean;
    sorting_order?: number;
    sortingOrder?: number;
  };
  const source = authored.override_sorting === true || authored.overrideSorting === true
    ? entity
    : outermostCanvas(entities, entity);
  const canvas = source.components.Canvas as { sorting_order?: number; sortingOrder?: number };
  return number(canvas.sorting_order ?? canvas.sortingOrder, 0);
}

function canvasPixelPerfect(entities: UiEnt[], entity: UiEnt): boolean {
  const chain: UiEnt[] = [];
  let current: UiEnt | undefined = entity;
  const guard = new Set<number>();
  while (current && !guard.has(current.entity)) {
    guard.add(current.entity);
    if (current.components.Canvas != null) chain.push(current);
    const parentId: number | null = current.parent ?? null;
    current = parentId == null
      ? undefined
      : entities.find((candidate) => candidate.entity === parentId);
  }
  let pixelPerfect = false;
  chain.reverse().forEach((canvasEntity, index) => {
    const canvas = canvasEntity.components.Canvas as {
      pixel_perfect?: boolean;
      pixelPerfect?: boolean;
      override_pixel_perfect?: boolean;
      overridePixelPerfect?: boolean;
    };
    const overrides = (canvas.override_pixel_perfect ?? canvas.overridePixelPerfect) === true;
    if (index === 0 || overrides) {
      pixelPerfect = (canvas.pixel_perfect ?? canvas.pixelPerfect) === true;
    }
  });
  return pixelPerfect;
}

function canvasSortKey(entities: UiEnt[], entity: UiEnt): [number, number, number] {
  const inherited = outermostCanvas(entities, entity);
  const authored = entity.components.Canvas as {
    override_sorting?: boolean;
    overrideSorting?: boolean;
    sorting_layer?: string;
    sortingLayer?: string;
  };
  const source = authored.override_sorting === true || authored.overrideSorting === true
    ? entity
    : inherited;
  const modeData = inherited.components.Canvas as { render_mode?: string; renderMode?: string };
  const mode = modeData.render_mode ?? modeData.renderMode ?? 'ScreenSpaceOverlay';
  const modeRank = mode === 'WorldSpace' ? 0 : mode === 'ScreenSpaceCamera' ? 1 : 2;
  const sourceData = source.components.Canvas as { sorting_layer?: string; sortingLayer?: string };
  return [
    modeRank,
    getSortingLayerRank(sourceData.sorting_layer ?? sourceData.sortingLayer ?? 'default'),
    canvasSortingOrder(entities, entity),
  ];
}

/**
 * Layout Overlay canvases into viewRect (Game letterbox / pixel root).
 */
export function layoutUiOverlay(
  entities: UiEnt[],
  viewRect: Rect,
  selectedIds: Set<number>,
  logicalSize?: { w: number; h: number },
  eventCamera?: Camera,
  targetDisplay: number | null = 0,
): UiDrawItem[] {
  const canvases = entities
    .filter((e) => e.components.Canvas
      && canvasRenderRootEnabled(entities, e)
      && isCanvasLayoutRoot(entities, e))
    .sort((a, b) => {
      const left = canvasSortKey(entities, a);
      const right = canvasSortKey(entities, b);
      return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
    });

  const out: UiDrawItem[] = [];
  let worldTransforms: ReturnType<typeof buildWorldTransforms> | null = null;
  let depthBase = 0;

  for (const canvas of canvases) {
    const canvasOutputStart = out.length;
    const inheritedCanvas = outermostCanvas(entities, canvas);
    const mode =
      (inheritedCanvas.components.Canvas as { render_mode?: string; renderMode?: string })?.render_mode
      ?? (inheritedCanvas.components.Canvas as { renderMode?: string })?.renderMode
      ?? 'ScreenSpaceOverlay';
    if (mode !== 'ScreenSpaceOverlay' && mode !== 'ScreenSpaceCamera') continue;
    if (targetDisplay != null) {
      const display = normalizeGameDisplay(targetDisplay);
      const canvasSettings = inheritedCanvas.components.Canvas as Record<string, unknown>;
      if (mode === 'ScreenSpaceOverlay') {
        if (normalizeGameDisplay(
          canvasSettings.target_display ?? canvasSettings.targetDisplay,
        ) !== display) continue;
      } else {
        if (!eventCamera) continue;
        const rawCamera = canvasSettings.render_camera ?? canvasSettings.renderCamera;
        if (rawCamera != null && String(rawCamera).trim() !== '') {
          worldTransforms ??= buildWorldTransforms(entities);
        }
        const resolvedCamera = canvasEventCamera(
          entities,
          worldTransforms,
          canvasSettings,
          eventCamera,
        ) as Camera & { targetDisplay?: number };
        if (normalizeGameDisplay(resolvedCamera.targetDisplay) !== display) continue;
      }
    }

    const scaler = inheritedCanvas.components.CanvasScaler;
    const scale = canvasDisplayScaleFactor(
      scaler,
      viewRect.w,
      viewRect.h,
      logicalSize?.w,
      logicalSize?.h,
    );
    const spritePixelScale = canvasSpritePixelScale(scaler, scale);
    const root: Rect = { x: viewRect.x, y: viewRect.y, w: viewRect.w, h: viewRect.h };

    const scaleRt = (raw: unknown) => {
      const rt = readRectTransform(raw);
      return {
        ...rt,
        size_delta: [rt.size_delta[0] * scale, rt.size_delta[1] * scale] as [number, number],
        anchored_position: [
          rt.anchored_position[0] * scale,
          rt.anchored_position[1] * scale,
        ] as [number, number],
      };
    };

    const walk = (
      ent: UiEnt,
      parentRect: Rect,
      depth: number,
      isCanvasRoot: boolean,
      forcedRect?: Rect,
      inherited = {
        opacity: 1,
        interactable: true,
        blocksRaycasts: true,
        raycasterEnabled: false,
        ignoreReversedGraphics: true,
        blockingObjects: 'None' as UiBlockingObjects,
        blockingMask: -1,
        pixelPerfect: false,
        visualMasks: [] as number[],
        maskRegions: [] as UiMaskRegion[],
      },
      inheritedClip?: Rect,
    ) => {
      const ownCanvas = ent.components.Canvas as { enabled?: boolean } | undefined;
      if (ownCanvas?.enabled === false) return;
      if (!isCanvasRoot) {
        const nestedCanvas = ent.components.Canvas as
          | { override_sorting?: boolean; overrideSorting?: boolean }
          | undefined;
        if (nestedCanvas?.override_sorting === true || nestedCanvas?.overrideSorting === true) {
          return;
        }
      }
      const hasRt = !!ent.components.RectTransform;
      const rt = hasRt ? readRectTransform(ent.components.RectTransform) : null;
      let rect = forcedRect ?? (isCanvasRoot
        ? parentRect
        : hasRt
          ? solveRectTransform(parentRect, scaleRt(ent.components.RectTransform))
          : parentRect);
      const layout = ent.components.LayoutGroup as Record<string, unknown> | undefined;
      const contentFitter = ent.components.ContentSizeFitter as Record<string, unknown> | undefined;
      if (contentFitter && layout && rt) {
        rect = applyContentSize(
          rect,
          rt.pivot,
          String(contentFitter.horizontal_fit ?? contentFitter.horizontalFit ?? 'Unconstrained'),
          String(contentFitter.vertical_fit ?? contentFitter.verticalFit ?? 'Unconstrained'),
          measureLayoutContent(layoutMetrics(layout), childrenOf(entities, ent.entity).length, scale),
        );
      }
      const aspect = ent.components.AspectRatioFitter as Record<string, unknown> | undefined;
      if (aspect && rt) {
        rect = applyAspectRatio(
          rect,
          parentRect,
          rt.pivot,
          String(aspect.aspect_mode ?? aspect.aspectMode ?? 'None'),
          number(aspect.aspect_ratio ?? aspect.aspectRatio, 1),
        );
      }

      const img = ent.components.Image as Record<string, unknown> | undefined;
      const rawImage = ent.components.RawImage as Record<string, unknown> | undefined;
      const shadow = ent.components.Shadow as Record<string, unknown> | undefined;
      const outline = ent.components.Outline as Record<string, unknown> | undefined;
      const btn = ent.components.Button as Record<string, unknown> | undefined;
      const text = ent.components.Text as Record<string, unknown> | undefined;
      const toggle = ent.components.Toggle as Record<string, unknown> | undefined;
      const slider = ent.components.Slider as Record<string, unknown> | undefined;
      const scrollbar = ent.components.Scrollbar as Record<string, unknown> | undefined;
      const panel = ent.components.Panel as Record<string, unknown> | undefined;
      const progress = ent.components.ProgressBar as Record<string, unknown> | undefined;
      const input = ent.components.InputField as Record<string, unknown> | undefined;
      const dropdown = ent.components.Dropdown as Record<string, unknown> | undefined;
      const list = ent.components.ListView as Record<string, unknown> | undefined;
      const scroll = ent.components.ScrollView as Record<string, unknown> | undefined;
      const tabs = ent.components.TabView as Record<string, unknown> | undefined;
      const group = ent.components.CanvasGroup as Record<string, unknown> | undefined;
      const canvasSettings = ent.components.Canvas as {
        pixel_perfect?: boolean;
        pixelPerfect?: boolean;
        override_pixel_perfect?: boolean;
        overridePixelPerfect?: boolean;
      } | undefined;
      const raycaster = ent.components.GraphicRaycaster as {
        enabled?: boolean;
        ignore_reversed_graphics?: boolean;
        ignoreReversedGraphics?: boolean;
        blocking_objects?: string;
        blockingObjects?: string;
        blocking_mask?: number;
        blockingMask?: number;
      } | undefined;
      const rectMask = ent.components.RectMask2D as Record<string, unknown> | undefined;
      const stencilMask = ent.components.Mask as Record<string, unknown> | undefined;
      const isCanvas = isCanvasRoot || !!ent.components.Canvas;
      const anchorParentRect = hasRt && !isCanvasRoot ? { ...parentRect } : undefined;
      const rotation = rt?.local_rotation ?? 0;
      const pivot: [number, number] = rt ? ([...rt.pivot] as [number, number]) : [0.5, 0.5];
      const overridesPixelPerfect = (
        canvasSettings?.override_pixel_perfect ?? canvasSettings?.overridePixelPerfect
      ) === true;
      const ignoresParentGroups = (
        group?.ignore_parent_groups ?? group?.ignoreParentGroups
      ) === true;
      const groupBase = ignoresParentGroups
        ? { opacity: 1, interactable: true, blocksRaycasts: true }
        : inherited;
      const state = {
        opacity: groupBase.opacity * Math.max(0, Math.min(1, number(group?.alpha, 1))),
        interactable: groupBase.interactable && group?.interactable !== false,
        blocksRaycasts: groupBase.blocksRaycasts
          && group?.blocks_raycasts !== false
          && group?.blocksRaycasts !== false,
        raycasterEnabled: canvasSettings
          ? raycaster?.enabled !== false && raycaster != null
          : inherited.raycasterEnabled,
        ignoreReversedGraphics: canvasSettings
          ? raycaster?.ignore_reversed_graphics !== false
            && raycaster?.ignoreReversedGraphics !== false
          : inherited.ignoreReversedGraphics,
        blockingObjects: canvasSettings
          ? parseUiBlockingObjects(raycaster?.blocking_objects ?? raycaster?.blockingObjects)
          : inherited.blockingObjects,
        blockingMask: canvasSettings
          ? number(raycaster?.blocking_mask ?? raycaster?.blockingMask, -1)
          : inherited.blockingMask,
        pixelPerfect: overridesPixelPerfect
          ? (canvasSettings?.pixel_perfect ?? canvasSettings?.pixelPerfect) === true
          : inherited.pixelPerfect,
        visualMasks: inherited.visualMasks,
        maskRegions: inherited.maskRegions,
      };
      const clip = inheritedClip;
      let childClip = inheritedClip;
      if (rectMask && rectMask.enabled !== false) {
        const maskRect = insetRect(rect, rectMask.padding, scale);
        childClip = childClip ? intersectRect(childClip, maskRect) : maskRect;
      }
      if (scroll || list) childClip = childClip ? intersectRect(childClip, rect) : rect;
      const renderedRect = state.pixelPerfect
        ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }
        : rect;

      if (isCanvas) {
        out.push({
          entity: ent.entity,
          rect: renderedRect,
          depth: depthBase + depth,
          role: 'canvas',
          rotation: 0,
          pivot: [0.5, 0.5],
          opacity: state.opacity,
          blocksRaycasts: state.blocksRaycasts && state.raycasterEnabled,
          ignoreReversedGraphics: state.ignoreReversedGraphics,
          blockingObjects: state.blockingObjects,
          blockingMask: state.blockingMask,
          clip,
          maskStack: state.visualMasks,
          maskRegions: state.maskRegions,
          selected: selectedIds.has(ent.entity),
        });
      } else if (img || rawImage || btn || text || toggle || slider || scrollbar || panel || progress || input || dropdown || list || scroll || tabs) {
        out.push({
          entity: ent.entity,
          rect: renderedRect,
          depth: depthBase + depth,
          role: 'graphic',
          rotation,
          pivot,
          anchorParentRect,
          opacity: state.opacity,
          blocksRaycasts: state.blocksRaycasts && state.raycasterEnabled,
          ignoreReversedGraphics: state.ignoreReversedGraphics,
          blockingObjects: state.blockingObjects,
          blockingMask: state.blockingMask,
          clip,
          mask: stencilMask?.enabled !== false && stencilMask != null
            ? {
                showGraphic:
                  stencilMask.show_mask_graphic !== false
                  && stencilMask.showMaskGraphic !== false,
              }
            : undefined,
          maskStack: state.visualMasks,
          maskRegions: state.maskRegions,
          image: img
            ? {
                color: color4(img.color, [1, 1, 1, 1]),
                sprite: resolveSpriteId(String(img.sprite ?? 'white')),
                imageType: enumValue(
                  img.image_type ?? img.imageType,
                  ['Simple', 'Sliced', 'Tiled', 'Filled'] as const,
                  'Simple',
                ),
                preserveAspect:
                  img.preserve_aspect === true || img.preserveAspect === true,
                fillCenter: img.fill_center !== false && img.fillCenter !== false,
                fillMethod: enumValue(
                  img.fill_method ?? img.fillMethod,
                  ['Horizontal', 'Vertical', 'Radial90', 'Radial180', 'Radial360'] as const,
                  'Radial360',
                ),
                fillAmount: number(img.fill_amount ?? img.fillAmount, 1),
                fillClockwise: img.fill_clockwise !== false && img.fillClockwise !== false,
                fillOrigin: Math.trunc(number(img.fill_origin ?? img.fillOrigin, 0)),
                spritePixelScale,
                border: number4(img.border, [0, 0, 0, 0]),
                displayBorder: number4(img.border, [0, 0, 0, 0]).map(
                  (value) => Math.max(0, value) * spritePixelScale,
                ) as SpriteBorder,
                sourceSize: number2(img.source_size ?? img.sourceSize, [100, 100]),
                raycastTarget: img.raycast_target !== false && img.raycastTarget !== false,
              }
            : undefined,
          button: btn
            ? {
                interactable: btn.interactable !== false && state.interactable,
                transition: String(btn.transition ?? 'ColorTint'),
                label: String(btn.label ?? 'Button'),
                textColor: color4(btn.text_color ?? btn.textColor, [1, 1, 1, 1]),
                fontSize: number(btn.font_size ?? btn.fontSize, 16) * scale,
                onClick: btn.on_click ?? btn.onClick ?? null,
              }
            : undefined,
          rawImage: rawImage
            ? {
                color: color4(rawImage.color, [1, 1, 1, 1]),
                texture: resolveSpriteId(String(rawImage.texture ?? 'white')),
                uvRect: number4(rawImage.uv_rect ?? rawImage.uvRect, [0, 0, 1, 1]),
                raycastTarget:
                  rawImage.raycast_target !== false && rawImage.raycastTarget !== false,
              }
            : undefined,
          shadow: shadow
            ? {
                color: color4(shadow.effect_color ?? shadow.effectColor, [0, 0, 0, 0.5]),
                distance: (() => {
                  const distance = number2(shadow.effect_distance ?? shadow.effectDistance, [1, -1]);
                  return [distance[0] * scale, -distance[1] * scale] as [number, number];
                })(),
                useGraphicAlpha:
                  shadow.use_graphic_alpha !== false && shadow.useGraphicAlpha !== false,
              }
            : undefined,
          outline: outline
            ? {
                color: color4(outline.effect_color ?? outline.effectColor, [0, 0, 0, 0.5]),
                distance: (() => {
                  const distance = number2(outline.effect_distance ?? outline.effectDistance, [1, -1]);
                  return [distance[0] * scale, -distance[1] * scale] as [number, number];
                })(),
                useGraphicAlpha:
                  outline.use_graphic_alpha !== false && outline.useGraphicAlpha !== false,
              }
            : undefined,
          text: text
            ? {
                text: String(text.text ?? 'Text'),
                color: color4(text.color, [1, 1, 1, 1]),
                fontSize: number(text.font_size ?? text.fontSize, 16) * scale,
                outlineColor: color4(
                  text.outline_color ?? text.outlineColor,
                  [0, 0, 0, 1],
                ),
                outlineWidth: Math.max(
                  0,
                  number(text.outline_width ?? text.outlineWidth, 0) * scale,
                ),
                alignment: enumValue(
                  text.alignment,
                  ['Left', 'Center', 'Right'] as const,
                  'Center',
                ),
                verticalAlign: enumValue(
                  text.vertical_align ?? text.verticalAlign,
                  ['Top', 'Middle', 'Bottom'] as const,
                  'Middle',
                ),
                raycastTarget:
                  text.raycast_target === true || text.raycastTarget === true,
              }
            : undefined,
          toggle: toggle
            ? {
                isOn: toggle.is_on === true || toggle.isOn === true,
                interactable: toggle.interactable !== false && state.interactable,
                label: String(toggle.label ?? 'Toggle'),
                color: color4(toggle.color, [0.2, 0.45, 0.85, 1]),
                textColor: color4(toggle.text_color ?? toggle.textColor, [1, 1, 1, 1]),
                fontSize: number(toggle.font_size ?? toggle.fontSize, 16) * scale,
                onValueChanged:
                  toggle.on_value_changed ?? toggle.onValueChanged ?? null,
              }
            : undefined,
          slider: slider
            ? {
                min: number(slider.min_value ?? slider.minValue, 0),
                max: number(slider.max_value ?? slider.maxValue, 1),
                value: number(slider.value, 0.5),
                wholeNumbers:
                  slider.whole_numbers === true || slider.wholeNumbers === true,
                interactable: slider.interactable !== false && state.interactable,
                direction: enumValue(
                  slider.direction,
                  ['LeftToRight', 'RightToLeft', 'BottomToTop', 'TopToBottom'] as const,
                  'LeftToRight',
                ),
                fillColor: color4(
                  slider.fill_color ?? slider.fillColor,
                  [0.2, 0.55, 1, 1],
                ),
                backgroundColor: color4(
                  slider.background_color ?? slider.backgroundColor,
                  [0.15, 0.17, 0.2, 1],
                ),
                handleColor: color4(
                  slider.handle_color ?? slider.handleColor,
                  [0.9, 0.92, 0.95, 1],
                ),
                onValueChanged:
                  slider.on_value_changed ?? slider.onValueChanged ?? null,
              }
            : undefined,
          scrollbar: scrollbar
            ? {
                value: Math.max(0, Math.min(1, number(scrollbar.value, 0))),
                size: Math.max(0, Math.min(1, number(scrollbar.size, 0.2))),
                numberOfSteps: Math.max(
                  0,
                  Math.trunc(number(
                    scrollbar.number_of_steps ?? scrollbar.numberOfSteps,
                    0,
                  )),
                ),
                interactable: scrollbar.interactable !== false && state.interactable,
                direction: enumValue(
                  scrollbar.direction,
                  ['LeftToRight', 'RightToLeft', 'BottomToTop', 'TopToBottom'] as const,
                  'BottomToTop',
                ),
                backgroundColor: color4(
                  scrollbar.background_color ?? scrollbar.backgroundColor,
                  [0.12, 0.14, 0.18, 1],
                ),
                handleColor: color4(
                  scrollbar.handle_color ?? scrollbar.handleColor,
                  [0.52, 0.58, 0.68, 1],
                ),
                onValueChanged:
                  scrollbar.on_value_changed ?? scrollbar.onValueChanged ?? null,
              }
            : undefined,
          panel: panel
            ? {
                color: color4(panel.color, [0.12, 0.14, 0.18, 0.96]),
                borderColor: color4(panel.border_color ?? panel.borderColor, [0.32, 0.36, 0.44, 1]),
                borderWidth: number(panel.border_width ?? panel.borderWidth, 1) * scale,
                raycastTarget: (panel.raycast_target === true || panel.raycastTarget === true) && state.blocksRaycasts,
              }
            : undefined,
          progress: progress
            ? {
                min: number(progress.min_value ?? progress.minValue, 0),
                max: number(progress.max_value ?? progress.maxValue, 1),
                value: number(progress.value, 0.5),
                direction: enumValue(progress.direction, ['LeftToRight', 'RightToLeft', 'BottomToTop', 'TopToBottom'] as const, 'LeftToRight'),
                backgroundColor: color4(progress.background_color ?? progress.backgroundColor, [0.12, 0.14, 0.18, 1]),
                fillColor: color4(progress.fill_color ?? progress.fillColor, [0.2, 0.65, 0.95, 1]),
                textColor: color4(progress.text_color ?? progress.textColor, [1, 1, 1, 1]),
                showLabel: progress.show_label !== false && progress.showLabel !== false,
                fontSize: number(progress.font_size ?? progress.fontSize, 14) * scale,
              }
            : undefined,
          input: input
            ? {
                text: String(input.text ?? ''),
                placeholder: String(input.placeholder ?? 'Enter text...'),
                textColor: color4(input.text_color ?? input.textColor, [0.94, 0.95, 0.98, 1]),
                placeholderColor: color4(input.placeholder_color ?? input.placeholderColor, [0.55, 0.58, 0.64, 1]),
                backgroundColor: color4(input.background_color ?? input.backgroundColor, [0.08, 0.09, 0.12, 1]),
                fontSize: number(input.font_size ?? input.fontSize, 16) * scale,
                interactable: input.interactable !== false && state.interactable,
                multiline: input.multiline === true,
                characterLimit: Math.max(0, Math.trunc(number(input.character_limit ?? input.characterLimit, 0))),
                onValueChanged: input.on_value_changed ?? input.onValueChanged ?? null,
                onSubmit: input.on_submit ?? input.onSubmit ?? null,
              }
            : undefined,
          dropdown: dropdown
            ? {
                options: stringArray(dropdown.options),
                selectedIndex: Math.trunc(number(dropdown.selected_index ?? dropdown.selectedIndex, 0)),
                expanded: dropdown.expanded === true,
                interactable: dropdown.interactable !== false && state.interactable,
                backgroundColor: color4(dropdown.background_color ?? dropdown.backgroundColor, [0.13, 0.15, 0.19, 1]),
                itemColor: color4(dropdown.item_color ?? dropdown.itemColor, [0.16, 0.18, 0.23, 1]),
                selectedColor: color4(dropdown.selected_color ?? dropdown.selectedColor, [0.2, 0.48, 0.85, 1]),
                textColor: color4(dropdown.text_color ?? dropdown.textColor, [1, 1, 1, 1]),
                fontSize: number(dropdown.font_size ?? dropdown.fontSize, 16) * scale,
                onValueChanged: dropdown.on_value_changed ?? dropdown.onValueChanged ?? null,
              }
            : undefined,
          list: list
            ? {
                items: stringArray(list.items),
                selectedIndex: Math.trunc(number(list.selected_index ?? list.selectedIndex, -1)),
                itemHeight: number(list.item_height ?? list.itemHeight, 32) * scale,
                spacing: number(list.spacing, 2) * scale,
                scrollOffset: number(list.scroll_offset ?? list.scrollOffset, 0) * scale,
                interactable: list.interactable !== false && state.interactable,
                backgroundColor: color4(list.background_color ?? list.backgroundColor, [0.08, 0.09, 0.12, 1]),
                itemColor: color4(list.item_color ?? list.itemColor, [0.14, 0.16, 0.2, 1]),
                selectedColor: color4(list.selected_color ?? list.selectedColor, [0.2, 0.48, 0.85, 1]),
                textColor: color4(list.text_color ?? list.textColor, [1, 1, 1, 1]),
                fontSize: number(list.font_size ?? list.fontSize, 15) * scale,
                onValueChanged: list.on_value_changed ?? list.onValueChanged ?? null,
              }
            : undefined,
          scroll: scroll
            ? {
                horizontal: scroll.horizontal === true,
                vertical: scroll.vertical !== false,
                normalizedPosition: number2(scroll.normalized_position ?? scroll.normalizedPosition, [0, 0]),
                scrollSensitivity: number(scroll.scroll_sensitivity ?? scroll.scrollSensitivity, 0.08),
                viewportColor: color4(scroll.viewport_color ?? scroll.viewportColor, [0.05, 0.06, 0.08, 0.72]),
                showScrollbar: scroll.show_scrollbar !== false && scroll.showScrollbar !== false,
                onValueChanged: scroll.on_value_changed ?? scroll.onValueChanged ?? null,
              }
            : undefined,
          tabs: tabs
            ? {
                labels: stringArray(tabs.tabs),
                selectedIndex: Math.trunc(number(tabs.selected_index ?? tabs.selectedIndex, 0)),
                tabHeight: number(tabs.tab_height ?? tabs.tabHeight, 32) * scale,
                interactable: tabs.interactable !== false && state.interactable,
                backgroundColor: color4(tabs.background_color ?? tabs.backgroundColor, [0.09, 0.1, 0.13, 1]),
                tabColor: color4(tabs.tab_color ?? tabs.tabColor, [0.15, 0.17, 0.21, 1]),
                selectedColor: color4(tabs.selected_color ?? tabs.selectedColor, [0.2, 0.48, 0.85, 1]),
                textColor: color4(tabs.text_color ?? tabs.textColor, [1, 1, 1, 1]),
                fontSize: number(tabs.font_size ?? tabs.fontSize, 15) * scale,
                onValueChanged: tabs.on_value_changed ?? tabs.onValueChanged ?? null,
              }
            : undefined,
          selected: selectedIds.has(ent.entity),
        });
      } else if (selectedIds.has(ent.entity) && hasRt) {
        out.push({
          entity: ent.entity,
          rect: renderedRect,
          depth: depthBase + depth,
          role: 'graphic',
          rotation,
          pivot,
          anchorParentRect,
          opacity: state.opacity,
          blocksRaycasts: state.blocksRaycasts && state.raycasterEnabled,
          ignoreReversedGraphics: state.ignoreReversedGraphics,
          blockingObjects: state.blockingObjects,
          blockingMask: state.blockingMask,
          clip,
          maskStack: state.visualMasks,
          maskRegions: state.maskRegions,
          selected: true,
        });
      }

      let childState = state;
      if (stencilMask && stencilMask.enabled !== false) {
        const nextMaskRegions = state.maskRegions.length < 8
          ? [...state.maskRegions, { rect: renderedRect, rotation, pivot }]
          : state.maskRegions;
        const hasMaskGraphic = !!(
          img || rawImage || btn || text || toggle || slider || scrollbar
          || panel || progress || input || dropdown || list || scroll || tabs
        );
        const nextVisualMasks = hasMaskGraphic && state.visualMasks.length < 8
          ? [...state.visualMasks, ent.entity]
          : state.visualMasks;
        childState = {
          ...state,
          visualMasks: nextVisualMasks,
          maskRegions: nextMaskRegions,
        };
      }

      let children = childrenOf(entities, ent.entity);
      if (tabs && children.length) {
        const selected = Math.max(0, Math.min(children.length - 1, Math.trunc(number(tabs.selected_index ?? tabs.selectedIndex, 0))));
        children = [children[selected]];
      }
      const childParent = scroll
        ? {
            ...rect,
            x: rect.x - Math.max(0, Math.min(1, number2(scroll.normalized_position ?? scroll.normalizedPosition, [0, 0])[0])) * rect.w,
            y: rect.y - Math.max(0, Math.min(1, number2(scroll.normalized_position ?? scroll.normalizedPosition, [0, 0])[1])) * rect.h,
          }
        : tabs
          ? {
              ...rect,
              y: rect.y + Math.max(0, Math.min(rect.h, number(tabs.tab_height ?? tabs.tabHeight, 32) * scale)),
              h: Math.max(0, rect.h - Math.max(0, Math.min(rect.h, number(tabs.tab_height ?? tabs.tabHeight, 32) * scale))),
            }
        : rect;
      children.forEach((child, index) => {
        const forced = layout ? layoutChildRect(childParent, layout, index, children.length, scale) : undefined;
        walk(child, childParent, depth + 1, false, forced, childState, childClip);
      });
    };

    let canvasParent = root;
    if (canvas.entity !== inheritedCanvas.entity) {
      const chain: UiEnt[] = [];
      let current = canvas.parent ?? null;
      const guard = new Set<number>();
      while (current != null && current !== inheritedCanvas.entity && !guard.has(current)) {
        guard.add(current);
        const ancestor = entities.find((candidate) => candidate.entity === current);
        if (!ancestor) break;
        chain.push(ancestor);
        current = ancestor.parent ?? null;
      }
      if (inheritedCanvas.components.RectTransform) {
        canvasParent = solveRectTransform(root, scaleRt(inheritedCanvas.components.RectTransform));
      }
      for (const ancestor of chain.reverse()) {
        if (ancestor.components.RectTransform) {
          canvasParent = solveRectTransform(canvasParent, scaleRt(ancestor.components.RectTransform));
        }
      }
    }
    const canvasRt = canvas.components.RectTransform
      ? solveRectTransform(canvasParent, scaleRt(canvas.components.RectTransform))
      : canvasParent;
    walk(canvas, canvasRt, 0, true, undefined, {
      opacity: 1,
      interactable: true,
      blocksRaycasts: true,
      raycasterEnabled: false,
      ignoreReversedGraphics: true,
      blockingObjects: 'None',
      blockingMask: -1,
      pixelPerfect: canvasPixelPerfect(entities, canvas),
      visualMasks: [] as number[],
      maskRegions: [] as UiMaskRegion[],
    }, root);
    if (mode === 'ScreenSpaceCamera' && eventCamera) {
      const canvasSettings = inheritedCanvas.components.Canvas as Record<string, unknown>;
      if (String(canvasSettings.render_camera ?? canvasSettings.renderCamera ?? '').trim()) {
        worldTransforms ??= buildWorldTransforms(entities);
      }
      const canvasCamera = canvasEventCamera(
        entities,
        worldTransforms,
        canvasSettings,
        eventCamera,
      );
      const forward = norm(sub(canvasCamera.target, canvasCamera.eye));
      const distance = Math.max(0.01, number(
        canvasSettings.plane_distance ?? canvasSettings.planeDistance,
        100,
      ));
      const plane = {
        point: add(canvasCamera.eye, scaleVec3(forward, distance)),
        normal: forward,
      } satisfies UiRaycastPlane;
      for (const item of out.slice(canvasOutputStart)) {
        item.raycastPlane = plane;
        item.raycastCamera = canvasCamera;
      }
    }
    depthBase += 1000;
  }

  out.sort((a, b) => a.depth - b.depth);
  return out;
}

function isReversedScreenQuad(corners: Array<{ x: number; y: number }>): boolean {
  if (corners.length !== 4) return false;
  let twiceArea = 0;
  for (let index = 0; index < corners.length; index++) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    twiceArea += current.x * next.y - current.y * next.x;
  }
  return twiceArea > 0.0001;
}

/** Project World Space Canvas trees through the active authoring/Game camera. */
export function layoutUiWorldSpace(
  entities: UiEnt[],
  cam: Camera,
  viewport: Rect,
  selectedIds: Set<number>,
): UiDrawItem[] {
  const transforms = buildWorldTransforms(entities);
  const canvases = entities
    .filter((entity) => {
      if (!entity.components.Canvas
        || !canvasRenderRootEnabled(entities, entity)
        || !isCanvasLayoutRoot(entities, entity)) {
        return false;
      }
      const inherited = outermostCanvas(entities, entity);
      const canvas = inherited.components.Canvas as { render_mode?: string; renderMode?: string };
      return (canvas.render_mode ?? canvas.renderMode) === 'WorldSpace';
    })
    .sort((left, right) => {
      const leftKey = canvasSortKey(entities, left);
      const rightKey = canvasSortKey(entities, right);
      return leftKey[1] - rightKey[1] || leftKey[2] - rightKey[2];
    });
  const output: UiDrawItem[] = [];

  for (const canvas of canvases) {
    const context = worldCanvasLayoutContext(entities, canvas, selectedIds, transforms);
    const inheritedCanvas = outermostCanvas(entities, canvas);
    const raycastCamera = canvasEventCamera(
      entities,
      transforms,
      inheritedCanvas.components.Canvas as Record<string, unknown>,
      cam,
    );
    const planeOrigin = context.pixelToWorld(0, 0);
    const plane = {
      point: planeOrigin,
      normal: norm(cross(
        sub(context.pixelToWorld(1, 0), planeOrigin),
        sub(context.pixelToWorld(0, 1), planeOrigin),
      )),
    } satisfies UiRaycastPlane;

    for (const item of context.items) {
      const corners = pixelCorners(item.rect, item.rotation, item.pivot)
        .map(([x, y]) => project(context.pixelToWorld(x, y), cam, viewport));
      if (corners.some((point) => !point)) continue;
      const projected = corners as Array<{ x: number; y: number; depth: number }>;
      const screenCorners = projected.map(({ x, y }) => ({ x, y }));
      const reversed = item.ignoreReversedGraphics === true && isReversedScreenQuad(screenCorners);
      const topLeft = projected[0];
      const topRight = projected[1];
      const bottomLeft = projected[3];
      const drawWidth = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
      const drawHeight = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
      if (drawWidth <= 0.0001 || drawHeight <= 0.0001) continue;
      const angle = Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x);
      const depth = projected.reduce((sum, point) => sum + point.depth, 0) / projected.length;
      const maskRegions = item.maskRegions?.flatMap((mask) => {
        const maskCorners = pixelCorners(mask.rect, mask.rotation, mask.pivot)
          .map(([x, y]) => project(context.pixelToWorld(x, y), cam, viewport));
        if (maskCorners.some((point) => !point)) return [];
        const exact = (maskCorners as Array<{ x: number; y: number; depth: number }>)
          .map(({ x, y }) => ({ x, y }));
        return [{
          rect: screenRect(exact),
          rotation: 0,
          pivot: [0.5, 0.5] as [number, number],
          screenCorners: exact,
        }];
      });
      output.push({
        ...scaleSceneVisuals(item, drawWidth / Math.max(0.0001, item.rect.w)),
        rect: { x: topLeft.x, y: topLeft.y, w: drawWidth, h: drawHeight },
        rotation: (-angle * 180) / Math.PI,
        pivot: [0, 0],
        pivotScreen: { x: topLeft.x, y: topLeft.y },
        screenCorners,
        maskRegions,
        blocksRaycasts: reversed ? false : item.blocksRaycasts,
        raycastPlane: plane,
        raycastCamera,
        depth,
        clip: undefined,
        anchorParentRect: undefined,
        unrotatedSize: { w: drawWidth, h: drawHeight },
      });
    }
  }
  return output;
}

function worldCanvasLayoutContext(
  entities: UiEnt[],
  canvas: UiEnt,
  selectedIds: Set<number>,
  transforms = buildWorldTransforms(entities),
): { items: UiDrawItem[]; pixelToWorld: (px: number, py: number) => Vec3 } {
  const inheritedCanvas = outermostCanvas(entities, canvas);
  const rectTransform = readRectTransform(inheritedCanvas.components.RectTransform);
  const scaler = inheritedCanvas.components.CanvasScaler as Record<string, unknown> | undefined;
  const reference = canvasReferenceSize(scaler);
  const width = Math.abs(rectTransform.size_delta[0]) > 1e-4
    ? Math.abs(rectTransform.size_delta[0])
    : reference.w;
  const height = Math.abs(rectTransform.size_delta[1]) > 1e-4
    ? Math.abs(rectTransform.size_delta[1])
    : reference.h;
  const layoutEntities = entities.map((entity) => {
    const isCanvasAncestor = entity.components.Canvas != null
      && inCanvasTree(entities, canvas.entity, entity.entity);
    return isCanvasAncestor
      ? {
        ...entity,
        components: {
          ...entity.components,
          Canvas: {
            ...(entity.components.Canvas as Record<string, unknown>),
            render_mode: 'ScreenSpaceOverlay',
            pixel_perfect: false,
            override_pixel_perfect: false,
          },
          ...(entity.entity === inheritedCanvas.entity ? { CanvasScaler: {
            ui_scale_mode: 'ConstantPixelSize',
            scale_factor: 1,
            reference_pixels_per_unit: number(scaler?.reference_pixels_per_unit, 100),
            reference_resolution: [width, height],
            screen_match_mode: 'MatchWidthOrHeight',
            match_width_or_height: 0,
            physical_unit: 'Points',
            fallback_screen_dpi: 96,
            default_sprite_dpi: 96,
            dynamic_pixels_per_unit: 1,
          }, RectTransform: {
            ...(entity.components.RectTransform as Record<string, unknown> | undefined),
            anchor_min: [0, 0],
            anchor_max: [1, 1],
            anchored_position: [0, 0],
            size_delta: [0, 0],
            local_rotation: 0,
            local_scale: [1, 1],
          } } : {}),
        },
      }
      : entity;
  });
  const items = layoutUiOverlay(
    layoutEntities,
    { x: 0, y: 0, w: width, h: height },
    selectedIds,
    { w: width, h: height },
    undefined,
    null,
  ).filter((item) => canvasLayoutRootForEntity(entities, item.entity)?.entity === canvas.entity);
  const worldTransform = transforms.get(inheritedCanvas.entity)?.transform ?? {
    position: [0, 0, 0] as Vec3,
    rotation: [0, 0, 0, 1] as Quat,
    scale: [1, 1, 1] as Vec3,
  };
  const ppu = Math.max(0.0001, number(scaler?.reference_pixels_per_unit, 100));
  const canvasAngle = (rectTransform.local_rotation * Math.PI) / 180;
  const canvasCos = Math.cos(canvasAngle);
  const canvasSin = Math.sin(canvasAngle);
  const pixelToWorld = (px: number, py: number): Vec3 => {
    const localX = (px - width * rectTransform.pivot[0]) / ppu;
    const localY = (height * rectTransform.pivot[1] - py) / ppu;
    const scaledX = localX * rectTransform.local_scale[0];
    const scaledY = localY * rectTransform.local_scale[1];
    const local: Vec3 = [
      scaledX * canvasCos - scaledY * canvasSin + rectTransform.anchored_position[0] / ppu,
      scaledX * canvasSin + scaledY * canvasCos + rectTransform.anchored_position[1] / ppu,
      0,
    ];
    const scaled: Vec3 = [
      local[0] * worldTransform.scale[0],
      local[1] * worldTransform.scale[1],
      local[2] * worldTransform.scale[2],
    ];
    return add(
      worldTransform.position as Vec3,
      quatRotateVec(worldTransform.rotation as Quat, scaled),
    );
  };
  return { items, pixelToWorld };
}

/**
 * Scene view: Overlay UI on world XY plane.
 * `canvasSize` must match Game letterbox (w×h) so portrait/landscape stay aligned.
 */
export function layoutUiScene3D(
  entities: UiEnt[],
  cam: Camera,
  viewport: Rect,
  selectedIds: Set<number>,
  canvasSize: { w: number; h: number },
): { items: UiDrawItem[]; layoutScale: number } {
  const canvases = entities.filter(
    (e) => e.components.Canvas
      && canvasRenderRootEnabled(entities, e)
      && isCanvasLayoutRoot(entities, e),
  );
  if (!canvases.length) return { items: [], layoutScale: 1 };

  const cw = Math.max(1, canvasSize.w);
  const ch = Math.max(1, canvasSize.h);
  const pixelRoot: Rect = { x: 0, y: 0, w: cw, h: ch };

  const out: UiDrawItem[] = [];
  let layoutScale = 1;
  let depthBase = 0;

  for (const canvas of canvases) {
    const inheritedCanvas = outermostCanvas(entities, canvas);
    const mode =
      (inheritedCanvas.components.Canvas as { render_mode?: string; renderMode?: string })?.render_mode
      ?? (inheritedCanvas.components.Canvas as { renderMode?: string })?.renderMode
      ?? 'ScreenSpaceOverlay';
    if (mode !== 'ScreenSpaceOverlay' && mode !== 'ScreenSpaceCamera') continue;

    const laid = layoutUiOverlay(entities, pixelRoot, selectedIds, undefined, cam, null).filter((it) =>
      inCanvasTree(entities, it.entity, canvas.entity),
    );

    let sceneScale = 1;
    const c0 = project(uiPixelToWorld(cw * 0.5, ch * 0.5, cw, ch), cam, viewport);
    const c1 = project(uiPixelToWorld(cw * 0.5 + 1, ch * 0.5, cw, ch), cam, viewport);
    if (c0 && c1) {
      const s = Math.hypot(c1.x - c0.x, c1.y - c0.y);
      if (s > 1e-4) {
        sceneScale = s;
      }
    }
    const componentSceneScale = rectComponentSceneScale(
      sceneScale,
      canvasScaleFactor(inheritedCanvas.components.CanvasScaler, cw, ch),
    );
    if (depthBase === 0 || laid.some((item) => selectedIds.has(item.entity))) {
      layoutScale = componentSceneScale;
    }

    const projectPixelRect = (rect: Rect): Rect | undefined => {
      const projected = pixelCorners(rect, 0, [0.5, 0.5])
        .map(([px, py]) => project(uiPixelToWorld(px, py, cw, ch), cam, viewport));
      if (projected.some((point) => !point)) return undefined;
      const points = projected as Array<{ x: number; y: number; depth: number }>;
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      return {
        x,
        y,
        w: Math.max(...xs) - x,
        h: Math.max(...ys) - y,
      };
    };

    for (const it of laid) {
      const corners = pixelCorners(it.rect, it.rotation, it.pivot);
      const world = corners.map(([px, py]) => uiPixelToWorld(px, py, cw, ch));
      const scr = world.map((w) => project(w, cam, viewport));
      if (scr.some((p) => !p)) continue;
      const P = scr as Array<{ x: number; y: number; depth: number }>;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of P) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pivPx = rectPivot(it.rect, it.pivot);
      const pivS = project(uiPixelToWorld(pivPx.x, pivPx.y, cw, ch), cam, viewport);

      const sceneItem = scaleSceneVisuals(it, sceneScale);
      const maskRegions = it.maskRegions?.flatMap((mask) => {
        const maskCorners = pixelCorners(mask.rect, mask.rotation, mask.pivot)
          .map(([px, py]) => project(uiPixelToWorld(px, py, cw, ch), cam, viewport));
        if (maskCorners.some((point) => !point)) return [];
        const exact = (maskCorners as Array<{ x: number; y: number; depth: number }>)
          .map(({ x, y }) => ({ x, y }));
        return [{
          rect: screenRect(exact),
          rotation: 0,
          pivot: [0.5, 0.5] as [number, number],
          screenCorners: exact,
        }];
      });
      out.push({
        ...sceneItem,
        rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        clip: it.clip ? projectPixelRect(it.clip) : undefined,
        depth: depthBase + it.depth,
        pivotScreen: pivS ? { x: pivS.x, y: pivS.y } : undefined,
        unrotatedSize: { w: it.rect.w * sceneScale, h: it.rect.h * sceneScale },
        anchorParentRect: it.anchorParentRect
          ? projectPixelRect(it.anchorParentRect)
          : undefined,
        maskRegions,
      });
    }
    depthBase += 1000;
  }

  out.sort((a, b) => a.depth - b.depth);
  return { items: out, layoutScale };
}

/**
 * Logical canvas pixel size matching Game display aspect (for framing / fallback).
 * Portrait → taller than wide (e.g. 1080×1920 from 1920×1080 ref).
 */
export function gameAlignedCanvasSize(
  scaler: unknown,
  aspectRatio: number | null,
): { w: number; h: number } {
  const ref = canvasReferenceSize(scaler);
  if (aspectRatio == null || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return ref;
  }
  const long = Math.max(ref.w, ref.h);
  if (aspectRatio >= 1) {
    return { w: long, h: long / aspectRatio };
  }
  return { w: long * aspectRatio, h: long };
}

/** World pivot of a UI entity for Scene framing. */
export function uiEntityWorldPivot(
  entities: UiEnt[],
  entityId: number,
  canvasSize?: { w: number; h: number },
): { position: Vec3; size: number } | null {
  const renderRoot = canvasLayoutRootForEntity(entities, entityId);
  if (renderRoot) {
    const inherited = outermostCanvas(entities, renderRoot);
    const canvas = inherited.components.Canvas as { render_mode?: string; renderMode?: string };
    if ((canvas.render_mode ?? canvas.renderMode) === 'WorldSpace') {
      const context = worldCanvasLayoutContext(entities, renderRoot, new Set([entityId]));
      const item = context.items.find((candidate) => candidate.entity === entityId);
      if (!item) return null;
      const pivot = rectPivot(item.rect, item.pivot);
      const corners = pixelCorners(item.rect, item.rotation, item.pivot)
        .map(([x, y]) => context.pixelToWorld(x, y));
      const edgeLength = (left: Vec3, right: Vec3) => Math.hypot(
        right[0] - left[0],
        right[1] - left[1],
        right[2] - left[2],
      );
      return {
        position: context.pixelToWorld(pivot.x, pivot.y),
        size: Math.max(0.5, edgeLength(corners[0], corners[1]), edgeLength(corners[0], corners[3])),
      };
    }
  }
  const canvases = entities.filter((e) => e.components.Canvas && e.active !== false);
  for (const canvas of canvases) {
    const size =
      canvasSize ??
      gameAlignedCanvasSize(canvas.components.CanvasScaler, null);
    const cw = Math.max(1, size.w);
    const ch = Math.max(1, size.h);
    const laid = layoutUiOverlay(
      entities,
      { x: 0, y: 0, w: cw, h: ch },
      new Set([entityId]),
    );
    const it = laid.find((x) => x.entity === entityId);
    if (!it) continue;
    if (!inCanvasTree(entities, entityId, canvas.entity)) continue;
    const piv = rectPivot(it.rect, it.pivot);
    const pos = uiPixelToWorld(piv.x, piv.y, cw, ch);
    const extent = Math.max(it.rect.w, it.rect.h) / UI_SCENE_PPU;
    return { position: pos, size: Math.max(0.5, extent) };
  }
  return null;
}

function pointInUiItem(px: number, py: number, it: UiDrawItem): boolean {
  if (it.screenCorners?.length === 4) {
    let sign = 0;
    for (let index = 0; index < 4; index++) {
      const a = it.screenCorners[index];
      const b = it.screenCorners[(index + 1) % 4];
      const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
      if (Math.abs(cross) < 1e-4) continue;
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
    return true;
  }
  if (it.role === 'canvas' || Math.abs(it.rotation) < 1e-4) {
    return pointInRect(px, py, it.rect);
  }
  const { w, h } = it.rect;
  const piv = it.pivotScreen ?? rectPivot(it.rect, it.pivot);
  const axes = rectLocalAxes(it.rotation);
  const dx = px - piv.x;
  const dy = py - piv.y;
  const u = dx * axes.x.dx + dy * axes.x.dy;
  const v = dx * axes.y.dx + dy * axes.y.dy;
  const [pxN, pyN] = it.pivot;
  return u >= -w * pxN && u <= w * (1 - pxN) && v >= -h * pyN && v <= h * (1 - pyN);
}

function pointInMaskRegion(px: number, py: number, mask: UiMaskRegion): boolean {
  if (mask.screenCorners?.length === 4) {
    let sign = 0;
    for (let index = 0; index < 4; index++) {
      const a = mask.screenCorners[index];
      const b = mask.screenCorners[(index + 1) % 4];
      const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
      if (Math.abs(cross) < 1e-4) continue;
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
    return true;
  }
  if (Math.abs(mask.rotation) < 1e-4) return pointInRect(px, py, mask.rect);
  const pivot = rectPivot(mask.rect, mask.pivot);
  const axes = rectLocalAxes(mask.rotation);
  const dx = px - pivot.x;
  const dy = py - pivot.y;
  const u = dx * axes.x.dx + dy * axes.x.dy;
  const v = dx * axes.y.dx + dy * axes.y.dy;
  return u >= -mask.rect.w * mask.pivot[0]
    && u <= mask.rect.w * (1 - mask.pivot[0])
    && v >= -mask.rect.h * mask.pivot[1]
    && v <= mask.rect.h * (1 - mask.pivot[1]);
}

export function hitTestUi(
  items: UiDrawItem[],
  x: number,
  y: number,
  physics?: { entities: readonly UiEnt[]; viewport: Rect },
): UiDrawItem | null {
  let physicsTransforms: ReturnType<typeof buildWorldTransforms> | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.role === 'canvas') continue;
    if (it.blocksRaycasts === false) continue;
    if (it.clip && !pointInRect(x, y, it.clip)) continue;
    if (it.maskRegions?.some((mask) => !pointInMaskRegion(x, y, mask))) continue;
    const dropdownPopup = it.dropdown?.expanded
      && pointInRect(x, y, {
        x: it.rect.x,
        y: it.rect.y + it.rect.h,
        w: it.rect.w,
        h: it.rect.h * it.dropdown.options.length,
      });
    if (!pointInUiItem(x, y, it) && !dropdownPopup) continue;
    if (physics && it.blockingObjects && it.blockingObjects !== 'None') {
      physicsTransforms ??= buildWorldTransforms(physics.entities);
      if (uiGraphicPhysicallyBlocked(
        it,
        x,
        y,
        physics.entities,
        physics.viewport,
        physicsTransforms,
      )) continue;
    }
    if (it.button?.interactable) return it;
    if (it.toggle?.interactable) return it;
    if (it.slider?.interactable) return it;
    if (it.scrollbar?.interactable) return it;
    if (it.input?.interactable) return it;
    if (it.dropdown?.interactable) return it;
    if (it.list?.interactable) return it;
    if (it.scroll) return it;
    if (it.tabs?.interactable) return it;
    if (it.panel?.raycastTarget) return it;
    if (it.image?.raycastTarget) return it;
    if (it.rawImage?.raycastTarget) return it;
    if (it.text?.raycastTarget) return it;
  }
  return null;
}

export type UiBatch = {
  key: string;
  start: number;
  end: number;
  items: UiDrawItem[];
};

function batchKey(it: UiDrawItem): string {
  if (it.role === 'canvas') return 'editor/canvas';
  if (it.tabs) return 'ui/solid/tabs+text';
  if (it.list) return 'ui/solid/list+text';
  if (it.dropdown) return 'ui/solid/dropdown+text';
  if (it.input) return 'ui/solid/input+text';
  if (it.progress) return 'ui/solid/progress+text';
  if (it.scroll) return 'ui/solid/scroll';
  if (it.panel) return 'ui/solid/panel';
  if (it.scrollbar) return 'ui/solid/scrollbar';
  if (it.slider) return 'ui/solid/slider';
  if (it.toggle) return 'ui/solid/toggle+text';
  if (it.button) return `ui/button/${it.image?.sprite ?? 'white'}+text`;
  if (it.text) return 'ui/text/system';
  if (it.image) return `ui/image/${it.image.sprite}`;
  if (it.rawImage) return `ui/raw-image/${it.rawImage.texture}`;
  return 'editor/selection';
}

/** Contiguous batching preserves painter order; non-adjacent items are never reordered. */
export function buildUiBatches(items: UiDrawItem[]): UiBatch[] {
  const batches: UiBatch[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const key = batchKey(item);
    const tail = batches[batches.length - 1];
    if (tail?.key === key) {
      tail.end = index + 1;
      tail.items.push(item);
    } else {
      batches.push({ key, start: index, end: index + 1, items: [item] });
    }
  }
  return batches;
}

function screenQuadUv(
  corners: Array<{ x: number; y: number }>,
  point: { x: number; y: number },
): { u: number; v: number } | null {
  if (corners.length !== 4) return null;
  const triangles = [
    { indices: [0, 1, 2], uv: [[0, 0], [1, 0], [1, 1]] },
    { indices: [0, 2, 3], uv: [[0, 0], [1, 1], [0, 1]] },
  ];
  for (const triangle of triangles) {
    const [a, b, c] = triangle.indices.map((index) => corners[index]);
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) <= 1e-6) continue;
    const wa = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y))
      / denominator;
    const wb = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y))
      / denominator;
    const wc = 1 - wa - wb;
    if (wa < -1e-4 || wb < -1e-4 || wc < -1e-4) continue;
    return {
      u: wa * triangle.uv[0][0] + wb * triangle.uv[1][0] + wc * triangle.uv[2][0],
      v: wa * triangle.uv[0][1] + wb * triangle.uv[1][1] + wc * triangle.uv[2][1],
    };
  }
  return null;
}

export function sliderValueAtPoint(it: UiDrawItem, x: number, y: number): number | null {
  const slider = it.slider;
  if (!slider || !slider.interactable) return null;
  const pivot = it.pivotScreen ?? rectPivot(it.rect, it.pivot);
  const projected = it.screenCorners ? screenQuadUv(it.screenCorners, { x, y }) : null;
  let t = projected
    ? (isVerticalRange(slider.direction) ? projected.v : projected.u)
    : normalizedRangePosition(
        { x, y },
        pivot,
        { w: it.rect.w, h: it.rect.h },
        it.pivot,
        it.rotation,
        slider.direction,
      );
  if (slider.direction === 'RightToLeft' || slider.direction === 'BottomToTop') t = 1 - t;
  t = Math.max(0, Math.min(1, t));
  const low = Math.min(slider.min, slider.max);
  const high = Math.max(slider.min, slider.max);
  let value = low + (high - low) * t;
  if (slider.wholeNumbers) value = Math.round(value);
  return value;
}

export function scrollbarValueAtPoint(it: UiDrawItem, x: number, y: number): number | null {
  const scrollbar = it.scrollbar;
  if (!scrollbar || !scrollbar.interactable) return null;
  const pivot = it.pivotScreen ?? rectPivot(it.rect, it.pivot);
  const projected = it.screenCorners ? screenQuadUv(it.screenCorners, { x, y }) : null;
  const normalized = projected
    ? (isVerticalRange(scrollbar.direction) ? projected.v : projected.u)
    : normalizedRangePosition(
        { x, y },
        pivot,
        { w: it.rect.w, h: it.rect.h },
        it.pivot,
        it.rotation,
        scrollbar.direction,
      );
  return scrollbarValueFromPosition(
    normalized,
    scrollbar.size,
    scrollbar.numberOfSteps,
    scrollbar.direction,
  );
}

export type UiPointAction = {
  component: 'Dropdown' | 'ListView' | 'TabView';
  patch: Record<string, unknown>;
  callback: unknown;
};

/** Resolve sub-control actions such as dropdown options, list rows and tab headers. */
export function uiPointAction(it: UiDrawItem, x: number, y: number): UiPointAction | null {
  if (it.dropdown?.interactable) {
    if (it.dropdown.expanded && y >= it.rect.y + it.rect.h) {
      const index = Math.floor((y - it.rect.y - it.rect.h) / Math.max(1, it.rect.h));
      if (x >= it.rect.x && x <= it.rect.x + it.rect.w && index >= 0 && index < it.dropdown.options.length) {
        return {
          component: 'Dropdown',
          patch: { selected_index: index, expanded: false },
          callback: it.dropdown.onValueChanged,
        };
      }
    }
    if (pointInUiItem(x, y, it)) {
      return {
        component: 'Dropdown',
        patch: { expanded: !it.dropdown.expanded },
        callback: null,
      };
    }
  }
  if (it.list?.interactable && pointInUiItem(x, y, it)) {
    const stride = Math.max(1, it.list.itemHeight + it.list.spacing);
    const index = Math.floor((y - it.rect.y + it.list.scrollOffset) / stride);
    if (index >= 0 && index < it.list.items.length) {
      return {
        component: 'ListView',
        patch: { selected_index: index },
        callback: it.list.onValueChanged,
      };
    }
  }
  if (it.tabs?.interactable && pointInUiItem(x, y, it) && y <= it.rect.y + it.tabs.tabHeight) {
    const count = Math.max(1, it.tabs.labels.length);
    const index = Math.max(0, Math.min(count - 1, Math.floor((x - it.rect.x) / (it.rect.w / count))));
    return {
      component: 'TabView',
      patch: { selected_index: index },
      callback: it.tabs.onValueChanged,
    };
  }
  return null;
}

function cssColor(color: [number, number, number, number], alpha = 1): string {
  return `rgba(${(color[0] * 255) | 0},${(color[1] * 255) | 0},${(color[2] * 255) | 0},${Math.max(0, Math.min(1, color[3] * alpha))})`;
}

export function hitTestUiSelect(items: UiDrawItem[], x: number, y: number): UiDrawItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.role !== 'graphic') continue;
    if (it.clip && !pointInRect(x, y, it.clip)) continue;
    if (it.maskRegions?.some((mask) => !pointInMaskRegion(x, y, mask))) continue;
    if (!pointInUiItem(x, y, it)) continue;
    return it;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.role !== 'canvas') continue;
    if (pointInUiItem(x, y, it)) return it;
  }
  return null;
}

function hideMaskGraphic(item: UiDrawItem): UiDrawItem {
  if (!item.mask || item.mask.showGraphic) return item;
  return {
    ...item,
    image: undefined,
    rawImage: undefined,
    button: undefined,
    text: undefined,
    toggle: undefined,
    slider: undefined,
    scrollbar: undefined,
    panel: undefined,
    progress: undefined,
    input: undefined,
    dropdown: undefined,
    list: undefined,
    scroll: undefined,
    tabs: undefined,
  };
}

export function drawUiItems(
  ctx: CanvasRenderingContext2D,
  items: UiDrawItem[],
  hoverId: number | null,
  pressId: number | null,
  opts?: { sceneLabel?: boolean; focusId?: number | null },
) {
  const showLabel = !!opts?.sceneLabel;
  const batches = buildUiBatches(items);
  const itemsByEntity = new Map(items.map((item) => [item.entity, item]));
  let contentLayer: HTMLCanvasElement | null = null;
  let maskLayer: HTMLCanvasElement | null = null;
  const layer = (kind: 'content' | 'mask') => {
    let canvas = kind === 'content' ? contentLayer : maskLayer;
    if (!canvas) {
      canvas = ctx.canvas.ownerDocument.createElement('canvas');
      if (kind === 'content') contentLayer = canvas;
      else maskLayer = canvas;
    }
    if (canvas.width !== ctx.canvas.width) canvas.width = ctx.canvas.width;
    if (canvas.height !== ctx.canvas.height) canvas.height = ctx.canvas.height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(ctx.getTransform());
    context.globalAlpha = kind === 'content' ? ctx.globalAlpha : 1;
    context.globalCompositeOperation = 'source-over';
    return context;
  };
  const drawMaskedItem = (item: UiDrawItem): boolean => {
    if (item.mask?.showGraphic === false && !item.selected && opts?.focusId !== item.entity) {
      return true;
    }
    if (!item.maskStack?.length) return false;
    const masks = item.maskStack.map((entity) => itemsByEntity.get(entity));
    if (masks.some((mask) => !mask)) return true;
    const content = layer('content');
    if (!content) return false;
    drawUiItems(
      content,
      [{ ...item, maskStack: [] }],
      hoverId,
      pressId,
      opts,
    );
    for (const mask of masks as UiDrawItem[]) {
      const maskContext = layer('mask');
      if (!maskContext || !maskLayer) return true;
      drawUiItems(
        maskContext,
        [{ ...mask, mask: undefined, maskStack: [], selected: false }],
        null,
        null,
      );
      content.save();
      content.setTransform(1, 0, 0, 1, 0, 0);
      content.globalAlpha = 1;
      content.globalCompositeOperation = 'destination-in';
      content.drawImage(maskLayer, 0, 0);
      content.restore();
    }
    if (!contentLayer) return true;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(contentLayer, 0, 0);
    ctx.restore();
    return true;
  };
  const fillReadableText = (
    value: string,
    x: number,
    y: number,
    maxWidth: number | undefined,
    color: [number, number, number, number],
    fontSize: number,
    outline?: {
      color: [number, number, number, number];
      width: number;
    },
  ) => {
    if (outline && outline.width > 0 && outline.color[3] > 0) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = cssColor(outline.color);
      ctx.lineWidth = Math.max(0.25, outline.width * 2);
      if (maxWidth == null) ctx.strokeText(value, x, y);
      else ctx.strokeText(value, x, y, maxWidth);
    } else if (showLabel) {
      const [r, g, b] = color;
      const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = luminance < 0.42
        ? 'rgba(255,255,255,0.9)'
        : 'rgba(0,0,0,0.9)';
      ctx.lineWidth = Math.max(2, Math.min(4, fontSize * 0.14));
      if (maxWidth == null) ctx.strokeText(value, x, y);
      else ctx.strokeText(value, x, y, maxWidth);
    }
    if (maxWidth == null) ctx.fillText(value, x, y);
    else ctx.fillText(value, x, y, maxWidth);
  };

  for (const batch of batches) for (const sourceItem of batch.items) {
    if (drawMaskedItem(sourceItem)) continue;
    const it = hideMaskGraphic(sourceItem);
    const { x, y, w, h } = it.rect;
    if (w < 0.5 || h < 0.5) continue;

    ctx.save();
    ctx.globalAlpha *= Math.max(0, Math.min(1, it.opacity));
    if (it.role === 'canvas') {
      const strokeCanvas = () => {
        if (it.screenCorners?.length === 4) {
          ctx.beginPath();
          ctx.moveTo(it.screenCorners[0].x, it.screenCorners[0].y);
          for (let index = 1; index < 4; index++) {
            ctx.lineTo(it.screenCorners[index].x, it.screenCorners[index].y);
          }
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.strokeRect(x, y, w, h);
        }
      };
      if (showLabel) {
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
        ctx.lineWidth = it.selected ? 5 : 4;
        strokeCanvas();
        ctx.strokeStyle = it.selected ? '#77d2ff' : '#4db6ea';
        ctx.lineWidth = it.selected ? 2.5 : 1.5;
        strokeCanvas();
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = it.selected
          ? 'rgba(100, 200, 255, 0.95)'
          : 'rgba(140, 160, 200, 0.55)';
        ctx.lineWidth = it.selected ? 2 : 1.25;
        strokeCanvas();
      }
      ctx.setLineDash([]);
      if (showLabel) {
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const labelWidth = ctx.measureText('Canvas').width + 12;
        ctx.fillStyle = 'rgba(13, 25, 34, 0.94)';
        ctx.fillRect(x + 1, y + 1, labelWidth, 19);
        ctx.fillStyle = '#8edbff';
        ctx.fillText('Canvas', x + 7, y + 4);
      }
      ctx.restore();
      continue;
    }

    if (it.clip) {
      ctx.beginPath();
      ctx.rect(it.clip.x, it.clip.y, it.clip.w, it.clip.h);
      ctx.clip();
    }

    let [r, g, b, a] = it.image?.color ?? it.rawImage?.color ?? [0.85, 0.85, 0.9, 0.92];
    const piv = it.pivotScreen ?? rectPivot(it.rect, it.pivot);
    const rotRad = (-it.rotation * Math.PI) / 180;

    const withRot = (draw: () => void) => {
      if (Math.abs(it.rotation) < 1e-4) {
        draw();
        return;
      }
      ctx.save();
      ctx.translate(piv.x, piv.y);
      ctx.rotate(rotRad);
      ctx.translate(-piv.x, -piv.y);
      draw();
      ctx.restore();
    };

    if (!it.image && !it.rawImage && !it.button && !it.text && !it.toggle && !it.slider && !it.scrollbar && !it.panel && !it.progress && !it.input && !it.dropdown && !it.list && !it.scroll && !it.tabs) {
      if (it.selected) {
        withRot(() => {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = 'rgba(100, 180, 255, 0.95)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        });
      }
      ctx.restore();
      continue;
    }

    if (it.button && it.button.transition === 'ColorTint') {
      if (pressId === it.entity) {
        r *= 0.75;
        g *= 0.75;
        b *= 0.75;
      } else if (hoverId === it.entity) {
        r = Math.min(1, r * 1.15);
        g = Math.min(1, g * 1.15);
        b = Math.min(1, b * 1.15);
      }
      if (!it.button.interactable) a *= 0.45;
    }

    withRot(() => {
      ctx.filter = graphicEffectFilter(it.shadow, it.outline);
      if (it.panel) {
        ctx.fillStyle = cssColor(it.panel.color);
        ctx.fillRect(x, y, w, h);
        if (it.panel.borderWidth > 0) {
          ctx.strokeStyle = cssColor(it.panel.borderColor);
          ctx.lineWidth = it.panel.borderWidth;
          ctx.strokeRect(x + it.panel.borderWidth * 0.5, y + it.panel.borderWidth * 0.5, Math.max(0, w - it.panel.borderWidth), Math.max(0, h - it.panel.borderWidth));
        }
      }

      if (it.scroll) {
        ctx.fillStyle = cssColor(it.scroll.viewportColor);
        ctx.fillRect(x, y, w, h);
        if (it.scroll.showScrollbar && it.scroll.vertical) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + w - 6, y + 2, 4, Math.max(12, h * 0.28));
        }
      }

      if (it.progress) {
        const low = Math.min(it.progress.min, it.progress.max);
        const high = Math.max(it.progress.min, it.progress.max);
        const t = high > low ? Math.max(0, Math.min(1, (it.progress.value - low) / (high - low))) : 0;
        const vertical = it.progress.direction === 'BottomToTop' || it.progress.direction === 'TopToBottom';
        const reverse = it.progress.direction === 'RightToLeft' || it.progress.direction === 'BottomToTop';
        ctx.fillStyle = cssColor(it.progress.backgroundColor);
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = cssColor(it.progress.fillColor);
        if (vertical) {
          const fill = h * t;
          ctx.fillRect(x, reverse ? y + h - fill : y, w, fill);
        } else {
          const fill = w * t;
          ctx.fillRect(reverse ? x + w - fill : x, y, fill, h);
        }
        if (it.progress.showLabel) {
          ctx.fillStyle = cssColor(it.progress.textColor);
          const fontSize = Math.max(8, it.progress.fontSize);
          ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          fillReadableText(
            `${Math.round(t * 100)}%`,
            x + w * 0.5,
            y + h * 0.5,
            undefined,
            it.progress.textColor,
            fontSize,
          );
        }
      }

      if (it.input) {
        ctx.fillStyle = cssColor(it.input.backgroundColor, it.input.interactable ? 1 : 0.45);
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = pressId === it.entity ? 'rgba(70,160,255,0.95)' : 'rgba(130,145,175,0.7)';
        ctx.lineWidth = pressId === it.entity ? 2 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        const value = it.input.text || it.input.placeholder;
        const textColor = it.input.text ? it.input.textColor : it.input.placeholderColor;
        const fontSize = Math.max(8, it.input.fontSize);
        ctx.fillStyle = cssColor(textColor, it.input.interactable ? 1 : 0.45);
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        fillReadableText(value, x + 8, y + h * 0.5, Math.max(0, w - 16), textColor, fontSize);
      }

      if (it.dropdown) {
        const dropdown = it.dropdown;
        ctx.fillStyle = cssColor(dropdown.backgroundColor, dropdown.interactable ? 1 : 0.45);
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = cssColor(dropdown.textColor, dropdown.interactable ? 1 : 0.45);
        const fontSize = Math.max(8, dropdown.fontSize);
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        fillReadableText(dropdown.options[dropdown.selectedIndex] ?? '', x + 8, y + h * 0.5, Math.max(0, w - 32), dropdown.textColor, fontSize);
        ctx.textAlign = 'center';
        fillReadableText(dropdown.expanded ? '-' : '+', x + w - 16, y + h * 0.5, undefined, dropdown.textColor, fontSize);
        if (dropdown.expanded) {
          dropdown.options.forEach((label, index) => {
            const iy = y + h * (index + 1);
            ctx.fillStyle = cssColor(index === dropdown.selectedIndex ? dropdown.selectedColor : dropdown.itemColor);
            ctx.fillRect(x, iy, w, h);
            ctx.fillStyle = cssColor(dropdown.textColor);
            ctx.textAlign = 'left';
            fillReadableText(label, x + 8, iy + h * 0.5, Math.max(0, w - 16), dropdown.textColor, fontSize);
          });
        }
      }

      if (it.list) {
        ctx.fillStyle = cssColor(it.list.backgroundColor);
        ctx.fillRect(x, y, w, h);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        const stride = it.list.itemHeight + it.list.spacing;
        const first = Math.max(0, Math.floor(it.list.scrollOffset / Math.max(1, stride)));
        const last = Math.min(it.list.items.length, first + Math.ceil(h / Math.max(1, stride)) + 2);
        for (let index = first; index < last; index++) {
          const label = it.list.items[index];
          const iy = y + index * stride - it.list!.scrollOffset;
          if (iy + it.list.itemHeight < y || iy > y + h) continue;
          ctx.fillStyle = cssColor(index === it.list!.selectedIndex ? it.list!.selectedColor : it.list!.itemColor, it.list!.interactable ? 1 : 0.45);
          ctx.fillRect(x, iy, w, it.list!.itemHeight);
          ctx.fillStyle = cssColor(it.list!.textColor, it.list!.interactable ? 1 : 0.45);
          const fontSize = Math.max(8, it.list!.fontSize);
          ctx.font = `${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          fillReadableText(label, x + 8, iy + it.list!.itemHeight * 0.5, Math.max(0, w - 16), it.list!.textColor, fontSize);
        }
        ctx.restore();
      }

      if (it.tabs) {
        ctx.fillStyle = cssColor(it.tabs.backgroundColor);
        ctx.fillRect(x, y, w, h);
        const count = Math.max(1, it.tabs.labels.length);
        const tabWidth = w / count;
        it.tabs.labels.forEach((label, index) => {
          ctx.fillStyle = cssColor(index === it.tabs!.selectedIndex ? it.tabs!.selectedColor : it.tabs!.tabColor, it.tabs!.interactable ? 1 : 0.45);
          ctx.fillRect(x + index * tabWidth, y, tabWidth, it.tabs!.tabHeight);
          ctx.fillStyle = cssColor(it.tabs!.textColor, it.tabs!.interactable ? 1 : 0.45);
          const fontSize = Math.max(8, it.tabs!.fontSize);
          ctx.font = `${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          fillReadableText(label, x + (index + 0.5) * tabWidth, y + it.tabs!.tabHeight * 0.5, Math.max(0, tabWidth - 8), it.tabs!.textColor, fontSize);
        });
      }

      if (it.image || it.rawImage || it.button) {
        const sprite = it.image?.sprite ?? it.rawImage?.texture ?? 'white';
        const tint: [number, number, number, number] = [r, g, b, a];
        const imageRect = (it.image?.imageType === 'Simple' || it.image?.imageType === 'Filled') && it.image.preserveAspect
          ? fitImageAspectRect({ x, y, w, h }, it.image.sourceSize)
          : { x, y, w, h };
        const { x: imageX, y: imageY, w: imageW, h: imageH } = imageRect;
        const fillQuads = it.image?.imageType === 'Filled'
          ? planFilledImage(
              it.image.fillMethod,
              it.image.fillAmount,
              it.image.fillClockwise,
              it.image.fillOrigin,
            )
          : null;
        if (fillQuads) {
          ctx.save();
          traceFilledImagePath(ctx, imageX, imageY, imageW, imageH, fillQuads);
          ctx.clip();
        }
        const drawn =
          sprite !== 'white' && (it.rawImage
            ? drawSpriteUvInRect(ctx, sprite, x, y, w, h, tint, it.rawImage.uvRect)
            : it.image?.imageType === 'Tiled'
            ? drawSpriteTiledInRect(
                ctx,
                sprite,
                imageX,
                imageY,
                imageW,
                imageH,
                tint,
                it.image.border,
                it.image.displayBorder,
                it.image.sourceSize,
                it.image.spritePixelScale,
                it.image.fillCenter,
              )
            : it.image?.imageType === 'Sliced'
            ? drawSpriteSlicedInRect(
                ctx,
                sprite,
                imageX,
                imageY,
                imageW,
                imageH,
                tint,
                it.image.border,
                it.image.displayBorder,
                it.image.sourceSize,
                it.image.fillCenter,
              )
            : drawSpriteInRect(ctx, sprite, imageX, imageY, imageW, imageH, tint));

        if (!drawn) {
          ctx.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a})`;
          if (it.image?.imageType === 'Tiled' || (it.image?.imageType === 'Sliced' && !it.image.fillCenter)) {
            const regions = it.image.imageType === 'Tiled'
              ? planTiledImage(
                  it.image.sourceSize,
                  [imageW, imageH],
                  it.image.border,
                  it.image.displayBorder,
                  it.image.spritePixelScale,
                  it.image.fillCenter,
                )
              : planNineSlice(
                  it.image.sourceSize,
                  [imageW, imageH],
                  it.image.border,
                  it.image.displayBorder,
                  false,
                );
            for (const region of regions) {
              ctx.fillRect(
                imageX + region.destination.x,
                imageY + region.destination.y,
                region.destination.w,
                region.destination.h,
              );
            }
          } else {
            ctx.fillRect(imageX, imageY, imageW, imageH);
          }
        }
        if (fillQuads) ctx.restore();
      }

      if (it.button) {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }

      if (it.button) {
        ctx.fillStyle = cssColor(it.button.textColor, it.button.interactable ? 1 : 0.45);
        const fontSize = Math.max(8, it.button.fontSize);
        ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        fillReadableText(it.button.label, x + w * 0.5, y + h * 0.5, Math.max(0, w - 12), it.button.textColor, fontSize);
      }

      if (it.text) {
        const tx = it.text.alignment === 'Left' ? x + 4 : it.text.alignment === 'Right' ? x + w - 4 : x + w * 0.5;
        const ty = it.text.verticalAlign === 'Top' ? y + 2 : it.text.verticalAlign === 'Bottom' ? y + h - 2 : y + h * 0.5;
        const fontSize = Math.max(8, it.text.fontSize);
        ctx.fillStyle = cssColor(it.text.color);
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = it.text.alignment.toLowerCase() as CanvasTextAlign;
        ctx.textBaseline = it.text.verticalAlign === 'Top' ? 'top' : it.text.verticalAlign === 'Bottom' ? 'bottom' : 'middle';
        fillReadableText(
          it.text.text,
          tx,
          ty,
          Math.max(0, w - 8),
          it.text.color,
          fontSize,
          { color: it.text.outlineColor, width: it.text.outlineWidth },
        );
      }

      if (it.toggle) {
        const alpha = it.toggle.interactable ? 1 : 0.45;
        const box = Math.max(12, Math.min(h - 8, 24));
        const bx = x + 4;
        const by = y + (h - box) * 0.5;
        ctx.fillStyle = 'rgba(20,22,26,0.95)';
        ctx.fillRect(bx, by, box, box);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.strokeRect(bx + 0.5, by + 0.5, box - 1, box - 1);
        if (it.toggle.isOn) {
          ctx.fillStyle = cssColor(it.toggle.color, alpha);
          ctx.fillRect(bx + 3, by + 3, box - 6, box - 6);
          ctx.strokeStyle = 'white';
          ctx.lineWidth = Math.max(1.5, box * 0.08);
          ctx.beginPath();
          ctx.moveTo(bx + box * 0.24, by + box * 0.52);
          ctx.lineTo(bx + box * 0.43, by + box * 0.72);
          ctx.lineTo(bx + box * 0.78, by + box * 0.28);
          ctx.stroke();
        }
        ctx.fillStyle = cssColor(it.toggle.textColor, alpha);
        const fontSize = Math.max(8, it.toggle.fontSize);
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        fillReadableText(it.toggle.label, bx + box + 8, y + h * 0.5, Math.max(0, w - box - 16), it.toggle.textColor, fontSize);
      }

      if (it.slider) {
        const alpha = it.slider.interactable ? 1 : 0.45;
        const low = Math.min(it.slider.min, it.slider.max);
        const high = Math.max(it.slider.min, it.slider.max);
        const t = high > low ? Math.max(0, Math.min(1, (it.slider.value - low) / (high - low))) : 0;
        const vertical = it.slider.direction === 'BottomToTop' || it.slider.direction === 'TopToBottom';
        const reverse = it.slider.direction === 'RightToLeft' || it.slider.direction === 'BottomToTop';
        ctx.fillStyle = cssColor(it.slider.backgroundColor, alpha);
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = cssColor(it.slider.fillColor, alpha);
        if (vertical) {
          const fill = h * t;
          ctx.fillRect(x, reverse ? y + h - fill : y, w, fill);
          const hy = reverse ? y + h - fill : y + fill;
          ctx.fillStyle = cssColor(it.slider.handleColor, alpha);
          ctx.fillRect(x - 2, hy - 3, w + 4, 6);
        } else {
          const fill = w * t;
          ctx.fillRect(reverse ? x + w - fill : x, y, fill, h);
          const hx = reverse ? x + w - fill : x + fill;
          ctx.fillStyle = cssColor(it.slider.handleColor, alpha);
          ctx.fillRect(hx - 3, y - 2, 6, h + 4);
        }
      }

      if (it.scrollbar) {
        const alpha = it.scrollbar.interactable ? 1 : 0.45;
        const vertical = isVerticalRange(it.scrollbar.direction);
        const length = Math.max(1, vertical ? h : w);
        const effectiveSize = Math.max(
          it.scrollbar.size,
          Math.min(1, 4 / length),
        );
        const handle = scrollbarHandleRange(
          it.scrollbar.value,
          effectiveSize,
          it.scrollbar.direction,
        );
        ctx.fillStyle = cssColor(it.scrollbar.backgroundColor, alpha);
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = cssColor(it.scrollbar.handleColor, alpha);
        if (vertical) {
          ctx.fillRect(x, y + h * handle.start, w, h * handle.size);
        } else {
          ctx.fillRect(x + w * handle.start, y, w * handle.size, h);
        }
      }

      if (opts?.focusId === it.entity) {
        ctx.filter = 'none';
        ctx.setLineDash([3, 2]);
        ctx.strokeStyle = 'rgba(112, 210, 255, 0.98)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        ctx.setLineDash([]);
      }

      if (it.selected) {
        ctx.filter = 'none';
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
      }
    });
    ctx.restore();
  }
  return {
    elements: items.filter((item) => item.role === 'graphic').length,
    primitives: items.length,
    batches: batches.length,
  };
}
