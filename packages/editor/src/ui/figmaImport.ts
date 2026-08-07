import {
  createUiButtonComponents,
  createUiDropdownComponents,
  createUiImageComponents,
  createUiInputFieldComponents,
  createUiPanelComponents,
  createUiRawImageComponents,
  createUiScrollViewComponents,
  createUiSliderComponents,
  createUiTextComponents,
  createUiToggleComponents,
} from '../componentCatalog.ts';
import { defaultRectTransform } from './rectLayout.ts';

export const FIGMA_IMPORT_SCHEMA_VERSION = 1;
export const FIGMA_IMPORT_MAX_NODES = 1_000;

export const FIGMA_COMPONENT_KINDS = [
  'button',
  'toggle',
  'slider',
  'input_field',
  'dropdown',
  'scroll_view',
  'panel',
  'image',
  'raw_image',
  'text',
] as const;

export type FigmaComponentKind = typeof FIGMA_COMPONENT_KINDS[number];
export type FigmaColor = [number, number, number, number];

export interface FigmaImportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaImportTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  textAlignVertical?: 'TOP' | 'CENTER' | 'BOTTOM';
  lineHeightPx?: number;
  textAutoResize?: 'NONE' | 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'TRUNCATE';
}

export interface FigmaImportLayout {
  mode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  wrap?: 'NO_WRAP' | 'WRAP';
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  primaryAlign?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAlign?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  sizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  sizingVertical?: 'FIXED' | 'HUG' | 'FILL';
}

export interface FigmaImportConstraints {
  horizontal?: 'LEFT' | 'RIGHT' | 'CENTER' | 'LEFT_RIGHT' | 'SCALE';
  vertical?: 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE';
}

export interface FigmaImportNode {
  id: string;
  parentId: string | null;
  name: string;
  type: string;
  componentId?: string;
  visible?: boolean;
  opacity?: number;
  rotation?: number;
  clipsContent?: boolean;
  bounds?: FigmaImportBounds;
  fillColor?: FigmaColor;
  strokeColor?: FigmaColor;
  strokeWeight?: number;
  cornerRadius?: number;
  characters?: string;
  textStyle?: FigmaImportTextStyle;
  layout?: FigmaImportLayout;
  constraints?: FigmaImportConstraints;
  requiresRasterization?: boolean;
  rasterizeReason?: string;
}

export interface FigmaImportSource {
  schemaVersion: 1;
  fileKey: string;
  fileName: string;
  version: string;
  rootId: string;
  rootName: string;
  truncated?: boolean;
  nodes: FigmaImportNode[];
}

export interface FigmaImportOptions {
  componentMappings?: Record<string, FigmaComponentKind>;
  assetPaths?: Record<string, string>;
  maxNodes?: number;
}

export interface FigmaImportDiagnostic {
  code:
    | 'ASSET_REQUIRED'
    | 'MISSING_BOUNDS'
    | 'INVALID_HIERARCHY'
    | 'FONT_REQUIRES_PROJECT_ASSET'
    | 'UNMAPPED_COMPONENT'
    | 'UNSUPPORTED_AUTO_LAYOUT_WRAP'
    | 'UNSUPPORTED_GRID_LAYOUT'
    | 'UNSUPPORTED_CORNER_CLIP'
    | 'TRUNCATED_NODE_LIMIT';
  severity: 'info' | 'warning' | 'error';
  nodeId: string;
  message: string;
}

export interface FigmaUiPlanNode {
  sourceNodeId: string;
  parentSourceNodeId: string | null;
  name: string;
  kind: 'container' | 'panel' | 'image' | 'raw_image' | 'text' | FigmaComponentKind;
  components: Record<string, unknown>;
}

export interface FigmaUiImportPlan {
  schemaVersion: 1;
  planRevision: string;
  source: {
    fileKey: string;
    fileName: string;
    version: string;
    rootId: string;
    rootName: string;
  };
  nodes: FigmaUiPlanNode[];
  assets: Array<{ nodeId: string; name: string; reason: string }>;
  diagnostics: FigmaImportDiagnostic[];
  readyToImport: boolean;
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: unknown): number {
  return Math.max(0, finite(value));
}

function clamp01(value: unknown, fallback = 1): number {
  return Math.min(1, Math.max(0, finite(value, fallback)));
}

