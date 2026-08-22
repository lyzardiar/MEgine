/** Author: MiYu */
/** Eclipse Survivors: a complete data-driven survivor roguelite sample. */

type Vec2 = { x: number; y: number };
type SkillPattern = 'nearest' | 'radial' | 'orbit' | 'aura' | 'chain' | 'meteor' | 'boomerang' | 'pulse';
type SkillDefinition = {
  id: string; name: string; description: string; icon: string; pattern: SkillPattern;
  damage: number; cooldown: number; projectileSpeed: number; range: number; count: number;
  maxLevel: number; color: string; upgrades: number[];
  castEffect?: string; impactEffect?: string; effectScale?: number;
};
type WaveDefinition = {
  start: number; duration: number; enemy: string; count: number; hp: number; speed: number; damage: number;
};
type LevelDefinition = {
  id: string; name: string; description: string; duration: number; background: string; accent: string;
  recommendedPower: number; waves: WaveDefinition[];
  boss: { enemy: string; spawnAt: number; hp: number; speed: number; damage: number };
};
type EquipmentDefinition = {
  id: string; name: string; description: string; power: number; slot: EquipmentSlot;
  rarity: '普通' | '稀有' | '史诗' | '传说'; icon: string;
  modifiers: { damage?: number; health?: number; speed?: number; cooldown?: number };
};
type EquipmentSlot = 'weapon' | 'armor' | 'boots' | 'accessory';
type BalanceDefinition = {
  player: { baseHealth: number; moveSpeed: number; pickupRadius: number };
  progression: { experienceBase: number; experienceGrowth: number; goldPerKill: number };
  equipment: EquipmentDefinition[];
};
type Profile = {
  name: string; gold: number; totalKills: number; bestTime: number;
  equipped: string[]; unlockedEquipment: string[]; completedLevels: string[];
};
type SaveData = { version: 1; profile: Profile | null };
type EnemyState = {
  name: string; id: string | null; kind: string; position: Vec2; hp: number; maxHp: number;
  speed: number; damage: number; radius: number; boss: boolean; hitCooldown: number;
  slowTime: number; phase: number;
};
type ProjectileState = {
  name: string; id: string | null; position: Vec2; velocity: Vec2; damage: number;
  origin: Vec2; radius: number; life: number; duration: number; pierce: number; visualOnly: boolean;
  motion: 'linear' | 'boomerang' | 'orbit'; orbitIndex: number; orbitCount: number; orbitRadius: number;
  spin: number; impactEffect: string; effectScale: number; hitEnemies: string[];
};
type EffectState = { name: string; bornAt: number; ttl: number };
type GemState = { name: string; id: string | null; position: Vec2; value: number; life: number };
type RunState = {
  level: LevelDefinition; elapsed: number; paused: boolean; ended: boolean; victory: boolean;
  player: Vec2; health: number; maxHealth: number; moveSpeed: number; damageMultiplier: number;
  cooldownMultiplier: number; xp: number; xpNext: number; playerLevel: number; kills: number; gold: number;
  skills: Record<string, number>; skillTimers: Record<string, number>; spawnedByWave: number[];
  bossSpawned: boolean; enemies: EnemyState[]; projectiles: ProjectileState[]; gems: GemState[]; effects: EffectState[];
  hudTimer: number; toast: string; toastTime: number; choosingSkill: boolean;
  choices: string[]; pendingLevels: number; playerAttackTime: number; playerAnimation: string; playerFacingLeft: boolean;
  fps: number; visualAccumulator: number; syncVisuals: boolean;
};

const ART = 'Assets/Art/Generated';
const SKILLS_PATH = 'Assets/Data/Skills.mskill';
const LEVELS_PATH = 'Assets/Data/Levels.mlevel';
const BALANCE_PATH = 'Assets/Data/Balance.mgame';
const UI_FONT = 'Assets/Fonts/NotoSansSC.ttf';
const TAU = Math.PI * 2;
const UI_SCALE = 1;
const ENEMY_LIMIT = 140;
const GENERATED_LIMIT = 240;
const EFFECT_LIMIT = 18;
const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'boots', 'accessory'];

const skills = ((engine.data[SKILLS_PATH] as { skills?: SkillDefinition[] } | undefined)?.skills ?? []);
const levels = ((engine.data[LEVELS_PATH] as { levels?: LevelDefinition[] } | undefined)?.levels ?? []);
const balance = (engine.data[BALANCE_PATH] as BalanceDefinition | undefined) ?? {
  player: { baseHealth: 100, moveSpeed: 4.2, pickupRadius: 1.2 },
  progression: { experienceBase: 9, experienceGrowth: 1.34, goldPerKill: 0.12 },
  equipment: [],
};

let saveData = normalizeSave(engine.storage);
let selectedLevelId = levels[0]?.id ?? 'eclipse_garden';
let selectedEquipmentId = balance.equipment[0]?.id ?? '';
let currentScene = '';
let sceneNeedsRefresh = true;
let run: RunState | null = null;
let serial = 0;
let randomState = 0x5f3759df;

function normalizeSave(raw: Record<string, unknown>): SaveData {
  const candidate = raw as Partial<SaveData>;
  const profile = candidate.profile;
  if (!profile || typeof profile !== 'object' || typeof profile.name !== 'string') {
    return { version: 1, profile: null };
  }
  return {
    version: 1,
    profile: {
      name: profile.name.slice(0, 18),
      gold: finite(profile.gold, 0),
      totalKills: Math.floor(finite(profile.totalKills, 0)),
      bestTime: finite(profile.bestTime, 0),
      equipped: strings(profile.equipped),
      unlockedEquipment: strings(profile.unlockedEquipment),
      completedLevels: strings(profile.completedLevels),
    },
  };
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function persist(): void {
  engine.storage = saveData as unknown as Record<string, unknown>;
  engine.save();
}

function newProfile(name: string): Profile {
  return {
    name: name.trim().slice(0, 18) || '游客守望者',
    gold: 0,
    totalKills: 0,
    bestTime: 0,
    equipped: ['moonstaff'],
    unlockedEquipment: balance.equipment.map((item) => item.id),
    completedLevels: [],
  };
}

function entityId(name: string): string | null {
  return engine.findEntity(name);
}

function color(hex: string, alpha = 1): [number, number, number, number] {
  const value = hex.replace('#', '').padEnd(6, 'f');
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
    alpha,
  ];
}

