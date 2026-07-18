import type { Vec3 } from './math3d.ts';

export type SpriteSpawnOptions = {
  name?: string;
  position?: readonly number[];
  size?: readonly number[];
  pivot?: readonly number[];
  color?: readonly number[];
  parent?: number | null;
};

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value: unknown, fallback: number): number {
  return Math.max(0.0001, Math.abs(finite(value, fallback)));
}

export function spriteEntityName(sprite: string): string {
  const normalized = String(sprite ?? '').trim().replace(/\\/g, '/');
  const [texture, slice] = normalized.split('#', 2);
  if (slice?.trim()) return slice.trim();
  const leaf = texture.split('/').pop()?.trim() || 'Sprite';
  return leaf.replace(/\.[^.]+$/, '') || 'Sprite';
}

export function createSpriteSpawnComponents(
  sprite: string,
  options: SpriteSpawnOptions = {},
): { name: string; parent: number | null; components: Record<string, unknown> } {
  const position = options.position ?? [0, 0, 0];
  const size = options.size ?? [1, 1];
  const pivot = options.pivot ?? [0.5, 0.5];
  const color = options.color ?? [1, 1, 1, 1];
  const normalizedPivot: [number, number] = [
    Math.max(0, Math.min(1, finite(pivot[0], 0.5))),
    Math.max(0, Math.min(1, finite(pivot[1], 0.5))),
  ];
  return {
    name: options.name?.trim() || spriteEntityName(sprite),
    parent: options.parent ?? null,
    components: {
      Transform: {
        position: [
          finite(position[0], 0),
          finite(position[1], 0),
          finite(position[2], 0),
        ] as Vec3,
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
      SpriteRenderer: {
        sprite: String(sprite || 'white'),
        color: [
          Math.max(0, Math.min(1, finite(color[0], 1))),
          Math.max(0, Math.min(1, finite(color[1], 1))),
          Math.max(0, Math.min(1, finite(color[2], 1))),
          Math.max(0, Math.min(1, finite(color[3], 1))),
        ],
        size: [positive(size[0], 1), positive(size[1], 1)],
        pivot: normalizedPivot,
        flip_x: false,
        flip_y: false,
        sorting_layer: 'default',
        sorting_order: 0,
      },
    },
  };
}
