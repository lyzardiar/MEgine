import { useEffect, useRef, useState } from 'react';
import { listMenuItems } from '../editorWindow';

const MENUS = ['File', 'Edit', 'Assets', 'GameObject', 'Component', 'Window', 'Help'] as const;

export function MenuBar(props: {
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onLoad: () => void;
  onUndo: () => void;
  onCreateEmpty: () => void;
  onCreateEmptyChild: () => void;
  onCreateCube: () => void;
  onCreateCamera: () => void;
  onCreateUiCanvas: () => void;
  onCreateUiImage: () => void;
  onCreateUiButton: () => void;
  onCreateSprite: () => void;
  onDuplicate: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, []);

  const windowItems = listMenuItems('Window');

  return (
    <div className="menu-bar" ref={root}>
      {MENUS.map((name) => (
        <div
          key={name}
          className={`menu-item${open === name ? ' open' : ''}`}
          onMouseEnter={() => open && setOpen(name)}
          onClick={() => setOpen(open === name ? null : name)}
        >
          {name}
          {name === 'File' && (
            <div className="menu-drop">
              <button type="button" onClick={() => { props.onNew(); setOpen(null); }}>
                New Scene <span className="hint">Ctrl+N</span>
              </button>
              <button type="button" onClick={() => { props.onSave(); setOpen(null); }}>
                Save Scene <span className="hint">Ctrl+S</span>
              </button>
              <button type="button" onClick={() => { props.onSaveAs(); setOpen(null); }}>
                Save Scene As…
              </button>
              <button type="button" onClick={() => { props.onLoad(); setOpen(null); }}>
                Open Scene…
              </button>
              <div className="sep" />
              <button type="button" onClick={() => setOpen(null)}>Exit</button>
            </div>
          )}
          {name === 'Edit' && (
            <div className="menu-drop">
              <button type="button" onClick={() => { props.onUndo(); setOpen(null); }}>
                Undo <span className="hint">Ctrl+Z</span>
              </button>
              <div className="sep" />
              <button type="button" onClick={() => { props.onDuplicate(); setOpen(null); }}>
                Duplicate <span className="hint">Ctrl+D</span>
              </button>
            </div>
          )}
          {name === 'GameObject' && (
            <div className="menu-drop">
              <button type="button" onClick={() => { props.onCreateEmpty(); setOpen(null); }}>
                Create Empty
              </button>
              <button type="button" onClick={() => { props.onCreateEmptyChild(); setOpen(null); }}>
                Create Empty Child
              </button>
              <div className="sep" />
              <button type="button" onClick={() => { props.onCreateCube(); setOpen(null); }}>
                3D Object / Cube
              </button>
              <button type="button" onClick={() => { props.onCreateSprite(); setOpen(null); }}>
                3D Object / Sprite Quad
              </button>
              <button type="button" onClick={() => { props.onCreateCamera(); setOpen(null); }}>
                Camera
              </button>
              <div className="sep" />
              <button type="button" onClick={() => { props.onCreateUiCanvas(); setOpen(null); }}>
                UI / Canvas
              </button>
              <button type="button" onClick={() => { props.onCreateUiImage(); setOpen(null); }}>
                UI / Image
              </button>
              <button type="button" onClick={() => { props.onCreateUiButton(); setOpen(null); }}>
                UI / Button
              </button>
            </div>
          )}
          {name === 'Window' && (
            <div className="menu-drop">
              {windowItems.length === 0 && (
                <button type="button" disabled>
                  (no windows)
                </button>
              )}
              {windowItems.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    item.action();
                    setOpen(null);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {name === 'Help' && (
            <div className="menu-drop">
              <button type="button" onClick={() => setOpen(null)}>
                MEngine Docs
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
