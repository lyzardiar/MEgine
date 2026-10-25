// Author: MiYu. Pure native snapshot shape conversion shared by transport and owned JSON publication.
import type { WorldSnapshotView } from '@mengine/api';

type HostEntitySnapshot = { entity: number; name?: string | null; parent?: number | null; sibling_index?: number; active?: boolean; tag?: string; layer?: number; components: Record<string, unknown> };
export type HostWorldSnapshot = { entities: HostEntitySnapshot[]; frame: number; sim_frame: number; elapsed?: number; clear_color: [number, number, number, number]; selected?: number | null };

export function toWorldSnapshotView(snapshot: HostWorldSnapshot): WorldSnapshotView & { selectedIds: number[] } {
  return {
    entities: snapshot.entities.map(entity => ({ entity: entity.entity, name: entity.name, parent: entity.parent, siblingIndex: entity.sibling_index ?? 0, active: entity.active ?? true, tag: entity.tag ?? 'Untagged', layer: entity.layer ?? 0, components: entity.components })),
    frame: snapshot.frame,
    simFrame: snapshot.sim_frame,
    ...(snapshot.elapsed === undefined ? {} : { simulationTime: snapshot.elapsed }),
    clearColor: snapshot.clear_color,
    selected: snapshot.selected,
    selectedIds: snapshot.selected == null ? [] : [snapshot.selected],
  };
}
