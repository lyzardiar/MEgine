export type AnimatorParameterKind = 'bool' | 'float' | 'int' | 'trigger';
export type AnimatorConditionMode =
  | 'if'
  | 'if_not'
  | 'greater'
  | 'less'
  | 'equals'
  | 'not_equal'
  | 'trigger';
export type AnimatorLayerBlendMode = 'override' | 'additive';

export type AnimatorParameter = {
  name: string;
  kind: AnimatorParameterKind;
  default_bool: boolean;
  default_float: number;
  default_int: number;
};

export type AnimatorState = {
  name: string;
  clip: string;
  speed: number;
  position: [number, number];
};

export type AnimatorCondition = {
  parameter: string;
  mode: AnimatorConditionMode;
  threshold: number;
};

export type AnimatorTransition = {
  from: string;
  to: string;
  duration: number;
  has_exit_time: boolean;
  exit_time: number;
  conditions: AnimatorCondition[];
};

export type AnimatorLayerMotion = {
  state: string;
  clip: string;
};

export type AnimatorLayer = {
  name: string;
  enabled: boolean;
  weight: number;
  blend_mode: AnimatorLayerBlendMode;
  mask_paths: string[];
  motions: AnimatorLayerMotion[];
};

export type AnimatorController = {
  version: 2;
  name: string;
  default_state: string;
  parameters: AnimatorParameter[];
  states: AnimatorState[];
  transitions: AnimatorTransition[];
  layers: AnimatorLayer[];
};

export type AnimatorParameterValue = boolean | number;

const PARAMETER_KINDS = new Set<AnimatorParameterKind>(['bool', 'float', 'int', 'trigger']);
const CONDITION_MODES = new Set<AnimatorConditionMode>([
  'if', 'if_not', 'greater', 'less', 'equals', 'not_equal', 'trigger',
]);
const LAYER_BLEND_MODES = new Set<AnimatorLayerBlendMode>(['override', 'additive']);

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function parameterDefault(parameter: AnimatorParameter): AnimatorParameterValue {
  if (parameter.kind === 'bool' || parameter.kind === 'trigger') return parameter.default_bool;
  if (parameter.kind === 'int') return parameter.default_int;
  return parameter.default_float;
}

