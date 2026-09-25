/** Brick gameplay adapted from Unity Technologies 2d-techdemos (MIT). */
type SceneEntity = EngineApi['snapshot']['entities'][number];
const removed = new Set<number>();

function setComponent(entity: SceneEntity, component: string, value: unknown): void {
  engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: entity.entity, component, value }));
}

function onSceneLoaded(): void {
  removed.clear();
}

function onTick(dt: number): void {
  if (engine.input.pressedKeys.includes('KeyR')) { engine.reloadScene(); return; }
  const paddle = engine.snapshot.entities.find(entity => entity.name === 'Paddle');
  if (!paddle) return;
  const keys = engine.input.keys;
  const direction = Number(keys.includes('KeyD') || keys.includes('ArrowRight')) - Number(keys.includes('KeyA') || keys.includes('ArrowLeft'));
  const transform = paddle.components.Transform;
  transform.position[0] = Math.max(1.5, Math.min(14.5, transform.position[0] + direction * 5 * dt));
  setComponent(paddle, 'Transform', transform);
}

function collisionPair(event: PhysicsCollisionInfo): SceneEntity[] {
  return engine.snapshot.entities.filter(entity => String(entity.entity) === event.firstEntity || String(entity.entity) === event.secondEntity);
}

function onCollisionEnter2D(event: PhysicsCollisionInfo): void {
  const pair = collisionPair(event);
  if (!pair.some(entity => entity.name === 'Ball')) return;
  const brick = pair.find(entity => entity.name?.startsWith('Brick '));
  if (brick && !removed.has(brick.entity)) {
    removed.add(brick.entity);
    engine.pushCommandJson(JSON.stringify({ op: 'despawn', entity: brick.entity }));
  }
}

function onTriggerEnter2D(event: PhysicsCollisionInfo): void {
  const pair = collisionPair(event);
  if (pair.some(entity => entity.name === 'Ball') && pair.some(entity => entity.name === 'Game End')) engine.reloadScene();
}
