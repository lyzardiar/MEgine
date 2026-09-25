/** Palette switching adapted from Unity Technologies 2d-techdemos (MIT). */
let activePalette = 1;

function onSceneLoaded(): void { activePalette = 1; }

function swapPalette(index: number): void {
  const next = (index + 3) % 3;
  if (next === activePalette) return;
  const byName = new Map(engine.snapshot.entities.map(entity => [entity.name, entity]));
  for (let i = 0; i < paletteData.cells.length; i++) {
    const entity = byName.get(paletteData.cells[i].name);
    if (!entity) continue;
    const visual = paletteData.palettes[next][i];
    const animated = visual.frames.length > 0;
    const component = animated ? 'AnimatedSprite2D' : 'SpriteRenderer';
    const removed = animated ? 'SpriteRenderer' : 'AnimatedSprite2D';
    if (entity.components[removed]) engine.pushCommandJson(JSON.stringify({ op: 'removeComponent', entity: entity.entity, component: removed }));
    engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: entity.entity, component, value: animated ? { frames: visual.frames, fps: visual.fps, color: visual.color, size: [1, 1] } : { sprite: visual.sprite, color: visual.color, size: [1, 1] } }));
    engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: entity.entity, component: 'Transform', value: { ...entity.components.Transform, rotation: visual.rotation } }));
  }
  const label = byName.get('Palette Controls');
  if (label) engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: label.entity, component: 'Text', value: { ...label.components.Text, text: `Palette ${'ABC'[next]}\n1 / Left: previous    2 / Right: next\nSpace: random    R: reset` } }));
  activePalette = next;
}

function onTick(): void {
  const keys = engine.input.pressedKeys;
  if (keys.includes('KeyR')) { engine.reloadScene(); return; }
  if (keys.includes('Digit1') || keys.includes('ArrowLeft')) swapPalette(activePalette - 1);
  else if (keys.includes('Digit2') || keys.includes('ArrowRight')) swapPalette(activePalette + 1);
  else if (keys.includes('Space')) swapPalette(Math.floor(Math.random() * 3));
}
