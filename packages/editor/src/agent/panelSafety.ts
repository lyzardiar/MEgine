import type { EditorWindowInfo } from './protocol.ts';

export interface PanelWindowBlocker {
  label: string;
  title: string;
  kind: EditorWindowInfo['kind'];
  visible: boolean;
  focused: boolean;
}

/** Return only target windows whose UI would be disturbed by a panel mutation. */
export function panelWindowBlockers(
  windows: readonly EditorWindowInfo[],
  windowLabels: readonly string[],
): PanelWindowBlocker[] {
  const targets = new Set(windowLabels);
  return windows
    .filter((window) => targets.has(window.label) && (window.visible || window.focused))
    .map((window) => ({
      label: window.label,
      title: window.title,
      kind: window.kind,
      visible: window.visible,
      focused: window.focused,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
