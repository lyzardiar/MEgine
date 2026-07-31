export type ButtonVisualState = 'Normal' | 'Highlighted' | 'Pressed' | 'Selected' | 'Disabled';

export type ButtonColorBlock = {
  normal: [number, number, number, number];
  highlighted: [number, number, number, number];
  pressed: [number, number, number, number];
  selected: [number, number, number, number];
  disabled: [number, number, number, number];
  multiplier: number;
  fadeDuration: number;
};

export type ButtonTintTween = {
  state: ButtonVisualState;
  start: [number, number, number, number];
  current: [number, number, number, number];
  target: [number, number, number, number];
  startedAt: number;
  duration: number;
};

const clampColor = (value: unknown, fallback: [number, number, number, number]) => {
  if (!Array.isArray(value) || value.length < 4) return [...fallback] as typeof fallback;
  return value.slice(0, 4).map((channel, index) => {
    const parsed = Number(channel);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback[index];
  }) as [number, number, number, number];
};

export function readButtonColorBlock(value: Record<string, unknown>): ButtonColorBlock {
  const multiplier = Number(value.color_multiplier ?? value.colorMultiplier ?? 1);
  const fadeDuration = Number(value.fade_duration ?? value.fadeDuration ?? 0.1);
  return {
    normal: clampColor(value.normal_color ?? value.normalColor, [1, 1, 1, 1]),
    highlighted: clampColor(value.highlighted_color ?? value.highlightedColor, [0.9607843, 0.9607843, 0.9607843, 1]),
    pressed: clampColor(value.pressed_color ?? value.pressedColor, [0.7843137, 0.7843137, 0.7843137, 1]),
    selected: clampColor(value.selected_color ?? value.selectedColor, [0.9607843, 0.9607843, 0.9607843, 1]),
    disabled: clampColor(value.disabled_color ?? value.disabledColor, [0.5215686, 0.5215686, 0.5215686, 0.5019608]),
    multiplier: Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1,
    fadeDuration: Number.isFinite(fadeDuration) ? Math.max(0, fadeDuration) : 0.1,
  };
}

export function buttonVisualState(
  interactable: boolean,
  hovered: boolean,
  pressed: boolean,
  selected: boolean,
): ButtonVisualState {
  if (!interactable) return 'Disabled';
  if (pressed && hovered) return 'Pressed';
  if (hovered) return 'Highlighted';
  if (selected) return 'Selected';
  return 'Normal';
}

export function buttonTargetTint(
  block: ButtonColorBlock,
  state: ButtonVisualState,
): [number, number, number, number] {
  const source = block[state.toLowerCase() as Lowercase<ButtonVisualState>];
  return source.map((channel) => Math.max(0, channel * block.multiplier)) as [number, number, number, number];
}

export function advanceButtonTint(
  previous: ButtonTintTween | undefined,
  state: ButtonVisualState,
  block: ButtonColorBlock,
  now: number,
): ButtonTintTween {
  const target = buttonTargetTint(block, state);
  if (!previous) {
    return { state, start: target, current: target, target, startedAt: now, duration: block.fadeDuration };
  }
  const elapsed = Math.max(0, now - previous.startedAt);
  const progress = previous.duration <= 0 ? 1 : Math.min(1, elapsed / previous.duration);
  const sampled = previous.start.map((channel, index) => (
    channel + (previous.target[index] - channel) * progress
  )) as [number, number, number, number];
  if (previous.state !== state || previous.target.some((channel, index) => channel !== target[index])) {
    return {
      state,
      start: sampled,
      current: block.fadeDuration <= 0 ? target : sampled,
      target,
      startedAt: now,
      duration: block.fadeDuration,
    };
  }
  return { ...previous, current: sampled };
}

export function multiplyButtonTint(
  color: [number, number, number, number],
  tint: [number, number, number, number],
): [number, number, number, number] {
  return color.map((channel, index) => Math.max(0, channel * tint[index])) as [number, number, number, number];
}
