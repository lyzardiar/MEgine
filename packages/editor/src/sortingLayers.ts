import {
  DEFAULT_SORTING_LAYER_SETTINGS,
  normalizeSortingLayerSettings,
  sortingLayerRank,
  type SortingLayer,
  type SortingLayerSettings,
} from './sortingLayerModel';
import {
  getProjectSortingLayers,
  saveProjectSortingLayers,
} from './transport/editorTransport';

export const SORTING_LAYERS_CHANGED_EVENT = 'mengine:sorting-layers-changed';
const CHANNEL_NAME = 'mengine.editor.sorting-layers.v1';

let current = normalizeSortingLayerSettings(DEFAULT_SORTING_LAYER_SETTINGS);
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<unknown>) => applySortingLayers(event.data, false);
  return channel;
}

function applySortingLayers(value: unknown, broadcast: boolean): SortingLayerSettings {
  current = normalizeSortingLayerSettings(value);
  window.dispatchEvent(new CustomEvent(SORTING_LAYERS_CHANGED_EVENT, { detail: current }));
  if (broadcast) getChannel()?.postMessage(current);
  return current;
}

export function getSortingLayers(): SortingLayerSettings {
  return current;
}

export function getSortingLayerOptions(): Array<{ value: string; label: string }> {
  return current.layers.map((layer) => ({ value: layer.id, label: layer.name }));
}

export function getSortingLayerRank(id: unknown): number {
  return sortingLayerRank(current, id);
}

export async function loadSortingLayers(): Promise<SortingLayerSettings> {
  getChannel();
  return applySortingLayers(await getProjectSortingLayers(), false);
}

export async function persistSortingLayers(layers: SortingLayer[]): Promise<SortingLayerSettings> {
  const normalized = normalizeSortingLayerSettings({ version: 1, layers });
  const saved = await saveProjectSortingLayers(normalized);
  return applySortingLayers(saved, true);
}
