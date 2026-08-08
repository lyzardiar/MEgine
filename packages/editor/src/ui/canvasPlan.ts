import type { GameResolution } from '../gameResolution.ts';
import {
  normalizeCanvasWorkspacePreferences,
  type CanvasArtboardPreset,
  type CanvasSafeArea,
  type CanvasWorkspacePreferences,
} from '../canvasWorkspace.ts';
import { canvasScaleFactor, readRectTransform, type Rect } from './rectLayout.ts';
import { layoutUiOverlay, type UiDrawItem, type UiEnt } from './uiLayout.ts';
import { layoutUiText } from './uiTextLayout.ts';

export type CanvasDiagnosticCode =
  | 'OUTSIDE_ARTBOARD'
  | 'SAFE_AREA_OVERFLOW'
  | 'CLIPPED_BY_MASK'
  | 'ZERO_SIZE'
  | 'TEXT_OVERFLOW'
  | 'NON_UNIT_RECT_SCALE'
  | 'TARGET_DISPLAY_MISMATCH';

export type CanvasPlanBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasPlanDiagnostic = {
  id: string;
  code: CanvasDiagnosticCode;
  severity: 'error' | 'warning' | 'info';
  entity: number;
  artboardKey: string;
  bounds: CanvasPlanBounds;
  reason: string;
};

export type CanvasPlanItem = {
  entity: number;
  name: string;
  parent: number | null;
  canvasBatchRoot: number;
  role: 'canvas' | 'graphic';
  graphicType: string;
  bounds: CanvasPlanBounds;
  clip: CanvasPlanBounds | null;
  rotation: number;
  pivot: [number, number];
  depth: number;
  opacity: number;
  material: string;
  shaderChannels: number;
  interaction: {
    blocksRaycasts: boolean;
    raycastTarget: boolean;
    interactable: boolean | null;
  };
  text: null | {
    content: string;
    font: string;
    fontSize: number;
    dynamicPixelsPerUnit: number;
    measurementBounds: CanvasPlanBounds;
    overflow: boolean;
  };
};

export type CanvasArtboardPlan = {
  key: string;
  label: string;
  width: number;
  height: number;
  safeArea: CanvasSafeArea | null;
  canvasScale: number;
  targetDisplay: number;
  items: CanvasPlanItem[];
  diagnostics: CanvasPlanDiagnostic[];
};

export type CanvasPlanPage = {
  sceneRevision: number;
  planRevision: string;
  canvasEntity: number;
  artboards: Array<{
    key: string;
    label: string;
    width: number;
    height: number;
    safeArea: CanvasSafeArea | null;
    canvasScale: number;
    itemCount: number;
    diagnosticCount: number;
  }>;
  artboard: Omit<CanvasArtboardPlan, 'items' | 'diagnostics'> & {
    itemCount: number;
    diagnosticCount: number;
  };
  offset: number;
  limit: number;
  items: CanvasPlanItem[];
  diagnostics: CanvasPlanDiagnostic[];
  diagnosticsTruncated: boolean;
  nextOffset: number | null;
};

const DIAGNOSTIC_LIMIT = 500;
const EPSILON = 0.01;

function canvasRenderMode(entity: UiEnt): string {
  const canvas = entity.components.Canvas as Record<string, unknown> | undefined;
  return String(canvas?.render_mode ?? canvas?.renderMode ?? 'ScreenSpaceOverlay');
}

function isScreenCanvas(entity: UiEnt): boolean {
  if (!entity.components.Canvas) return false;
  const mode = canvasRenderMode(entity);
  return mode === 'ScreenSpaceOverlay' || mode === 'ScreenSpaceCamera';
}

export function screenSpaceCanvasEntities(entities: readonly UiEnt[]): UiEnt[] {
  return entities.filter(isScreenCanvas);
}

