import {
  createUiButtonComponents,
  createUiLayoutGroupComponents,
  createUiPanelComponents,
  createUiProgressBarComponents,
  createUiTextComponents,
  type UiLayoutDirection,
} from '../componentCatalog.ts';
import { defaultRectTransform } from './rectLayout.ts';

export const GAME_UI_TEMPLATE_KINDS = ['inventory', 'leaderboard', 'shop'] as const;
export type GameUiTemplateKind = typeof GAME_UI_TEMPLATE_KINDS[number];

type Color = [number, number, number, number];
type Vec2 = [number, number];

export interface GameUiTemplateNode {
  name: string;
  parent: number | null;
  components: Record<string, unknown>;
}

export interface GameUiTemplate {
  kind: GameUiTemplateKind;
  label: string;
  nodes: GameUiTemplateNode[];
}

const COLORS = {
  backdrop: [0.035, 0.045, 0.075, 0.98] as Color,
  surface: [0.075, 0.09, 0.14, 0.98] as Color,
  surfaceRaised: [0.11, 0.13, 0.2, 1] as Color,
  border: [0.25, 0.3, 0.42, 1] as Color,
  accent: [0.16, 0.52, 0.95, 1] as Color,
  accentWarm: [0.96, 0.63, 0.18, 1] as Color,
  success: [0.2, 0.72, 0.45, 1] as Color,
  text: [0.94, 0.96, 1, 1] as Color,
  textMuted: [0.62, 0.68, 0.78, 1] as Color,
};

function rect(
  anchorMin: Vec2,
  anchorMax: Vec2,
  anchoredPosition: Vec2 = [0, 0],
  sizeDelta: Vec2 = [0, 0],
) {
  return defaultRectTransform({
    anchor_min: anchorMin,
    anchor_max: anchorMax,
    anchored_position: anchoredPosition,
    size_delta: sizeDelta,
  });
}

function layoutElement(width: number, height: number, flexibleWidth = 0) {
  return {
    ignore_layout: false,
    min_width: -1,
    min_height: -1,
    preferred_width: width,
    preferred_height: height,
    flexible_width: flexibleWidth,
    flexible_height: 0,
  };
}

function panel(rt: unknown, color: Color = COLORS.surface) {
  const components = createUiPanelComponents();
  return {
    ...components,
    RectTransform: rt,
    Panel: {
      ...components.Panel,
      color,
      border_color: COLORS.border,
    },
  };
}

function text(
  value: string,
  rt: unknown,
  size = 18,
  color: Color = COLORS.text,
  alignment = 'Left',
) {
  const components = createUiTextComponents(value);
  return {
    ...components,
    RectTransform: rt,
    Text: {
      ...components.Text,
      font_size: size,
      color,
      alignment,
      vertical_align: 'Middle',
      raycast_target: false,
    },
  };
}

function button(
  label: string,
  color: Color = COLORS.surfaceRaised,
  preferred: Vec2 = [150, 44],
) {
  const components = createUiButtonComponents();
  return {
    ...components,
    RectTransform: defaultRectTransform({ size_delta: preferred }),
    LayoutElement: layoutElement(preferred[0], preferred[1], 1),
    Image: { ...components.Image, color },
    Button: { ...components.Button, label, font_size: 16, text_color: COLORS.text },
  };
}

function progress(value: number, rt: unknown, fill: Color = COLORS.accent) {
  const components = createUiProgressBarComponents();
  return {
    ...components,
    RectTransform: rt,
    ProgressBar: {
      ...components.ProgressBar,
      value,
      fill_color: fill,
      background_color: [0.025, 0.03, 0.055, 1],
    },
  };
}

function layout(
  rt: unknown,
  direction: UiLayoutDirection,
  options: {
    padding?: [number, number, number, number];
    spacing?: Vec2;
    cellSize?: Vec2;
    constraintCount?: number;
  } = {},
) {
  const components = createUiLayoutGroupComponents(direction);
  return {
    ...components,
    RectTransform: rt,
    Panel: { ...components.Panel, color: [0.045, 0.055, 0.09, 0.7], border_color: COLORS.border },
    LayoutGroup: {
      ...components.LayoutGroup,
      direction,
      padding: options.padding ?? [12, 12, 12, 12],
      spacing: options.spacing ?? [10, 10],
      cell_size: options.cellSize ?? [150, 44],
      child_force_expand: direction !== 'Grid',
      child_force_expand_width: direction !== 'Grid',
      child_force_expand_height: false,
      constraint: direction === 'Grid' ? 'FixedColumnCount' : 'Flexible',
      constraint_count: options.constraintCount ?? 1,
    },
  };
}

function createBuilder(kind: GameUiTemplateKind, label: string) {
  const nodes: GameUiTemplateNode[] = [];
  const add = (name: string, parent: number | null, components: Record<string, unknown>) => {
    nodes.push({ name, parent, components });
    return nodes.length - 1;
  };
  const root = add(label, null, panel(
    rect([0.04, 0.06], [0.96, 0.94]),
    COLORS.backdrop,
  ));
  return { kind, label, nodes, add, root };
}

