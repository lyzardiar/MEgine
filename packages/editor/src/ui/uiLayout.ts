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
  sampleSpriteAlpha,
} from '../spriteDraw';
import { planNineSlice, type SpriteBorder } from './nineSlice';
import { fitImageAspectRect } from './imageGeometry';
import { planTiledImage } from './tiledImage';
import { imageAlphaHitTest, projectedQuadUv } from './imageAlphaHitTest';
import {
  planFilledImage,
  traceFilledImagePath,
  type ImageFillMethod,
} from './imageFill';
import { applyAspectRatio } from './aspectRatioFitter';
import { applyContentSize, measureLayoutContent, type LayoutMetrics } from './contentSizeFitter';
import { graphicEffectFilter, type UiGraphicEffect } from './graphicEffect';
import {
  advanceButtonTint,
  buttonVisualState,
  multiplyButtonTint,
  readButtonColorBlock,
  type ButtonColorBlock,
  type ButtonTintTween,
} from './buttonColorTint';
import {
  buttonTargetSprite,
  readButtonSpriteState,
  type ButtonSpriteState,
} from './buttonSpriteSwap';
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
import {
  layoutUiText,
  type UiTextGlyphMeasurement,
  type UiTextLayoutRun,
} from './uiTextLayout';
import type { UiRichTextGlyph } from './uiRichText';
import { uiTextFontCss } from './uiFontAssets';

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

export type UiSoftClip = {
  rect: Rect;
  softness: [number, number];
};

