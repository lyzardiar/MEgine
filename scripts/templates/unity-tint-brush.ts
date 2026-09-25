/** Runtime counterpart of Unity's Tint Brush and Tint Brush Smooth. */
const tintColors = new Map<string, number[]>();
const tintUndo: Array<Array<[string, number[]]>> = [];
const brushColors = [[1, 0, 0, 1], [0, 1, 0, 1], [0, 0, 1, 1], [1, 1, 1, 1], [1, 0.5, 0, 1]];
const blendAmounts = [1, 0.5, 0];
let brushColor = brushColors[0], blendIndex = 0, showControls = true, lastCell = '';
const tintKey = (x: number, y: number): string => `${x},${y}`;
const tintAt = (x: number, y: number): number[] => tintColors.get(tintKey(x, y)) ?? [1, 1, 1, 1];
const tintLinear = (value: number): number => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const tintBlend = (old: number[], color: number[], blend: number): number[] => old.map((value, i) => value * (1 - blend) + color[i] * blend);

function onSceneLoaded(): void {
  tintColors.clear(); tintUndo.length = 0; brushColor = brushColors[0]; blendIndex = 0; showControls = true; lastCell = '';
  for (const [key, color] of Object.entries(tintData.tints)) tintColors.set(key, [...color]);
}

function refreshTint(): void {
  for (const entity of engine.snapshot.entities) {
    if (!entity.name?.startsWith('Tile ')) continue;
    const [, xText, yText] = entity.name.split(' '), x = Number(xText), y = Number(yText);
    const component = tintData.smooth ? 'MaterialPropertyBlock' : 'SpriteRenderer';
    const previous = entity.components[component];
    let value: Record<string, unknown>;
    if (tintData.smooth) {
      const colors: number[][] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) colors.push(tintAt(x + dx, y + dy));
      value = { ...previous, custom_parameter_values: colors };
    } else value = { ...previous, color: tintAt(x, y).map((part, i) => i === 3 ? part : tintLinear(part)) };
    if (JSON.stringify(previous) !== JSON.stringify(value)) engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: entity.entity, component, value }));
  }
}

function onTick(): void {
  const input = engine.input;
  if (input.pressedKeys.includes('KeyR')) { engine.reloadScene(); return; }
  let updateLabel = false;
  if (input.pressedKeys.includes('KeyH')) { showControls = !showControls; updateLabel = true; }
  if (input.pressedKeys.includes('KeyB')) { blendIndex = (blendIndex + 1) % blendAmounts.length; updateLabel = true; }
  for (let i = 0; i < brushColors.length; i++) if (input.pressedKeys.includes(`Digit${i + 1}`)) { brushColor = brushColors[i]; updateLabel = true; }
  if (input.pressedKeys.includes('KeyZ') && tintUndo.length) {
    tintColors.clear(); for (const [key, color] of tintUndo.pop()!) tintColors.set(key, color);
    refreshTint(); return;
  }
  const [width, height] = input.viewport, [px, py] = input.pointer;
  if (!input.buttons.length) lastCell = '';
  if (input.buttons.length && width > 0 && height > 0 && px >= 0 && py >= 0 && px < width && py < height && !(showControls && px < 280 * width / 960 && py < 230 * width / 960)) {
    const x = Math.floor((px / width - .5) * tintData.cameraSize * 2 * width / height), y = Math.floor((.5 - py / height) * tintData.cameraSize * 2);
    const key = tintKey(x, y), gesture = `${key}:${input.buttons.join(',')}`;
    if (gesture !== lastCell && (tintData.smooth || tintData.cells.some(cell => cell.x === x && cell.y === y))) {
      lastCell = gesture;
      if (input.buttons.includes(1)) { brushColor = [...tintAt(x, y)]; updateLabel = true; }
      else if (input.buttons.includes(0) || input.buttons.includes(2)) {
        const old = tintAt(x, y), color = input.buttons.includes(2) ? [1, 1, 1, 1] : tintBlend(old, brushColor, blendAmounts[blendIndex]);
        if (color.some((part, i) => part !== old[i])) {
          tintUndo.push([...tintColors.entries()].map(([key, value]) => [key, [...value]]));
          if (tintUndo.length > 64) tintUndo.shift();
          tintColors.set(key, color); refreshTint();
        }
      }
    }
  }
  if (updateLabel) {
    const label = engine.snapshot.entities.find(entity => entity.name === 'Brush Controls');
    if (label) engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: label.entity, component: 'Text', value: { ...label.components.Text, enabled: showControls, text: `${tintData.title}\nColor ${brushColor.slice(0, 3).map(value => Math.round(value * 255)).join(', ')} / ${blendAmounts[blendIndex] * 100}%\n1/2/3/4/5: color\nLeft: paint    Right: white\nMiddle: pick    B: blend\nZ: undo    R: reset    H: controls` } }));
  }
}
