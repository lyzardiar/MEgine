export const SURFACE_SHADER_HOOK_NAME = 'mengine_surface_hook';
export const LIT_SURFACE_SHADER_HOOK_NAME = 'mengine_lit_surface_hook';
export const MAX_SURFACE_SHADER_PARAMETERS = 16;
export const MAX_SURFACE_SHADER_KEYWORDS = 16;
export const SURFACE_SHADER_PARAMETERS_MARKER = '/* MENGINE_PARAMETERS';

export type SurfaceShaderParameterType = 'float' | 'vector2' | 'vector3' | 'vector4' | 'color';
export type SurfaceShaderParameter = {
  name: string;
  label: string;
  type: SurfaceShaderParameterType;
  default: [number, number, number, number];
  min: number | null;
  max: number | null;
};
export type SurfaceShaderKeyword = {
  name: string;
  label: string;
  default: boolean;
};

export const DEFAULT_SURFACE_SHADER = `fn mengine_lit_surface_hook(
    surface: MEngineSurface,
    uv: vec2<f32>,
    world_position: vec3<f32>,
) -> MEngineSurface {
    return surface;
}
`;

export function normalizeSurfaceShaderSource(source: string): string {
  return `${String(source ?? '').replace(/\r\n?/g, '\n').trim()}\n`;
}

export function surfaceShaderParameterComponents(type: SurfaceShaderParameterType): number {
  if (type === 'float') return 1;
  if (type === 'vector2') return 2;
  if (type === 'vector3') return 3;
  return 4;
}

function parseSurfaceShaderSchemaRoot(source: string): {
  parameters: unknown[];
  keywords: unknown[];
} {
  const marker = source.indexOf(SURFACE_SHADER_PARAMETERS_MARKER);
  if (marker < 0) return { parameters: [], keywords: [] };
  const jsonStart = marker + SURFACE_SHADER_PARAMETERS_MARKER.length;
  const relativeEnd = source.slice(jsonStart).indexOf('*/');
  if (relativeEnd < 0) throw new Error('Surface Shader parameter block is not terminated.');
  const blockEnd = jsonStart + relativeEnd;
  if (source.slice(blockEnd + 2).includes(SURFACE_SHADER_PARAMETERS_MARKER)) {
    throw new Error('Surface Shader can contain only one parameter block.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(jsonStart, blockEnd).trim());
  } catch (reason) {
    throw new Error(`Invalid Surface Shader parameter JSON: ${reason instanceof Error ? reason.message : String(reason)}`);
  }
  const root = parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
  if (!root || Object.keys(root).some((key) => key !== 'parameters' && key !== 'keywords')
    || (root.parameters != null && !Array.isArray(root.parameters))
    || (root.keywords != null && !Array.isArray(root.keywords))) {
    throw new Error('Surface Shader parameter block may contain only parameters and keywords arrays.');
  }
  return {
    parameters: (root.parameters ?? []) as unknown[],
    keywords: (root.keywords ?? []) as unknown[],
  };
}

export function parseSurfaceShaderParameters(source: string): SurfaceShaderParameter[] {
  const root = parseSurfaceShaderSchemaRoot(source);
  if (root.parameters.length > MAX_SURFACE_SHADER_PARAMETERS) {
    throw new Error(`Surface Shader declares more than ${MAX_SURFACE_SHADER_PARAMETERS} parameters.`);
  }
  const names = new Set<string>();
  return root.parameters.map((value, index) => {
    const parameter = value != null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
    if (!parameter || Object.keys(parameter).some(
      (key) => !['name', 'label', 'type', 'default', 'min', 'max'].includes(key),
    )) {
      throw new Error(`Surface Shader parameter ${index + 1} contains unsupported fields.`);
    }
    const name = typeof parameter.name === 'string' ? parameter.name.trim() : '';
    if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name)) {
      throw new Error(`Surface Shader parameter name '${name}' must be an ASCII identifier of at most 48 characters.`);
    }
    if (names.has(name)) throw new Error(`Duplicate Surface Shader parameter '${name}'.`);
    names.add(name);
    const type = parameter.type;
    if (type !== 'float' && type !== 'vector2' && type !== 'vector3'
      && type !== 'vector4' && type !== 'color') {
      throw new Error(`Unsupported Surface Shader parameter type '${String(type)}'.`);
    }
    if (parameter.label != null && typeof parameter.label !== 'string') {
      throw new Error(`Surface Shader parameter '${name}' label must be a string.`);
    }
    const label = typeof parameter.label === 'string' && parameter.label.trim()
      ? parameter.label.trim()
      : name.replaceAll('_', ' ');
    if (label.length > 64) throw new Error(`Surface Shader parameter '${name}' label exceeds 64 characters.`);
    const minimum = parameter.min == null
      ? (type === 'color' ? 0 : null)
      : typeof parameter.min === 'number' ? parameter.min : Number.NaN;
    const maximum = parameter.max == null
      ? (type === 'color' ? 1 : null)
      : typeof parameter.max === 'number' ? parameter.max : Number.NaN;
    if ((minimum != null && !Number.isFinite(minimum))
      || (maximum != null && !Number.isFinite(maximum))
      || (minimum != null && maximum != null && minimum > maximum)
      || (type === 'color' && ((minimum ?? 0) < 0 || (maximum ?? 1) > 1))) {
      throw new Error(`Surface Shader parameter '${name}' has an invalid range.`);
    }
    const count = surfaceShaderParameterComponents(type);
    const raw = count === 1 ? [parameter.default] : parameter.default;
    if (!Array.isArray(raw) || raw.length !== count
      || raw.some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
      throw new Error(`Surface Shader parameter '${name}' default must contain ${count} finite number${count === 1 ? '' : 's'}.`);
    }
    const packed: [number, number, number, number] = [0, 0, 0, 0];
    for (let component = 0; component < count; component += 1) {
      packed[component] = Math.max(minimum ?? -Number.MAX_VALUE, Math.min(maximum ?? Number.MAX_VALUE, raw[component]));
    }
    return { name, label, type, default: packed, min: minimum, max: maximum };
  });
}