function color(value: FigmaColor | undefined, fallback: FigmaColor): FigmaColor {
  if (!value || value.length !== 4) return [...fallback];
  return [
    clamp01(value[0], fallback[0]),
    clamp01(value[1], fallback[1]),
    clamp01(value[2], fallback[2]),
    clamp01(value[3], fallback[3]),
  ];
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

function fixedRect(bounds: FigmaImportBounds, root: boolean) {
  return defaultRectTransform({
    anchor_min: root ? [0.5, 0.5] : [0, 1],
    anchor_max: root ? [0.5, 0.5] : [0, 1],
    pivot: [0.5, 0.5],
    anchored_position: root
      ? [0, 0]
      : [bounds.x + bounds.width / 2, -(bounds.y + bounds.height / 2)],
    size_delta: [bounds.width, bounds.height],
  });
}

function constrainedRect(
  node: FigmaImportNode,
  parent: FigmaImportNode | undefined,
  root: boolean,
) {
  const bounds = node.bounds!;
  if (root || !parent?.bounds) return fixedRect(bounds, root);
  const parentBounds = parent.bounds;
  const local = {
    x: bounds.x - parentBounds.x,
    y: bounds.y - parentBounds.y,
    width: bounds.width,
    height: bounds.height,
  };
  const horizontal = node.constraints?.horizontal ?? 'LEFT';
  const vertical = node.constraints?.vertical ?? 'TOP';
  let anchorMinX = 0;
  let anchorMaxX = 0;
  let anchoredX = local.x + local.width / 2;
  let sizeX = local.width;
  if (horizontal === 'RIGHT') {
    anchorMinX = 1;
    anchorMaxX = 1;
    anchoredX = local.x + local.width / 2 - parentBounds.width;
  } else if (horizontal === 'CENTER') {
    anchorMinX = 0.5;
    anchorMaxX = 0.5;
    anchoredX = local.x + local.width / 2 - parentBounds.width / 2;
  } else if (horizontal === 'LEFT_RIGHT') {
    anchorMaxX = 1;
    anchoredX = local.x + local.width / 2 - parentBounds.width / 2;
    sizeX = local.width - parentBounds.width;
  } else if (horizontal === 'SCALE' && parentBounds.width > 0) {
    anchorMinX = local.x / parentBounds.width;
    anchorMaxX = (local.x + local.width) / parentBounds.width;
    anchoredX = 0;
    sizeX = 0;
  }
  let anchorMinY = 1;
  let anchorMaxY = 1;
  let anchoredY = -(local.y + local.height / 2);
  let sizeY = local.height;
  if (vertical === 'BOTTOM') {
    anchorMinY = 0;
    anchorMaxY = 0;
    anchoredY = parentBounds.height - local.y - local.height / 2;
  } else if (vertical === 'CENTER') {
    anchorMinY = 0.5;
    anchorMaxY = 0.5;
    anchoredY = parentBounds.height / 2 - local.y - local.height / 2;
  } else if (vertical === 'TOP_BOTTOM') {
    anchorMinY = 0;
    anchoredY = parentBounds.height / 2 - local.y - local.height / 2;
    sizeY = local.height - parentBounds.height;
  } else if (vertical === 'SCALE' && parentBounds.height > 0) {
    anchorMinY = 1 - (local.y + local.height) / parentBounds.height;
    anchorMaxY = 1 - local.y / parentBounds.height;
    anchoredY = 0;
    sizeY = 0;
  }
  return defaultRectTransform({
    anchor_min: [anchorMinX, anchorMinY],
    anchor_max: [anchorMaxX, anchorMaxY],
    pivot: [0.5, 0.5],
    anchored_position: [anchoredX, anchoredY],
    size_delta: [sizeX, sizeY],
    local_rotation: finite(node.rotation),
  });
}

function childAlignment(layout: FigmaImportLayout): string {
  const primary = layout.primaryAlign ?? 'MIN';
  const counter = layout.counterAlign ?? 'MIN';
  const vertical = layout.mode === 'VERTICAL';
  const horizontalPart = (vertical ? counter : primary) === 'CENTER'
    ? 'Center'
    : (vertical ? counter : primary) === 'MAX' ? 'Right' : 'Left';
  const verticalPart = (vertical ? primary : counter) === 'CENTER'
    ? 'Middle'
    : (vertical ? primary : counter) === 'MAX' ? 'Lower' : 'Upper';
  return `${verticalPart}${horizontalPart}`;
}

function applyLayout(
  components: Record<string, unknown>,
  node: FigmaImportNode,
  diagnostics: FigmaImportDiagnostic[],
) {
  const layout = node.layout;
  if (!layout || !layout.mode || layout.mode === 'NONE') return;
  if (layout.mode === 'GRID') {
    diagnostics.push({
      code: 'UNSUPPORTED_GRID_LAYOUT',
      severity: 'warning',
      nodeId: node.id,
      message: 'Figma Grid auto layout is kept as fixed RectTransforms in this import.',
    });
    return;
  }
  if (layout.wrap === 'WRAP') {
    diagnostics.push({
      code: 'UNSUPPORTED_AUTO_LAYOUT_WRAP',
      severity: 'warning',
      nodeId: node.id,
      message: 'Figma wrapping has no exact LayoutGroup equivalent; children remain in one row or column.',
    });
  }
  const primarySpaceBetween = layout.primaryAlign === 'SPACE_BETWEEN';
  components.LayoutGroup = {
    direction: layout.mode === 'HORIZONTAL' ? 'Horizontal' : 'Vertical',
    padding: [
      nonNegative(layout.paddingLeft),
      nonNegative(layout.paddingTop),
      nonNegative(layout.paddingRight),
      nonNegative(layout.paddingBottom),
    ],
    spacing: [nonNegative(layout.itemSpacing), nonNegative(layout.itemSpacing)],
    cell_size: [100, 100],
    child_alignment: childAlignment(layout),
    child_control_width: true,
    child_control_height: true,
    child_force_expand: primarySpaceBetween,
    child_force_expand_width: primarySpaceBetween && layout.mode === 'HORIZONTAL',
    child_force_expand_height: primarySpaceBetween && layout.mode === 'VERTICAL',
    use_child_scale_width: false,
    use_child_scale_height: false,
    reverse_arrangement: false,
    start_corner: 'UpperLeft',
    start_axis: layout.mode === 'HORIZONTAL' ? 'Horizontal' : 'Vertical',
    constraint: 'Flexible',
    constraint_count: 1,
  };
  const horizontalFit = layout.sizingHorizontal === 'HUG' ? 'PreferredSize' : 'Unconstrained';
  const verticalFit = layout.sizingVertical === 'HUG' ? 'PreferredSize' : 'Unconstrained';
  if (horizontalFit !== 'Unconstrained' || verticalFit !== 'Unconstrained') {
    components.ContentSizeFitter = {
      horizontal_fit: horizontalFit,
      vertical_fit: verticalFit,
    };
  }
}

function mappedComponents(kind: FigmaComponentKind, text: string): Record<string, unknown> {
  switch (kind) {
    case 'button': return createUiButtonComponents();
    case 'toggle': return createUiToggleComponents();
    case 'slider': return createUiSliderComponents();
    case 'input_field': return createUiInputFieldComponents();
    case 'dropdown': return createUiDropdownComponents();
    case 'scroll_view': return createUiScrollViewComponents();
    case 'panel': return createUiPanelComponents();
    case 'image': return createUiImageComponents();
    case 'raw_image': return createUiRawImageComponents();
    case 'text': return createUiTextComponents(text);
  }
}

function firstText(
  nodeId: string,
  children: ReadonlyMap<string, FigmaImportNode[]>,
): string {
  const pending = [...(children.get(nodeId) ?? [])];
  while (pending.length > 0) {
    const node = pending.shift()!;
    if (node.type === 'TEXT' && node.characters?.trim()) return node.characters.trim();
    pending.push(...(children.get(node.id) ?? []));
  }
  return '';
}

function baseComponents(
  node: FigmaImportNode,
  mapped: FigmaComponentKind | undefined,
  label: string,
  assetPath: string | undefined,
): { kind: FigmaUiPlanNode['kind']; components: Record<string, unknown> } {
  const fill = color(node.fillColor, [0, 0, 0, 0]);
  let kind: FigmaUiPlanNode['kind'];
  let components: Record<string, unknown>;
  if (mapped) {
    kind = mapped;
    components = mappedComponents(mapped, label || node.name);
  } else if (node.type === 'TEXT') {
    kind = 'text';
    components = createUiTextComponents(node.characters ?? '');
  } else if (node.requiresRasterization) {
    kind = 'raw_image';
    components = createUiRawImageComponents();
  } else if (node.type === 'RECTANGLE' || node.type === 'ELLIPSE') {
    kind = 'image';
    components = createUiImageComponents(fill);
  } else if (fill[3] > 0.001) {
    kind = 'panel';
    components = createUiPanelComponents();
  } else {
    kind = 'container';
    components = {};
  }
  if (components.Panel && typeof components.Panel === 'object') {
    components.Panel = {
      ...(components.Panel as Record<string, unknown>),
      color: fill,
      border_color: color(node.strokeColor, [0, 0, 0, 0]),
      border_width: nonNegative(node.strokeWeight),
    };
  }
  if (components.Image && typeof components.Image === 'object') {
    components.Image = {
      ...(components.Image as Record<string, unknown>),
      color: fill[3] > 0 ? fill : [1, 1, 1, 1],
      raycast_target: mapped === 'button',
    };
  }
  if (components.RawImage && typeof components.RawImage === 'object') {
    components.RawImage = {
      ...(components.RawImage as Record<string, unknown>),
      texture: assetPath ?? 'white',
      raycast_target: false,
    };
  }
  if (components.Text && typeof components.Text === 'object') {
    const style = node.textStyle ?? {};
    const size = Math.min(512, Math.max(1, finite(style.fontSize, 16)));
    const weight = finite(style.fontWeight, 400);
    components.Text = {
      ...(components.Text as Record<string, unknown>),
      text: node.characters ?? label,
      color: color(node.fillColor, [1, 1, 1, 1]),
      font_size: size,
      font_style: weight >= 600
        ? (style.italic ? 'BoldAndItalic' : 'Bold')
        : (style.italic ? 'Italic' : 'Normal'),
      alignment: style.textAlignHorizontal === 'RIGHT'
        ? 'Right'
        : style.textAlignHorizontal === 'CENTER' ? 'Center' : 'Left',
      vertical_align: style.textAlignVertical === 'BOTTOM'
        ? 'Bottom'
        : style.textAlignVertical === 'CENTER' ? 'Middle' : 'Top',
      line_spacing: style.lineHeightPx && size > 0
        ? Math.min(10, Math.max(0.1, style.lineHeightPx / size))
        : 1,
    };
  }
  if (components.Button && typeof components.Button === 'object') {
    components.Button = { ...(components.Button as Record<string, unknown>), label: label || node.name };
  }
  if (components.Toggle && typeof components.Toggle === 'object') {
    components.Toggle = { ...(components.Toggle as Record<string, unknown>), label: label || node.name };
  }
  if (node.clipsContent) components.RectMask2D = { enabled: true, padding: [0, 0, 0, 0], softness: [0, 0] };
  const opacity = clamp01(node.opacity, 1);
  if (opacity < 0.999) {
    components.CanvasGroup = {
      alpha: opacity,
      interactable: true,
      blocks_raycasts: true,
      ignore_parent_groups: false,
    };
  }
  return { kind, components };
}

function layoutElement(node: FigmaImportNode): Record<string, unknown> | null {
  const horizontal = node.layout?.sizingHorizontal;
  const vertical = node.layout?.sizingVertical;
  if (!horizontal && !vertical) return null;
  return {
    ignore_layout: false,
    min_width: -1,
    min_height: -1,
    preferred_width: horizontal === 'FIXED' ? node.bounds?.width ?? -1 : -1,
    preferred_height: vertical === 'FIXED' ? node.bounds?.height ?? -1 : -1,
    flexible_width: horizontal === 'FILL' ? 1 : -1,
    flexible_height: vertical === 'FILL' ? 1 : -1,
  };
}

export function buildFigmaUiImportPlan(
  source: FigmaImportSource,
  options: FigmaImportOptions = {},
): FigmaUiImportPlan {
  const diagnostics: FigmaImportDiagnostic[] = [];
  const assets: FigmaUiImportPlan['assets'] = [];
  const duplicateIds = source.nodes
    .map((node) => node.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  for (const id of [...new Set(duplicateIds)]) {
    diagnostics.push({
      code: 'INVALID_HIERARCHY',
      severity: 'error',
      nodeId: id,
      message: `Figma import source contains duplicate node id ${id}.`,
    });
  }
  const inputById = new Map(source.nodes.map((node) => [node.id, node]));
  const children = new Map<string, FigmaImportNode[]>();
  for (const node of source.nodes) {
    if (node.parentId == null) continue;
    const bucket = children.get(node.parentId) ?? [];
    bucket.push(node);
    children.set(node.parentId, bucket);
  }
  const root = inputById.get(source.rootId);
  const maxNodes = Math.min(
    FIGMA_IMPORT_MAX_NODES,
    Math.max(1, Math.trunc(options.maxNodes ?? FIGMA_IMPORT_MAX_NODES)),
  );
  const ordered: FigmaImportNode[] = [];
  const visited = new Set<string>();
  const visit = (node: FigmaImportNode) => {
    if (ordered.length >= maxNodes || node.visible === false) return;
    if (visited.has(node.id)) {
      diagnostics.push({
        code: 'INVALID_HIERARCHY',
        severity: 'error',
        nodeId: node.id,
        message: `Figma import hierarchy contains a cycle at node ${node.id}.`,
      });
      return;
    }
    visited.add(node.id);
    ordered.push(node);
    const mapped = node.componentId
      ? options.componentMappings?.[node.componentId]
      : undefined;
    const collapse = mapped != null && !['panel', 'scroll_view'].includes(mapped);
    if (collapse) return;
    for (const child of children.get(node.id) ?? []) visit(child);
  };
  if (root) visit(root);
  else {
    diagnostics.push({
      code: 'INVALID_HIERARCHY',
      severity: 'error',
      nodeId: source.rootId,
      message: `Figma import root ${source.rootId} is not present in nodes.`,
    });
  }
  if (source.truncated || (ordered.length >= maxNodes && source.nodes.length > ordered.length)) {
    diagnostics.push({
      code: 'TRUNCATED_NODE_LIMIT',
      severity: 'warning',
      nodeId: source.rootId,
      message: `Import was capped at ${maxNodes} visible nodes.`,
    });
  }
  const included = new Set(ordered.map((node) => node.id));
  const planNodes: FigmaUiPlanNode[] = [];
  for (const node of ordered) {
    if (!node.bounds || node.bounds.width <= 0 || node.bounds.height <= 0) {
      diagnostics.push({
        code: 'MISSING_BOUNDS',
        severity: 'error',
        nodeId: node.id,
        message: `"${node.name}" has no positive render bounds.`,
      });
      continue;
    }
    const mapped = node.componentId
      ? options.componentMappings?.[node.componentId]
      : undefined;
    if (node.type === 'INSTANCE' && node.componentId && !mapped) {
      diagnostics.push({
        code: 'UNMAPPED_COMPONENT',
        severity: 'warning',
        nodeId: node.id,
        message: `Figma component ${node.componentId} is imported visually; add an explicit component mapping for game interaction.`,
      });
    }
    if (node.type === 'TEXT' && node.textStyle?.fontFamily?.trim()) {
      diagnostics.push({
        code: 'FONT_REQUIRES_PROJECT_ASSET',
        severity: 'warning',
        nodeId: node.id,
        message: `Figma font "${node.textStyle.fontFamily.trim()}" requires a matching imported MEngine font asset.`,
      });
    }
    if (node.clipsContent && nonNegative(node.cornerRadius) > 0) {
      diagnostics.push({
        code: 'UNSUPPORTED_CORNER_CLIP',
        severity: 'warning',
        nodeId: node.id,
        message: 'Rounded clipping is approximated by RectMask2D.',
      });
    }
    const assetPath = options.assetPaths?.[node.id];
    if (node.requiresRasterization) {
      assets.push({
        nodeId: node.id,
        name: node.name,
        reason: node.rasterizeReason || 'complex visual',
      });
      if (!assetPath) {
        diagnostics.push({
          code: 'ASSET_REQUIRED',
          severity: 'info',
          nodeId: node.id,
          message: `"${node.name}" requires a Figma PNG export before import.`,
        });
      }
    }
    const label = firstText(node.id, children);
    const result = baseComponents(node, mapped, label, assetPath);
    result.components.RectTransform = constrainedRect(
      node,
      node.parentId == null ? undefined : inputById.get(node.parentId),
      node.id === source.rootId,
    );
    const element = layoutElement(node);
    if (element) result.components.LayoutElement = element;
    applyLayout(result.components, node, diagnostics);
    const parentSourceNodeId = node.id === source.rootId
      ? null
      : (node.parentId && included.has(node.parentId) ? node.parentId : source.rootId);
    planNodes.push({
      sourceNodeId: node.id,
      parentSourceNodeId,
      name: node.name.trim().slice(0, 128) || node.type,
      kind: result.kind,
      components: result.components,
    });
  }
  const planRevision = `figma-plan-v1-${planHash({
    source,
    componentMappings: options.componentMappings ?? {},
    maxNodes,
  })}`;
  return {
    schemaVersion: FIGMA_IMPORT_SCHEMA_VERSION,
    planRevision,
    source: {
      fileKey: source.fileKey,
      fileName: source.fileName,
      version: source.version,
      rootId: source.rootId,
      rootName: source.rootName,
    },
    nodes: planNodes,
    assets: [...new Map(assets.map((asset) => [asset.nodeId, asset])).values()],
    diagnostics,
    readyToImport: planNodes.length > 0 && !diagnostics.some((entry) => entry.severity === 'error'),
  };
}
