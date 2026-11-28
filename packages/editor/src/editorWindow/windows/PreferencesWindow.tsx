import { Globe, Keyboard, Moon, SlidersHorizontal, Sun } from 'lucide-react';
import { EditorWindow } from '../EditorWindow.ts';
import { registerEditorWindowType, registerMenuItem } from '../registry.ts';
import { useTheme, type EditorDensity } from '../../theme';
import { useI18n } from '../../i18n';

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl + K', 'Command Palette / 全局命令面板'],
  ['Ctrl + P', 'Play / Stop Preview / 运行或停止预览'],
  ['Ctrl + Shift + P', 'Pause / Resume / 暂停或继续'],
  ['Ctrl + S / Ctrl + Alt + S', 'Save Scene / Save All'],
  ['Ctrl + Z / Ctrl + Y', 'Undo / Redo'],
  ['W / E / R / T', 'Move / Rotate / Scale / Rect Gizmo'],
  ['F', 'Frame Selected / 聚焦选中对象'],
  ['F2', 'Rename Selected / 重命名选中对象'],
  ['Shift + Space', 'Focus / Maximize Active View'],
];

function PreferencesWindowBody() {
  const { theme, setTheme, density, setDensity, fontSize, setFontSize } = useTheme();
  const { locale, setLocale } = useI18n();

  const densityOptions: Array<{ id: EditorDensity; label: string }> = [
    { id: 'compact', label: locale === 'zh-CN' ? '紧凑 Compact' : 'Compact' },
    { id: 'standard', label: locale === 'zh-CN' ? '标准 Standard' : 'Standard' },
    { id: 'comfortable', label: locale === 'zh-CN' ? '舒展 Comfortable' : 'Comfortable' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 14 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <SlidersHorizontal size={14} aria-hidden="true" />
          {locale === 'zh-CN' ? '外观与语言' : 'Appearance & Language'}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', alignItems: 'center' }}>
          <span>{locale === 'zh-CN' ? '主题 / Theme' : 'Theme'}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={theme === 'dark' ? 'me-btn-primary' : 'me-btn-secondary'}
              style={{ height: 28, padding: '0 12px' }}
              onClick={() => setTheme('dark')}
            >
              <Moon size={13} aria-hidden="true" /> Dark
            </button>
            <button
              type="button"
              className={theme === 'light' ? 'me-btn-primary' : 'me-btn-secondary'}
              style={{ height: 28, padding: '0 12px' }}
              onClick={() => setTheme('light')}
            >
              <Sun size={13} aria-hidden="true" /> Light
            </button>
          </div>

          <span>{locale === 'zh-CN' ? '语言 / Language' : 'Language'}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={locale === 'zh-CN' ? 'me-btn-primary' : 'me-btn-secondary'}
              style={{ height: 28, padding: '0 12px' }}
              onClick={() => setLocale('zh-CN')}
            >
              <Globe size={13} aria-hidden="true" /> 简体中文
            </button>
            <button
              type="button"
              className={locale === 'en-US' ? 'me-btn-primary' : 'me-btn-secondary'}
              style={{ height: 28, padding: '0 12px' }}
              onClick={() => setLocale('en-US')}
            >
              <Globe size={13} aria-hidden="true" /> English
            </button>
          </div>

          <span>{locale === 'zh-CN' ? '界面密度' : 'Density'}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {densityOptions.map((item) => (
              <button
                key={item.id}
                type="button"
                className={density === item.id ? 'me-btn-primary' : 'me-btn-secondary'}
                style={{ height: 28, padding: '0 10px' }}
                onClick={() => setDensity(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <span>{locale === 'zh-CN' ? '基准字号' : 'Font Size'}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[11, 12, 13, 14].map((size) => (
              <button
                key={size}
                type="button"
                className={fontSize === size ? 'me-btn-primary' : 'me-btn-secondary'}
                style={{ height: 28, padding: '0 10px' }}
                onClick={() => setFontSize(size)}
              >
                {size}px
              </button>
            ))}
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Keyboard size={14} aria-hidden="true" />
          {locale === 'zh-CN' ? '快捷键速查' : 'Keyboard Shortcuts'}
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '6px 14px',
            padding: 10,
            borderRadius: 6,
            background: 'var(--me-bg-well)',
            border: '1px solid var(--me-border-subtle)',
            fontSize: 12,
          }}
        >
          {SHORTCUTS.map(([keys, desc]) => (
            <div key={keys} style={{ display: 'contents' }}>
              <span className="me-kbd">{keys}</span>
              <span style={{ color: 'var(--me-text-secondary)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export class PreferencesWindow extends EditorWindow {
  title = 'Preferences';
  minWidth = 480;
  minHeight = 420;

  static openFromMenu(activateWindow = true) {
    PreferencesWindow.show({ width: 540, height: 470, activateWindow });
  }

  onGUI() {
    return <PreferencesWindowBody />;
  }
}

registerEditorWindowType('EditorWindow.PreferencesWindow', () => {
  const window = new PreferencesWindow();
  return {
    typeId: 'EditorWindow.PreferencesWindow',
    title: window.title,
    width: 540,
    height: 470,
    requiresProject: false,
    render: () => window.onGUI(),
  };
});

registerMenuItem(
  'Edit/Preferences...',
  (context) => {
    PreferencesWindow.openFromMenu(context.source !== 'agent');
  },
  {
    priority: 910,
    agentInvokable: false,
    agentAlternative: 'open_editor_window',
  },
);
