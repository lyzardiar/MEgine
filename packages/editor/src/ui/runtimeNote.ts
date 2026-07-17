/**
 * The editor Game view and native runtime consume the same serialized Canvas model.
 * The editor uses Canvas2D for authoring feedback; mengine-runtime resolves the layout
 * and submits adjacent compatible primitives to the instanced wgpu UI pass.
 */

export const UI_RUNTIME_HOST = 'editor-game-viewport' as const;

export function describeUiRuntimePath(): string {
  return (
    'Canvas ScreenSpaceOverlay is previewed in Editor Game view and rendered by the native ' +
    'wgpu runtime. Image, Text, Button, Toggle and Slider share scene data; adjacent compatible ' +
    'primitives are submitted as instanced GPU batches.'
  );
}