function ancestorCanvas(
  entitiesById: ReadonlyMap<number, UiEnt>,
  entity: UiEnt | undefined,
): UiEnt | null {
  let current = entity;
  while (current) {
    if (isScreenCanvas(current)) return current;
    current = current.parent == null ? undefined : entitiesById.get(current.parent);
  }
  return null;
}

export function resolveCanvasPlanEntity(
  entities: readonly UiEnt[],
  requestedCanvas: number | null | undefined,
  selectedIds: readonly number[] = [],
): number | null {
  const entitiesById = new Map(entities.map((entity) => [entity.entity, entity]));
  if (requestedCanvas != null) {
    const requested = entitiesById.get(requestedCanvas);
    return requested && isScreenCanvas(requested) ? requested.entity : null;
  }
  for (const selectedId of selectedIds) {
    const canvas = ancestorCanvas(entitiesById, entitiesById.get(selectedId));
    if (canvas) return canvas.entity;
  }
  return screenSpaceCanvasEntities(entities)[0]?.entity ?? null;
}

function descendantsOf(entities: readonly UiEnt[], root: number): Set<number> {
  const result = new Set<number>([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entity of entities) {
      if (result.has(entity.entity) || entity.parent == null || !result.has(entity.parent)) continue;
      result.add(entity.entity);
      changed = true;
    }
  }
  return result;
}

export function canvasPlanEntityIds(
  entities: readonly UiEnt[],
  canvasEntity: number,
): Set<number> {
  return descendantsOf(entities, canvasEntity);
}

function bounds(rect: Rect): CanvasPlanBounds {
  return { x: rect.x, y: rect.y, width: rect.w, height: rect.h };
}

