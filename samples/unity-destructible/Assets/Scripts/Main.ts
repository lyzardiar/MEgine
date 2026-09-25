/** Destructible gameplay adapted from Unity Technologies 2d-techdemos (MIT). */
type Cell = typeof sourceData.cells[number];
type SceneEntity = EngineApi['snapshot']['entities'][number];
type Rules = typeof sourceData.floor;
const foreground = new Map<string, Cell>();
const background = new Map<string, Cell>();
const exploded = new Set<string>();
let effects: Array<{ name: string; age: number }> = [];
let effectId = 0;
const key = (x: number, y: number): string => `${x},${y}`;

function setComponent(entity: SceneEntity, component: string, value: unknown): void {
  engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: entity.entity, component, value }));
}

function onSceneLoaded(): void {
  foreground.clear(); background.clear(); exploded.clear(); effects = []; effectId = 0;
  for (const source of sourceData.cells) (source.layer === 'Foreground' ? foreground : background).set(key(source.x, source.y), { ...source });
}

function rotate(x: number, y: number, turns: number): [number, number] {
  for (let i = 0; i < turns; i++) [x, y] = [y, -x];
  return [x, y];
}

function evaluateRules(rules: Rules, map: Map<string, Cell>, cell: Cell): { sprite: string; turns: number } {
  for (const rule of rules.rules) {
    for (let turns = 0; turns < (rule.rotate ? 4 : 1); turns++) {
      const matches = rule.neighbors.every((condition, index) => {
        if (condition === 0) return true;
        const offset = rotate(rule.positions[index][0], rule.positions[index][1], turns);
        const same = map.get(key(cell.x + offset[0], cell.y + offset[1]))?.tile === cell.tile;
        return condition === 1 ? same : !same;
      });
      if (matches) return { sprite: rule.sprite, turns };
    }
  }
  return { sprite: rules.defaultSprite, turns: 0 };
}

function refreshTiles(byName: Map<string | null, SceneEntity>): void {
  for (const cell of [...foreground.values(), ...background.values()]) {
    if (cell.tile !== 'Destructible' && cell.tile !== 'FloorExploded') continue;
    const entity = byName.get(cell.name);
    if (!entity) continue;
    const foregroundCell = cell.layer === 'Foreground';
    const result = evaluateRules(foregroundCell ? sourceData.destructible : sourceData.floor, foregroundCell ? foreground : background, cell);
    if (foregroundCell) {
      const offsets = [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
      let mask = 0;
      offsets.forEach(([x, y], bit) => {
        const offset = rotate(x, y, result.turns);
        if (exploded.has(key(cell.x + offset[0], cell.y + offset[1]))) mask |= 1 << bit;
      });
      const group = sourceData.decals.find(candidate => candidate.sprite === result.sprite);
      if (group) result.sprite = (group.variants as Record<string, string | undefined>)[String(mask & group.mask)] ?? result.sprite;
    }
    const angle = -result.turns * Math.PI / 2;
    const rotation = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
    if (entity.components.SpriteRenderer.sprite !== result.sprite) setComponent(entity, 'SpriteRenderer', { ...entity.components.SpriteRenderer, sprite: result.sprite });
    if (entity.components.Transform.rotation.some((value: number, i: number) => Math.abs(value - rotation[i]) > 0.00001)) setComponent(entity, 'Transform', { ...entity.components.Transform, rotation });
  }
}

function explodeCell(x: number, y: number, byName: Map<string | null, SceneEntity>): void {
  const cell = foreground.get(key(x, y));
  if (cell?.tile === 'Border') return;
  exploded.add(key(x, y));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const position = key(x + dx, y + dy);
    if (foreground.has(position)) {
      const floor = background.get(position);
      if (floor) floor.tile = 'FloorExploded';
    }
  }
  if (cell) {
    const entity = byName.get(cell.name);
    if (entity) engine.pushCommandJson(JSON.stringify({ op: 'despawn', entity: entity.entity }));
    foreground.delete(key(x, y));
  }
  const name = `Explosion ${effectId++}`;
  effects.push({ name, age: 0 });
  engine.pushCommandJson(JSON.stringify({ op: 'spawn', name, components: {
    Transform: { position: [x + 0.5, y + 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    SpriteRenderer: { sprite: sourceData.explosions[0].sprite, size: [1, 1], sorting_order: 1 },
  } }));
}

function onTick(dt: number): void {
  if (engine.input.pressedKeys.includes('KeyR')) { engine.reloadScene(); return; }
  const byName = new Map(engine.snapshot.entities.map(entity => [entity.name, entity]));
  effects = effects.filter(effect => {
    effect.age += dt;
    const entity = byName.get(effect.name);
    if (!entity) return true;
    let sprite = sourceData.explosions[0].sprite;
    for (const frame of sourceData.explosions) if (effect.age >= frame.time) sprite = frame.sprite;
    if (!sprite) { engine.pushCommandJson(JSON.stringify({ op: 'despawn', entity: entity.entity })); return false; }
    if (entity.components.SpriteRenderer.sprite !== sprite) setComponent(entity, 'SpriteRenderer', { ...entity.components.SpriteRenderer, sprite });
    return true;
  });
  if (!engine.input.pressedButtons.includes(0)) return;
  const [width, height] = engine.input.viewport;
  const [px, py] = engine.input.pointer;
  const x = Math.floor((px / width - 0.5) * 16 * width / height);
  const y = Math.floor((0.5 - py / height) * 16);
  for (const [dx, dy] of [[0,0],[-1,0],[-2,0],[1,0],[2,0],[0,-1],[0,-2],[0,1],[0,2]]) explodeCell(x + dx, y + dy, byName);
  refreshTiles(byName);
}
