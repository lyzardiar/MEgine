/**
 * Pelican Island Ride / 鹈鹕环岛骑行 — interactive 3D coastal cycling showcase.
 *
 * The pelican pedals its vintage cruiser bicycle automatically around a closed-loop
 * tropical island road. Use WASD / Arrows to adjust speed or lane, C to cycle 4 cameras,
 * L to transition between Tropical Day and Golden Sunset, B to ring the brass bell
 * (triggering a happy wing flap), Space to pause, V to toggle HUD, and M to mute audio.
 *
 * Compiled by `npm run build:samples` to Main.js for MEgine runtime / editor Play.
 */

type Vec3 = [number, number, number];

const TAU = Math.PI * 2;
const WHEEL_RADIUS = 0.50;
const CRANK_RADIUS = 0.21;
const CRUISE_SPEED = 7.4;   // ~26.6 km/h relaxed island cruise
const MIN_SPEED = 2.6;
const MAX_SPEED = 14.5;

const CAMERA_MODES = [
  '镜头：侧后跟随  /  CHASE CAM',
  '镜头：骑行特写  /  CLOSE-UP',
  '镜头：环岛俯瞰  /  ISLAND OVERVIEW',
  '镜头：电影环绕  /  CINEMATIC ORBIT',
];

const HUD_NAMES = [
  'hud-title-bg', 'hud-title-bar', 'hud-eyebrow', 'hud-title',
  'hud-mode-bg', 'hud-camera', 'hud-lighting',
  'hud-ride-bg', 'hud-landmark', 'hud-stats', 'hud-bell-toast',
  'hud-hint-bg', 'hud-hint',
];

let initialized = false;
let entities: Record<string, any> = {};
let authored: Record<string, any> = {};
let sent: Record<string, string> = {};

// Ride state
let elapsed = 0;
let rideAngle = 0;
let laps = 1;
let speed = CRUISE_SPEED;
let lateral = 0;
let leanRoll = 0;
let wheelSpin = 0;
let pedalPhase = 0;
let paused = false;
let happyFlap = 0;
let toastTimer = 0;
let cameraMode = 0;
let orbitPhase = 0;
let hudVisible = true;
let muted = false;

// Lighting transition (0 = tropical day, 1 = golden sunset)
let sunsetTarget = 0;
let sunsetBlend = 0;
let envTextureTag = '';

// Smoothed camera state
let camPos: Vec3 = [0, 8, 12];
let camLook: Vec3 = [0, 3, 0];
let camFov = 52;

// --------------------------------------------------------------------------- math helpers

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const damp = (a: number, b: number, sharpness: number, dt: number): number =>
  a + (b - a) * (1 - Math.exp(-sharpness * dt));

function quaternion(yaw: number, pitch = 0, roll = 0): number[] {
  const hy = yaw * 0.5, hp = pitch * 0.5, hr = roll * 0.5;
  const sy = Math.sin(hy), cy = Math.cos(hy);
  const sp = Math.sin(hp), cp = Math.cos(hp);
  const sr = Math.sin(hr), cr = Math.cos(hr);
  return [
    cy * sp * cr + sy * cp * sr,
    sy * cp * cr - cy * sp * sr,
    cy * cp * sr - sy * sp * cr,
    cy * cp * cr + sy * sp * sr,
  ];
}

function lookAtQuat(eye: Vec3, target: Vec3, roll = 0): number[] {
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const nx = dx / len, ny = dy / len, nz = dz / len;
  const yaw = Math.atan2(-nx, -nz);
  const horiz = Math.hypot(nx, nz) || 1e-6;
  const pitch = Math.atan2(ny, horiz);
  return quaternion(yaw, pitch, roll);
}

// --------------------------------------------------------------------------- island loop (mirrors create-pelican-island-ride.py)

function shoreRadius(ang: number): number {
  return (
    69.0
    + 8.5 * Math.sin(2.0 * ang + 0.35)
    + 5.0 * Math.cos(3.0 * ang - 0.55)
    + 2.5 * Math.sin(5.0 * ang + 1.1)
  );
}

function roadRadius(ang: number): number {
  return shoreRadius(ang) - 12.0;
}

function roadHeight(ang: number): number {
  return (
    3.25
    + 1.45 * Math.sin(ang - 0.5)
    + 0.65 * Math.cos(2.0 * ang + 0.7)
    + 0.32 * Math.sin(3.0 * ang)
  );
}

