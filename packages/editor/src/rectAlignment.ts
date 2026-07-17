export type RectAlignmentCommand =
  | 'left'
  | 'center'
  | 'right'
  | 'top'
  | 'middle'
  | 'bottom'
  | 'distribute-horizontal'
  | 'distribute-vertical';

export type RectAlignmentItem = {
  entity: number;
  rect: { x: number; y: number; w: number; h: number };
};

export type RectAlignmentDelta = { entity: number; dx: number; dy: number };

function clean(value: number): number {
  return Math.abs(value) < 1e-8 ? 0 : Number(value.toFixed(8));
}

export function planRectAlignment(
  items: RectAlignmentItem[],
  selectedRootIds: number[],
  primaryId: number | null,
  command: RectAlignmentCommand,
): RectAlignmentDelta[] {
  const selected = new Set(selectedRootIds);
  const targets = items.filter((item) => selected.has(item.entity));
  if (targets.length < 2) return [];

  if (command === 'distribute-horizontal' || command === 'distribute-vertical') {
    if (targets.length < 3) return [];
    const horizontal = command === 'distribute-horizontal';
    const ordered = [...targets].sort((a, b) => {
      const ac = horizontal ? a.rect.x + a.rect.w / 2 : a.rect.y + a.rect.h / 2;
      const bc = horizontal ? b.rect.x + b.rect.w / 2 : b.rect.y + b.rect.h / 2;
      return ac - bc || a.entity - b.entity;
    });
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const start = horizontal ? first.rect.x : first.rect.y;
    const end = horizontal
      ? last.rect.x + last.rect.w
      : last.rect.y + last.rect.h;
    const occupied = ordered.reduce(
      (sum, item) => sum + (horizontal ? item.rect.w : item.rect.h),
      0,
    );
    const gap = (end - start - occupied) / (ordered.length - 1);
    let cursor = start;
    return ordered.map((item) => {
      const position = horizontal ? item.rect.x : item.rect.y;
      const delta = clean(cursor - position);
      cursor += (horizontal ? item.rect.w : item.rect.h) + gap;
      return {
        entity: item.entity,
        dx: horizontal ? delta : 0,
        dy: horizontal ? 0 : delta,
      };
    }).filter((delta) => delta.dx !== 0 || delta.dy !== 0);
  }

  const reference = targets.find((item) => item.entity === primaryId) ?? targets[targets.length - 1];
  const refX = command === 'left'
    ? reference.rect.x
    : command === 'right'
      ? reference.rect.x + reference.rect.w
      : reference.rect.x + reference.rect.w / 2;
  const refY = command === 'top'
    ? reference.rect.y
    : command === 'bottom'
      ? reference.rect.y + reference.rect.h
      : reference.rect.y + reference.rect.h / 2;

  return targets
    .filter((item) => item.entity !== reference.entity)
    .map((item) => {
      let dx = 0;
      let dy = 0;
      if (command === 'left') dx = refX - item.rect.x;
      else if (command === 'center') dx = refX - (item.rect.x + item.rect.w / 2);
      else if (command === 'right') dx = refX - (item.rect.x + item.rect.w);
      else if (command === 'top') dy = refY - item.rect.y;
      else if (command === 'middle') dy = refY - (item.rect.y + item.rect.h / 2);
      else if (command === 'bottom') dy = refY - (item.rect.y + item.rect.h);
      return { entity: item.entity, dx: clean(dx), dy: clean(dy) };
    })
    .filter((delta) => delta.dx !== 0 || delta.dy !== 0);
}
