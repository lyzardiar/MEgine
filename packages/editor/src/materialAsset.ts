export type MaterialShader = 'pbr' | 'unlit' | 'custom';
export type MaterialSurface = 'opaque' | 'transparent' | 'cutout';
export type MaterialBlendMode = 'alpha' | 'premultiplied' | 'additive' | 'multiply';
export type MaterialWrap = 'repeat' | 'clamp' | 'mirror';
export type MaterialFilter = 'nearest' | 'linear';

export type MaterialAsset = {
  version: number;
  name: string;
  shader: MaterialShader;
  custom_shader: string;
  surface: MaterialSurface;
  blend_mode: MaterialBlendMode;
  transparent_depth_write: boolean;
  render_queue: number;
  base_color: [number, number, number, number];
  metallic: number;
  roughness: number;
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
};

export function createMaterialAsset(name = 'New Material'): MaterialAsset {
  return {
    version: 4,
    name,
    shader: 'pbr',
    custom_shader: '',
    surface: 'opaque',
    blend_mode: 'alpha',
    transparent_depth_write: false,
    render_queue: -1,
    base_color: [0.8, 0.8, 0.8, 1],
    metallic: 0,
    roughness: 0.5,
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

export function normalizeMaterialAsset(value: unknown): MaterialAsset {
  const source = value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const baseColor = vector(source.base_color, 4, [0.8, 0.8, 0.8, 1])
    .map((part) => Math.max(0, Math.min(1, part))) as MaterialAsset['base_color'];
  const emissive = vector(source.emissive, 3, [0, 0, 0])
    .map((part) => Math.max(0, part)) as MaterialAsset['emissive'];
  return {
    version: Math.max(4, Math.trunc(finite(source.version, 4))),
    name: String(source.name ?? ''),
    shader: source.shader === 'unlit' || source.shader === 'custom' ? source.shader : 'pbr',
    custom_shader: String(source.custom_shader ?? '').trim().replace(/\\/g, '/'),
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
    filter: source.filter === 'nearest' ? 'nearest' : 'linear',
  };
}

export function parseMaterialAsset(text: string): MaterialAsset {
  return normalizeMaterialAsset(JSON.parse(text));
}

export function serializeMaterialAsset(material: MaterialAsset): string {
  return `${JSON.stringify(normalizeMaterialAsset(material), null, 2)}\n`;
}
