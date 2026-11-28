import { useState, type ReactNode } from 'react';
import {
  Globe,
  LayoutGrid,
  Moon,
  Palette,
  Pause,
  Play,
  Redo2,
  Save,
  Search,
  Sparkles,
  StepForward,
  Sun,
  Undo2,
} from 'lucide-react';
import type { EditorMode } from '../store';
import type { DockLayoutPresetId } from './DockWorkspace';
import { BrandMark } from '../components/ui/BrandMark';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';
import { sceneFileName } from '../sceneLibrary';

export type IdeTopBarProps = {
  menuSlot: ReactNode;
  sceneName: string | null;
  sceneDirty: boolean;
  mode: EditorMode;
  aiOpen: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
  onOpenCommandPalette: () => void;
  onToggleAi: () => void;
};

export function IdeTopBar(props: IdeTopBarProps) {
  const { theme, toggleTheme, accent, cycleAccent } = useTheme();
  const { locale, toggleLocale, t } = useI18n();
  const zh = locale === 'zh-CN';
  const [layoutOpen, setLayoutOpen] = useState(false);

  const accentLabel = accent === 'pink' ? 'PinK' : accent === 'cobalt' ? 'Cobalt' : 'Emerald';
  const accentColor = accent === 'pink' ? '#f43f8e' : accent === 'cobalt' ? '#3b82f6' : '#10b981';

  const applyPreset = (preset: DockLayoutPresetId) => {
    window.dispatchEvent(new CustomEvent('mengine:apply-dock-preset', { detail: preset }));
    setLayoutOpen(false);
  };

  return (
    <header className={`ide-topbar${props.mode !== 'edit' ? ' is-playing' : ''}`}>
      <div className="ide-topbar-left">
        <span className="ide-brand-badge">
          <BrandMark size={22} />
          <span className="ide-brand-word">MEngine</span>
        </span>
        <div className="ide-menu-inline">{props.menuSlot}</div>
      </div>

      <div className="ide-topbar-center">
        <button
          type="button"
          className="ide-command-bar"
          aria-label="Open Command Palette"
          title={t('toolbar.commandPalette')}
          onClick={props.onOpenCommandPalette}
        >
          <Search size={12} aria-hidden="true" />
          <span className="ide-command-scene">
            {props.sceneDirty && <span className="ide-dirty-dot" title="Unsaved changes" />}
            {props.sceneName ? sceneFileName(props.sceneName) : t('common.untitledScene')}
          </span>
          <span className="ide-command-sep" aria-hidden="true" />
          <span className="ide-command-hint">{zh ? '搜索命令或对象' : 'Search commands…'}</span>
          <span className="me-kbd">Ctrl+K</span>
        </button>

        <div className="ide-transport-pill" role="toolbar" aria-label="Play controls">
          <button
            type="button"
            className={`ide-play-btn${props.mode !== 'edit' ? ' is-active' : ''}`}
            aria-label={props.mode === 'edit' ? 'Enter Play Mode' : 'Exit Play Mode'}
            aria-pressed={props.mode !== 'edit'}
            title={`${props.mode === 'edit' ? 'Play' : 'Stop'} (Ctrl+P)`}
            onClick={props.onPlay}
          >
            <Play size={13} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`ide-play-btn${props.mode === 'pause' ? ' is-paused' : ''}`}
            aria-label={props.mode === 'pause' ? 'Resume Play Mode' : 'Pause Play Mode'}
            aria-pressed={props.mode === 'pause'}
            title={`${props.mode === 'pause' ? 'Resume' : 'Pause'} (Ctrl+Shift+P)`}
            disabled={props.mode === 'edit'}
            onClick={props.onPause}
          >
            <Pause size={13} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ide-play-btn"
            aria-label="Step one frame"
            title="Step one frame (Ctrl+Alt+P)"
            disabled={props.mode === 'edit'}
            onClick={props.onStep}
          >
            <StepForward size={13} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="ide-topbar-right">
        <div className="ide-pill-group">
          <button
            type="button"
            className="ide-ghost-icon"
            aria-label="Undo"
            title={t('toolbar.undo')}
            disabled={props.mode !== 'edit'}
            onClick={props.onUndo}
          >
            <Undo2 size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ide-ghost-icon"
            aria-label="Redo"
            title={t('toolbar.redo')}
            disabled={props.mode !== 'edit'}
            onClick={props.onRedo}
          >
            <Redo2 size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`ide-ghost-icon${props.sceneDirty ? ' is-dirty' : ''}`}
            aria-label="Save Scene"
            title={t('toolbar.save')}
            disabled={props.mode !== 'edit'}
            onClick={props.onSave}
          >
            <Save size={13} aria-hidden="true" />
          </button>
        </div>

        <div className="ide-layout-wrap">
          <button
            type="button"
            className={`ide-ghost-icon${layoutOpen ? ' is-open' : ''}`}
            aria-label="Workspace Layout"
            aria-expanded={layoutOpen}
            title={zh ? '切换工作区布局预设' : 'Workspace Layout Presets'}
            onClick={() => setLayoutOpen((v) => !v)}
          >
            <LayoutGrid size={13} aria-hidden="true" />
          </button>
          {layoutOpen && (
            <div className="ide-layout-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => applyPreset('default')}>
                {t('toolbar.layout.default')}
              </button>
              <button type="button" role="menuitem" onClick={() => applyPreset('tall')}>
                {t('toolbar.layout.tall')}
              </button>
              <button type="button" role="menuitem" onClick={() => applyPreset('wide')}>
                {t('toolbar.layout.wide')}
              </button>
              <button type="button" role="menuitem" onClick={() => applyPreset('viewport')}>
                {t('toolbar.layout.focus')}
              </button>
            </div>
          )}
        </div>

        <div className="ide-pill-group">
          <button
            type="button"
            className="ide-ghost-icon"
            aria-label="Switch Accent Color"
            title={zh ? `主题色：${accentLabel}（点击切换）` : `Accent: ${accentLabel} (click to cycle)`}
            onClick={cycleAccent}
          >
            <Palette size={13} style={{ color: accentColor }} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ide-ghost-icon"
            aria-label="Toggle theme"
            title={t('toolbar.theme')}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={13} aria-hidden="true" /> : <Moon size={13} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="ide-lang-btn"
            aria-label="Toggle language"
            title={t('toolbar.locale')}
            onClick={toggleLocale}
          >
            <Globe size={11} aria-hidden="true" />
            <span>{t('common.langToggle')}</span>
          </button>
        </div>

        <button
          type="button"
          className={`ide-ai-toggle-btn${props.aiOpen ? ' active' : ''}`}
          aria-label="Toggle AI Copilot"
          aria-pressed={props.aiOpen}
          title={zh ? 'AI Copilot 侧栏 (Ctrl+Shift+A)' : 'AI Copilot Sidebar (Ctrl+Shift+A)'}
          onClick={props.onToggleAi}
        >
          <Sparkles size={13} aria-hidden="true" />
          <span>AI</span>
        </button>
      </div>
    </header>
  );
}
