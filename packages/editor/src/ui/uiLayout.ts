/** Build screen-space / Scene-world rects for UI trees (Canvas Overlay). */

import {
  canvasReferenceSize,
  canvasScaleFactor,
  pointInRect,
  readRectTransform,
  solveRectTransform,
  type Rect,
} from './rectLayout';
import { rectLocalAxes, rectPivot } from '../rectGizmo';
import { drawSpriteInRect } from '../spriteDraw';
import { resolveSpriteId } from '../spriteLibrary';
import { project, type Camera, type Vec3 } from '../math3d';

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

export type UiDrawItem = {
  entity: number;
  rect: Rect;
  depth: number;
  role: 'canvas' | 'graphic';
  rotation: number;
  pivot: [number, number];
  image?: {
    color: [number, number, number, number];
    sprite: string;
    raycastTarget: boolean;
  };
  button?: {
    interactable: boolean;
    transition: string;
    onClick: unknown;
  };
  selected: boolean;
  /** Projected pivot (Scene 3D). */
  pivotScreen?: { x: number; y: number };
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

/**
 * Layout Overlay canvases into viewRect (Game letterbox / pixel root).
 */
export function layoutUiOverlay(
  entities: UiEnt[],
  viewRect: Rect,
  selectedIds: Set<number>,
): UiDrawItem[] {
  const canvases = entities
    .filter((e) => e.components.Canvas && e.active !== false)
    .sort((a, b) => {
      const ao = Number(
        (a.components.Canvas as { sorting_order?: number; sortingOrder?: number })?.sorting_order
          ?? (a.components.Canvas as { sortingOrder?: number })?.sortingOrder
          ?? 0,
      );
      const bo = Number(
        (b.components.Canvas as { sorting_order?: number; sortingOrder?: number })?.sorting_order
          ?? (b.components.Canvas as { sortingOrder?: number })?.sortingOrder
          ?? 0,
      );
      return ao - bo;
    });

  const out: UiDrawItem[] = [];
  let depthBase = 0;

  for (const canvas of canvases) {
    const mode =
      (canvas.components.Canvas as { render_mode?: string; renderMode?: string })?.render_mode
      ?? (canvas.components.Canvas as { renderMode?: string })?.renderMode
      ?? 'ScreenSpaceOverlay';
    if (mode !== 'ScreenSpaceOverlay' && mode !== 'ScreenSpaceCamera') continue;

    const scaler = canvas.components.CanvasScaler;
    const scale = canvasScaleFactor(scaler, viewRect.w, viewRect.h);
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

    const walk = (ent: UiEnt, parentRect: Rect, depth: number, isCanvasRoot: boolean) => {
      const hasRt = !!ent.components.RectTransform;
      const rect = hasRt
        ? solveRectTransform(parentRect, scaleRt(ent.components.RectTransform))
        : parentRect;

      const img = ent.components.Image as Record<string, unknown> | undefined;
      const btn = ent.components.Button as Record<string, unknown> | undefined;
      const isCanvas = isCanvasRoot || !!ent.components.Canvas;
      const rt = hasRt ? readRectTransform(ent.components.RectTransform) : null;
      const rotation = rt?.local_rotation ?? 0;
      const pivot: [number, number] = rt ? ([...rt.pivot] as [number, number]) : [0.5, 0.5];

      if (isCanvas) {
        out.push({
          entity: ent.entity,
          rect,
          depth: depthBase + depth,
          role: 'canvas',
          rotation: 0,
          pivot: [0.5, 0.5],
          selected: selectedIds.has(ent.entity),
        });
      } else if (img || btn) {
        out.push({
          entity: ent.entity,
          rect,
          depth: depthBase + depth,
          role: 'graphic',
          rotation,
          pivot,
          image: img
            ? {
                color: color4(img.color, [1, 1, 1, 1]),
                sprite: resolveSpriteId(String(img.sprite ?? 'white')),
                raycastTarget: img.raycast_target !== false && img.raycastTarget !== false,
              }
            : undefined,
          button: btn
            ? {
                interactable: btn.interactable !== false,
                transition: String(btn.transition ?? 'ColorTint'),
                onClick: btn.on_click ?? btn.onClick ?? null,
              }
            : undefined,
          selected: selectedIds.has(ent.entity),
        });
      } else if (selectedIds.has(ent.entity) && hasRt) {
        out.push({
          entity: ent.entity,
          rect,
          depth: depthBase + depth,
          role: 'graphic',
          rotation,
          pivot,
          selected: true,
        });
      }

      for (const ch of childrenOf(entities, ent.entity)) {
        walk(ch, rect, depth + 1, false);
      }
    };

    const canvasRt = canvas.components.RectTransform
      ? solveRectTransform(root, scaleRt(canvas.components.RectTransform))
      : root;
    walk(canvas, canvasRt, 0, true);
    depthBase += 1000;
  }

  out.sort((a, b) => a.depth - b.depth);
  return out;
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
  const canvases = entities.filter((e) => e.components.Canvas && e.active !== false);
  if (!canvases.length) return { items: [], layoutScale: 1 };

  const cw = Math.max(1, canvasSize.w);
  const ch = Math.max(1, canvasSize.h);
  const pixelRoot: Rect = { x: 0, y: 0, w: cw, h: ch };

  const out: UiDrawItem[] = [];
  let layoutScale = 1;
  let depthBase = 0;

  for (const canvas of canvases) {
    const mode =
      (canvas.components.Canvas as { render_mode?: string; renderMode?: string })?.render_mode
      ?? (canvas.components.Canvas as { renderMode?: string })?.renderMode
      ?? 'ScreenSpaceOverlay';
    if (mode !== 'ScreenSpaceOverlay' && mode !== 'ScreenSpaceCamera') continue;

    const laid = layoutUiOverlay(entities, pixelRoot, selectedIds).filter((it) =>
      inCanvasTree(entities, it.entity, canvas.entity),
    );

    const c0 = project(uiPixelToWorld(cw * 0.5, ch * 0.5, cw, ch), cam, viewport);
    const c1 = project(uiPixelToWorld(cw * 0.5 + 1, ch * 0.5, cw, ch), cam, viewport);
    if (c0 && c1) {
      const s = Math.hypot(c1.x - c0.x, c1.y - c0.y);
      if (s > 1e-4) layoutScale = s;
    }

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

      out.push({
        ...it,
        rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        depth: depthBase + it.depth,
        pivotScreen: pivS ? { x: pivS.x, y: pivS.y } : undefined,
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

export function hitTestUi(items: UiDrawItem[], x: number, y: number): UiDrawItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.role === 'canvas') continue;
    if (!pointInUiItem(x, y, it)) continue;
    if (it.button?.interactable) return it;
    if (it.image?.raycastTarget) return it;
  }
  return null;
}

export function hitTestUiSelect(items: UiDrawItem[], x: number, y: number): UiDrawItem | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.role !== 'graphic') continue;
    if (!pointInUiItem(x, y, it)) continue;
    return it;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.role !== 'canvas') continue;
    if (pointInRect(x, y, it.rect)) return it;
  }
  return null;
}

