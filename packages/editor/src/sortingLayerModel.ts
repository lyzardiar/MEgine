export const DEFAULT_SORTING_LAYER_ID = 'default';
export const MAX_SORTING_LAYERS = 64;
export const DEFAULT_TAG = 'Untagged';
export const MAX_TAGS = 64;
export const DEFAULT_GAME_LAYER = 0;
export const MAX_GAME_LAYERS = 32;

export type SortingLayer = {
  /** Stable serialized identifier. Renaming a display name must not break scenes. */
  id: string;
  name: string;
};

export type GameObjectLayer = {
  /** Stable serialized bit index used by scenes and future culling/physics masks. */
  index: number;
  name: string;
};

export type SortingLayerSettings = {
  version: 1;
  layers: SortingLayer[];
  tags: string[];
  gameLayers: GameObjectLayer[];
};

export const DEFAULT_SORTING_LAYER_SETTINGS: SortingLayerSettings = {
  version: 1,
  layers: [{ id: DEFAULT_SORTING_LAYER_ID, name: 'Default' }],
  tags: [DEFAULT_TAG],
  gameLayers: [{ index: DEFAULT_GAME_LAYER, name: 'Default' }],
};

const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeEntityTag(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_TAG;
  return value.trim().slice(0, 64) || DEFAULT_TAG;
}

export function normalizeGameLayerIndex(value: unknown): number {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index < MAX_GAME_LAYERS
    ? index
    : DEFAULT_GAME_LAYER;
}

export function validateSortingLayers(layers: readonly SortingLayer[]): string | null {
  if (!layers.length) return 'At least the Default sorting layer is required.';
  if (layers.length > MAX_SORTING_LAYERS) {
    return `At most ${MAX_SORTING_LAYERS} sorting layers are supported.`;
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const layer of layers) {
    const id = layer.id.trim();
    const name = layer.name.trim();
    if (!VALID_ID.test(id)) return `Invalid stable id '${layer.id}'.`;
    if (!name) return 'Sorting layer names cannot be empty.';
    if ([...name].length > 64) return `'${name}' exceeds 64 characters.`;
    const idKey = id.toLowerCase();
    if (idKey === DEFAULT_SORTING_LAYER_ID && id !== DEFAULT_SORTING_LAYER_ID) {
      return `The Default stable id must be '${DEFAULT_SORTING_LAYER_ID}'.`;
    }
    if (idKey === DEFAULT_SORTING_LAYER_ID && name !== 'Default') {
      return "The Default sorting layer name must be 'Default'.";
    }
    const nameKey = name.toLocaleLowerCase();
    if (ids.has(idKey)) return `Duplicate stable id '${id}'.`;
    if (names.has(nameKey)) return `Duplicate sorting layer name '${name}'.`;
    ids.add(idKey);
    names.add(nameKey);
  }
  return ids.has(DEFAULT_SORTING_LAYER_ID)
    ? null
    : 'The Default sorting layer is required.';
}

export function validateTagsAndLayers(
  tags: readonly string[],
  gameLayers: readonly GameObjectLayer[],
): string | null {
  if (!tags.length) return `The ${DEFAULT_TAG} tag is required.`;
  if (tags.length > MAX_TAGS) return `At most ${MAX_TAGS} tags are supported.`;
  const tagNames = new Set<string>();
  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (!tag) return 'Tag names cannot be empty.';
    if ([...tag].length > 64) return `'${tag}' exceeds 64 characters.`;
    const key = tag.toLocaleLowerCase();
    if (key === DEFAULT_TAG.toLocaleLowerCase() && tag !== DEFAULT_TAG) {
      return `The default tag must be '${DEFAULT_TAG}'.`;
    }
    if (tagNames.has(key)) return `Duplicate tag '${tag}'.`;
    tagNames.add(key);
  }
  if (!tagNames.has(DEFAULT_TAG.toLocaleLowerCase())) {
    return `The ${DEFAULT_TAG} tag is required.`;
  }

  if (!gameLayers.length) return 'The Default GameObject layer is required.';
  if (gameLayers.length > MAX_GAME_LAYERS) {
    return `At most ${MAX_GAME_LAYERS} GameObject layers are supported.`;
  }
  const indices = new Set<number>();
  const layerNames = new Set<string>();
  for (const layer of gameLayers) {
    if (!Number.isInteger(layer.index) || layer.index < 0 || layer.index >= MAX_GAME_LAYERS) {
      return `GameObject layer index '${String(layer.index)}' must be between 0 and 31.`;
    }
    const name = layer.name.trim();
    if (!name) return 'GameObject layer names cannot be empty.';
    if ([...name].length > 64) return `'${name}' exceeds 64 characters.`;
    if (layer.index === DEFAULT_GAME_LAYER && name !== 'Default') {
      return "GameObject layer 0 must be named 'Default'.";
    }
    const nameKey = name.toLocaleLowerCase();
    if (indices.has(layer.index)) return `Duplicate GameObject layer index '${layer.index}'.`;
    if (layerNames.has(nameKey)) return `Duplicate GameObject layer name '${name}'.`;
    indices.add(layer.index);
    layerNames.add(nameKey);
  }
  return indices.has(DEFAULT_GAME_LAYER)
    ? null
    : 'The Default GameObject layer is required.';
}