function rotatedBounds(item: UiDrawItem): CanvasPlanBounds {
  if (Math.abs(item.rotation) < EPSILON) return bounds(item.rect);
  const pivotX = item.rect.x + item.rect.w * item.pivot[0];
  const pivotY = item.rect.y + item.rect.h * item.pivot[1];
  const radians = item.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners = [
    [item.rect.x, item.rect.y],
    [item.rect.x + item.rect.w, item.rect.y],
    [item.rect.x + item.rect.w, item.rect.y + item.rect.h],
    [item.rect.x, item.rect.y + item.rect.h],
  ].map(([x, y]) => ({
    x: pivotX + (x - pivotX) * cosine - (y - pivotY) * sine,
    y: pivotY + (x - pivotX) * sine + (y - pivotY) * cosine,
  }));
  const left = Math.min(...corners.map((corner) => corner.x));
  const right = Math.max(...corners.map((corner) => corner.x));
  const top = Math.min(...corners.map((corner) => corner.y));
  const bottom = Math.max(...corners.map((corner) => corner.y));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function contains(container: CanvasPlanBounds, child: CanvasPlanBounds): boolean {
  return child.x >= container.x - EPSILON
    && child.y >= container.y - EPSILON
    && child.x + child.width <= container.x + container.width + EPSILON
    && child.y + child.height <= container.y + container.height + EPSILON;
}

function graphicType(item: UiDrawItem): string {
  if (item.role === 'canvas') return 'Canvas';
  if (item.spine) return 'SpineSkeleton';
  if (item.effekseer) return 'EffekseerEffect';
  if (item.button) return 'Button';
  if (item.toggle) return 'Toggle';
  if (item.slider) return 'Slider';
  if (item.scrollbar) return 'Scrollbar';
  if (item.input) return 'InputField';
  if (item.dropdown) return 'Dropdown';
  if (item.list) return 'List';
  if (item.scroll) return 'ScrollView';
  if (item.tabs) return 'Tabs';
  if (item.progress) return 'ProgressBar';
  if (item.text) return 'Text';
  if (item.rawImage) return 'RawImage';
  if (item.image) return 'Image';
  if (item.panel) return 'Panel';
  return 'RectTransform';
}

function itemMaterial(item: UiDrawItem): string {
  return item.image?.material
    ?? item.rawImage?.material
    ?? item.text?.material
    ?? item.panel?.material
    ?? '';
}

function itemRaycastTarget(item: UiDrawItem): boolean {
  return item.image?.raycastTarget
    ?? item.rawImage?.raycastTarget
    ?? item.text?.raycastTarget
    ?? item.panel?.raycastTarget
    ?? item.graphicRaycastTarget
    ?? false;
}

function itemInteractable(item: UiDrawItem): boolean | null {
  return item.button?.interactable
    ?? item.toggle?.interactable
    ?? item.slider?.interactable
    ?? item.scrollbar?.interactable
    ?? item.input?.interactable
    ?? item.dropdown?.interactable
    ?? item.list?.interactable
    ?? item.tabs?.interactable
    ?? null;
}

function textPlan(item: UiDrawItem): CanvasPlanItem['text'] {
  const text = item.text;
  if (!text) return null;
  const layout = layoutUiText(text.text, {
    width: Math.max(0, item.rect.w),
    height: Math.max(0, item.rect.h),
    fontSize: text.fontSize,
    fontStyle: text.fontStyle,
    alignByGeometry: text.alignByGeometry,
    supportRichText: text.supportRichText,
    bestFit: text.bestFit,
    minSize: text.minSize,
    maxSize: text.maxSize,
    fontScale: text.fontScale,
    lineSpacing: text.lineSpacing,
    horizontalOverflow: text.horizontalOverflow,
    verticalOverflow: text.verticalOverflow,
    alignment: text.alignment,
    verticalAlign: text.verticalAlign,
  });
  const left = layout.lines.length
    ? Math.min(...layout.lines.map((line) => line.x))
    : 0;
  const right = layout.lines.length
    ? Math.max(...layout.lines.map((line) => line.x + line.width))
    : 0;
  const top = layout.lines.length
    ? Math.min(...layout.lines.map((line) => line.y))
    : 0;
  const bottom = layout.lines.length
    ? Math.max(...layout.lines.map((line) => line.y + line.height))
    : 0;
  const overflow = layout.truncated
    || left < -EPSILON
    || top < -EPSILON
    || right > item.rect.w + EPSILON
    || bottom > item.rect.h + EPSILON;
  return {
    content: text.text,
    font: text.font,
    fontSize: layout.fontSize,
    dynamicPixelsPerUnit: text.dynamicPixelsPerUnit,
    measurementBounds: {
      x: item.rect.x + left,
      y: item.rect.y + top,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    },
    overflow,
  };
}

function serializeItem(
  item: UiDrawItem,
  entity: UiEnt | undefined,
): CanvasPlanItem {
  return {
    entity: item.entity,
    name: entity?.name ?? `Entity ${item.entity}`,
    parent: entity?.parent ?? null,
    canvasBatchRoot: item.canvasBatchRoot,
    role: item.role,
    graphicType: graphicType(item),
    bounds: rotatedBounds(item),
    clip: item.clip ? bounds(item.clip) : null,
    rotation: item.rotation,
    pivot: [...item.pivot],
    depth: item.depth,
    opacity: item.opacity,
    material: itemMaterial(item),
    shaderChannels: item.canvasShaderChannels,
    interaction: {
      blocksRaycasts: item.blocksRaycasts === true,
      raycastTarget: itemRaycastTarget(item),
      interactable: itemInteractable(item),
    },
    text: textPlan(item),
  };
}

function diagnostic(
  artboardKey: string,
  code: CanvasDiagnosticCode,
  severity: CanvasPlanDiagnostic['severity'],
  item: CanvasPlanItem,
  reason: string,
): CanvasPlanDiagnostic {
  return {
    id: `${artboardKey}:${code}:${item.entity}`,
    code,
    severity,
    entity: item.entity,
    artboardKey,
    bounds: item.bounds,
    reason,
  };
}

function diagnoseItems(
  items: readonly CanvasPlanItem[],
  entitiesById: ReadonlyMap<number, UiEnt>,
  artboard: CanvasArtboardPreset,
  targetDisplay: number,
): CanvasPlanDiagnostic[] {
  const diagnostics: CanvasPlanDiagnostic[] = [];
  const artboardBounds = { x: 0, y: 0, width: artboard.width, height: artboard.height };
  const safeArea = artboard.safeArea ?? null;
  for (const item of items) {
    const entity = entitiesById.get(item.entity);
    if (item.role === 'canvas') {
      const canvas = entity?.components.Canvas as Record<string, unknown> | undefined;
      const authored = Number(canvas?.target_display ?? canvas?.targetDisplay ?? 0);
      const canvasDisplay = Number.isFinite(authored) ? Math.max(0, Math.trunc(authored)) : 0;
      if (canvasDisplay !== targetDisplay) {
        diagnostics.push(diagnostic(
          artboard.key,
          'TARGET_DISPLAY_MISMATCH',
          'error',
          item,
          `Canvas targets Display ${canvasDisplay + 1}, while this workspace previews Display ${targetDisplay + 1}.`,
        ));
      }
      continue;
    }
    if (item.bounds.width <= EPSILON || item.bounds.height <= EPSILON) {
      diagnostics.push(diagnostic(
        artboard.key,
        'ZERO_SIZE',
        'error',
        item,
        'RectTransform resolves to zero width or height.',
      ));
    }
    if (!contains(artboardBounds, item.bounds)) {
      diagnostics.push(diagnostic(
        artboard.key,
        'OUTSIDE_ARTBOARD',
        'warning',
        item,
        `Bounds exceed the ${artboard.width} × ${artboard.height} artboard.`,
      ));
    }
    const meaningfulForSafeArea = item.text != null
      || item.interaction.raycastTarget
      || item.interaction.interactable != null;
    if (safeArea && meaningfulForSafeArea && !contains(safeArea, item.bounds)) {
      diagnostics.push(diagnostic(
        artboard.key,
        'SAFE_AREA_OVERFLOW',
        'warning',
        item,
        'Interactive or textual content extends outside the configured safe area.',
      ));
    }
    if (item.clip && !contains(item.clip, item.bounds)) {
      diagnostics.push(diagnostic(
        artboard.key,
        'CLIPPED_BY_MASK',
        'info',
        item,
        'Rendered bounds are partially or fully clipped by an ancestor mask.',
      ));
    }
    if (item.text?.overflow) {
      diagnostics.push(diagnostic(
        artboard.key,
        'TEXT_OVERFLOW',
        'warning',
        item,
        'Measured text exceeds its RectTransform or is truncated.',
      ));
    }
    const rect = readRectTransform(entity?.components.RectTransform);
    if (
      Math.abs(rect.local_scale[0] - 1) > EPSILON
      || Math.abs(rect.local_scale[1] - 1) > EPSILON
    ) {
      diagnostics.push(diagnostic(
        artboard.key,
        'NON_UNIT_RECT_SCALE',
        'info',
        item,
        `RectTransform scale is ${rect.local_scale[0]} × ${rect.local_scale[1]}; prefer size and offsets for UI layout.`,
      ));
    }
  }
  return diagnostics;
}

export function buildCanvasArtboardPlan(
  entities: readonly UiEnt[],
  canvasEntity: number,
  artboard: CanvasArtboardPreset,
  targetDisplay = 0,
): CanvasArtboardPlan {
  const entitiesById = new Map(entities.map((entity) => [entity.entity, entity]));
  const canvas = entitiesById.get(canvasEntity);
  if (!canvas || !isScreenCanvas(canvas)) {
    throw new Error(`Entity ${canvasEntity} is not a screen-space Canvas`);
  }
  const subtree = descendantsOf(entities, canvasEntity);
  const drawItems = layoutUiOverlay(
    [...entities],
    { x: 0, y: 0, w: artboard.width, h: artboard.height },
    new Set(),
    { w: artboard.width, h: artboard.height },
    undefined,
    null,
  ).filter((item) => subtree.has(item.entity));
  const items = drawItems.map((item) => serializeItem(item, entitiesById.get(item.entity)));
  const canvasSettings = canvas.components.Canvas as Record<string, unknown>;
  const rawDisplay = Number(canvasSettings.target_display ?? canvasSettings.targetDisplay ?? 0);
  const canvasTargetDisplay = Number.isFinite(rawDisplay) ? Math.max(0, Math.trunc(rawDisplay)) : 0;
  return {
    key: artboard.key,
    label: artboard.label,
    width: artboard.width,
    height: artboard.height,
    safeArea: artboard.safeArea ? { ...artboard.safeArea } : null,
    canvasScale: canvasScaleFactor(
      canvas.components.CanvasScaler,
      artboard.width,
      artboard.height,
    ),
    targetDisplay: canvasTargetDisplay,
    items,
    diagnostics: diagnoseItems(items, entitiesById, artboard, targetDisplay),
  };
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function planHash(value: unknown): string {
  const input = stableJson(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193);
    right = Math.imul(right ^ (code + index), 0x85ebca6b);
  }
  return `${(left >>> 0).toString(16).padStart(8, '0')}${
    (right >>> 0).toString(16).padStart(8, '0')
  }`;
}

export function buildCanvasPlanPage(options: {
  entities: readonly UiEnt[];
  selectedIds?: readonly number[];
  sceneRevision: number;
  gameResolution: GameResolution | null;
  gameDisplay: number;
  preferences: CanvasWorkspacePreferences;
  canvasEntity?: number | null;
  artboardKey?: string | null;
  offset?: number;
  limit?: number;
}): CanvasPlanPage | null {
  const preferences = normalizeCanvasWorkspacePreferences(
    options.preferences,
    options.gameResolution,
  );
  const canvasEntity = resolveCanvasPlanEntity(
    options.entities,
    options.canvasEntity,
    options.selectedIds,
  );
  if (canvasEntity == null) return null;
  const plans = preferences.artboards.map((artboard) => buildCanvasArtboardPlan(
    options.entities,
    canvasEntity,
    artboard,
    options.gameDisplay,
  ));
  const requestedKey = options.artboardKey ?? preferences.activeKey;
  const selected = plans.find((plan) => plan.key === requestedKey) ?? plans[0];
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  const limit = Math.max(1, Math.min(500, Math.trunc(options.limit ?? 200)));
  const planRevision = `canvas-plan-v1-${options.sceneRevision}-${planHash({
    canvasEntity,
    activeKey: preferences.activeKey,
    artboards: preferences.artboards,
    gameDisplay: options.gameDisplay,
  })}`;
  const items = selected.items.slice(offset, offset + limit);
  return {
    sceneRevision: options.sceneRevision,
    planRevision,
    canvasEntity,
    artboards: plans.map((plan) => ({
      key: plan.key,
      label: plan.label,
      width: plan.width,
      height: plan.height,
      safeArea: plan.safeArea,
      canvasScale: plan.canvasScale,
      itemCount: plan.items.length,
      diagnosticCount: plan.diagnostics.length,
    })),
    artboard: {
      key: selected.key,
      label: selected.label,
      width: selected.width,
      height: selected.height,
      safeArea: selected.safeArea,
      canvasScale: selected.canvasScale,
      targetDisplay: selected.targetDisplay,
      itemCount: selected.items.length,
      diagnosticCount: selected.diagnostics.length,
    },
    offset,
    limit,
    items,
    diagnostics: selected.diagnostics.slice(0, DIAGNOSTIC_LIMIT),
    diagnosticsTruncated: selected.diagnostics.length > DIAGNOSTIC_LIMIT,
    nextOffset: offset + items.length < selected.items.length
      ? offset + items.length
      : null,
  };
}
