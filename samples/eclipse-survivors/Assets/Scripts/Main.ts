/** Author: MiYu */
/** Eclipse Survivors: a complete data-driven survivor roguelite sample. */

type Vec2 = { x: number; y: number };
type SkillPattern = 'nearest' | 'radial' | 'orbit' | 'aura';
type SkillDefinition = {
  id: string; name: string; description: string; icon: string; pattern: SkillPattern;
  damage: number; cooldown: number; projectileSpeed: number; range: number; count: number;
  maxLevel: number; color: string; upgrades: number[];
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
  id: string; name: string; description: string; power: number;
  modifiers: { damage?: number; health?: number; speed?: number; cooldown?: number };
};
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
};
type ProjectileState = {
  name: string; id: string | null; position: Vec2; velocity: Vec2; damage: number;
  radius: number; life: number; pierce: number; visualOnly: boolean;
};
type GemState = { name: string; id: string | null; position: Vec2; value: number; life: number };
type RunState = {
  level: LevelDefinition; elapsed: number; paused: boolean; ended: boolean; victory: boolean;
  player: Vec2; health: number; maxHealth: number; moveSpeed: number; damageMultiplier: number;
  cooldownMultiplier: number; xp: number; xpNext: number; playerLevel: number; kills: number; gold: number;
  skills: Record<string, number>; skillTimers: Record<string, number>; spawnedByWave: number[];
  bossSpawned: boolean; enemies: EnemyState[]; projectiles: ProjectileState[]; gems: GemState[];
  hudTimer: number; toast: string; toastTime: number;
};

const ART = 'Assets/Art/Generated';
const SKILLS_PATH = 'Assets/Data/Skills.mskill';
const LEVELS_PATH = 'Assets/Data/Levels.mlevel';
const BALANCE_PATH = 'Assets/Data/Balance.mgame';
const TAU = Math.PI * 2;
const UI_SCALE = 2 / 3;
const ENEMY_LIMIT = 48;
const GENERATED_LIMIT = 96;

const skills = ((engine.data[SKILLS_PATH] as { skills?: SkillDefinition[] } | undefined)?.skills ?? []);
const levels = ((engine.data[LEVELS_PATH] as { levels?: LevelDefinition[] } | undefined)?.levels ?? []);
const balance = (engine.data[BALANCE_PATH] as BalanceDefinition | undefined) ?? {
  player: { baseHealth: 100, moveSpeed: 4.2, pickupRadius: 1.2 },
  progression: { experienceBase: 9, experienceGrowth: 1.34, goldPerKill: 0.12 },
  equipment: [],
};

let saveData = normalizeSave(engine.storage);
let selectedLevelId = levels[0]?.id ?? 'eclipse_garden';
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
    name: name.trim().slice(0, 18) || 'Guest Warden',
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
    text: value, color: color(tint), font_size: fontSize * UI_SCALE, font_style: 'Normal',
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
    label, text_color: [0.94, 0.98, 1, 1], font_size: fontSize * UI_SCALE, on_click: callback,
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
    text_color: [1, 1, 1, 1], show_label: showLabel, font_size: 13 * UI_SCALE,
  });
}

function showPauseOverlay(visible: boolean): void {
  setNamed('Pause Overlay', 'RectTransform', rectTransform({ x: 0, y: visible ? 0 : -1600 }, { x: 640, y: 420 }));
}

function equipmentPower(profile: Profile): number {
  return profile.equipped.reduce((sum, id) => sum + (balance.equipment.find((item) => item.id === id)?.power ?? 0), 0);
}

function refreshLogin(): void {
  const profile = saveData.profile;
  setText('Login Status', profile
    ? `Welcome back, ${profile.name}. ${Math.floor(profile.gold)} astral gold awaits.`
    : 'Create a local Warden profile to begin.', 14, profile ? '#71e8ff' : '#f1a9c4');
  setButton('Continue Button', profile ? `CONTINUE AS ${profile.name.toLocaleUpperCase()}` : 'CONTINUE AS GUEST', 'continue', Boolean(profile));
}

