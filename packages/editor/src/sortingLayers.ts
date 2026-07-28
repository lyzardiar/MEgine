import {
  DEFAULT_SORTING_LAYER_SETTINGS,
  normalizeSortingLayerSettings,
  sortingLayerRank,
  type GameObjectLayer,
  type SortingLayer,
  type SortingLayerSettings,
} from './sortingLayerModel';
import {
  getProjectSortingLayers,
  getProjectSortingLayersSnapshot,
  saveProjectSortingLayers,
  saveProjectSortingLayersGuarded,
  type ProjectSortingLayersSnapshot,
} from './transport/editorTransport';
import { createEditorBroadcastChannel } from './editorInstance.ts';

export const SORTING_LAYERS_CHANGED_EVENT = 'mengine:sorting-layers-changed';
const CHANNEL_NAME = 'mengine.editor.sorting-layers.v1';

let current = normalizeSortingLayerSettings(DEFAULT_SORTING_LAYER_SETTINGS);
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  const created = createEditorBroadcastChannel(CHANNEL_NAME);
  if (!created) return null;
  channel = created;
  created.onmessage = (event: MessageEvent<unknown>) => applySortingLayers(event.data, false);
  return created;
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

export function getTagOptions(): Array<{ value: string; label: string }> {
  return current.tags.map((tag) => ({ value: tag, label: tag }));
}

export function getGameLayerOptions(): Array<{ value: number; label: string }> {
  return current.gameLayers.map((layer) => ({
    value: layer.index,
    label: `${layer.name} (${layer.index})`,
  }));
}

export function getSortingLayerRank(id: unknown): number {
  return sortingLayerRank(current, id);
}

export async function loadSortingLayers(): Promise<SortingLayerSettings> {
  getChannel();
  return applySortingLayers(await getProjectSortingLayers(), false);
}

export async function persistSortingLayers(layers: SortingLayer[]): Promise<SortingLayerSettings> {
  return persistProjectSettings({ ...current, layers });
}

export async function persistProjectSettings(
  settings: SortingLayerSettings,
): Promise<SortingLayerSettings> {
  const normalized = normalizeSortingLayerSettings(settings);
  const saved = await saveProjectSortingLayers(normalized);
  return applySortingLayers(saved, true);
}

export async function loadSortingLayersSnapshot(): Promise<ProjectSortingLayersSnapshot> {
  getChannel();
  const snapshot = await getProjectSortingLayersSnapshot();
  return {
    settings: applySortingLayers(snapshot.settings, false),
    revision: snapshot.revision,
  };
}

export async function persistSortingLayersGuarded(
  layers: SortingLayer[],
  expectedRevision: string | null,
): Promise<ProjectSortingLayersSnapshot> {
  return persistProjectSettingsGuarded({ ...current, layers }, expectedRevision);
}

export async function persistTagsAndLayersGuarded(
  tags: string[],
  gameLayers: GameObjectLayer[],
  expectedRevision: string | null,
): Promise<ProjectSortingLayersSnapshot> {
  return persistProjectSettingsGuarded(
    { ...current, tags, gameLayers },
    expectedRevision,
  );
}

export async function persistProjectSettingsGuarded(
  settings: SortingLayerSettings,
  expectedRevision: string | null,
): Promise<ProjectSortingLayersSnapshot> {
  const normalized = normalizeSortingLayerSettings(settings);
  const snapshot = await saveProjectSortingLayersGuarded(normalized, expectedRevision);
  return {
    settings: applySortingLayers(snapshot.settings, true),
    revision: snapshot.revision,
  };
}
