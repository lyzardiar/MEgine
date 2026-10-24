// Author: MiYu. Coalesce remote Play panel publication while runtime worlds remain immediate.
type PanelState = { selectedIds: readonly number[]; sceneHiddenIds: readonly number[]; sceneUnpickableIds: readonly number[]; sceneCamera: unknown; gameResolution: unknown; gameDisplay: number; gizmo: unknown };
export function remoteScenePanelKey(state: PanelState): string {
  return JSON.stringify([state.selectedIds, state.sceneHiddenIds, state.sceneUnpickableIds, state.sceneCamera, state.gameResolution, state.gameDisplay, state.gizmo]);
}

export function createRemotePanelRefresh(now = () => performance.now(), schedule = (callback: () => void, delay: number) => setTimeout(callback, delay), cancelTimer = (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer)) {
  let pending: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined, generation = 0, lastPublished = -Infinity;
  const clearTimer = () => { generation++; if (timer !== undefined) cancelTimer(timer); timer = undefined; };
  const flush = () => {
    clearTimer();
    const publish = pending; pending = undefined;
    if (publish) { lastPublished = now(); publish(); }
  };
  return {
    publish(callback: () => void, defer: boolean) {
      pending = callback;
      const delay = Math.max(0, 100 - (now() - lastPublished));
      if (!defer || delay === 0) { flush(); return; }
      if (timer !== undefined) return;
      const scheduledGeneration = ++generation;
      timer = schedule(() => { if (generation === scheduledGeneration) flush(); }, Math.ceil(delay));
    },
    cancel() { clearTimer(); pending = undefined; lastPublished = -Infinity; },
  };
}
