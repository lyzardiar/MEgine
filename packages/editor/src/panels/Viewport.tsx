import { useEffect, useRef, useState } from 'react';
import {
  AlignHorizontalSpaceAround,
  Anchor,
  ChevronDown,
  CircleDot,
  Focus,
  Grid3X3,
  Magnet,
  Paintbrush,
  ScanLine,
} from 'lucide-react';
import type { GizmoMode, SceneCamera, TransformData } from '../store';
import {
  GAME_RESOLUTION_PRESETS,
  gameResolutionKey,
  gameResolutionOrientation,
  normalizeGameResolution,
  type GameResolution,
} from '../gameResolution';
import {
  type Camera,
  type Vec3,
  add,
  drawGroundGrid,
  drawSolidCube,
  drawTriangleMesh,
  drawWorldSprite,
  drawWorldLine2D,
  lookBasis,
  orbitEye,
  project,
  scale as vscale,
} from '../math3d';
import { clearModelPreview, modelPreview } from '../modelPreview';
import {
  clearMaterialPreviews,
  materialAssetPreview,
  resolveMaterialPreviewAppearance,
} from '../materialPreview';
import {
  drawCamera2DGizmo,
  drawCameraGizmo,
  drawBoxCollider2DGizmo,
  drawBoxColliderGizmo,
  drawCircleCollider2DGizmo,
  drawDirectionalLightGizmo,
  drawPointLightGizmo,
  drawSphereColliderGizmo,
  drawSpotLightGizmo,
  transformBasis,
  type Camera2DData,
  type Camera3DData,
} from '../editorGizmos';
import { primaryGameCamera } from '../gameCamera';
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
  rectToolHandlePivot,
  rotateRectToolPoint,
  scaleRectToolPoint,
  type RectGizmoHit,
} from '../rectGizmo';
import {
  drawUiItems,
  hitTestUi,
  hitTestUiSelect,
  layoutUiOverlay,
  layoutUiScene3D,
  scrollbarValueAtPoint,
  sliderValueAtPoint,
  uiPointAction,
  UI_SCENE_PPU,
  type UiDrawItem,
} from '../ui/uiLayout';
import { canvasScaleFactor, readRectTransform } from '../ui/rectLayout';
import {
  collectParticleDrawItems,
  createParticleEmitterState,
  stepParticleEmitter,
  type ParticleEmitterState,
} from '../particles/particleSystem';
import { loadSpineRuntime } from '../spine/spineRuntimeLoader';
import type { SpineCanvasRuntime, SpineDrawResult } from '../spine/spineCanvasRuntime';
import {
  EMPTY_SNAP_ACCUMULATOR,
  advanceSnap,
  normalizeSceneSnapSettings,
  type SceneSnapSettings,
  type SnapAccumulator,
} from '../sceneSnap';
import {
  marqueeHitIds,
  normalizeMarquee,
  type MarqueeRect,
  type MarqueeSelectionMode,
} from '../marqueeSelection';
import { selectedRectRoots } from '../rectSelection';
import {
  isRectMoveMode,
  transformGizmoMode,
  usesLocalHandleAxes,
  type ToolHandleOrientation,
  type ToolPivotMode,
} from '../editorTool';
import { transformHandleOrigin } from '../transformSelection';
import {
  planRectAlignment,
  type RectAlignmentCommand,
  type RectAlignmentDelta,
} from '../rectAlignment';
import { buildSceneGrid } from '../sceneGrid';
import { moveAnchorHandle } from '../ui/rectTransformModel';
import { distanceForSceneZoom, normalizeSceneZoom } from '../sceneZoom';
import {
  rectAxisTranslationAmount,
  rectTranslationAlongAxis,
  screenRectTranslation,
} from '../rectDrag';
import {
  rectBounds,
  snapRectToGuides,
  type RectSmartGuide,
} from '../rectSmartGuides';
import type { RectResizeOptions, RectResizePlan } from '../rectResize';
import { nextUiSelectable, uiNavigationAction } from '../ui/uiNavigation';
import { getSpriteImage, getSpriteSourceRect } from '../spriteDraw';
import { listSprites } from '../spriteLibrary';
import { resolveAnimatedSpriteFrame } from '../animatedSprite';
import {
  compareWorldDrawOrder,
  component2DSortingSettings,
} from '../worldDrawOrder';
import { getSortingLayerRank } from '../sortingLayers';
import { buildWorldTransforms, resolvedTransform } from '../worldTransform';
import {
  modulateLight2DColor,
  prepareLight2DLights,
  type Light2DComponent,
  type Light2DInstance,
} from '../light2d';
import {
  hitTestLinePoint,
  linePointDeltaFromWorld,
  linePointWorld,
  moveLine2DPoint,
  readLine2DPoints,
  type LinePointHit,
} from '../line2dEditing';
import {
  boxTiles,
  cellLocalPosition,
  eraseTile,
  floodFillTiles,
  localPointToCell,
  lineTiles,
  nearestGridSettings,
  normalizeTilemapData,
  setTile,
  tileAt,
  type TilemapData,
} from '../tilemapModel';
import {
  drawEnvironmentBackground,
  invalidateEnvironmentPreviews,
  type EnvironmentBackground,
} from '../environmentPreview';

const SCENE_2D_KEY = 'mengine.scene.2d';
const SCENE_SNAP_KEY = 'mengine.scene.snap';
const SCENE_GRID_KEY = 'mengine.scene.grid';
const SCENE_SMART_GUIDES_KEY = 'mengine.scene.smart-guides';

function loadScene2D(): boolean {
  try {
    return localStorage.getItem(SCENE_2D_KEY) === '1';
  } catch {
    return false;
  }
}

function loadSceneSnap(): SceneSnapSettings {
  try {
    return normalizeSceneSnapSettings(JSON.parse(localStorage.getItem(SCENE_SNAP_KEY) ?? '{}'));
  } catch {
    return normalizeSceneSnapSettings(null);
  }
}

function saveSceneSnap(settings: SceneSnapSettings): void {
  try {
    localStorage.setItem(SCENE_SNAP_KEY, JSON.stringify(settings));
  } catch {
    /* ignore unavailable storage */
  }
}

function loadSceneGrid(): boolean {
  try {
    return localStorage.getItem(SCENE_GRID_KEY) !== '0';
  } catch {
    return true;
  }
}

function loadSmartGuides(): boolean {
  try {
    return localStorage.getItem(SCENE_SMART_GUIDES_KEY) !== '0';
  } catch {
    return true;
  }
}

