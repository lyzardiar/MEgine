import { useSyncExternalStore } from 'react';

export type EditorLocale = 'zh-CN' | 'en-US';

const LOCALE_STORAGE_KEY = 'mengine.editor.locale.v1';

const MESSAGES = {
  'zh-CN': {
    // Brand & Common
    'brand.name': 'MEngine Studio',
    'brand.tagline': '跨平台实时互动与游戏创作引擎',
    'common.cancel': '取消',
    'common.close': '关闭',
    'common.confirm': '确认',
    'common.search': '搜索',
    'common.browse': '浏览…',
    'common.open': '打开',
    'common.create': '创建',
    'common.remove': '移除',
    'common.pin': '置顶',
    'common.unpin': '取消置顶',
    'common.dark': '深色主题',
    'common.light': '浅色主题',
    'common.langToggle': 'EN',
    'common.loadingEditor': '正在初始化工程工作台…',
    'common.untitledScene': '未命名场景',

    // Project Hub
    'hub.nav.projects': '工程列表',
    'hub.nav.templates': '新建模板',
    'hub.nav.tools': 'AI 与文档',
    'hub.title.projects': '工程工作台',
    'hub.subtitle.projects': '打开最近工程、拖入工程目录，或从模板快速创建新项目。',
    'hub.title.create': '新建 MEngine 工程',
    'hub.subtitle.create': '选择起始模板并设置工程名称与本地目录。',
    'hub.action.openExisting': '打开本地工程',
    'hub.action.opening': '正在打开…',
    'hub.action.newProject': '新建工程',
    'hub.action.creating': '正在创建…',
    'hub.action.createAndOpen': '创建并打开',
    'hub.searchPlaceholder': '按名称或路径筛选最近工程…',
    'hub.sortRecent': '按最近打开',
    'hub.sortName': '按名称排序',
    'hub.recentCount': '共 {count}/{limit} 个最近工程',
    'hub.emptyTitle': '还没有打开过工程',
    'hub.emptyHint': '点击右上角“打开本地工程”或“新建工程”，也可以直接把工程目录拖入此窗口。',
    'hub.noMatch': '没有匹配“{query}”的工程。',
    'hub.form.template': '起始模板',
    'hub.form.name': '工程名称',
    'hub.form.location': '保存位置',
    'hub.form.locationPlaceholder': '输入或选择工程父目录',
    'hub.form.preview': '目标路径',
    'hub.validation.emptyName': '请输入工程名称。',
    'hub.validation.invalidName': '名称不能包含 \\ / : * ? " < > | 且不能以空格或句点结尾。',
    'hub.validation.emptyLocation': '请选择或输入保存目录。',
    'hub.template.standard3d.name': '3D 标准工程',
    'hub.template.standard3d.desc': '包含主相机、平行光与 PBR 渲染基础场景，适合 3D 玩法原型与场景搭建。',
    'hub.template.standard2d.name': '2D 精灵与瓦片',
    'hub.template.standard2d.desc': '面向正交相机、Sprite/Tilemap 与 2D 物理的工作区预设。',
    'hub.template.uiCanvas.name': 'UI 画板工程',
    'hub.template.uiCanvas.desc': '聚焦 Screen Space Canvas、多分辨率画板与交互控件布局。',
    'hub.time.justNow': '刚刚',
    'hub.time.minutesAgo': '{n} 分钟前',
    'hub.time.hoursAgo': '{n} 小时前',
    'hub.time.daysAgo': '{n} 天前',
    'hub.time.unknown': '未知时间',
    'hub.pinned': '已置顶',
    'hub.recent': '最近打开',
    'hub.tools.agentTitle': 'AI Agent 集成（MCP / CLI）',
    'hub.tools.agentDesc': '配置本地 MCP 服务、命令行驱动与自动化场景校验，支持无焦点后台工作流。',
    'hub.tools.docsTitle': '引擎文档与架构指南',
    'hub.tools.docsDesc': '查阅脚本 API、组件生命周期、Canvas 工作台与多平台发布规范。',
    'hub.tools.openDocs': '打开引擎文档',

    // Toolbar & Shell
    'toolbar.undo': '撤销 (Ctrl+Z)',
    'toolbar.redo': '重做 (Ctrl+Y)',
    'toolbar.save': '保存场景 (Ctrl+S)',
    'toolbar.commandPalette': '命令面板 (Ctrl+K)',
    'toolbar.commandPlaceholder': '搜索命令、面板、场景对象…',
    'toolbar.layout': '布局',
    'toolbar.layout.default': '默认布局',
    'toolbar.layout.tall': '宽屏纵列',
    'toolbar.layout.wide': '宽屏双栏',
    'toolbar.layout.focus': '视口专注',
    'toolbar.mode.edit': '编辑模式',
    'toolbar.mode.play': '运行中',
    'toolbar.mode.pause': '已暂停',
    'toolbar.pivot': '轴心',
    'toolbar.center': '中心',
    'toolbar.local': '局部',
    'toolbar.global': '世界',
    'toolbar.theme': '切换明暗主题',
    'toolbar.locale': '切换界面语言 (中/EN)',

    // Panels
    'panel.hierarchy': '层级',
    'panel.scene': '场景',
    'panel.game': '游戏',
    'panel.inspector': '属性',
    'panel.project': '资源',
    'panel.console': '控制台',
    'panel.profiler': '性能分析',
    'panel.timeline': '时间轴',
    'panel.animator': '动画状态机',
    'panel.material': '材质',
    'panel.shader': '着色器',
    'panel.spriteEditor': '精灵编辑',
    'panel.spriteAtlas': '图集',
    'panel.effekseer': '特效预览',
    'panel.build': '构建发布',
    'panel.projectSettings': '项目设置',

    // Status Bar
    'status.objects': '{count} 个对象',
    'status.selected': '已选 {count} 项',
    'status.noErrors': '无错误',
    'status.warnings': '{count} 警告',
    'status.errors': '{count} 错误',

    // Command Palette
    'palette.empty': '未找到匹配项',
    'palette.group.commands': '快捷命令',
    'palette.group.panels': '切换到面板',
    'palette.group.entities': '场景节点',
    'palette.cmd.save': '保存当前场景',
    'palette.cmd.saveAll': '保存全部更改',
    'palette.cmd.newScene': '新建空白场景',
    'palette.cmd.togglePlay': '开始 / 停止运行预览',
    'palette.cmd.toggleTheme': '切换深色 / 浅色主题',
    'palette.cmd.toggleLocale': '切换界面语言 (中文 / English)',
    'palette.cmd.resetLayout': '重置默认面板布局',
    'palette.cmd.createEmpty': '创建空节点 (Empty GameObject)',
    'palette.cmd.createCube': '创建立方体 (Cube)',
    'palette.cmd.createCamera': '创建相机 (Camera)',
    'palette.cmd.createLight': '创建平行光 (Directional Light)',
    'palette.hint': '↑↓ 选择 · Enter 执行 · Esc 关闭',
  },
  'en-US': {
    // Brand & Common
    'brand.name': 'MEngine Studio',
    'brand.tagline': 'Cross-platform real-time game & interactive engine',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.search': 'Search',
    'common.browse': 'Browse…',
    'common.open': 'Open',
    'common.create': 'Create',
    'common.remove': 'Remove',
    'common.pin': 'Pin',
    'common.unpin': 'Unpin',
    'common.dark': 'Dark Theme',
    'common.light': 'Light Theme',
    'common.langToggle': '中文',
    'common.loadingEditor': 'Initializing workspace…',
    'common.untitledScene': 'Untitled Scene',

    // Project Hub
    'hub.nav.projects': 'Projects',
    'hub.nav.templates': 'New Project',
    'hub.nav.tools': 'AI & Docs',
    'hub.title.projects': 'Projects',
    'hub.subtitle.projects': 'Open a recent project, drop a project folder here, or start from a template.',
    'hub.title.create': 'Create New Project',
    'hub.subtitle.create': 'Pick a starter template and choose a name and parent directory.',
    'hub.action.openExisting': 'Open Project',
    'hub.action.opening': 'Opening…',
    'hub.action.newProject': 'New Project',
    'hub.action.creating': 'Creating…',
    'hub.action.createAndOpen': 'Create & Open',
    'hub.searchPlaceholder': 'Filter projects by name or path…',
    'hub.sortRecent': 'Recent',
    'hub.sortName': 'Name',
    'hub.recentCount': '{count}/{limit} recent projects',
    'hub.emptyTitle': 'No recent projects yet',
    'hub.emptyHint': 'Click "Open Project" or "New Project", or drag a project folder into this window.',
    'hub.noMatch': 'No projects match "{query}".',
    'hub.form.template': 'Starter Template',
    'hub.form.name': 'Project Name',
    'hub.form.location': 'Location',
    'hub.form.locationPlaceholder': 'Paste or browse parent folder',
    'hub.form.preview': 'Target Path',
    'hub.validation.emptyName': 'Please enter a project name.',
    'hub.validation.invalidName': 'Cannot contain \\ / : * ? " < > | or end with a space or dot.',
    'hub.validation.emptyLocation': 'Please choose or enter a parent directory.',
    'hub.template.standard3d.name': '3D Standard',
    'hub.template.standard3d.desc': 'Main camera, directional light, and PBR-ready baseline scene for 3D games.',
    'hub.template.standard2d.name': '2D Sprite & Tilemap',
    'hub.template.standard2d.desc': 'Orthographic workflow tailored for sprites, tilemaps, and 2D physics.',
    'hub.template.uiCanvas.name': 'UI Canvas Studio',
    'hub.template.uiCanvas.desc': 'Focused on Screen Space Canvas, multi-artboard previews, and interactive UI.',
    'hub.time.justNow': 'Just now',
    'hub.time.minutesAgo': '{n}m ago',
    'hub.time.hoursAgo': '{n}h ago',
    'hub.time.daysAgo': '{n}d ago',
    'hub.time.unknown': 'Unknown time',
    'hub.pinned': 'Pinned',
    'hub.recent': 'Recent',
    'hub.tools.agentTitle': 'AI Agent Integration (MCP / CLI)',
    'hub.tools.agentDesc': 'Configure local MCP server, CLI automation, and headless background verification.',
    'hub.tools.docsTitle': 'Documentation & Guides',
    'hub.tools.docsDesc': 'Explore scripting APIs, ECS lifecycle, Canvas workspace, and multi-platform builds.',
    'hub.tools.openDocs': 'Open Documentation',

    // Toolbar & Shell
    'toolbar.undo': 'Undo (Ctrl+Z)',
    'toolbar.redo': 'Redo (Ctrl+Y)',
    'toolbar.save': 'Save Scene (Ctrl+S)',
    'toolbar.commandPalette': 'Command Palette (Ctrl+K)',
    'toolbar.commandPlaceholder': 'Search commands, panels, scene objects…',
    'toolbar.layout': 'Layout',
    'toolbar.layout.default': 'Default',
    'toolbar.layout.tall': 'Tall',
    'toolbar.layout.wide': 'Wide',
    'toolbar.layout.focus': 'Viewport Focus',
    'toolbar.mode.edit': 'Edit Mode',
    'toolbar.mode.play': 'Playing',
    'toolbar.mode.pause': 'Paused',
    'toolbar.pivot': 'Pivot',
    'toolbar.center': 'Center',
    'toolbar.local': 'Local',
    'toolbar.global': 'Global',
    'toolbar.theme': 'Toggle Dark/Light Theme',
    'toolbar.locale': 'Switch Language (中文/EN)',

    // Panels
    'panel.hierarchy': 'Hierarchy',
    'panel.scene': 'Scene',
    'panel.game': 'Game',
    'panel.inspector': 'Inspector',
    'panel.project': 'Project',
    'panel.console': 'Console',
    'panel.profiler': 'Profiler',
    'panel.timeline': 'Timeline',
    'panel.animator': 'Animator',
    'panel.material': 'Material',
    'panel.shader': 'Shader',
    'panel.spriteEditor': 'Sprite',
    'panel.spriteAtlas': 'Atlas',
    'panel.effekseer': 'Effekseer',
    'panel.build': 'Build',
    'panel.projectSettings': 'Settings',

    // Status Bar
    'status.objects': '{count} objects',
    'status.selected': '{count} selected',
    'status.noErrors': 'Clean',
    'status.warnings': '{count} warn',
    'status.errors': '{count} err',

    // Command Palette
    'palette.empty': 'No matching results',
    'palette.group.commands': 'Commands',
    'palette.group.panels': 'Panels',
    'palette.group.entities': 'Scene Objects',
    'palette.cmd.save': 'Save Current Scene',
    'palette.cmd.saveAll': 'Save All Modified Assets',
    'palette.cmd.newScene': 'Create New Empty Scene',
    'palette.cmd.togglePlay': 'Play / Stop Preview',
    'palette.cmd.toggleTheme': 'Toggle Dark / Light Theme',
    'palette.cmd.toggleLocale': 'Switch Language (中文 / English)',
    'palette.cmd.resetLayout': 'Reset Default Panel Layout',
    'palette.cmd.createEmpty': 'Create Empty GameObject',
    'palette.cmd.createCube': 'Create 3D Cube',
    'palette.cmd.createCamera': 'Create Camera',
    'palette.cmd.createLight': 'Create Directional Light',
    'palette.hint': '↑↓ Navigate · Enter Run · Esc Close',
  },
} as const;

