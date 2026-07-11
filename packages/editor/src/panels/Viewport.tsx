import { useEffect, useRef, useState } from 'react';
import type { GameAspect, GameOrientation, GizmoMode, SceneCamera, TransformData } from '../store';
import {
  type Camera,
  type Vec3,
  add,
  drawGroundGrid,
  drawSolidCube,
  drawWorldSprite,
  lookBasis,
  orbitEye,
  project,
  scale as vscale,
} from '../math3d';
import {
  drawCameraGizmo,
  drawDirectionalLightGizmo,
  transformBasis,
  type Camera3DData,
} from '../editorGizmos';
import {
  angleAroundWorldAxis,
  cursorForGizmoPart,
  drawTransformGizmo,
  gizmoPartEquals,
  hitTestTransformGizmo,
  worldDeltaAlongAxis,
  worldDeltaOnPlane,
  worldDeltaViewPlane,
  type GizmoHit,
  type GizmoPart,
} from '../transformGizmo';
import {
  cursorForRectGizmo,
  drawRectGizmo,
  hitTestRectGizmo,
  projectScreenDelta,
  rectLocalAxes,
  rectPivot,
  type RectGizmoHit,
} from '../rectGizmo';
import {
  drawUiItems,
  hitTestUi,
  hitTestUiSelect,
  layoutUiOverlay,
  layoutUiScene3D,
  UI_SCENE_PPU,
  type UiDrawItem,
} from '../ui/uiLayout';
import { canvasScaleFactor, readRectTransform } from '../ui/rectLayout';

const SCENE_2D_KEY = 'mengine.scene.2d';

function loadScene2D(): boolean {
  try {
    return localStorage.getItem(SCENE_2D_KEY) === '1';
  } catch {
    return false;
  }
}

type Ent = {
  entity: number;
  name?: string | null;
  active?: boolean;
  parent?: number | null;
  components: Record<string, unknown>;
};

type Hit =
  | { kind: 'object'; id: number; x: number; y: number; r: number }
  | { kind: 'gizmo'; part: GizmoPart };

const ASPECTS: Record<Exclude<GameAspect, 'free'>, number> = {
  '16:9': 16 / 9,
  '16:10': 16 / 10,
  '4:3': 4 / 3,
  '1:1': 1,
};

function letterbox(
  panelW: number,
  panelH: number,
  aspect: GameAspect,
  orientation: GameOrientation,
) {
  // Portrait with Free → treat as 9:16 so the toggle always has a visible effect
  const effective: GameAspect =
    aspect === 'free' && orientation === 'portrait' ? '16:9' : aspect;

  if (effective === 'free') return { x: 0, y: 0, w: panelW, h: panelH };

  let target = ASPECTS[effective];
  if (orientation === 'portrait' && effective !== '1:1') {
    target = 1 / target;
  }

  const panel = panelW / Math.max(1, panelH);
  if (panel > target) {
    const h = panelH;
    const w = h * target;
    return { x: (panelW - w) / 2, y: 0, w, h };
  }
  const w = panelW;
  const h = w / target;
  return { x: 0, y: (panelH - h) / 2, w, h };
}

function primaryGameCamera(entities: Ent[], isActive?: (id: number) => boolean): Camera | null {
  for (const e of entities) {
    if (isActive && !isActive(e.entity)) continue;
    const cam = e.components.Camera3D as Camera3DData | undefined;
    const t = e.components.Transform as TransformData | undefined;
    if (cam?.primary && t) {
      const { forward } = transformBasis(t.rotation as [number, number, number, number]);
      const eye = t.position as Vec3;
      return {
        eye,
        target: add(eye, forward),
        fovYDeg: cam.fov_y_degrees ?? 60,
      };
    }
  }
  return null;
}

