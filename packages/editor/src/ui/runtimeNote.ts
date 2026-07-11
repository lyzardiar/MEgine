/**
 * Runtime UI note — editor Game view is the Screen Space Overlay host for Phase 1–3.
 * Native wgpu UI pass can consume the same Canvas/RectTransform/Image/Button JSON
 * layout rules from packages/editor/src/ui/rectLayout.ts (port later).
 *
 * Until mengine-rhi grows an ortho UI pass, Play Mode in the editor validates:
 * - layoutUiOverlay + drawUiItems
 * - Button raycast / ColorTint / on_click → Behaviour
 */

export const UI_RUNTIME_HOST = 'editor-game-viewport' as const;

export function describeUiRuntimePath(): string {
  return (
    'UI Overlay renders in Editor Game view (Canvas ScreenSpaceOverlay). ' +
    'Rust registers Canvas/RectTransform/Image/Button for scene round-trip; ' +
    'wgpu UI pass TBD.'
  );
}
