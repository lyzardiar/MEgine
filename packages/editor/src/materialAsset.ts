export type MaterialShader = 'pbr' | 'unlit' | 'custom';
export type MaterialSurface = 'opaque' | 'transparent' | 'cutout';
export type MaterialBlendMode = 'alpha' | 'premultiplied' | 'additive' | 'multiply';
export type MaterialWrap = 'repeat' | 'clamp' | 'mirror';
export type MaterialFilter = 'nearest' | 'linear';

export const MATERIAL_TEXTURE_FIELDS = [
  'base_color_texture',
  'normal_texture',
  'metallic_roughness_texture',
  'occlusion_texture',
  'emissive_texture',
] as const;

export type MaterialTextureField = typeof MATERIAL_TEXTURE_FIELDS[number];

export type MaterialReferenceDiagnostic = {
  field: MaterialTextureField | 'custom_shader';
  message: string;
};

export type MaterialCustomParameters = Record<string, [number, number, number, number]>;

export type MaterialAsset = {
  version: number;
  name: string;
  shader: MaterialShader;
  custom_shader: string;
  custom_parameters: MaterialCustomParameters;
  surface: MaterialSurface;
  blend_mode: MaterialBlendMode;
  transparent_depth_write: boolean;
  render_queue: number;
  base_color: [number, number, number, number];
  metallic: number;
  roughness: number;
  ior: number;
  clearcoat: number;
  clearcoat_roughness: number;
  emissive: [number, number, number];
  emissive_strength: number;
  double_sided: boolean;
  alpha_cutoff: number;
  base_color_texture: string;
  normal_texture: string;
  normal_scale: number;
  metallic_roughness_texture: string;
  occlusion_texture: string;
  occlusion_strength: number;
  emissive_texture: string;
  uv_scale: [number, number];
  uv_offset: [number, number];
  uv_rotation: number;
  wrap_u: MaterialWrap;
  wrap_v: MaterialWrap;
  filter: MaterialFilter;
  mipmap_filter: MaterialFilter;
  anisotropy: number;
};

export function isMaterialTexturePath(path: string): boolean {
  return /\.(?:png|jpe?g|webp|gif|bmp|tga|tiff?|hdr|exr)$/i.test(path.trim());
}

export function materialReferenceDiagnostics(
  material: MaterialAsset,
  availablePaths: readonly string[],
): MaterialReferenceDiagnostic[] {
  const available = new Set(availablePaths.map((path) => path.trim().replace(/\\/g, '/').toLowerCase()));
  const diagnostics: MaterialReferenceDiagnostic[] = [];
  if (material.shader === 'custom') {
    if (!material.custom_shader) {
      diagnostics.push({
        field: 'custom_shader',
        message: 'Custom materials require a Surface Shader asset.',
      });
    } else if (!material.custom_shader.toLowerCase().endsWith('.mshader')) {
      diagnostics.push({
        field: 'custom_shader',
        message: 'Surface Shader must reference a .mshader asset.',
      });
    } else if (!available.has(material.custom_shader.toLowerCase())) {
      diagnostics.push({
        field: 'custom_shader',
        message: `Missing Surface Shader: ${material.custom_shader}`,
      });
    }
  }
  for (const field of MATERIAL_TEXTURE_FIELDS) {
    const path = material[field];
    if (!path) continue;
    const normalizedPath = path.trim().replace(/\\/g, '/');
    if (!isMaterialTexturePath(normalizedPath)) {
      diagnostics.push({ field, message: `Unsupported texture asset: ${path}` });
    } else if (!available.has(normalizedPath.toLowerCase())) {
      diagnostics.push({ field, message: `Missing texture asset: ${path}` });
    }
  }
  return diagnostics;
}

export function createMaterialAsset(name = 'New Material'): MaterialAsset {
  return {
    version: 8,
    name,
    shader: 'pbr',
    custom_shader: '',
    custom_parameters: {},
    surface: 'opaque',
    blend_mode: 'alpha',
    transparent_depth_write: false,
    render_queue: -1,
    base_color: [0.8, 0.8, 0.8, 1],
    metallic: 0,
    roughness: 0.5,
    ior: 1.5,
    clearcoat: 0,
    clearcoat_roughness: 0.1,
    emissive: [0, 0, 0],
    emissive_strength: 1,
    double_sided: false,
    alpha_cutoff: 0.5,
    base_color_texture: '',
    normal_texture: '',
    normal_scale: 1,
    metallic_roughness_texture: '',
    occlusion_texture: '',
    occlusion_strength: 1,
    emissive_texture: '',
    uv_scale: [1, 1],
    uv_offset: [0, 0],
    uv_rotation: 0,
    wrap_u: 'repeat',
    wrap_v: 'repeat',
    filter: 'linear',
    mipmap_filter: 'linear',
    anisotropy: 1,
  };
}

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function vector(value: unknown, length: number, fallback: number[]): number[] {
  if (!Array.isArray(value) || value.length !== length) return [...fallback];
  return value.map((part, index) => finite(part, fallback[index]));
}

export function normalizeMaterialCustomParameters(value: unknown): MaterialCustomParameters {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Material custom_parameters must be an object');
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 16) throw new Error('Material cannot contain more than 16 custom parameters');
  const result: MaterialCustomParameters = {};
  for (const [name, raw] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(name)) {
      throw new Error(`Invalid custom material parameter name: ${name}`);
    }
    if (!Array.isArray(raw) || raw.length !== 4
      || raw.some((part) => typeof part !== 'number' || !Number.isFinite(part))) {
      throw new Error(`Custom material parameter '${name}' must contain four finite numbers`);
    }
    result[name] = [...raw] as [number, number, number, number];
  }
  return result;
}