function refreshLobby(message = ''): void {
  const profile = saveData.profile;
  if (!profile) {
    engine.loadScene('Login');
    return;
  }
  const power = equipmentPower(profile);
  setText('Profile Summary', `${profile.name.toLocaleUpperCase()}   •   ${Math.floor(profile.gold)} GOLD   •   ${profile.totalKills} KILLS`, 15, '#7ce9ff', 'Right');
  setText('Warden Stats', `WARDEN ${profile.name.toLocaleUpperCase()}\nPOWER ${power}   •   BEST ${formatTime(profile.bestTime)}\n${profile.completedLevels.length}/3 EXPEDITIONS CLEARED`, 14, '#c4d9ff');
  for (const item of balance.equipment) {
    const active = profile.equipped.includes(item.id);
    const buttonName = item.id === 'moonstaff' ? 'Gear Moonstaff'
      : item.id === 'mantle' ? 'Gear Mantle' : item.id === 'boots' ? 'Gear Boots' : 'Gear Sunring';
    setButton(buttonName, `${active ? '◆ ' : ''}${item.name.toLocaleUpperCase()}\n${item.description}`, `equip:${item.id}`, active, 13);
  }
  for (const level of levels) {
    const active = level.id === selectedLevelId;
    const buttonName = level.id === 'eclipse_garden' ? 'Level Eclipse Garden'
      : level.id === 'astral_archive' ? 'Level Astral Archive' : 'Level Sunken Observatory';
    setButton(buttonName, `${active ? '◆ ' : ''}${level.name.toLocaleUpperCase()}   •   ${formatTime(level.duration)}`, `level:${level.id}`, active);
  }
  const selected = levels.find((level) => level.id === selectedLevelId) ?? levels[0];
  if (selected) {
    const locked = power < selected.recommendedPower;
    setText('Level Detail', `${selected.description}\n${selected.waves.length} WAVE GROUPS   •   BOSS AT ${formatTime(selected.boss.spawnAt)}\n${locked ? `REQUIRES POWER ${selected.recommendedPower} — EQUIP MORE GEAR` : `READY • RECOMMENDED POWER ${selected.recommendedPower}`}`, 15, locked ? '#ff8ba5' : selected.accent);
    setButton('Start Run Button', locked ? `POWER ${selected.recommendedPower} REQUIRED` : 'BEGIN EXPEDITION', 'start-run', !locked);
  }
  setText('Lobby Toast', message, 16, '#67e5ff');
}

