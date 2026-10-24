// Author: MiYu. Interactive preview controls for native imported particle definitions.
type PreviewEntity = EngineApi['snapshot']['entities'][number];
let playing = true;
let elapsed = 0;
let hudClock = 0;
let replayTicks = 0;
let yaw = 0;
let elevation = 0.2;
let distance = 8;
let background = 0;
const backgrounds = [[0.025, 0.03, 0.045, 1], [0.22, 0.22, 0.22, 1], [0.72, 0.74, 0.78, 1]];

function write(entity: PreviewEntity, component: string, value: unknown): void {
  engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: entity.entity, component, value }));
}

function emitters(): PreviewEntity[] {
  return engine.snapshot.entities.filter(entity => !!entity.components.ParticleEmitter3D?.definition);
}

function setPlaying(value: boolean): void {
  playing = value;
  for (const entity of emitters()) write(entity, 'ParticleEmitter3D', { ...entity.components.ParticleEmitter3D, playing: value });
  hudClock = 1;
}

function updateCamera(): void {
  const camera = engine.snapshot.entities.find(entity => entity.name === 'Preview Camera');
  if (!camera) return;
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cp = Math.cos(-elevation / 2), sp = Math.sin(-elevation / 2);
  write(camera, 'Transform', { position: [Math.sin(yaw) * distance * Math.cos(elevation), 0.5 + Math.sin(elevation) * distance, Math.cos(yaw) * distance * Math.cos(elevation)], rotation: [cy * sp, sy * cp, -sy * sp, cy * cp], scale: [1, 1, 1] });
}

function updateBackground(): void {
  const color = backgrounds[background];
  engine.setClearColor(color[0], color[1], color[2], color[3]);
  const camera = engine.snapshot.entities.find(entity => entity.name === 'Preview Camera');
  if (camera) write(camera, 'Camera3D', { ...camera.components.Camera3D, clear_flags: 'solid_color', background_color: color });
}

function onSceneLoaded(): void {
  playing = true; elapsed = 0; hudClock = 1; replayTicks = 0; yaw = 0; elevation = 0.2; distance = 8; background = 0;
  updateCamera(); updateBackground();
}

function onTick(dt: number): void {
  const keys = engine.input.keys, pressed = engine.input.pressedKeys;
  if (replayTicks > 0 && --replayTicks === 0) setPlaying(true);
  if (pressed.includes('Space')) { replayTicks = 0; setPlaying(!playing); }
  if (pressed.includes('KeyX')) { replayTicks = 0; setPlaying(false); elapsed = 0; }
  if (pressed.includes('KeyR')) { setPlaying(false); elapsed = 0; replayTicks = 2; }
  if (pressed.includes('KeyB')) { background = (background + 1) % backgrounds.length; updateBackground(); }
  const orbit = Number(keys.includes('ArrowRight')) - Number(keys.includes('ArrowLeft'));
  const rise = Number(keys.includes('ArrowUp')) - Number(keys.includes('ArrowDown'));
  const zoom = Number(keys.includes('KeyS')) - Number(keys.includes('KeyW'));
  if (pressed.includes('Home')) { yaw = 0; elevation = 0.2; distance = 8; updateCamera(); }
  if (orbit || rise || zoom) {
    yaw += orbit * dt;
    elevation = Math.max(-1.2, Math.min(1.2, elevation + rise * dt * 0.6));
    distance = Math.max(0.5, Math.min(200, distance + zoom * dt * Math.max(1, distance * 0.7)));
    updateCamera();
  }
  if (playing) elapsed += dt;
  hudClock += dt;
  if (hudClock >= 0.1) {
    hudClock = 0;
    const status = engine.snapshot.entities.find(entity => entity.name === 'Preview Status');
    if (status) write(status, 'Text', { ...status.components.Text, text: `${playing ? 'PLAYING' : 'STOPPED'}    ${elapsed.toFixed(1)} s    ${emitters().length} imported emitters    Distance ${distance.toFixed(1)}` });
  }
}
