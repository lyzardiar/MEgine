import type { Quat, Vec3 } from './math3d.ts';
import { add, dot, lookBasis, orbitEye, quatMul, quatRotateVec } from './math3d.ts';
import { pointBounds, transformBounds, type Bounds } from './viewportSpatial.ts';
import { buildWorldTransforms, resolvedTransform, type WorldTransformEntity } from './worldTransform.ts';
import { clampSceneCameraDistance } from './sceneZoom.ts';
import { readLine2DPoints } from './line2dEditing.ts';
import { cellLocalPosition, nearestGridSettings, normalizeTilemapData } from './tilemapModel.ts';
import type { OrbitCamera } from './sceneNavigation.ts';

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value: unknown, fallback: number): number {
  return Math.max(0.0001, Math.abs(finite(value, fallback)));
}

export type SpriteFrame = {
  pivot: Vec3;
  distance: number;
};

/**
 * Frame a SpriteRenderer/AnimatedSprite2D around its visual bounds rather than
 * around the Transform origin. This matters for sliced sprites with authored pivots.
 */
export function frameWorldSprite(
  worldPosition: readonly number[],
  worldRotation: readonly number[],
  worldScale: readonly number[],
  size: readonly number[],
  pivot: readonly number[],
): SpriteFrame {
  const width = positive(size[0], 1);
  const height = positive(size[1], 1);
  const scaleX = positive(worldScale[0], 1);
  const scaleY = positive(worldScale[1], 1);
  const pivotX = Math.max(0, Math.min(1, finite(pivot[0], 0.5)));
  const pivotY = Math.max(0, Math.min(1, finite(pivot[1], 0.5)));
  const position: Vec3 = [
    finite(worldPosition[0], 0),
    finite(worldPosition[1], 0),
    finite(worldPosition[2], 0),
  ];
  const rotation: Quat = [
    finite(worldRotation[0], 0),
    finite(worldRotation[1], 0),
    finite(worldRotation[2], 0),
    finite(worldRotation[3], 1),
  ];
  const visualCenter = quatRotateVec(rotation, [
    (0.5 - pivotX) * width * scaleX,
    (0.5 - pivotY) * height * scaleY,
    0,
  ]);
  return {
    pivot: add(position, visualCenter),
    distance: Math.max(1, width * scaleX, height * scaleY) * 1.35,
  };
}


// MiYu: resolve selected roots and descendants once, including empty grouping nodes without recursion loops.
export function sceneFrameEntities<T extends { entity: number; parent?: number | null }>(entities: readonly T[], selected: readonly number[]): T[] {
  const children = new Map<number, T[]>(), byId = new Map(entities.map(entity => [entity.entity, entity]));
  for (const entity of entities) if (entity.parent != null) { const list = children.get(entity.parent) ?? []; list.push(entity); children.set(entity.parent, list); }
  const result: T[] = [], seen = new Set<number>(), pending = [...selected];
  while (pending.length) { const id = pending.pop()!; if (seen.has(id)) continue; seen.add(id); const entity = byId.get(id); if (entity) result.push(entity); for (const child of children.get(id) ?? []) pending.push(child.entity); }
  return result;
}

export function frameSceneBounds(bounds: Bounds, camera: OrbitCamera, aspect = 1): SpriteFrame {
  const pivot = bounds.min.map((value, axis) => (value + bounds.max[axis]) * 0.5) as Vec3;
  const basis = lookBasis(orbitEye(pivot, camera.yaw, camera.pitch, 1), pivot);
  const tanY = Math.tan(Math.PI / 6), tanX = tanY * Math.max(0.01, Number.isFinite(aspect) ? aspect : 1);
  let distance = 0.5;
  for (let i = 0; i < 8; i++) {
    const offset = bounds.min.map((value, axis) => ((i & (1 << axis)) ? bounds.max[axis] : value) - pivot[axis]) as Vec3;
    const depth = dot(offset, basis.forward);
    distance = Math.max(distance, Math.abs(dot(offset, basis.right)) * 1.15 / tanX - depth, Math.abs(dot(offset, basis.up)) * 1.15 / tanY - depth, 0.2 - depth);
  }
  return { pivot, distance: clampSceneCameraDistance(distance) };
}

