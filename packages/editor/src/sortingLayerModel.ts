export const DEFAULT_SORTING_LAYER_ID = 'default';
export const MAX_SORTING_LAYERS = 64;

export type SortingLayer = {
  /** Stable serialized identifier. Renaming a display name must not break scenes. */
  id: string;
  name: string;
};

export type SortingLayerSettings = {
  version: 1;
  layers: SortingLayer[];
};

export const DEFAULT_SORTING_LAYER_SETTINGS: SortingLayerSettings = {
  version: 1,
  layers: [{ id: DEFAULT_SORTING_LAYER_ID, name: 'Default' }],
};

const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/;

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

export function normalizeSortingLayerSettings(value: unknown): SortingLayerSettings {
  const raw = value && typeof value === 'object'
    ? (value as { layers?: unknown }).layers
    : null;
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
  return { version: 1, layers: layers.slice(0, MAX_SORTING_LAYERS) };
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
