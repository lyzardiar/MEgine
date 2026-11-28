import type { EditorMode, GizmoMode } from '../store';
import type { ToolHandleOrientation, ToolPivotMode } from '../editorTool';
import {
  Globe,
  Moon,
  Move,
  Pause,
  Play,
  Redo2,
  RotateCw,
  Save,
  Scan,
  Scaling,
  Search,
  StepForward,
  Sun,
  Undo2,
} from 'lucide-react';
import { BrandMark } from '../components/ui/BrandMark';
import { useTheme } from '../theme';
import { useI18n } from '../i18n';

export function ToolBar(props: {
  mode: EditorMode;
  gizmo: GizmoMode;
  pivotMode: ToolPivotMode;
  handleOrientation: ToolHandleOrientation;
  sceneDirty?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onOpenCommandPalette?: () => void;
  onGizmo: (m: GizmoMode) => void;
  onPivotMode: (mode: ToolPivotMode) => void;
  onHandleOrientation: (orientation: ToolHandleOrientation) => void;
  onPlay: () => void;
  onPause: () => void;
  onStep: () => void;
}) {
  const { theme, toggleTheme } = useTheme();
  const { toggleLocale, t } = useI18n();

  return (
    <div className={`tool-bar${props.mode !== 'edit' ? ' is-playing' : ''}`}>
      <div className="tool-group" role="toolbar" aria-label="Scene tools">
        <span className="me-brand-inline">
          <BrandMark size={20} />
          <span className="brand-chip">MENGINE</span>
        </span>

        {props.onUndo && props.onRedo && (
          <>
            <div className="me-segmented">
              <button
                type="button"
                className="tool-btn"
                aria-label="Undo"
                title={t('toolbar.undo')}
                disabled={props.mode !== 'edit'}
                onClick={props.onUndo}
              >
                <Undo2 size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="tool-btn"
                aria-label="Redo"
                title={t('toolbar.redo')}
                disabled={props.mode !== 'edit'}
                onClick={props.onRedo}
              >
                <Redo2 size={14} aria-hidden="true" />
              </button>
              {props.onSave && (
                <button
                  type="button"
                  className={`tool-btn${props.sceneDirty ? ' active' : ''}`}
                  aria-label="Save Scene"
                  title={t('toolbar.save')}
                  disabled={props.mode !== 'edit'}
                  onClick={props.onSave}
                >
                  <Save size={14} aria-hidden="true" />
                </button>
              )}
            </div>
            <span className="tool-separator" aria-hidden="true" />
          </>
        )}

        <div className="me-segmented">
          <button
            type="button"
            className={`tool-btn${props.gizmo === 'translate' ? ' active' : ''}`}
            aria-label="Move tool"
            aria-pressed={props.gizmo === 'translate'}
            title="Move (W)"
            onClick={() => props.onGizmo('translate')}
          >
            <Move size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`tool-btn${props.gizmo === 'rotate' ? ' active' : ''}`}
            aria-label="Rotate tool"
            aria-pressed={props.gizmo === 'rotate'}
            title="Rotate (E)"
            onClick={() => props.onGizmo('rotate')}
          >
            <RotateCw size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`tool-btn${props.gizmo === 'scale' ? ' active' : ''}`}
            aria-label="Scale tool"
            aria-pressed={props.gizmo === 'scale'}
            title="Scale (R)"
            onClick={() => props.onGizmo('scale')}
          >
            <Scaling size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`tool-btn${props.gizmo === 'rect' ? ' active' : ''}`}
            aria-label="Rect tool"
            aria-pressed={props.gizmo === 'rect'}
            title="Rect Tool (T) · Shift keep aspect · Alt resize around pivot"
            onClick={() => props.onGizmo('rect')}
          >
            <Scan size={14} aria-hidden="true" />
          </button>
        </div>

        <span className="tool-separator" aria-hidden="true" />
        <div className="me-segmented">
          <button
            type="button"
            className="tool-mode-btn"
            title="Handle Position: Pivot / Center"
            onClick={() => props.onPivotMode(props.pivotMode === 'pivot' ? 'center' : 'pivot')}
          >
            {props.pivotMode === 'pivot' ? t('toolbar.pivot') : t('toolbar.center')}
          </button>
          <button
            type="button"
            className="tool-mode-btn"
            title="Handle Orientation: Local / Global (Scale always uses Local)"
            onClick={() => props.onHandleOrientation(
              props.handleOrientation === 'local' ? 'global' : 'local',
            )}
          >
            {props.handleOrientation === 'local' ? t('toolbar.local') : t('toolbar.global')}
          </button>
        </div>
      </div>

      <div className="tool-group center" role="toolbar" aria-label="Play controls">
        <button
          type="button"
          className={`play-btn${props.mode !== 'edit' ? ' on' : ''}`}
          aria-label={props.mode === 'edit' ? 'Enter Play Mode' : 'Exit Play Mode'}
          aria-pressed={props.mode !== 'edit'}
          title={`${props.mode === 'edit' ? 'Play' : 'Stop'} (Ctrl+P)`}
          onClick={props.onPlay}
        >
          <Play size={14} fill="currentColor" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`play-btn${props.mode === 'pause' ? ' on' : ''}`}
          aria-label={props.mode === 'pause' ? 'Resume Play Mode' : 'Pause Play Mode'}
          aria-pressed={props.mode === 'pause'}
          title={`${props.mode === 'pause' ? 'Resume' : 'Pause'} (Ctrl+Shift+P)`}
          disabled={props.mode === 'edit'}
          onClick={props.onPause}
        >
          <Pause size={14} fill="currentColor" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="play-btn"
          aria-label="Step one frame"
          title="Step one frame (Ctrl+Alt+P)"
          disabled={props.mode === 'edit'}
          onClick={props.onStep}
        >
          <StepForward size={14} fill="currentColor" aria-hidden="true" />
        </button>
      </div>

      <div className="tool-group right" style={{ gap: 6 }}>
        {props.onOpenCommandPalette && (
          <button
            type="button"
            className="me-cmd-trigger"
            aria-label="Open Command Palette"
            title={t('toolbar.commandPalette')}
            onClick={props.onOpenCommandPalette}
          >
            <Search size={12} aria-hidden="true" />
            <span>{t('common.search')}</span>
            <span className="me-kbd">Ctrl+K</span>
          </button>
        )}

        <div className="me-segmented">
          <button
            type="button"
            className="tool-btn"
            aria-label="Toggle theme"
            title={t('toolbar.theme')}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={13} aria-hidden="true" /> : <Moon size={13} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="tool-mode-btn"
            style={{ minWidth: 34, padding: '0 6px' }}
            aria-label="Toggle language"
            title={t('toolbar.locale')}
            onClick={toggleLocale}
          >
            <Globe size={12} style={{ marginRight: 3, verticalAlign: '-1px' }} aria-hidden="true" />
            {t('common.langToggle')}
          </button>
        </div>

        <span
          className={`me-mode-pill${props.mode === 'play' ? ' is-play' : props.mode === 'pause' ? ' is-pause' : ''}`}
        >
          <span className="me-mode-dot" aria-hidden="true" />
          {props.mode === 'edit'
            ? t('toolbar.mode.edit')
            : props.mode === 'play'
              ? t('toolbar.mode.play')
              : t('toolbar.mode.pause')}
        </span>
      </div>
    </div>
  );
}
