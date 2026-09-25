/** Interactive controls for the source's two static normal-mapping scenes. */
let normalVariant = 0;
let normalEnabled = true;
let normalControls = true;

function onSceneLoaded(): void {
  const tile = engine.snapshot.entities.find(entity => entity.components.MaterialPropertyBlock);
  normalVariant = tile?.components.MaterialPropertyBlock.custom_parameter_values[4][1] === 1 ? 1 : 0;
  normalEnabled = normalVariant === 0;
  normalControls = true;
}

function onTick(): void {
  const input = engine.input;
  if (input.pressedKeys.includes('Digit1')) { engine.loadScene(normalData.variants[0].scene); return; }
  if (input.pressedKeys.includes('Digit2')) { engine.loadScene(normalData.variants[1].scene); return; }
  if (input.pressedKeys.includes('KeyR')) { engine.reloadScene(); return; }
  if (input.pressedKeys.includes('KeyH')) {
    normalControls = !normalControls;
    const label = engine.snapshot.entities.find(entity => entity.name === 'Light Controls');
    if (label) engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: label.entity, component: 'Text', value: { ...label.components.Text, enabled: normalControls } }));
  }
  let changed = input.pressedKeys.includes('KeyN');
  if (changed) normalEnabled = !normalEnabled;
  const variant = normalData.variants[normalVariant];
  const lights = ['Blue Light', 'Orange Light'].map(name => engine.snapshot.entities.find(entity => entity.name === name)!);
  const positions = lights.map(entity => [...entity.components.Transform.position]);
  const [width, height] = input.viewport, [px, py] = input.pointer;
  if ((input.buttons.includes(0) || input.buttons.includes(2)) && width > 0 && height > 0 && px >= 0 && py >= 0 && px < width && py < height && !(normalControls && px < 355 * width / 960 && py < 185 * width / 960)) {
    const index = input.buttons.includes(2) ? 1 : 0;
    positions[index] = [(px / width - .5) * normalData.cameraSize * 2 * width / height + normalData.cameraPosition[0], (.5 - py / height) * normalData.cameraSize * 2 + normalData.cameraPosition[1], positions[index][2]];
    engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: lights[index].entity, component: 'Transform', value: { ...lights[index].components.Transform, position: positions[index] } }));
    changed = true;
  }
  if (!changed) return;
  const values = [[...positions[0], variant.lights.blue.position[3]], variant.lights.blue.color, [...positions[1], variant.lights.orange.position[3]], variant.lights.orange.color, [normalEnabled ? 1 : 0, ...variant.options.slice(1)], variant.ambient];
  for (const entity of engine.snapshot.entities) if (entity.components.SpriteRenderer?.material === 'Assets/Materials/Normal.mmat') {
    engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: entity.entity, component: 'MaterialPropertyBlock', value: { ...entity.components.MaterialPropertyBlock, custom_parameter_values: values } }));
  }
}