// MiYu: terrain patches use four two-unit cells per side; relief and rock skirts extend their conservative bounds.
function terrainFrameBounds(mesh: string): Bounds | null {
  const match = /^terrain4([rhw]?):([0-9a-f]+)$/i.exec(mesh); if (!match) return null;
  const [, kind, data] = match, basic = kind === '', heights = (basic ? data : data.slice(2, 146)).split('').map(value => parseInt(value, 16));
  if (basic ? data.length !== 64 : data.length < 146) return null;
  const relief = kind === 'h' || kind === 'w' ? (data.slice(146, 244).match(/../g) ?? []).map(value => (parseInt(value, 16) - 128) / 16) : [0];
  const radius = basic ? 4 : 5;
  return { min: [-radius, -0.25 + Math.min(0, ...relief) - (kind === 'w' ? 0.75 : 0), -radius], max: [radius, Math.max(0, ...heights) + Math.max(0, ...relief), radius] };
}

export function frameSceneSelection(entities: readonly WorldTransformEntity[], selected: readonly number[], camera: OrbitCamera, aspect = 1, models?: ReadonlyMap<string, Bounds>): SpriteFrame | null {
  const members = sceneFrameEntities(entities, selected);
  const transforms = buildWorldTransforms(entities, members.map(entity => entity.entity));
  const points: Vec3[] = [], origins: Vec3[] = [];
  for (const entity of members) {
    const transform = resolvedTransform(transforms, entity.entity); if (!transform) continue;
    origins.push(transform.position);
    const mesh = entity.components.MeshRenderer as { mesh?: string } | undefined;
    const sprite = (entity.components.AnimatedSprite2D ?? entity.components.SpriteRenderer) as { size?: number[]; pivot?: number[] } | undefined;
    let local: Bounds | null = null;
    if (mesh) local = models?.get(String(mesh.mesh ?? 'cube')) ?? terrainFrameBounds(String(mesh.mesh ?? 'cube')) ?? { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
    else if (sprite) {
      const w = positive(sprite.size?.[0], 1), h = positive(sprite.size?.[1], 1), x = finite(sprite.pivot?.[0], 0.5), y = finite(sprite.pivot?.[1], 0.5);
      local = { min: [-x * w, -y * h, 0], max: [(1 - x) * w, (1 - y) * h, 0] };
    }
    if (!mesh && !sprite) {
      const line = entity.components.Line2D as { points?: unknown; width?: number } | undefined;
      const tilemap = entity.components.Tilemap as { cells?: unknown; sprites?: unknown; tile_anchor?: number[] } | undefined;
      const batch = entity.components.SpriteBatch2D as { size?: number[]; instances?: number[][] } | undefined;
      const geometry: Vec3[] = [];
      if (line) {
        const radius = Math.max(0, finite(line.width, 0)) * 0.5;
        for (const [x, y] of readLine2DPoints(line.points)) geometry.push([x - radius, y - radius, 0], [x + radius, y + radius, 0]);
      } else if (tilemap) {
        const grid = nearestGridSettings(entities, entity.entity), anchor = tilemap.tile_anchor ?? [0.5, 0.5];
        if (grid.cellLayout === 'Rectangle') for (const cell of normalizeTilemapData(tilemap.cells, tilemap.sprites).cells) {
          const [x, y] = cellLocalPosition(cell, grid), ax = Math.max(0, Math.min(1, finite(anchor[0], 0.5))), ay = Math.max(0, Math.min(1, finite(anchor[1], 0.5)));
          const center = add(transform.position, quatRotateVec(transform.rotation, [x * transform.scale[0], y * transform.scale[1], 0])), w = grid.cellSize[0] * Math.abs(transform.scale[0]), h = grid.cellSize[1] * Math.abs(transform.scale[1]);
          for (const dx of [-ax * w, (1 - ax) * w]) for (const dy of [-ay * h, (1 - ay) * h]) points.push(add(center, quatRotateVec(transform.rotation, [dx, dy, 0])));
        }
      } else if (batch) {
        for (const instance of (batch.instances ?? []).slice(0, 8192)) {
          if (instance.length !== 4 || !instance.every(Number.isFinite) || instance[3] <= 0) continue;
          const [x, y, angle, size] = instance, hw = positive(batch.size?.[0], 1) * size * Math.abs(transform.scale[0]) / 2, hh = positive(batch.size?.[1], 1) * size * Math.abs(transform.scale[1]) / 2;
          const center = add(transform.position, quatRotateVec(transform.rotation, [x * transform.scale[0], y * transform.scale[1], 0])), rotation = quatMul(transform.rotation, [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)]);
          for (const sx of [-1, 1]) for (const sy of [-1, 1]) points.push(add(center, quatRotateVec(rotation, [sx * hw, sy * hh, 0])));
        }
      }
      local = pointBounds(geometry);
    }
    const world = local && transformBounds(local, transform);
    if (world) points.push(world.min, world.max);
  }
  const bounds = pointBounds(points.length ? points : origins);
  return bounds ? frameSceneBounds(bounds, camera, aspect) : null;
}