export function normalizeMaterialAsset(value: unknown): MaterialAsset {
  const source = value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const baseColor = vector(source.base_color, 4, [0.8, 0.8, 0.8, 1])
    .map((part) => Math.max(0, Math.min(1, part))) as MaterialAsset['base_color'];
  const emissive = vector(source.emissive, 3, [0, 0, 0])
    .map((part) => Math.max(0, part)) as MaterialAsset['emissive'];
  const anisotropy = Math.max(1, Math.min(16, Math.trunc(finite(source.anisotropy, 1))));
  const shader: MaterialShader = source.shader === 'unlit' || source.shader === 'custom'
    ? source.shader
    : 'pbr';
  const reflectedParameters = normalizeMaterialCustomParameters(source.custom_parameters);
  if (shader !== 'custom' && Object.keys(reflectedParameters).length > 0) {
    throw new Error('Only custom materials can contain custom_parameters');
  }
  return {
    version: 8,
    name: String(source.name ?? ''),
    shader,
    custom_shader: String(source.custom_shader ?? '').trim().replace(/\\/g, '/'),
    custom_parameters: reflectedParameters,
    surface: source.surface === 'transparent' || source.surface === 'cutout'
      ? source.surface
      : 'opaque',
    blend_mode: source.blend_mode === 'premultiplied'
      || source.blend_mode === 'additive'
      || source.blend_mode === 'multiply'
      ? source.blend_mode
      : 'alpha',
    transparent_depth_write: Boolean(source.transparent_depth_write),
    render_queue: Math.max(-1, Math.min(5000, Math.trunc(finite(source.render_queue, -1)))),
    base_color: baseColor,
    metallic: Math.max(0, Math.min(1, finite(source.metallic, 0))),
    roughness: Math.max(0.04, Math.min(1, finite(source.roughness, 0.5))),
    ior: Math.max(1, Math.min(2.5, finite(source.ior, 1.5))),
    clearcoat: Math.max(0, Math.min(1, finite(source.clearcoat, 0))),
    clearcoat_roughness: Math.max(0.04, Math.min(1, finite(source.clearcoat_roughness, 0.1))),
    emissive,
    emissive_strength: Math.max(0, finite(source.emissive_strength, 1)),
    double_sided: Boolean(source.double_sided),
    alpha_cutoff: Math.max(0, Math.min(1, finite(source.alpha_cutoff, 0.5))),
    base_color_texture: String(source.base_color_texture ?? '').trim().replace(/\\/g, '/'),
    normal_texture: String(source.normal_texture ?? '').trim().replace(/\\/g, '/'),
    normal_scale: Math.max(0, finite(source.normal_scale, 1)),
    metallic_roughness_texture: String(source.metallic_roughness_texture ?? '')
      .trim()
      .replace(/\\/g, '/'),
    occlusion_texture: String(source.occlusion_texture ?? '').trim().replace(/\\/g, '/'),
    occlusion_strength: Math.max(0, Math.min(1, finite(source.occlusion_strength, 1))),
    emissive_texture: String(source.emissive_texture ?? '').trim().replace(/\\/g, '/'),
    uv_scale: vector(source.uv_scale, 2, [1, 1]) as [number, number],
    uv_offset: vector(source.uv_offset, 2, [0, 0]) as [number, number],
    uv_rotation: ((finite(source.uv_rotation, 0) % 360) + 360) % 360,
    wrap_u: source.wrap_u === 'clamp' || source.wrap_u === 'mirror' ? source.wrap_u : 'repeat',
    wrap_v: source.wrap_v === 'clamp' || source.wrap_v === 'mirror' ? source.wrap_v : 'repeat',
    filter: anisotropy > 1 ? 'linear' : source.filter === 'nearest' ? 'nearest' : 'linear',
    mipmap_filter: anisotropy > 1
      ? 'linear'
      : source.mipmap_filter === 'nearest' ? 'nearest' : 'linear',
    anisotropy,
  };
}

export function parseMaterialAsset(text: string): MaterialAsset {
  const parsed = JSON.parse(text) as unknown;
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Material root must be an object');
  }
  const source = parsed as Record<string, unknown>;
  if (source.version != null
    && (!Number.isInteger(source.version) || Number(source.version) < 1 || Number(source.version) > 8)) {
    throw new Error(`Unsupported material version: ${String(source.version)}`);
  }
  const enumField = (field: string, allowed: readonly string[]) => {
    const value = source[field];
    if (value != null && (typeof value !== 'string' || !allowed.includes(value))) {
      throw new Error(`Invalid material ${field}: ${String(value)}`);
    }
  };
  enumField('shader', ['pbr', 'unlit', 'custom']);
  enumField('surface', ['opaque', 'transparent', 'cutout']);
  enumField('blend_mode', ['alpha', 'premultiplied', 'additive', 'multiply']);
  enumField('wrap_u', ['repeat', 'clamp', 'mirror']);
  enumField('wrap_v', ['repeat', 'clamp', 'mirror']);
  enumField('filter', ['nearest', 'linear']);
  enumField('mipmap_filter', ['nearest', 'linear']);
  if (source.shader !== 'custom' && source.custom_parameters != null
    && Object.keys(normalizeMaterialCustomParameters(source.custom_parameters)).length > 0) {
    throw new Error('Only custom materials can contain custom_parameters');
  }
  return normalizeMaterialAsset(source);
}

export function serializeMaterialAsset(material: MaterialAsset): string {
  if (material.version !== 8) throw new Error(`Unsupported material version: ${material.version}`);
  return `${JSON.stringify(normalizeMaterialAsset(material), null, 2)}\n`;
}