function transform(position: Vec2, scale = 1, angle = 0): Record<string, unknown> {
  const half = angle * 0.5;
  return {
    position: [position.x, position.y, 0],
    rotation: [0, 0, Math.sin(half), Math.cos(half)],
    scale: [scale, scale, 1],
  };
}

function rectTransform(position: Vec2, size: Vec2): Record<string, unknown> {
  return {
    anchor_min: [0.5, 0.5], anchor_max: [0.5, 0.5], pivot: [0.5, 0.5],
    anchored_position: [position.x * UI_SCALE, -position.y * UI_SCALE],
    size_delta: [size.x * UI_SCALE, size.y * UI_SCALE],
    local_rotation: 0, local_scale: [1, 1],
  };
}

function textComponent(value: string, fontSize = 16, tint = '#dceaff', alignment = 'Center'): Record<string, unknown> {
  return {
    text: value, color: color(tint), font: UI_FONT, font_size: fontSize * UI_SCALE, font_style: 'Normal',
    alignment, vertical_align: 'Middle', support_rich_text: true,
    horizontal_overflow: 'Wrap', vertical_overflow: 'Overflow', raycast_target: false,
    outline_color: [0.01, 0.02, 0.06, 0.9], outline_width: 0,
  };
}

function buttonComponent(label: string, callback: string, active = false, fontSize = 18): Record<string, unknown> {
  const normal = active ? color('#245c7b') : color('#182848');
  return {
    interactable: true, transition: 'ColorTint', normal_color: normal,
    highlighted_color: color(active ? '#39bce5' : '#2d6d9a'),
    pressed_color: color('#153a5a'), selected_color: color('#2d91ba'),
    disabled_color: [0.15, 0.16, 0.2, 0.5], color_multiplier: 1, fade_duration: 0.08,
    label, text_color: [0.94, 0.98, 1, 1], font: UI_FONT, font_size: fontSize * UI_SCALE, on_click: callback,
  };
}

function setNamed(name: string, component: string, value: Record<string, unknown>): void {
  const id = entityId(name);
  if (id) engine.setComponent(id, component, value);
}

function setText(name: string, value: string, fontSize = 16, tint = '#dceaff', alignment = 'Center'): void {
  setNamed(name, 'Text', textComponent(value, fontSize, tint, alignment));
}

function setButton(name: string, label: string, callback: string, active = false, fontSize = 18): void {
  setNamed(name, 'Button', buttonComponent(label, callback, active, fontSize));
}

function setProgress(name: string, value: number, maximum: number, fill: string, showLabel: boolean): void {
  setNamed(name, 'ProgressBar', {
    min_value: 0, max_value: Math.max(1, maximum), value: Math.max(0, value), direction: 'LeftToRight',
    background_color: [0.035, 0.045, 0.1, 0.94], fill_color: color(fill),
    text_color: [1, 1, 1, 1], show_label: showLabel, font: UI_FONT, font_size: 13 * UI_SCALE,
  });
}

function showPauseOverlay(visible: boolean): void {
  setNamed('Pause Overlay', 'RectTransform', rectTransform({ x: 0, y: visible ? 0 : -1600 }, { x: 640, y: 420 }));
}

function equipmentPower(profile: Profile): number {
  return profile.equipped.reduce((sum, id) => sum + (balance.equipment.find((item) => item.id === id)?.power ?? 0), 0);
}

function equipmentSlotName(slot: EquipmentSlot): string {
  return slot === 'weapon' ? '武器' : slot === 'armor' ? '护甲' : slot === 'boots' ? '战靴' : '饰品';
}

function equipmentRarityColor(rarity: EquipmentDefinition['rarity']): string {
  return rarity === '传说' ? '#ffc75a' : rarity === '史诗' ? '#d78cff' : rarity === '稀有' ? '#65c9ff' : '#b9c8d8';
}

function refreshEquipmentUi(profile: Profile): void {
  const available = balance.equipment.filter((item) => profile.unlockedEquipment.includes(item.id));
  if (!available.some((item) => item.id === selectedEquipmentId)) selectedEquipmentId = available[0]?.id ?? '';

  EQUIPMENT_SLOTS.forEach((slot) => {
    const item = balance.equipment.find((candidate) => candidate.slot === slot && profile.equipped.includes(candidate.id));
    const suffix = slot === 'weapon' ? 'Weapon' : slot === 'armor' ? 'Armor' : slot === 'boots' ? 'Boots' : 'Accessory';
    setButton(`Equipped ${suffix}`, item ? `${equipmentSlotName(slot)}\n${item.name}` : `${equipmentSlotName(slot)}\n未装备`, `unequip-slot:${slot}`, Boolean(item), 12);
    setNamed(`Equipped ${suffix} Icon`, 'Image', {
      sprite: item?.icon ?? '', color: item ? [1, 1, 1, 1] : [0.22, 0.28, 0.4, 0.3],
      image_type: 'Simple', preserve_aspect: true, raycast_target: false,
    });
  });

  for (let index = 0; index < 12; index += 1) {
    const item = available[index];
    const selected = item?.id === selectedEquipmentId;
    const equipped = item ? profile.equipped.includes(item.id) : false;
    setButton(`Inventory Item ${index + 1}`, item ? `${selected ? '◆ ' : ''}${item.name}\n${item.rarity}${equipped ? ' · 已装备' : ''}` : '空背包格', item ? `inventory:${item.id}` : '', selected, 11);
    setNamed(`Inventory Icon ${index + 1}`, 'Image', {
      sprite: item?.icon ?? '', color: item ? [1, 1, 1, 1] : [0.14, 0.17, 0.25, 0.22],
      image_type: 'Simple', preserve_aspect: true, raycast_target: false,
    });
  }

  const selected = balance.equipment.find((item) => item.id === selectedEquipmentId);
  if (!selected) return;
  const equipped = profile.equipped.includes(selected.id);
  setText('Equipment Detail', `${selected.name}  ·  ${selected.rarity} ${equipmentSlotName(selected.slot)}  ·  战力 +${selected.power}\n${selected.description}`, 12, equipmentRarityColor(selected.rarity), 'Left');
  setButton('Equip Selected Button', equipped ? '已装备 · 点击卸下' : `装备到${equipmentSlotName(selected.slot)}栏`, equipped ? `unequip:${selected.id}` : 'equip-selected', equipped, 13);
}

