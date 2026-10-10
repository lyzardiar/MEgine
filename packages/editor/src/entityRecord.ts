// Author: MiYu. Canonical entity metadata shared by editable scenes and native Play publication.
import { normalizeEntityTag, normalizeGameLayerIndex } from './sortingLayerModel';

export interface EntityRec {
  entity: number;
  name?: string | null;
  parent?: number | null;
  siblingIndex: number;
  active: boolean;
  tag: string;
  layer: number;
  components: Record<string, unknown>;
}

export function normalizeEntity(e: Partial<EntityRec> & { entity: number; components: Record<string, unknown> }): EntityRec {
  return {
    entity: e.entity,
    name: e.name ?? 'GameObject',
    parent: e.parent ?? null,
    siblingIndex: e.siblingIndex ?? 0,
    active: e.active ?? true,
    tag: normalizeEntityTag(e.tag),
    layer: normalizeGameLayerIndex(e.layer),
    components: e.components,
  };
}