function inventoryTemplate(): GameUiTemplate {
  const view = createBuilder('inventory', 'Inventory');
  view.add('Inventory Title', view.root, text(
    'INVENTORY  ·  42 / 80',
    rect([0.03, 0.88], [0.66, 0.98]),
    30,
  ));
  view.add('Currency', view.root, text(
    '12,480 Gold   ·   860 Crystals',
    rect([0.66, 0.9], [0.97, 0.98]),
    17,
    COLORS.accentWarm,
    'Right',
  ));

  const categories = view.add('Categories', view.root, layout(
    rect([0.03, 0.15], [0.18, 0.86]),
    'Vertical',
    { spacing: [8, 8] },
  ));
  ['All Items', 'Weapons', 'Armor', 'Consumables', 'Materials'].forEach((label, index) => {
    view.add(label, categories, button(label, index === 0 ? COLORS.accent : COLORS.surfaceRaised, [160, 46]));
  });

  const grid = view.add('Item Grid', view.root, layout(
    rect([0.2, 0.15], [0.71, 0.86]),
    'Grid',
    { padding: [16, 16, 16, 16], spacing: [12, 12], cellSize: [150, 112], constraintCount: 3 },
  ));
  [
    ['Crimson Blade', COLORS.accentWarm],
    ['Storm Bow', COLORS.accent],
    ['Guardian Plate', COLORS.success],
    ['Moonstone Ring', COLORS.accent],
    ['Greater Potion ×8', COLORS.surfaceRaised],
    ['Ancient Key ×2', COLORS.accentWarm],
    ['Silver Ore ×24', COLORS.surfaceRaised],
    ['Empty Slot', COLORS.surface],
    ['Empty Slot', COLORS.surface],
  ].forEach(([label, color]) => view.add(String(label), grid, button(String(label), color as Color, [150, 112])));

  const details = view.add('Item Details', view.root, panel(rect([0.73, 0.15], [0.97, 0.86])));
  view.add('Selected Item', details, text('CRIMSON BLADE', rect([0.08, 0.78], [0.92, 0.94]), 24, COLORS.accentWarm));
  view.add('Item Rarity', details, text('Legendary · Level 42', rect([0.08, 0.68], [0.92, 0.79]), 15, COLORS.textMuted));
  view.add('Item Stats', details, text(
    'Attack          286\nCritical        +18%\nFire damage     +72\n\nForged in the Ember Vault.',
    rect([0.08, 0.31], [0.92, 0.67]),
    17,
  ));
  view.add('Durability', details, progress(0.78, rect([0.08, 0.2], [0.92, 0.28]), COLORS.success));
  view.add('Equip', details, {
    ...button('EQUIP', COLORS.accent, [220, 46]),
    RectTransform: rect([0.08, 0.07], [0.92, 0.17]),
  });

  const actions = view.add('Inventory Actions', view.root, layout(
    rect([0.2, 0.04], [0.97, 0.12]),
    'Horizontal',
    { padding: [8, 8, 8, 8], spacing: [10, 10] },
  ));
  ['Sort', 'Compare', 'Dismantle', 'Close'].forEach((label) => view.add(label, actions, button(label)));
  return { kind: view.kind, label: view.label, nodes: view.nodes };
}

function leaderboardTemplate(): GameUiTemplate {
  const view = createBuilder('leaderboard', 'Leaderboard');
  view.add('Leaderboard Title', view.root, text('SEASON RANKINGS', rect([0.03, 0.88], [0.56, 0.98]), 30));
  view.add('Season Timer', view.root, text(
    'Season ends in 4d 08h',
    rect([0.62, 0.9], [0.97, 0.98]),
    17,
    COLORS.accentWarm,
    'Right',
  ));

  const tabs = view.add('Ranking Tabs', view.root, layout(
    rect([0.03, 0.78], [0.7, 0.87]),
    'Horizontal',
    { padding: [8, 8, 8, 8], spacing: [8, 8] },
  ));
  ['Global', 'Friends', 'Guild', 'Weekly'].forEach((label, index) => {
    view.add(label, tabs, button(label, index === 0 ? COLORS.accent : COLORS.surfaceRaised));
  });

  const ranking = view.add('Ranking Rows', view.root, layout(
    rect([0.03, 0.14], [0.7, 0.76]),
    'Vertical',
    { padding: [12, 12, 12, 12], spacing: [7, 7] },
  ));
  [
    ['01   AstraNova                     12,840', COLORS.accentWarm],
    ['02   IronVale                     12,210', [0.55, 0.62, 0.74, 1] as Color],
    ['03   EmberFox                     11,970', [0.65, 0.38, 0.2, 1] as Color],
    ['04   NightHarbor                  11,460', COLORS.surfaceRaised],
    ['05   RuneWalker                   10,920', COLORS.surfaceRaised],
    ['06   MistArrow                    10,540', COLORS.surfaceRaised],
    ['07   CrystalByte                  10,180', COLORS.surfaceRaised],
  ].forEach(([label, color]) => view.add(String(label), ranking, button(String(label), color as Color, [620, 48])));

  const rewards = view.add('Season Rewards', view.root, panel(rect([0.73, 0.32], [0.97, 0.86])));
  view.add('Rewards Title', rewards, text('SEASON REWARDS', rect([0.08, 0.78], [0.92, 0.94]), 22));
  view.add('Reward Details', rewards, text(
    'Top 1%\nCelestial Banner\n2,000 Crystals\n\nTop 10%\n750 Crystals\nElite Title',
    rect([0.08, 0.24], [0.92, 0.76]),
    17,
  ));
  view.add('Reward Progress', rewards, progress(0.64, rect([0.08, 0.1], [0.92, 0.2]), COLORS.accentWarm));

  const personal = view.add('Your Rank', view.root, panel(rect([0.73, 0.14], [0.97, 0.29]), COLORS.surfaceRaised));
  view.add('Your Rank Text', personal, text('#128   YOU', rect([0.08, 0.48], [0.92, 0.9]), 22, COLORS.accent));
  view.add('Your Score', personal, text('7,420 pts  ·  Top 18%', rect([0.08, 0.1], [0.92, 0.48]), 16, COLORS.textMuted));
  view.add('Close', view.root, {
    ...button('CLOSE', COLORS.surfaceRaised, [180, 44]),
    RectTransform: rect([0.8, 0.04], [0.97, 0.11]),
  });
  return { kind: view.kind, label: view.label, nodes: view.nodes };
}

