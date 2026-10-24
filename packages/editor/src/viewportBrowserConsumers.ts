// Author: MiYu. Classify fixed displayed records once while preserving each browser consumer's input order.
type Entity = { components: Record<string, unknown> };

/** Only immutable owned frame records may reuse component membership across revisions. */
export function createOwnedViewportBrowserConsumerReader<E extends Entity>() {
  let previous: { entities: WeakRef<readonly E[]>; masks: Uint8Array } | undefined;
  return (entities: readonly E[]) => {
    const old = previous?.entities.deref(), masks = new Uint8Array(entities.length);
    const result: { lights: E[]; emitters: E[]; trails: E[]; spines: E[] } = { lights: [], emitters: [], trails: [], spines: [] };
    for (let index = 0; index < entities.length; index++) {
      const entity = entities[index];
      let mask: number;
      if (old?.[index] === entity) mask = previous!.masks[index];
      else {
        const c = entity.components;
        mask = (c.Light2D ? 1 : 0) | (c.ParticleEmitter2D || c.ParticleEmitter3D ? 2 : 0) | (c.TrailRenderer2D ? 4 : 0) | (c.SpineSkeleton ? 8 : 0);
      }
      masks[index] = mask;
      if (mask & 1) result.lights.push(entity);
      if (mask & 2) result.emitters.push(entity);
      if (mask & 4) result.trails.push(entity);
      if (mask & 8) result.spines.push(entity);
    }
    previous = { entities: new WeakRef(entities), masks };
    return result;
  };
}
