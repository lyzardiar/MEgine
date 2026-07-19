export function dockPanelShouldMount<T extends string>(
  panel: T,
  active: T | null,
  mounted: ReadonlySet<T>,
): boolean {
  if (active === panel) return true;
  if (panel === 'scene' || panel === 'game') return false;
  return mounted.has(panel);
}
