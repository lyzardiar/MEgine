// Author: MiYu

export type GameplayDataKind = 'skill-library' | 'level-library' | 'game-balance';
export type SkillPattern = 'nearest' | 'radial' | 'orbit' | 'aura';

export type SkillDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  pattern: SkillPattern;
  damage: number;
  cooldown: number;
  projectileSpeed: number;
  range: number;
  count: number;
  maxLevel: number;
  color: string;
  upgrades: number[];
};

export type SkillLibraryAsset = {
  version: 1;
  kind: 'skill-library';
  skills: SkillDefinition[];
};

export type LevelWave = {
  start: number;
  duration: number;
  enemy: string;
  count: number;
  hp: number;
  speed: number;
  damage: number;
};

export type LevelBoss = {
  enemy: string;
  spawnAt: number;
  hp: number;
  speed: number;
  damage: number;
};

export type LevelDefinition = {
  id: string;
  name: string;
  description: string;
  duration: number;
  background: string;
  accent: string;
  recommendedPower: number;
  waves: LevelWave[];
  boss: LevelBoss;
};

export type LevelLibraryAsset = {
  version: 1;
  kind: 'level-library';
  levels: LevelDefinition[];
};

export type GameBalanceAsset = {
  version: 1;
  kind: 'game-balance';
  [key: string]: unknown;
};

export type GameplayDataAsset = SkillLibraryAsset | LevelLibraryAsset | GameBalanceAsset;

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function finite(value: unknown, fallback: number, minimum = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.max(minimum, number) : fallback;
}

function integer(value: unknown, fallback: number, minimum = 0): number {
  return Math.round(finite(value, fallback, minimum));
}

function defaultSkill(index: number): SkillDefinition {
  return {
    id: `skill_${index + 1}`,
    name: `New Skill ${index + 1}`,
    description: 'Describe how this skill changes the run.',
    icon: '',
    pattern: 'nearest',
    damage: 12,
    cooldown: 1,
    projectileSpeed: 8,
    range: 8,
    count: 1,
    maxLevel: 5,
    color: '#7ee7ff',
    upgrades: [1, 1.25, 1.55, 1.9, 2.3],
  };
}

function normalizeSkill(value: unknown, index: number): SkillDefinition {
  const source = record(value, `skills[${index}]`);
  const pattern = text(source.pattern, 'nearest');
  return {
    ...defaultSkill(index),
    id: text(source.id, `skill_${index + 1}`).trim(),
    name: text(source.name, `Skill ${index + 1}`).trim(),
    description: text(source.description),
    icon: text(source.icon),
    pattern: ['nearest', 'radial', 'orbit', 'aura'].includes(pattern)
      ? pattern as SkillPattern
      : 'nearest',
    damage: finite(source.damage, 12),
    cooldown: finite(source.cooldown, 1, 0.05),
    projectileSpeed: finite(source.projectileSpeed, 8),
    range: finite(source.range, 8, 0.1),
    count: integer(source.count, 1, 1),
    maxLevel: integer(source.maxLevel, 5, 1),
    color: text(source.color, '#7ee7ff'),
    upgrades: Array.isArray(source.upgrades)
      ? source.upgrades.map((entry) => finite(entry, 1, 0.01))
      : [1, 1.25, 1.55, 1.9, 2.3],
  };
}

function defaultWave(): LevelWave {
  return { start: 0, duration: 30, enemy: 'wisp', count: 20, hp: 20, speed: 1.8, damage: 8 };
}

function normalizeWave(value: unknown, index: number): LevelWave {
  const source = record(value, `waves[${index}]`);
  return {
    start: finite(source.start, index * 30),
    duration: finite(source.duration, 30, 1),
    enemy: text(source.enemy, 'wisp').trim(),
    count: integer(source.count, 20, 1),
    hp: finite(source.hp, 20, 1),
    speed: finite(source.speed, 1.8, 0.1),
    damage: finite(source.damage, 8),
  };
}

function defaultLevel(index: number): LevelDefinition {
  return {
    id: `level_${index + 1}`,
    name: `New Level ${index + 1}`,
    description: 'A new survival arena.',
    duration: 300,
    background: '',
    accent: '#a978ff',
    recommendedPower: 0,
    waves: [defaultWave()],
    boss: { enemy: 'void_guardian', spawnAt: 270, hp: 800, speed: 1.1, damage: 24 },
  };
}

function normalizeLevel(value: unknown, index: number): LevelDefinition {
  const source = record(value, `levels[${index}]`);
  const boss = source.boss == null ? {} : record(source.boss, `levels[${index}].boss`);
  return {
    ...defaultLevel(index),
    id: text(source.id, `level_${index + 1}`).trim(),
    name: text(source.name, `Level ${index + 1}`).trim(),
    description: text(source.description),
    duration: finite(source.duration, 300, 10),
    background: text(source.background),
    accent: text(source.accent, '#a978ff'),
    recommendedPower: integer(source.recommendedPower, 0),
    waves: Array.isArray(source.waves)
      ? source.waves.map(normalizeWave)
      : [defaultWave()],
    boss: {
      enemy: text(boss.enemy, 'void_guardian').trim(),
      spawnAt: finite(boss.spawnAt, 270),
      hp: finite(boss.hp, 800, 1),
      speed: finite(boss.speed, 1.1, 0.1),
      damage: finite(boss.damage, 24),
    },
  };
}

function assertUniqueIds(values: readonly { id: string }[], label: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (!/^[a-z][a-z0-9_]*$/i.test(value.id)) {
      throw new Error(`${label} id "${value.id}" must contain only letters, numbers, and underscores`);
    }
    if (ids.has(value.id.toLocaleLowerCase())) throw new Error(`duplicate ${label} id: ${value.id}`);
    ids.add(value.id.toLocaleLowerCase());
  }
}

export function parseGameplayDataAsset(source: string, path = ''): GameplayDataAsset {
  const root = record(JSON.parse(source), path || 'gameplay data');
  const inferred = path.toLocaleLowerCase().endsWith('.mskill')
    ? 'skill-library'
    : path.toLocaleLowerCase().endsWith('.mlevel')
      ? 'level-library'
      : text(root.kind, 'game-balance');
  if (inferred === 'skill-library') {
    const skills = (Array.isArray(root.skills) ? root.skills : []).map(normalizeSkill);
    assertUniqueIds(skills, 'skill');
    return { version: 1, kind: 'skill-library', skills };
  }
  if (inferred === 'level-library') {
    const levels = (Array.isArray(root.levels) ? root.levels : []).map(normalizeLevel);
    assertUniqueIds(levels, 'level');
    for (const level of levels) {
      if (level.waves.length === 0) throw new Error(`${level.name} must contain at least one wave`);
      if (level.boss.spawnAt > level.duration) throw new Error(`${level.name} boss spawns after the level ends`);
    }
    return { version: 1, kind: 'level-library', levels };
  }
  return { ...root, version: 1, kind: 'game-balance' };
}

export function serializeGameplayDataAsset(asset: GameplayDataAsset): string {
  return `${JSON.stringify(asset, null, 2)}\n`;
}

export function createSkillDefinition(index: number): SkillDefinition {
  return defaultSkill(index);
}

export function createLevelDefinition(index: number): LevelDefinition {
  return defaultLevel(index);
}

export function createLevelWave(): LevelWave {
  return defaultWave();
}