function roadCenter(ang: number): Vec3 {
  const r = roadRadius(ang);
  return [r * Math.cos(ang), roadHeight(ang), r * Math.sin(ang)];
}

interface RoadFrame {
  center: Vec3;
  fwd: Vec3;       // 3D unit tangent along increasing angle
  outXZ: [number, number]; // unit vector pointing seaward (left of rider)
  dsDang: number;  // meters per radian at this angle
}

function roadFrame(ang: number): RoadFrame {
  const e = 0.0025;
  const c = roadCenter(ang);
  const p0 = roadCenter(ang - e);
  const p1 = roadCenter(ang + e);
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const d3 = Math.hypot(dx, dy, dz) || 1;
  const d2 = Math.hypot(dx, dz) || 1;
  const tx = dx / d2, tz = dz / d2;
  return {
    center: c,
    fwd: [dx / d3, dy / d3, dz / d3],
    outXZ: [tz, -tx],
    dsDang: d3 / (2 * e),
  };
}

function roadPoint(ang: number, lat = 0, yOff = 0): Vec3 {
  const f = roadFrame(ang);
  return [f.center[0] + f.outXZ[0] * lat, f.center[1] + yOff, f.center[2] + f.outXZ[1] * lat];
}

function landmarkName(ang: number): string {
  const a = ((ang % TAU) + TAU) % TAU;
  if (a < 1.25) return '椰影白沙湾  ·  PALM COVE';
  if (a < 2.65) return '红白灯塔崖  ·  LIGHTHOUSE BLUFF';
  if (a < 3.95) return '翡翠木栈码头  ·  TURQUOISE PIER';
  if (a < 5.65) return '珊瑚冲浪渔村  ·  SURF VILLAGE';
  return '环岛观海直道  ·  SUNSHINE PROMENADE';
}

// --------------------------------------------------------------------------- engine helpers

function setComp(name: string, component: string, value: unknown): void {
  const ent = entities[name];
  if (!ent) return;
  const key = name + '/' + component;
  const encoded = JSON.stringify(value);
  if (sent[key] === encoded) return;
  sent[key] = encoded;
  engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: ent.entity, component, value }));
}

function move(name: string, position: number[], rotation: number[] = [0, 0, 0, 1], scale: number[] = [1, 1, 1]): void {
  setComp(name, 'Transform', { position, rotation, scale });
}

function setLabel(name: string, text: string): void {
  const base = authored[name]?.Text;
  if (!base) return;
  setComp(name, 'Text', { ...base, text });
}

function setHudVisible(show: boolean): void {
  for (const name of HUD_NAMES) {
    const ent = entities[name];
    if (ent) engine.setActive(ent.entity, show);
  }
}

function initialize(): void {
  entities = {};
  authored = {};
  sent = {};
  for (const e of engine.snapshot.entities) {
    if (!e.name) continue;
    entities[e.name] = e;
    authored[e.name] = e.components;
  }
  const startPos = roadPoint(rideAngle, lateral, 0.05);
  const f = roadFrame(rideAngle);
  camPos = [
    startPos[0] - f.fwd[0] * 7.8 + f.outXZ[0] * 3.8,
    startPos[1] + 3.6,
    startPos[2] - f.fwd[2] * 7.8 + f.outXZ[1] * 3.8,
  ];
  camLook = [startPos[0] + f.fwd[0] * 2.0, startPos[1] + 1.9, startPos[2] + f.fwd[2] * 2.0];
  envTextureTag = 'day';
  initialized = true;
}

function onSceneLoaded(_scene: EngineSceneInfo): void {
  initialized = false;
}

// --------------------------------------------------------------------------- lighting & environment

