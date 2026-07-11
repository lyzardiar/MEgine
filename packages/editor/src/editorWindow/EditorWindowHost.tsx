import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  closeEditorWindow,
  focusEditorWindow,
  getOpenEditorWindows,
  subscribeEditorWindows,
  updateEditorWindow,
  type EditorWindowInstance,
} from './registry';

function WindowFrame(props: { win: EditorWindowInstance }) {
  const { win } = props;
  const [geom, setGeom] = useState({
    x: win.x,
    y: win.y,
    width: win.width,
    height: win.height,
  });
  // Sync from registry when not dragging (e.g. reopen)
  useEffect(() => {
    setGeom({ x: win.x, y: win.y, width: win.width, height: win.height });
  }, [win.x, win.y, win.width, win.height]);

  const drag = useRef<{ ox: number; oy: number; sx: number; sy: number } | null>(null);
  const resize = useRef<{ ox: number; oy: number; sw: number; sh: number } | null>(null);
  const geomRef = useRef(geom);
  geomRef.current = geom;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (drag.current) {
        const d = drag.current;
        const next = {
          ...geomRef.current,
          x: d.sx + (e.clientX - d.ox),
          y: d.sy + (e.clientY - d.oy),
        };
        geomRef.current = next;
        setGeom(next);
      } else if (resize.current) {
        const r = resize.current;
        const next = {
          ...geomRef.current,
          width: Math.max(280, r.sw + (e.clientX - r.ox)),
          height: Math.max(160, r.sh + (e.clientY - r.oy)),
        };
        geomRef.current = next;
        setGeom(next);
      }
    };
    const onUp = () => {
      if (drag.current || resize.current) {
        const g = geomRef.current;
        updateEditorWindow(win.id, {
          x: g.x,
          y: g.y,
          width: g.width,
          height: g.height,
        });
      }
      drag.current = null;
      resize.current = null;
      document.body.classList.remove('ew-dragging');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [win.id]);

  const onTitleDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    focusEditorWindow(win.id);
    drag.current = {
      ox: e.clientX,
      oy: e.clientY,
      sx: geomRef.current.x,
      sy: geomRef.current.y,
    };
    document.body.classList.add('ew-dragging');
  };

  const onResizeDown = (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    focusEditorWindow(win.id);
    resize.current = {
      ox: e.clientX,
      oy: e.clientY,
      sw: geomRef.current.width,
      sh: geomRef.current.height,
    };
    document.body.classList.add('ew-dragging');
  };

  return (
    <div
      className="editor-window"
      style={{
        left: geom.x,
        top: geom.y,
        width: geom.width,
        height: geom.height,
      }}
      onMouseDown={() => focusEditorWindow(win.id)}
    >
      <div className="editor-window-title" onMouseDown={onTitleDown}>
        <span className="editor-window-title-text">{win.title}</span>
        <button
          type="button"
          className="editor-window-close"
          title="Close"
          onClick={(e) => {
            e.stopPropagation();
            closeEditorWindow(win.id);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ×
        </button>
      </div>
      <div className="editor-window-body">{win.render()}</div>
      <div className="editor-window-resize" onMouseDown={onResizeDown} />
    </div>
  );
}

/** Host for all open EditorWindow instances (floating, Unity-like). */
export function EditorWindowHost() {
  const [, bump] = useState(0);
  useEffect(() => subscribeEditorWindows(() => bump((n) => n + 1)), []);
  const list = getOpenEditorWindows();
  if (!list.length) return null;
  return (
    <div className="editor-window-host">
      {list.map((w) => (
        <WindowFrame key={w.id} win={w} />
      ))}
    </div>
  );
}
