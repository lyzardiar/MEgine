// Author: MiYu

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const UI_SCALE = 1;
const UI_FONT = 'Assets/Fonts/NotoSansSC.ttf';
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
    CanvasScaler: { ui_scale_mode: 'ScaleWithScreenSize', reference_resolution: [1920, 1080], match_width_or_height: 0.5, scale_factor: 1 },
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
  Text: { text: value, color, font: UI_FONT, font_size: fontSize * UI_SCALE, font_style: 'Normal', alignment, vertical_align: 'Middle', support_rich_text: true, horizontal_overflow: 'Wrap', vertical_overflow: 'Overflow', raycast_target: false, outline_color: [0.01, 0.02, 0.06, 0.9], outline_width: 0 },
});
const button = (id, name, parent, position, size, value, callback, normal = [0.11, 0.24, 0.39, 0.98], accent = [0.17, 0.67, 0.86, 1], anchor) => entity(id, name, parent, id, {
  RectTransform: rect(position, size, anchor),
  Button: { interactable: true, transition: 'ColorTint', normal_color: normal, highlighted_color: accent, pressed_color: [accent[0] * 0.6, accent[1] * 0.6, accent[2] * 0.6, 1], selected_color: accent, disabled_color: [0.15, 0.16, 0.2, 0.5], color_multiplier: 1, fade_duration: 0.08, label: value, text_color: [0.94, 0.98, 1, 1], font: UI_FONT, font_size: 18 * UI_SCALE, on_click: callback },
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
  label(6, 'Login Eyebrow', 2, [0, 270], [470, 32], 'MENGINE 原创割草游戏', 15, [0.31, 0.83, 1, 1]),
  label(7, 'Login Title', 2, [0, 190], [500, 110], '蚀月幸存者', 48, [0.92, 0.86, 1, 1]),
  label(8, 'Login Subtitle', 2, [0, 95], [430, 54], '在垂死的太阳下守住最后防线', 20, [0.68, 0.73, 0.88, 1]),
  entity(9, 'Profile Name Input', 2, 9, {
    RectTransform: rect([0, -15], [410, 58]),
    InputField: { text: '', placeholder: '输入守望者名字', text_color: [0.93, 0.97, 1, 1], placeholder_color: [0.48, 0.55, 0.7, 1], background_color: [0.035, 0.055, 0.13, 1], caret_color: [0.3, 0.85, 1, 1], font: UI_FONT, font_size: 20 * UI_SCALE, interactable: true, multiline: false, character_limit: 18, on_submit: 'login' },
  }),
  button(10, 'Continue Button', 2, [0, -100], [410, 60], '进入蚀月', 'continue'),
  label(11, 'Login Hint', 2, [0, -176], [430, 58], '输入后按回车，或直接以游客身份继续。\n档案与成长进度保存在本地。', 14, [0.53, 0.6, 0.75, 1]),
  button(12, 'Reset Profile Button', 2, [0, -255], [200, 40], '重置档案', 'reset-profile', [0.2, 0.08, 0.14, 0.8], [0.62, 0.18, 0.3, 1]),
  label(13, 'Login Status', 2, [0, -310], [430, 36], '', 14, [0.98, 0.68, 0.8, 1]),
];

const equippedSlots = [
  ['Weapon', -500, 245, `${art}/icons-atlas.png#moonstaff`, 'weapon'],
  ['Armor', -360, 245, `${art}/icons-atlas.png#mantle`, 'armor'],
  ['Boots', -500, 85, `${art}/icons-atlas.png#boots`, 'boots'],
  ['Accessory', -360, 85, `${art}/icons-atlas.png#sunring`, 'accessory'],
].flatMap(([suffix, x, y, sprite, slot], index) => [
  button(12 + index * 2, `Equipped ${suffix}`, 2, [x, y], [124, 140], '未装备', `unequip-slot:${slot}`, [0.09, 0.08, 0.2, 1], [0.5, 0.34, 0.9, 1]),
  image(13 + index * 2, `Equipped ${suffix} Icon`, 2, [x, y + 18], [58, 58], sprite),
]);
const inventorySlots = Array.from({ length: 12 }, (_, index) => {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const x = -190 + column * 120;
  const y = 245 - row * 130;
  return [
    button(24 + index * 2, `Inventory Item ${index + 1}`, 2, [x, y], [106, 116], '背包格', '', [0.06, 0.1, 0.18, 1], [0.18, 0.65, 0.86, 1]),
    image(25 + index * 2, `Inventory Icon ${index + 1}`, 2, [x, y + 18], [48, 48], `${art}/icons-atlas.png#chest`),
  ];
}).flat();
const lobby = [
  camera(), canvas(),
  image(3, 'Lobby Background', 2, [0, 0], [1920, 1080], `${art}/eclipse-citadel.png`, [0.42, 0.5, 0.72, 1]),
  panel(4, 'Lobby Shade', 2, [0, 0], [1920, 1080], [0.01, 0.015, 0.05, 0.55], [0, 0, 0, 0]),
  label(5, 'Lobby Brand', 2, [-735, 460], [390, 70], '蚀月幸存者', 31, [0.83, 0.75, 1, 1], 'Left'),
  label(6, 'Profile Summary', 2, [635, 462], [520, 72], '守望者档案', 18, [0.67, 0.9, 1, 1], 'Right'),
  panel(7, 'Warden Panel', 2, [-790, 30], [270, 720], [0.025, 0.035, 0.085, 0.94], [0.28, 0.68, 0.88, 0.5]),
  image(8, 'Warden Portrait', 2, [-790, 95], [235, 435], `${art}/eclipse-warden.png`, [1, 1, 1, 1]),
  label(9, 'Warden Stats', 2, [-790, -245], [235, 120], '战力 0', 14, [0.75, 0.85, 1, 1]),
  panel(10, 'Equipment Panel', 2, [-430, 130], [300, 520], [0.025, 0.035, 0.085, 0.96], [0.47, 0.31, 0.78, 0.65]),
  label(11, 'Equipment Header', 2, [-430, 355], [260, 44], '装备栏', 22, [0.85, 0.78, 1, 1]),
  ...equippedSlots,
  label(20, 'Equipment Detail', 2, [-430, -80], [260, 90], '从背包选择装备', 12, [0.62, 0.7, 0.84, 1], 'Left'),
  button(21, 'Equip Selected Button', 2, [-430, -165], [250, 48], '装备所选道具', 'equip-selected', [0.12, 0.31, 0.4, 1], [0.2, 0.8, 0.93, 1]),
  panel(22, 'Inventory Panel', 2, [-70, 65], [390, 650], [0.025, 0.035, 0.085, 0.96], [0.28, 0.68, 0.88, 0.55]),
  label(23, 'Inventory Header', 2, [-70, 350], [340, 50], '守望者背包 · 12 格', 22, [0.68, 0.92, 1, 1]),
  ...inventorySlots,
  panel(48, 'Level Panel', 2, [570, 100], [560, 570], [0.025, 0.035, 0.085, 0.94], [0.47, 0.31, 0.78, 0.65]),
  label(49, 'Level Header', 2, [570, 335], [490, 52], '选择远征关卡', 23, [0.85, 0.78, 1, 1]),
  button(50, 'Level Eclipse Garden', 2, [570, 245], [490, 68], '第一章  蚀月庭院', 'level:eclipse_garden'),
  button(51, 'Level Astral Archive', 2, [570, 155], [490, 68], '第二章  星界书库', 'level:astral_archive', [0.14, 0.12, 0.28, 1], [0.45, 0.3, 0.85, 1]),
  button(52, 'Level Sunken Observatory', 2, [570, 65], [490, 68], '第三章  沉没观星台', 'level:sunken_observatory', [0.14, 0.12, 0.28, 1], [0.45, 0.3, 0.85, 1]),
  label(53, 'Level Detail', 2, [570, -70], [490, 130], '在蚀月中坚持到最后', 14, [0.64, 0.73, 0.89, 1]),
  button(54, 'Start Run Button', 2, [570, -215], [490, 65], '开始远征', 'start-run', [0.12, 0.38, 0.47, 1], [0.2, 0.8, 0.93, 1]),
  button(55, 'Logout Button', 2, [825, -445], [150, 40], '退出登录', 'logout', [0.15, 0.08, 0.15, 0.85], [0.55, 0.17, 0.36, 1]),
  label(56, 'Lobby Toast', 2, [350, -440], [760, 48], '', 16, [0.45, 0.9, 1, 1]),
];

const game = [
  camera(),
  entity(2, 'Arena Background', null, 1, {
    Transform: transform(0, 0, -2),
    SpriteRenderer: { sprite: `${art}/eclipse-citadel.png`, color: [0.26, 0.31, 0.53, 1], size: [17.78, 10], pivot: [0.5, 0.5], sorting_layer: 'default', sorting_order: -100 },
  }),
  entity(3, 'Player', null, 2, {
    Transform: transform(0, 0, 0),
    AnimatedSprite2D: { frames: [`${art}/eclipse-warden-aligned.png#idle_0`, `${art}/eclipse-warden-aligned.png#idle_1`], fps: 2.5, playing: true, looped: true, frame: 0, color: [1, 1, 1, 1], size: [1.26, 1.26], pivot: [0.5, 0.47], flip_x: false, flip_y: false, sorting_layer: 'default', sorting_order: 50 },
  }),
  canvas(4),
  panel(5, 'HUD Top', 4, [0, 485], [1920, 110], [0.015, 0.02, 0.065, 0.88], [0.25, 0.6, 0.85, 0.45]),
  label(6, 'HUD Stage', 4, [-725, 485], [430, 70], '蚀月庭院', 22, [0.82, 0.76, 1, 1], 'Left'),
  label(7, 'HUD Timer', 4, [0, 485], [280, 70], '03:00', 32, [0.94, 0.97, 1, 1]),
  label(8, 'HUD Stats', 4, [630, 485], [440, 70], '等级 1  ·  击败 0  ·  金币 0', 14, [0.55, 0.86, 1, 1], 'Right'),
  entity(9, 'Health Bar', 4, 9, { RectTransform: rect([-640, -480], [430, 28]), ProgressBar: { min_value: 0, max_value: 100, value: 100, direction: 'LeftToRight', background_color: [0.12, 0.04, 0.09, 0.92], fill_color: [0.91, 0.16, 0.35, 1], text_color: [1, 1, 1, 1], show_label: true, font: UI_FONT, font_size: 13 * UI_SCALE } }),
  entity(10, 'Experience Bar', 4, 10, { RectTransform: rect([0, -506], [800, 20]), ProgressBar: { min_value: 0, max_value: 10, value: 0, direction: 'LeftToRight', background_color: [0.035, 0.05, 0.12, 0.94], fill_color: [0.22, 0.74, 0.97, 1], text_color: [1, 1, 1, 1], show_label: false, font: UI_FONT, font_size: 12 * UI_SCALE } }),
  panel(11, 'Skill Tray', 4, [610, -425], [570, 120], [0.015, 0.02, 0.065, 0.88], [0.38, 0.28, 0.7, 0.5]),
  label(12, 'HUD Skills', 4, [610, -425], [520, 90], '星芒飞弹 Lv.1', 16, [0.8, 0.83, 1, 1]),
  label(13, 'Run Toast', 4, [0, 325], [900, 70], '蚀月升起，守住阵线！', 24, [0.55, 0.9, 1, 1]),
  label(14, 'Controls Hint', 4, [-700, -425], [450, 65], 'WASD 移动  ·  技能自动释放', 13, [0.55, 0.63, 0.78, 1]),
  button(15, 'Pause Button', 4, [865, 485], [90, 44], '暂停', 'pause', [0.08, 0.12, 0.24, 0.95], [0.28, 0.58, 0.82, 1]),
  panel(16, 'Pause Overlay', 4, [0, -1600], [640, 420], [0.025, 0.035, 0.1, 0.96], [0.45, 0.3, 0.8, 0.8]),
  label(17, 'Pause Title', 16, [0, 110], [520, 80], '战斗暂停', 34, [0.9, 0.84, 1, 1]),
  label(18, 'Pause Summary', 16, [0, 25], [520, 80], '在蚀月下稍作喘息', 16, [0.65, 0.72, 0.87, 1]),
  button(19, 'Resume Button', 16, [0, -70], [360, 58], '继续战斗', 'resume'),
  button(20, 'Abandon Button', 16, [0, -145], [360, 48], '放弃本局', 'abandon', [0.27, 0.08, 0.17, 1], [0.7, 0.18, 0.38, 1]),
  panel(21, 'Skill Choice Overlay', 4, [0, -1600], [1140, 620], [0.018, 0.03, 0.09, 0.985], [0.28, 0.78, 0.94, 0.9]),
  label(22, 'Choice Title', 21, [0, 240], [1000, 70], '等级提升', 31, [0.75, 0.97, 1, 1]),
  label(23, 'Choice Subtitle', 21, [0, 180], [1000, 44], '选择一项能力，战斗将暂停', 15, [0.58, 0.68, 0.8, 1]),
  button(24, 'Choice Button 1', 21, [-360, -40], [310, 370], '技能一', 'choose-skill:0', [0.065, 0.105, 0.2, 1], [0.18, 0.68, 0.88, 1]),
  button(25, 'Choice Button 2', 21, [0, -40], [310, 370], '技能二', 'choose-skill:1', [0.085, 0.07, 0.2, 1], [0.48, 0.3, 0.86, 1]),
  button(26, 'Choice Button 3', 21, [360, -40], [310, 370], '技能三', 'choose-skill:2', [0.12, 0.07, 0.16, 1], [0.78, 0.28, 0.58, 1]),
  image(27, 'Choice Icon 1', 21, [-360, 30], [112, 112], `${art}/skills-v2-atlas.png#chain_lightning`),
  image(28, 'Choice Icon 2', 21, [0, 30], [112, 112], `${art}/skills-v2-atlas.png#meteor_shower`),
  image(29, 'Choice Icon 3', 21, [360, 30], [112, 112], `${art}/skills-v2-atlas.png#frost_pulse`),
];

writeJson('project.json', {
  name: '蚀月幸存者', version: 1, language: 'typescript',
  mainScene: 'Assets/Scenes/Login.mscene',
  buildScenes: ['Assets/Scenes/Login.mscene', 'Assets/Scenes/Lobby.mscene', 'Assets/Scenes/Game.mscene'],
  startupScript: 'Assets/Scripts/Main.ts', assetMode: 'all',
});
writeJson('Assets/Scenes/Login.mscene', scene('Login', login, 10));
writeJson('Assets/Scenes/Lobby.mscene', scene('Lobby', lobby, 23));
writeJson('Assets/Scenes/Game.mscene', scene('Game', game, 3));
writeJson('Assets/Art/Generated/eclipse-warden.png.sprite.json', { version: 1, mode: 'single', pixels_per_unit: 420, slices: [] });
writeJson('Assets/Art/Generated/eclipse-warden-sheet.png.sprite.json', {
  version: 1, mode: 'multiple', pixels_per_unit: 440,
  slices: [
    ['idle_0', 0, 0], ['idle_1', 512, 0], ['run_0', 1024, 0],
    ['run_1', 0, 512], ['attack_0', 512, 512], ['attack_1', 1024, 512],
  ].map(([name, x, y]) => ({ name, rect: [x, y, 512, 512], pivot: [0.5, 0.47] })),
});
writeJson('Assets/Art/Generated/eclipse-warden-aligned.png.sprite.json', {
  version: 1, mode: 'multiple', pixels_per_unit: 440,
  slices: [
    ['idle_0', 0, 0], ['idle_1', 512, 0], ['run_0', 1024, 0],
    ['run_1', 0, 512], ['attack_0', 512, 512], ['attack_1', 1024, 512],
  ].map(([name, x, y]) => ({ name, rect: [x, y, 512, 512], pivot: [0.5, 0.47] })),
});
const atlasCuts = [0, 314, 627, 941, 1254];
writeJson('Assets/Art/Generated/enemies-animated-atlas.png.sprite.json', {
  version: 1, mode: 'multiple', pixels_per_unit: 330,
  slices: ['shadow_bat', 'moon_knight', 'astral_slime', 'rift_hound'].flatMap((name, row) =>
    [0, 1, 2, 3].map((frame) => ({
      name: `${name}_${frame}`,
      rect: [atlasCuts[frame], atlasCuts[row], atlasCuts[frame + 1] - atlasCuts[frame], atlasCuts[row + 1] - atlasCuts[row]],
      pivot: [0.5, 0.5],
    }))),
});
writeJson('Assets/Art/Generated/enemies-aligned-atlas.png.sprite.json', {
  version: 1, mode: 'multiple', pixels_per_unit: 330,
  slices: ['shadow_bat', 'moon_knight', 'astral_slime', 'rift_hound'].flatMap((name, row) =>
    [0, 1, 2, 3].map((frame) => ({
      name: `${name}_${frame}`,
      rect: [atlasCuts[frame], atlasCuts[row], atlasCuts[frame + 1] - atlasCuts[frame], atlasCuts[row + 1] - atlasCuts[row]],
      pivot: [0.5, 0.5],
    }))),
});
writeJson('Assets/Art/Generated/skills-v2-atlas.png.sprite.json', {
  version: 1, mode: 'multiple', pixels_per_unit: 260,
  slices: ['chain_lightning', 'meteor_shower', 'moon_boomerang', 'frost_pulse']
    .map((name, index) => ({ name, rect: [(index % 2) * 627, Math.floor(index / 2) * 627, 627, 627], pivot: [0.5, 0.5] })),
});
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
const skillIconV2 = (name) => `${art}/skills-v2-atlas.png#${name}`;
const effect = (name) => `Assets/Effects/${name}.efkefc`;
writeJson('Assets/Data/Skills.mskill', {
  version: 1,
  kind: 'skill-library',
  skills: [
    { id: 'astral_bolt', name: '星芒飞弹', description: '自动追踪最近的敌人，升级后增加伤害与弹道。', icon: skillIcon('astral_bolt'), pattern: 'nearest', damage: 30, cooldown: 0.46, projectileSpeed: 11, range: 10, count: 1, maxLevel: 6, color: '#4de5ff', upgrades: [1, 1.3, 1.65, 2.05, 2.55, 3.2], castEffect: effect('ef_parts_hit01'), impactEffect: effect('ef_parts_hit01'), effectScale: 0.1 },
    { id: 'eclipse_nova', name: '蚀月新星', description: '向四面八方爆发弹幕，快速清理包围圈。', icon: skillIcon('eclipse_nova'), pattern: 'radial', damage: 24, cooldown: 2.7, projectileSpeed: 7.2, range: 7.2, count: 10, maxLevel: 6, color: '#b666ff', upgrades: [1, 1.28, 1.62, 2, 2.48, 3], castEffect: effect('ef_holy01'), impactEffect: effect('ef_parts_hit01'), effectScale: 0.14 },
    { id: 'crescent_orbit', name: '月刃环绕', description: '召唤实体月刃环绕守望者，持续切割近身怪潮。', icon: skillIcon('crescent_orbit'), pattern: 'orbit', damage: 16, cooldown: 2.8, projectileSpeed: 1.1, range: 2.5, count: 3, maxLevel: 6, color: '#d9ddff', upgrades: [1, 1.25, 1.56, 1.92, 2.34, 2.85], castEffect: effect('ef_ice02'), impactEffect: effect('ef_parts_hit01'), effectScale: 0.08 },
    { id: 'gravity_well', name: '引力深井', description: '召唤持续脉动的引力场，碾压附近所有敌人。', icon: skillIcon('gravity_well'), pattern: 'aura', damage: 12, cooldown: 0.9, projectileSpeed: 0, range: 2.8, count: 1, maxLevel: 6, color: '#5878ff', upgrades: [1, 1.32, 1.7, 2.15, 2.7, 3.35], castEffect: effect('ef_holy01'), impactEffect: effect('ef_parts_hit01'), effectScale: 0.12 },
    { id: 'chain_lightning', name: '跃迁雷链', description: '闪电在多个目标间瞬时跃迁，没有飞行弹道。', icon: skillIconV2('chain_lightning'), pattern: 'chain', damage: 22, cooldown: 1.25, projectileSpeed: 14, range: 7.8, count: 3, maxLevel: 6, color: '#66f4ff', upgrades: [1, 1.3, 1.68, 2.12, 2.65, 3.3], castEffect: effect('ef_lightning02'), impactEffect: effect('ef_lightning03'), effectScale: 0.055 },
    { id: 'meteor_shower', name: '星陨轰击', description: '锁定怪群中心降下烈焰陨星，造成大范围爆炸。', icon: skillIconV2('meteor_shower'), pattern: 'meteor', damage: 44, cooldown: 2.35, projectileSpeed: 14, range: 9, count: 1, maxLevel: 6, color: '#ff8b4d', upgrades: [1, 1.3, 1.7, 2.18, 2.75, 3.45], castEffect: effect('ef_fire03'), impactEffect: effect('ef_fire02'), effectScale: 0.055 },
    { id: 'moon_boomerang', name: '双月回旋', description: '月牙旋转飞出后自动折返，去程和回程都能切割敌人。', icon: skillIconV2('moon_boomerang'), pattern: 'boomerang', damage: 26, cooldown: 1.05, projectileSpeed: 8.2, range: 8.5, count: 2, maxLevel: 6, color: '#f4d7ff', upgrades: [1, 1.28, 1.62, 2.04, 2.55, 3.15], castEffect: effect('ef_ice02'), impactEffect: effect('ef_parts_hit01'), effectScale: 0.065 },
    { id: 'frost_pulse', name: '霜环脉冲', description: '以冰霜环瞬时冻结整圈怪潮，为走位争取空间。', icon: skillIconV2('frost_pulse'), pattern: 'pulse', damage: 18, cooldown: 1.45, projectileSpeed: 0, range: 3.2, count: 1, maxLevel: 6, color: '#91caff', upgrades: [1, 1.3, 1.66, 2.08, 2.58, 3.2], castEffect: effect('ef_ice03'), impactEffect: effect('ef_ice01'), effectScale: 0.08 },
  ],
});
writeJson('Assets/Data/Levels.mlevel', {
  version: 1,
  kind: 'level-library',
  levels: [
    { id: 'eclipse_garden', name: '蚀月庭院', description: '适合初次远征的废墟庭院。怪潮会从稀疏迅速增长到满屏压境。', duration: 180, background: `${art}/eclipse-citadel.png`, accent: '#47dfff', recommendedPower: 0, waves: [
      { start: 0, duration: 38, enemy: 'wisp', count: 150, hp: 18, speed: 1.3, damage: 5 },
      { start: 14, duration: 52, enemy: 'shadow_bat', count: 170, hp: 22, speed: 1.9, damage: 5 },
      { start: 34, duration: 58, enemy: 'astral_slime', count: 130, hp: 42, speed: 1.05, damage: 7 },
      { start: 58, duration: 62, enemy: 'thorn_crawler', count: 160, hp: 52, speed: 1.55, damage: 8 },
      { start: 90, duration: 64, enemy: 'rift_hound', count: 180, hp: 58, speed: 2.15, damage: 9 },
      { start: 118, duration: 54, enemy: 'ember_cultist', count: 125, hp: 88, speed: 1.18, damage: 11 },
      { start: 145, duration: 32, enemy: 'moon_knight', count: 70, hp: 165, speed: 0.92, damage: 14 },
    ], boss: { enemy: 'void_guardian', spawnAt: 165, hp: 1500, speed: 0.78, damage: 22 } },
    { id: 'astral_archive', name: '星界书库', description: '高速怪群交替夹击，重甲月骑士会在弹幕中强行推进。', duration: 240, background: `${art}/eclipse-citadel.png`, accent: '#b966ff', recommendedPower: 4, waves: [
      { start: 0, duration: 62, enemy: 'shadow_bat', count: 260, hp: 38, speed: 2.2, damage: 7 },
      { start: 25, duration: 78, enemy: 'rift_hound', count: 230, hp: 65, speed: 2.45, damage: 10 },
      { start: 50, duration: 85, enemy: 'astral_slime', count: 220, hp: 78, speed: 1.22, damage: 10 },
      { start: 82, duration: 88, enemy: 'thorn_crawler', count: 250, hp: 95, speed: 1.85, damage: 13 },
      { start: 118, duration: 92, enemy: 'ember_cultist', count: 190, hp: 135, speed: 1.35, damage: 16 },
      { start: 155, duration: 75, enemy: 'moon_knight', count: 130, hp: 260, speed: 1.02, damage: 20 },
      { start: 190, duration: 42, enemy: 'wisp', count: 300, hp: 82, speed: 2.7, damage: 12 },
    ], boss: { enemy: 'void_guardian', spawnAt: 220, hp: 3000, speed: 0.92, damage: 30 } },
    { id: 'sunken_observatory', name: '沉没观星台', description: '所有怪物族群同时涌入的终局远征，必须构筑完整技能组合。', duration: 300, background: `${art}/eclipse-citadel.png`, accent: '#ffb24d', recommendedPower: 8, waves: [
      { start: 0, duration: 85, enemy: 'rift_hound', count: 330, hp: 80, speed: 2.55, damage: 12 },
      { start: 24, duration: 105, enemy: 'shadow_bat', count: 390, hp: 58, speed: 2.75, damage: 10 },
      { start: 58, duration: 120, enemy: 'astral_slime', count: 320, hp: 130, speed: 1.4, damage: 15 },
      { start: 92, duration: 120, enemy: 'thorn_crawler', count: 350, hp: 155, speed: 2.05, damage: 18 },
      { start: 128, duration: 132, enemy: 'ember_cultist', count: 280, hp: 220, speed: 1.48, damage: 22 },
      { start: 165, duration: 120, enemy: 'moon_knight', count: 210, hp: 390, speed: 1.14, damage: 27 },
      { start: 210, duration: 80, enemy: 'wisp', count: 520, hp: 120, speed: 3.05, damage: 16 },
      { start: 245, duration: 48, enemy: 'shadow_bat', count: 420, hp: 105, speed: 3.2, damage: 17 },
    ], boss: { enemy: 'void_guardian', spawnAt: 275, hp: 5400, speed: 1.05, damage: 38 } },
  ],
});
writeJson('Assets/Data/Balance.mgame', {
  version: 1, kind: 'game-balance', player: { baseHealth: 120, moveSpeed: 4.45, pickupRadius: 1.65 },
  progression: { experienceBase: 5, experienceGrowth: 1.23, goldPerKill: 0.08 },
  equipment: [
    { id: 'moonstaff', name: '月钢法杖', description: '攻击伤害 +22%', power: 2, slot: 'weapon', rarity: '稀有', icon: skillIcon('moonstaff'), modifiers: { damage: 1.22 } },
    { id: 'star_scepter', name: '星痕权杖', description: '攻击伤害 +38%', power: 4, slot: 'weapon', rarity: '史诗', icon: skillIcon('moonstaff'), modifiers: { damage: 1.38 } },
    { id: 'eclipse_blade', name: '蚀月长刃', description: '攻击伤害 +52%，冷却 -6%', power: 6, slot: 'weapon', rarity: '传说', icon: skillIconV2('moon_boomerang'), modifiers: { damage: 1.52, cooldown: 0.94 } },
    { id: 'mantle', name: '星织披风', description: '最大生命 +28', power: 2, slot: 'armor', rarity: '稀有', icon: skillIcon('mantle'), modifiers: { health: 28 } },
    { id: 'void_plate', name: '虚空板甲', description: '最大生命 +55', power: 4, slot: 'armor', rarity: '史诗', icon: skillIcon('mantle'), modifiers: { health: 55 } },
    { id: 'solar_aegis', name: '日冕圣铠', description: '最大生命 +85，伤害 +8%', power: 6, slot: 'armor', rarity: '传说', icon: skillIcon('mantle'), modifiers: { health: 85, damage: 1.08 } },
    { id: 'boots', name: '黑曜战靴', description: '移动速度 +16%', power: 2, slot: 'boots', rarity: '稀有', icon: skillIcon('boots'), modifiers: { speed: 1.16 } },
    { id: 'rift_greaves', name: '裂隙胫甲', description: '移动速度 +24%', power: 4, slot: 'boots', rarity: '史诗', icon: skillIcon('boots'), modifiers: { speed: 1.24 } },
    { id: 'comet_steps', name: '彗星行者', description: '移动速度 +32%，冷却 -5%', power: 6, slot: 'boots', rarity: '传说', icon: skillIcon('boots'), modifiers: { speed: 1.32, cooldown: 0.95 } },
    { id: 'sunring', name: '日辉指环', description: '技能冷却 -15%', power: 3, slot: 'accessory', rarity: '稀有', icon: skillIcon('sunring'), modifiers: { cooldown: 0.85 } },
    { id: 'frost_amulet', name: '霜星护符', description: '冷却 -21%，生命 +18', power: 5, slot: 'accessory', rarity: '史诗', icon: skillIconV2('frost_pulse'), modifiers: { cooldown: 0.79, health: 18 } },
    { id: 'gravity_relic', name: '引力遗物', description: '冷却 -27%，伤害 +12%', power: 7, slot: 'accessory', rarity: '传说', icon: skillIcon('gravity_well'), modifiers: { cooldown: 0.73, damage: 1.12 } },
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
  if (lower.endsWith('.ttf') || lower.endsWith('.otf')) return 'font';
  if (lower.endsWith('.ts')) return 'script';
  return 'default';
}
const assets = [
  'Assets/Scenes/Login.mscene', 'Assets/Scenes/Lobby.mscene', 'Assets/Scenes/Game.mscene',
  'Assets/Data/Skills.mskill', 'Assets/Data/Levels.mlevel', 'Assets/Data/Balance.mgame',
  'Assets/Effects/SurvivorSkills.meffect',
  'Assets/Art/Generated/eclipse-citadel.png', 'Assets/Art/Generated/eclipse-warden.png',
  'Assets/Art/Generated/eclipse-warden-sheet.png', 'Assets/Art/Generated/enemies-atlas.png',
  'Assets/Art/Generated/eclipse-warden-aligned.png', 'Assets/Art/Generated/enemies-animated-atlas.png',
  'Assets/Art/Generated/enemies-aligned-atlas.png', 'Assets/Art/Generated/icons-atlas.png',
  'Assets/Art/Generated/skills-v2-atlas.png', 'Assets/Fonts/NotoSansSC.ttf',
];
if (fs.existsSync(path.join(projectRoot, 'Assets/Scripts/Main.ts'))) assets.push('Assets/Scripts/Main.ts');
for (const relative of assets) {
  writeJson(`${relative}.meta`, { schemaVersion: 1, guid: stableGuid(relative), importer: importer(relative) });
}
console.log(`Generated Eclipse Survivors project at ${projectRoot}`);