function shopTemplate(): GameUiTemplate {
  const view = createBuilder('shop', 'Shop');
  view.add('Shop Title', view.root, text('NIGHT MARKET', rect([0.03, 0.88], [0.52, 0.98]), 30));
  view.add('Wallet', view.root, text(
    '12,480 Gold   ·   860 Crystals',
    rect([0.6, 0.9], [0.97, 0.98]),
    17,
    COLORS.accentWarm,
    'Right',
  ));

  const tabs = view.add('Shop Categories', view.root, layout(
    rect([0.03, 0.78], [0.7, 0.87]),
    'Horizontal',
    { padding: [8, 8, 8, 8], spacing: [8, 8] },
  ));
  ['Featured', 'Bundles', 'Gear', 'Currency'].forEach((label, index) => {
    view.add(label, tabs, button(label, index === 0 ? COLORS.accent : COLORS.surfaceRaised));
  });

  const offers = view.add('Offer Grid', view.root, layout(
    rect([0.03, 0.12], [0.7, 0.76]),
    'Grid',
    { padding: [16, 16, 16, 16], spacing: [14, 14], cellSize: [220, 150], constraintCount: 3 },
  ));
  [
    ['STARTER BUNDLE\n-40%  ·  4.99', COLORS.accentWarm],
    ['MOONLIT ARMOR\n1,200 Crystals', COLORS.accent],
    ['EMBER MOUNT\n2,400 Crystals', [0.66, 0.25, 0.16, 1] as Color],
    ['DAILY CHEST\nFree', COLORS.success],
    ['500 CRYSTALS\n3.99', COLORS.surfaceRaised],
    ['2,800 CRYSTALS\n19.99', COLORS.surfaceRaised],
  ].forEach(([label, color]) => view.add(String(label), offers, button(String(label), color as Color, [220, 150])));

  const cart = view.add('Purchase Summary', view.root, panel(rect([0.73, 0.12], [0.97, 0.86])));
  view.add('Summary Title', cart, text('PURCHASE SUMMARY', rect([0.08, 0.82], [0.92, 0.94]), 22));
  view.add('Selected Offer', cart, text(
    'Starter Bundle\n\n500 Crystals\nRare Weapon Chest\n7-Day XP Boost',
    rect([0.08, 0.43], [0.92, 0.79]),
    17,
  ));
  const quantity = view.add('Quantity', cart, layout(
    rect([0.08, 0.3], [0.92, 0.4]),
    'Horizontal',
    { padding: [5, 5, 5, 5], spacing: [6, 6] },
  ));
  ['−', '1', '+'].forEach((label) => view.add(label, quantity, button(label, COLORS.surfaceRaised, [60, 40])));
  view.add('Total', cart, text('TOTAL                       4.99', rect([0.08, 0.2], [0.92, 0.29]), 18, COLORS.accentWarm));
  view.add('Purchase', cart, {
    ...button('PURCHASE', COLORS.accent, [240, 48]),
    RectTransform: rect([0.08, 0.08], [0.92, 0.17]),
  });
  view.add('Refresh Timer', view.root, text(
    'Offers refresh in 06:42:18',
    rect([0.03, 0.04], [0.7, 0.1]),
    15,
    COLORS.textMuted,
  ));
  return { kind: view.kind, label: view.label, nodes: view.nodes };
}

export function createGameUiTemplate(kind: GameUiTemplateKind): GameUiTemplate {
  switch (kind) {
    case 'inventory': return inventoryTemplate();
    case 'leaderboard': return leaderboardTemplate();
    case 'shop': return shopTemplate();
  }
}
