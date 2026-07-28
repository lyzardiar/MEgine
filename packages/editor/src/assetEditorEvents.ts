import { createEditorBroadcastChannel } from './editorInstance.ts';
import type { ProjectAssetChange } from './projectAssets.ts';

export const OPEN_ANIMATION_CLIP_EVENT = 'mengine:open-animation-clip';
export const OPEN_TIMELINE_ASSET_EVENT = 'mengine:open-timeline-asset';
export const OPEN_ANIMATOR_EVENT = 'mengine:open-animator';
export const OPEN_MATERIAL_EVENT = 'mengine:open-material';
export const OPEN_SURFACE_SHADER_EVENT = 'mengine:open-surface-shader';
export const OPEN_SPRITE_EDITOR_EVENT = 'mengine:open-sprite-editor';
export const OPEN_SPRITE_ATLAS_EVENT = 'mengine:open-sprite-atlas';
export const PROJECT_ASSETS_CHANGED_EVENT = 'mengine:project-assets-changed';
export const PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT = 'mengine:project-assets-external-change';

export type ProjectAssetLifecycleDetail =
  | { action: 'renamed'; sourcePath: string; destinationPath: string }
  | { action: 'deleted'; sourcePath: string }
  | { action: 'modified'; sourcePath: string }
  | { action: 'created' | 'restored'; destinationPath: string };

type ProjectAssetLifecycleMessage = ProjectAssetLifecycleDetail & {
  sender: string;
  timestamp: number;
};

type ProjectAssetExternalChangeMessage = {
  type: 'external';
  changes: ProjectAssetChange[];
  sender: string;
  timestamp: number;
};

type ProjectAssetEditorMessage =
  | ProjectAssetLifecycleMessage
  | ProjectAssetExternalChangeMessage;

const ASSET_CHANNEL = 'mengine.editor.assets.v1';
const assetSender = crypto.randomUUID();
let assetChannel: BroadcastChannel | null = null;

export function initializeAssetEditorEvents(): void {
  if (assetChannel) return;
  assetChannel = createEditorBroadcastChannel(ASSET_CHANNEL);
  assetChannel?.addEventListener(
    'message',
    (event: MessageEvent<ProjectAssetEditorMessage>) => {
      const message = event.data;
      if (!message || message.sender === assetSender) return;
      if ('type' in message && message.type === 'external') {
        const detail = {
          changes: structuredClone(message.changes),
          remote: true,
          timestamp: message.timestamp,
        };
        window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
          detail,
        }));
        window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT, {
          detail: { ...detail, source: 'external' },
        }));
        return;
      }
      window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT, {
        detail: { ...message, remote: true },
      }));
    },
  );
}

export function resetAssetEditorEventsForTests(): void {
  assetChannel?.close();
  assetChannel = null;
}

export function broadcastProjectAssetsChanged(detail: ProjectAssetLifecycleDetail): void {
  initializeAssetEditorEvents();
  const message: ProjectAssetLifecycleMessage = {
    ...detail,
    sender: assetSender,
    timestamp: Date.now(),
  };
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT, {
    detail: { ...message, remote: false },
  }));
  assetChannel?.postMessage(message);
}

export function broadcastProjectAssetsExternalChanges(
  changes: readonly ProjectAssetChange[],
): void {
  initializeAssetEditorEvents();
  const message: ProjectAssetExternalChangeMessage = {
    type: 'external',
    changes: structuredClone([...changes]),
    sender: assetSender,
    timestamp: Date.now(),
  };
  const detail = {
    changes: structuredClone(message.changes),
    remote: false,
    timestamp: message.timestamp,
  };
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
    detail,
  }));
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT, {
    detail: { ...detail, source: 'external' },
  }));
  assetChannel?.postMessage(message);
}

function openAsset(eventName: string, panel: string, path: string): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail: path }));
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: panel }));
}

export function openAnimationClipAsset(path: string): void {
  openAsset(OPEN_ANIMATION_CLIP_EVENT, 'timeline', path);
}

export function openTimelineAsset(path: string): void {
  openAsset(OPEN_TIMELINE_ASSET_EVENT, 'timeline', path);
}

export function openAnimatorAsset(path: string): void {
  openAsset(OPEN_ANIMATOR_EVENT, 'animator', path);
}

export function openMaterialAsset(path: string): void {
  openAsset(OPEN_MATERIAL_EVENT, 'material', path);
}

export function openSurfaceShaderAsset(path: string): void {
  openAsset(OPEN_SURFACE_SHADER_EVENT, 'shader', path);
}

export function openSpriteAsset(path: string): void {
  openAsset(OPEN_SPRITE_EDITOR_EVENT, 'spriteEditor', path);
}

export function openSpriteAtlasAsset(path: string): void {
  openAsset(OPEN_SPRITE_ATLAS_EVENT, 'spriteAtlas', path);
}