export function normalizeSortingLayerSettings(value: unknown): SortingLayerSettings {
  const source = value && typeof value === 'object'
    ? (value as { layers?: unknown; tags?: unknown; gameLayers?: unknown })
    : null;
  const raw = source?.layers;
  const layers: SortingLayer[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (layers.length >= MAX_SORTING_LAYERS || !entry || typeof entry !== 'object') break;
      const candidate = entry as { id?: unknown; name?: unknown };
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
      let name = typeof candidate.name === 'string' ? candidate.name.trim().slice(0, 64) : '';
      const idKey = id.toLowerCase();
      if (idKey === DEFAULT_SORTING_LAYER_ID) name = 'Default';
      const nameKey = name.toLocaleLowerCase();
      if (!VALID_ID.test(id) || !name || ids.has(idKey) || names.has(nameKey)) continue;
      ids.add(idKey);
      names.add(nameKey);
      layers.push({ id, name });
    }
  }
  if (!ids.has(DEFAULT_SORTING_LAYER_ID)) {
    layers.unshift({ id: DEFAULT_SORTING_LAYER_ID, name: 'Default' });
  }

  const tags: string[] = [];
  const tagNames = new Set<string>();
  if (Array.isArray(source?.tags)) {
    for (const candidate of source.tags) {
      if (tags.length >= MAX_TAGS) break;
      if (typeof candidate !== 'string') continue;
      let tag = candidate.trim().slice(0, 64);
      const key = tag.toLocaleLowerCase();
      if (key === DEFAULT_TAG.toLocaleLowerCase()) tag = DEFAULT_TAG;
      if (!tag || tagNames.has(key)) continue;
      tagNames.add(key);
      tags.push(tag);
    }
  }
  const defaultTagIndex = tags.findIndex(
    (tag) => tag.toLocaleLowerCase() === DEFAULT_TAG.toLocaleLowerCase(),
  );
  if (defaultTagIndex < 0) {
    tags.unshift(DEFAULT_TAG);
  } else if (defaultTagIndex > 0) {
    tags.splice(defaultTagIndex, 1);
    tags.unshift(DEFAULT_TAG);
  }

  const gameLayers: GameObjectLayer[] = [];
  const gameLayerIndices = new Set<number>();
  const gameLayerNames = new Set<string>();
  if (Array.isArray(source?.gameLayers)) {
    for (const candidate of source.gameLayers) {
      if (
        gameLayers.length >= MAX_GAME_LAYERS
        || !candidate
        || typeof candidate !== 'object'
      ) continue;
      const rawLayer = candidate as { index?: unknown; name?: unknown };
      const index = Number(rawLayer.index);
      let name = typeof rawLayer.name === 'string' ? rawLayer.name.trim().slice(0, 64) : '';
      if (index === DEFAULT_GAME_LAYER) name = 'Default';
      const nameKey = name.toLocaleLowerCase();
      if (
        !Number.isInteger(index)
        || index < 0
        || index >= MAX_GAME_LAYERS
        || !name
        || gameLayerIndices.has(index)
        || gameLayerNames.has(nameKey)
      ) continue;
      gameLayerIndices.add(index);
      gameLayerNames.add(nameKey);
      gameLayers.push({ index, name });
    }
  }
  if (!gameLayerIndices.has(DEFAULT_GAME_LAYER)) {
    gameLayers.unshift({ index: DEFAULT_GAME_LAYER, name: 'Default' });
  }
  gameLayers.sort((a, b) => a.index - b.index);

  return {
    version: 1,
    layers: layers.slice(0, MAX_SORTING_LAYERS),
    tags: tags.slice(0, MAX_TAGS),
    gameLayers: gameLayers.slice(0, MAX_GAME_LAYERS),
  };
}

export function sortingLayerRank(settings: SortingLayerSettings, id: unknown): number {
  const requested = typeof id === 'string' ? id.toLowerCase() : DEFAULT_SORTING_LAYER_ID;
  const rank = settings.layers.findIndex((layer) => layer.id.toLowerCase() === requested);
  if (rank >= 0) return rank;
  const fallback = settings.layers.findIndex(
    (layer) => layer.id.toLowerCase() === DEFAULT_SORTING_LAYER_ID,
  );
  return Math.max(0, fallback);
}

export function createSortingLayerId(existing: SortingLayer[]): string {
  const ids = new Set(existing.map((layer) => layer.id.toLowerCase()));
  let id = `layer-${crypto.randomUUID()}`;
  while (ids.has(id.toLowerCase())) id = `layer-${crypto.randomUUID()}`;
  return id;
}

export function nextGameLayerIndex(existing: readonly GameObjectLayer[]): number | null {
  const used = new Set(existing.map((layer) => layer.index));
  for (let index = 0; index < MAX_GAME_LAYERS; index++) {
    if (!used.has(index)) return index;
  }
  return null;
}
