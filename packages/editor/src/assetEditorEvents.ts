export const OPEN_ANIMATION_CLIP_EVENT = 'mengine:open-animation-clip';
export const OPEN_TIMELINE_ASSET_EVENT = 'mengine:open-timeline-asset';
export const OPEN_ANIMATOR_EVENT = 'mengine:open-animator';
export const OPEN_MATERIAL_EVENT = 'mengine:open-material';
export const OPEN_SURFACE_SHADER_EVENT = 'mengine:open-surface-shader';
export const OPEN_SPRITE_EDITOR_EVENT = 'mengine:open-sprite-editor';
export const OPEN_SPRITE_ATLAS_EVENT = 'mengine:open-sprite-atlas';
export const PROJECT_ASSETS_CHANGED_EVENT = 'mengine:project-assets-changed';
export const PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT = 'mengine:project-assets-external-change';

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
