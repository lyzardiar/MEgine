import {
  parseSurfaceShaderKeywords,
  parseSurfaceShaderParameters,
  parseSurfaceShaderTextures,
} from './surfaceShader.ts';

export type ShaderTokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'attribute'
  | 'keyword'
  | 'type'
  | 'builtin'
  | 'property';

export type ShaderToken = { kind: ShaderTokenKind; text: string };

export type ShaderCompletion = {
  label: string;
  insertText: string;
  detail: string;
  kind: 'keyword' | 'type' | 'function' | 'field' | 'snippet';
  cursorOffset?: number;
};

export type ShaderCompletionResult = {
  start: number;
  end: number;
  items: ShaderCompletion[];
};

const KEYWORDS = new Set([
  'alias', 'break', 'case', 'const', 'const_assert', 'continue', 'continuing',
  'default', 'diagnostic', 'discard', 'else', 'enable', 'false', 'fn', 'for',
  'if', 'let', 'loop', 'override', 'requires', 'return', 'struct', 'switch',
  'true', 'var', 'while',
]);

const TYPES = new Set([
  'array', 'atomic', 'bool', 'f16', 'f32', 'i32', 'mat2x2', 'mat2x2f',
  'mat2x3', 'mat2x3f', 'mat2x4', 'mat2x4f', 'mat3x2', 'mat3x2f', 'mat3x3',
  'mat3x3f', 'mat3x4', 'mat3x4f', 'mat4x2', 'mat4x2f', 'mat4x3', 'mat4x3f',
  'mat4x4', 'mat4x4f', 'ptr', 'sampler', 'sampler_comparison', 'texture_1d',
  'texture_2d', 'texture_2d_array', 'texture_3d', 'texture_cube',
  'texture_cube_array', 'texture_depth_2d', 'texture_depth_2d_array',
  'texture_depth_cube', 'texture_depth_cube_array', 'texture_external',
  'texture_multisampled_2d', 'texture_storage_1d', 'texture_storage_2d',
  'texture_storage_2d_array', 'texture_storage_3d', 'u32', 'vec2', 'vec2f',
  'vec2i', 'vec2u', 'vec3', 'vec3f', 'vec3i', 'vec3u', 'vec4', 'vec4f',
  'vec4i', 'vec4u', 'MEngineSurface', 'MEngineUiInput',
]);

const BUILTINS = new Set([
  'abs', 'acos', 'acosh', 'all', 'any', 'arrayLength', 'asin', 'asinh', 'atan',
  'atan2', 'atanh', 'ceil', 'clamp', 'cos', 'cosh', 'countLeadingZeros',
  'countOneBits', 'countTrailingZeros', 'cross', 'degrees', 'determinant',
  'distance', 'dot', 'exp', 'exp2', 'extractBits', 'faceForward', 'firstLeadingBit',
  'firstTrailingBit', 'floor', 'fma', 'fract', 'frexp', 'insertBits',
  'inverseSqrt', 'ldexp', 'length', 'log', 'log2', 'max', 'min', 'mix', 'modf',
  'normalize', 'pow', 'quantizeToF16', 'radians', 'reflect', 'refract', 'reverseBits',
  'round', 'saturate', 'select', 'sign', 'sin', 'sinh', 'smoothstep', 'sqrt',
  'step', 'tan', 'tanh', 'transpose', 'trunc', 'textureDimensions', 'textureGather',
  'textureGatherCompare', 'textureLoad', 'textureNumLayers', 'textureNumLevels',
  'textureNumSamples', 'textureSample', 'textureSampleBias', 'textureSampleCompare',
  'textureSampleCompareLevel', 'textureSampleGrad', 'textureSampleLevel',
  'textureSampleBaseClampToEdge', 'textureStore', 'mengine_surface_hook',
  'mengine_lit_surface_hook', 'mengine_ui_hook', 'mengine_ui_main_texture',
  'mengine_ui_material_color',
]);

const SURFACE_FIELDS = [
  ['base_color', 'vec3<f32>'],
  ['alpha', 'f32'],
  ['normal', 'vec3<f32>'],
  ['metallic', 'f32'],
  ['roughness', 'f32'],
  ['occlusion', 'f32'],
  ['emissive', 'vec3<f32>'],
] as const;

const UI_FIELDS = [
  ['vertex_color', 'vec4<f32>'],
  ['uv0', 'vec2<f32>'],
  ['uv1', 'vec4<f32>'],
  ['uv2', 'vec4<f32>'],
  ['uv3', 'vec4<f32>'],
  ['normal', 'vec3<f32>'],
  ['tangent', 'vec4<f32>'],
  ['screen_position', 'vec2<f32>'],
  ['shader_channels', 'u32'],
  ['instance_index', 'u32'],
] as const;

function pushToken(tokens: ShaderToken[], kind: ShaderTokenKind, text: string) {
  if (!text) return;
  const previous = tokens.at(-1);
  if (previous?.kind === kind) previous.text += text;
  else tokens.push({ kind, text });
}

