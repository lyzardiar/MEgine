// Author: MiYu. Reuse fixed component bounds sources while observing model preview replacement every frame.
import type { PreviewMesh } from './modelPreview';
import { createOwnedTransformBoundsReader, pointBounds, transformBounds, type Bounds } from './viewportSpatial.ts';

type Source = { local: Bounds | null; path?: string };
const conservativeComponents = ['Camera3D', 'Camera2D', 'DirectionalLight', 'PointLight', 'SpotLight', 'Light2D', 'RectTransform', 'Tilemap', 'Line2D', 'SpriteBatch2D', 'SpineSkeleton', 'ParticleEmitter2D', 'ParticleEmitter3D', 'TrailRenderer2D', 'SampledEffect', 'BoxCollider3D', 'SphereCollider3D', 'BoxCollider2D', 'CircleCollider2D', 'PolygonCollider2D', 'EdgeCollider2D', 'TargetJoint2D'];
const unbounded: Source = { local: null };
const cube: Bounds = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
const previewBounds = new WeakMap<PreviewMesh, Bounds | null>();

function boundsSource(components: Record<string, unknown>): Source {
  // Helpers, complex batches and sampled effects retain their existing visibility and picking.
  if (conservativeComponents.some(key => components[key])) return unbounded;
  const mesh = components.MeshRenderer as Record<string, unknown> | undefined;
  if (mesh) {
    const path = String(mesh.mesh ?? 'cube');
    return { local: cube, path: /\.(?:gltf|glb)$/i.test(path) ? path : undefined };
  }
  const sprite = (components.AnimatedSprite2D ?? components.SpriteRenderer) as { size?: number[]; pivot?: number[] } | undefined;
  if (!sprite) return unbounded;
  const size = [0, 1].map(axis => Number.isFinite(Number(sprite.size?.[axis])) ? Math.abs(Number(sprite.size![axis])) : 1);
  const pivot = [0, 1].map(axis => Number.isFinite(Number(sprite.pivot?.[axis])) ? Number(sprite.pivot![axis]) : 0.5);
  // Mirror signs and authored pivots may offset the quad from its origin.
  const radius = size.map((v, axis) => v * Math.max(Math.abs(pivot[axis]), Math.abs(1 - pivot[axis])));
  return { local: { min: [-radius[0], -radius[1], 0], max: [radius[0], radius[1], 0] } };
}

export function createViewportEntityBoundsReader(readPreview: (path: string) => PreviewMesh | null) {
  const sources = new WeakMap<Record<string, unknown>, Source>();
  const readOwnedBounds = createOwnedTransformBoundsReader();
  return (components: Record<string, unknown>, transform: Parameters<typeof transformBounds>[1], owned = false): Bounds | null => {
    let source = owned ? sources.get(components) : undefined;
    if (!source) {
      source = boundsSource(components);
      if (owned) sources.set(components, source);
    }
    const preview = source.path ? readPreview(source.path) : null;
    let local = source.local;
    if (preview) {
      if (!previewBounds.has(preview)) previewBounds.set(preview, pointBounds(preview.positions));
      local = previewBounds.get(preview) ?? null;
    }
    return local ? (owned ? readOwnedBounds(local, transform) : transformBounds(local, transform)) : null;
  };
}
