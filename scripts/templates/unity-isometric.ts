/** Source movement, directional animation, height triggers and camera follow. */
let isoDirection = 0;
let isoAnimation = '';
let isoTime = 0;
let isoHeight = 2;
const isoDirections = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE'];
const isoCommand = (value: object): void => engine.pushCommandJson(JSON.stringify(value));
const isoSet = (entity: number, component: string, value: object): void => isoCommand({ op: 'setComponent', entity, component, value });
function onSceneLoaded(): void { isoDirection = 0; isoAnimation = ''; isoTime = 0; isoHeight = 2; }
function onTick(dt: number): void {
  const input = engine.input, entities = engine.snapshot.entities;
  if (input.pressedKeys.includes('KeyR')) { engine.reloadScene(); return; }
  const player = entities.find(e => e.name === 'Player')!, witch = entities.find(e => e.name === 'Witch')!, camera = entities.find(e => e.name === 'Main Camera')!;
  const held = (a: string, b: string): number => input.keys.includes(a) || input.keys.includes(b) ? 1 : 0;
  let x = held('KeyD', 'ArrowRight') - held('KeyA', 'ArrowLeft'), y = held('KeyW', 'ArrowUp') - held('KeyS', 'ArrowDown');
  const length = Math.hypot(x, y), moving = length > 0;
  if (moving) { x /= length; y /= length; isoDirection = Math.floor(((Math.atan2(-x, y) * 180 / Math.PI + 382.5) % 360) / 45); }
  isoSet(player.entity, 'Rigidbody2D', { ...player.components.Rigidbody2D, velocity: [x * 2, y * 2] });
  const animation = `${moving ? 'Run' : 'Static'} ${isoDirections[isoDirection]}`;
  if (animation !== isoAnimation) { isoAnimation = animation; isoTime = 0; }
  const frames = (isoData.animations as Record<string, any[]>)[animation], frame = frames[Math.floor(isoTime * 12 + 1e-6) % frames.length];
  const position = player.components.Transform.position;
  isoSet(witch.entity, 'SpriteRenderer', { ...witch.components.SpriteRenderer, ...frame, sorting_order: Math.round((-position[1] * .5 + isoHeight * .25) * 100000) * 10 });
  isoTime += dt;
  // Unity source passes deltaTime as SmoothDamp's maxSpeed and rebuilds velocity each update.
  const current = camera.components.Transform.position, diff = [current[0] - position[0], current[1] - position[1]];
  const distance = Math.hypot(...diff), limit = dt;
  const change = diff.map(v => distance > limit ? v * limit / distance : v);
  const decay = 1 / (1 + 2 * dt + .48 * (2 * dt) ** 2 + .235 * (2 * dt) ** 3);
  let next = change.map((v, i) => current[i] - v + (v + (-diff[i] * 10 + 2 * v) * dt) * decay);
  if ((position[0] - current[0]) * (next[0] - position[0]) + (position[1] - current[1]) * (next[1] - position[1]) > 0) next = position.slice(0, 2);
  isoSet(camera.entity, 'Transform', { ...camera.components.Transform, position: [...next, current[2]] });
}
function onTriggerExit2D(event: PhysicsCollisionInfo): void {
  const entities = engine.snapshot.entities, player = entities.find(e => e.name === 'Player')!;
  const ids = [Number(event.firstEntity), Number(event.secondEntity)];
  if (!ids.includes(player.entity)) return;
  const trigger = entities.find(e => ids.includes(e.entity) && e.entity !== player.entity);
  const rule = isoData.triggers.find(t => t.name === trigger?.name);
  if (!rule || isoHeight === rule.height) return;
  isoHeight = rule.height;
  for (const name of rule.disable) {
    const entity = entities.find(e => e.name === name)!, spec = isoData.colliders.find(c => c.name === name)!;
    isoCommand({ op: 'removeComponent', entity: entity.entity, component: spec.kind });
  }
  for (const name of rule.enable) {
    const entity = entities.find(e => e.name === name)!, spec = isoData.colliders.find(c => c.name === name)!;
    isoSet(entity.entity, spec.kind, spec.value);
  }
  isoSet(player.entity, 'Transform', { ...player.components.Transform, position: [...player.components.Transform.position.slice(0, 2), isoHeight] });
}