function updateLighting(dt: number): void {
  const prev = sunsetBlend;
  sunsetBlend = damp(sunsetBlend, sunsetTarget, 2.4, dt);

  const clockParam = [[elapsed, sunsetBlend, 0, 0]];
  for (const name of ['Sky Dome', 'Ocean', 'Island Terrain']) {
    setComp(name, 'MaterialPropertyBlock', {
      custom_parameter_names: ['clock'],
      custom_parameter_values: clockParam,
    });
  }

  // Update directional sunlight direction, color and intensity when blending.
  if (Math.abs(sunsetBlend - prev) > 0.0002 || elapsed < 0.1) {
    const s = sunsetBlend;
    const sunDir: Vec3 = [lerp(0.55, 0.84, s), lerp(-0.62, -0.17, s), lerp(0.56, 0.51, s)];
    move('Sun Light', [0, 60, 0], lookAtQuat([0, 0, 0], sunDir));
    setComp('Sun Light', 'DirectionalLight', {
      color: [1.0, lerp(0.96, 0.56, s), lerp(0.86, 0.28, s), 1.0],
      intensity: lerp(2.4, 3.6, s),
      cast_shadows: true,
      shadow_strength: lerp(0.78, 0.86, s),
      shadow_distance: 140.0,
      shadow_bias: 0.0014,
      shadow_normal_bias: 0.02,
    });

    const wantTag = s > 0.5 ? 'sunset' : 'day';
    if (wantTag !== envTextureTag || Math.abs(sunsetBlend - prev) > 0.015) {
      envTextureTag = wantTag;
      setComp('Environment', 'EnvironmentLight', {
        sky_color: [lerp(0.08, 0.06, s), lerp(0.27, 0.08, s), lerp(0.67, 0.19, s), 1],
        equator_color: [lerp(0.47, 0.58, s), lerp(0.72, 0.22, s), lerp(0.82, 0.14, s), 1],
        ground_color: [lerp(0.024, 0.018, s), lerp(0.062, 0.025, s), lerp(0.075, 0.038, s), 1],
        diffuse_intensity: lerp(0.65, 0.52, s),
        specular_intensity: lerp(0.68, 0.78, s),
        texture: wantTag === 'sunset' ? 'Assets/Textures/sky-sunset.png' : 'Assets/Textures/sky-day.png',
        background_enabled: false,
        background_intensity: 0.75,
        exposure: lerp(-0.05, -0.12, s),
        tone_mapping: true,
      });
    }
  }
}

// --------------------------------------------------------------------------- seagulls

function updateSeagulls(): void {
  for (let i = 0; i < 6; i++) {
    const orbitR = 34 + i * 7.5;
    const omega = (i % 2 === 0 ? 1 : -1) * (0.16 + i * 0.022);
    const a = elapsed * omega + i * 1.15;
    const x = Math.cos(a) * orbitR + Math.sin(elapsed * 0.3 + i) * 4.5;
    const z = Math.sin(a) * orbitR + Math.cos(elapsed * 0.25 + i) * 4.5;
    const y = 21 + i * 2.4 + Math.sin(elapsed * 1.1 + i * 1.7) * 1.8;

    // Velocity tangent for heading
    const vx = -Math.sin(a) * omega * orbitR;
    const vz = Math.cos(a) * omega * orbitR;
    const yaw = Math.atan2(-vx, -vz);
    const bank = omega > 0 ? 0.22 : -0.22;
    move(`Seagull ${i}`, [x, y, z], quaternion(yaw, 0.04 * Math.cos(elapsed * 1.1 + i), bank));

    const flap = Math.sin(elapsed * (5.2 + i * 0.35) + i * 1.4) * 0.42;
    move(`Seagull ${i} Wing L`, [0, 0, 0], quaternion(0, 0, -flap), [-1, 1, 1]);
    move(`Seagull ${i} Wing R`, [0, 0, 0], quaternion(0, 0, flap), [1, 1, 1]);
  }
}

// --------------------------------------------------------------------------- main tick

