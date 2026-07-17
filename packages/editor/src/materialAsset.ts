export type MaterialShader = 'pbr' | 'unlit';
export type MaterialSurface = 'opaque' | 'transparent' | 'cutout';

export type MaterialAsset = {
  version: number;
  name: string;
  shader: MaterialShader;
  surface: MaterialSurface;
  base_color: [number, number, number, number];
  metallic: number;
  roughness: number;
  emissive: [number, number, number];
  emissive_strength: number;
  double_sided: boolean;
  alpha_cutoff: number;
  base_color_texture: string;
  uv_scale: [number, number];
  uv_offset: [number, number];
};

export function createMaterialAsset(name = 'New Material'): MaterialAsset {
  return {
    version: 1,
    name,
    shader: 'pbr',
    surface: 'opaque',
    base_color: [0.8, 0.8, 0.8, 1],
    metallic: 0,
    roughness: 0.5,
    emissive: [0, 0, 0],
    emissive_strength: 1,
    double_sided: false,
    alpha_cutoff: 0.5,
    base_color_texture: '',
    uv_scale: [1, 1],
    uv_offset: [0, 0],
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
    version: Math.max(1, Math.trunc(finite(source.version, 1))),
    name: String(source.name ?? ''),
    shader: source.shader === 'unlit' ? 'unlit' : 'pbr',
    surface: source.surface === 'transparent' || source.surface === 'cutout'
      ? source.surface
      : 'opaque',
    base_color: baseColor,
    metallic: Math.max(0, Math.min(1, finite(source.metallic, 0))),
    roughness: Math.max(0.04, Math.min(1, finite(source.roughness, 0.5))),
    emissive,
    emissive_strength: Math.max(0, finite(source.emissive_strength, 1)),
    double_sided: Boolean(source.double_sided),
    alpha_cutoff: Math.max(0, Math.min(1, finite(source.alpha_cutoff, 0.5))),
    base_color_texture: String(source.base_color_texture ?? '').trim().replace(/\\/g, '/'),
    uv_scale: vector(source.uv_scale, 2, [1, 1]) as [number, number],
    uv_offset: vector(source.uv_offset, 2, [0, 0]) as [number, number],
  };
}

export function parseMaterialAsset(text: string): MaterialAsset {
  return normalizeMaterialAsset(JSON.parse(text));
}

export function serializeMaterialAsset(material: MaterialAsset): string {
  return `${JSON.stringify(normalizeMaterialAsset(material), null, 2)}\n`;
}
