export type EffekseerCatalogEffect = {
  id: string;
  label: string;
  effect: string;
  group: string;
  tags: string[];
  summary: string;
  modes: Array<'world' | 'screen'>;
  suggestedScale: number;
};

export type EffekseerCatalogPresetLayer = {
  effect: string;
  name?: string;
  position?: [number, number, number];
  anchoredPosition?: [number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
  size?: [number, number];
  speed?: number;
  startFrame?: number;
  prewarm?: boolean;
  looping?: boolean;
  screenScale?: number;
  sortingOrder?: number;
};

export type EffekseerCatalogPreset = {
  id: string;
  label: string;
  summary: string;
  promptHints: string[];
  mode: 'world' | 'screen';
  layers: EffekseerCatalogPresetLayer[];
};

export type EffekseerCatalogDocument = {
  path: string;
  revision: string;
  contents: string;
};

export type EffekseerCatalog = {
  catalogRevision: string;
  sources: Array<{ path: string; revision: string }>;
  groups: Array<{ id: string; count: number }>;
  effects: EffekseerCatalogEffect[];
  presets: EffekseerCatalogPreset[];
  diagnostics: string[];
};

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function finiteTuple(value: unknown, length: number): number[] | undefined {
  return Array.isArray(value)
    && value.length === length
    && value.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? value as number[]
    : undefined;
}
function strings(value: unknown, maximum: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 64)))]
    .slice(0, maximum);
}

function parseLayer(value: unknown): EffekseerCatalogPresetLayer | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.effect !== 'string' || !raw.effect.trim()) return null;
  const layer: EffekseerCatalogPresetLayer = { effect: raw.effect.trim().replace(/\\/g, '/') };
  if (typeof raw.name === 'string' && raw.name.trim()) layer.name = raw.name.trim().slice(0, 80);
  const position = finiteTuple(raw.position, 3);
  if (position) layer.position = position as [number, number, number];
  const anchoredPosition = finiteTuple(raw.anchoredPosition, 2);
  if (anchoredPosition) layer.anchoredPosition = anchoredPosition as [number, number];
  const rotation = finiteTuple(raw.rotation, 4);
  if (rotation) layer.rotation = rotation as [number, number, number, number];
  const scale = finiteTuple(raw.scale, 3);
  if (scale) layer.scale = scale as [number, number, number];
  const size = finiteTuple(raw.size, 2);
  if (size) layer.size = size as [number, number];
  for (const key of ['speed', 'startFrame', 'screenScale', 'sortingOrder'] as const) {
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) layer[key] = raw[key];
  }
  for (const key of ['prewarm', 'looping'] as const) {
    if (typeof raw[key] === 'boolean') layer[key] = raw[key];
  }
  return layer;
}