function parameterValue(parameter: AnimatorParameter, value: unknown): AnimatorParameterValue {
  if (parameter.kind === 'bool' || parameter.kind === 'trigger') {
    return typeof value === 'boolean' ? value : parameterDefault(parameter);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return parameterDefault(parameter);
  return parameter.kind === 'int' ? Math.trunc(value) : value;
}

function parameterOverrideObject(json: string): Record<string, unknown> {
  try {
    const value = JSON.parse(json);
    return value != null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeMaskPath(value: unknown): string {
  const path = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (path === '.' || path === '*') return path;
  return path.split('/').map((segment) => segment.trim()).filter((segment) => segment && segment !== '.').join('/');
}

export function animatorParameterValues(
  controller: AnimatorController,
  json: string,
): Record<string, AnimatorParameterValue> {
  const overrides = parameterOverrideObject(json);
  return Object.fromEntries(controller.parameters.map((parameter) => [
    parameter.name,
    parameterValue(parameter, overrides[parameter.name]),
  ]));
}

export function setAnimatorParameterOverride(
  controller: AnimatorController,
  json: string,
  name: string,
  value: unknown,
): string {
  const parameter = controller.parameters.find((candidate) => candidate.name === name);
  if (!parameter) return json;
  const overrides = parameterOverrideObject(json);
  overrides[name] = parameterValue(parameter, value);
  return JSON.stringify(overrides);
}

export function createAnimatorController(
  name = 'New Animator Controller',
  initialClip = 'Assets/Animations/New State.manim',
): AnimatorController {
  return {
    version: 2,
    name,
    default_state: 'Idle',
    parameters: [],
    states: [{ name: 'Idle', clip: initialClip, speed: 1, position: [100, 90] }],
    transitions: [],
    layers: [],
  };
}

export function normalizeAnimatorController(value: unknown): AnimatorController {
  const source = record(value);
  const parameters = (Array.isArray(source.parameters) ? source.parameters : []).map((item) => {
    const parameter = record(item);
    const rawKind = String(parameter.kind ?? 'bool') as AnimatorParameterKind;
    return {
      name: String(parameter.name ?? '').trim(),
      kind: PARAMETER_KINDS.has(rawKind) ? rawKind : 'bool',
      default_bool: Boolean(parameter.default_bool),
      default_float: finite(parameter.default_float, 0),
      default_int: Math.trunc(finite(parameter.default_int, 0)),
    } satisfies AnimatorParameter;
  });
  const states = (Array.isArray(source.states) ? source.states : []).map((item, index) => {
    const state = record(item);
    const position = Array.isArray(state.position) ? state.position : [];
    return {
      name: String(state.name ?? '').trim(),
      clip: String(state.clip ?? '').trim().replace(/\\/g, '/'),
      speed: finite(state.speed, 1),
      position: [
        finite(position[0], 100 + index % 4 * 170),
        finite(position[1], 90 + Math.floor(index / 4) * 100),
      ],
    } satisfies AnimatorState;
  });
  const transitions = (Array.isArray(source.transitions) ? source.transitions : []).map((item) => {
    const transition = record(item);
    const conditions = (Array.isArray(transition.conditions) ? transition.conditions : []).map((entry) => {
      const condition = record(entry);
      const rawMode = String(condition.mode ?? 'if') as AnimatorConditionMode;
      return {
        parameter: String(condition.parameter ?? '').trim(),
        mode: CONDITION_MODES.has(rawMode) ? rawMode : 'if',
        threshold: finite(condition.threshold, 0),
      } satisfies AnimatorCondition;
    });
    return {
      from: String(transition.from ?? '').trim(),
      to: String(transition.to ?? '').trim(),
      duration: Math.max(0, finite(transition.duration, 0.15)),
      has_exit_time: Boolean(transition.has_exit_time),
      exit_time: Math.max(0, finite(transition.exit_time, 1)),
      conditions,
    } satisfies AnimatorTransition;
  });
  const layers = (Array.isArray(source.layers) ? source.layers : []).map((item) => {
    const layer = record(item);
    const rawBlendMode = String(layer.blend_mode ?? 'override') as AnimatorLayerBlendMode;
    const maskPaths = [...new Set((Array.isArray(layer.mask_paths) ? layer.mask_paths : [])
      .map(normalizeMaskPath)
      .filter(Boolean))];
    const motions = (Array.isArray(layer.motions) ? layer.motions : []).map((item) => {
      const motion = record(item);
      return {
        state: String(motion.state ?? '').trim(),
        clip: String(motion.clip ?? '').trim().replace(/\\/g, '/'),
      } satisfies AnimatorLayerMotion;
    });
    return {
      name: String(layer.name ?? '').trim(),
      enabled: layer.enabled !== false,
      weight: Math.max(0, Math.min(1, finite(layer.weight, 1))),
      blend_mode: LAYER_BLEND_MODES.has(rawBlendMode) ? rawBlendMode : 'override',
      mask_paths: maskPaths,
      motions,
    } satisfies AnimatorLayer;
  });
  const controller: AnimatorController = {
    version: 2,
    name: String(source.name ?? ''),
    default_state: String(source.default_state ?? '').trim(),
    parameters,
    states,
    transitions,
    layers,
  };
  return controller;
}

export function validateAnimatorController(controller: AnimatorController): void {
  if (controller.states.length === 0) throw new Error('Animator Controller 至少需要一个 State');
  const stateNames = new Set<string>();
  for (const state of controller.states) {
    if (!state.name || !state.clip) throw new Error('每个 State 都必须设置名称和 Animation Clip');
    if (stateNames.has(state.name)) throw new Error(`State 名称重复：${state.name}`);
    stateNames.add(state.name);
  }
  if (!stateNames.has(controller.default_state)) {
    throw new Error(`默认 State 不存在：${controller.default_state || '(空)'}`);
  }
  const parameterNames = new Set<string>();
  for (const parameter of controller.parameters) {
    if (!parameter.name || parameterNames.has(parameter.name)) {
      throw new Error(`参数名称无效或重复：${parameter.name || '(空)'}`);
    }
    parameterNames.add(parameter.name);
  }
  for (const transition of controller.transitions) {
    if (transition.from !== '*' && !stateNames.has(transition.from)) {
      throw new Error(`过渡源 State 不存在：${transition.from}`);
    }
    if (!stateNames.has(transition.to)) throw new Error(`过渡目标 State 不存在：${transition.to}`);
    if (transition.from === transition.to) throw new Error(`State 不能过渡到自身：${transition.from}`);
    for (const condition of transition.conditions) {
      const parameter = controller.parameters.find((item) => item.name === condition.parameter);
      if (!parameter || !parameterNames.has(condition.parameter)) {
        throw new Error(`过渡条件引用了不存在的参数：${condition.parameter}`);
      }
      const compatible = parameter.kind === 'bool'
        ? ['if', 'if_not'].includes(condition.mode)
        : parameter.kind === 'trigger'
          ? condition.mode === 'trigger'
          : ['greater', 'less', 'equals', 'not_equal'].includes(condition.mode);
      if (!compatible) throw new Error(`条件 ${condition.mode} 与参数 ${condition.parameter} (${parameter.kind}) 不兼容`);
    }
  }
  const layerNames = new Set<string>();
  for (const layer of controller.layers) {
    if (!layer.name || layerNames.has(layer.name)) {
      throw new Error(`动画层名称无效或重复：${layer.name || '(空)'}`);
    }
    layerNames.add(layer.name);
    if (layer.mask_paths.some((path) => path !== '*' && path.split('/').includes('..'))) {
      throw new Error(`动画层 ${layer.name} 包含无效的 Avatar Mask 路径`);
    }
    const motionStates = new Set<string>();
    for (const motion of layer.motions) {
      if (!stateNames.has(motion.state)) throw new Error(`动画层 ${layer.name} 引用了不存在的 State：${motion.state}`);
      if (!motion.clip) throw new Error(`动画层 ${layer.name} 的 State ${motion.state} 必须设置 Animation Clip`);
      if (motionStates.has(motion.state)) throw new Error(`动画层 ${layer.name} 重复覆盖 State：${motion.state}`);
      motionStates.add(motion.state);
    }
  }
}

export function parseAnimatorController(text: string): AnimatorController {
  const controller = normalizeAnimatorController(JSON.parse(text));
  validateAnimatorController(controller);
  return controller;
}

/** Lenient authoring read so a broken graph can still be opened and repaired. */
export function parseAnimatorControllerDraft(text: string): AnimatorController {
  return normalizeAnimatorController(JSON.parse(text));
}

export function serializeAnimatorController(controller: AnimatorController): string {
  const normalized = normalizeAnimatorController(controller);
  validateAnimatorController(normalized);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