export function highlightShaderSource(source: string): ShaderToken[] {
  const tokens: ShaderToken[] = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const lineComment = rest.match(/^\/\/[^\n]*/)?.[0];
    if (lineComment) {
      pushToken(tokens, 'comment', lineComment);
      index += lineComment.length;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = source.indexOf('*/', index + 2);
      const comment = source.slice(index, end < 0 ? source.length : end + 2);
      pushToken(tokens, 'comment', comment);
      index += comment.length;
      continue;
    }
    const string = rest.match(/^"(?:\\.|[^"\\])*"/)?.[0];
    if (string) {
      pushToken(tokens, 'string', string);
      index += string.length;
      continue;
    }
    const attribute = rest.match(/^@[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (attribute) {
      pushToken(tokens, 'attribute', attribute);
      index += attribute.length;
      continue;
    }
    const number = rest.match(/^(?:0[xX][0-9a-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)[fhiu]?/)?.[0];
    if (number) {
      pushToken(tokens, 'number', number);
      index += number.length;
      continue;
    }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (identifier) {
      const before = source.slice(0, index).match(/\.\s*$/);
      const kind = KEYWORDS.has(identifier)
        ? 'keyword'
        : TYPES.has(identifier)
          ? 'type'
          : BUILTINS.has(identifier) || identifier.startsWith('mengine_')
            ? 'builtin'
            : before
              ? 'property'
              : 'plain';
      pushToken(tokens, kind, identifier);
      index += identifier.length;
      continue;
    }
    pushToken(tokens, 'plain', source[index]);
    index += 1;
  }
  return tokens;
}

const baseCompletions = (): ShaderCompletion[] => [
  ...[...KEYWORDS].map((label): ShaderCompletion => ({
    label, insertText: label, detail: 'WGSL keyword', kind: 'keyword',
  })),
  ...[...TYPES].map((label): ShaderCompletion => ({
    label, insertText: label, detail: 'WGSL / MEngine type', kind: 'type',
  })),
  ...[...BUILTINS].map((label): ShaderCompletion => ({
    label,
    insertText: `${label}()`,
    cursorOffset: -1,
    detail: label.startsWith('mengine_') ? 'MEngine shader API' : 'WGSL built-in function',
    kind: 'function',
  })),
  {
    label: 'lit surface hook',
    insertText: 'fn mengine_lit_surface_hook(\n    surface: MEngineSurface,\n    uv: vec2<f32>,\n    world_position: vec3<f32>,\n) -> MEngineSurface {\n    return surface;\n}',
    detail: 'MEngine lit Surface Shader entry point',
    kind: 'snippet',
  },
  {
    label: 'UI hook',
    insertText: 'fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> {\n    return mengine_ui_main_texture(input.uv0) * input.vertex_color;\n}',
    detail: 'MEngine UI Shader entry point',
    kind: 'snippet',
  },
];

function declaredEngineCompletions(source: string, ui: boolean): ShaderCompletion[] {
  try {
    return [
      ...parseSurfaceShaderParameters(source).map((parameter): ShaderCompletion => {
        const label = `mengine_param_${parameter.name}`;
        const argument = ui ? 'input.instance_index' : '';
        const type = parameter.type === 'float'
          ? 'f32'
          : `vec${parameter.type.slice(-1)}<f32>`;
        return {
          label,
          insertText: `${label}(${argument})`,
          detail: `${parameter.label}: ${type}`,
          kind: 'function',
        };
      }),
      ...parseSurfaceShaderKeywords(source).map((keyword): ShaderCompletion => {
        const label = `mengine_keyword_${keyword.name}`;
        return {
          label,
          insertText: `${label}()`,
          detail: `${keyword.label}: bool`,
          kind: 'function',
        };
      }),
      ...parseSurfaceShaderTextures(source).map((texture): ShaderCompletion => {
        const label = `mengine_texture_${texture.name}`;
        return {
          label,
          insertText: `${label}(uv)`,
          detail: `${texture.label}: texture (${texture.type})`,
          kind: 'function',
        };
      }),
    ];
  } catch {
    return [];
  }
}

export function shaderCompletions(
  source: string,
  cursor: number,
  force = false,
): ShaderCompletionResult {
  const safeCursor = Math.max(0, Math.min(source.length, cursor));
  const before = source.slice(0, safeCursor);
  const word = before.match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? '';
  const start = safeCursor - word.length;
  const receiver = source.slice(0, start).match(/([A-Za-z_][A-Za-z0-9_]*)\.\s*$/)?.[1];
  let candidates: ShaderCompletion[];
  if (receiver === 'surface') {
    candidates = SURFACE_FIELDS.map(([label, type]) => ({
      label, insertText: label, detail: `MEngineSurface.${label}: ${type}`, kind: 'field',
    }));
  } else if (receiver === 'input') {
    candidates = UI_FIELDS.map(([label, type]) => ({
      label, insertText: label, detail: `MEngineUiInput.${label}: ${type}`, kind: 'field',
    }));
  } else {
    const ui = /\bfn\s+mengine_ui_hook\s*\(/.test(source);
    candidates = [...declaredEngineCompletions(source, ui), ...baseCompletions()];
  }
  const normalizedWord = word.toLowerCase();
  const items = candidates
    .filter((item) => force || word.length > 0 || receiver != null)
    .filter((item) => !word || item.label.toLowerCase().startsWith(normalizedWord))
    .sort((left, right) => {
      const priority = (item: ShaderCompletion) => (
        item.label.startsWith('mengine_') || item.label.startsWith('MEngine') ? 0 : 1
      );
      return priority(left) - priority(right) || left.label.localeCompare(right.label);
    })
    .slice(0, 80);
  return { start, end: safeCursor, items };
}