function refreshLogin(): void {
  const profile = saveData.profile;
  setText('Login Status', profile
    ? `欢迎回来，${profile.name}。你拥有 ${Math.floor(profile.gold)} 星辉金币。`
    : '创建本地守望者档案，开始挑战蚀月。', 14, profile ? '#71e8ff' : '#f1a9c4');
  setButton('Continue Button', profile ? `以 ${profile.name} 的身份继续` : '以游客身份继续', 'continue', Boolean(profile));
}

function refreshLobby(message = ''): void {
  const profile = saveData.profile;
  if (!profile) {
    engine.loadScene('Login');
    return;
  }
  const power = equipmentPower(profile);
  setText('Profile Summary', `${profile.name}  ·  ${Math.floor(profile.gold)} 金币  ·  累计击败 ${profile.totalKills}`, 15, '#7ce9ff', 'Right');
  setText('Warden Stats', `守望者  ${profile.name}\n战力 ${power}  ·  最佳 ${formatTime(profile.bestTime)}\n已完成 ${profile.completedLevels.length}/${levels.length} 个关卡`, 14, '#c4d9ff');
  refreshEquipmentUi(profile);
  for (const level of levels) {
    const active = level.id === selectedLevelId;
    const buttonName = level.id === 'eclipse_garden' ? 'Level Eclipse Garden'
      : level.id === 'astral_archive' ? 'Level Astral Archive' : 'Level Sunken Observatory';
    setButton(buttonName, `${active ? '◆ ' : ''}${level.name}  ·  ${formatTime(level.duration)}`, `level:${level.id}`, active);
  }
  const selected = levels.find((level) => level.id === selectedLevelId) ?? levels[0];
  if (selected) {
    const locked = power < selected.recommendedPower;
    setText('Level Detail', `${selected.description}\n${selected.waves.length} 组怪物潮  ·  Boss 于 ${formatTime(selected.boss.spawnAt)} 出现\n${locked ? `需要战力 ${selected.recommendedPower} · 请装备更多道具` : `准备就绪 · 推荐战力 ${selected.recommendedPower}`}`, 15, locked ? '#ff8ba5' : selected.accent);
    setButton('Start Run Button', locked ? `需要战力 ${selected.recommendedPower}` : '开始远征', 'start-run', !locked);
  }
  setText('Lobby Toast', message, 16, '#67e5ff');
}

function beginRun(): void {
  const profile = saveData.profile;
  const level = levels.find((candidate) => candidate.id === selectedLevelId) ?? levels[0];
  if (!profile || !level) return;
  const power = equipmentPower(profile);
  if (power < level.recommendedPower) {
    refreshLobby(`战力不足：${level.name} 需要 ${level.recommendedPower} 点战力。`);
    return;
  }
  engine.loadScene('Game');
}

function initializeRun(): void {
  const profile = saveData.profile;
  const level = levels.find((candidate) => candidate.id === selectedLevelId) ?? levels[0];
  if (!profile || !level) {
    engine.loadScene('Lobby');
    return;
  }
  let maxHealth = balance.player.baseHealth;
  let moveSpeed = balance.player.moveSpeed;
  let damageMultiplier = 1;
  let cooldownMultiplier = 1;
  for (const id of profile.equipped) {
    const modifiers = balance.equipment.find((item) => item.id === id)?.modifiers;
    maxHealth += modifiers?.health ?? 0;
    moveSpeed *= modifiers?.speed ?? 1;
    damageMultiplier *= modifiers?.damage ?? 1;
    cooldownMultiplier *= modifiers?.cooldown ?? 1;
  }
  randomState = 0x5f3759df ^ level.id.length ^ profile.totalKills;
  run = {
    level, elapsed: 0, paused: false, ended: false, victory: false,
    player: { x: 0, y: 0 }, health: maxHealth, maxHealth, moveSpeed, damageMultiplier,
    cooldownMultiplier, xp: 0, xpNext: balance.progression.experienceBase, playerLevel: 1,
    kills: 0, gold: 0,
    skills: { astral_bolt: 1, crescent_orbit: 1, meteor_shower: 1 },
    skillTimers: {},
    spawnedByWave: level.waves.map(() => 0), bossSpawned: false,
    enemies: [], projectiles: [], gems: [], effects: [], hudTimer: 0, toast: '蚀月升起，守住阵线！', toastTime: 3.5,
    choosingSkill: false, choices: [], pendingLevels: 0, playerAttackTime: 0, playerAnimation: 'idle', playerFacingLeft: false,
    fps: 60, visualAccumulator: 0, syncVisuals: true,
  };
  showPauseOverlay(false);
  setText('HUD Stage', level.name, 22, level.accent, 'Left');
  setText('Run Toast', run.toast, 24, '#77ecff');
  updateHud(true);
}

function random(): number {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 4294967296;
}

function nextName(prefix: string): string {
  serial += 1;
  return `${prefix}_${serial}`;
}

function enemyFrames(kind: string): string[] {
  const animated = ['shadow_bat', 'moon_knight', 'astral_slime', 'rift_hound'];
  if (animated.includes(kind)) {
    return [0, 1, 2, 3].map((frame) => `${ART}/enemies-aligned-atlas.png#${kind}_${frame}`);
  }
  const fallback = `${ART}/enemies-atlas.png#${kind}`;
  return [fallback, fallback];
}

function enemySize(kind: string, boss: boolean): number {
  if (boss) return 1.7;
  if (kind === 'wisp' || kind === 'shadow_bat') return 0.68;
  if (kind === 'astral_slime') return 0.8;
  if (kind === 'thorn_crawler' || kind === 'rift_hound') return 0.88;
  return 1;
}

