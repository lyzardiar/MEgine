/**
 * The editor Game view and native runtime consume the same serialized Canvas model.
 * The editor uses Canvas2D for authoring feedback; mengine-runtime resolves the layout
 * and submits overlap-safe compatible primitives to the instanced wgpu UI pass.
 */

export const UI_RUNTIME_HOST = 'editor-game-viewport' as const;

export function describeUiRuntimePath(): string {
  return (
    'Canvas Overlay, Camera and World Space modes are previewed in Editor Game view and rendered ' +
    'by the native wgpu runtime. Camera/world quads use scene depth; Image, Text, Button, Toggle ' +
    'and Slider share scene data and overlap-safe compatible primitives use instanced GPU batches.'
  );
}