export type MessageKey = keyof (typeof MESSAGES)['zh-CN'];

const listeners = new Set<() => void>();
let currentLocale: EditorLocale = readInitialLocale();

function readInitialLocale(): EditorLocale {
  try {
    const saved = window.localStorage?.getItem(LOCALE_STORAGE_KEY);
    if (saved === 'en-US' || saved === 'zh-CN') return saved;
  } catch {
    // Ignore storage failures in SSR / restricted WebViews.
  }
  return 'zh-CN';
}

function applyLocaleToDocument(locale: EditorLocale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function initializeLocale(): EditorLocale {
  currentLocale = readInitialLocale();
  applyLocaleToDocument(currentLocale);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== LOCALE_STORAGE_KEY) return;
      const next: EditorLocale = event.newValue === 'en-US' ? 'en-US' : 'zh-CN';
      if (next !== currentLocale) {
        currentLocale = next;
        applyLocaleToDocument(next);
        notify();
      }
    });
  }
  return currentLocale;
}

export function getLocale(): EditorLocale {
  return currentLocale;
}

export function setLocale(locale: EditorLocale): void {
  if (locale === currentLocale) {
    applyLocaleToDocument(locale);
    return;
  }
  currentLocale = locale;
  applyLocaleToDocument(locale);
  try {
    window.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore persistence errors.
  }
  notify();
}

export function toggleLocale(): EditorLocale {
  const next: EditorLocale = currentLocale === 'zh-CN' ? 'en-US' : 'zh-CN';
  setLocale(next);
  return next;
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
  locale: EditorLocale = currentLocale,
): string {
  const table = MESSAGES[locale] ?? MESSAGES['zh-CN'];
  let text: string = table[key] ?? MESSAGES['en-US'][key] ?? key;
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replaceAll(`{${paramKey}}`, String(paramValue));
    }
  }
  return text;
}

export function useI18n(): {
  locale: EditorLocale;
  setLocale: (locale: EditorLocale) => void;
  toggleLocale: () => EditorLocale;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
} {
  const locale = useSyncExternalStore<EditorLocale>(subscribeLocale, getLocale, () => 'zh-CN');
  return {
    locale,
    setLocale,
    toggleLocale,
    t: (key, params) => t(key, params, locale),
  };
}