export type UiDrawItem = {
  entity: number;
  /** Nearest Canvas; nested Canvases are independent Unity batching islands. */
  canvasBatchRoot: number;
  /** Unity Canvas normalized spatial grid size used by overlap-aware batching. */
  canvasSortingGridSize: number;
  /** Effective Unity AdditionalCanvasShaderChannels mask for this Canvas. */
  canvasShaderChannels: number;
  rect: Rect;
  depth: number;
  role: 'canvas' | 'graphic';
  rotation: number;
  pivot: [number, number];
  /** Unity Graphic.raycastPadding in rendered pixels: left, bottom, right, top. */
  raycastPadding?: [number, number, number, number];
  /** Projected padded quad used by World Space / Scene-view raycasts. */
  raycastScreenCorners?: Array<{ x: number; y: number }>;
  opacity: number;
  /** Pointer raycasts are rejected when a CanvasGroup disables them. */
  blocksRaycasts?: boolean;
  /** False when authored Graphics exist but every one is disabled or opted out of raycasts. */
  graphicRaycastTarget?: boolean;
  /** Unity CanvasRenderer transparent-vertex geometry culling. */
  cullTransparentMesh?: boolean;
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
  /** Nested RectMask2D soft clips, ordered outermost to innermost. */
  softClips?: UiSoftClip[];
  /** Enabled Unity Mask on this Graphic. Its alpha becomes the child stencil shape. */
  mask?: { showGraphic: boolean };
  /** Ancestor Mask Graphic entity ids, ordered outermost to innermost. */
  maskStack?: number[];
  /** Ancestor Mask rectangles used by Unity-style ICanvasRaycastFilter. */
  maskRegions?: UiMaskRegion[];
  image?: {
    material: string;
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
    alphaHitTestMinimumThreshold: number;
    /** Unprojected RectTransform geometry used by Unity Image.MapCoordinate. */
    alphaHitTestSize: [number, number];
    alphaHitTestBorder: SpriteBorder;
    /** Last Selectable SpriteSwap result; falls back to the authored sprite before first draw. */
    alphaHitTestSprite?: string;
  };
  button?: {
    interactable: boolean;
    transition: string;
    colorBlock: ButtonColorBlock;
    spriteState: ButtonSpriteState;
    label: string;
    textColor: [number, number, number, number];
    fontSize: number;
    onClick: unknown;
  };
  text?: {
    material: string;
    text: string;
    color: [number, number, number, number];
    font: string;
    fontSize: number;
    /** World Space Canvas dynamic bitmap density; layout geometry remains unchanged. */
    dynamicPixelsPerUnit: number;
    fontStyle: 'Normal' | 'Bold' | 'Italic' | 'BoldAndItalic';
    alignByGeometry: boolean;
    supportRichText: boolean;
    bestFit: boolean;
    minSize: number;
    maxSize: number;
    fontScale: number;
    outlineColor: [number, number, number, number];
    outlineWidth: number;
    alignment: 'Left' | 'Center' | 'Right';
    verticalAlign: 'Top' | 'Middle' | 'Bottom';
    lineSpacing: number;
    horizontalOverflow: 'Wrap' | 'Overflow';
    verticalOverflow: 'Truncate' | 'Overflow';
    raycastTarget: boolean;
  };
  rawImage?: {
    material: string;
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
    material: string;
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
  /** Per-corner reciprocal clip W for perspective-correct pointer UVs. */
  screenCornerInverseW?: [number, number, number, number];
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

function graphicEnabled(component: Record<string, unknown> | undefined): boolean {
  return component != null && component.enabled !== false;
}

function graphicRaycastTarget(
  component: Record<string, unknown> | undefined,
  fallback: boolean,
): boolean {
  if (!graphicEnabled(component)) return false;
  const value = component?.raycast_target ?? component?.raycastTarget;
  return value == null ? fallback : value === true;
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

function intersectOptionalRect(a: Rect | undefined, b: Rect | undefined): Rect | undefined {
  if (!a) return b;
  if (!b) return a;
  return intersectRect(a, b);
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

function insetRectLbrt(rect: Rect, raw: unknown, scale: number): Rect {
  const p = Array.isArray(raw) ? raw : [0, 0, 0, 0];
  return insetRect(rect, [p[0], p[3], p[2], p[1]], scale);
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

function paddedRaycastGeometry(
  rect: Rect,
  pivot: [number, number],
  padding: [number, number, number, number] | undefined,
): { rect: Rect; pivot: [number, number] } | null {
  const [left, bottom, right, top] = padding ?? [0, 0, 0, 0];
  const width = rect.w - left - right;
  const height = rect.h - top - bottom;
  if (!(width > 0) || !(height > 0)) return null;
  const x = rect.x + left;
  const y = rect.y + top;
  const pivotPoint = rectPivot(rect, pivot);
  return {
    rect: { x, y, w: width, h: height },
    pivot: [(pivotPoint.x - x) / width, (pivotPoint.y - y) / height],
  };
}

function scaleSceneVisuals(item: UiDrawItem, scale: number): UiDrawItem {
  const s = Math.max(0.01, scale);
  const font = (value: number) => Math.max(10, value * s);
  return {
    ...item,
    raycastPadding: item.raycastPadding?.map((value) => value * s) as
      | [number, number, number, number]
      | undefined,
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
    let paintOrder = 0;
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
        canvasBatchRoot: canvas.entity,
        canvasSortingGridSize: 0.1,
        canvasShaderChannels: 0,
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
        softClips: [] as UiSoftClip[],
      },
      inheritedClip?: Rect,
      inheritedRectMaskClip?: Rect,
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

      const authoredImage = ent.components.Image as Record<string, unknown> | undefined;
      const authoredRawImage = ent.components.RawImage as Record<string, unknown> | undefined;
      const canvasRenderer = ent.components.CanvasRenderer as Record<string, unknown> | undefined;
      const shadow = ent.components.Shadow as Record<string, unknown> | undefined;
      const outline = ent.components.Outline as Record<string, unknown> | undefined;
      const btn = ent.components.Button as Record<string, unknown> | undefined;
      const authoredText = ent.components.Text as Record<string, unknown> | undefined;
      const toggle = ent.components.Toggle as Record<string, unknown> | undefined;
      const slider = ent.components.Slider as Record<string, unknown> | undefined;
      const scrollbar = ent.components.Scrollbar as Record<string, unknown> | undefined;
      const authoredPanel = ent.components.Panel as Record<string, unknown> | undefined;
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
        normalized_sorting_grid_size?: number;
        normalizedSortingGridSize?: number;
        additional_shader_channels?: number;
        additionalShaderChannels?: number;
        render_mode?: string;
        renderMode?: string;
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
      const img = graphicEnabled(authoredImage) ? authoredImage : undefined;
      const rawImage = graphicEnabled(authoredRawImage) ? authoredRawImage : undefined;
      const text = graphicEnabled(authoredText) ? authoredText : undefined;
      const panel = graphicEnabled(authoredPanel) ? authoredPanel : undefined;
      const hasAuthoredGraphic = authoredImage != null
        || authoredRawImage != null
        || authoredText != null
        || authoredPanel != null;
      const hasEnabledGraphic = img != null || rawImage != null || text != null || panel != null;
      const graphicSource = img ?? rawImage ?? text ?? panel;
      const graphicMaskable = graphicSource?.maskable !== false;
      const receivesGraphicRaycast = !hasAuthoredGraphic
        || graphicRaycastTarget(img, true)
        || graphicRaycastTarget(rawImage, true)
        || graphicRaycastTarget(text, true)
        || graphicRaycastTarget(panel, false);
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
        canvasBatchRoot: canvasSettings ? ent.entity : inherited.canvasBatchRoot,
        canvasSortingGridSize: canvasSettings
          ? number(
              canvasSettings.normalized_sorting_grid_size
                ?? canvasSettings.normalizedSortingGridSize,
              0.1,
            )
          : inherited.canvasSortingGridSize,
        canvasShaderChannels: canvasSettings
          ? effectiveCanvasShaderChannels(
              number(
                canvasSettings.additional_shader_channels
                  ?? canvasSettings.additionalShaderChannels,
                0,
              ),
              canvasSettings.render_mode ?? canvasSettings.renderMode ?? 'ScreenSpaceOverlay',
            )
          : inherited.canvasShaderChannels,
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
        softClips: inherited.softClips,
      };
      const clip = graphicMaskable
        ? intersectOptionalRect(inheritedClip, inheritedRectMaskClip)
        : inheritedClip;
      let childClip = inheritedClip;
      let childRectMaskClip = inheritedRectMaskClip;
      let ownSoftClip: UiSoftClip | undefined;
      if (rectMask && rectMask.enabled !== false) {
        const inset = insetRectLbrt(rect, rectMask.padding, scale);
        const maskRect = state.pixelPerfect
          ? { x: Math.round(inset.x), y: Math.round(inset.y), w: Math.round(inset.w), h: Math.round(inset.h) }
          : inset;
        childRectMaskClip = intersectOptionalRect(childRectMaskClip, maskRect);
        const softness = number2(rectMask.softness, [0, 0]);
        ownSoftClip = {
          rect: maskRect,
          softness: [
            Math.max(0, softness[0]) * scale,
            Math.max(0, softness[1]) * scale,
          ],
        };
      }
      if (scroll || list) childClip = childClip ? intersectRect(childClip, rect) : rect;
      const renderedRect = state.pixelPerfect
        ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) }
        : rect;
      const imagePixelsPerUnitMultiplier = Math.max(0.01, number(
        img?.pixels_per_unit_multiplier ?? img?.pixelsPerUnitMultiplier,
        1,
      ));
      const imageSpritePixelScale = spritePixelScale / imagePixelsPerUnitMultiplier;
      const raycastPaddingSource = img ?? rawImage ?? text ?? panel;
      const raycastPadding = number4(
        raycastPaddingSource?.raycast_padding ?? raycastPaddingSource?.raycastPadding,
        [0, 0, 0, 0],
      ).map((value) => value * scale) as [number, number, number, number];
      const hasMaskGraphic = hasAuthoredGraphic || !!(
        btn || toggle || slider || scrollbar || progress || input || dropdown || list || scroll || tabs
      );
      const ownMaskEnabled = stencilMask?.enabled !== false
        && stencilMask != null
        && hasMaskGraphic
        && state.visualMasks.length < 8;
      const itemMaskStack = graphicMaskable || ownMaskEnabled ? state.visualMasks : [];
      const itemMaskRegions = graphicMaskable ? state.maskRegions : [];
      const itemSoftClips = graphicMaskable ? state.softClips : [];

      if (isCanvas) {
        out.push({
          entity: ent.entity,
          canvasBatchRoot: state.canvasBatchRoot,
          canvasSortingGridSize: state.canvasSortingGridSize,
          canvasShaderChannels: state.canvasShaderChannels,
          rect: renderedRect,
          depth: depthBase + paintOrder++,
          role: 'canvas',
          rotation: 0,
          pivot: [0.5, 0.5],
          opacity: state.opacity,
          blocksRaycasts: state.blocksRaycasts && state.raycasterEnabled,
          ignoreReversedGraphics: state.ignoreReversedGraphics,
          blockingObjects: state.blockingObjects,
          blockingMask: state.blockingMask,
          clip,
          softClips: itemSoftClips,
          maskStack: itemMaskStack,
          maskRegions: itemMaskRegions,
          selected: selectedIds.has(ent.entity),
        });
      } else if (hasAuthoredGraphic || btn || toggle || slider || scrollbar || progress || input || dropdown || list || scroll || tabs) {
        out.push({
          entity: ent.entity,
          canvasBatchRoot: state.canvasBatchRoot,
          canvasSortingGridSize: state.canvasSortingGridSize,
          canvasShaderChannels: state.canvasShaderChannels,
          rect: renderedRect,
          depth: depthBase + paintOrder++,
          role: 'graphic',
          rotation,
          pivot,
          raycastPadding,
          anchorParentRect,
          opacity: state.opacity,
          blocksRaycasts: state.blocksRaycasts && state.raycasterEnabled,
          graphicRaycastTarget: receivesGraphicRaycast,
          cullTransparentMesh:
            canvasRenderer?.cull_transparent_mesh !== false
            && canvasRenderer?.cullTransparentMesh !== false,
          ignoreReversedGraphics: state.ignoreReversedGraphics,
          blockingObjects: state.blockingObjects,
          blockingMask: state.blockingMask,
          clip,
          softClips: itemSoftClips,
          mask: ownMaskEnabled
            ? {
                showGraphic:
                  stencilMask.show_mask_graphic !== false
                  && stencilMask.showMaskGraphic !== false,
              }
            : undefined,
          maskStack: itemMaskStack,
          maskRegions: itemMaskRegions,
          image: img
            ? {
                material: String(img.material ?? '').trim().replaceAll('\\', '/'),
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
                spritePixelScale: imageSpritePixelScale,
                border: number4(img.border, [0, 0, 0, 0]),
                displayBorder: number4(img.border, [0, 0, 0, 0]).map(
                  (value) => Math.max(0, value) * imageSpritePixelScale,
                ) as SpriteBorder,
                sourceSize: number2(img.source_size ?? img.sourceSize, [100, 100]),
                raycastTarget: graphicRaycastTarget(img, true),
                alphaHitTestMinimumThreshold: number(
                  img.alpha_hit_test_minimum_threshold ?? img.alphaHitTestMinimumThreshold,
                  0,
                ),
                alphaHitTestSize: [renderedRect.w, renderedRect.h],
                alphaHitTestBorder: number4(img.border, [0, 0, 0, 0]).map(
                  (value) => Math.max(0, value) * imageSpritePixelScale,
                ) as SpriteBorder,
              }
            : undefined,
          button: btn
            ? {
                interactable: btn.interactable !== false && state.interactable,
                transition: String(btn.transition ?? 'ColorTint'),
                colorBlock: readButtonColorBlock(btn),
                spriteState: readButtonSpriteState(btn),
                label: String(btn.label ?? 'Button'),
                textColor: color4(btn.text_color ?? btn.textColor, [1, 1, 1, 1]),
                fontSize: number(btn.font_size ?? btn.fontSize, 16) * scale,
                onClick: btn.on_click ?? btn.onClick ?? null,
              }
            : undefined,
          rawImage: rawImage
            ? {
                material: String(rawImage.material ?? '').trim().replaceAll('\\', '/'),
                color: color4(rawImage.color, [1, 1, 1, 1]),
                texture: resolveSpriteId(String(rawImage.texture ?? 'white')),
                uvRect: number4(rawImage.uv_rect ?? rawImage.uvRect, [0, 0, 1, 1]),
                raycastTarget: graphicRaycastTarget(rawImage, true),
              }
            : undefined,
          shadow: hasEnabledGraphic && shadow
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
          outline: hasEnabledGraphic && outline
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
                material: String(text.material ?? '').trim().replaceAll('\\', '/'),
                text: String(text.text ?? 'Text'),
                color: color4(text.color, [1, 1, 1, 1]),
                font: String(text.font ?? '').trim().replaceAll('\\', '/'),
                fontSize: Math.min(
                  512,
                  Math.max(1, number(text.font_size ?? text.fontSize, 16) * scale),
                ),
                dynamicPixelsPerUnit: 1,
                fontStyle: enumValue(
                  text.font_style ?? text.fontStyle,
                  ['Normal', 'Bold', 'Italic', 'BoldAndItalic'] as const,
                  'Normal',
                ),
                alignByGeometry:
                  text.align_by_geometry === true || text.alignByGeometry === true,
                supportRichText:
                  text.support_rich_text !== false && text.supportRichText !== false,
                bestFit:
                  text.resize_text_for_best_fit === true
                  || text.resizeTextForBestFit === true,
                minSize: Math.min(300, Math.max(1, number(
                  text.resize_text_min_size ?? text.resizeTextMinSize,
                  10,
                ))),
                maxSize: Math.min(300, Math.max(1, number(
                  text.resize_text_max_size ?? text.resizeTextMaxSize,
                  40,
                ))),
                fontScale: scale,
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
                lineSpacing: Math.min(
                  10,
                  Math.max(0.1, number(text.line_spacing ?? text.lineSpacing, 1)),
                ),
                horizontalOverflow: enumValue(
                  text.horizontal_overflow ?? text.horizontalOverflow,
                  ['Wrap', 'Overflow'] as const,
                  'Wrap',
                ),
                verticalOverflow: enumValue(
                  text.vertical_overflow ?? text.verticalOverflow,
                  ['Truncate', 'Overflow'] as const,
                  'Truncate',
                ),
                raycastTarget: graphicRaycastTarget(text, true),
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
                material: String(panel.material ?? '').trim().replaceAll('\\', '/'),
                color: color4(panel.color, [0.12, 0.14, 0.18, 0.96]),
                borderColor: color4(panel.border_color ?? panel.borderColor, [0.32, 0.36, 0.44, 1]),
                borderWidth: number(panel.border_width ?? panel.borderWidth, 1) * scale,
                raycastTarget: graphicRaycastTarget(panel, false),
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
          canvasBatchRoot: state.canvasBatchRoot,
          canvasSortingGridSize: state.canvasSortingGridSize,
          canvasShaderChannels: state.canvasShaderChannels,
          rect: renderedRect,
          depth: depthBase + paintOrder++,
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
          softClips: itemSoftClips,
          maskStack: itemMaskStack,
          maskRegions: itemMaskRegions,
          selected: true,
        });
      }

      let childState = ownSoftClip && state.softClips.length < 8
        ? { ...state, softClips: [...state.softClips, ownSoftClip] }
        : state;
      if (ownMaskEnabled) {
        const nextMaskRegions = state.maskRegions.length < 8
          ? [...state.maskRegions, { rect: renderedRect, rotation, pivot }]
          : state.maskRegions;
        const nextVisualMasks = state.visualMasks.length < 8
          ? [...state.visualMasks, ent.entity]
          : state.visualMasks;
        childState = {
          ...childState,
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
        walk(
          child,
          childParent,
          depth + 1,
          false,
          forced,
          childState,
          childClip,
          childRectMaskClip,
        );
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
      canvasBatchRoot: canvas.entity,
      canvasSortingGridSize: 0.1,
      canvasShaderChannels: 0,
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
      softClips: [] as UiSoftClip[],
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
    depthBase += Math.max(1000, paintOrder + 1);
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
      const raycastGeometry = paddedRaycastGeometry(
        item.rect,
        item.pivot,
        item.raycastPadding,
      );
      const raycastProjected = raycastGeometry
        ? pixelCorners(raycastGeometry.rect, item.rotation, raycastGeometry.pivot)
            .map(([x, y]) => project(context.pixelToWorld(x, y), cam, viewport))
        : [];
      const raycastScreenCorners = raycastProjected.length === 4
        && raycastProjected.every(Boolean)
        ? (raycastProjected as Array<{ x: number; y: number }>).map(({ x, y }) => ({ x, y }))
        : [];
      const corners = pixelCorners(item.rect, item.rotation, item.pivot)
        .map(([x, y]) => project(context.pixelToWorld(x, y), cam, viewport));
      if (corners.some((point) => !point)) continue;
      const projected = corners as Array<{ x: number; y: number; depth: number; inverseW: number }>;
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
        raycastScreenCorners,
        screenCornerInverseW: projected.map((point) => point.inverseW) as [number, number, number, number],
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
  const authoredDynamicPixelsPerUnit = number(
    scaler?.dynamic_pixels_per_unit ?? scaler?.dynamicPixelsPerUnit,
    1,
  );
  const dynamicPixelsPerUnit = authoredDynamicPixelsPerUnit > 0
    ? Math.min(64, Math.max(0.01, authoredDynamicPixelsPerUnit))
    : 1;
  for (const item of items) {
    if (item.text) item.text.dynamicPixelsPerUnit = dynamicPixelsPerUnit;
  }
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
      const raycastGeometry = paddedRaycastGeometry(it.rect, it.pivot, it.raycastPadding);
      const raycastProjected = raycastGeometry
        ? pixelCorners(raycastGeometry.rect, it.rotation, raycastGeometry.pivot)
            .map(([px, py]) => project(uiPixelToWorld(px, py, cw, ch), cam, viewport))
        : [];
      const raycastScreenCorners = raycastProjected.length === 4
        && raycastProjected.every(Boolean)
        ? (raycastProjected as Array<{ x: number; y: number }>).map(({ x, y }) => ({ x, y }))
        : [];
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
      const softClips = it.softClips?.flatMap((softClip) => {
        const projected = projectPixelRect(softClip.rect);
        if (!projected) return [];
        return [{
          rect: projected,
          softness: [
            softClip.softness[0] * projected.w / Math.max(0.0001, softClip.rect.w),
            softClip.softness[1] * projected.h / Math.max(0.0001, softClip.rect.h),
          ] as [number, number],
        }];
      });
      out.push({
        ...sceneItem,
        rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        clip: it.clip ? projectPixelRect(it.clip) : undefined,
        depth: depthBase + it.depth,
        pivotScreen: pivS ? { x: pivS.x, y: pivS.y } : undefined,
        raycastScreenCorners,
        unrotatedSize: { w: it.rect.w * sceneScale, h: it.rect.h * sceneScale },
        anchorParentRect: it.anchorParentRect
          ? projectPixelRect(it.anchorParentRect)
          : undefined,
        maskRegions,
        softClips,
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
  const projectedCorners = it.raycastScreenCorners ?? it.screenCorners;
  if (projectedCorners) {
    if (projectedCorners.length !== 4) return false;
    let sign = 0;
    for (let index = 0; index < 4; index++) {
      const a = projectedCorners[index];
      const b = projectedCorners[(index + 1) % 4];
      const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
      if (Math.abs(cross) < 1e-4) continue;
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
    return true;
  }
  const geometry = paddedRaycastGeometry(it.rect, it.pivot, it.raycastPadding);
  if (!geometry) return false;
  if (it.role === 'canvas' || Math.abs(it.rotation) < 1e-4) {
    return pointInRect(px, py, geometry.rect);
  }
  const { w, h } = geometry.rect;
  const piv = rectPivot(geometry.rect, geometry.pivot);
  const axes = rectLocalAxes(it.rotation);
  const dx = px - piv.x;
  const dy = py - piv.y;
  const u = dx * axes.x.dx + dy * axes.x.dy;
  const v = dx * axes.y.dx + dy * axes.y.dy;
  const [pxN, pyN] = geometry.pivot;
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
    if (it.graphicRaycastTarget === false) continue;
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
    if (it.image?.raycastTarget && !imageAllowsRaycast(it, x, y)) continue;
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

function imageAllowsRaycast(it: UiDrawItem, x: number, y: number): boolean {
  const image = it.image;
  if (!image || image.alphaHitTestMinimumThreshold <= 0) return true;
  const projected = it.screenCorners
    ? projectedQuadUv(it.screenCorners, { x, y }, it.screenCornerInverseW)
    : null;
  // Negative raycast padding may intentionally admit points outside the
  // visible projected quad. Match Runtime by failing the texture-alpha filter
  // open when no original-Graphic UV exists for that expanded-only point.
  if (it.screenCorners && !projected) return true;
  let point: { x: number; y: number };
  if (projected) {
    point = {
      x: projected.x * image.alphaHitTestSize[0],
      y: projected.y * image.alphaHitTestSize[1],
    };
  } else {
    const pivot = it.pivotScreen ?? rectPivot(it.rect, it.pivot);
    const axes = rectLocalAxes(it.rotation);
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    point = {
      x: dx * axes.x.dx + dy * axes.x.dy + it.rect.w * it.pivot[0],
      y: dx * axes.y.dx + dy * axes.y.dy + it.rect.h * it.pivot[1],
    };
  }
  return imageAlphaHitTest(
    point,
    image.alphaHitTestSize,
    {
      imageType: image.imageType,
      sourceSize: image.sourceSize,
      sourceBorder: image.border,
      destinationBorder: image.alphaHitTestBorder,
      pixelScale: image.spritePixelScale,
      fillCenter: image.fillCenter,
    },
    image.alphaHitTestMinimumThreshold,
    (u, v) => sampleSpriteAlpha(image.alphaHitTestSprite ?? image.sprite, u, v),
  );
}

export type UiBatch = {
  key: string;
  canvasBatchRoot: number;
  shaderChannels: number;
  start: number;
  end: number;
  items: UiDrawItem[];
};

function batchKey(it: UiDrawItem): string {
  const withMaterial = (key: string, material: string | undefined) => (
    material ? `${key}|material=${material}` : key
  );
  if (it.role === 'canvas') return 'editor/canvas';
  if (it.tabs) return 'ui/solid/tabs+text';
  if (it.list) return 'ui/solid/list+text';
  if (it.dropdown) return 'ui/solid/dropdown+text';
  if (it.input) return 'ui/solid/input+text';
  if (it.progress) return 'ui/solid/progress+text';
  if (it.scroll) return 'ui/solid/scroll';
  if (it.panel) return withMaterial('ui/solid/panel', it.panel.material);
  if (it.scrollbar) return 'ui/solid/scrollbar';
  if (it.slider) return 'ui/solid/slider';
  if (it.toggle) return 'ui/solid/toggle+text';
  if (it.button) {
    return withMaterial(`ui/button/${it.image?.sprite ?? 'white'}+text`, it.image?.material);
  }
  if (it.text) return withMaterial('ui/text/system', it.text.material);
  if (it.image) return withMaterial(`ui/image/${it.image.sprite}`, it.image.material);
  if (it.rawImage) {
    return withMaterial(`ui/raw-image/${it.rawImage.texture}`, it.rawImage.material);
  }
  return 'editor/selection';
}

function batchCompatibilityKey(item: UiDrawItem): string {
  return `${batchKey(item)}/channels:${item.canvasShaderChannels}`;
}

const ALL_CANVAS_SHADER_CHANNELS = 1 | 2 | 4 | 8 | 16;

export function effectiveCanvasShaderChannels(mask: number, renderMode: string): number {
  const authored = Math.trunc(Number.isFinite(mask) ? mask : 0) & ALL_CANVAS_SHADER_CHANNELS;
  return renderMode === 'ScreenSpaceCamera' || renderMode === 'WorldSpace'
    ? authored | 8 | 16
    : authored;
}

const DEFAULT_CANVAS_SORTING_GRID_SIZE = 0.1;
const MAX_CANVAS_SORTING_GRID_AXIS = 128;
const MAX_CANVAS_SORTING_GRID_REFERENCES = 1_048_576;
const MAX_CANVAS_OVERLAP_EDGES = 262_144;

function normalizedCanvasSortingGridSize(value: number): number {
  return Number.isFinite(value) && value > 0
    ? Math.min(1, value)
    : DEFAULT_CANVAS_SORTING_GRID_SIZE;
}

function uiBatchBounds(item: UiDrawItem): Rect | null {
  const corners = item.screenCorners?.length === 4
    ? item.screenCorners
    : pixelCorners(item.rect, item.rotation, item.pivot);
  let minX = Math.min(...corners.map((point) => Array.isArray(point) ? point[0] : point.x));
  let minY = Math.min(...corners.map((point) => Array.isArray(point) ? point[1] : point.y));
  let maxX = Math.max(...corners.map((point) => Array.isArray(point) ? point[0] : point.x));
  let maxY = Math.max(...corners.map((point) => Array.isArray(point) ? point[1] : point.y));
  if (item.clip) {
    minX = Math.max(minX, item.clip.x);
    minY = Math.max(minY, item.clip.y);
    maxX = Math.min(maxX, item.clip.x + item.clip.w);
    maxY = Math.min(maxY, item.clip.y + item.clip.h);
  }
  if (![minX, minY, maxX, maxY].every(Number.isFinite) || maxX <= minX || maxY <= minY) {
    return null;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function uiBatchBoundsOverlap(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.w
    && right.x < left.x + left.w
    && left.y < right.y + right.h
    && right.y < left.y + left.h;
}

/**
 * Preserve every painter-order edge between overlapping transparent items,
 * while preferring a ready item that continues the current material batch.
 */
function optimizeCanvasBatchSegment(items: UiDrawItem[], rawGridSize: number): UiDrawItem[] {
  if (items.length < 3) return items;
  const bounds = items.map(uiBatchBounds);
  const visible = bounds.filter((value): value is Rect => value != null);
  if (!visible.length) return items;
  const area = visible.reduce((total, value) => ({
    x: Math.min(total.x, value.x),
    y: Math.min(total.y, value.y),
    w: Math.max(total.x + total.w, value.x + value.w) - Math.min(total.x, value.x),
    h: Math.max(total.y + total.h, value.y + value.h) - Math.min(total.y, value.y),
  }));
  const axis = Math.max(1, Math.min(
    MAX_CANVAS_SORTING_GRID_AXIS,
    Math.ceil(1 / normalizedCanvasSortingGridSize(rawGridSize)),
  ));
  const cellWidth = Math.max(Number.EPSILON, area.w / axis);
  const cellHeight = Math.max(Number.EPSILON, area.h / axis);
  const cellCoordinate = (point: number, origin: number, extent: number) => Math.max(
    0,
    Math.min(axis - 1, Math.floor((point - origin) / extent)),
  );
  const cellRange = (value: Rect) => ({
    minX: cellCoordinate(value.x, area.x, cellWidth),
    maxX: cellCoordinate(value.x + value.w, area.x, cellWidth),
    minY: cellCoordinate(value.y, area.y, cellHeight),
    maxY: cellCoordinate(value.y + value.h, area.y, cellHeight),
  });
  const cells = new Map<string, number[]>();
  const outgoing = items.map(() => [] as number[]);
  const indegree = items.map(() => 0);
  let gridReferences = 0;
  let overlapEdges = 0;
  let exceededBudget = false;
  bounds.forEach((current, index) => {
    if (!current || exceededBudget) return;
    const range = cellRange(current);
    gridReferences += (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
    if (gridReferences > MAX_CANVAS_SORTING_GRID_REFERENCES) {
      exceededBudget = true;
      return;
    }
    const candidates = new Set<number>();
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        for (const candidate of cells.get(`${x}:${y}`) ?? []) candidates.add(candidate);
      }
    }
    for (const earlier of candidates) {
      if (bounds[earlier] && uiBatchBoundsOverlap(bounds[earlier], current)) {
        overlapEdges++;
        if (overlapEdges > MAX_CANVAS_OVERLAP_EDGES) {
          exceededBudget = true;
          return;
        }
        outgoing[earlier].push(index);
        indegree[index]++;
      }
    }
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) {
        const key = `${x}:${y}`;
        const entries = cells.get(key) ?? [];
        entries.push(index);
        cells.set(key, entries);
      }
    }
  });
  if (exceededBudget) return items;

  const ready = new Set<number>();
  const readyByKey = new Map<string, Set<number>>();
  const addReady = (index: number) => {
    ready.add(index);
    const key = batchCompatibilityKey(items[index]);
    const entries = readyByKey.get(key) ?? new Set<number>();
    entries.add(index);
    readyByKey.set(key, entries);
  };
  indegree.forEach((degree, index) => {
    if (degree === 0) addReady(index);
  });
  const order: number[] = [];
  let previousKey: string | null = null;
  while (ready.size) {
    const matching = previousKey == null ? undefined : readyByKey.get(previousKey)?.values().next().value;
    const unlocksBatch = matching == null
      ? [...ready].find((candidate) => outgoing[candidate].some((dependent) => (
          indegree[dependent] === 1
          && readyByKey.has(batchCompatibilityKey(items[dependent]))
        )))
      : undefined;
    const next = matching ?? unlocksBatch ?? ready.values().next().value;
    if (next == null) break;
    ready.delete(next);
    const key = batchCompatibilityKey(items[next]);
    const keyed = readyByKey.get(key);
    keyed?.delete(next);
    if (keyed?.size === 0) readyByKey.delete(key);
    order.push(next);
    previousKey = key;
    for (const dependent of outgoing[next]) {
      indegree[dependent]--;
      if (indegree[dependent] === 0) addReady(dependent);
    }
  }
  return order.length === items.length ? order.map((index) => items[index]) : items;
}

function optimizeUiBatchOrder(items: UiDrawItem[]): UiDrawItem[] {
  const output: UiDrawItem[] = [];
  for (let start = 0; start < items.length;) {
    const root = items[start].canvasBatchRoot;
    const gridSize = items[start].canvasSortingGridSize;
    let end = start + 1;
    while (end < items.length
      && items[end].canvasBatchRoot === root
      && Object.is(items[end].canvasSortingGridSize, gridSize)) end++;
    output.push(...optimizeCanvasBatchSegment(items.slice(start, end), gridSize));
    start = end;
  }
  return output;
}

/** Unity-style overlap-aware batching preserves painter order where pixels intersect. */
export function buildUiBatches(items: UiDrawItem[]): UiBatch[] {
  items = optimizeUiBatchOrder(items);
  const batches: UiBatch[] = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const key = batchKey(item);
    const tail = batches[batches.length - 1];
    if (tail?.key === key
      && tail.canvasBatchRoot === item.canvasBatchRoot
      && tail.shaderChannels === item.canvasShaderChannels) {
      tail.end = index + 1;
      tail.items.push(item);
    } else {
      batches.push({
        key,
        canvasBatchRoot: item.canvasBatchRoot,
        shaderChannels: item.canvasShaderChannels,
        start: index,
        end: index + 1,
        items: [item],
      });
    }
  }
  return batches;
}

function screenQuadUv(
  corners: Array<{ x: number; y: number }>,
  point: { x: number; y: number },
  inverseW?: readonly number[],
): { u: number; v: number } | null {
  const uv = projectedQuadUv(corners, point, inverseW);
  return uv ? { u: uv.x, v: uv.y } : null;
}

export function sliderValueAtPoint(it: UiDrawItem, x: number, y: number): number | null {
  const slider = it.slider;
  if (!slider || !slider.interactable) return null;
  const pivot = it.pivotScreen ?? rectPivot(it.rect, it.pivot);
  const projected = it.screenCorners
    ? screenQuadUv(it.screenCorners, { x, y }, it.screenCornerInverseW)
    : null;
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
  const projected = it.screenCorners
    ? screenQuadUv(it.screenCorners, { x, y }, it.screenCornerInverseW)
    : null;
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

const TRANSPARENT_MESH_ALPHA_EPSILON = 1 / 255;

/** Match CanvasRenderer by testing the alpha of every geometry source on one UI renderer. */
export function uiTransparentMeshCulled(
  item: UiDrawItem,
  imageAlpha = item.image?.color[3] ?? item.rawImage?.color[3],
): boolean {
  if (item.role !== 'graphic' || item.cullTransparentMesh === false) return false;
  const opacity = Number.isFinite(item.opacity)
    ? Math.max(0, Math.min(1, item.opacity))
    : 1;
  if (opacity <= TRANSPARENT_MESH_ALPHA_EPSILON) return true;

  const alphas: number[] = [];
  if (item.image || item.rawImage) alphas.push(imageAlpha ?? 1);
  if (item.text?.text) {
    alphas.push(item.text.color[3]);
    if (item.text.outlineWidth > 0) alphas.push(item.text.outlineColor[3]);
  }
  if (item.panel) {
    alphas.push(item.panel.color[3]);
    if (item.panel.borderWidth > 0) alphas.push(item.panel.borderColor[3]);
  }
  if (item.button) {
    if (!item.image && !item.rawImage) alphas.push(1);
    if (item.button.label) alphas.push(item.button.textColor[3]);
  }
  if (item.toggle) alphas.push(0.95, item.toggle.color[3], item.toggle.textColor[3]);
  if (item.slider) {
    alphas.push(
      item.slider.backgroundColor[3],
      item.slider.fillColor[3],
      item.slider.handleColor[3],
    );
  }
  if (item.scrollbar) {
    alphas.push(item.scrollbar.backgroundColor[3], item.scrollbar.handleColor[3]);
  }
  if (item.progress) {
    alphas.push(item.progress.backgroundColor[3], item.progress.fillColor[3]);
    if (item.progress.showLabel) alphas.push(item.progress.textColor[3]);
  }
  if (item.input) {
    alphas.push(
      item.input.backgroundColor[3],
      item.input.textColor[3],
      item.input.placeholderColor[3],
    );
  }
  if (item.dropdown) {
    alphas.push(
      item.dropdown.backgroundColor[3],
      item.dropdown.itemColor[3],
      item.dropdown.selectedColor[3],
      item.dropdown.textColor[3],
    );
  }
  if (item.list) {
    alphas.push(
      item.list.backgroundColor[3],
      item.list.itemColor[3],
      item.list.selectedColor[3],
      item.list.textColor[3],
    );
  }
  if (item.scroll) alphas.push(item.scroll.viewportColor[3], item.scroll.showScrollbar ? 0.12 : 0);
  if (item.tabs) {
    alphas.push(
      item.tabs.backgroundColor[3],
      item.tabs.tabColor[3],
      item.tabs.selectedColor[3],
      item.tabs.textColor[3],
    );
  }

  const sourceGeometry = alphas.length > 0;
  const sourceVisible = alphas.some((alpha) => (
    Number.isFinite(alpha)
    && Math.abs(alpha * opacity) > TRANSPARENT_MESH_ALPHA_EPSILON
  ));
  if (sourceVisible) return false;
  if (sourceGeometry) {
    for (const effect of [item.shadow, item.outline]) {
      if (
        effect
        && !effect.useGraphicAlpha
        && Number.isFinite(effect.color[3])
        && Math.abs(effect.color[3] * opacity) > TRANSPARENT_MESH_ALPHA_EPSILON
      ) {
        return false;
      }
    }
  }
  return true;
}

function alphaIndependentEffectSource(item: UiDrawItem): UiDrawItem {
  const source = structuredClone(item);
  const opaque = (color: [number, number, number, number]) => (
    [color[0], color[1], color[2], 1] as [number, number, number, number]
  );
  source.opacity = 1;
  source.cullTransparentMesh = false;
  source.shadow = undefined;
  source.outline = undefined;
  source.mask = undefined;
  source.maskStack = [];
  source.softClips = [];
  source.selected = false;
  if (source.image) source.image.color = opaque(source.image.color);
  if (source.rawImage) source.rawImage.color = opaque(source.rawImage.color);
  if (source.text) {
    source.text.color = opaque(source.text.color);
    if (source.text.outlineColor[3] > 0) {
      source.text.outlineColor = opaque(source.text.outlineColor);
    }
  }
  if (source.panel) {
    source.panel.color = opaque(source.panel.color);
    source.panel.borderColor = opaque(source.panel.borderColor);
  }
  if (source.button) {
    source.button.interactable = true;
    source.button.textColor = opaque(source.button.textColor);
    source.button.colorBlock = {
      normal: opaque(source.button.colorBlock.normal),
      highlighted: opaque(source.button.colorBlock.highlighted),
      pressed: opaque(source.button.colorBlock.pressed),
      selected: opaque(source.button.colorBlock.selected),
      disabled: opaque(source.button.colorBlock.disabled),
      multiplier: 1,
      fadeDuration: 0,
    };
  }
  if (source.toggle) {
    source.toggle.interactable = true;
    source.toggle.color = opaque(source.toggle.color);
    source.toggle.textColor = opaque(source.toggle.textColor);
  }
  if (source.slider) {
    source.slider.interactable = true;
    source.slider.backgroundColor = opaque(source.slider.backgroundColor);
    source.slider.fillColor = opaque(source.slider.fillColor);
    source.slider.handleColor = opaque(source.slider.handleColor);
  }
  if (source.scrollbar) {
    source.scrollbar.interactable = true;
    source.scrollbar.backgroundColor = opaque(source.scrollbar.backgroundColor);
    source.scrollbar.handleColor = opaque(source.scrollbar.handleColor);
  }
  if (source.progress) {
    source.progress.backgroundColor = opaque(source.progress.backgroundColor);
    source.progress.fillColor = opaque(source.progress.fillColor);
    source.progress.textColor = opaque(source.progress.textColor);
  }
  if (source.input) {
    source.input.interactable = true;
    source.input.backgroundColor = opaque(source.input.backgroundColor);
    source.input.textColor = opaque(source.input.textColor);
    source.input.placeholderColor = opaque(source.input.placeholderColor);
  }
  if (source.dropdown) {
    source.dropdown.interactable = true;
    source.dropdown.backgroundColor = opaque(source.dropdown.backgroundColor);
    source.dropdown.itemColor = opaque(source.dropdown.itemColor);
    source.dropdown.selectedColor = opaque(source.dropdown.selectedColor);
    source.dropdown.textColor = opaque(source.dropdown.textColor);
  }
  if (source.list) {
    source.list.interactable = true;
    source.list.backgroundColor = opaque(source.list.backgroundColor);
    source.list.itemColor = opaque(source.list.itemColor);
    source.list.selectedColor = opaque(source.list.selectedColor);
    source.list.textColor = opaque(source.list.textColor);
  }
  if (source.scroll) source.scroll.viewportColor = opaque(source.scroll.viewportColor);
  if (source.tabs) {
    source.tabs.interactable = true;
    source.tabs.backgroundColor = opaque(source.tabs.backgroundColor);
    source.tabs.tabColor = opaque(source.tabs.tabColor);
    source.tabs.selectedColor = opaque(source.tabs.selectedColor);
    source.tabs.textColor = opaque(source.tabs.textColor);
  }
  return source;
}

const buttonTintStates = new WeakMap<HTMLCanvasElement, Map<number, ButtonTintTween>>();

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
  let buttonTints = buttonTintStates.get(ctx.canvas);
  if (!buttonTints) {
    buttonTints = new Map();
    buttonTintStates.set(ctx.canvas, buttonTints);
  }
  const liveButtons = new Set(items.filter((item) => item.button).map((item) => item.entity));
  if (buttonTints.size > liveButtons.size + 32) {
    for (const entity of buttonTints.keys()) {
      if (!liveButtons.has(entity)) buttonTints.delete(entity);
    }
  }
  const now = (globalThis.performance?.now() ?? Date.now()) / 1000;
  let contentLayer: HTMLCanvasElement | null = null;
  let maskLayer: HTMLCanvasElement | null = null;
  let effectLayer: HTMLCanvasElement | null = null;
  const layer = (kind: 'content' | 'mask' | 'effect') => {
    let canvas = kind === 'content'
      ? contentLayer
      : kind === 'mask'
        ? maskLayer
        : effectLayer;
    if (!canvas) {
      canvas = ctx.canvas.ownerDocument.createElement('canvas');
      if (kind === 'content') contentLayer = canvas;
      else if (kind === 'mask') maskLayer = canvas;
      else effectLayer = canvas;
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
  const softGradient = (
    context: CanvasRenderingContext2D,
    rect: Rect,
    softness: number,
    horizontal: boolean,
  ) => {
    const extent = Math.max(0.0001, horizontal ? rect.w : rect.h);
    const gradient = horizontal
      ? context.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y)
      : context.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    const edge = Math.min(0.5, Math.max(0, softness) / extent);
    const centerAlpha = Math.min(1, extent / Math.max(0.0001, softness * 2));
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    if (edge < 0.5) {
      gradient.addColorStop(edge, 'rgba(255,255,255,1)');
      gradient.addColorStop(1 - edge, 'rgba(255,255,255,1)');
    } else {
      gradient.addColorStop(0.5, `rgba(255,255,255,${centerAlpha})`);
    }
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    return gradient;
  };
  const paintSoftMask = (context: CanvasRenderingContext2D, softClip: UiSoftClip) => {
    const [softX, softY] = softClip.softness;
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = softX > 0
      ? softGradient(context, softClip.rect, softX, true)
      : 'rgba(255,255,255,1)';
    context.fillRect(softClip.rect.x, softClip.rect.y, softClip.rect.w, softClip.rect.h);
    if (softY > 0) {
      context.globalCompositeOperation = 'destination-in';
      context.fillStyle = softGradient(context, softClip.rect, softY, false);
      context.fillRect(softClip.rect.x, softClip.rect.y, softClip.rect.w, softClip.rect.h);
    }
    context.restore();
  };
  const drawMaskedItem = (item: UiDrawItem): boolean => {
    if (item.mask?.showGraphic === false && !item.selected && opts?.focusId !== item.entity) {
      return true;
    }
    const softMasks = item.softClips?.filter(
      (softClip) => softClip.softness[0] > 0 || softClip.softness[1] > 0,
    ) ?? [];
    if (!item.maskStack?.length && softMasks.length === 0) return false;
    const masks = (item.maskStack ?? []).map((entity) => itemsByEntity.get(entity));
    if (masks.some((mask) => !mask)) return true;
    const content = layer('content');
    if (!content) return false;
    drawUiItems(
      content,
      [{ ...item, maskStack: [], softClips: [] }],
      hoverId,
      pressId,
      opts,
    );
    for (const softMask of softMasks) {
      const maskContext = layer('mask');
      if (!maskContext || !maskLayer) return true;
      paintSoftMask(maskContext, softMask);
      content.save();
      content.setTransform(1, 0, 0, 1, 0, 0);
      content.globalAlpha = 1;
      content.globalCompositeOperation = 'destination-in';
      content.drawImage(maskLayer, 0, 0);
      content.restore();
    }
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
  const textRunFont = (run: UiTextLayoutRun, font = '') => (
    uiTextFontCss(run.fontSize, run.fontStyle, font)
  );
  const measuredGeometryLineOrigin = (
    runs: readonly UiTextLayoutRun[],
    rectX: number,
    rectWidth: number,
    alignment: 'Left' | 'Center' | 'Right',
    fallback: number,
    font: string,
  ) => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const run of runs) {
      ctx.font = textRunFont(run, font);
      const metrics = ctx.measureText(run.text);
      const left = metrics.actualBoundingBoxLeft;
      const right = metrics.actualBoundingBoxRight;
      if (!Number.isFinite(left) || !Number.isFinite(right)) return fallback;
      minimum = Math.min(minimum, run.x - left);
      maximum = Math.max(maximum, run.x + right);
    }
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) {
      return fallback;
    }
    if (alignment === 'Left') return rectX - minimum;
    if (alignment === 'Right') return rectX + rectWidth - maximum;
    return rectX + (rectWidth - minimum - maximum) * 0.5;
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

    const paintEditorOutline = () => {
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
    };
    const drawEditorOutline = () => withRot(paintEditorOutline);

    const paintAlphaIndependentEffect = (
      effect: UiGraphicEffect,
      offset: [number, number],
    ) => {
      const effectContext = layer('effect');
      if (!effectContext || !effectLayer) return;
      drawUiItems(
        effectContext,
        [alphaIndependentEffectSource(it)],
        null,
        null,
      );
      effectContext.save();
      effectContext.setTransform(1, 0, 0, 1, 0, 0);
      effectContext.globalAlpha = 1;
      effectContext.globalCompositeOperation = 'source-in';
      effectContext.fillStyle = cssColor(effect.color);
      effectContext.fillRect(0, 0, effectLayer.width, effectLayer.height);
      effectContext.restore();

      const cos = Math.cos(rotRad);
      const sin = Math.sin(rotRad);
      const screenOffset = [
        offset[0] * cos - offset[1] * sin,
        offset[0] * sin + offset[1] * cos,
      ];
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(effectLayer, screenOffset[0], screenOffset[1]);
      ctx.restore();
    };

    const paintAlphaIndependentEffects = () => {
      if (it.shadow && !it.shadow.useGraphicAlpha && it.shadow.color[3] > 0) {
        paintAlphaIndependentEffect(it.shadow, it.shadow.distance);
      }
      if (it.outline && !it.outline.useGraphicAlpha && it.outline.color[3] > 0) {
        const dx = Math.abs(it.outline.distance[0]);
        const dy = Math.abs(it.outline.distance[1]);
        for (const offset of [[dx, dy], [dx, -dy], [-dx, dy], [-dx, -dy]] as const) {
          paintAlphaIndependentEffect(it.outline, [...offset]);
        }
      }
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

    const selectableState = it.button
      ? buttonVisualState(
          it.button.interactable,
          hoverId === it.entity,
          pressId === it.entity,
          opts?.focusId === it.entity,
        )
      : null;
    if (it.button && selectableState && it.button.transition.toLowerCase() === 'colortint') {
      const tween = advanceButtonTint(
        buttonTints.get(it.entity),
        selectableState,
        it.button.colorBlock,
        now,
      );
      buttonTints.set(it.entity, tween);
      [r, g, b, a] = multiplyButtonTint([r, g, b, a], tween.current);
    }

    if (uiTransparentMeshCulled(it, a)) {
      drawEditorOutline();
      ctx.restore();
      continue;
    }

    paintAlphaIndependentEffects();

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
        const authoredSprite = it.image?.sprite ?? it.rawImage?.texture ?? 'white';
        const sprite = it.image
          && it.button
          && selectableState
          && it.button.transition.toLowerCase() === 'spriteswap'
          ? buttonTargetSprite(authoredSprite, selectableState, it.button.spriteState)
          : authoredSprite;
        if (it.image) it.image.alphaHitTestSprite = sprite;
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
        ctx.fillStyle = cssColor(it.text.color);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fontKerning = 'normal';
        const glyphMeasurements = new Map<string, UiTextGlyphMeasurement>();
        const pairKerning = new Map<string, number>();
        const measureImportedGlyph = (glyph: UiRichTextGlyph): UiTextGlyphMeasurement => {
          const key = `${glyph.fontSize}\0${glyph.fontStyle}\0${glyph.character}`;
          const cached = glyphMeasurements.get(key);
          if (cached) return cached;
          ctx.font = uiTextFontCss(glyph.fontSize, glyph.fontStyle, it.text!.font);
          const metrics = ctx.measureText(glyph.character);
          const extended = metrics as TextMetrics & {
            fontBoundingBoxAscent?: number;
            fontBoundingBoxDescent?: number;
            emHeightAscent?: number;
            emHeightDescent?: number;
          };
          const left = metrics.actualBoundingBoxLeft;
          const right = metrics.actualBoundingBoxRight;
          const ascent = extended.fontBoundingBoxAscent
            ?? extended.emHeightAscent
            ?? metrics.actualBoundingBoxAscent;
          const descent = extended.fontBoundingBoxDescent
            ?? extended.emHeightDescent
            ?? metrics.actualBoundingBoxDescent;
          const measured = {
            advance: metrics.width,
            metricWidth: Number.isFinite(right) ? Math.max(metrics.width, right) : metrics.width,
            lineHeight: Number.isFinite(ascent) && Number.isFinite(descent)
              ? ascent + descent
              : glyph.fontSize * (8 / 7),
            geometry: Number.isFinite(left) && Number.isFinite(right)
              ? [-left, right] as [number, number]
              : null,
          };
          glyphMeasurements.set(key, measured);
          return measured;
        };
        const measureImportedPairKerning = (left: UiRichTextGlyph, right: UiRichTextGlyph) => {
          const key = `${left.fontSize}\0${left.fontStyle}\0${left.character}\0${right.character}`;
          const cached = pairKerning.get(key);
          if (cached != null) return cached;
          ctx.font = uiTextFontCss(left.fontSize, left.fontStyle, it.text!.font);
          ctx.fontKerning = 'none';
          const unkerned = ctx.measureText(left.character + right.character).width;
          ctx.fontKerning = 'normal';
          const measured = ctx.measureText(left.character + right.character).width - unkerned;
          pairKerning.set(key, measured);
          return measured;
        };
        const layout = layoutUiText(it.text.text, {
          width: w,
          height: h,
          fontSize: it.text.fontSize,
          fontStyle: it.text.fontStyle,
          alignByGeometry: it.text.alignByGeometry,
          supportRichText: it.text.supportRichText,
          bestFit: it.text.bestFit,
          minSize: it.text.minSize,
          maxSize: it.text.maxSize,
          fontScale: it.text.fontScale,
          lineSpacing: it.text.lineSpacing,
          horizontalOverflow: it.text.horizontalOverflow,
          verticalOverflow: it.text.verticalOverflow,
          alignment: it.text.alignment,
          verticalAlign: it.text.verticalAlign,
          measureGlyph: it.text.font ? measureImportedGlyph : undefined,
          measurePairKerning: it.text.font ? measureImportedPairKerning : undefined,
        });
        for (const line of layout.lines) {
          const fallbackOrigin = x + line.x;
          const lineOrigin = it.text.alignByGeometry
            ? measuredGeometryLineOrigin(
                line.runs,
                x,
                w,
                it.text.alignment,
                fallbackOrigin,
                it.text.font,
              )
            : fallbackOrigin;
          for (const run of line.runs) {
            const runColor: [number, number, number, number] = run.color
              ? [run.color[0], run.color[1], run.color[2], run.color[3] * it.text.color[3]]
              : it.text.color;
            ctx.font = textRunFont(run, it.text.font);
            ctx.fillStyle = cssColor(runColor);
            fillReadableText(
              run.text,
              lineOrigin + run.x,
              y + line.y + run.y,
              undefined,
              runColor,
              run.fontSize,
              { color: it.text.outlineColor, width: it.text.outlineWidth },
            );
          }
        }
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

      paintEditorOutline();
    });
    ctx.restore();
  }
  return {
    elements: items.filter((item) => item.role === 'graphic').length,
    primitives: items.length,
    batches: batches.length,
  };
}
