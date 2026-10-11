// Author: MiYu. Reuse exact mesh picking regions only within one owned native Scene frame and viewport.
type Viewport = { x: number; y: number; w: number; h: number };
type Hit = { x: number; y: number; r: number } | null;

/** Preview objects are replaced when loaded or invalidated; mutable browser fallback never uses this cache. */
export function createNativeSceneMeshHitCache() {
  let frame: object | null = null, viewport: Viewport | undefined;
  const regions = new Map<number, { preview: object | null; hit: Hit }>();
  return {
    beginFrame(next: object | null, view: Viewport) {
      if (next == null || next !== frame || !viewport || view.x !== viewport.x || view.y !== viewport.y || view.w !== viewport.w || view.h !== viewport.h) { regions.clear(); frame = next; viewport = { ...view }; }
    },
    read(entity: number, preview: object | null, compute: () => Hit): Hit {
      if (!frame) return compute();
      const previous = regions.get(entity);
      if (previous && previous.preview === preview) return previous.hit;
      const hit = compute(); regions.set(entity, { preview, hit }); return hit;
    },
  };
}
