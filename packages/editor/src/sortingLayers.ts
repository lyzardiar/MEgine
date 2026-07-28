import {
  DEFAULT_SORTING_LAYER_SETTINGS,
  normalizeSortingLayerSettings,
  sortingLayerRank,
  type GameObjectLayer,
  type SortingLayer,
  type SortingLayerSettings,
} from './sortingLayerModel.ts';
import {
  getProjectSortingLayers,
  getProjectSortingLayersSnapshot,
  saveProjectSortingLayers,
  saveProjectSortingLayersGuarded,
  type ProjectSortingLayersSnapshot,
} from './transport/editorTransport.ts';
import { createEditorBroadcastChannel } from './editorInstance.ts';

export const SORTING_LAYERS_CHANGED_EVENT = 'mengine:sorting-layers-changed';
const CHANNEL_NAME = 'mengine.editor.sorting-layers.v1';

let current = normalizeSortingLayerSettings(DEFAULT_SORTING_LAYER_SETTINGS);
let channel: BroadcastChannel | null = null;
const sender = crypto.randomUUID();

export type SortingLayersChangeDetail = {
  settings: SortingLayerSettings;
  source: string;
  sender: string;
  timestamp: number;
  remote: boolean;
};

type SortingLayersChangeMessage = Omit<SortingLayersChangeDetail, 'remote'>;

function getChannel(): BroadcastChannel | null {
  if (channel) return channel;
  const created = createEditorBroadcastChannel(CHANNEL_NAME);
  if (!created) return null;
  channel = created;
  created.onmessage = (event: MessageEvent<SortingLayersChangeMessage>) => {
    const message = event.data;
    if (!message || message.sender === sender) return;
    applySortingLayers(message.settings, {
      notify: true,
      remote: true,
      source: message.source,
      sender: message.sender,
      timestamp: message.timestamp,
    });
  };
  return created;
}

function applySortingLayers(
  value: unknown,
  options: {
    notify?: boolean;
    remote?: boolean;
    source?: string;
    sender?: string;
    timestamp?: number;
  } = {},
): SortingLayerSettings {
  current = normalizeSortingLayerSettings(value);
  if (options.notify) {
    window.dispatchEvent(new CustomEvent<SortingLayersChangeDetail>(
      SORTING_LAYERS_CHANGED_EVENT,
      {
        detail: {
          settings: structuredClone(current),
          source: options.source ?? 'editor',
          sender: options.sender ?? sender,
          timestamp: options.timestamp ?? Date.now(),
          remote: Boolean(options.remote),
        },
      },
    ));
  }
  return current;
}

export function initializeSortingLayerEvents(): void {
  getChannel();
}

export function resetSortingLayerEventsForTests(): void {
  channel?.close();
  channel = null;
  current = normalizeSortingLayerSettings(DEFAULT_SORTING_LAYER_SETTINGS);
}

export function broadcastSortingLayersChanged(
  settings: SortingLayerSettings,
  source = 'editor',
): SortingLayerSettings {
  const timestamp = Date.now();
  const next = applySortingLayers(settings, {
    notify: true,
    remote: false,
    source,
    sender,
    timestamp,
  });
  const message: SortingLayersChangeMessage = {
    settings: structuredClone(next),
    source,
    sender,
    timestamp,
  };
  getChannel()?.postMessage(message);
  return next;
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
  return applySortingLayers(await getProjectSortingLayers());
}

export async function persistSortingLayers(layers: SortingLayer[]): Promise<SortingLayerSettings> {
  return persistProjectSettings({ ...current, layers });
}

export async function persistProjectSettings(
  settings: SortingLayerSettings,
  source = 'project-settings',
): Promise<SortingLayerSettings> {
  const normalized = normalizeSortingLayerSettings(settings);
  const saved = await saveProjectSortingLayers(normalized);
  return broadcastSortingLayersChanged(saved, source);
}

export async function loadSortingLayersSnapshot(): Promise<ProjectSortingLayersSnapshot> {
  getChannel();
  const snapshot = await getProjectSortingLayersSnapshot();
  return {
    settings: applySortingLayers(snapshot.settings),
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
  source = 'agent',
): Promise<ProjectSortingLayersSnapshot> {
  const normalized = normalizeSortingLayerSettings(settings);
  const snapshot = await saveProjectSortingLayersGuarded(normalized, expectedRevision);
  return {
    settings: broadcastSortingLayersChanged(snapshot.settings, source),
    revision: snapshot.revision,
  };
}
