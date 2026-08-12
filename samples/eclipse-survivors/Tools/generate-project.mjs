// Author: MiYu

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const UI_SCALE = 2 / 3;
const writeJson = (relative, value) => {
  const target = path.join(projectRoot, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const transform = (x = 0, y = 0, z = 0, scale = [1, 1, 1]) => ({
  position: [x, y, z], rotation: [0, 0, 0, 1], scale,
});
const rect = (position, size, anchor = [0.5, 0.5], pivot = [0.5, 0.5]) => ({
  anchor_min: anchor,
  anchor_max: anchor,
  pivot,
  anchored_position: [position[0] * UI_SCALE, -position[1] * UI_SCALE],
  size_delta: size.map((value) => value * UI_SCALE),
  local_rotation: 0,
  local_scale: [1, 1],
});
const entity = (entity, name, parent, siblingIndex, components) => ({
  entity, name, parent, siblingIndex, active: true, components,
});
const camera = (id = 1, clear = [0.018, 0.021, 0.05, 1]) => entity(id, 'Main Camera', null, 0, {
  Transform: transform(0, 0, 10),
  Camera2D: { size: 5, primary: true, target_display: 0, clear_flags: 'solid_color', background_color: clear },
});
const canvas = (id = 2) => entity(id, 'Canvas', null, 1, {
  RectTransform: { ...rect([0, 0], [0, 0]), anchor_min: [0, 0], anchor_max: [1, 1] },
  Canvas: { render_mode: 'ScreenSpaceOverlay', sorting_order: 0, plane_distance: 100 },
  CanvasScaler: { ui_scale_mode: 'ScaleWithScreenSize', reference_resolution: [1280, 720], match_width_or_height: 0.5, scale_factor: 1 },
  GraphicRaycaster: { enabled: true, ignore_reversed_graphics: true, blocking_objects: 'None', blocking_mask: -1 },
});
const image = (id, name, parent, position, size, sprite, color = [1, 1, 1, 1], anchor) => entity(id, name, parent, id, {
  RectTransform: rect(position, size, anchor),
  Image: { sprite, color, image_type: 'Simple', preserve_aspect: false, raycast_target: false },
});
const panel = (id, name, parent, position, size, color, border = [0.3, 0.4, 0.65, 0.7], anchor) => entity(id, name, parent, id, {
  RectTransform: rect(position, size, anchor),
  Panel: { color, border_color: border, border_width: 1, raycast_target: false },
});
const label = (id, name, parent, position, size, value, fontSize, color = [0.9, 0.94, 1, 1], alignment = 'Center', anchor) => entity(id, name, parent, id, {
  RectTransform: rect(position, size, anchor),
  Text: { text: value, color, font_size: fontSize * UI_SCALE, font_style: 'Normal', alignment, vertical_align: 'Middle', support_rich_text: true, horizontal_overflow: 'Wrap', vertical_overflow: 'Overflow', raycast_target: false, outline_color: [0.01, 0.02, 0.06, 0.9], outline_width: 0 },
});
const button = (id, name, parent, position, size, value, callback, normal = [0.11, 0.24, 0.39, 0.98], accent = [0.17, 0.67, 0.86, 1], anchor) => entity(id, name, parent, id, {
  RectTransform: rect(position, size, anchor),
  Button: { interactable: true, transition: 'ColorTint', normal_color: normal, highlighted_color: accent, pressed_color: [accent[0] * 0.6, accent[1] * 0.6, accent[2] * 0.6, 1], selected_color: accent, disabled_color: [0.15, 0.16, 0.2, 0.5], color_multiplier: 1, fade_duration: 0.08, label: value, text_color: [0.94, 0.98, 1, 1], font_size: 18 * UI_SCALE, on_click: callback },
});
const scene = (name, entities, selected = 2) => ({
  version: 3,
  name,
  world: { entities, frame: 0, sim_frame: 0, clear_color: [0.018, 0.021, 0.05, 1], selected },
  gameResolution: { width: 1280, height: 720 },
});

const art = 'Assets/Art/Generated';
const login = [
  camera(), canvas(),
  image(3, 'Login Background', 2, [0, 0], [1920, 1080], `${art}/eclipse-citadel.png`, [0.64, 0.7, 0.92, 1]),
  panel(4, 'Login Vignette', 2, [0, 0], [1920, 1080], [0.015, 0.02, 0.06, 0.35], [0, 0, 0, 0]),
  panel(5, 'Login Card', 2, [0, -10], [560, 690], [0.025, 0.035, 0.09, 0.94], [0.33, 0.73, 0.95, 0.65]),
  label(6, 'Login Eyebrow', 2, [0, 270], [470, 32], 'A MENGINE ORIGINAL SAMPLE', 15, [0.31, 0.83, 1, 1]),
  label(7, 'Login Title', 2, [0, 190], [500, 110], 'ECLIPSE\nSURVIVORS', 48, [0.92, 0.86, 1, 1]),
  label(8, 'Login Subtitle', 2, [0, 95], [430, 54], 'Hold the line beneath a dying sun.', 20, [0.68, 0.73, 0.88, 1]),
  entity(9, 'Profile Name Input', 2, 9, {
    RectTransform: rect([0, -15], [410, 58]),
    InputField: { text: '', placeholder: 'Enter your Warden name', text_color: [0.93, 0.97, 1, 1], placeholder_color: [0.48, 0.55, 0.7, 1], background_color: [0.035, 0.055, 0.13, 1], caret_color: [0.3, 0.85, 1, 1], font_size: 20 * UI_SCALE, interactable: true, multiline: false, character_limit: 18, on_submit: 'login' },
  }),
  button(10, 'Continue Button', 2, [0, -100], [410, 60], 'ENTER THE ECLIPSE', 'continue'),
  label(11, 'Login Hint', 2, [0, -176], [430, 58], 'Press Enter after typing, or continue as a guest.\nProfile and progression save locally.', 14, [0.53, 0.6, 0.75, 1]),
  button(12, 'Reset Profile Button', 2, [0, -255], [200, 40], 'RESET PROFILE', 'reset-profile', [0.2, 0.08, 0.14, 0.8], [0.62, 0.18, 0.3, 1]),
  label(13, 'Login Status', 2, [0, -310], [430, 36], '', 14, [0.98, 0.68, 0.8, 1]),
];

const lobby = [
  camera(), canvas(),
  image(3, 'Lobby Background', 2, [0, 0], [1920, 1080], `${art}/eclipse-citadel.png`, [0.42, 0.5, 0.72, 1]),
  panel(4, 'Lobby Shade', 2, [0, 0], [1920, 1080], [0.01, 0.015, 0.05, 0.55], [0, 0, 0, 0]),
  label(5, 'Lobby Brand', 2, [-735, 460], [390, 70], 'ECLIPSE SURVIVORS', 31, [0.83, 0.75, 1, 1], 'Left'),
  label(6, 'Profile Summary', 2, [635, 462], [520, 72], 'WARDEN', 18, [0.67, 0.9, 1, 1], 'Right'),
  panel(7, 'Warden Panel', 2, [-620, -35], [520, 820], [0.025, 0.035, 0.085, 0.94], [0.28, 0.68, 0.88, 0.5]),
  image(8, 'Warden Portrait', 2, [-620, 120], [430, 560], `${art}/eclipse-warden.png`, [1, 1, 1, 1]),
  label(9, 'Warden Stats', 2, [-620, -295], [430, 145], 'POWER 0', 18, [0.75, 0.85, 1, 1]),
  panel(10, 'Equipment Panel', 2, [-65, 160], [520, 430], [0.025, 0.035, 0.085, 0.94], [0.47, 0.31, 0.78, 0.65]),
  label(11, 'Equipment Header', 2, [-65, 345], [450, 50], 'EQUIPMENT LOADOUT', 23, [0.85, 0.78, 1, 1]),
  button(12, 'Gear Moonstaff', 2, [-180, 245], [205, 74], 'MOONSTEEL STAFF', 'equip:moonstaff', [0.12, 0.11, 0.27, 1], [0.45, 0.3, 0.85, 1]),
  button(13, 'Gear Mantle', 2, [50, 245], [205, 74], 'STARWEAVE MANTLE', 'equip:mantle', [0.12, 0.11, 0.27, 1], [0.45, 0.3, 0.85, 1]),
  button(14, 'Gear Boots', 2, [-180, 145], [205, 74], 'OBSIDIAN BOOTS', 'equip:boots', [0.12, 0.11, 0.27, 1], [0.45, 0.3, 0.85, 1]),
  button(15, 'Gear Sunring', 2, [50, 145], [205, 74], 'SUNSHARD RING', 'equip:sunring', [0.12, 0.11, 0.27, 1], [0.45, 0.3, 0.85, 1]),
  label(16, 'Equipment Detail', 2, [-65, 25], [450, 90], 'Select gear to equip.', 14, [0.62, 0.7, 0.84, 1]),
  panel(17, 'Level Panel', 2, [560, 115], [650, 520], [0.025, 0.035, 0.085, 0.94], [0.47, 0.31, 0.78, 0.65]),
  label(18, 'Level Header', 2, [560, 330], [570, 52], 'SELECT AN EXPEDITION', 23, [0.85, 0.78, 1, 1]),
  button(19, 'Level Eclipse Garden', 2, [560, 240], [560, 72], 'I  ECLIPSE GARDEN', 'level:eclipse_garden'),
  button(20, 'Level Astral Archive', 2, [560, 140], [560, 72], 'II  ASTRAL ARCHIVE', 'level:astral_archive', [0.14, 0.12, 0.28, 1], [0.45, 0.3, 0.85, 1]),
  button(21, 'Level Sunken Observatory', 2, [560, 40], [560, 72], 'III  SUNKEN OBSERVATORY', 'level:sunken_observatory', [0.14, 0.12, 0.28, 1], [0.45, 0.3, 0.85, 1]),
  label(22, 'Level Detail', 2, [560, -100], [560, 130], 'Survive the eclipse.', 15, [0.64, 0.73, 0.89, 1]),
  button(23, 'Start Run Button', 2, [560, -250], [560, 70], 'BEGIN EXPEDITION', 'start-run', [0.12, 0.38, 0.47, 1], [0.2, 0.8, 0.93, 1]),
  button(24, 'Logout Button', 2, [810, -445], [160, 40], 'LOG OUT', 'logout', [0.15, 0.08, 0.15, 0.85], [0.55, 0.17, 0.36, 1]),
  label(25, 'Lobby Toast', 2, [180, -440], [820, 48], '', 16, [0.45, 0.9, 1, 1]),
];

const game = [
  camera(),
  entity(2, 'Arena Background', null, 1, {
    Transform: transform(0, 0, -2),
    SpriteRenderer: { sprite: `${art}/eclipse-citadel.png`, color: [0.26, 0.31, 0.53, 1], size: [17.78, 10], pivot: [0.5, 0.5], sorting_layer: 'default', sorting_order: -100 },
  }),
  entity(3, 'Player', null, 2, {
    Transform: transform(0, 0, 0),
    SpriteRenderer: { sprite: `${art}/eclipse-warden.png`, color: [1, 1, 1, 1], size: [1.15, 1.15], pivot: [0.5, 0.46], sorting_layer: 'default', sorting_order: 50 },
  }),
  canvas(4),
  panel(5, 'HUD Top', 4, [0, 485], [1920, 110], [0.015, 0.02, 0.065, 0.88], [0.25, 0.6, 0.85, 0.45]),
  label(6, 'HUD Stage', 4, [-725, 485], [430, 70], 'ECLIPSE GARDEN', 22, [0.82, 0.76, 1, 1], 'Left'),
  label(7, 'HUD Timer', 4, [0, 485], [280, 70], '03:00', 32, [0.94, 0.97, 1, 1]),
  label(8, 'HUD Stats', 4, [630, 485], [330, 70], 'LV 1  •  0 KILLS  •  0 GOLD', 14, [0.55, 0.86, 1, 1], 'Right'),
  entity(9, 'Health Bar', 4, 9, { RectTransform: rect([-640, -480], [430, 28]), ProgressBar: { min_value: 0, max_value: 100, value: 100, direction: 'LeftToRight', background_color: [0.12, 0.04, 0.09, 0.92], fill_color: [0.91, 0.16, 0.35, 1], text_color: [1, 1, 1, 1], show_label: true, font_size: 13 * UI_SCALE } }),
  entity(10, 'Experience Bar', 4, 10, { RectTransform: rect([0, -506], [800, 20]), ProgressBar: { min_value: 0, max_value: 10, value: 0, direction: 'LeftToRight', background_color: [0.035, 0.05, 0.12, 0.94], fill_color: [0.22, 0.74, 0.97, 1], text_color: [1, 1, 1, 1], show_label: false, font_size: 12 * UI_SCALE } }),
  panel(11, 'Skill Tray', 4, [610, -425], [570, 120], [0.015, 0.02, 0.065, 0.88], [0.38, 0.28, 0.7, 0.5]),
  label(12, 'HUD Skills', 4, [610, -425], [520, 90], 'ASTRAL BOLT  LV 1', 16, [0.8, 0.83, 1, 1]),
  label(13, 'Run Toast', 4, [0, 325], [900, 70], 'THE ECLIPSE RISES', 24, [0.55, 0.9, 1, 1]),
  label(14, 'Controls Hint', 4, [-700, -425], [450, 65], 'WASD  MOVE  •  ATTACKS ARE AUTOMATIC', 13, [0.55, 0.63, 0.78, 1]),
  button(15, 'Pause Button', 4, [865, 485], [90, 44], 'II', 'pause', [0.08, 0.12, 0.24, 0.95], [0.28, 0.58, 0.82, 1]),
  panel(16, 'Pause Overlay', 4, [0, 0], [640, 420], [0.025, 0.035, 0.1, 0.96], [0.45, 0.3, 0.8, 0.8]),
  label(17, 'Pause Title', 16, [0, 110], [520, 80], 'RUN PAUSED', 34, [0.9, 0.84, 1, 1]),
  label(18, 'Pause Summary', 16, [0, 25], [520, 80], 'Take a breath beneath the eclipse.', 16, [0.65, 0.72, 0.87, 1]),
  button(19, 'Resume Button', 16, [0, -70], [360, 58], 'RESUME', 'resume'),
  button(20, 'Abandon Button', 16, [0, -145], [360, 48], 'ABANDON RUN', 'abandon', [0.27, 0.08, 0.17, 1], [0.7, 0.18, 0.38, 1]),
];

writeJson('project.json', {
  name: 'Eclipse Survivors', version: 1, language: 'typescript',
  mainScene: 'Assets/Scenes/Login.mscene',
  buildScenes: ['Assets/Scenes/Login.mscene', 'Assets/Scenes/Lobby.mscene', 'Assets/Scenes/Game.mscene'],
  startupScript: 'Assets/Scripts/Main.ts', assetMode: 'all',
});
writeJson('Assets/Scenes/Login.mscene', scene('Login', login, 10));
writeJson('Assets/Scenes/Lobby.mscene', scene('Lobby', lobby, 23));
writeJson('Assets/Scenes/Game.mscene', scene('Game', game, 3));
writeJson('Assets/Art/Generated/eclipse-warden.png.sprite.json', { version: 1, mode: 'single', pixels_per_unit: 420, slices: [] });
writeJson('Assets/Art/Generated/enemies-atlas.png.sprite.json', {
  version: 1, mode: 'multiple', pixels_per_unit: 160,
  slices: [
    { name: 'wisp', rect: [0, 0, 627, 627], pivot: [0.5, 0.5] },
    { name: 'thorn_crawler', rect: [627, 0, 627, 627], pivot: [0.5, 0.5] },
    { name: 'ember_cultist', rect: [0, 627, 627, 627], pivot: [0.5, 0.5] },
    { name: 'void_guardian', rect: [627, 627, 627, 627], pivot: [0.5, 0.5] },
  ],
});
writeJson('Assets/Art/Generated/icons-atlas.png.sprite.json', {
  version: 1, mode: 'multiple', pixels_per_unit: 150,
  slices: [
    'astral_bolt', 'eclipse_nova', 'crescent_orbit', 'gravity_well',
    'moonstaff', 'mantle', 'boots', 'sunring',
    'experience', 'coin', 'heart', 'chest',
  ].map((name, index) => ({ name, rect: [(index % 4) * 313, Math.floor(index / 4) * 418, index % 4 === 3 ? 315 : 313, Math.floor(index / 4) === 2 ? 418 : 418], pivot: [0.5, 0.5] })),
});

const skillIcon = (name) => `${art}/icons-atlas.png#${name}`;
writeJson('Assets/Data/Skills.mskill', {
  version: 1,
  kind: 'skill-library',
  skills: [
    { id: 'astral_bolt', name: 'Astral Bolt', description: 'Seek the closest enemy with condensed starlight.', icon: skillIcon('astral_bolt'), pattern: 'nearest', damage: 24, cooldown: 0.72, projectileSpeed: 9.5, range: 9, count: 1, maxLevel: 6, color: '#4de5ff', upgrades: [1, 1.28, 1.6, 2, 2.5, 3.1] },
    { id: 'eclipse_nova', name: 'Eclipse Nova', description: 'Release projectiles in every direction.', icon: skillIcon('eclipse_nova'), pattern: 'radial', damage: 18, cooldown: 3.4, projectileSpeed: 6.2, range: 6.5, count: 8, maxLevel: 6, color: '#b666ff', upgrades: [1, 1.25, 1.55, 1.9, 2.3, 2.8] },
    { id: 'crescent_orbit', name: 'Crescent Orbit', description: 'Moon blades carve a circle around the Warden.', icon: skillIcon('crescent_orbit'), pattern: 'orbit', damage: 13, cooldown: 0.35, projectileSpeed: 4.5, range: 2.2, count: 3, maxLevel: 6, color: '#d9ddff', upgrades: [1, 1.22, 1.5, 1.85, 2.25, 2.7] },
    { id: 'gravity_well', name: 'Gravity Well', description: 'A crushing aura damages everything nearby.', icon: skillIcon('gravity_well'), pattern: 'aura', damage: 8, cooldown: 0.8, projectileSpeed: 0, range: 2.5, count: 1, maxLevel: 6, color: '#5878ff', upgrades: [1, 1.3, 1.68, 2.1, 2.6, 3.2] },
  ],
});
writeJson('Assets/Data/Levels.mlevel', {
  version: 1,
  kind: 'level-library',
  levels: [
    { id: 'eclipse_garden', name: 'Eclipse Garden', description: 'A forgiving ruined garden with steady pressure and a single Guardian.', duration: 180, background: `${art}/eclipse-citadel.png`, accent: '#47dfff', recommendedPower: 0, waves: [
      { start: 0, duration: 45, enemy: 'wisp', count: 32, hp: 22, speed: 1.25, damage: 7 },
      { start: 35, duration: 60, enemy: 'thorn_crawler', count: 26, hp: 40, speed: 1.55, damage: 10 },
      { start: 85, duration: 70, enemy: 'ember_cultist', count: 24, hp: 70, speed: 1.0, damage: 14 },
      { start: 130, duration: 45, enemy: 'wisp', count: 54, hp: 48, speed: 1.75, damage: 11 },
    ], boss: { enemy: 'void_guardian', spawnAt: 165, hp: 1150, speed: 0.78, damage: 24 } },
    { id: 'astral_archive', name: 'Astral Archive', description: 'Faster swarms overlap in the collapsed archive. Requires a tuned loadout.', duration: 240, background: `${art}/eclipse-citadel.png`, accent: '#b966ff', recommendedPower: 4, waves: [
      { start: 0, duration: 55, enemy: 'thorn_crawler', count: 46, hp: 52, speed: 1.7, damage: 11 },
      { start: 35, duration: 80, enemy: 'wisp', count: 72, hp: 46, speed: 2.0, damage: 10 },
      { start: 90, duration: 85, enemy: 'ember_cultist', count: 48, hp: 105, speed: 1.2, damage: 18 },
      { start: 150, duration: 80, enemy: 'thorn_crawler', count: 82, hp: 95, speed: 2.05, damage: 16 },
    ], boss: { enemy: 'void_guardian', spawnAt: 220, hp: 2200, speed: 0.92, damage: 32 } },
    { id: 'sunken_observatory', name: 'Sunken Observatory', description: 'Endless pressure from all enemy families beneath the final eclipse.', duration: 300, background: `${art}/eclipse-citadel.png`, accent: '#ffb24d', recommendedPower: 8, waves: [
      { start: 0, duration: 80, enemy: 'ember_cultist', count: 55, hp: 105, speed: 1.25, damage: 17 },
      { start: 40, duration: 110, enemy: 'wisp', count: 110, hp: 72, speed: 2.2, damage: 13 },
      { start: 110, duration: 110, enemy: 'thorn_crawler', count: 105, hp: 132, speed: 2.1, damage: 20 },
      { start: 180, duration: 110, enemy: 'ember_cultist', count: 78, hp: 205, speed: 1.45, damage: 26 },
      { start: 225, duration: 70, enemy: 'wisp', count: 150, hp: 105, speed: 2.65, damage: 19 },
    ], boss: { enemy: 'void_guardian', spawnAt: 275, hp: 4200, speed: 1.05, damage: 42 } },
  ],
});
writeJson('Assets/Data/Balance.mgame', {
  version: 1, kind: 'game-balance', player: { baseHealth: 100, moveSpeed: 4.2, pickupRadius: 1.2 },
  progression: { experienceBase: 9, experienceGrowth: 1.34, goldPerKill: 0.12 },
  equipment: [
    { id: 'moonstaff', name: 'Moonsteel Staff', description: '+22% attack power', power: 2, modifiers: { damage: 1.22 } },
    { id: 'mantle', name: 'Starweave Mantle', description: '+28 max health', power: 2, modifiers: { health: 28 } },
    { id: 'boots', name: 'Obsidian Boots', description: '+16% move speed', power: 2, modifiers: { speed: 1.16 } },
    { id: 'sunring', name: 'Sunshard Ring', description: '-15% skill cooldown', power: 3, modifiers: { cooldown: 0.85 } },
  ],
});
writeJson('tsconfig.json', {
  compilerOptions: { target: 'ES2019', module: 'None', strict: true, noEmit: true, lib: ['ES2019'] },
  files: ['Assets/Scripts/Main.ts', 'Assets/Scripts/mengine.d.ts'],
});
fs.mkdirSync(path.join(projectRoot, 'Assets/Scripts'), { recursive: true });
fs.copyFileSync(path.resolve(projectRoot, '..', 'types', 'engine.d.ts'), path.join(projectRoot, 'Assets/Scripts/mengine.d.ts'));

function stableGuid(relative) {
  const hex = crypto.createHash('sha256').update(`eclipse-survivors:${relative}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function importer(relative) {
  const lower = relative.toLowerCase();
  if (lower.endsWith('.mscene')) return 'scene';
  if (lower.endsWith('.png')) return 'texture';
  if (lower.endsWith('.ts')) return 'script';
  return 'default';
}
const assets = [
  'Assets/Scenes/Login.mscene', 'Assets/Scenes/Lobby.mscene', 'Assets/Scenes/Game.mscene',
  'Assets/Data/Skills.mskill', 'Assets/Data/Levels.mlevel', 'Assets/Data/Balance.mgame',
  'Assets/Art/Generated/eclipse-citadel.png', 'Assets/Art/Generated/eclipse-warden.png',
  'Assets/Art/Generated/enemies-atlas.png', 'Assets/Art/Generated/icons-atlas.png',
];
if (fs.existsSync(path.join(projectRoot, 'Assets/Scripts/Main.ts'))) assets.push('Assets/Scripts/Main.ts');
for (const relative of assets) {
  writeJson(`${relative}.meta`, { schemaVersion: 1, guid: stableGuid(relative), importer: importer(relative) });
}
console.log(`Generated Eclipse Survivors project at ${projectRoot}`);