function catalogHash(parts: string[]): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x9e3779b9;
  const source = parts.join('\n');
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    hashA = Math.imul(hashA ^ code, 0x01000193);
    hashB = Math.imul(hashB ^ (code + index), 0x85ebca6b);
  }
  return `${(hashA >>> 0).toString(16).padStart(8, '0')}${(hashB >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildEffekseerCatalog(
  effectPaths: readonly string[],
  documents: readonly EffekseerCatalogDocument[],
  filter: { search?: string; group?: string; tags?: readonly string[] } = {},
): EffekseerCatalog {
  const paths = [...new Set(effectPaths.map((path) => path.replace(/\\/g, '/')))].sort();
  const available = new Set(paths.map((path) => path.toLocaleLowerCase()));
  const effects = new Map<string, EffekseerCatalogEffect>();
  const presets: EffekseerCatalogPreset[] = [];
  const diagnostics: string[] = [];

  for (const document of documents) {
    let root: Record<string, unknown>;
    try {
      const parsed = JSON.parse(document.contents) as unknown;
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('root must be an object');
      root = parsed as Record<string, unknown>;
      if (root.version !== 1) throw new Error('version must be 1');
    } catch (reason) {
      diagnostics.push(`${document.path}: ${reason instanceof Error ? reason.message : String(reason)}`);
      continue;
    }
    const rawEffects = Array.isArray(root.effects) ? root.effects : [];
    for (const [index, value] of rawEffects.entries()) {
      if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        diagnostics.push(`${document.path}: effects[${index}] must be an object`);
        continue;
      }
      const raw = value as Record<string, unknown>;
      const id = typeof raw.id === 'string' ? raw.id.trim() : '';
      const effect = typeof raw.effect === 'string' ? raw.effect.trim().replace(/\\/g, '/') : '';
      if (!ID.test(id) || !available.has(effect.toLocaleLowerCase())) {
        diagnostics.push(`${document.path}: effects[${index}] has an invalid id or missing .efk/.efkefc asset`);
        continue;
      }
      const modes = strings(raw.modes, 2).filter(
        (mode): mode is 'world' | 'screen' => mode === 'world' || mode === 'screen',
      );
      effects.set(effect.toLocaleLowerCase(), {
        id,
        label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 80) : id,
        effect,
        group: typeof raw.group === 'string' && ID.test(raw.group.trim()) ? raw.group.trim() : 'unclassified',
        tags: strings(raw.tags, 24),
        summary: typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 240) : '',
        modes: modes.length > 0 ? modes : ['world', 'screen'],
        suggestedScale: typeof raw.suggestedScale === 'number' && Number.isFinite(raw.suggestedScale) && raw.suggestedScale > 0
          ? Math.min(100, raw.suggestedScale)
          : 1,
      });
    }
    const rawPresets = Array.isArray(root.presets) ? root.presets : [];
    for (const [index, value] of rawPresets.entries()) {
      if (value == null || typeof value !== 'object' || Array.isArray(value)) continue;
      const raw = value as Record<string, unknown>;
      const id = typeof raw.id === 'string' ? raw.id.trim() : '';
      const mode = raw.mode === 'screen' ? 'screen' : raw.mode === 'world' ? 'world' : null;
      const layers = Array.isArray(raw.layers)
        ? raw.layers.map(parseLayer).filter((layer): layer is EffekseerCatalogPresetLayer => layer != null)
        : [];
      if (!ID.test(id) || !mode || layers.length === 0 || layers.length > 16
        || layers.some((layer) => !available.has(layer.effect.toLocaleLowerCase()))) {
        diagnostics.push(`${document.path}: presets[${index}] is invalid or references a missing effect`);
        continue;
      }
      presets.push({
        id,
        label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 80) : id,
        summary: typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 240) : '',
        promptHints: strings(raw.promptHints, 24),
        mode,
        layers,
      });
    }
  }

  for (const path of paths) {
    if (effects.has(path.toLocaleLowerCase())) continue;
    const leaf = path.split('/').pop()?.replace(/\.efk(?:efc)?$/i, '') ?? path;
    effects.set(path.toLocaleLowerCase(), {
      id: leaf.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z]+/, 'effect_').slice(0, 64),
      label: leaf.replaceAll('_', ' '),
      effect: path,
      group: 'unclassified',
      tags: [],
      summary: 'Indexed Effekseer asset without catalog metadata.',
      modes: ['world', 'screen'],
      suggestedScale: 1,
    });
  }

  const search = filter.search?.trim().toLocaleLowerCase() ?? '';
  const group = filter.group?.trim().toLocaleLowerCase() ?? '';
  const tags = (filter.tags ?? []).map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean);
  const allEffects = [...effects.values()].sort((left, right) => left.id.localeCompare(right.id));
  const filteredEffects = allEffects.filter((effect) => {
    const words = [effect.id, effect.label, effect.effect, effect.group, effect.summary, ...effect.tags]
      .join(' ')
      .toLocaleLowerCase();
    return (!search || words.includes(search))
      && (!group || effect.group.toLocaleLowerCase() === group)
      && tags.every((tag) => effect.tags.some((candidate) => candidate.toLocaleLowerCase() === tag));
  });
  const groupCounts = new Map<string, number>();
  for (const effect of allEffects) groupCounts.set(effect.group, (groupCounts.get(effect.group) ?? 0) + 1);
  const sources = documents.map(({ path, revision }) => ({ path, revision }));
  return {
    catalogRevision: `effekseer-catalog-v1-${catalogHash([
      ...paths,
      ...sources.flatMap((source) => [source.path, source.revision]),
    ])}`,
    sources,
    groups: [...groupCounts].sort(([left], [right]) => left.localeCompare(right)).map(([id, count]) => ({ id, count })),
    effects: filteredEffects,
    presets: [...presets].sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics,
  };
}
