import type { EditorMode, GizmoMode } from '../store';

export function ToolBar(props: {
  mode: EditorMode;
  gizmo: GizmoMode;
  onGizmo: (m: GizmoMode) => void;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
}) {
  return (
    <div className="tool-bar">
      <div className="tool-group">
        <span className="brand-chip">MENGINE</span>
        <button
          type="button"
          className={`tool-btn${props.gizmo === 'translate' ? ' active' : ''}`}
          title="Move (W)"
          onClick={() => props.onGizmo('translate')}
        >
          W
        </button>
        <button
          type="button"
          className={`tool-btn${props.gizmo === 'rotate' ? ' active' : ''}`}
          title="Rotate (E)"
          onClick={() => props.onGizmo('rotate')}
        >
          E
        </button>
        <button
          type="button"
          className={`tool-btn${props.gizmo === 'scale' ? ' active' : ''}`}
          title="Scale (R)"
          onClick={() => props.onGizmo('scale')}
        >
          R
        </button>
        <button
          type="button"
          className={`tool-btn${props.gizmo === 'rect' ? ' active' : ''}`}
          title="Rect Tool (T)"
          onClick={() => props.onGizmo('rect')}
        >
          T
        </button>
      </div>

      <div className="tool-group center">
        <button
          type="button"
          className={`play-btn${props.mode === 'play' ? ' on' : ''}`}
          title="Play"
          onClick={props.onPlay}
        >
          ▶
        </button>
        <button type="button" className="play-btn" title="Pause" onClick={props.onPause}>
          ⏸
        </button>
        <button type="button" className="play-btn" title="Stop" onClick={props.onStop}>
          ■
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
