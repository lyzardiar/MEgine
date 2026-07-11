/** Build screen-space rects for UI trees (Canvas Overlay). */

import {
  canvasScaleFactor,
  pointInRect,
  readRectTransform,
  solveRectTransform,
  type Rect,
} from './rectLayout';
import { rectLocalAxes, rectPivot } from '../rectGizmo';
import { drawSpriteInRect } from '../spriteDraw';
import { resolveSpriteId } from '../spriteLibrary';

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
  /** Canvas root = screen frame; graphic = Image/Button content */
  role: 'canvas' | 'graphic';
  /** Z rotation degrees (Unity); gizmo / draw use this */
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
    /** Raw Button.on_click (UnityEvent object or legacy method string). */
    onClick: unknown;
  };
  selected: boolean;
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

/**
 * Layout all Overlay canvases into viewRect (Game / Scene letterbox).
 * Returns painter's algorithm list (back → front) for draw; reverse for hit-test.
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
    if (mode !== 'ScreenSpaceOverlay' && mode !== 'ScreenSpaceCamera') {
      continue;
    }

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
      const pivot: [number, number] = rt ? [...rt.pivot] as [number, number] : [0.5, 0.5];

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
        // Empty RectTransform node — selection outline only
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

/** Point in rotated UI rect (local XY / Z-rot). */
function pointInUiItem(px: number, py: number, it: UiDrawItem): boolean {
  if (it.role === 'canvas' || Math.abs(it.rotation) < 1e-4) {
    return pointInRect(px, py, it.rect);
  }
  const { w, h } = it.rect;
  const piv = rectPivot(it.rect, it.pivot);
  const axes = rectLocalAxes(it.rotation);
  const dx = px - piv.x;
  const dy = py - piv.y;
  const u = dx * axes.x.dx + dy * axes.x.dy;
  const v = dx * axes.y.dx + dy * axes.y.dy;
  const [pxN, pyN] = it.pivot;
  return u >= -w * pxN && u <= w * (1 - pxN) && v >= -h * pyN && v <= h * (1 - pyN);
}

/** Game view: interactable Button / Image raycast. */
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

/** Scene view: pick any UI graphic (or canvas frame) under cursor. */
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
  opts?: { scenePreview?: boolean },
) {
  const scene = !!opts?.scenePreview;

  for (const it of items) {
    const { x, y, w, h } = it.rect;
    if (w < 0.5 || h < 0.5) continue;

    if (it.role === 'canvas') {
      // Screen frame for Overlay Canvas (Unity-like)
      ctx.setLineDash(scene ? [6, 4] : []);
      ctx.strokeStyle = it.selected ? 'rgba(100, 200, 255, 0.95)' : 'rgba(140, 160, 200, 0.55)';
      ctx.lineWidth = it.selected ? 2 : 1.25;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.setLineDash([]);
      if (scene) {
        ctx.fillStyle = 'rgba(30, 40, 70, 0.12)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(180, 200, 230, 0.85)';
        ctx.font = '11px sans-serif';
        ctx.fillText('Canvas (Screen Space Overlay)', x + 8, y + 16);
      }
      continue;
    }

    let [r, g, b, a] = it.image?.color ?? [0.85, 0.85, 0.9, scene ? 0.55 : 0.92];
    const piv = rectPivot(it.rect, it.pivot);
    // Canvas 2D positive rotate = CW; Unity Z+ = CCW → negate
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

    if (scene) a = Math.min(a, 0.7);

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

/** Dim outside letterbox + draw UI (Scene view Overlay preview). */
export function drawSceneUiOverlay(
  ctx: CanvasRenderingContext2D,
  panel: Rect,
  screen: Rect,
  items: UiDrawItem[],
) {
  // Dim area outside the game screen frame
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  // top
  if (screen.y > panel.y) {
    ctx.fillRect(panel.x, panel.y, panel.w, screen.y - panel.y);
  }
  // bottom
  const bottomY = screen.y + screen.h;
  if (bottomY < panel.y + panel.h) {
    ctx.fillRect(panel.x, bottomY, panel.w, panel.y + panel.h - bottomY);
  }
  // left
  if (screen.x > panel.x) {
    ctx.fillRect(panel.x, screen.y, screen.x - panel.x, screen.h);
  }
  // right
  const rightX = screen.x + screen.w;
  if (rightX < panel.x + panel.w) {
    ctx.fillRect(rightX, screen.y, panel.x + panel.w - rightX, screen.h);
  }

  drawUiItems(ctx, items, null, null, { scenePreview: true });
}
