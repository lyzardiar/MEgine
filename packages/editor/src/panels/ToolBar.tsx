import type { EditorMode, GizmoMode } from '../store';
import type { ToolHandleOrientation, ToolPivotMode } from '../editorTool';
import {
  Move,
  Pause,
  Play,
  RotateCw,
  Scan,
  Scaling,
  Square,
  StepForward,
} from 'lucide-react';

export function ToolBar(props: {
  mode: EditorMode;
  gizmo: GizmoMode;
  pivotMode: ToolPivotMode;
  handleOrientation: ToolHandleOrientation;
  onGizmo: (m: GizmoMode) => void;
  onPivotMode: (mode: ToolPivotMode) => void;
  onHandleOrientation: (orientation: ToolHandleOrientation) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStep: () => void;
}) {
  return (
    <div className="tool-bar">
      <div className="tool-group" role="toolbar" aria-label="Scene tools">
        <span className="brand-chip">MENGINE</span>
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
        <span className="tool-separator" aria-hidden="true" />
        <button
          type="button"
          className="tool-mode-btn"
          title="Handle Position: Pivot / Center"
          onClick={() => props.onPivotMode(props.pivotMode === 'pivot' ? 'center' : 'pivot')}
        >
          {props.pivotMode === 'pivot' ? 'Pivot' : 'Center'}
        </button>
        <button
          type="button"
          className="tool-mode-btn"
          title="Handle Orientation: Local / Global (Scale always uses Local)"
          onClick={() => props.onHandleOrientation(
            props.handleOrientation === 'local' ? 'global' : 'local',
          )}
        >
          {props.handleOrientation === 'local' ? 'Local' : 'Global'}
        </button>
      </div>

      <div className="tool-group center">
        <button
          type="button"
          className={`play-btn${props.mode !== 'edit' ? ' on' : ''}`}
          aria-label="Enter Play Mode"
          aria-pressed={props.mode !== 'edit'}
          title="Enter Play Mode"
          disabled={props.mode !== 'edit'}
          onClick={props.onPlay}
        >
          <Play size={14} fill="currentColor" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`play-btn${props.mode === 'pause' ? ' on' : ''}`}
          aria-label={props.mode === 'pause' ? 'Resume Play Mode' : 'Pause Play Mode'}
          aria-pressed={props.mode === 'pause'}
          title={props.mode === 'pause' ? 'Resume Play Mode' : 'Pause Play Mode'}
          disabled={props.mode === 'edit'}
          onClick={props.onPause}
        >
          <Pause size={14} fill="currentColor" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="play-btn"
          aria-label="Exit Play Mode"
          title="Exit Play Mode"
          disabled={props.mode === 'edit'}
          onClick={props.onStop}
        >
          <Square size={12} fill="currentColor" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="play-btn"
          aria-label="Step one frame"
          title="Step one frame"
          disabled={props.mode !== 'pause'}
          onClick={props.onStep}
        >
          <StepForward size={14} fill="currentColor" aria-hidden="true" />
        </button>
      </div>

      <div className="tool-group right">
        <span style={{ color: 'var(--u-muted)' }}>
          {props.mode === 'edit' ? 'Scene' : props.mode === 'play' ? 'Playing…' : 'Paused'}
        </span>
      </div>
    </div>
  );
}