function beginRun(): void {
  const profile = saveData.profile;
  const level = levels.find((candidate) => candidate.id === selectedLevelId) ?? levels[0];
  if (!profile || !level) return;
  const power = equipmentPower(profile);
  if (power < level.recommendedPower) {
    refreshLobby(`Equip more gear: ${level.name} requires power ${level.recommendedPower}.`);
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
    kills: 0, gold: 0, skills: { astral_bolt: 1 }, skillTimers: {},
    spawnedByWave: level.waves.map(() => 0), bossSpawned: false,
    enemies: [], projectiles: [], gems: [], hudTimer: 0, toast: 'THE ECLIPSE RISES', toastTime: 3.5,
  };
  showPauseOverlay(false);
  setText('HUD Stage', level.name.toLocaleUpperCase(), 22, level.accent, 'Left');
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

function enemySprite(kind: string): string {
  return `${ART}/enemies-atlas.png#${kind}`;
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
  const size = boss ? 1.7 : kind === 'wisp' ? 0.72 : kind === 'thorn_crawler' ? 0.9 : 1.0;
  engine.spawnEntity(name, {
    Transform: transform(position, 1),
    SpriteRenderer: {
      sprite: enemySprite(kind), color: [1, 1, 1, 1], size: [size, size], pivot: [0.5, 0.5],
      sorting_layer: 'default', sorting_order: boss ? 45 : 25,
    },
  });
  run.enemies.push({ name, id: null, kind, position, hp, maxHp: hp, speed, damage, radius: size * 0.38, boss, hitCooldown: 0 });
}

function spawnProjectile(angle: number, damage: number, speed: number, range: number, icon: string, tint: string, pierce = 0, visualOnly = false): void {
  if (!run || run.projectiles.length + run.gems.length >= GENERATED_LIMIT) return;
  const name = nextName('Projectile');
  const position = { ...run.player };
  const velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  engine.spawnEntity(name, {
    Transform: transform(position, 1, angle),
    SpriteRenderer: {
      sprite: icon, color: color(tint), size: [0.36, 0.36], pivot: [0.5, 0.5],
      sorting_layer: 'default', sorting_order: 60,
    },
  });
  run.projectiles.push({ name, id: null, position, velocity, damage, radius: 0.22, life: Math.max(0.16, range / Math.max(0.1, speed)), pierce, visualOnly });
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

function damageEnemy(enemy: EnemyState, damage: number): void {
  if (!run || enemy.hp <= 0) return;
  enemy.hp -= damage;
  if (enemy.hp > 0) return;
  if (enemy.id) engine.destroyEntity(enemy.id);
  run.kills += 1;
  run.gold += enemy.boss ? 25 : balance.progression.goldPerKill;
  spawnGem(enemy.position, enemy.boss ? 20 : 1);
  if (enemy.boss) {
    run.toast = 'VOID GUARDIAN DEFEATED';
    run.toastTime = 3;
  }
}

function fireSkill(skill: SkillDefinition, skillLevel: number): void {
  if (!run) return;
  const multiplier = skill.upgrades[Math.min(skillLevel - 1, skill.upgrades.length - 1)] ?? 1;
  const damage = skill.damage * multiplier * run.damageMultiplier;
  if (skill.pattern === 'nearest') {
    const target = nearestEnemy();
    const baseAngle = target ? Math.atan2(target.position.y - run.player.y, target.position.x - run.player.x) : 0;
    for (let index = 0; index < skill.count + Math.floor((skillLevel - 1) / 2); index += 1) {
      const spread = (index - (skill.count - 1) * 0.5) * 0.13;
      spawnProjectile(baseAngle + spread, damage, skill.projectileSpeed, skill.range, skill.icon, skill.color, skillLevel >= 5 ? 1 : 0);
    }
  } else if (skill.pattern === 'radial') {
    const count = skill.count + skillLevel - 1;
    for (let index = 0; index < count; index += 1) {
      spawnProjectile((index / count) * TAU + run.elapsed * 0.2, damage, skill.projectileSpeed, skill.range, skill.icon, skill.color, skillLevel >= 4 ? 1 : 0);
    }
  } else {
    const radius = skill.range + skillLevel * 0.16;
    for (const enemy of run.enemies) {
      if (distanceSquared(enemy.position, run.player) <= radius * radius) damageEnemy(enemy, damage);
    }
    const count = skill.pattern === 'orbit' ? skill.count : 1;
    for (let index = 0; index < count; index += 1) {
      const angle = run.elapsed * (skill.pattern === 'orbit' ? 4 : 0.4) + (index / count) * TAU;
      spawnProjectile(angle, 0, skill.pattern === 'orbit' ? 3.2 : 1.4, radius * 0.9, skill.icon, skill.color, 99, true);
    }
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
    let allowance = 4;
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
    run.toast = 'VOID GUARDIAN APPROACHES';
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
  if (id) engine.setComponent(id, 'Transform', transform(run.player, 1, x < 0 ? 0.03 : -0.03));
}

function updateEnemies(dt: number): void {
  if (!run) return;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0) continue;
    const dx = run.player.x - enemy.position.x;
    const dy = run.player.y - enemy.position.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const sway = enemy.boss ? Math.sin(run.elapsed * 1.7) * 0.12 : 0;
    enemy.position.x += ((dx / length) - (dy / length) * sway) * enemy.speed * dt;
    enemy.position.y += ((dy / length) + (dx / length) * sway) * enemy.speed * dt;
    enemy.hitCooldown -= dt;
    if (length < enemy.radius + 0.42 && enemy.hitCooldown <= 0) {
      run.health -= enemy.damage;
      enemy.hitCooldown = enemy.boss ? 0.75 : 1.05;
      run.toast = `-${Math.round(enemy.damage)} HEALTH`;
      run.toastTime = 0.8;
    }
    if (enemy.id) engine.setComponent(enemy.id, 'Transform', transform(enemy.position, 1, Math.atan2(dy, dx) * 0.04));
  }
  run.enemies = run.enemies.filter((enemy) => enemy.hp > 0);
}

function updateProjectiles(dt: number): void {
  if (!run) return;
  const survivors: ProjectileState[] = [];
  for (const projectile of run.projectiles) {
    projectile.life -= dt;
    projectile.position.x += projectile.velocity.x * dt;
    projectile.position.y += projectile.velocity.y * dt;
    let destroyed = projectile.life <= 0;
    if (!destroyed && !projectile.visualOnly) {
      for (const enemy of run.enemies) {
        if (enemy.hp <= 0) continue;
        const radius = enemy.radius + projectile.radius;
        if (distanceSquared(projectile.position, enemy.position) > radius * radius) continue;
        damageEnemy(enemy, projectile.damage);
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
      if (projectile.id) engine.setComponent(projectile.id, 'Transform', transform(projectile.position, 1, Math.atan2(projectile.velocity.y, projectile.velocity.x)));
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
    if (gem.id) engine.setComponent(gem.id, 'Transform', transform(gem.position, 1 + Math.sin(run.elapsed * 5 + gem.value) * 0.08));
    survivors.push(gem);
  }
  run.gems = survivors;
}

function updateProgression(): void {
  if (!run) return;
  while (run.xp >= run.xpNext) {
    run.xp -= run.xpNext;
    run.playerLevel += 1;
    run.xpNext = Math.ceil(balance.progression.experienceBase * Math.pow(balance.progression.experienceGrowth, run.playerLevel - 1));
    const unlock = run.playerLevel === 2 ? 'eclipse_nova'
      : run.playerLevel === 4 ? 'crescent_orbit'
        : run.playerLevel === 6 ? 'gravity_well' : null;
    if (unlock && !run.skills[unlock]) {
      run.skills[unlock] = 1;
      run.toast = `NEW SKILL • ${skills.find((skill) => skill.id === unlock)?.name.toLocaleUpperCase() ?? unlock}`;
    } else {
      const ids = Object.keys(run.skills);
      const upgrade = ids[(run.playerLevel - 1) % ids.length];
      const definition = skills.find((skill) => skill.id === upgrade);
      run.skills[upgrade] = Math.min(definition?.maxLevel ?? 6, run.skills[upgrade] + 1);
      run.toast = `${definition?.name.toLocaleUpperCase() ?? upgrade} • LEVEL ${run.skills[upgrade]}`;
    }
    run.health = Math.min(run.maxHealth, run.health + run.maxHealth * 0.14);
    run.toastTime = 2.8;
  }
}

function updateHud(force = false): void {
  if (!run) return;
  if (!force && run.hudTimer > 0) return;
  run.hudTimer = 0.2;
  const remaining = Math.max(0, run.level.duration - run.elapsed);
  setText('HUD Timer', formatTime(remaining), 32, remaining < 20 ? '#ff7b9c' : '#f2f7ff');
  setText('HUD Stats', `LV ${run.playerLevel}   •   ${run.kills} KILLS   •   ${Math.floor(run.gold)} GOLD`, 14, '#76e7ff', 'Right');
  setText('HUD Skills', Object.keys(run.skills).map((id) => {
    const skill = skills.find((candidate) => candidate.id === id);
    return `${skill?.name.toLocaleUpperCase() ?? id}  LV ${run!.skills[id]}`;
  }).join('   ◆   '), 15, '#d3c8ff');
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
  setText('Pause Title', victory ? 'ECLIPSE CONQUERED' : 'WARDEN FALLEN', 34, victory ? '#7ff4ff' : '#ff789b');
  setText('Pause Summary', `${run.level.name}\n${formatTime(run.elapsed)} SURVIVED   •   ${run.kills} KILLS   •   ${Math.floor(run.gold)} GOLD`, 16, '#c8d7f2');
  setButton('Resume Button', 'RETURN TO SANCTUM', 'return-lobby', true);
  setButton('Abandon Button', 'RETRY EXPEDITION', 'retry-run');
}

function togglePause(paused: boolean): void {
  if (!run || run.ended) return;
  run.paused = paused;
  showPauseOverlay(paused);
  if (paused) {
    setText('Pause Title', 'RUN PAUSED', 34, '#e2d8ff');
    setText('Pause Summary', `${run.level.name}\n${formatTime(run.elapsed)} SURVIVED   •   ${run.kills} KILLS`, 16, '#b9c9e5');
    setButton('Resume Button', 'RESUME', 'resume', true);
    setButton('Abandon Button', 'ABANDON RUN', 'abandon');
  }
}

function updateRun(dt: number): void {
  if (!run) return;
  if (engine.isKeyPressed('Escape')) togglePause(!run.paused);
  if (run.paused) return;
  const step = Math.min(dt, 0.05);
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
    setText('Login Status', 'Enter at least one character for your Warden name.', 14, '#ff789b');
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
    if (!saveData.profile) saveData.profile = newProfile('Guest Warden');
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
  if (callback.startsWith('equip:') && saveData.profile) {
    const id = callback.slice('equip:'.length);
    const equipped = saveData.profile.equipped;
    saveData.profile.equipped = equipped.includes(id) ? equipped.filter((entry) => entry !== id) : [...equipped, id];
    persist();
    refreshLobby(`${balance.equipment.find((item) => item.id === id)?.name ?? id} loadout updated.`);
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
