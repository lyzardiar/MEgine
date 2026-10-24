// Author: MiYu. Query the displayed native mesh frame and apply asynchronous clicks in gesture order.
export type NativeScenePickFrame = { meshPickToken: string; viewport: { x: number; y: number; w: number; h: number } };

export function nativeScenePickPoint(frame: NativeScenePickFrame, x: number, y: number): [number, number] | null {
  const view = frame.viewport;
  if (![x, y, view.x, view.y, view.w, view.h].every(Number.isFinite) || view.w <= 0 || view.h <= 0 || x < view.x || y < view.y || x > view.x + view.w || y > view.y + view.h) return null;
  return [(x - view.x) / view.w, (y - view.y) / view.h];
}

export function createNativeScenePickQueue() {
  let generation = 0, focusReady = true, tail = Promise.resolve();
  return {
    invalidate() { generation++; focusReady = true; tail = Promise.resolve(); },
    enqueue<T>(query: () => Promise<T>, current: () => boolean, apply: (result: T) => void, fail: (error: unknown) => void) {
      const owner = generation;
      focusReady = false;
      // Start each query immediately, while the captured frame is still retained by the host.
      const result = query().then(value => ({ value, error: undefined, ok: true as const }), error => ({ error, ok: false as const }));
      tail = tail.then(async () => {
        const response = await result;
        if (generation !== owner) return;
        const active = current(); focusReady = active && response.ok;
        if (!active) return;
        if (response.ok) apply(response.value); else fail(response.error);
      });
    },
    afterPending(action: () => void) { const owner = generation; return tail.then(() => { if (owner === generation && focusReady) action(); }); },
  };
}