export function Viewport(props: {
  tab: 'scene' | 'game';
  clearColor: [number, number, number, number];
  entities: Ent[];
  selected: number | null;
  selectedIds?: number[];
  activeInHierarchy?: (id: number) => boolean;
  angle: number;
  gizmo: GizmoMode;
  playing: boolean;
  sceneCamera: SceneCamera;
  gameAspect: GameAspect;
  gameOrientation: GameOrientation;
  onPick: (id: number) => void;
  onSceneCamera: (partial: Partial<SceneCamera>) => void;
  onBeginGesture: () => void;
  onEndGesture: () => void;
  onTranslate: (entity: number, delta: Vec3) => void;
  onGizmoAxis: (entity: number, axis: 'x' | 'y' | 'z', amount: number) => void;
  onRotateWorld?: (entity: number, axis: Vec3, degrees: number) => void;
  onRectTranslate?: (entity: number, dx: number, dy: number) => void;
  onRectRotate?: (entity: number, degrees: number) => void;
  onRectScale?: (entity: number, axis: 'x' | 'y' | 'both', amount: number) => void;
  onRectResize?: (
    entity: number,
    handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw',
    dLocalX: number,
    dLocalY: number,
  ) => void;
  onAspect: (a: GameAspect) => void;
  onOrientation: (o: GameOrientation) => void;
  onFrame: () => void;
  onUiClick?: (entity: number, onClick: unknown) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<Hit[]>([]);
  const gizmoHitsRef = useRef<GizmoHit[]>([]);
  const rectGizmoHitsRef = useRef<RectGizmoHit[]>([]);
  const uiItemsRef = useRef<UiDrawItem[]>([]);
  const uiLayoutScaleRef = useRef(1);
  const usingRectGizmoRef = useRef(false);
  const uiHoverRef = useRef<number | null>(null);
  const uiPressRef = useRef<number | null>(null);
  const hoverGizmoRef = useRef<GizmoPart | null>(null);
  const activeGizmoRef = useRef<GizmoPart | null>(null);
  const lastVpRef = useRef({ x: 0, y: 0, w: 1, h: 1 });
  const propsRef = useRef(props);
  propsRef.current = props;

  // Live camera during drag (bypasses React batching for instant feedback)
  const liveCam = useRef<SceneCamera>({
    yaw: props.sceneCamera.yaw,
    pitch: props.sceneCamera.pitch,
    distance: props.sceneCamera.distance,
    pivot: [...props.sceneCamera.pivot] as Vec3,
  });
  const draggingRef = useRef(false);

  // Only pull camera from props when NOT dragging (store is source of truth otherwise)
  useEffect(() => {
    if (draggingRef.current) return;
    liveCam.current = {
      yaw: props.sceneCamera.yaw,
      pitch: props.sceneCamera.pitch,
      distance: props.sceneCamera.distance,
      pivot: [...props.sceneCamera.pivot] as Vec3,
    };
  }, [
    props.sceneCamera.yaw,
    props.sceneCamera.pitch,
    props.sceneCamera.distance,
    props.sceneCamera.pivot[0],
    props.sceneCamera.pivot[1],
    props.sceneCamera.pivot[2],
  ]);

  const dragRef = useRef<
    | null
    | { type: 'orbit'; lx: number; ly: number }
    | { type: 'pan'; lx: number; ly: number }
    | {
        type: 'gizmo';
        part: GizmoPart;
        lx: number;
        ly: number;
        entity: number;
        origin: Vec3;
        /** frozen world axis for single-axis rotate (same as translate arrow) */
        axisWorld?: Vec3;
        lastAng?: number;
        gizmoScreen?: { x: number; y: number };
      }
    | {
        type: 'rectGizmo';
        part: GizmoPart;
        lx: number;
        ly: number;
        entity: number;
        pivot: { x: number; y: number };
        rotDeg: number;
        layoutScale: number;
        lastAng?: number;
      }
  >(null);

  const [tick, setTick] = useState(0);
  const [scene2D, setScene2D] = useState(loadScene2D);
  const scene2DRef = useRef(scene2D);
  scene2DRef.current = scene2D;
  /** Saved orbit angles when entering 2D (restore on exit). */
  const savedOrbitRef = useRef<{ yaw: number; pitch: number } | null>(null);

  // Continuous render loop
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      paint();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force paint when props change
  useEffect(() => {
    setTick((t) => t + 1);
  }, [props.tab, props.entities, props.selected, props.selectedIds, props.gizmo, props.gameAspect, props.gameOrientation, props.angle, props.playing, props.activeInHierarchy]);

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const p = propsRef.current;
    const sc = liveCam.current;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const pw = Math.max(1, Math.floor(rect.width));
    const ph = Math.max(1, Math.floor(rect.height));
    if (canvas.width !== Math.floor(pw * dpr) || canvas.height !== Math.floor(ph * dpr)) {
      canvas.width = Math.floor(pw * dpr);
      canvas.height = Math.floor(ph * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const isGame = p.tab === 'game';
    hitsRef.current = [];

    // Scene 2D：锁定正视 Canvas（yaw/pitch = 0，从 +Z 看 XY 平面）
    if (!isGame && scene2DRef.current) {
      sc.yaw = 0;
      sc.pitch = 0;
    }

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, pw, ph);

    const vp = isGame
      ? letterbox(pw, ph, p.gameAspect, p.gameOrientation)
      : { x: 0, y: 0, w: pw, h: ph };
    lastVpRef.current = vp;

    if (isGame && (vp.w < pw - 1 || vp.h < ph - 1)) {
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, pw, ph);
    }

    const cam: Camera = isGame
      ? primaryGameCamera(p.entities, p.activeInHierarchy) ?? { eye: [0, 1.5, 4], target: [0, 0.5, 0], fovYDeg: 60 }
      : {
          eye: orbitEye(sc.pivot, sc.yaw, sc.pitch, sc.distance),
          target: sc.pivot,
          fovYDeg: 60,
        };

    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.x, vp.y, vp.w, vp.h);
    ctx.clip();

    if (isGame) {
      const [r, g, b] = p.clearColor;
      ctx.fillStyle = `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    } else {
      const sky = ctx.createLinearGradient(vp.x, vp.y, vp.x, vp.y + vp.h);
      sky.addColorStop(0, '#6a8aaa');
      sky.addColorStop(0.5, '#3d4858');
      sky.addColorStop(1, '#2a3038');
      ctx.fillStyle = sky;
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
      drawGroundGrid(ctx, cam, vp, sc.pivot, sc.distance);
    }

    const isActive = (id: number) =>
      p.activeInHierarchy ? p.activeInHierarchy(id) : true;
    // Game 视图不显示编辑器选中态（只能 Hierarchy / Scene 点选）
    const selSet = isGame
      ? new Set<number>()
      : new Set(p.selectedIds?.length ? p.selectedIds : p.selected != null ? [p.selected] : []);

    const drawn = p.entities
      .map((e) => {
        if (!isActive(e.entity)) return null;
        const t = e.components.Transform as TransformData | undefined;
        if (!t) return null;
        const pr = project(t.position as Vec3, cam, vp);
        // Keep cameras/lights even if origin is barely off-screen — frustum/rays may still show
        const camComp = e.components.Camera3D;
        const isLight =
          !!e.components.DirectionalLight ||
          (e.name ?? '').toLowerCase().includes('light');
        if (!pr && !camComp && !isLight) return null;
        return { e, t, pr };
      })
      .filter(Boolean) as Array<{
      e: Ent;
      t: TransformData;
      pr: { x: number; y: number; depth: number } | null;
    }>;
    drawn.sort((a, b) => (b.pr?.depth ?? 0) - (a.pr?.depth ?? 0));

    for (const { e, t, pr } of drawn) {
      const mesh = e.components.MeshRenderer;
      const camComp = e.components.Camera3D as Camera3DData | undefined;
      const dirLight = e.components.DirectionalLight;
      const isLight =
        !!dirLight || (e.name ?? '').toLowerCase().includes('light');
      const selected = selSet.has(e.entity);

      if (isGame && (camComp || (isLight && !mesh))) continue;

      if (camComp && !isGame) {
        try {
          const hit = drawCameraGizmo(ctx, cam, vp, t, camComp, selected);
          if (hit) hitsRef.current.push({ kind: 'object', id: e.entity, x: hit.x, y: hit.y, r: hit.r });
        } catch (err) {
          console.error('drawCameraGizmo', err);
        }
        continue;
      }

      if (isLight && !mesh && !isGame) {
        try {
          const hit = drawDirectionalLightGizmo(ctx, cam, vp, t, selected);
          if (hit) hitsRef.current.push({ kind: 'object', id: e.entity, x: hit.x, y: hit.y, r: hit.r });
        } catch (err) {
          console.error('drawDirectionalLightGizmo', err);
        }
        continue;
      }

      if (!mesh) {
        const spr = e.components.SpriteRenderer as
          | {
              color?: number[];
              size?: number[];
              sorting_order?: number;
            }
          | undefined;
        if (spr && pr) {
          const sz = spr.size ?? [1, 1];
          const half: [number, number] = [
            0.5 * (Number(sz[0]) || 1) * t.scale[0],
            0.5 * (Number(sz[1]) || 1) * t.scale[1],
          ];
          const col = (spr.color ?? [1, 1, 1, 1]) as [number, number, number, number];
          const rot = t.rotation as [number, number, number, number] | undefined;
          const hit = drawWorldSprite(
            ctx,
            cam,
            vp,
            t.position as Vec3,
            half,
            col,
            selected,
            rot,
          );
          if (hit) hitsRef.current.push({ kind: 'object', id: e.entity, x: hit.x, y: hit.y, r: hit.r });
          continue;
        }
        if (isGame || !pr) continue;
        ctx.fillStyle = selected ? '#fff' : '#888';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2);
        ctx.fill();
        hitsRef.current.push({ kind: 'object', id: e.entity, x: pr.x, y: pr.y, r: 10 });
        continue;
      }

      if (!pr) continue;
      const half: Vec3 = [0.5 * t.scale[0], 0.5 * t.scale[1], 0.5 * t.scale[2]];
      const rot = t.rotation as [number, number, number, number] | undefined;
      const hit = drawSolidCube(ctx, cam, vp, t.position as Vec3, half, selected, rot);
      if (hit) hitsRef.current.push({ kind: 'object', id: e.entity, x: hit.x, y: hit.y, r: hit.r });
    }

    // Transform gizmo — 3D Transform OR RectTransform (UI)
    usingRectGizmoRef.current = false;
    rectGizmoHitsRef.current = [];
    if (!isGame && !p.playing && p.selected != null) {
      const sel = p.entities.find((e) => e.entity === p.selected);
      const t = sel?.components.Transform as TransformData | undefined;
      const hasRect = !!sel?.components.RectTransform;
      // UI 优先用 2D Rect 轴；纯 3D 才用世界坐标轴
      if (hasRect) {
        usingRectGizmoRef.current = true;
        gizmoHitsRef.current = [];
      } else if (t) {
        const gh = drawTransformGizmo(
          ctx,
          cam,
          vp,
          t.position as Vec3,
          t.rotation as [number, number, number, number],
          p.gizmo,
          hoverGizmoRef.current,
          activeGizmoRef.current,
        );
        gizmoHitsRef.current = gh;
        for (const h of gh) {
          hitsRef.current.unshift({
            kind: 'gizmo',
            part:
              h.kind === 'axis'
                ? { kind: 'axis', axis: h.axis }
                : h.kind === 'plane'
                  ? { kind: 'plane', plane: h.plane }
                  : { kind: 'center' },
          });
        }
      } else {
        gizmoHitsRef.current = [];
      }
    } else {
      gizmoHitsRef.current = [];
    }

    // UI Canvas — Game: screen overlay; Scene: world XY plane (zoomable)
    {
      if (isGame) {
        const uiRoot = vp;
        const uiItems = layoutUiOverlay(p.entities, uiRoot, selSet);
        uiItemsRef.current = uiItems;

        let layoutScale = 1;
        if (p.selected != null) {
          let walk: Ent | undefined = p.entities.find((e) => e.entity === p.selected);
          while (walk) {
            if (walk.components.Canvas) {
              layoutScale = canvasScaleFactor(
                walk.components.CanvasScaler,
                uiRoot.w,
                uiRoot.h,
              );
              break;
            }
            const pid = walk.parent ?? null;
            walk = pid != null ? p.entities.find((e) => e.entity === pid) : undefined;
          }
        }
        uiLayoutScaleRef.current = layoutScale || 1;
        drawUiItems(ctx, uiItems, uiHoverRef.current, uiPressRef.current);
      } else {
        // 与 Game 同一 letterbox 尺寸，竖屏时 Scene Canvas 也是竖图
        const gameBox = letterbox(pw, ph, p.gameAspect, p.gameOrientation);
        const { items: uiItems, layoutScale } = layoutUiScene3D(
          p.entities,
          cam,
          vp,
          selSet,
          { w: gameBox.w, h: gameBox.h },
        );
        uiItemsRef.current = uiItems;
        uiLayoutScaleRef.current = layoutScale || 1;

        if (uiItems.length) {
          drawUiItems(ctx, uiItems, null, null, { sceneLabel: true });

          if (usingRectGizmoRef.current && p.selected != null) {
            const item = uiItems.find((it) => it.entity === p.selected);
            const sel = p.entities.find((e) => e.entity === p.selected);
            if (item && sel?.components.RectTransform) {
              const rt = readRectTransform(sel.components.RectTransform);
              const pivot = item.pivotScreen ?? rectPivot(item.rect, rt.pivot);
              const rh = drawRectGizmo(
                ctx,
                pivot,
                rt.local_rotation,
                p.gizmo,
                hoverGizmoRef.current,
                activeGizmoRef.current,
                item.rect,
                rt.pivot,
              );
              rectGizmoHitsRef.current = rh;
            }
          }
        }
      }
    }

    if (isGame) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(vp.x + 1, vp.y + 1, vp.w - 2, vp.h - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(vp.x + 8, vp.y + 8, 170, 20);
      ctx.fillStyle = '#ddd';
      ctx.font = '11px sans-serif';
      const orient =
        p.gameOrientation === 'portrait' ? ' 竖屏' : p.gameAspect === 'free' ? '' : ' 横屏';
      const ratioLabel =
        p.gameAspect === 'free' && p.gameOrientation === 'portrait'
          ? '9:16'
          : p.gameAspect === 'free'
            ? 'Free'
            : p.gameOrientation === 'portrait' && p.gameAspect !== '1:1'
              ? p.gameAspect.split(':').reverse().join(':')
              : p.gameAspect;
      const label = `${ratioLabel}${orient}  ${vp.w | 0}×${vp.h | 0}`;
      ctx.fillText(`Display ${label}`, vp.x + 14, vp.y + 22);
    }

    ctx.restore();
    void tick;
  };

  const localPos = (ev: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };

  const hitTest = (x: number, y: number): Hit | null => {
    if (usingRectGizmoRef.current) {
      const rp = hitTestRectGizmo(rectGizmoHitsRef.current, x, y);
      if (rp) return { kind: 'gizmo', part: rp };
    } else {
      const gizmoPart = hitTestTransformGizmo(gizmoHitsRef.current, x, y);
      if (gizmoPart) return { kind: 'gizmo', part: gizmoPart };
    }

    // Scene: UI graphics over 3D
    if (propsRef.current.tab === 'scene') {
      const ui = hitTestUiSelect(uiItemsRef.current, x, y);
      if (ui) return { kind: 'object', id: ui.entity, x, y, r: 8 };
    }

    let best: { h: Hit; d: number } | null = null;
    for (const h of hitsRef.current) {
      if (h.kind !== 'object') continue;
      const d = Math.hypot(x - h.x, y - h.y);
      if (d < h.r && (!best || d < best.d)) best = { h, d };
    }
    return best?.h ?? null;
  };

  const syncCamToStore = () => {
    propsRef.current.onSceneCamera({
      yaw: liveCam.current.yaw,
      pitch: liveCam.current.pitch,
      distance: liveCam.current.distance,
      pivot: [...liveCam.current.pivot] as Vec3,
    });
  };

  const onPointerDown = (ev: React.MouseEvent) => {
    const { x, y } = localPos(ev);
    // Game 视图：只做运行时交互（如 Button），不可点选编辑物体
    if (propsRef.current.tab === 'game') {
      if (ev.button === 0) {
        const ui = hitTestUi(uiItemsRef.current, x, y);
        if (ui?.button?.interactable) {
          uiPressRef.current = ui.entity;
        }
      }
      return;
    }
    if (propsRef.current.tab === 'scene') {
      // 2D：右键改为平移，禁止环绕旋转
      if (ev.button === 2) {
        draggingRef.current = true;
        dragRef.current = {
          type: scene2DRef.current ? 'pan' : 'orbit',
          lx: ev.clientX,
          ly: ev.clientY,
        };
        ev.preventDefault();
        return;
      }
      if (ev.button === 1 || (ev.button === 0 && ev.altKey)) {
        draggingRef.current = true;
        dragRef.current = { type: 'pan', lx: ev.clientX, ly: ev.clientY };
        ev.preventDefault();
        return;
      }
      if (ev.button === 0) {
        const hit = hitTest(x, y);
        if (hit?.kind === 'gizmo' && propsRef.current.selected != null) {
          const ent = propsRef.current.entities.find(
            (e) => e.entity === propsRef.current.selected,
          );

          // RectTransform 2D gizmo
          if (usingRectGizmoRef.current && ent?.components.RectTransform) {
            const item = uiItemsRef.current.find((it) => it.entity === ent.entity);
            const rt = readRectTransform(ent.components.RectTransform);
            const pivot = item
              ? (item.pivotScreen ?? rectPivot(item.rect, rt.pivot))
              : { x, y };
            let lastAng: number | undefined;
            if (propsRef.current.gizmo === 'rotate') {
              lastAng = Math.atan2(y - pivot.y, x - pivot.x);
            }
            draggingRef.current = true;
            activeGizmoRef.current = hit.part;
            propsRef.current.onBeginGesture();
            dragRef.current = {
              type: 'rectGizmo',
              part: hit.part,
              lx: ev.clientX,
              ly: ev.clientY,
              entity: propsRef.current.selected,
              pivot,
              rotDeg: rt.local_rotation,
              layoutScale: uiLayoutScaleRef.current || 1,
              lastAng,
            };
            return;
          }

          const tr = ent?.components.Transform as TransformData | undefined;
          const origin: Vec3 = tr
            ? ([...tr.position] as Vec3)
            : [0, 0, 0];
          const eye = orbitEye(
            liveCam.current.pivot,
            liveCam.current.yaw,
            liveCam.current.pitch,
            liveCam.current.distance,
          );
          const cam: Camera = { eye, target: liveCam.current.pivot, fovYDeg: 60 };
          const scr = project(origin, cam, lastVpRef.current);
          const basis = transformBasis(tr?.rotation as [number, number, number, number] | undefined);
          let axisWorld: Vec3 | undefined;
          let lastAng: number | undefined;
          if (propsRef.current.gizmo === 'rotate' && hit.part.kind === 'axis') {
            // 与移动箭头同一方向：X=right Y=up Z=forward
            axisWorld =
              hit.part.axis === 'x'
                ? basis.right
                : hit.part.axis === 'y'
                  ? basis.up
                  : basis.forward;
            const ang = angleAroundWorldAxis(
              origin,
              axisWorld,
              x,
              y,
              cam,
              lastVpRef.current,
            );
            if (ang != null) lastAng = ang;
          } else if (propsRef.current.gizmo === 'rotate' && scr) {
            lastAng = Math.atan2(y - scr.y, x - scr.x);
          }
          draggingRef.current = true;
          activeGizmoRef.current = hit.part;
          propsRef.current.onBeginGesture();
          dragRef.current = {
            type: 'gizmo',
            part: hit.part,
            lx: ev.clientX,
            ly: ev.clientY,
            entity: propsRef.current.selected,
            origin,
            axisWorld,
            gizmoScreen: scr ? { x: scr.x, y: scr.y } : undefined,
            lastAng,
          };
          return;
        }
        if (hit?.kind === 'object') {
          propsRef.current.onPick(hit.id);
        }
      }
    }
  };

  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      const canvas = canvasRef.current;

      // Hover highlight when idle
      if (!d && canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        if (propsRef.current.tab === 'game') {
          const ui = hitTestUi(uiItemsRef.current, x, y);
          uiHoverRef.current = ui?.entity ?? null;
          canvas.style.cursor = ui?.button ? 'pointer' : 'default';
        } else if (propsRef.current.tab === 'scene' && !propsRef.current.playing) {
          const next = usingRectGizmoRef.current
            ? hitTestRectGizmo(rectGizmoHitsRef.current, x, y)
            : hitTestTransformGizmo(gizmoHitsRef.current, x, y);
          if (!gizmoPartEquals(hoverGizmoRef.current, next)) {
            hoverGizmoRef.current = next;
            canvas.style.cursor = usingRectGizmoRef.current
              ? cursorForRectGizmo(next, propsRef.current.gizmo)
              : cursorForGizmoPart(next);
          } else if (!next) {
            const ui = hitTestUiSelect(uiItemsRef.current, x, y);
            canvas.style.cursor = ui ? 'pointer' : 'default';
          }
        }
      }

      if (!d) return;
      const dx = ev.clientX - d.lx;
      const dy = ev.clientY - d.ly;
      d.lx = ev.clientX;
      d.ly = ev.clientY;

      if (d.type === 'orbit') {
        if (scene2DRef.current) return;
        liveCam.current.yaw -= dx * 0.35;
        liveCam.current.pitch = Math.max(-89, Math.min(89, liveCam.current.pitch + dy * 0.25));
        syncCamToStore();
      } else if (d.type === 'pan') {
        const eye = orbitEye(
          liveCam.current.pivot,
          liveCam.current.yaw,
          liveCam.current.pitch,
          liveCam.current.distance,
        );
        const { right, up } = lookBasis(eye, liveCam.current.pivot);
        const sens = liveCam.current.distance * 0.0025;
        liveCam.current.pivot = add(
          liveCam.current.pivot,
          add(vscale(right, -dx * sens), vscale(up, dy * sens)),
        );
        syncCamToStore();
      } else if (d.type === 'rectGizmo') {
        const mode = propsRef.current.gizmo;
        const scale = d.layoutScale > 1e-6 ? d.layoutScale : 1;
        const axes = rectLocalAxes(d.rotDeg);

        if (d.part.kind === 'size') {
          const alongX = projectScreenDelta(dx, dy, axes.x) / scale;
          const alongY = -projectScreenDelta(dx, dy, axes.y) / scale;
          propsRef.current.onRectResize?.(d.entity, d.part.handle, alongX, alongY);
        } else if (mode === 'translate') {
          if (d.part.kind === 'axis') {
            const dir = d.part.axis === 'x' ? axes.x : axes.y;
            const along = projectScreenDelta(dx, dy, dir) / scale;
            if (d.part.axis === 'x') {
              propsRef.current.onRectTranslate?.(d.entity, along, 0);
            } else {
              // local Y screen points up; UI y+ is down
              propsRef.current.onRectTranslate?.(d.entity, 0, -along);
            }
          } else {
            propsRef.current.onRectTranslate?.(
              d.entity,
              projectScreenDelta(dx, dy, axes.x) / scale,
              -projectScreenDelta(dx, dy, axes.y) / scale,
            );
          }
        } else if (mode === 'scale') {
          if (d.part.kind === 'axis' && (d.part.axis === 'x' || d.part.axis === 'y')) {
            const dir = d.part.axis === 'x' ? axes.x : axes.y;
            const along = projectScreenDelta(dx, dy, dir);
            propsRef.current.onRectScale?.(d.entity, d.part.axis, along / 80);
          } else {
            const amount = (dx + -dy) / 160;
            propsRef.current.onRectScale?.(d.entity, 'both', amount);
          }
        } else if (mode === 'rotate') {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const mx = ev.clientX - rect.left;
          const my = ev.clientY - rect.top;
          const ang = Math.atan2(my - d.pivot.y, mx - d.pivot.x);
          if (d.lastAng == null) {
            d.lastAng = ang;
            return;
          }
          let dAng = ang - d.lastAng;
          if (dAng > Math.PI) dAng -= Math.PI * 2;
          if (dAng < -Math.PI) dAng += Math.PI * 2;
          d.lastAng = ang;
          propsRef.current.onRectRotate?.(d.entity, (-dAng * 180) / Math.PI);
          d.rotDeg += (-dAng * 180) / Math.PI;
        }
      } else if (d.type === 'gizmo') {
        const eye = orbitEye(
          liveCam.current.pivot,
          liveCam.current.yaw,
          liveCam.current.pitch,
          liveCam.current.distance,
        );
        const cam: Camera = { eye, target: liveCam.current.pivot, fovYDeg: 60 };
        const vp = lastVpRef.current;
        const ent = propsRef.current.entities.find((e) => e.entity === d.entity);
        const tr = ent?.components.Transform as TransformData | undefined;
        const origin = (tr?.position as Vec3 | undefined) ?? d.origin;
        const basis = transformBasis(tr?.rotation as [number, number, number, number] | undefined);
        const gizmo = propsRef.current.gizmo;
        const screen = { dx, dy };

        if (gizmo === 'translate') {
          let worldDelta: Vec3 = [0, 0, 0];
          if (d.part.kind === 'axis') {
            const axisVec =
              d.part.axis === 'x' ? basis.right : d.part.axis === 'y' ? basis.up : basis.forward;
            worldDelta = worldDeltaAlongAxis(origin, axisVec, screen, cam, vp);
          } else if (d.part.kind === 'plane') {
            const [a, b] =
              d.part.plane === 'xy'
                ? [basis.right, basis.up]
                : d.part.plane === 'xz'
                  ? [basis.right, basis.forward]
                  : [basis.up, basis.forward];
            worldDelta = worldDeltaOnPlane(origin, a, b, screen, cam, vp);
          } else {
            worldDelta = worldDeltaViewPlane(origin, screen, cam, vp);
          }
          propsRef.current.onTranslate(d.entity, worldDelta);
        } else if (gizmo === 'scale' && d.part.kind === 'axis') {
          const axisVec =
            d.part.axis === 'x' ? basis.right : d.part.axis === 'y' ? basis.up : basis.forward;
          const delta = worldDeltaAlongAxis(origin, axisVec, screen, cam, vp);
          const amount = delta[0] * axisVec[0] + delta[1] * axisVec[1] + delta[2] * axisVec[2];
          propsRef.current.onGizmoAxis(d.entity, d.part.axis, amount);
        } else if (gizmo === 'rotate') {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const mx = ev.clientX - rect.left;
          const my = ev.clientY - rect.top;

          if (d.part.kind === 'axis' && d.axisWorld) {
            // 绕按下时锁定的轴转（与该色移动箭头共线），不会串到其他轴
            const ang = angleAroundWorldAxis(d.origin, d.axisWorld, mx, my, cam, vp);
            if (ang == null || d.lastAng == null) return;
            let dAng = ang - d.lastAng;
            if (dAng > Math.PI) dAng -= Math.PI * 2;
            if (dAng < -Math.PI) dAng += Math.PI * 2;
            d.lastAng = ang;
            propsRef.current.onRotateWorld?.(
              d.entity,
              d.axisWorld,
              (dAng * 180) / Math.PI,
            );
          } else if (d.part.kind === 'center') {
            const scr =
              d.gizmoScreen ??
              (() => {
                const p = project(origin, cam, vp);
                return p ? { x: p.x, y: p.y } : null;
              })();
            if (!scr) return;
            const ang = Math.atan2(my - scr.y, mx - scr.x);
            if (d.lastAng == null) {
              d.lastAng = ang;
              return;
            }
            let dAng = ang - d.lastAng;
            if (dAng > Math.PI) dAng -= Math.PI * 2;
            if (dAng < -Math.PI) dAng += Math.PI * 2;
            d.lastAng = ang;
            const { forward } = lookBasis(cam.eye, cam.target);
            propsRef.current.onRotateWorld?.(d.entity, forward, (dAng * 180) / Math.PI);
          }
        }
      }
    };
    const onUp = (ev: MouseEvent) => {
      const press = uiPressRef.current;
      if (press != null && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const ui = hitTestUi(uiItemsRef.current, x, y);
        if (ui && ui.entity === press && ui.button?.interactable) {
          propsRef.current.onUiClick?.(ui.entity, ui.button.onClick);
        }
      }
      uiPressRef.current = null;
      if (dragRef.current?.type === 'orbit' || dragRef.current?.type === 'pan') {
        syncCamToStore();
      }
      if (dragRef.current?.type === 'gizmo' || dragRef.current?.type === 'rectGizmo') {
        propsRef.current.onEndGesture();
      }
      dragRef.current = null;
      draggingRef.current = false;
      activeGizmoRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onWheel = (ev: React.WheelEvent) => {
    if (propsRef.current.tab !== 'scene') return;
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 1.12 : 0.9;
    liveCam.current.distance = Math.max(0.5, Math.min(200, liveCam.current.distance * factor));
    syncCamToStore();
  };

  const applyScene2D = (on: boolean) => {
    setScene2D(on);
    try {
      localStorage.setItem(SCENE_2D_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (on) {
      savedOrbitRef.current = {
        yaw: liveCam.current.yaw,
        pitch: liveCam.current.pitch,
      };
      liveCam.current.yaw = 0;
      liveCam.current.pitch = 0;
      // 对准 Canvas 平面中心
      const box = letterbox(
        Math.max(1, canvasRef.current?.clientWidth ?? 800),
        Math.max(1, canvasRef.current?.clientHeight ?? 600),
        propsRef.current.gameAspect,
        propsRef.current.gameOrientation,
      );
      liveCam.current.pivot = [0, 0, 0];
      const worldW = box.w / UI_SCENE_PPU;
      const worldH = box.h / UI_SCENE_PPU;
      liveCam.current.distance = Math.max(2, Math.max(worldW, worldH) * 1.15);
      syncCamToStore();
    } else if (savedOrbitRef.current) {
      liveCam.current.yaw = savedOrbitRef.current.yaw;
      liveCam.current.pitch = savedOrbitRef.current.pitch;
      savedOrbitRef.current = null;
      syncCamToStore();
    }
    setTick((t) => t + 1);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (propsRef.current.tab !== 'scene') return;
      if (ev.key === 'f' || ev.key === 'F') propsRef.current.onFrame();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="viewport-wrap">
      {props.tab === 'scene' && (
        <div className="game-toolbar scene-toolbar">
          <div className="orient-toggle" title="2D：锁定正视 Canvas，仅平移/缩放">
            <button
              type="button"
              className={scene2D ? 'active' : ''}
              onClick={() => applyScene2D(!scene2D)}
            >
              2D
            </button>
          </div>
          <span className="game-hint">
            {scene2D
              ? '正视 Canvas · RMB/MMB 平移 · Wheel 缩放'
              : 'RMB 旋转 · MMB/Alt+LMB 平移 · Wheel 缩放 · F 聚焦'}
          </span>
        </div>
      )}
      {props.tab === 'game' && (
        <div className="game-toolbar">
          <label>
            Display
            <select
              value={props.gameAspect}
              onChange={(e) => props.onAspect(e.target.value as GameAspect)}
            >
              <option value="free">Free Aspect</option>
              <option value="16:9">16:9</option>
              <option value="16:10">16:10</option>
              <option value="4:3">4:3</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
          <div className="orient-toggle" title="横竖屏">
            <button
              type="button"
              className={props.gameOrientation === 'landscape' ? 'active' : ''}
              disabled={props.gameAspect === '1:1'}
              onClick={() => props.onOrientation('landscape')}
            >
              横屏
            </button>
            <button
              type="button"
              className={props.gameOrientation === 'portrait' ? 'active' : ''}
              disabled={props.gameAspect === '1:1'}
              onClick={() => props.onOrientation('portrait')}
            >
              竖屏
            </button>
          </div>
          <span className="game-hint">Uses Main Camera · no Scene gizmos</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        onMouseDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={onWheel}
        style={{ cursor: props.tab === 'scene' ? 'crosshair' : 'default', width: '100%', height: '100%' }}
      />
      {props.tab === 'scene' && (
        <div className="viewport-overlay">
          Scene{scene2D ? ' 2D' : ''}
          <br />
          {scene2D
            ? 'Pan · Zoom · Rect gizmos'
            : 'Orbit · Pan · Zoom · F frame'}
        </div>
      )}
    </div>
  );
}