function spawnEnemy(kind: string, hp: number, speed: number, damage: number, boss = false): void {
  if (!run || run.enemies.length >= ENEMY_LIMIT) return;
  const edge = Math.floor(random() * 4);
  const along = random() * 2 - 1;
  const position = edge === 0 ? { x: -8.4, y: along * 4.3 }
    : edge === 1 ? { x: 8.4, y: along * 4.3 }
      : edge === 2 ? { x: along * 7.6, y: -4.8 }
        : { x: along * 7.6, y: 4.8 };
  const name = nextName(boss ? 'Boss' : 'Enemy');
  const size = enemySize(kind, boss);
  engine.spawnEntity(name, {
    Transform: transform(position, 1),
    AnimatedSprite2D: {
      frames: enemyFrames(kind), fps: kind === 'shadow_bat' ? 11 : kind === 'rift_hound' ? 9 : 7,
      playing: true, looped: true, frame: Math.floor(random() * 4), color: [1, 1, 1, 1],
      size: [size, size], pivot: [0.5, 0.5], flip_x: false, flip_y: false,
      sorting_layer: 'default', sorting_order: boss ? 45 : 25,
    },
  });
  run.enemies.push({ name, id: null, kind, position, hp, maxHp: hp, speed, damage, radius: size * 0.38, boss, hitCooldown: 0, slowTime: 0, phase: random() * TAU });
}

function spawnGem(position: Vec2, value: number): void {
  if (!run || run.projectiles.length + run.gems.length >= GENERATED_LIMIT) return;
  const name = nextName('Gem');
  engine.spawnEntity(name, {
    Transform: transform(position, 1),
    SpriteRenderer: {
      sprite: `${ART}/icons-atlas.png#experience`, color: [0.7, 1, 1, 1], size: [0.28, 0.38],
      pivot: [0.5, 0.5], sorting_layer: 'default', sorting_order: 30,
    },
  });
  run.gems.push({ name, id: null, position: { ...position }, value, life: 22 });
}

function resolveSpawnedIds(): void {
  if (!run) return;
  for (const item of run.enemies) item.id = item.id ?? entityId(item.name);
  for (const item of run.projectiles) item.id = item.id ?? entityId(item.name);
  for (const item of run.gems) item.id = item.id ?? entityId(item.name);
}

function distanceSquared(first: Vec2, second: Vec2): number {
  const dx = first.x - second.x;
  const dy = first.y - second.y;
  return dx * dx + dy * dy;
}

function nearestEnemy(): EnemyState | null {
  if (!run || run.enemies.length === 0) return null;
  let best: EnemyState | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of run.enemies) {
    const candidate = distanceSquared(enemy.position, run.player);
    if (candidate < bestDistance) {
      best = enemy;
      bestDistance = candidate;
    }
  }
  return best;
}

function nearestEnemies(limit: number, range: number): EnemyState[] {
  if (!run) return [];
  const maximum = range * range;
  return run.enemies
    .filter((enemy) => enemy.hp > 0 && distanceSquared(enemy.position, run!.player) <= maximum)
    .sort((left, right) => distanceSquared(left.position, run!.player) - distanceSquared(right.position, run!.player))
    .slice(0, limit);
}

function damageEnemy(enemy: EnemyState, damage: number): void {
  if (!run || enemy.hp <= 0) return;
  enemy.hp -= damage;
  if (enemy.hp > 0) return;
  if (enemy.id) engine.destroyEntity(enemy.id);
  run.kills += 1;
  run.gold += enemy.boss ? 25 : balance.progression.goldPerKill;
  spawnGem(enemy.position, enemy.boss ? 20 : 1);
  if (enemy.boss) {
    run.toast = '虚空守卫已被击败！';
    run.toastTime = 3;
  }
}

function spawnEffect(effect: string | undefined, position: Vec2, scale = 1, angle = 0, speed = 1): void {
  if (!effect || !run || run.effects.length >= EFFECT_LIMIT) return;
  const name = nextName('Effect');
  engine.spawnEntity(name, {
    Transform: transform(position, scale, angle),
    EffekseerEffect: {
      effect, playing: true, looping: false, speed, start_frame: 0, prewarm: false,
      auto_destroy: true, render_mode: 'world', screen_position: [0.5, 0.5], screen_scale: 0.12,
      sorting_order: 70,
    },
  });
  run.effects.push({ name, bornAt: run.elapsed, ttl: 2.4 / Math.max(0.2, speed) });
}

function cleanupEffects(): void {
  if (!run) return;
  const survivors: EffectState[] = [];
  for (const effect of run.effects) {
    if (run.elapsed - effect.bornAt <= effect.ttl) {
      survivors.push(effect);
      continue;
    }
    const id = entityId(effect.name);
    if (id) engine.destroyEntity(id);
  }
  run.effects = survivors;
}

function projectileSprite(pattern: SkillPattern): string {
  if (pattern === 'boomerang') return `${ART}/skills-v2-atlas.png#moon_boomerang`;
  if (pattern === 'meteor') return `${ART}/skills-v2-atlas.png#meteor_shower`;
  return `${ART}/icons-atlas.png#astral_bolt`;
}

function spawnProjectile(
  angle: number,
  damage: number,
  speed: number,
  range: number,
  icon: string,
  tint: string,
  pierce = 0,
  visualOnly = false,
  motion: ProjectileState['motion'] = 'linear',
  impactEffect = '',
  effectScale = 1,
  orbitIndex = 0,
  orbitCount = 1,
): void {
  if (!run || run.projectiles.length + run.gems.length >= GENERATED_LIMIT) return;
  const name = nextName('Projectile');
  const position = { ...run.player };
  const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  const duration = motion === 'orbit' ? Math.max(0.5, range / Math.max(0.1, speed)) : Math.max(0.16, range / Math.max(0.1, speed));
  const size: [number, number] = motion === 'boomerang' || motion === 'orbit' ? [0.48, 0.48] : [0.62, 0.28];
  engine.spawnEntity(name, {
    Transform: transform(position, 1, angle),
    SpriteRenderer: {
      sprite: icon, color: color(tint), size, pivot: [0.5, 0.5],
      sorting_layer: 'default', sorting_order: 60,
    },
  });
  run.projectiles.push({
    name, id: null, position, origin: { ...position }, velocity, damage, radius: motion === 'orbit' ? 0.3 : 0.22,
    life: duration, duration, pierce, visualOnly, motion, orbitIndex, orbitCount, orbitRadius: range,
    spin: motion === 'boomerang' ? 13 : 0, impactEffect, effectScale, hitEnemies: [],
  });
}

