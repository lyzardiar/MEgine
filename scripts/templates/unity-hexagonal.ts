/** Runtime brush for the official point-top hex coast. */
type HexCell = { x: number; y: number };
const hexKey = (x: number, y: number): string => `${x},${y}`;
const hexLand = new Map<string, HexCell>();
const hexOcean = new Set(hexData.ocean.map(cell => hexKey(cell.x, cell.y)));
const hexUndo: HexCell[][] = [];
let hexControls = true;

function hexPosition(x: number, y: number): number[] {
  return [(x + .5 * (y & 1)) * hexData.size[0], y * .75 * hexData.size[1], 0];
}

function hexVisual(cell: HexCell): { sprite: string; flip: boolean } {
  for (const rule of hexData.rules) for (const flip of rule.mirror ? [false, true] : [false]) {
    if (rule.positions.every(([dx, dy]) => {
      if (flip) dx = -dx - (dy & 1);
      return hexLand.has(hexKey(cell.x + dx + ((cell.y & 1) && (dy & 1) ? 1 : 0), cell.y + dy));
    })) return { sprite: rule.sprite, flip };
  }
  return { sprite: hexData.defaultSprite, flip: false };
}

function hexPick(wx: number, wy: number): HexCell | undefined {
  const row = Math.round(wy / (.75 * hexData.size[1]));
  for (let y = row - 1; y <= row + 1; y++) {
    const column = Math.round(wx / hexData.size[0] - .5 * (y & 1));
    for (let x = column - 1; x <= column + 1; x++) {
      const [cx, cy] = hexPosition(x, y), dx = Math.abs(wx - cx), dy = Math.abs(wy - cy);
      if (dx <= hexData.size[0] / 2 && dy <= hexData.size[1] / 2 - dx * hexData.size[1] / (2 * hexData.size[0])) return { x, y };
    }
  }
}

function onSceneLoaded(): void {
  hexLand.clear(); hexUndo.length = 0; hexControls = true;
  for (const cell of hexData.land) hexLand.set(hexKey(cell.x, cell.y), { x: cell.x, y: cell.y });
}

function refreshHex(): void {
  const entities = new Map(engine.snapshot.entities.filter(entity => entity.name?.startsWith('Land ')).map(entity => [entity.name, entity]));
  for (const cell of hexLand.values()) {
    const name = `Land ${cell.x} ${cell.y}`, entity = entities.get(name), visual = hexVisual(cell);
    if (!entity) engine.pushCommandJson(JSON.stringify({ op: 'spawn', name, components: { Transform: { position: hexPosition(cell.x, cell.y) }, SpriteRenderer: { sprite: visual.sprite, flip_x: visual.flip, size: [1, 68 / 60], sorting_order: cell.y * 32 + cell.x } } }));
    else {
      if (entity.components.SpriteRenderer.sprite !== visual.sprite || entity.components.SpriteRenderer.flip_x !== visual.flip) engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: entity.entity, component: 'SpriteRenderer', value: { ...entity.components.SpriteRenderer, sprite: visual.sprite, flip_x: visual.flip } }));
      entities.delete(name);
    }
  }
  for (const entity of entities.values()) engine.pushCommandJson(JSON.stringify({ op: 'despawn', entity: entity.entity }));
}

function onTick(): void {
  const input = engine.input;
  if (input.pressedKeys.includes('KeyR')) { engine.reloadScene(); return; }
  if (input.pressedKeys.includes('KeyH')) {
    hexControls = !hexControls;
    const label = engine.snapshot.entities.find(entity => entity.name === 'Brush Controls');
    if (label) engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: label.entity, component: 'Text', value: { ...label.components.Text, enabled: hexControls } }));
  }
  if (input.pressedKeys.includes('KeyZ') && hexUndo.length) {
    hexLand.clear(); for (const cell of hexUndo.pop()!) hexLand.set(hexKey(cell.x, cell.y), cell);
    refreshHex(); return;
  }
  if (!input.buttons.includes(0) && !input.buttons.includes(2)) return;
  const [width, height] = input.viewport, [px, py] = input.pointer;
  if (width <= 0 || height <= 0 || px < 0 || py < 0 || px >= width || py >= height || (hexControls && px < 280 * width / 960 && py < 200 * width / 960)) return;
  const cell = hexPick((px / width - .5) * hexData.cameraSize * 2 * width / height + hexData.cameraPosition[0], (.5 - py / height) * hexData.cameraSize * 2 + hexData.cameraPosition[1]);
  if (!cell) return;
  const key = hexKey(cell.x, cell.y), erase = input.buttons.includes(2);
  if (!hexOcean.has(key) || (erase ? !hexLand.has(key) : hexLand.has(key))) return;
  hexUndo.push([...hexLand.values()].map(value => ({ ...value }))); if (hexUndo.length > 64) hexUndo.shift();
  if (erase) hexLand.delete(key); else hexLand.set(key, cell);
  refreshHex();
}
