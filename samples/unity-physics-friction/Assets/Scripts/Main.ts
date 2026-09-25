/** Native physics controls, timed source spawners, and labels. */
type PhysicsSampleData = { slug: string; cameraSize: number; drag: { frequency: number; damping: number; layerMask: number } | null; spawners: Record<string, any>[]; labels: { label: string; owner: string; offset: number[] }[] };
let physicsTime = 0;
let physicsSpawned = 0;
let physicsSeed = 0x2d2019;
let physicsLabels = true;
let physicsDrag: { entity: number; anchor: number[] } | null = null;
const physicsCommand = (value: object): void => engine.pushCommandJson(JSON.stringify(value));

function physicsRandom(): number {
  physicsSeed ^= physicsSeed << 13; physicsSeed ^= physicsSeed >>> 17; physicsSeed ^= physicsSeed << 5;
  return (physicsSeed >>> 0) / 4294967296;
}
function physicsLinear(value: number): number { return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }
function onSceneLoaded(): void { physicsTime = 0; physicsSpawned = 0; physicsSeed = 0x2d2019; physicsLabels = true; physicsDrag = null; }

function onTick(dt: number): void {
  const input = engine.input, entities = engine.snapshot.entities;
  if (input.pressedKeys.includes('KeyR')) { engine.reloadScene(); return; }
  if (input.pressedKeys.includes('KeyH')) {
    physicsLabels = !physicsLabels;
    for (const entity of entities) if (entity.components.Text) physicsCommand({ op: 'setComponent', entity: entity.entity, component: 'Text', value: { ...entity.components.Text, enabled: physicsLabels } });
  }
  while (physicsSpawned < 5 && physicsTime + 1e-6 >= physicsSpawned && physicsData.spawners.length) {
    for (let i = 0; i < physicsData.spawners.length; i++) {
      const components = JSON.parse(JSON.stringify(physicsData.spawners[i]));
      components.SpriteRenderer.color = [physicsLinear(physicsRandom()), physicsLinear(physicsRandom()), physicsLinear(physicsRandom()), 1];
      physicsCommand({ op: 'spawn', name: `Spawn ${physicsSpawned} ${i}`, components });
    }
    physicsSpawned++;
  }
  physicsTime += dt;
  for (const binding of physicsData.labels) {
    const label = entities.find(entity => entity.name === binding.label), owner = entities.find(entity => entity.name === binding.owner);
    if (label && owner && physicsLabels) physicsCommand({ op: 'setComponent', entity: label.entity, component: 'RectTransform', value: { ...label.components.RectTransform, anchored_position: [binding.offset[0] + owner.components.Transform.position[0] * 90, binding.offset[1] - owner.components.Transform.position[1] * 90] } });
  }
  if (!physicsData.drag) return;
  if (!input.buttons.includes(0)) {
    if (physicsDrag) physicsCommand({ op: 'removeComponent', entity: physicsDrag.entity, component: 'TargetJoint2D' });
    physicsDrag = null;
    const line = entities.find(entity => entity.name === 'Drag Line');
    if (line) physicsCommand({ op: 'despawn', entity: line.entity });
    return;
  }
  const [width, height] = input.viewport, [px, py] = input.pointer;
  if (width <= 0 || height <= 0 || px < 0 || py < 0 || px >= width || py >= height) return;
  const point = [(px / width - .5) * 6 * width / height, (.5 - py / height) * 6];
  if (input.pressedButtons.includes(0)) {
    for (const entity of entities) {
      const c = entity.components, t = c.Transform;
      if (!t || c.Rigidbody2D?.body_type !== 'dynamic' || !(physicsData.drag.layerMask & (1 << (c.Layer?.value ?? 0)))) continue;
      const angle = 2 * Math.atan2(t.rotation[2], t.rotation[3]), dx = point[0] - t.position[0], dy = point[1] - t.position[1];
      const local = [(dx * Math.cos(angle) + dy * Math.sin(angle)) / t.scale[0], (-dx * Math.sin(angle) + dy * Math.cos(angle)) / t.scale[1]];
      const shape = c.BoxCollider2D ?? c.CircleCollider2D;
      if (!shape) continue;
      const sx = local[0] - shape.offset[0], sy = local[1] - shape.offset[1];
      const hit = c.BoxCollider2D ? Math.abs(sx) <= shape.size[0] / 2 && Math.abs(sy) <= shape.size[1] / 2 : Math.hypot(sx, sy) <= shape.radius;
      if (hit) { physicsDrag = { entity: entity.entity, anchor: local }; break; }
    }
  }
  if (!physicsDrag) return;
  const entity = entities.find(value => value.entity === physicsDrag!.entity);
  if (!entity) { physicsDrag = null; return; }
  physicsCommand({ op: 'setComponent', entity: entity.entity, component: 'TargetJoint2D', value: { enabled: true, anchor: physicsDrag.anchor, target: point, frequency: physicsData.drag.frequency, damping_ratio: physicsData.drag.damping, max_force: 1000 } });
  const t = entity.components.Transform, angle = 2 * Math.atan2(t.rotation[2], t.rotation[3]);
  const ax = physicsDrag.anchor[0] * t.scale[0], ay = physicsDrag.anchor[1] * t.scale[1];
  const anchor = [t.position[0] + ax * Math.cos(angle) - ay * Math.sin(angle), t.position[1] + ax * Math.sin(angle) + ay * Math.cos(angle)];
  const value = { points: [anchor, point], width: .015, color: [0, 1, 1, 1], sorting_order: 100 };
  const line = entities.find(value => value.name === 'Drag Line');
  if (line) physicsCommand({ op: 'setComponent', entity: line.entity, component: 'Line2D', value });
  else physicsCommand({ op: 'spawn', name: 'Drag Line', components: { Transform: {}, Line2D: value } });
}