function fireSkill(skill: SkillDefinition, skillLevel: number): void {
  if (!run) return;
  run.playerAttackTime = 0.42;
  const multiplier = skill.upgrades[Math.min(skillLevel - 1, skill.upgrades.length - 1)] ?? 1;
  const damage = skill.damage * multiplier * run.damageMultiplier;
  const effectScale = skill.effectScale ?? 1;
  if (skill.pattern === 'nearest') {
    const target = nearestEnemy();
    const baseAngle = target ? Math.atan2(target.position.y - run.player.y, target.position.x - run.player.x) : 0;
    spawnEffect(skill.castEffect, run.player, effectScale * 0.55, baseAngle, 1.35);
    for (let index = 0; index < skill.count + Math.floor((skillLevel - 1) / 2); index += 1) {
      const spread = (index - (skill.count - 1) * 0.5) * 0.13;
      spawnProjectile(baseAngle + spread, damage, skill.projectileSpeed, skill.range, projectileSprite(skill.pattern), skill.color, skillLevel >= 5 ? 1 : 0, false, 'linear', skill.impactEffect ?? '', effectScale);
    }
  } else if (skill.pattern === 'radial') {
    spawnEffect(skill.castEffect, run.player, effectScale * (1 + skillLevel * 0.05), 0, 1.2);
    const count = skill.count + skillLevel - 1;
    for (let index = 0; index < count; index += 1) {
      spawnProjectile((index / count) * TAU + run.elapsed * 0.2, damage, skill.projectileSpeed, skill.range, projectileSprite(skill.pattern), skill.color, skillLevel >= 4 ? 1 : 0, false, 'linear', skill.impactEffect ?? '', effectScale);
    }
  } else if (skill.pattern === 'chain') {
    const targets = nearestEnemies(skill.count + skillLevel, skill.range + skillLevel * 0.4);
    targets.forEach((enemy, index) => {
      damageEnemy(enemy, damage * Math.max(0.55, 1 - index * 0.08));
      spawnEffect(index === 0 ? skill.castEffect : skill.impactEffect, enemy.position, effectScale * (1 - index * 0.04), index * 0.4, 1.25);
    });
  } else if (skill.pattern === 'meteor') {
    const targets = nearestEnemies(skill.count + Math.floor(skillLevel / 2), skill.range);
    for (const enemy of targets) {
      const radius = 0.8 + skillLevel * 0.08;
      for (const candidate of run.enemies) {
        if (distanceSquared(candidate.position, enemy.position) <= radius * radius) damageEnemy(candidate, damage);
      }
      spawnEffect(skill.castEffect, enemy.position, effectScale * (1 + skillLevel * 0.04), random() * TAU, 1.15);
    }
  } else if (skill.pattern === 'boomerang') {
    const target = nearestEnemy();
    const baseAngle = target ? Math.atan2(target.position.y - run.player.y, target.position.x - run.player.x) : run.elapsed;
    const count = skill.count + Math.floor((skillLevel - 1) / 2);
    spawnEffect(skill.castEffect, run.player, effectScale * 0.7, baseAngle, 1.2);
    for (let index = 0; index < count; index += 1) {
      const spread = (index - (count - 1) * 0.5) * 0.42;
      spawnProjectile(baseAngle + spread, damage, skill.projectileSpeed, skill.range, projectileSprite(skill.pattern), skill.color, 99, false, 'boomerang', skill.impactEffect ?? '', effectScale);
    }
  } else if (skill.pattern === 'orbit') {
    const count = skill.count + Math.floor((skillLevel - 1) / 2);
    spawnEffect(skill.castEffect, run.player, effectScale, 0, 1.1);
    for (let index = 0; index < count; index += 1) {
      spawnProjectile(0, damage, Math.max(0.8, skill.projectileSpeed), skill.range, `${ART}/skills-v2-atlas.png#moon_boomerang`, skill.color, 99, false, 'orbit', skill.impactEffect ?? '', effectScale, index, count);
    }
  } else {
    const radius = skill.range + skillLevel * 0.16;
    for (const enemy of run.enemies) {
      if (distanceSquared(enemy.position, run.player) <= radius * radius) {
        damageEnemy(enemy, damage);
        if (skill.pattern === 'pulse') enemy.slowTime = Math.max(enemy.slowTime, 1.4 + skillLevel * 0.12);
      }
    }
    spawnEffect(skill.castEffect, run.player, effectScale * (1 + skillLevel * 0.08), run.elapsed * 0.2, skill.pattern === 'pulse' ? 1.45 : 0.9);
  }
}

function updateSkills(dt: number): void {
  if (!run) return;
  for (const id of Object.keys(run.skills)) {
    const skill = skills.find((candidate) => candidate.id === id);
    if (!skill) continue;
    const remaining = (run.skillTimers[id] ?? 0) - dt;
    if (remaining > 0) {
      run.skillTimers[id] = remaining;
      continue;
    }
    fireSkill(skill, run.skills[id]);
    run.skillTimers[id] = skill.cooldown * run.cooldownMultiplier * Math.max(0.55, 1 - (run.skills[id] - 1) * 0.035);
  }
}

function updateWaves(): void {
  if (!run) return;
  run.level.waves.forEach((wave, index) => {
    if (run!.elapsed < wave.start || run!.elapsed > wave.start + wave.duration) return;
    const progress = Math.min(1, (run!.elapsed - wave.start) / wave.duration);
    const target = Math.floor(progress * wave.count);
    let allowance = 12;
    while (run!.spawnedByWave[index] < target && allowance > 0 && run!.enemies.length < ENEMY_LIMIT) {
      spawnEnemy(wave.enemy, wave.hp, wave.speed, wave.damage);
      run!.spawnedByWave[index] += 1;
      allowance -= 1;
    }
  });
  if (!run.bossSpawned && run.elapsed >= run.level.boss.spawnAt) {
    const boss = run.level.boss;
    spawnEnemy(boss.enemy, boss.hp, boss.speed, boss.damage, true);
    run.bossSpawned = true;
    run.toast = '虚空守卫正在逼近！';
    run.toastTime = 4;
  }
}