function drawCanvasGrid(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  logicalStep: number,
  screenScale: number,
): void {
  if (rect.w <= 0 || rect.h <= 0) return;
  const grid = buildSceneGrid(rect, logicalStep, screenScale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  for (const major of [false, true]) {
    ctx.beginPath();
    for (const line of grid.vertical) {
      if (line.major !== major) continue;
      const x = Math.round(line.position) + 0.5;
      ctx.moveTo(x, rect.y);
      ctx.lineTo(x, rect.y + rect.h);
    }
    for (const line of grid.horizontal) {
      if (line.major !== major) continue;
      const y = Math.round(line.position) + 0.5;
      ctx.moveTo(rect.x, y);
      ctx.lineTo(rect.x + rect.w, y);
    }
    ctx.strokeStyle = major
      ? 'rgba(92, 177, 224, 0.24)'
      : 'rgba(151, 181, 198, 0.11)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

function rectGizmoBounds(
  item: UiDrawItem,
  pivot: { x: number; y: number },
  pivotNorm: [number, number],
): { x: number; y: number; w: number; h: number } {
  const size = item.unrotatedSize;
  if (!size) return item.rect;
  return {
    x: pivot.x - size.w * pivotNorm[0],
    y: pivot.y - size.h * pivotNorm[1],
    w: size.w,
    h: size.h,
  };
}

function rectAnchorPoints(
  item: UiDrawItem,
  anchorMin: [number, number],
  anchorMax: [number, number],
): { min: { x: number; y: number }; max: { x: number; y: number } } | undefined {
  const parent = item.anchorParentRect;
  if (!parent) return undefined;
  return {
    min: {
      x: parent.x + parent.w * anchorMin[0],
      y: parent.y + parent.h * anchorMin[1],
    },
    max: {
      x: parent.x + parent.w * anchorMax[0],
      y: parent.y + parent.h * anchorMax[1],
    },
  };
}

function inSelectedRectTree(
  entityId: number,
  roots: Set<number>,
  byId: Map<number, Ent>,
): boolean {
  const visited = new Set<number>();
  let current: number | null = entityId;
  while (current != null && !visited.has(current)) {
    if (roots.has(current)) return true;
    visited.add(current);
    current = byId.get(current)?.parent ?? null;
  }
  return false;
}

function drawSmartGuides(ctx: CanvasRenderingContext2D, guides: RectSmartGuide[]): void {
  if (!guides.length) return;
  ctx.save();
  ctx.strokeStyle = '#e86de8';
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  for (const guide of guides) {
    if (guide.axis === 'x') {
      const x = Math.round(guide.position) + 0.5;
      ctx.moveTo(x, guide.from);
      ctx.lineTo(x, guide.to);
    } else {
      const y = Math.round(guide.position) + 0.5;
      ctx.moveTo(guide.from, y);
      ctx.lineTo(guide.to, y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

type RectSnapDrag = {
  active: boolean;
  settings: SceneSnapSettings;
  x: SnapAccumulator;
  y: SnapAccumulator;
  rotate: SnapAccumulator;
  scale: SnapAccumulator;
};

function createRectSnapDrag(active: boolean, settings: SceneSnapSettings): RectSnapDrag {
  return {
    active,
    settings: { ...settings },
    x: { ...EMPTY_SNAP_ACCUMULATOR },
    y: { ...EMPTY_SNAP_ACCUMULATOR },
    rotate: { ...EMPTY_SNAP_ACCUMULATOR },
    scale: { ...EMPTY_SNAP_ACCUMULATOR },
  };
}

type Ent = {
  entity: number;
  name?: string | null;
  active?: boolean;
  parent?: number | null;
  components: Record<string, unknown>;
};

type TilemapTool = 'paint' | 'erase' | 'box' | 'fill' | 'picker';

function rectHandlePivotForSelection(
  entities: Ent[],
  items: UiDrawItem[],
  selectedIds: readonly number[],
  primary: number,
  mode: ToolPivotMode,
): { x: number; y: number } | null {
  const primaryEntity = entities.find((entity) => entity.entity === primary);
  const primaryItem = items.find((item) => item.entity === primary);
  if (!primaryEntity?.components.RectTransform || !primaryItem) return null;
  const primaryRect = readRectTransform(primaryEntity.components.RectTransform);
  const primaryPivot = primaryItem.pivotScreen ?? rectPivot(primaryItem.rect, primaryRect.pivot);
  if (mode === 'pivot') return primaryPivot;

  const roots = selectedRectRoots(entities, [...selectedIds]);
  const centers = roots.flatMap((id) => {
    const entity = entities.find((candidate) => candidate.entity === id);
    const item = items.find((candidate) => candidate.entity === id);
    if (!entity?.components.RectTransform || !item) return [];
    const rectTransform = readRectTransform(entity.components.RectTransform);
    const pivot = item.pivotScreen ?? rectPivot(item.rect, rectTransform.pivot);
    const bounds = rectGizmoBounds(item, pivot, rectTransform.pivot);
    return [rectToolHandlePivot(
      bounds,
      pivot,
      rectTransform.pivot,
      rectTransform.local_rotation,
      'center',
    )];
  });
  if (!centers.length) return primaryPivot;
  const xs = centers.map((center) => center.x);
  const ys = centers.map((center) => center.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) * 0.5,
    y: (Math.min(...ys) + Math.max(...ys)) * 0.5,
  };
}

type Hit =
  | { kind: 'object'; id: number; x: number; y: number; r: number }
  | { kind: 'gizmo'; part: GizmoPart };

function letterbox(
  panelW: number,
  panelH: number,
  resolution: GameResolution | null,
) {
  if (!resolution) return { x: 0, y: 0, w: panelW, h: panelH };
  const target = resolution.width / resolution.height;

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

export function Viewport(props: {
  tab: 'scene' | 'game';
  clearColor: [number, number, number, number];
  entities: Ent[];
  selected: number | null;
  selectedIds?: number[];
  activeInHierarchy?: (id: number) => boolean;
  angle: number;
  gizmo: GizmoMode;
  pivotMode: ToolPivotMode;
  handleOrientation: ToolHandleOrientation;
  playing: boolean;
  sceneCamera: SceneCamera;
  gameResolution: GameResolution | null;
  onPick: (id: number, modifiers: { toggle: boolean; additive: boolean }) => void;
  onMarqueeSelect: (ids: number[], mode: MarqueeSelectionMode) => void;
  onSceneCamera: (partial: Partial<SceneCamera>) => void;
  onBeginGesture: () => void;
  onEndGesture: () => void;
  onLinePointChange?: (
    entity: number,
    points: Array<[number, number]>,
  ) => void;
  onTilemapChange?: (
    entity: number,
    cells: Array<[number, number]>,
    sprites: string[],
  ) => void;
  onDuplicateRectDrag?: () => number | null;
  onTranslate: (entity: number, delta: Vec3) => void;
  onGizmoScale: (
    entity: number,
    pivot: Vec3,
    axis: 'x' | 'y' | 'z',
    axisWorld: Vec3,
    amount: number,
  ) => void;
  onRotateWorld?: (entity: number, pivot: Vec3, axis: Vec3, degrees: number) => void;
  onRectTranslate?: (entity: number, dx: number, dy: number) => void;
  onRectNudge?: (dx: number, dy: number) => void;
  onRectAlign?: (deltas: RectAlignmentDelta[]) => void;
  onRectPivot?: (
    entity: number,
    pivot: [number, number],
    parentSize: [number, number],
  ) => void;
  onRectAnchors?: (
    entity: number,
    anchorMin: [number, number],
    anchorMax: [number, number],
    parentSize: [number, number],
  ) => void;
  onRectRotate?: (deltas: Array<{
    entity: number;
    dx: number;
    dy: number;
    degrees: number;
  }>) => void;
  onRectScale?: (deltas: Array<{
    entity: number;
    dx: number;
    dy: number;
    factorX: number;
    factorY: number;
  }>) => void;
  onRectResize?: (
    entity: number,
    handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw',
    dLocalX: number,
    dLocalY: number,
    options: RectResizeOptions,
  ) => RectResizePlan | null | void;
  onGameResolution: (resolution: GameResolution | null) => void;
  onFrame: () => void;
  onInstantiateSprite: (path: string, position: Vec3) => void;
  onUiClick?: (entity: number, onClick: unknown) => void;
  onUiValueChange?: (
    entity: number,
    component: 'Toggle' | 'Slider' | 'Scrollbar' | 'InputField' | 'Dropdown' | 'ListView' | 'ScrollView' | 'TabView',
    patch: Record<string, unknown>,
    callback: unknown,
  ) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<Hit[]>([]);
  const gizmoHitsRef = useRef<GizmoHit[]>([]);
  const rectGizmoHitsRef = useRef<RectGizmoHit[]>([]);
  const linePointHitsRef = useRef<LinePointHit[]>([]);
  const uiItemsRef = useRef<UiDrawItem[]>([]);
  const uiLayoutScaleRef = useRef(1);
  const usingRectGizmoRef = useRef(false);
  const uiHoverRef = useRef<number | null>(null);
  const uiPressRef = useRef<number | null>(null);
  const focusedInputRef = useRef<number | null>(null);
  const focusedUiRef = useRef<number | null>(null);
  const uiStatsRef = useRef({ elements: 0, batches: 0 });
  const particleStatesRef = useRef(new Map<number, ParticleEmitterState>());
  const spineRuntimeRef = useRef<SpineCanvasRuntime | null>(null);
  const spineRuntimeLoadRef = useRef<Promise<void> | null>(null);
  const spineRuntimeErrorRef = useRef<string | null>(null);
  const lastParticleFrameRef = useRef(0);
  const hoverGizmoRef = useRef<GizmoPart | null>(null);
  const activeGizmoRef = useRef<GizmoPart | null>(null);
  const lastVpRef = useRef({ x: 0, y: 0, w: 1, h: 1 });
  const lastCameraRef = useRef<Camera>({ eye: [0, 0, 10], target: [0, 0, 0], fovYDeg: 60 });
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
        type: 'linePoint';
        lx: number;
        ly: number;
        entity: number;
        index: number;
      }
    | {
        type: 'tilePaint';
        entity: number;
        data: TilemapData;
        erase: boolean;
        lastCell: [number, number];
        lx: number;
        ly: number;
      }
    | {
        type: 'tileBox';
        entity: number;
        baseData: TilemapData;
        data: TilemapData;
        startCell: [number, number];
        lastCell: string;
        erase: boolean;
        lx: number;
        ly: number;
      }
    | {
        type: 'uiRange';
        lx: number;
        ly: number;
        entity: number;
        component: 'Slider' | 'Scrollbar';
      }
    | {
        type: 'marquee';
        lx: number;
        ly: number;
        startX: number;
        startY: number;
        toggle: boolean;
        additive: boolean;
      }
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
        handleRotDeg: number;
        layoutScale: number;
        pivotEditing: boolean;
        anchorEditing: boolean;
        pivotNorm: [number, number];
        rectSize: { w: number; h: number };
        rectScale: [number, number];
        anchorMin: [number, number];
        anchorMax: [number, number];
        anchorParentSize: { w: number; h: number };
        smartGuides?: {
          startRect: { x: number; y: number; w: number; h: number };
          candidates: Array<{ x: number; y: number; w: number; h: number }>;
          applied: { x: number; y: number };
        };
        transformPivots: Array<{ entity: number; point: { x: number; y: number } }>;
        lastAng?: number;
        snap: RectSnapDrag;
      }
  >(null);

  const [tick, setTick] = useState(0);
  const [uiStats, setUiStats] = useState({ elements: 0, batches: 0 });
  const [spriteDropActive, setSpriteDropActive] = useState(false);
  const [scene2D, setScene2D] = useState(loadScene2D);
  const scene2DRef = useRef(scene2D);
  scene2DRef.current = scene2D;
  const [sceneGrid, setSceneGrid] = useState(loadSceneGrid);
  const sceneGridRef = useRef(sceneGrid);
  sceneGridRef.current = sceneGrid;
  const [tilePaintEnabled, setTilePaintEnabled] = useState(false);
  const tilePaintEnabledRef = useRef(tilePaintEnabled);
  tilePaintEnabledRef.current = tilePaintEnabled;
  const [tileBrushSprite, setTileBrushSprite] = useState('white');
  const tileBrushSpriteRef = useRef(tileBrushSprite);
  tileBrushSpriteRef.current = tileBrushSprite;
  const [tileTool, setTileTool] = useState<TilemapTool>('paint');
  const tileToolRef = useRef(tileTool);
  tileToolRef.current = tileTool;
  const [smartGuidesEnabled, setSmartGuidesEnabled] = useState(loadSmartGuides);
  const smartGuidesEnabledRef = useRef(smartGuidesEnabled);
  smartGuidesEnabledRef.current = smartGuidesEnabled;
  const smartGuidesRef = useRef<RectSmartGuide[]>([]);
  const [pivotEditing, setPivotEditing] = useState(false);
  const pivotEditingRef = useRef(pivotEditing);
  pivotEditingRef.current = pivotEditing;
  const [anchorEditing, setAnchorEditing] = useState(false);
  const anchorEditingRef = useRef(anchorEditing);
  anchorEditingRef.current = anchorEditing;
  const [sceneZoomPercent, setSceneZoomPercent] = useState(100);
  const sceneCanvasScaleRef = useRef(1);
  const sceneZoomPercentRef = useRef(100);
  const [snapSettings, setSnapSettings] = useState(loadSceneSnap);
  const snapSettingsRef = useRef(snapSettings);
  snapSettingsRef.current = snapSettings;
  const [snapSettingsOpen, setSnapSettingsOpen] = useState(false);
  const snapSettingsElementRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [alignOpen, setAlignOpen] = useState(false);
  const alignElementRef = useRef<HTMLDivElement>(null);
  /** Saved orbit angles when entering 2D (restore on exit). */
  const savedOrbitRef = useRef<{ yaw: number; pitch: number } | null>(null);

  useEffect(() => {
    if (!snapSettingsOpen) return;
    const close = (event: PointerEvent) => {
      if (!snapSettingsElementRef.current?.contains(event.target as Node)) {
        setSnapSettingsOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [snapSettingsOpen]);

  useEffect(() => {
    if (!alignOpen) return;
    const close = (event: PointerEvent) => {
      if (!alignElementRef.current?.contains(event.target as Node)) setAlignOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [alignOpen]);

  useEffect(() => {
    const clear = () => {
      clearModelPreview();
      clearMaterialPreviews();
      invalidateEnvironmentPreviews();
    };
    window.addEventListener('mengine:project-assets-changed', clear);
    return () => window.removeEventListener('mengine:project-assets-changed', clear);
  }, []);

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
  }, [props.tab, props.entities, props.selected, props.selectedIds, props.gizmo, props.pivotMode, props.handleOrientation, props.gameResolution, props.angle, props.playing, props.activeInHierarchy]);

  const paint = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const p = propsRef.current;
    const sc = liveCam.current;
    const now = performance.now();
    const particleDelta = lastParticleFrameRef.current > 0
      ? Math.min(0.1, (now - lastParticleFrameRef.current) / 1000)
      : 0;
    lastParticleFrameRef.current = now;

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
    linePointHitsRef.current = [];

    // Scene 2D：锁定正视 Canvas（yaw/pitch = 0，从 +Z 看 XY 平面）
    if (!isGame && scene2DRef.current) {
      sc.yaw = 0;
      sc.pitch = 0;
    }

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, pw, ph);

    const vp = isGame
      ? letterbox(pw, ph, p.gameResolution)
      : { x: 0, y: 0, w: pw, h: ph };
    lastVpRef.current = vp;

    if (isGame && (vp.w < pw - 1 || vp.h < ph - 1)) {
      ctx.fillStyle = '#0d0d0d';
      ctx.fillRect(0, 0, pw, ph);
    }

    const gameCamera = isGame
      ? primaryGameCamera(p.entities, p.activeInHierarchy)
      : null;
    const cam: Camera = isGame
      ? gameCamera ?? { eye: [0, 1.5, 4], target: [0, 0.5, 0], fovYDeg: 60 }
      : {
          eye: orbitEye(sc.pivot, sc.yaw, sc.pitch, sc.distance),
          target: sc.pivot,
          fovYDeg: 60,
        };
    lastCameraRef.current = cam;
    const isActive = (id: number) =>
      p.activeInHierarchy ? p.activeInHierarchy(id) : true;
    const environment = p.entities.find(
      (entity) => isActive(entity.entity) && entity.components.EnvironmentLight,
    )?.components.EnvironmentLight as EnvironmentBackground | undefined;

    ctx.save();
    ctx.beginPath();
    ctx.rect(vp.x, vp.y, vp.w, vp.h);
    ctx.clip();

    let drewEnvironment = false;
    if (isGame && gameCamera?.clearFlags === 'solid_color') {
      const [r, g, b, a] = gameCamera.backgroundColor;
      ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    } else {
      const environmentBackground = isGame && gameCamera?.clearFlags === 'skybox'
        ? { ...(environment ?? {}), background_enabled: true }
        : environment;
      drewEnvironment = drawEnvironmentBackground(ctx, vp, cam, environmentBackground);
    }
    if (isGame && gameCamera?.clearFlags !== 'solid_color' && !drewEnvironment) {
      const [r, g, b, a] = p.clearColor;
      ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
      ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
    } else if (!isGame) {
      if (!drewEnvironment) {
        const sky = ctx.createLinearGradient(vp.x, vp.y, vp.x, vp.y + vp.h);
        sky.addColorStop(0, '#6a8aaa');
        sky.addColorStop(0.5, '#3d4858');
        sky.addColorStop(1, '#2a3038');
        ctx.fillStyle = sky;
        ctx.fillRect(vp.x, vp.y, vp.w, vp.h);
      }
      drawGroundGrid(ctx, cam, vp, sc.pivot, sc.distance);
    }

    const worldTransforms = buildWorldTransforms(p.entities);
    const lights2D = prepareLight2DLights(p.entities.flatMap<Light2DInstance>((entity) => {
      if (!isActive(entity.entity)) return [];
      const component = entity.components.Light2D as Light2DComponent | undefined;
      const transform = resolvedTransform(worldTransforms, entity.entity) ?? undefined;
      if (!component || !transform) return [];
      return [{
        position: [transform.position[0], transform.position[1]],
        component,
      }];
    }));
    // Game 视图不显示编辑器选中态（只能 Hierarchy / Scene 点选）
    const selSet = isGame
      ? new Set<number>()
      : new Set(p.selectedIds?.length ? p.selectedIds : p.selected != null ? [p.selected] : []);

    // Simulate first, then place every emitter into the same world draw list as
    // SpriteRenderer/Line2D/Spine. This avoids the old "all particles on top"
    // behavior and keeps transparent order identical to the native player.
    const liveEmitterIds = new Set<number>();
    const particleDrawByEntity = new Map<number, {
      items: ReturnType<typeof collectParticleDrawItems>;
      additive: boolean;
      twoDimensional: boolean;
      component: Record<string, unknown>;
    }>();
    for (const entity of p.entities) {
      if (!isActive(entity.entity)) continue;
      const transform = resolvedTransform(worldTransforms, entity.entity) ?? undefined;
      if (!transform) continue;
      const emitter2D = entity.components.ParticleEmitter2D as Record<string, unknown> | undefined;
      const emitter3D = entity.components.ParticleEmitter3D as Record<string, unknown> | undefined;
      const emitter = emitter2D ?? emitter3D;
      if (!emitter) continue;
      liveEmitterIds.add(entity.entity);
      let state = particleStatesRef.current.get(entity.entity);
      if (!state) {
        state = createParticleEmitterState(Number(emitter.seed) || 1);
        particleStatesRef.current.set(entity.entity, state);
      }
      const emitterPosition = transform.position as Vec3;
      stepParticleEmitter(emitter2D ? 2 : 3, emitter, state, particleDelta, emitterPosition);
      particleDrawByEntity.set(entity.entity, {
        items: collectParticleDrawItems(state, emitterPosition, emitter.simulation_space),
        additive: String(emitter.blend_mode).toLowerCase() === 'additive',
        twoDimensional: !!emitter2D,
        component: emitter,
      });
    }
    for (const entityId of particleStatesRef.current.keys()) {
      if (!liveEmitterIds.has(entityId)) particleStatesRef.current.delete(entityId);
    }

    const liveSpineIds = new Set<number>();
    for (const entity of p.entities) {
      if (
        isActive(entity.entity)
        && entity.components.SpineSkeleton
        && resolvedTransform(worldTransforms, entity.entity)
      ) {
        liveSpineIds.add(entity.entity);
      }
    }
    const hasSpine = liveSpineIds.size > 0;
    if (hasSpine && !spineRuntimeRef.current && !spineRuntimeLoadRef.current) {
      spineRuntimeLoadRef.current = loadSpineRuntime()
        .then(({ SpineCanvasRuntime }) => {
          spineRuntimeRef.current = new SpineCanvasRuntime();
          spineRuntimeErrorRef.current = null;
        })
        .catch((reason) => {
          spineRuntimeErrorRef.current = String(reason);
        });
    }

    const drawn = p.entities
      .flatMap((e, hierarchyOrder) => {
        if (!isActive(e.entity)) return null;
        const t = resolvedTransform(worldTransforms, e.entity) ?? undefined;
        if (!t) return null;
        const pr = project(t.position as Vec3, cam, vp);
        // Keep cameras/lights even if origin is barely off-screen — frustum/rays may still show
        const camComp = e.components.Camera3D ?? e.components.Camera2D;
        const isLight =
          !!e.components.DirectionalLight ||
          !!e.components.PointLight ||
          !!e.components.SpotLight ||
          !!e.components.Light2D ||
          (e.name ?? '').toLowerCase().includes('light');
        const hasCollider =
          !!e.components.BoxCollider3D ||
          !!e.components.SphereCollider3D ||
          !!e.components.BoxCollider2D ||
          !!e.components.CircleCollider2D;
        const entries: Array<{
          e: Ent;
          t: TransformData;
          pr: { x: number; y: number; depth: number } | null;
          depth: number;
          hierarchyOrder: number;
          sortingOrder: number | null;
          sortingLayerOrder: number | null;
          editorGizmo: boolean;
          renderKind: 'entity' | 'particle' | 'spine';
        }> = [];
        if (pr || camComp || isLight || hasCollider || e.components.Tilemap) {
          const renderer2D = (e.components.Tilemap
            ?? e.components.Line2D
            ?? e.components.AnimatedSprite2D
            ?? e.components.SpriteRenderer) as Record<string, unknown> | undefined;
          const sorting = renderer2D ? component2DSortingSettings(renderer2D) : null;
          entries.push({
            e,
            t,
            pr,
            depth: pr?.depth ?? 0,
            hierarchyOrder: hierarchyOrder * 3,
            sortingOrder: sorting?.order ?? null,
            sortingLayerOrder: sorting ? getSortingLayerRank(sorting.layer) : null,
            editorGizmo: !isGame && !renderer2D && !e.components.MeshRenderer && (!!camComp || isLight),
            renderKind: 'entity',
          });
        }
        const particle = particleDrawByEntity.get(e.entity);
        if (particle) {
          const sorting = particle.twoDimensional
            ? component2DSortingSettings(particle.component)
            : null;
          entries.push({
            e,
            t,
            pr,
            depth: pr?.depth ?? 0,
            hierarchyOrder: hierarchyOrder * 3 + 1,
            sortingOrder: sorting?.order ?? null,
            sortingLayerOrder: sorting ? getSortingLayerRank(sorting.layer) : null,
            editorGizmo: false,
            renderKind: 'particle',
          });
        }
        const spine = e.components.SpineSkeleton as Record<string, unknown> | undefined;
        if (spine && pr) {
          const sorting = component2DSortingSettings(spine);
          entries.push({
            e,
            t,
            pr,
            depth: pr.depth,
            hierarchyOrder: hierarchyOrder * 3 + 2,
            sortingOrder: sorting.order,
            sortingLayerOrder: getSortingLayerRank(sorting.layer),
            editorGizmo: false,
            renderKind: 'spine',
          });
        }
        return entries;
      })
      .filter(Boolean) as Array<{
      e: Ent;
      t: TransformData;
      pr: { x: number; y: number; depth: number } | null;
      depth: number;
      hierarchyOrder: number;
      sortingOrder: number | null;
      sortingLayerOrder: number | null;
      editorGizmo: boolean;
      renderKind: 'entity' | 'particle' | 'spine';
    }>;
    drawn.sort(compareWorldDrawOrder);

    for (const { e, t, pr, renderKind } of drawn) {
      if (renderKind === 'particle') {
        const particleDraw = particleDrawByEntity.get(e.entity);
        if (!particleDraw) continue;
        ctx.save();
        ctx.globalCompositeOperation = particleDraw.additive ? 'lighter' : 'source-over';
        for (const particle of particleDraw.items) {
          const screen = project(particle.position, cam, vp);
          if (!screen || particle.size <= 0 || particle.color[3] <= 0) continue;
          const sizePoint = project(
            [particle.position[0] + particle.size, particle.position[1], particle.position[2]],
            cam,
            vp,
          );
          const radius = Math.max(
            0.75,
            Math.min(96, sizePoint ? Math.hypot(sizePoint.x - screen.x, sizePoint.y - screen.y) : particle.size * 20),
          );
          const particleColor = particleDraw.twoDimensional
            ? modulateLight2DColor(
                particle.color,
                particle.position,
                String(particleDraw.component.sorting_layer ?? 'default'),
                lights2D,
              )
            : particle.color;
          const [red, green, blue, alpha] = particleColor;
          ctx.fillStyle = `rgba(${Math.round(red * 255)},${Math.round(green * 255)},${Math.round(blue * 255)},${Math.max(0, Math.min(1, alpha))})`;
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        continue;
      }

      if (renderKind === 'spine') {
        const component = e.components.SpineSkeleton as Record<string, unknown> | undefined;
        if (!component || !pr) continue;
        const origin = t.position as Vec3;
        const unit = project([origin[0] + 1, origin[1], origin[2]], cam, vp);
        const transformScale = Math.max(0.0001, Math.abs(t.scale[0] ?? 1));
        const pixelsPerWorldUnit = (unit ? Math.max(1, Math.hypot(unit.x - pr.x, unit.y - pr.y)) : 64)
          * transformScale;
        const result: SpineDrawResult = spineRuntimeRef.current
          ? spineRuntimeRef.current.drawEntity({
              entity: e.entity,
              component,
              context: ctx,
              screenX: pr.x,
              screenY: pr.y,
              pixelsPerWorldUnit,
              deltaSeconds: particleDelta,
            })
          : spineRuntimeErrorRef.current
            ? { error: spineRuntimeErrorRef.current }
            : 'loading';
        if (result !== 'drawn' && !isGame) {
          const message = result === 'missing'
            ? 'Spine: assign skeleton + atlas'
            : result === 'loading'
              ? 'Loading Spine 4.3…'
              : result.error;
          ctx.save();
          ctx.strokeStyle = result === 'loading' ? '#56b7d0' : '#e06c75';
          ctx.fillStyle = 'rgba(24, 24, 24, 0.86)';
          ctx.fillRect(pr.x - 76, pr.y - 20, 152, 40);
          ctx.strokeRect(pr.x - 76, pr.y - 20, 152, 40);
          ctx.fillStyle = '#eee';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(message.slice(0, 42), pr.x, pr.y, 144);
          ctx.restore();
        }
        continue;
      }

      const mesh = e.components.MeshRenderer;
      const camComp = e.components.Camera3D as Camera3DData | undefined;
      const cam2DComp = e.components.Camera2D as Camera2DData | undefined;
      const dirLight = e.components.DirectionalLight;
      const isLight =
        !!dirLight ||
        !!e.components.PointLight ||
        !!e.components.SpotLight ||
        !!e.components.Light2D ||
        (e.name ?? '').toLowerCase().includes('light');
      const selected = selSet.has(e.entity);

      if (isGame && (camComp || cam2DComp || (isLight && !mesh))) continue;

      if (cam2DComp && !isGame) {
        try {
          const hit = drawCamera2DGizmo(ctx, cam, vp, t, cam2DComp, vp.w / Math.max(1, vp.h), selected);
          if (hit) hitsRef.current.push({ kind: 'object', id: e.entity, x: hit.x, y: hit.y, r: hit.r });
        } catch (err) {
          console.error('drawCamera2DGizmo', err);
        }
        continue;
      }

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
          const point = e.components.PointLight as { range?: number } | undefined;
          const spot = e.components.SpotLight as
            | { range?: number; outer_angle_degrees?: number }
            | undefined;
          const light2D = e.components.Light2D as
            | { light_type?: unknown; radius?: unknown }
            | undefined;
          const hit = light2D
            ? String(light2D.light_type ?? 'point').toLowerCase() === 'global'
              ? drawDirectionalLightGizmo(ctx, cam, vp, t, selected)
              : drawPointLightGizmo(ctx, cam, vp, t, Number(light2D.radius) || 5, selected)
            : point
            ? drawPointLightGizmo(ctx, cam, vp, t, point.range ?? 10, selected)
            : spot
              ? drawSpotLightGizmo(
                  ctx,
                  cam,
                  vp,
                  t,
                  spot.range ?? 12,
                  spot.outer_angle_degrees ?? 40,
                  selected,
                )
              : drawDirectionalLightGizmo(ctx, cam, vp, t, selected);
          if (hit) hitsRef.current.push({ kind: 'object', id: e.entity, x: hit.x, y: hit.y, r: hit.r });
        } catch (err) {
          console.error('drawDirectionalLightGizmo', err);
        }
        continue;
      }

      if (!mesh) {
        const tilemap = e.components.Tilemap as
          | {
              cells?: unknown;
              sprites?: unknown;
              color?: number[];
              tile_anchor?: number[];
              sorting_layer?: unknown;
            }
          | undefined;
        if (tilemap) {
          const grid = nearestGridSettings(p.entities, e.entity);
          const stepX = grid.cellSize[0] + grid.cellGap[0];
          const stepY = grid.cellSize[1] + grid.cellGap[1];
          const supportedGrid = grid.cellLayout === 'Rectangle'
            && Number.isFinite(stepX)
            && Number.isFinite(stepY)
            && Math.abs(stepX) > 1e-7
            && Math.abs(stepY) > 1e-7;
          const data = supportedGrid
            ? normalizeTilemapData(tilemap.cells, tilemap.sprites)
            : { cells: [], sprites: [] };
          const color = (tilemap.color ?? [1, 1, 1, 1]) as [number, number, number, number];
          const anchorValue = tilemap.tile_anchor ?? [0.5, 0.5];
          const anchor: [number, number] = [
            Number.isFinite(Number(anchorValue[0])) ? Number(anchorValue[0]) : 0.5,
            Number.isFinite(Number(anchorValue[1])) ? Number(anchorValue[1]) : 0.5,
          ];
          const rotation = t.rotation as [number, number, number, number] | undefined;
          const half: [number, number] = [
            grid.cellSize[0] * Math.abs(t.scale[0]) * 0.5,
            grid.cellSize[1] * Math.abs(t.scale[1]) * 0.5,
          ];
          if (selected && !isGame && scene2DRef.current) {
            if (supportedGrid) {
              ctx.save();
              ctx.strokeStyle = 'rgba(86, 183, 208, 0.32)';
              ctx.lineWidth = 1;
              ctx.beginPath();
              for (let line = -10; line <= 11; line += 1) {
                const x = (line - 0.5) * stepX;
                const start = project(linePointWorld([x, -10.5 * stepY], t.position as Vec3, t.scale as Vec3, rotation), cam, vp);
                const end = project(linePointWorld([x, 10.5 * stepY], t.position as Vec3, t.scale as Vec3, rotation), cam, vp);
                if (start && end) {
                  ctx.moveTo(start.x, start.y);
                  ctx.lineTo(end.x, end.y);
                }
                const y = (line - 0.5) * stepY;
                const left = project(linePointWorld([-10.5 * stepX, y], t.position as Vec3, t.scale as Vec3, rotation), cam, vp);
                const right = project(linePointWorld([10.5 * stepX, y], t.position as Vec3, t.scale as Vec3, rotation), cam, vp);
                if (left && right) {
                  ctx.moveTo(left.x, left.y);
                  ctx.lineTo(right.x, right.y);
                }
              }
              ctx.stroke();
              ctx.restore();
            }
          }
          data.cells.forEach((cell, index) => {
            const local = cellLocalPosition(cell, grid);
            const position = linePointWorld(local, t.position as Vec3, t.scale as Vec3, rotation);
            const tileSprite = data.sprites[index] || 'white';
            const image = getSpriteImage(tileSprite);
            const imageReady = image?.complete && image.naturalWidth > 0 ? image : null;
            const litColor = modulateLight2DColor(
              color,
              position,
              String(tilemap.sorting_layer ?? 'default'),
              lights2D,
            );
            const hit = drawWorldSprite(
              ctx,
              cam,
              vp,
              position,
              half,
              litColor,
              selected,
              rotation,
              imageReady,
              false,
              false,
              anchor,
              imageReady ? getSpriteSourceRect(tileSprite, imageReady) : null,
            );
            if (hit) hitsRef.current.push({ kind: 'object', id: e.entity, x: hit.x, y: hit.y, r: hit.r });
          });
          if (data.cells.length > 0 || isGame) continue;
        }
        const line = e.components.Line2D as
          | {
              points?: unknown;
              width?: number;
              color?: number[];
              closed?: boolean;
              sorting_layer?: unknown;
            }
          | undefined;
        if (line && pr) {
          const points = Array.isArray(line.points)
            ? line.points.filter((point): point is [number, number] =>
                Array.isArray(point) && point.length >= 2,
              ).map((point) => [Number(point[0]) || 0, Number(point[1]) || 0] as [number, number])
            : [];
          const hit = drawWorldLine2D(
            ctx,
            cam,
            vp,
            t.position as Vec3,
            t.scale as Vec3,
            points,
            Math.max(0, Number(line.width) || 0),
            (position) => modulateLight2DColor(
              line.color ?? [1, 1, 1, 1],
              position,
              String(line.sorting_layer ?? 'default'),
              lights2D,
            ),
            line.closed === true,
            selected,
            t.rotation as [number, number, number, number] | undefined,
          );
          if (hit) hitsRef.current.push({ kind: 'object', id: e.entity, x: hit.x, y: hit.y, r: hit.r });
          continue;
        }
        const staticSprite = e.components.SpriteRenderer as
          | {
              sprite?: string;
              color?: number[];
              size?: number[];
              pivot?: number[];
              flip_x?: boolean;
              flip_y?: boolean;
              sorting_layer?: unknown;
              sorting_order?: number;
            }
          | undefined;
        const animatedSprite = e.components.AnimatedSprite2D as
          | {
              frames?: unknown;
              fps?: unknown;
              playing?: unknown;
              looped?: unknown;
              frame?: unknown;
              color?: number[];
              size?: number[];
              pivot?: number[];
              flip_x?: boolean;
              flip_y?: boolean;
              sorting_layer?: unknown;
              sorting_order?: number;
            }
          | undefined;
        const spr = animatedSprite ?? staticSprite;
        if (spr && pr) {
          const sz = spr.size ?? [1, 1];
          const sizeX = Number(sz[0]);
          const sizeY = Number(sz[1]);
          const half: [number, number] = [
            0.5 * (Number.isFinite(sizeX) ? Math.abs(sizeX) : 1) * Math.abs(t.scale[0]),
            0.5 * (Number.isFinite(sizeY) ? Math.abs(sizeY) : 1) * Math.abs(t.scale[1]),
          ];
          const col = modulateLight2DColor(
            spr.color ?? [1, 1, 1, 1],
            t.position,
            String(spr.sorting_layer ?? 'default'),
            lights2D,
          );
          const authoredPivot = spr.pivot ?? [0.5, 0.5];
          const pivot: [number, number] = [
            Number.isFinite(Number(authoredPivot[0])) ? Number(authoredPivot[0]) : 0.5,
            Number.isFinite(Number(authoredPivot[1])) ? Number(authoredPivot[1]) : 0.5,
          ];
          const rot = t.rotation as [number, number, number, number] | undefined;
          const sprite = animatedSprite
            ? resolveAnimatedSpriteFrame(animatedSprite, performance.now() / 1000)
            : String(staticSprite?.sprite ?? 'white');
          const image = getSpriteImage(sprite);
          const imageReady = image?.complete && image.naturalWidth > 0 ? image : null;
          const hit = drawWorldSprite(
            ctx,
            cam,
            vp,
            t.position as Vec3,
            half,
            col,
            selected,
            rot,
            imageReady,
            spr.flip_x === true,
            spr.flip_y === true,
            pivot,
            imageReady ? getSpriteSourceRect(sprite, imageReady) : null,
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
      const materialPath = String((mesh as Record<string, unknown>).material ?? 'default');
      const materialAppearance = resolveMaterialPreviewAppearance(
        materialPath,
        materialAssetPreview(materialPath),
        e.components.PbrMaterial,
        e.components.MaterialPropertyBlock,
      );
      const meshPath = String((mesh as Record<string, unknown>).mesh ?? 'cube');
      const imported = /\.(?:gltf|glb)$/i.test(meshPath) ? modelPreview(meshPath) : null;
      const hit = imported
        ? drawTriangleMesh(
            ctx,
            cam,
            vp,
            t.position as Vec3,
            t.scale as Vec3,
            imported.positions,
            imported.indices,
            selected,
            rot,
            materialAppearance,
          )
        : drawSolidCube(
            ctx,
            cam,
            vp,
            t.position as Vec3,
            half,
            selected,
            rot,
            materialAppearance,
          );
      if (hit) hitsRef.current.push({ kind: 'object', id: e.entity, x: hit.x, y: hit.y, r: hit.r });
    }

    if (!isGame) {
      for (const { e, t, renderKind } of drawn) {
        if (renderKind !== 'entity') continue;
        if (!selSet.has(e.entity)) continue;
        const box = e.components.BoxCollider3D as
          | { size?: number[]; center?: number[]; is_trigger?: boolean }
          | undefined;
        const sphere = e.components.SphereCollider3D as
          | { radius?: number; center?: number[]; is_trigger?: boolean }
          | undefined;
        const box2D = e.components.BoxCollider2D as
          | { size?: number[]; offset?: number[]; is_trigger?: boolean }
          | undefined;
        const circle2D = e.components.CircleCollider2D as
          | { radius?: number; offset?: number[]; is_trigger?: boolean }
          | undefined;
        if (box) drawBoxColliderGizmo(ctx, cam, vp, t, box);
        if (sphere) drawSphereColliderGizmo(ctx, cam, vp, t, sphere);
        if (box2D) drawBoxCollider2DGizmo(ctx, cam, vp, t, box2D);
        if (circle2D) drawCircleCollider2DGizmo(ctx, cam, vp, t, circle2D);
      }
    }

    spineRuntimeRef.current?.retainOnly(liveSpineIds);

    // Transform gizmo — 3D Transform OR RectTransform (UI)
    usingRectGizmoRef.current = false;
    rectGizmoHitsRef.current = [];
    if (!isGame && !p.playing && p.selected != null) {
      const sel = p.entities.find((e) => e.entity === p.selected);
      const t = sel ? (resolvedTransform(worldTransforms, sel.entity) ?? undefined) : undefined;
      const hasRect = !!sel?.components.RectTransform;
      // UI 优先用 2D Rect 轴；纯 3D 才用世界坐标轴
      if (hasRect) {
        usingRectGizmoRef.current = true;
        gizmoHitsRef.current = [];
      } else if (t) {
        const transformMode = transformGizmoMode(p.gizmo);
        const origin = transformHandleOrigin(
          p.entities,
          p.selectedIds ?? [p.selected],
          p.selected,
          p.pivotMode,
        ) ?? (t.position as Vec3);
        const handleRotation = usesLocalHandleAxes(p.gizmo, p.handleOrientation)
          ? (t.rotation as [number, number, number, number])
          : null;
        const gh = drawTransformGizmo(
          ctx,
          cam,
          vp,
          origin,
          handleRotation,
          transformMode,
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

    // Unity-style LineRenderer point handles: visible and directly draggable in Scene.
    if (!isGame && !p.playing && p.selected != null) {
      const selectedLine = p.entities.find((entity) => entity.entity === p.selected);
      const transform = selectedLine
        ? (resolvedTransform(worldTransforms, selectedLine.entity) ?? undefined)
        : undefined;
      const line = selectedLine?.components.Line2D as { points?: unknown } | undefined;
      if (selectedLine && transform && line) {
        const points = readLine2DPoints(line.points);
        ctx.save();
        for (let index = 0; index < points.length; index++) {
          const world = linePointWorld(
            points[index],
            transform.position as Vec3,
            transform.scale as Vec3,
            transform.rotation as [number, number, number, number],
          );
          const screen = project(world, cam, vp);
          if (!screen) continue;
          const handle = {
            entity: selectedLine.entity,
            index,
            x: screen.x,
            y: screen.y,
          };
          linePointHitsRef.current.push(handle);
          const active = dragRef.current?.type === 'linePoint'
            && dragRef.current.entity === handle.entity
            && dragRef.current.index === handle.index;
          ctx.fillStyle = active ? '#ffd866' : '#f2f2f2';
          ctx.strokeStyle = '#202020';
          ctx.lineWidth = 1;
          ctx.fillRect(screen.x - 4, screen.y - 4, 8, 8);
          ctx.strokeRect(screen.x - 4.5, screen.y - 4.5, 9, 9);
        }
        ctx.restore();
      }
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
        const stats = drawUiItems(
          ctx,
          uiItems,
          uiHoverRef.current,
          uiPressRef.current ?? focusedInputRef.current,
          { focusId: focusedUiRef.current },
        );
        if (
          stats.elements !== uiStatsRef.current.elements ||
          stats.batches !== uiStatsRef.current.batches
        ) {
          uiStatsRef.current = stats;
          setUiStats(stats);
        }
      } else {
        // 与 Game 同一 letterbox 尺寸，竖屏时 Scene Canvas 也是竖图
        const gameBox = letterbox(pw, ph, p.gameResolution);
        const { items: uiItems, layoutScale } = layoutUiScene3D(
          p.entities,
          cam,
          vp,
          selSet,
          { w: gameBox.w, h: gameBox.h },
        );
        uiItemsRef.current = uiItems;
        uiLayoutScaleRef.current = layoutScale || 1;

        if (scene2DRef.current) {
          const canvasItem = uiItems.find((item) => item.role === 'canvas');
          if (canvasItem && gameBox.w > 1) {
            const nextScale = normalizeSceneZoom(canvasItem.rect.w / gameBox.w);
            const nextPercent = Math.round(nextScale * 100);
            sceneCanvasScaleRef.current = nextScale;
            if (nextPercent !== sceneZoomPercentRef.current) {
              sceneZoomPercentRef.current = nextPercent;
              setSceneZoomPercent(nextPercent);
            }
          }
        }

        if (uiItems.length) {
          if (scene2DRef.current && sceneGridRef.current) {
            for (const item of uiItems) {
              if (item.role !== 'canvas') continue;
              drawCanvasGrid(
                ctx,
                item.rect,
                snapSettingsRef.current.move,
                layoutScale || 1,
              );
            }
          }
          drawUiItems(ctx, uiItems, null, null, { sceneLabel: true });

          if (usingRectGizmoRef.current && p.selected != null) {
            const item = uiItems.find((it) => it.entity === p.selected);
            const sel = p.entities.find((e) => e.entity === p.selected);
            if (item && sel?.components.RectTransform) {
              const rt = readRectTransform(sel.components.RectTransform);
              const actualPivot = item.pivotScreen ?? rectPivot(item.rect, rt.pivot);
              const gizmoRect = rectGizmoBounds(item, actualPivot, rt.pivot);
              const anchors = scene2DRef.current && anchorEditingRef.current
                ? rectAnchorPoints(item, rt.anchor_min, rt.anchor_max)
                : undefined;
              const editingLayoutHandle = scene2DRef.current
                && (pivotEditingRef.current || anchorEditingRef.current);
              const pivot = editingLayoutHandle
                ? actualPivot
                : rectHandlePivotForSelection(
                    p.entities,
                    uiItems,
                    p.selectedIds ?? [p.selected],
                    p.selected,
                    p.pivotMode,
                  ) ?? actualPivot;
              const handleRotDeg = p.gizmo === 'rect'
                || usesLocalHandleAxes(p.gizmo, p.handleOrientation)
                ? rt.local_rotation
                : 0;
              const rh = drawRectGizmo(
                ctx,
                pivot,
                rt.local_rotation,
                p.gizmo,
                hoverGizmoRef.current,
                activeGizmoRef.current,
                gizmoRect,
                rt.pivot,
                scene2DRef.current && pivotEditingRef.current,
                anchors,
                handleRotDeg,
              );
              rectGizmoHitsRef.current = rh;
            }
          }
        }
      }
    }

    if (!isGame && scene2DRef.current) {
      drawSmartGuides(ctx, smartGuidesRef.current);
    }

    if (isGame) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(vp.x + 1, vp.y + 1, vp.w - 2, vp.h - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(vp.x + 8, vp.y + 8, 250, 20);
      ctx.fillStyle = '#ddd';
      ctx.font = '11px sans-serif';
      const orientation = gameResolutionOrientation(p.gameResolution);
      const orientationLabel = orientation === 'portrait'
        ? ' · 竖屏'
        : orientation === 'landscape'
          ? ' · 横屏'
          : orientation === 'square'
            ? ' · 方形'
            : '';
      const resolutionLabel = p.gameResolution
        ? `${p.gameResolution.width} × ${p.gameResolution.height}`
        : 'Free Aspect';
      const label = `${resolutionLabel}${orientationLabel}  ${vp.w | 0}×${vp.h | 0}`;
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
      if (ui) {
        const canvasInterior = ui.role === 'canvas' && scene2DRef.current;
        const edgeDistance = canvasInterior
          ? Math.min(
              Math.abs(x - ui.rect.x),
              Math.abs(x - (ui.rect.x + ui.rect.w)),
              Math.abs(y - ui.rect.y),
              Math.abs(y - (ui.rect.y + ui.rect.h)),
            )
          : 0;
        if (!canvasInterior || edgeDistance <= 6) {
          return { kind: 'object', id: ui.entity, x, y, r: 8 };
        }
      }
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

  const sceneDropWorldPoint = (x: number, y: number): Vec3 => {
    const origin = [...liveCam.current.pivot] as Vec3;
    const screen = project(origin, lastCameraRef.current, lastVpRef.current);
    if (!screen) return origin;
    return add(
      origin,
      worldDeltaViewPlane(
        origin,
        { dx: x - screen.x, dy: y - screen.y },
        lastCameraRef.current,
        lastVpRef.current,
      ),
    );
  };

  const tileCellAt = (
    entityId: number,
    x: number,
    y: number,
  ): [number, number] | null => {
    const entities = propsRef.current.entities;
    const entity = entities.find((candidate) => candidate.entity === entityId);
    if (!entity?.components.Tilemap) return null;
    const transform = resolvedTransform(buildWorldTransforms(entities), entityId);
    if (!transform) return null;
    const origin = transform.position as Vec3;
    const originScreen = project(origin, lastCameraRef.current, lastVpRef.current);
    if (!originScreen) return null;
    const worldDelta = worldDeltaViewPlane(
      origin,
      { dx: x - originScreen.x, dy: y - originScreen.y },
      lastCameraRef.current,
      lastVpRef.current,
    );
    const local = linePointDeltaFromWorld(
      worldDelta,
      transform.scale as Vec3,
      transform.rotation as [number, number, number, number],
    );
    return localPointToCell(local, nearestGridSettings(entities, entityId));
  };

  const paintTilemapAt = (
    entityId: number,
    x: number,
    y: number,
    erase: boolean,
    source: TilemapData,
    lastCell?: [number, number],
  ): { data: TilemapData; cell: [number, number] } | null => {
    const cell = tileCellAt(entityId, x, y);
    if (!cell) return null;
    const cellKey = `${cell[0]},${cell[1]}`;
    if (lastCell && cellKey === `${lastCell[0]},${lastCell[1]}`) return { data: source, cell };
    const data = lastCell
      ? lineTiles(source, lastCell, cell, tileBrushSpriteRef.current, erase)
      : erase
        ? eraseTile(source, cell)
        : setTile(source, cell, tileBrushSpriteRef.current);
    propsRef.current.onTilemapChange?.(entityId, data.cells, data.sprites);
    return { data, cell };
  };

  const onPointerDown = (ev: React.MouseEvent) => {
    const { x, y } = localPos(ev);
    smartGuidesRef.current = [];
    // Game 视图：只做运行时交互（如 Button），不可点选编辑物体
    if (propsRef.current.tab === 'game') {
      if (ev.button === 0) {
        const ui = hitTestUi(uiItemsRef.current, x, y);
        if (ui?.slider?.interactable || ui?.scrollbar?.interactable) {
          focusedUiRef.current = ui.entity;
          focusedInputRef.current = null;
          const component = ui.slider ? 'Slider' : 'Scrollbar';
          const value = component === 'Slider'
            ? sliderValueAtPoint(ui, x, y)
            : scrollbarValueAtPoint(ui, x, y);
          if (value != null) {
            draggingRef.current = true;
            dragRef.current = {
              type: 'uiRange',
              lx: ev.clientX,
              ly: ev.clientY,
              entity: ui.entity,
              component,
            };
            propsRef.current.onBeginGesture();
            propsRef.current.onUiValueChange?.(
              ui.entity,
              component,
              { value },
              ui.slider?.onValueChanged ?? ui.scrollbar?.onValueChanged,
            );
          }
        } else if (
          ui?.button?.interactable
          || ui?.toggle?.interactable
          || ui?.input?.interactable
          || ui?.dropdown?.interactable
          || ui?.list?.interactable
          || ui?.tabs?.interactable
        ) {
          uiPressRef.current = ui.entity;
          focusedUiRef.current = ui.entity;
          focusedInputRef.current = ui.input?.interactable ? ui.entity : null;
        } else {
          focusedUiRef.current = null;
          focusedInputRef.current = null;
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
      if (ev.button === 1 || (ev.button === 0 && ev.altKey && !scene2DRef.current)) {
        draggingRef.current = true;
        dragRef.current = { type: 'pan', lx: ev.clientX, ly: ev.clientY };
        ev.preventDefault();
        return;
      }
      if (ev.button === 0) {
        const tilemapEntity = propsRef.current.selected == null
          ? undefined
          : propsRef.current.entities.find(
              (entity) => entity.entity === propsRef.current.selected && entity.components.Tilemap,
            );
        if (
          tilePaintEnabledRef.current
          && tilemapEntity
          && !propsRef.current.playing
          && scene2DRef.current
          && propsRef.current.onTilemapChange
        ) {
          const component = tilemapEntity.components.Tilemap as { cells?: unknown; sprites?: unknown };
          const source = normalizeTilemapData(component.cells, component.sprites);
          const cell = tileCellAt(tilemapEntity.entity, x, y);
          if (!cell) return;
          const tool = tileToolRef.current;
          if (tool === 'picker') {
            const sampled = tileAt(source, cell);
            if (sampled) setTileBrushSprite(sampled);
            ev.preventDefault();
            return;
          }
          if (tool === 'fill') {
            propsRef.current.onBeginGesture();
            const data = floodFillTiles(source, cell, tileBrushSpriteRef.current);
            propsRef.current.onTilemapChange(tilemapEntity.entity, data.cells, data.sprites);
            propsRef.current.onEndGesture();
            ev.preventDefault();
            return;
          }
          if (tool === 'box') {
            const erase = ev.shiftKey;
            propsRef.current.onBeginGesture();
            const data = boxTiles(source, cell, cell, tileBrushSpriteRef.current, erase);
            propsRef.current.onTilemapChange(tilemapEntity.entity, data.cells, data.sprites);
            draggingRef.current = true;
            dragRef.current = {
              type: 'tileBox',
              entity: tilemapEntity.entity,
              baseData: source,
              data,
              startCell: cell,
              erase,
              lastCell: `${cell[0]},${cell[1]}`,
              lx: ev.clientX,
              ly: ev.clientY,
            };
            ev.preventDefault();
            return;
          }
          const erase = tool === 'erase' || ev.shiftKey;
          propsRef.current.onBeginGesture();
          const result = paintTilemapAt(tilemapEntity.entity, x, y, erase, source);
          if (!result) {
            propsRef.current.onEndGesture();
            return;
          }
          draggingRef.current = true;
          dragRef.current = {
            type: 'tilePaint',
            entity: tilemapEntity.entity,
            data: result.data,
            erase,
            lastCell: result.cell,
            lx: ev.clientX,
            ly: ev.clientY,
          };
          ev.preventDefault();
          return;
        }
        const linePoint = hitTestLinePoint(linePointHitsRef.current, x, y);
        if (linePoint && propsRef.current.onLinePointChange) {
          draggingRef.current = true;
          dragRef.current = {
            type: 'linePoint',
            lx: ev.clientX,
            ly: ev.clientY,
            entity: linePoint.entity,
            index: linePoint.index,
          };
          propsRef.current.onBeginGesture();
          ev.preventDefault();
          return;
        }
        const hit = hitTest(x, y);
        if (hit?.kind === 'gizmo' && propsRef.current.selected != null) {
          const ent = propsRef.current.entities.find(
            (e) => e.entity === propsRef.current.selected,
          );

          // RectTransform 2D gizmo
          if (usingRectGizmoRef.current && ent?.components.RectTransform) {
            const item = uiItemsRef.current.find((it) => it.entity === ent.entity);
            const rt = readRectTransform(ent.components.RectTransform);
            const actualPivot = item
              ? (item.pivotScreen ?? rectPivot(item.rect, rt.pivot))
              : { x, y };
            const gizmoRect = item
              ? rectGizmoBounds(item, actualPivot, rt.pivot)
              : { x: actualPivot.x - 50, y: actualPivot.y - 50, w: 100, h: 100 };
            const anchorParent = item?.anchorParentRect ?? gizmoRect;
            const selectedRoots = selectedRectRoots(
              propsRef.current.entities,
              propsRef.current.selectedIds
                ?? (propsRef.current.selected == null ? [] : [propsRef.current.selected]),
            );
            const selectedRootSet = new Set(selectedRoots);
            const entityById = new Map(
              propsRef.current.entities.map((candidate) => [candidate.entity, candidate]),
            );
            const movingRect = rectBounds(
              uiItemsRef.current
                .filter((candidate) => selectedRootSet.has(candidate.entity))
                .map((candidate) => candidate.rect),
            );
            const editingLayoutHandle = scene2DRef.current
              && (pivotEditingRef.current || anchorEditingRef.current);
            const pivot = editingLayoutHandle
              ? actualPivot
              : rectHandlePivotForSelection(
                  propsRef.current.entities,
                  uiItemsRef.current,
                  propsRef.current.selectedIds ?? [propsRef.current.selected],
                  propsRef.current.selected,
                  propsRef.current.pivotMode,
                ) ?? actualPivot;
            const handleRotDeg = propsRef.current.gizmo === 'rect'
              || usesLocalHandleAxes(
                propsRef.current.gizmo,
                propsRef.current.handleOrientation,
              )
              ? rt.local_rotation
              : 0;
            const transformPivots = selectedRoots.flatMap((id) => {
              const candidate = uiItemsRef.current.find((uiItem) => uiItem.entity === id);
              const entity = propsRef.current.entities.find((value) => value.entity === id);
              if (!candidate || !entity?.components.RectTransform) return [];
              const candidateRect = readRectTransform(entity.components.RectTransform);
              return [{
                entity: id,
                point: candidate.pivotScreen ?? rectPivot(candidate.rect, candidateRect.pivot),
              }];
            });
            const smartGuides = smartGuidesEnabledRef.current
              && isRectMoveMode(propsRef.current.gizmo)
              && hit.part.kind === 'center'
              && movingRect
              ? {
                  startRect: movingRect,
                  candidates: uiItemsRef.current
                    .filter((candidate) => !inSelectedRectTree(
                      candidate.entity,
                      selectedRootSet,
                      entityById,
                    ))
                    .map((candidate) => candidate.rect),
                  applied: { x: 0, y: 0 },
                }
              : undefined;
            let lastAng: number | undefined;
            if (propsRef.current.gizmo === 'rotate') {
              lastAng = Math.atan2(y - pivot.y, x - pivot.x);
            }
            draggingRef.current = true;
            activeGizmoRef.current = hit.part;
            propsRef.current.onBeginGesture();
            const duplicateForDrag = ev.altKey
              && isRectMoveMode(propsRef.current.gizmo)
              && !pivotEditingRef.current
              && !anchorEditingRef.current
              && hit.part.kind !== 'size';
            const dragEntity = duplicateForDrag
              ? (propsRef.current.onDuplicateRectDrag?.() ?? propsRef.current.selected)
              : propsRef.current.selected;
            dragRef.current = {
              type: 'rectGizmo',
              part: hit.part,
              lx: ev.clientX,
              ly: ev.clientY,
              entity: dragEntity,
              pivot,
              rotDeg: rt.local_rotation,
              handleRotDeg,
              layoutScale: uiLayoutScaleRef.current || 1,
              pivotEditing: scene2DRef.current && pivotEditingRef.current,
              anchorEditing: scene2DRef.current && anchorEditingRef.current,
              pivotNorm: [...rt.pivot],
              rectSize: { w: gizmoRect.w, h: gizmoRect.h },
              rectScale: [...rt.local_scale],
              anchorMin: [...rt.anchor_min],
              anchorMax: [...rt.anchor_max],
              anchorParentSize: { w: anchorParent.w, h: anchorParent.h },
              smartGuides,
              transformPivots,
              lastAng,
              snap: createRectSnapDrag(
                snapSettingsRef.current.enabled || ev.ctrlKey || ev.metaKey,
                snapSettingsRef.current,
              ),
            };
            return;
          }

          const pointerWorldTransforms = buildWorldTransforms(propsRef.current.entities);
          const tr = ent
            ? (resolvedTransform(pointerWorldTransforms, ent.entity) ?? undefined)
            : undefined;
          const origin = transformHandleOrigin(
            propsRef.current.entities,
            propsRef.current.selectedIds ?? [propsRef.current.selected],
            propsRef.current.selected,
            propsRef.current.pivotMode,
          ) ?? (tr ? ([...tr.position] as Vec3) : [0, 0, 0]);
          const eye = orbitEye(
            liveCam.current.pivot,
            liveCam.current.yaw,
            liveCam.current.pitch,
            liveCam.current.distance,
          );
          const cam: Camera = { eye, target: liveCam.current.pivot, fovYDeg: 60 };
          const scr = project(origin, cam, lastVpRef.current);
          const handleRotation = usesLocalHandleAxes(
            propsRef.current.gizmo,
            propsRef.current.handleOrientation,
          ) ? tr?.rotation as [number, number, number, number] | undefined : null;
          const basis = transformBasis(handleRotation);
          let axisWorld: Vec3 | undefined;
          let lastAng: number | undefined;
          const transformMode = transformGizmoMode(propsRef.current.gizmo);
          if (transformMode === 'rotate' && hit.part.kind === 'axis') {
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
          } else if (transformMode === 'rotate' && scr) {
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
          propsRef.current.onPick(hit.id, {
            toggle: ev.ctrlKey || ev.metaKey,
            additive: ev.shiftKey,
          });
          return;
        }
        if (scene2DRef.current && !propsRef.current.playing) {
          draggingRef.current = true;
          dragRef.current = {
            type: 'marquee',
            lx: ev.clientX,
            ly: ev.clientY,
            startX: x,
            startY: y,
            toggle: ev.ctrlKey || ev.metaKey,
            additive: ev.shiftKey,
          };
          setMarquee(normalizeMarquee(x, y, x, y));
          ev.preventDefault();
          return;
        }
        if (!ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
          propsRef.current.onMarqueeSelect([], 'replace');
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
          canvas.style.cursor = ui?.slider
            ? 'ew-resize'
            : ui?.button || ui?.toggle || ui?.input || ui?.dropdown || ui?.list || ui?.tabs
              ? 'pointer'
              : 'default';
        } else if (propsRef.current.tab === 'scene' && !propsRef.current.playing) {
          if (tilePaintEnabledRef.current && propsRef.current.selected != null) {
            const selected = propsRef.current.entities.find(
              (entity) => entity.entity === propsRef.current.selected,
            );
            if (selected?.components.Tilemap) {
              hoverGizmoRef.current = null;
              canvas.style.cursor = tileToolRef.current === 'picker' ? 'copy' : 'crosshair';
              return;
            }
          }
          const linePoint = hitTestLinePoint(linePointHitsRef.current, x, y);
          if (linePoint) {
            hoverGizmoRef.current = null;
            canvas.style.cursor = 'move';
          } else {
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
      }

      if (!d) return;

      if (d.type === 'marquee') {
        const rect = canvas?.getBoundingClientRect();
        if (!rect) return;
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        d.lx = ev.clientX;
        d.ly = ev.clientY;
        setMarquee(normalizeMarquee(d.startX, d.startY, x, y));
        return;
      }

      if (d.type === 'uiRange') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const item = uiItemsRef.current.find((candidate) => candidate.entity === d.entity);
        if (item?.slider || item?.scrollbar) {
          const value = d.component === 'Slider'
            ? sliderValueAtPoint(item, x, y)
            : scrollbarValueAtPoint(item, x, y);
          if (value != null) {
            propsRef.current.onUiValueChange?.(
              item.entity,
              d.component,
              { value },
              item.slider?.onValueChanged ?? item.scrollbar?.onValueChanged,
            );
          }
        }
        d.lx = ev.clientX;
        d.ly = ev.clientY;
        return;
      }

      if (d.type === 'tileBox') {
        const rect = canvas?.getBoundingClientRect();
        if (!rect) return;
        const cell = tileCellAt(
          d.entity,
          ev.clientX - rect.left,
          ev.clientY - rect.top,
        );
        if (!cell) return;
        const cellKey = `${cell[0]},${cell[1]}`;
        if (cellKey !== d.lastCell) {
          d.data = boxTiles(
            d.baseData,
            d.startCell,
            cell,
            tileBrushSpriteRef.current,
            d.erase,
          );
          d.lastCell = cellKey;
          propsRef.current.onTilemapChange?.(d.entity, d.data.cells, d.data.sprites);
        }
        d.lx = ev.clientX;
        d.ly = ev.clientY;
        return;
      }

      if (d.type === 'tilePaint') {
        const rect = canvas?.getBoundingClientRect();
        if (!rect) return;
        const result = paintTilemapAt(
          d.entity,
          ev.clientX - rect.left,
          ev.clientY - rect.top,
          d.erase,
          d.data,
          d.lastCell,
        );
        if (result) {
          d.data = result.data;
          d.lastCell = result.cell;
        }
        d.lx = ev.clientX;
        d.ly = ev.clientY;
        return;
      }

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
      } else if (d.type === 'linePoint') {
        const entity = propsRef.current.entities.find((candidate) => candidate.entity === d.entity);
        const transform = entity
          ? (resolvedTransform(buildWorldTransforms(propsRef.current.entities), entity.entity) ?? undefined)
          : undefined;
        const line = entity?.components.Line2D as { points?: unknown } | undefined;
        const points = readLine2DPoints(line?.points);
        const point = points[d.index];
        if (!transform || !point) return;
        const eye = orbitEye(
          liveCam.current.pivot,
          liveCam.current.yaw,
          liveCam.current.pitch,
          liveCam.current.distance,
        );
        const cam: Camera = { eye, target: liveCam.current.pivot, fovYDeg: 60 };
        const rotation = transform.rotation as [number, number, number, number];
        const world = linePointWorld(
          point,
          transform.position as Vec3,
          transform.scale as Vec3,
          rotation,
        );
        const worldDelta = worldDeltaViewPlane(
          world,
          { dx, dy },
          cam,
          lastVpRef.current,
        );
        const localDelta = linePointDeltaFromWorld(
          worldDelta,
          transform.scale as Vec3,
          rotation,
        );
        propsRef.current.onLinePointChange?.(
          d.entity,
          moveLine2DPoint(points, d.index, localDelta),
        );
      } else if (d.type === 'rectGizmo') {
        const mode = propsRef.current.gizmo;
        const scale = d.layoutScale > 1e-6 ? d.layoutScale : 1;
        const localAxes = rectLocalAxes(d.rotDeg);
        const handleAxes = rectLocalAxes(d.handleRotDeg);
        const snapped = (
          channel: 'x' | 'y' | 'rotate' | 'scale',
          rawDelta: number,
          step: number,
        ) => {
          const next = advanceSnap(d.snap[channel], rawDelta, step, d.snap.active);
          d.snap[channel] = next.state;
          return next.delta;
        };

        if (d.anchorEditing && d.part.kind === 'anchor') {
          const deltaX = dx / Math.max(1, d.anchorParentSize.w);
          const deltaY = dy / Math.max(1, d.anchorParentSize.h);
          const moved = moveAnchorHandle(
            d.anchorMin,
            d.anchorMax,
            d.part.target,
            [deltaX, deltaY],
          );
          const nextMin = moved.anchorMin;
          const nextMax = moved.anchorMax;
          if (
            nextMin[0] !== d.anchorMin[0]
            || nextMin[1] !== d.anchorMin[1]
            || nextMax[0] !== d.anchorMax[0]
            || nextMax[1] !== d.anchorMax[1]
          ) {
            propsRef.current.onRectAnchors?.(
              d.entity,
              nextMin,
              nextMax,
              [
                d.anchorParentSize.w / scale,
                d.anchorParentSize.h / scale,
              ],
            );
            d.anchorMin = nextMin;
            d.anchorMax = nextMax;
          }
        } else if (d.pivotEditing && d.part.kind === 'center') {
          const deltaX = projectScreenDelta(dx, dy, localAxes.x) / Math.max(1, d.rectSize.w);
          const deltaY = -projectScreenDelta(dx, dy, localAxes.y) / Math.max(1, d.rectSize.h);
          const nextPivot: [number, number] = [
            Math.max(0, Math.min(1, d.pivotNorm[0] + deltaX)),
            Math.max(0, Math.min(1, d.pivotNorm[1] + deltaY)),
          ];
          if (nextPivot[0] !== d.pivotNorm[0] || nextPivot[1] !== d.pivotNorm[1]) {
            propsRef.current.onRectPivot?.(
              d.entity,
              nextPivot,
              [
                d.anchorParentSize.w / scale,
                d.anchorParentSize.h / scale,
              ],
            );
            d.pivotNorm = nextPivot;
          }
        } else if (d.part.kind === 'size') {
          const alongX = snapped(
            'x',
            projectScreenDelta(dx, dy, localAxes.x) / scale,
            d.snap.settings.move,
          );
          const alongY = snapped(
            'y',
            -projectScreenDelta(dx, dy, localAxes.y) / scale,
            d.snap.settings.move,
          );
          const plan = propsRef.current.onRectResize?.(
            d.entity,
            d.part.handle,
            alongX,
            alongY,
            {
              preserveAspect: ev.shiftKey,
              aroundPivot: ev.altKey,
              currentVisualSize: [
                d.rectSize.w / scale,
                d.rectSize.h / scale,
              ],
            },
          );
          if (plan) {
            d.rectSize.w = Math.max(1, d.rectSize.w + plan.visualSizeDelta[0] * scale);
            d.rectSize.h = Math.max(1, d.rectSize.h + plan.visualSizeDelta[1] * scale);
          }
        } else if (isRectMoveMode(mode)) {
          if (d.part.kind === 'axis') {
            const dir = d.part.axis === 'x' ? handleAxes.x : handleAxes.y;
            const along = rectAxisTranslationAmount(dx, dy, dir, scale);
            const amount = snapped(
              d.part.axis === 'x' ? 'x' : 'y',
              along,
              d.snap.settings.move,
            );
            const delta = rectTranslationAlongAxis(amount, dir);
            propsRef.current.onRectTranslate?.(d.entity, delta.dx, delta.dy);
          } else {
            const delta = screenRectTranslation(dx, dy, scale);
            if (d.smartGuides) {
              snapped('x', delta.dx, d.snap.settings.move);
              snapped('y', delta.dy, d.snap.settings.move);
              const plan = snapRectToGuides(
                d.smartGuides.startRect,
                d.smartGuides.candidates,
                {
                  x: d.snap.x.applied * scale,
                  y: d.snap.y.applied * scale,
                },
              );
              propsRef.current.onRectTranslate?.(
                d.entity,
                (plan.offset.x - d.smartGuides.applied.x) / scale,
                (plan.offset.y - d.smartGuides.applied.y) / scale,
              );
              d.smartGuides.applied = plan.offset;
              smartGuidesRef.current = plan.guides;
            } else {
              smartGuidesRef.current = [];
              propsRef.current.onRectTranslate?.(
                d.entity,
                snapped('x', delta.dx, d.snap.settings.move),
                snapped('y', delta.dy, d.snap.settings.move),
              );
            }
          }
        } else if (mode === 'scale') {
          let axis: 'x' | 'y' | 'both';
          let amount: number;
          if (d.part.kind === 'axis' && (d.part.axis === 'x' || d.part.axis === 'y')) {
            axis = d.part.axis;
            const dir = d.part.axis === 'x' ? localAxes.x : localAxes.y;
            const along = projectScreenDelta(dx, dy, dir);
            amount = snapped('scale', along / 80, d.snap.settings.scale);
          } else {
            axis = 'both';
            amount = snapped(
              'scale',
              (dx + -dy) / 160,
              d.snap.settings.scale,
            );
          }
          const factorX = axis === 'y'
            ? 1
            : Math.max(0.01, d.rectScale[0] + amount)
              / Math.max(0.01, d.rectScale[0]);
          const factorY = axis === 'x'
            ? 1
            : Math.max(0.01, d.rectScale[1] + amount)
              / Math.max(0.01, d.rectScale[1]);
          const deltas = d.transformPivots.map((entry) => {
            const next = scaleRectToolPoint(
              entry.point,
              d.pivot,
              d.rotDeg,
              factorX,
              factorY,
            );
            const delta = {
              entity: entry.entity,
              dx: (next.x - entry.point.x) / scale,
              dy: (next.y - entry.point.y) / scale,
              factorX,
              factorY,
            };
            entry.point = next;
            return delta;
          });
          propsRef.current.onRectScale?.(deltas);
          d.rectScale = [
            Math.max(0.01, d.rectScale[0] * factorX),
            Math.max(0.01, d.rectScale[1] * factorY),
          ];
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
          const degrees = snapped(
            'rotate',
            (-dAng * 180) / Math.PI,
            d.snap.settings.rotate,
          );
          const deltas = d.transformPivots.map((entry) => {
            const next = rotateRectToolPoint(entry.point, d.pivot, degrees);
            const delta = {
              entity: entry.entity,
              dx: (next.x - entry.point.x) / scale,
              dy: (next.y - entry.point.y) / scale,
              degrees,
            };
            entry.point = next;
            return delta;
          });
          propsRef.current.onRectRotate?.(deltas);
          d.rotDeg += degrees;
          if (propsRef.current.handleOrientation === 'local') d.handleRotDeg += degrees;
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
        const tr = ent
          ? (resolvedTransform(buildWorldTransforms(propsRef.current.entities), ent.entity) ?? undefined)
          : undefined;
        const origin = transformHandleOrigin(
          propsRef.current.entities,
          propsRef.current.selectedIds ?? [d.entity],
          d.entity,
          propsRef.current.pivotMode,
        ) ?? (tr?.position as Vec3 | undefined) ?? d.origin;
        const handleRotation = usesLocalHandleAxes(
          propsRef.current.gizmo,
          propsRef.current.handleOrientation,
        ) ? tr?.rotation as [number, number, number, number] | undefined : null;
        const basis = transformBasis(handleRotation);
        const gizmo = transformGizmoMode(propsRef.current.gizmo);
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
          propsRef.current.onGizmoScale(
            d.entity,
            d.origin,
            d.part.axis,
            axisVec,
            amount,
          );
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
              d.origin,
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
            propsRef.current.onRotateWorld?.(
              d.entity,
              d.origin,
              forward,
              (dAng * 180) / Math.PI,
            );
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
        if (ui && ui.entity === press) {
          if (ui.button?.interactable) {
            propsRef.current.onUiClick?.(ui.entity, ui.button.onClick);
          } else if (ui.toggle?.interactable) {
            propsRef.current.onUiValueChange?.(
              ui.entity,
              'Toggle',
              { is_on: !ui.toggle.isOn },
              ui.toggle.onValueChanged,
            );
          } else {
            const action = uiPointAction(ui, x, y);
            if (action) {
              propsRef.current.onUiValueChange?.(
                ui.entity,
                action.component,
                action.patch,
                action.callback,
              );
            }
          }
        }
      }
      uiPressRef.current = null;
      if (dragRef.current?.type === 'marquee' && canvasRef.current) {
        const drag = dragRef.current;
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const x = ev.clientX - canvasRect.left;
        const y = ev.clientY - canvasRect.top;
        const box = normalizeMarquee(drag.startX, drag.startY, x, y);
        const moved = Math.hypot(box.w, box.h) >= 5;
        if (moved) {
          const mode: MarqueeSelectionMode = drag.toggle
            ? 'toggle'
            : drag.additive
              ? 'add'
              : 'replace';
          propsRef.current.onMarqueeSelect(marqueeHitIds(uiItemsRef.current, box), mode);
        } else if (!drag.toggle && !drag.additive) {
          propsRef.current.onMarqueeSelect([], 'replace');
        }
        setMarquee(null);
      }
      if (dragRef.current?.type === 'orbit' || dragRef.current?.type === 'pan') {
        syncCamToStore();
      }
      if (
        dragRef.current?.type === 'gizmo'
        || dragRef.current?.type === 'rectGizmo'
        || dragRef.current?.type === 'linePoint'
        || dragRef.current?.type === 'tilePaint'
        || dragRef.current?.type === 'tileBox'
      ) {
        propsRef.current.onEndGesture();
      }
      if (dragRef.current?.type === 'uiRange') {
        propsRef.current.onEndGesture();
      }
      dragRef.current = null;
      draggingRef.current = false;
      activeGizmoRef.current = null;
      smartGuidesRef.current = [];
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onWheel = (ev: React.WheelEvent) => {
    if (propsRef.current.tab === 'game') {
      const { x, y } = localPos(ev);
      const ui = hitTestUi(uiItemsRef.current, x, y);
      if (ui?.list) {
        ev.preventDefault();
        const entity = propsRef.current.entities.find((candidate) => candidate.entity === ui.entity);
        const raw = entity?.components.ListView as Record<string, unknown> | undefined;
        const current = Number(raw?.scroll_offset ?? raw?.scrollOffset ?? 0);
        const itemHeight = Number(raw?.item_height ?? raw?.itemHeight ?? 32);
        propsRef.current.onUiValueChange?.(
          ui.entity,
          'ListView',
          { scroll_offset: Math.max(0, current + Math.sign(ev.deltaY) * itemHeight * 0.5) },
          ui.list.onValueChanged,
        );
      } else if (ui?.scroll) {
        ev.preventDefault();
        const current = ui.scroll.normalizedPosition;
        propsRef.current.onUiValueChange?.(
          ui.entity,
          'ScrollView',
          {
            normalized_position: [
              Math.max(0, Math.min(1, current[0] + Math.sign(ev.deltaX) * ui.scroll.scrollSensitivity)),
              Math.max(0, Math.min(1, current[1] + Math.sign(ev.deltaY) * ui.scroll.scrollSensitivity)),
            ],
          },
          ui.scroll.onValueChanged,
        );
      }
      return;
    }
    if (propsRef.current.tab !== 'scene') return;
    ev.preventDefault();
    const factor = ev.deltaY > 0 ? 1.12 : 0.9;
    liveCam.current.distance = Math.max(0.5, Math.min(200, liveCam.current.distance * factor));
    syncCamToStore();
  };

  const applyScene2D = (on: boolean) => {
    setScene2D(on);
    if (!on) setTilePaintEnabled(false);
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
        propsRef.current.gameResolution,
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

  const applySceneZoom = (targetScale: number) => {
    if (!scene2DRef.current) return;
    const target = normalizeSceneZoom(targetScale);
    liveCam.current.distance = distanceForSceneZoom(
      liveCam.current.distance,
      sceneCanvasScaleRef.current,
      target,
    );
    sceneCanvasScaleRef.current = target;
    const nextPercent = Math.round(target * 100);
    sceneZoomPercentRef.current = nextPercent;
    setSceneZoomPercent(nextPercent);
    syncCamToStore();
  };

  const updateSnapSettings = (patch: Partial<SceneSnapSettings>) => {
    const next = normalizeSceneSnapSettings({ ...snapSettingsRef.current, ...patch });
    snapSettingsRef.current = next;
    setSnapSettings(next);
    saveSceneSnap(next);
  };

  const toggleSceneGrid = () => {
    const next = !sceneGridRef.current;
    sceneGridRef.current = next;
    setSceneGrid(next);
    try {
      localStorage.setItem(SCENE_GRID_KEY, next ? '1' : '0');
    } catch {
      /* ignore unavailable storage */
    }
  };

  const toggleSmartGuides = () => {
    const next = !smartGuidesEnabledRef.current;
    smartGuidesEnabledRef.current = next;
    setSmartGuidesEnabled(next);
    if (!next) smartGuidesRef.current = [];
    try {
      localStorage.setItem(SCENE_SMART_GUIDES_KEY, next ? '1' : '0');
    } catch {
      /* ignore unavailable storage */
    }
  };

  const runRectAlignment = (command: RectAlignmentCommand) => {
    const current = propsRef.current;
    const roots = selectedRectRoots(
      current.entities,
      current.selectedIds ?? (current.selected == null ? [] : [current.selected]),
    ).filter((id) => !current.entities.find((entity) => entity.entity === id)?.components.Canvas);
    const screenDeltas = planRectAlignment(
      uiItemsRef.current,
      roots,
      current.selected,
      command,
    );
    const scale = uiLayoutScaleRef.current > 1e-6 ? uiLayoutScaleRef.current : 1;
    current.onRectAlign?.(screenDeltas.map((delta) => ({
      ...delta,
      dx: delta.dx / scale,
      dy: delta.dy / scale,
    })));
    setAlignOpen(false);
  };

  useEffect(() => {
    const heldNudgeKeys = new Set<string>();
    const endNudge = () => {
      if (!heldNudgeKeys.size) return;
      heldNudgeKeys.clear();
      propsRef.current.onEndGesture();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (propsRef.current.tab === 'game' && ev.key === 'Tab') {
        focusedUiRef.current = nextUiSelectable(
          uiItemsRef.current,
          focusedUiRef.current,
          ev.shiftKey,
        );
        focusedInputRef.current = null;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return;
      }
      const focused = focusedInputRef.current;
      if (propsRef.current.tab === 'game' && focused != null) {
        const item = uiItemsRef.current.find((candidate) => candidate.entity === focused);
        if (!item?.input?.interactable) {
          focusedInputRef.current = null;
          return;
        }
        let next = item.input.text;
        let callback = item.input.onValueChanged;
        if (ev.key === 'Backspace') {
          next = Array.from(next).slice(0, -1).join('');
        } else if (ev.key === 'Enter') {
          if (item.input.multiline) next += '\n';
          else focusedInputRef.current = null;
          callback = item.input.onSubmit;
        } else if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
          if (item.input.characterLimit <= 0 || Array.from(next).length < item.input.characterLimit) {
            next += ev.key;
          }
        } else if (ev.key === 'Escape') {
          focusedInputRef.current = null;
          return;
        } else {
          return;
        }
        ev.preventDefault();
        ev.stopImmediatePropagation();
        propsRef.current.onUiValueChange?.(focused, 'InputField', { text: next }, callback);
        return;
      }
      if (propsRef.current.tab === 'game' && focusedUiRef.current != null) {
        const item = uiItemsRef.current.find(
          (candidate) => candidate.entity === focusedUiRef.current,
        );
        if (!item) {
          focusedUiRef.current = null;
          return;
        }
        const action = uiNavigationAction(item, ev.key);
        if (action) {
          ev.preventDefault();
          ev.stopImmediatePropagation();
          if (action.kind === 'click') {
            propsRef.current.onUiClick?.(item.entity, action.callback);
          } else if (action.kind === 'focus-input') {
            focusedInputRef.current = item.entity;
          } else {
            propsRef.current.onUiValueChange?.(
              item.entity,
              action.component,
              action.patch,
              action.callback,
            );
          }
          return;
        }
      }
      if (propsRef.current.tab !== 'scene') return;
      const isSceneCanvas = ev.target === canvasRef.current;
      const isArrow =
        ev.key === 'ArrowLeft' ||
        ev.key === 'ArrowRight' ||
        ev.key === 'ArrowUp' ||
        ev.key === 'ArrowDown';
      if (isSceneCanvas && isArrow) {
        if (propsRef.current.playing) return;
        const ids = propsRef.current.selectedIds ?? (
          propsRef.current.selected == null ? [] : [propsRef.current.selected]
        );
        const hasRectSelection = ids.some((id) => propsRef.current.entities.some(
          (entity) => entity.entity === id && entity.components.RectTransform != null,
        ));
        if (!hasRectSelection) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (!heldNudgeKeys.size) propsRef.current.onBeginGesture();
        heldNudgeKeys.add(ev.key);
        const step = ev.shiftKey ? 10 : 1;
        const dx = ev.key === 'ArrowLeft' ? -step : ev.key === 'ArrowRight' ? step : 0;
        const dy = ev.key === 'ArrowUp' ? -step : ev.key === 'ArrowDown' ? step : 0;
        propsRef.current.onRectNudge?.(dx, dy);
        return;
      }
      if (ev.key === 'f' || ev.key === 'F') propsRef.current.onFrame();
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      if (!heldNudgeKeys.delete(ev.key)) return;
      if (!heldNudgeKeys.size) propsRef.current.onEndGesture();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', endNudge);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', endNudge);
      endNudge();
    };
  }, []);

  const alignableRectCount = selectedRectRoots(
    props.entities,
    props.selectedIds ?? (props.selected == null ? [] : [props.selected]),
  ).filter((id) => !props.entities.find((entity) => entity.entity === id)?.components.Canvas).length;
  const canEditPivot = scene2D && props.selected != null && props.entities.some(
    (entity) => entity.entity === props.selected
      && entity.components.RectTransform != null
      && entity.components.Canvas == null,
  );
  const canZoomScene = scene2D && props.entities.some(
    (entity) => entity.active !== false && entity.components.Canvas != null,
  );
  const selectedTilemap = props.selected == null
    ? undefined
    : props.entities.find(
        (entity) => entity.entity === props.selected && entity.components.Tilemap != null,
      );
  const tileBrushOptions = listSprites();

  const resolutionKey = gameResolutionKey(props.gameResolution);
  const presetResolution = GAME_RESOLUTION_PRESETS.some(
    (preset) => gameResolutionKey(preset.resolution) === resolutionKey,
  );
  const selectedResolutionOption = props.gameResolution
    ? presetResolution ? resolutionKey : 'custom'
    : 'free';

  return (
    <div className="viewport-wrap">
      {props.tab === 'scene' && (
        <div className="game-toolbar scene-toolbar">
          <div className="orient-toggle" title="2D：锁定正视 Canvas，仅平移/缩放">
            <button
              type="button"
              className={scene2D ? 'active' : ''}
              aria-label="Toggle 2D Scene mode"
              aria-pressed={scene2D}
              onClick={() => applyScene2D(!scene2D)}
            >
              2D
            </button>
          </div>
          <div className="scene-zoom" aria-label="2D Scene zoom">
            <button
              type="button"
              disabled={!canZoomScene}
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => applySceneZoom(sceneCanvasScaleRef.current / 1.25)}
            >
              -
            </button>
            <button
              type="button"
              disabled={!canZoomScene}
              className="scene-zoom-value"
              title="Reset Canvas to 1:1 pixels"
              onClick={() => applySceneZoom(1)}
            >
              {sceneZoomPercent}%
            </button>
            <button
              type="button"
              disabled={!canZoomScene}
              aria-label="Zoom in"
              title="Zoom in"
              onClick={() => applySceneZoom(sceneCanvasScaleRef.current * 1.25)}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className="scene-grid-toggle scene-icon-button"
            aria-label="Frame selected"
            disabled={props.selected == null}
            title="Frame Selected (F)"
            onClick={props.onFrame}
          >
            <Focus size={13} aria-hidden />
          </button>
          <button
            type="button"
            className={`scene-grid-toggle scene-icon-button${sceneGrid && scene2D ? ' active' : ''}`}
            aria-label="Toggle 2D grid"
            aria-pressed={sceneGrid && scene2D}
            disabled={!scene2D}
            title="Show the Canvas pixel grid using the Move Snap increment"
            onClick={toggleSceneGrid}
          >
            <Grid3X3 size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={`scene-grid-toggle scene-icon-button${tilePaintEnabled && selectedTilemap && scene2D ? ' active' : ''}`}
            aria-label="Toggle Tilemap paint brush"
            aria-pressed={tilePaintEnabled && !!selectedTilemap && scene2D}
            disabled={!selectedTilemap || props.playing}
            title="Enable Tilemap editing. Hold Shift with Paint or Box to erase."
            onClick={() => {
              if (!scene2D) applyScene2D(true);
              setTilePaintEnabled((enabled) => !enabled);
            }}
          >
            <Paintbrush size={14} aria-hidden />
          </button>
          {selectedTilemap && (
            <>
              <select
                className="tile-tool-select"
                aria-label="Tilemap edit tool"
                title="Tilemap edit tool"
                value={tileTool}
                onChange={(event) => setTileTool(event.target.value as TilemapTool)}
              >
                <option value="paint">Paint</option>
                <option value="erase">Erase</option>
                <option value="box">Box</option>
                <option value="fill">Fill</option>
                <option value="picker">Picker</option>
              </select>
              <select
                className="tile-brush-select"
                aria-label="Tile brush sprite"
                title="Sprite painted into Tilemap cells"
                value={tileBrushSprite}
                onChange={(event) => setTileBrushSprite(event.target.value)}
              >
                <option value="white">White</option>
                {tileBrushOptions.map((sprite) => (
                  <option key={sprite.id} value={sprite.id}>{sprite.name}</option>
                ))}
              </select>
            </>
          )}
          <button
            type="button"
            className={`scene-grid-toggle scene-icon-button${smartGuidesEnabled && scene2D ? ' active' : ''}`}
            aria-label="Toggle smart alignment guides"
            aria-pressed={smartGuidesEnabled && scene2D}
            disabled={!scene2D}
            title="Snap moved RectTransforms to Canvas and sibling edges or centers"
            onClick={toggleSmartGuides}
          >
            <ScanLine size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={`scene-grid-toggle scene-icon-button${pivotEditing && canEditPivot ? ' active' : ''}`}
            aria-label="Edit RectTransform pivot"
            aria-pressed={pivotEditing && canEditPivot}
            disabled={!canEditPivot}
            title="Drag the selected RectTransform pivot without moving its rectangle"
            onClick={() => setPivotEditing((editing) => {
              const next = !editing;
              if (next) setAnchorEditing(false);
              return next;
            })}
          >
            <CircleDot size={14} aria-hidden />
          </button>
          <button
            type="button"
            className={`scene-grid-toggle scene-icon-button${anchorEditing && canEditPivot ? ' active' : ''}`}
            aria-label="Edit RectTransform anchors"
            aria-pressed={anchorEditing && canEditPivot}
            disabled={!canEditPivot}
            title="Drag fixed or stretched anchors while preserving the rectangle"
            onClick={() => setAnchorEditing((editing) => {
              const next = !editing;
              if (next) setPivotEditing(false);
              return next;
            })}
          >
            <Anchor size={14} aria-hidden />
          </button>
          <div className="scene-snap" ref={snapSettingsElementRef}>
            <div className="scene-snap-buttons">
              <button
                type="button"
                className={snapSettings.enabled ? 'active' : ''}
                aria-label="Toggle snapping"
                aria-pressed={snapSettings.enabled}
                title="Snap RectTransform tools (Ctrl/Cmd enables it for one drag)"
                onClick={() => updateSnapSettings({ enabled: !snapSettings.enabled })}
              >
                <Magnet size={14} aria-hidden />
              </button>
              <button
                type="button"
                className={snapSettingsOpen ? 'active' : ''}
                aria-label="Snap settings"
                aria-expanded={snapSettingsOpen}
                title="Snap settings"
                onClick={() => setSnapSettingsOpen((open) => !open)}
              >
                <ChevronDown size={12} aria-hidden />
              </button>
            </div>
            {snapSettingsOpen && (
              <div className="scene-snap-popup" role="dialog" aria-label="Scene Snapping">
                <strong>RectTransform Snapping</strong>
                <label>
                  Move
                  <input
                    type="number"
                    min="0.01"
                    step="1"
                    value={snapSettings.move}
                    onChange={(event) => updateSnapSettings({ move: Number(event.target.value) })}
                  />
                  <span>px</span>
                </label>
                <label>
                  Rotate
                  <input
                    type="number"
                    min="0.1"
                    step="1"
                    value={snapSettings.rotate}
                    onChange={(event) => updateSnapSettings({ rotate: Number(event.target.value) })}
                  />
                  <span>°</span>
                </label>
                <label>
                  Scale
                  <input
                    type="number"
                    min="0.01"
                    step="0.05"
                    value={snapSettings.scale}
                    onChange={(event) => updateSnapSettings({ scale: Number(event.target.value) })}
                  />
                </label>
                <small>Ctrl/Cmd: snap the current drag</small>
              </div>
            )}
          </div>
          <div className="scene-align" ref={alignElementRef}>
            <button
              type="button"
              aria-label="Align RectTransforms"
              aria-expanded={alignOpen}
              disabled={alignableRectCount < 2}
              className={alignOpen ? 'active' : ''}
              title="Align selected RectTransforms to the primary selection"
              onClick={() => setAlignOpen((open) => !open)}
            >
              <AlignHorizontalSpaceAround size={14} aria-hidden />
              <ChevronDown size={11} aria-hidden />
            </button>
            {alignOpen && (
              <div className="scene-align-popup" role="dialog" aria-label="Rect Alignment">
                <strong>Align to Primary</strong>
                <div className="scene-align-grid">
                  {([
                    ['left', 'Left'],
                    ['center', 'H Center'],
                    ['right', 'Right'],
                    ['top', 'Top'],
                    ['middle', 'V Center'],
                    ['bottom', 'Bottom'],
                  ] as Array<[RectAlignmentCommand, string]>).map(([command, label]) => (
                    <button type="button" key={command} onClick={() => runRectAlignment(command)}>
                      {label}
                    </button>
                  ))}
                </div>
                <strong>Distribute</strong>
                <div className="scene-align-grid distribute">
                  <button
                    type="button"
                    disabled={alignableRectCount < 3}
                    onClick={() => runRectAlignment('distribute-horizontal')}
                  >
                    Horizontal
                  </button>
                  <button
                    type="button"
                    disabled={alignableRectCount < 3}
                    onClick={() => runRectAlignment('distribute-vertical')}
                  >
                    Vertical
                  </button>
                </div>
              </div>
            )}
          </div>
          <span className="game-hint">
            {scene2D
              ? '正视 Canvas · Ctrl/Shift Click 多选 · Arrows 1px / Shift 10px · F 聚焦 · RMB/MMB 平移'
              : 'RMB 旋转 · MMB/Alt+LMB 平移 · Wheel 缩放 · F 聚焦'}
          </span>
        </div>
      )}
      {props.tab === 'game' && (
        <div className="game-toolbar">
          <label>
            Resolution
            <select
              value={selectedResolutionOption}
              onChange={(event) => {
                if (event.target.value === 'free') {
                  props.onGameResolution(null);
                  return;
                }
                if (event.target.value === 'custom') return;
                props.onGameResolution(normalizeGameResolution(event.target.value));
              }}
            >
              <option value="free">Free Aspect</option>
              {GAME_RESOLUTION_PRESETS.map((preset) => (
                <option
                  key={gameResolutionKey(preset.resolution)}
                  value={gameResolutionKey(preset.resolution)}
                >
                  {preset.label}
                </option>
              ))}
              {props.gameResolution && !presetResolution && <option value="custom">Custom</option>}
            </select>
          </label>
          {props.gameResolution && (
            <div className="game-resolution-fields">
              <label>W <input
                aria-label="Game resolution width"
                type="number"
                min={1}
                max={16_384}
                value={props.gameResolution.width}
                onChange={(event) => {
                  const width = Math.trunc(Number(event.target.value));
                  if (width >= 1) props.onGameResolution({ ...props.gameResolution!, width });
                }}
              /></label>
              <span>×</span>
              <label>H <input
                aria-label="Game resolution height"
                type="number"
                min={1}
                max={16_384}
                value={props.gameResolution.height}
                onChange={(event) => {
                  const height = Math.trunc(Number(event.target.value));
                  if (height >= 1) props.onGameResolution({ ...props.gameResolution!, height });
                }}
              /></label>
              <span className="game-orientation-label">
                {gameResolutionOrientation(props.gameResolution)}
              </span>
            </div>
          )}
          <span className="game-hint">Uses Main Camera · no Scene gizmos</span>
          <span className="game-hint">UI {uiStats.elements} elements · {uiStats.batches} batches</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        data-scene-viewport={props.tab === 'scene' ? 'true' : undefined}
        tabIndex={0}
        aria-label={props.tab === 'scene' ? 'Scene viewport' : 'Game viewport'}
        onMouseDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          onPointerDown(event);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={onWheel}
        onDragEnter={(event) => {
          if (
            props.tab !== 'scene'
            || props.playing
            || !Array.from(event.dataTransfer.types).includes('text/mengine-sprite')
          ) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
          setSpriteDropActive(true);
        }}
        onDragOver={(event) => {
          if (
            props.tab !== 'scene'
            || props.playing
            || !Array.from(event.dataTransfer.types).includes('text/mengine-sprite')
          ) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
          setSpriteDropActive(true);
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          setSpriteDropActive(false);
        }}
        onDrop={(event) => {
          setSpriteDropActive(false);
          if (props.tab !== 'scene' || props.playing) return;
          const path = event.dataTransfer.getData('text/mengine-sprite');
          if (!path) return;
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          props.onInstantiateSprite(
            path,
            sceneDropWorldPoint(event.clientX - rect.left, event.clientY - rect.top),
          );
        }}
        style={{ cursor: props.tab === 'scene' ? 'crosshair' : 'default', width: '100%', height: '100%' }}
      />
      {props.tab === 'scene' && spriteDropActive && (
        <div className="scene-sprite-drop-overlay" aria-hidden>
          Drop to create SpriteRenderer
        </div>
      )}
      {props.tab === 'scene' && marquee && (
        <div
          className="scene-marquee"
          aria-hidden
          style={{
            left: marquee.x,
            top: (canvasRef.current?.offsetTop ?? 0) + marquee.y,
            width: marquee.w,
            height: marquee.h,
          }}
        />
      )}
      {props.tab === 'scene' && (
        <div className="viewport-overlay">
          Scene{scene2D ? ' 2D' : ''}
          <br />
          {scene2D
            ? 'Pan · Zoom · Rect gizmos · Box select'
            : 'Orbit · Pan · Zoom · F frame'}
        </div>
      )}
    </div>
  );
}
