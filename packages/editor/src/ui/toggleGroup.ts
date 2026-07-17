export type ToggleGroupEntity = {
  entity: number;
  parent?: number | null;
  active?: boolean;
  components: Record<string, unknown>;
};

export type TogglePatch = { entity: number; isOn: boolean };

function nearestGroup(entities: ToggleGroupEntity[], entity: ToggleGroupEntity): number | null {
  const byId = new Map(entities.map((candidate) => [candidate.entity, candidate]));
  const guard = new Set<number>();
  let parent = entity.parent ?? null;
  while (parent != null && !guard.has(parent)) {
    guard.add(parent);
    const candidate = byId.get(parent);
    if (!candidate) return null;
    if (candidate.components.ToggleGroup) return candidate.entity;
    parent = candidate.parent ?? null;
  }
  return null;
}

function toggleOn(entity: ToggleGroupEntity): boolean {
  const toggle = entity.components.Toggle as Record<string, unknown> | undefined;
  return toggle?.is_on === true || toggle?.isOn === true;
}

/** Plan one atomic group update. Nested groups are isolated by nearest ancestry. */
export function planToggleGroupChange(
  entities: ToggleGroupEntity[],
  targetId: number,
  requestedOn: boolean,
): TogglePatch[] {
  const target = entities.find((entity) => entity.entity === targetId);
  if (!target?.components.Toggle) return [];
  const groupId = nearestGroup(entities, target);
  if (groupId == null) {
    return toggleOn(target) === requestedOn ? [] : [{ entity: targetId, isOn: requestedOn }];
  }

  const members = entities.filter(
    (entity) => entity.active !== false
      && !!entity.components.Toggle
      && nearestGroup(entities, entity) === groupId,
  );
  if (!requestedOn) {
    const group = entities.find((entity) => entity.entity === groupId);
    const raw = group?.components.ToggleGroup as Record<string, unknown> | undefined;
    const allowSwitchOff = raw?.allow_switch_off === true || raw?.allowSwitchOff === true;
    const anotherIsOn = members.some(
      (member) => member.entity !== targetId && toggleOn(member),
    );
    if (!allowSwitchOff && !anotherIsOn) return [];
    return toggleOn(target) ? [{ entity: targetId, isOn: false }] : [];
  }

  return members
    .map((member) => ({ entity: member.entity, isOn: member.entity === targetId }))
    .filter((patch) => {
      const member = members.find((candidate) => candidate.entity === patch.entity);
      return member != null && toggleOn(member) !== patch.isOn;
    });
}