export function parseSurfaceShaderKeywords(source: string): SurfaceShaderKeyword[] {
  const root = parseSurfaceShaderSchemaRoot(source);
  if (root.keywords.length > MAX_SURFACE_SHADER_KEYWORDS) {
    throw new Error(`Surface Shader declares more than ${MAX_SURFACE_SHADER_KEYWORDS} keywords.`);
  }
  const names = new Set<string>();
  return root.keywords.map((value, index) => {
    const keyword = value != null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
    if (!keyword || Object.keys(keyword).some((key) => !['name', 'label', 'default'].includes(key))) {
      throw new Error(`Surface Shader keyword ${index + 1} contains unsupported fields.`);
    }
    const name = typeof keyword.name === 'string' ? keyword.name.trim() : '';
    if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name)) {
      throw new Error(`Surface Shader keyword name '${name}' must be an ASCII identifier of at most 48 characters.`);
    }
    if (names.has(name)) throw new Error(`Duplicate Surface Shader keyword '${name}'.`);
    names.add(name);
    if (keyword.label != null && typeof keyword.label !== 'string') {
      throw new Error(`Surface Shader keyword '${name}' label must be a string.`);
    }
    if (keyword.default != null && typeof keyword.default !== 'boolean') {
      throw new Error(`Surface Shader keyword '${name}' default must be a boolean.`);
    }
    const label = typeof keyword.label === 'string' && keyword.label.trim()
      ? keyword.label.trim()
      : name.replaceAll('_', ' ');
    if (label.length > 64) throw new Error(`Surface Shader keyword '${name}' label exceeds 64 characters.`);
    return { name, label, default: keyword.default === true };
  });
}

export function normalizeSurfaceShaderParameterValue(
  parameter: SurfaceShaderParameter,
  value: unknown,
): [number, number, number, number] {
  const source = Array.isArray(value) && value.length === 4 ? value : parameter.default;
  const result: [number, number, number, number] = [...parameter.default];
  const count = surfaceShaderParameterComponents(parameter.type);
  for (let component = 0; component < count; component += 1) {
    const number = Number(source[component]);
    result[component] = Number.isFinite(number)
      ? Math.max(parameter.min ?? -Number.MAX_VALUE, Math.min(parameter.max ?? Number.MAX_VALUE, number))
      : parameter.default[component];
  }
  return result;
}

export function validateSurfaceShaderParameterValues(
  parameters: readonly SurfaceShaderParameter[],
  values: Readonly<Record<string, readonly number[]>>,
): void {
  const declared = new Set(parameters.map((parameter) => parameter.name));
  const unknown = Object.keys(values).find((name) => !declared.has(name));
  if (unknown) {
    throw new Error(`Material parameter '${unknown}' is not declared by its Surface Shader.`);
  }
}

export function validateSurfaceShaderKeywordValues(
  keywords: readonly SurfaceShaderKeyword[],
  values: Readonly<Record<string, boolean>>,
): void {
  const declared = new Set(keywords.map((keyword) => keyword.name));
  const unknown = Object.keys(values).find((name) => !declared.has(name));
  if (unknown) {
    throw new Error(`Material keyword '${unknown}' is not declared by its Surface Shader.`);
  }
}

export function surfaceShaderDiagnostics(source: string): string[] {
  const normalized = normalizeSurfaceShaderSource(source);
  const diagnostics: string[] = [];
  try {
    parseSurfaceShaderParameters(normalized);
    parseSurfaceShaderKeywords(normalized);
  } catch (reason) {
    diagnostics.push(reason instanceof Error ? reason.message : String(reason));
  }
  if (new TextEncoder().encode(normalized).byteLength > 256 * 1024) {
    diagnostics.push('Surface Shader must not exceed 256 KiB.');
  }
  const hasLegacyHook = new RegExp(`\\bfn\\s+${SURFACE_SHADER_HOOK_NAME}\\s*\\(`).test(normalized);
  const hasLitHook = new RegExp(`\\bfn\\s+${LIT_SURFACE_SHADER_HOOK_NAME}\\s*\\(`).test(normalized);
  if (!hasLegacyHook && !hasLitHook) {
    diagnostics.push(`Missing fn ${LIT_SURFACE_SHADER_HOOK_NAME}(...) or fn ${SURFACE_SHADER_HOOK_NAME}(...).`);
  }
  for (const token of ['@group', '@binding', '@vertex', '@fragment', '@compute']) {
    if (normalized.includes(token)) diagnostics.push(`${token} is reserved by the engine.`);
  }
  return diagnostics;
}

export function validateSurfaceShaderSource(source: string): void {
  const diagnostics = surfaceShaderDiagnostics(source);
  if (diagnostics.length > 0) throw new Error(diagnostics.join(' '));
}