function updatePlayer(dt: number): void {
  if (!run) return;
  let x = (engine.isKeyHeld('D') ? 1 : 0) - (engine.isKeyHeld('A') ? 1 : 0);
  let y = (engine.isKeyHeld('W') ? 1 : 0) - (engine.isKeyHeld('S') ? 1 : 0);
  const length = Math.hypot(x, y);
  if (length > 0) {
    x /= length;
    y /= length;
    run.player.x = Math.max(-7.5, Math.min(7.5, run.player.x + x * run.moveSpeed * dt));
    run.player.y = Math.max(-4.05, Math.min(4.05, run.player.y + y * run.moveSpeed * dt));
  }
  const id = entityId('Player');
  run.playerAttackTime = Math.max(0, run.playerAttackTime - dt);
  const animation = run.playerAttackTime > 0 ? 'attack' : length > 0 ? 'run' : 'idle';
  const facingLeft = x < 0 ? true : x > 0 ? false : run.playerFacingLeft;
  if (id) {
    engine.setComponent(id, 'Transform', transform(run.player, 1 + Math.sin(run.elapsed * 7) * 0.018, x < 0 ? 0.03 : -0.03));
    if (animation !== run.playerAnimation || facingLeft !== run.playerFacingLeft) {
      const frames = animation === 'attack'
        ? [`${ART}/eclipse-warden-aligned.png#attack_0`, `${ART}/eclipse-warden-aligned.png#attack_1`]
        : animation === 'run'
          ? [`${ART}/eclipse-warden-aligned.png#run_0`, `${ART}/eclipse-warden-aligned.png#run_1`]
          : [`${ART}/eclipse-warden-aligned.png#idle_0`, `${ART}/eclipse-warden-aligned.png#idle_1`];
      engine.setComponent(id, 'AnimatedSprite2D', {
        frames, fps: animation === 'attack' ? 9 : animation === 'run' ? 7 : 2.5,
        playing: true, looped: true, frame: 0, color: [1, 1, 1, 1], size: [1.26, 1.26],
        pivot: [0.5, 0.47], flip_x: facingLeft, flip_y: false, sorting_layer: 'default', sorting_order: 50,
      });
      run.playerAnimation = animation;
      run.playerFacingLeft = facingLeft;
    }
  }
}

function updateEnemies(dt: number): void {
  if (!run) return;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    const dx = run.player.x - enemy.position.x;
    const dy = run.player.y - enemy.position.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const sway = enemy.boss ? Math.sin(run.elapsed * 1.7) * 0.12 : 0;
    enemy.slowTime = Math.max(0, enemy.slowTime - dt);
    const slow = enemy.slowTime > 0 ? 0.56 : 1;
    const kindSway = enemy.kind === 'shadow_bat' ? Math.sin(run.elapsed * 6 + enemy.phase) * 0.24
      : enemy.kind === 'rift_hound' ? Math.sin(run.elapsed * 3 + enemy.phase) * 0.08 : sway;
    enemy.position.x += ((dx / length) - (dy / length) * kindSway) * enemy.speed * slow * dt;
    enemy.position.y += ((dy / length) + (dx / length) * kindSway) * enemy.speed * slow * dt;
    enemy.hitCooldown -= dt;
    if (length < enemy.radius + 0.42 && enemy.hitCooldown <= 0) {
      run.health -= enemy.damage;
      enemy.hitCooldown = enemy.boss ? 0.75 : 1.05;
      run.toast = `受到 ${Math.round(enemy.damage)} 点伤害`;
      run.toastTime = 0.8;
    }
    if (run.syncVisuals && enemy.id) engine.setComponent(enemy.id, 'Transform', transform(enemy.position, 1 + Math.sin(run.elapsed * 8 + enemy.phase) * 0.025, Math.atan2(dy, dx) * 0.04));
  }
  run.enemies = run.enemies.filter((enemy) => enemy.hp > 0);
}

function updateProjectiles(dt: number): void {
  if (!run) return;
  const survivors: ProjectileState[] = [];
  for (const projectile of run.projectiles) {
    projectile.life -= dt;
    if (projectile.motion === 'boomerang') {
      const progress = 1 - projectile.life / projectile.duration;
      const direction = progress < 0.5 ? 1 : -1;
      projectile.velocity.x = direction > 0
        ? projectile.velocity.x
        : (run.player.x - projectile.position.x) / Math.max(0.05, projectile.life);
      projectile.velocity.y = direction > 0
        ? projectile.velocity.y
        : (run.player.y - projectile.position.y) / Math.max(0.05, projectile.life);
      projectile.position.x += projectile.velocity.x * dt;
      projectile.position.y += projectile.velocity.y * dt;
      if (progress >= 0.5) projectile.hitEnemies = [];
    } else if (projectile.motion === 'orbit') {
      const orbitAngle = run.elapsed * 4.2 + (projectile.orbitIndex / projectile.orbitCount) * TAU;
      const previous = { ...projectile.position };
      projectile.position.x = run.player.x + Math.cos(orbitAngle) * projectile.orbitRadius;
      projectile.position.y = run.player.y + Math.sin(orbitAngle) * projectile.orbitRadius * 0.62;
      projectile.velocity.x = (projectile.position.x - previous.x) / Math.max(dt, 0.001);
      projectile.velocity.y = (projectile.position.y - previous.y) / Math.max(dt, 0.001);
    } else {
      projectile.position.x += projectile.velocity.x * dt;
      projectile.position.y += projectile.velocity.y * dt;
    }
    let destroyed = projectile.life <= 0;
    if (!destroyed && !projectile.visualOnly) {
      for (const enemy of run.enemies) {
        if (enemy.hp <= 0) continue;
        if (projectile.hitEnemies.includes(enemy.name)) continue;
        const radius = enemy.radius + projectile.radius;
        if (distanceSquared(projectile.position, enemy.position) > radius * radius) continue;
        damageEnemy(enemy, projectile.damage);
        projectile.hitEnemies.push(enemy.name);
        spawnEffect(projectile.impactEffect, enemy.position, projectile.effectScale * 0.38, Math.atan2(projectile.velocity.y, projectile.velocity.x), 1.35);
        projectile.pierce -= 1;
        if (projectile.pierce < 0) {
          destroyed = true;
          break;
        }
      }
    }
    if (destroyed) {
      if (projectile.id) engine.destroyEntity(projectile.id);
    } else {
      if (run.syncVisuals && projectile.id) {
        const velocityAngle = Math.atan2(projectile.velocity.y, projectile.velocity.x);
        const rotation = projectile.motion === 'boomerang'
          ? run.elapsed * projectile.spin
          : projectile.motion === 'orbit'
            ? velocityAngle + Math.PI * 0.5
            : velocityAngle;
        engine.setComponent(projectile.id, 'Transform', transform(projectile.position, 1, rotation));
      }
      survivors.push(projectile);
    }
  }
  run.projectiles = survivors;
}

