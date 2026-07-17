import type { Vec2 } from './rectLayout';

export type RectTransformValue = {
  anchor_min: Vec2;
  anchor_max: Vec2;
  pivot: Vec2;
  anchored_position: Vec2;
  size_delta: Vec2;
  local_rotation: number;
  local_scale: Vec2;
};

export type AnchorPreset = {
  key: string;
  label: string;
  anchorMin: Vec2;
  anchorMax: Vec2;
  pivot: Vec2;
};

const horizontal = [
  { key: 'left', label: 'Left', min: 0, max: 0, pivot: 0 },
  { key: 'center', label: 'Center', min: 0.5, max: 0.5, pivot: 0.5 },
  { key: 'right', label: 'Right', min: 1, max: 1, pivot: 1 },
  { key: 'stretch', label: 'Stretch', min: 0, max: 1, pivot: 0.5 },
] as const;

const vertical = [
  { key: 'top', label: 'Top', min: 0, max: 0, pivot: 0 },
  { key: 'middle', label: 'Middle', min: 0.5, max: 0.5, pivot: 0.5 },
  { key: 'bottom', label: 'Bottom', min: 1, max: 1, pivot: 1 },
  { key: 'stretch', label: 'Stretch', min: 0, max: 1, pivot: 0.5 },
] as const;

export const ANCHOR_PRESETS: AnchorPreset[] = vertical.flatMap((v) =>
  horizontal.map((h) => ({
    key: `${v.key}-${h.key}`,
    label: `${v.label} ${h.label}`,
    anchorMin: [h.min, v.min],
    anchorMax: [h.max, v.max],
    pivot: [h.pivot, v.pivot],
  })),
);

export function applyAnchorPreset(
  value: RectTransformValue,
  preset: AnchorPreset,
  options: { setPivot?: boolean; snap?: boolean } = {},
): RectTransformValue {
  const next: RectTransformValue = {
    ...value,
    anchor_min: [...preset.anchorMin],
    anchor_max: [...preset.anchorMax],
    pivot: [...value.pivot],
    anchored_position: [...value.anchored_position],
    size_delta: [...value.size_delta],
    local_scale: [...value.local_scale],
  };
  if (options.setPivot) next.pivot = [...preset.pivot];
  if (options.snap) {
    next.anchored_position = [0, 0];
    for (const axis of [0, 1] as const) {
      if (preset.anchorMin[axis] !== preset.anchorMax[axis]) {
        next.size_delta[axis] = 0;
      }
    }
  }
  return next;
}

export type RectAxisFields = {
  stretched: boolean;
  firstLabel: string;
  secondLabel: string;
  first: number;
  second: number;
};

export function readRectAxis(value: RectTransformValue, axis: 0 | 1): RectAxisFields {
  const stretched = value.anchor_min[axis] !== value.anchor_max[axis];
  if (!stretched) {
    return {
      stretched: false,
      firstLabel: axis === 0 ? 'X' : 'Y',
      secondLabel: axis === 0 ? 'W' : 'H',
      first: value.anchored_position[axis],
      second: value.size_delta[axis],
    };
  }
  const pivot = value.pivot[axis];
  const size = value.size_delta[axis];
  return {
    stretched: true,
    firstLabel: axis === 0 ? 'L' : 'T',
    secondLabel: axis === 0 ? 'R' : 'B',
    first: value.anchored_position[axis] - size * pivot,
    second: -(value.anchored_position[axis] + size * (1 - pivot)),
  };
}

export function writeRectAxis(
  value: RectTransformValue,
  axis: 0 | 1,
  slot: 0 | 1,
  nextValue: number,
): RectTransformValue {
  const next: RectTransformValue = {
    ...value,
    anchor_min: [...value.anchor_min],
    anchor_max: [...value.anchor_max],
    pivot: [...value.pivot],
    anchored_position: [...value.anchored_position],
    size_delta: [...value.size_delta],
    local_scale: [...value.local_scale],
  };
  const current = readRectAxis(value, axis);
  if (!current.stretched) {
    if (slot === 0) next.anchored_position[axis] = nextValue;
    else next.size_delta[axis] = nextValue;
    return next;
  }

  const start = slot === 0 ? nextValue : current.first;
  const end = slot === 1 ? nextValue : current.second;
  const rawEnd = -end;
  const size = rawEnd - start;
  next.size_delta[axis] = size;
  next.anchored_position[axis] = start + size * next.pivot[axis];
  return next;
}