function onTick(dt: number, _frame: number): void {
  if (!initialized) initialize();
  dt = clamp(dt, 0, 0.08);

  const input = engine.input;
  const pressed = (code: string): boolean => input.pressedKeys.includes(code);
  const held = (...codes: string[]): boolean => codes.some((c) => input.keys.includes(c));

  if (pressed('Space')) paused = !paused;
  if (pressed('KeyC')) cameraMode = (cameraMode + 1) % CAMERA_MODES.length;
  if (pressed('KeyL')) sunsetTarget = sunsetTarget < 0.5 ? 1 : 0;
  if (pressed('KeyV')) {
    hudVisible = !hudVisible;
    setHudVisible(hudVisible);
  }
  if (pressed('KeyM')) {
    muted = !muted;
    setComp('Audio Mixer', 'AudioMixer', { master_volume: 0.85, music_volume: 0.7, muted });
  }
  if (pressed('KeyB')) {
    happyFlap = 1.15;
    toastTimer = 2.2;
    if (!muted && entities['Bell Audio']) engine.playAudio(entities['Bell Audio'].entity);
  }

  elapsed += dt;
  happyFlap = Math.max(0, happyFlap - dt);
  toastTimer = Math.max(0, toastTimer - dt);

  // ---- Riding simulation (auto-cruise with seamless manual speed & lane control)
  const manualAccel = held('KeyW', 'ArrowUp');
  const manualBrake = held('KeyS', 'ArrowDown');
  const steer = Number(held('KeyA', 'ArrowLeft')) - Number(held('KeyD', 'ArrowRight'));

  if (!paused) {
    if (manualAccel) {
      speed = clamp(speed + 9.0 * dt, MIN_SPEED, MAX_SPEED);
    } else if (manualBrake) {
      speed = clamp(speed - 11.0 * dt, MIN_SPEED, MAX_SPEED);
    } else {
      speed = damp(speed, CRUISE_SPEED, 1.4, dt);
    }

    const fNow = roadFrame(rideAngle);
    const dAng = (speed / fNow.dsDang) * dt;
    const prevAngle = rideAngle;
    rideAngle += dAng;
    if (Math.floor(rideAngle / TAU) > Math.floor(prevAngle / TAU)) {
      laps += 1;
    }

    if (steer !== 0) {
      lateral = clamp(lateral + steer * 3.4 * dt, -2.0, 2.0);
    } else {
      // Gentle scenic weaving near center when auto-cruising
      const scenicLat = Math.sin(rideAngle * 2.0) * 0.45;
      lateral = damp(lateral, scenicLat, 0.85, dt);
    }

    const fNext = roadFrame(rideAngle + 0.04);
    const turnDelta = Math.atan2(
      fNow.fwd[0] * fNext.fwd[2] - fNow.fwd[2] * fNext.fwd[0],
      fNow.fwd[0] * fNext.fwd[0] + fNow.fwd[2] * fNext.fwd[2],
    );
    const targetRoll = clamp(turnDelta * 2.4 + steer * 0.24, -0.34, 0.34);
    leanRoll = damp(leanRoll, targetRoll, 7.0, dt);

    wheelSpin += (speed / WHEEL_RADIUS) * dt;
    pedalPhase += (speed / 0.76) * dt;
    orbitPhase += dt * 0.26;
  }

  // ---- Update Pelican + Cruiser Bicycle transforms
  const frame = roadFrame(rideAngle);
  const bob = Math.sin(pedalPhase * 2.0) * 0.016;
  const riderPos = roadPoint(rideAngle, lateral, 0.04 + bob);
  const yaw = Math.atan2(-frame.fwd[0], -frame.fwd[2]);
  const pitch = Math.atan2(frame.fwd[1], Math.hypot(frame.fwd[0], frame.fwd[2]));

  move('Pelican Rider', riderPos, quaternion(yaw, pitch, leanRoll));

  // Spinning spoked wheels (negative X angle rolls forward along -Z)
  const wheelQ = quaternion(0, -wheelSpin, 0);
  move('Wheel Front', [0.0, 0.50, -0.92], wheelQ);
  move('Wheel Rear', [0.0, 0.50, 0.92], wheelQ);

  // Rotating crankset + synchronized pedaling webbed feet
  move('Bike Crank', [0.0, 0.44, 0.08], quaternion(0, -pedalPhase, 0));
  const sinP = Math.sin(pedalPhase);
  const cosP = Math.cos(pedalPhase);
  move(
    'Pelican Foot L',
    [-0.23, 0.44 - CRANK_RADIUS * sinP, 0.08 - CRANK_RADIUS * cosP],
    quaternion(0, -0.22 * cosP, 0),
  );
  move(
    'Pelican Foot R',
    [0.23, 0.44 + CRANK_RADIUS * sinP, 0.08 + CRANK_RADIUS * cosP],
    quaternion(0, 0.22 * cosP, 0),
  );

  // Breeze-fluttering scarf tail & expressive pelican wings
  const windAmp = 0.08 + (speed / MAX_SPEED) * 0.14;
  const scarfYaw = Math.sin(elapsed * 7.5) * windAmp;
  const scarfPitch = Math.sin(elapsed * 5.2 + 0.8) * windAmp * 0.7 + (speed / MAX_SPEED) * 0.16;
  move('Pelican Scarf', [0.0, 2.34, 0.08], quaternion(scarfYaw, scarfPitch, 0));

  const wingFlap = happyFlap > 0
    ? Math.sin(happyFlap * 24.0) * 0.58 + 0.32
    : Math.sin(pedalPhase) * 0.04 + Math.sin(elapsed * 2.4) * 0.03;
  move('Pelican Wing L', [-0.38, 1.80, 0.05], quaternion(0, 0.06, -wingFlap), [-1, 1, 1]);
  move('Pelican Wing R', [0.38, 1.80, 0.05], quaternion(0, 0.06, wingFlap), [1, 1, 1]);

  // ---- Update Camera
  let wantEye: Vec3;
  let wantTarget: Vec3;
  let wantFov = 52;

  if (cameraMode === 0) {
    // Scenic 3/4 coastal chase camera (ocean on left, island peaks & lighthouse on right)
    wantEye = [
      riderPos[0] - frame.fwd[0] * 7.6 + frame.outXZ[0] * 3.8,
      riderPos[1] + 3.5,
      riderPos[2] - frame.fwd[2] * 7.6 + frame.outXZ[1] * 3.8,
    ];
    wantTarget = [
      riderPos[0] + frame.fwd[0] * 2.2 - frame.outXZ[0] * 0.4,
      riderPos[1] + 1.85,
      riderPos[2] + frame.fwd[2] * 2.2 - frame.outXZ[1] * 0.4,
    ];
    wantFov = 52 + (speed / MAX_SPEED) * 5;
  } else if (cameraMode === 1) {
    // Hero close-up from seaward side showing the pelican, beak, straw hat & pedaling legs
    wantEye = [
      riderPos[0] + frame.fwd[0] * 2.4 + frame.outXZ[0] * 4.5,
      riderPos[1] + 2.25,
      riderPos[2] + frame.fwd[2] * 2.4 + frame.outXZ[1] * 4.5,
    ];
    wantTarget = [riderPos[0], riderPos[1] + 1.75, riderPos[2]];
    wantFov = 42;
  } else if (cameraMode === 2) {
    // High panoramic island overview following the rider along the coastline
    wantEye = [
      riderPos[0] - frame.fwd[0] * 22.0 + frame.outXZ[0] * 26.0,
      riderPos[1] + 22.0,
      riderPos[2] - frame.fwd[2] * 22.0 + frame.outXZ[1] * 26.0,
    ];
    wantTarget = [
      riderPos[0] * 0.65,
      riderPos[1] + 3.2,
      riderPos[2] * 0.65,
    ];
    wantFov = 54;
  } else {
    // Smooth 360-degree cinematic orbit centered on the pedaling pelican
    const r = 8.4;
    wantEye = [
      riderPos[0] + Math.cos(orbitPhase) * r,
      riderPos[1] + 3.0 + Math.sin(orbitPhase * 0.7) * 0.9,
      riderPos[2] + Math.sin(orbitPhase) * r,
    ];
    wantTarget = [riderPos[0], riderPos[1] + 1.8, riderPos[2]];
    wantFov = 48;
  }

  for (let k = 0; k < 3; k++) {
    camPos[k] = damp(camPos[k], wantEye[k], k === 1 ? 4.8 : 6.2, dt);
    camLook[k] = damp(camLook[k], wantTarget[k], 8.5, dt);
  }
  camFov = damp(camFov, wantFov, 4.5, dt);

  move('Main Camera', camPos, lookAtQuat(camPos, camLook, leanRoll * 0.04));
  setComp('Main Camera', 'Camera3D', { ...authored['Main Camera'].Camera3D, fov_y_degrees: camFov });

  // Keep sky dome centered on camera so horizon never clips
  move('Sky Dome', camPos, [0, 0, 0, 1], [1, 1, 1]);

  // ---- Environment, lighting & wildlife
  updateLighting(dt);
  updateSeagulls();

  // ---- HUD text refresh
  if (hudVisible) {
    const kmh = Math.round((paused ? 0 : speed) * 3.6);
    const modeLabel = paused ? '已暂停' : (manualAccel || manualBrake || steer !== 0 ? '手动骑行' : '自动巡游');
    setLabel('hud-camera', CAMERA_MODES[cameraMode]);
    setLabel('hud-lighting', sunsetTarget > 0.5 ? '黄金日落  ·  GOLDEN SUNSET' : '晴昼海风  ·  TROPICAL DAY');
    setLabel('hud-landmark', landmarkName(rideAngle));
    setLabel('hud-stats', `${kmh} KM/H   ·   第 ${laps} 圈   ·   ${modeLabel}`);
    setLabel(
      'hud-bell-toast',
      toastTimer > 0 ? '叮铃铃！鹈鹕开心地挥了挥翅膀' : (muted ? '音效已静音（按 M 恢复）' : '按 B 摇响车铃，鹈鹕会开心挥翅'),
    );
  }
}