function updateGems(dt: number): void {
  if (!run) return;
  const survivors: GemState[] = [];
  for (const gem of run.gems) {
    gem.life -= dt;
    const distance = Math.sqrt(distanceSquared(gem.position, run.player));
    if (distance < balance.player.pickupRadius + 1.4) {
      const speed = distance < 0.15 ? 0 : 8.5 + (balance.player.pickupRadius + 1.4 - distance) * 4;
      gem.position.x += ((run.player.x - gem.position.x) / Math.max(0.01, distance)) * speed * dt;
      gem.position.y += ((run.player.y - gem.position.y) / Math.max(0.01, distance)) * speed * dt;
    }
    if (distance < 0.35) {
      run.xp += gem.value;
      if (gem.id) engine.destroyEntity(gem.id);
      continue;
    }
    if (gem.life <= 0) {
      if (gem.id) engine.destroyEntity(gem.id);
      continue;
    }
    if (run.syncVisuals && gem.id) engine.setComponent(gem.id, 'Transform', transform(gem.position, 1 + Math.sin(run.elapsed * 5 + gem.value) * 0.08));
    survivors.push(gem);
  }
  run.gems = survivors;
}

function buildSkillChoices(): string[] {
  if (!run) return [];
  const pool = skills.filter((skill) => (run!.skills[skill.id] ?? 0) < skill.maxLevel);
  const result: string[] = [];
  while (pool.length > 0 && result.length < 3) {
    const index = Math.floor(random() * pool.length);
    result.push(pool.splice(index, 1)[0].id);
  }
  return result;
}

function openSkillChoice(): void {
  if (!run) return;
  run.choices = buildSkillChoices();
  if (run.choices.length === 0) {
    run.pendingLevels = 0;
    run.toast = '所有技能均已满级！';
    run.toastTime = 2.5;
    return;
  }
  run.choosingSkill = true;
  setNamed('Skill Choice Overlay', 'RectTransform', rectTransform({ x: 0, y: 0 }, { x: 1140, y: 620 }));
  setText('Choice Title', `等级提升 · Lv.${run.playerLevel}`, 31, '#bff7ff');
  setText('Choice Subtitle', '从三项能力中选择一项，战斗将暂停', 15, '#93a9c7');
  const buttonNames = ['Choice Button 1', 'Choice Button 2', 'Choice Button 3'];
  const iconNames = ['Choice Icon 1', 'Choice Icon 2', 'Choice Icon 3'];
  for (let index = 0; index < 3; index += 1) {
    const definition = skills.find((skill) => skill.id === run!.choices[index]);
    if (!definition) {
      setButton(buttonNames[index], '暂无可选技能', `choose-skill:${index}`);
      continue;
    }
    const current = run.skills[definition.id] ?? 0;
    setButton(buttonNames[index], `${current > 0 ? '升级' : '新技能'} · ${definition.name}\nLv.${current} → Lv.${current + 1}\n${definition.description}`, `choose-skill:${index}`, false, 15);
    setNamed(iconNames[index], 'Image', { sprite: definition.icon, color: [1, 1, 1, 1], image_type: 'Simple', preserve_aspect: true, raycast_target: false });
  }
}

function chooseSkill(index: number): void {
  if (!run || !run.choosingSkill) return;
  const id = run.choices[index];
  const definition = skills.find((skill) => skill.id === id);
  if (!definition) return;
  const current = run.skills[id] ?? 0;
  run.skills[id] = Math.min(definition.maxLevel, current + 1);
  run.skillTimers[id] = 0;
  run.pendingLevels = Math.max(0, run.pendingLevels - 1);
  run.choosingSkill = false;
  run.toast = `${current === 0 ? '获得' : '升级'} ${definition.name} · Lv.${run.skills[id]}`;
  run.toastTime = 2.4;
  setNamed('Skill Choice Overlay', 'RectTransform', rectTransform({ x: 0, y: -1600 }, { x: 1140, y: 620 }));
  if (run.pendingLevels > 0) openSkillChoice();
}

function updateProgression(): void {
  if (!run) return;
  while (run.xp >= run.xpNext) {
    run.xp -= run.xpNext;
    run.playerLevel += 1;
    run.xpNext = Math.ceil(balance.progression.experienceBase * Math.pow(balance.progression.experienceGrowth, run.playerLevel - 1));
    run.pendingLevels += 1;
    run.health = Math.min(run.maxHealth, run.health + run.maxHealth * 0.14);
  }
  if (run.pendingLevels > 0 && !run.choosingSkill) openSkillChoice();
}

function updateHud(force = false): void {
  if (!run) return;
  if (!force && run.hudTimer > 0) return;
  run.hudTimer = 0.2;
  const remaining = Math.max(0, run.level.duration - run.elapsed);
  setText('HUD Timer', formatTime(remaining), 32, remaining < 20 ? '#ff7b9c' : '#f2f7ff');
  setText('HUD Stats', `等级 ${run.playerLevel}  ·  击败 ${run.kills}  ·  敌人 ${run.enemies.length}  ·  ${Math.round(run.fps)} 帧`, 14, '#76e7ff', 'Right');
  setText('HUD Skills', Object.keys(run.skills).map((id) => {
    const skill = skills.find((candidate) => candidate.id === id);
    return `${skill?.name ?? id} Lv.${run!.skills[id]}`;
  }).join('  ◆  '), 15, '#d3c8ff');
  setProgress('Health Bar', run.health, run.maxHealth, '#e8325a', true);
  setProgress('Experience Bar', run.xp, run.xpNext, '#36c9f4', false);
  setText('Run Toast', run.toastTime > 0 ? run.toast : '', 24, run.health < run.maxHealth * 0.25 ? '#ff7894' : '#71e9ff');
}