export function drawUiItems(
  ctx: CanvasRenderingContext2D,
  items: UiDrawItem[],
  hoverId: number | null,
  pressId: number | null,
  opts?: { sceneLabel?: boolean },
) {
  const showLabel = !!opts?.sceneLabel;

  for (const it of items) {
    const { x, y, w, h } = it.rect;
    if (w < 0.5 || h < 0.5) continue;

    if (it.role === 'canvas') {
      ctx.setLineDash(showLabel ? [6, 4] : []);
      ctx.strokeStyle = it.selected ? 'rgba(100, 200, 255, 0.95)' : 'rgba(140, 160, 200, 0.55)';
      ctx.lineWidth = it.selected ? 2 : 1.25;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.setLineDash([]);
      if (showLabel) {
        ctx.fillStyle = 'rgba(180, 200, 230, 0.9)';
        ctx.font = '11px sans-serif';
        ctx.fillText('Canvas', x + 8, y + 16);
      }
      continue;
    }

    let [r, g, b, a] = it.image?.color ?? [0.85, 0.85, 0.9, 0.92];
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

    if (!it.image && !it.button) {
      if (it.selected) {
        withRot(() => {
          ctx.setLineDash([4, 3]);
          ctx.strokeStyle = 'rgba(100, 180, 255, 0.95)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        });
      }
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
      const sprite = it.image?.sprite ?? 'white';
      const tint: [number, number, number, number] = [r, g, b, a];
      const drawn =
        sprite !== 'white' && drawSpriteInRect(ctx, sprite, x, y, w, h, tint);

      if (!drawn) {
        ctx.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a})`;
        ctx.fillRect(x, y, w, h);
      }

      if (it.button) {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }

      if (it.selected) {
        ctx.strokeStyle = 'rgba(100, 180, 255, 0.95)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
      }
    });
  }
}