function finishRun(victory: boolean): void {
  if (!run || run.ended) return;
  run.ended = true;
  run.paused = true;
  run.victory = victory;
  const profile = saveData.profile;
  if (profile) {
    profile.totalKills += run.kills;
    profile.gold += Math.floor(run.gold) + (victory ? 35 : 0);
    profile.bestTime = Math.max(profile.bestTime, run.elapsed);
    if (victory && !profile.completedLevels.includes(run.level.id)) profile.completedLevels.push(run.level.id);
    persist();
  }
  showPauseOverlay(true);
  setText('Pause Title', victory ? '蚀月已被征服' : '守望者陨落', 34, victory ? '#7ff4ff' : '#ff789b');
  setText('Pause Summary', `${run.level.name}\n生存 ${formatTime(run.elapsed)}  ·  击败 ${run.kills}  ·  获得 ${Math.floor(run.gold)} 金币`, 16, '#c8d7f2');
  setButton('Resume Button', '返回圣所', 'return-lobby', true);
  setButton('Abandon Button', '再次挑战', 'retry-run');
}

function togglePause(paused: boolean): void {
  if (!run || run.ended || run.choosingSkill) return;
  run.paused = paused;
  showPauseOverlay(paused);
  if (paused) {
    setText('Pause Title', '战斗暂停', 34, '#e2d8ff');
    setText('Pause Summary', `${run.level.name}\n已生存 ${formatTime(run.elapsed)}  ·  击败 ${run.kills}`, 16, '#b9c9e5');
    setButton('Resume Button', '继续战斗', 'resume', true);
    setButton('Abandon Button', '放弃本局', 'abandon');
  }
}

function updateRun(dt: number): void {
  if (!run) return;
  if (engine.isKeyPressed('Escape')) togglePause(!run.paused);
  if (run.paused || run.choosingSkill) return;
  const step = Math.min(dt, 0.05);
  run.fps += ((1 / Math.max(0.001, dt)) - run.fps) * Math.min(1, dt * 4);
  run.visualAccumulator += step;
  run.syncVisuals = run.visualAccumulator >= 1 / 30;
  if (run.syncVisuals) run.visualAccumulator %= 1 / 30;
  run.elapsed += step;
  run.hudTimer -= step;
  run.toastTime -= step;
  resolveSpawnedIds();
  updatePlayer(step);
  updateWaves();
  updateSkills(step);
  updateEnemies(step);
  updateProjectiles(step);
  updateGems(step);
  cleanupEffects();
  updateProgression();
  updateHud();
  if (run.health <= 0) finishRun(false);
  const bossAlive = run.enemies.some((enemy) => enemy.boss && enemy.hp > 0);
  if (run.elapsed >= run.level.duration && run.bossSpawned && !bossAlive) finishRun(true);
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60).toString().padStart(2, '0');
  const rest = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${rest}`;
}

function enterProfile(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) {
    setText('Login Status', '守望者名字至少需要一个字符。', 14, '#ff789b');
    return;
  }
  if (!saveData.profile) saveData.profile = newProfile(trimmed);
  else saveData.profile.name = trimmed.slice(0, 18);
  persist();
  engine.loadScene('Lobby');
}

function onUiAction(event: EngineUiActionInfo): void {
  const callback = typeof event.callback === 'string' ? event.callback : '';
  if (callback === 'login' && typeof event.value === 'string') {
    enterProfile(event.value);
    return;
  }
  if (callback === 'continue') {
    if (!saveData.profile) saveData.profile = newProfile('游客守望者');
    persist();
    engine.loadScene('Lobby');
    return;
  }
  if (callback === 'reset-profile') {
    saveData = { version: 1, profile: null };
    engine.clearSave();
    refreshLogin();
    return;
  }
  if (callback === 'logout') {
    engine.loadScene('Login');
    return;
  }
  if (callback.startsWith('inventory:') && saveData.profile) {
    selectedEquipmentId = callback.slice('inventory:'.length);
    refreshLobby();
    return;
  }
  if (callback === 'equip-selected' && saveData.profile) {
    const item = balance.equipment.find((candidate) => candidate.id === selectedEquipmentId);
    if (!item) return;
    saveData.profile.equipped = [
      ...saveData.profile.equipped.filter((id) => balance.equipment.find((candidate) => candidate.id === id)?.slot !== item.slot),
      item.id,
    ];
    persist();
    refreshLobby(`${item.name} 已装备到${equipmentSlotName(item.slot)}栏。`);
    return;
  }
  if ((callback.startsWith('unequip:') || callback.startsWith('unequip-slot:')) && saveData.profile) {
    const directId = callback.startsWith('unequip:') ? callback.slice('unequip:'.length) : '';
    const slot = callback.startsWith('unequip-slot:') ? callback.slice('unequip-slot:'.length) as EquipmentSlot : null;
    const removed = balance.equipment.find((item) => directId ? item.id === directId : item.slot === slot && saveData.profile!.equipped.includes(item.id));
    if (!removed) return;
    saveData.profile.equipped = saveData.profile.equipped.filter((id) => id !== removed.id);
    persist();
    refreshLobby(`${removed.name} 已放回背包。`);
    return;
  }
  if (callback.startsWith('level:')) {
    selectedLevelId = callback.slice('level:'.length);
    refreshLobby();
    return;
  }
  if (callback === 'start-run') {
    beginRun();
    return;
  }
  if (callback.startsWith('choose-skill:')) {
    chooseSkill(Number(callback.slice('choose-skill:'.length)));
    return;
  }
  if (callback === 'pause') togglePause(true);
  else if (callback === 'resume') togglePause(false);
  else if (callback === 'abandon') finishRun(false);
  else if (callback === 'return-lobby') engine.loadScene('Lobby');
  else if (callback === 'retry-run') engine.reloadScene();
}

function onSceneLoaded(scene: EngineSceneInfo): void {
  currentScene = scene.name;
  sceneNeedsRefresh = true;
  run = null;
  if (currentScene === 'Login') engine.setClearColor(0.012, 0.016, 0.05, 1);
  else if (currentScene === 'Lobby') engine.setClearColor(0.016, 0.022, 0.06, 1);
  else engine.setClearColor(0.02, 0.022, 0.055, 1);
}

function onTick(dt: number, _frame: number): void {
  if (sceneNeedsRefresh && engine.entities.length > 0) {
    sceneNeedsRefresh = false;
    if (currentScene === 'Login') refreshLogin();
    else if (currentScene === 'Lobby') refreshLobby();
    else if (currentScene === 'Game') initializeRun();
  }
  if (currentScene === 'Game') updateRun(dt);
}
