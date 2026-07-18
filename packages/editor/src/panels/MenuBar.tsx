import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  getMenuRevision,
  listMenuItems,
  subscribeMenuItems,
  type MenuItemContext,
} from '../editorWindow';
import type { EditorStore } from '../store';
import { PopupMenuItems } from './PopupMenu';

const MENUS = ['File', 'Edit', 'Assets', 'GameObject', 'Component', 'Window', 'Help'] as const;

export function MenuBar(props: {
  onNew: () => void;
  onSave: () => void;
  onSaveAll: () => void;
  onSaveAs: () => void;
  onLoad: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDuplicate: () => void;
  store: EditorStore;
  selectedIds: readonly number[];
  onRefresh: () => void;
  onLog: (message: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useSyncExternalStore(subscribeMenuItems, getMenuRevision, getMenuRevision);
  const windowItems = listMenuItems('Window');
  const assetItems = listMenuItems('Assets');
  const gameObjectItems = listMenuItems('GameObject');
  const menuContext: MenuItemContext = {
    source: 'menu-bar',
    store: props.store,
    selectedIds: props.selectedIds,
    contextEntity: props.store.selected,
    refresh: props.onRefresh,
    log: props.onLog,
  };

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
              <button type="button" onClick={() => { props.onSaveAll(); setOpen(null); }}>
                Save All <span className="hint">Ctrl+Alt+S</span>
              </button>
              <button type="button" onClick={() => { props.onSaveAs(); setOpen(null); }}>
                Save Scene As…
              </button>
              <button type="button" onClick={() => { props.onLoad(); setOpen(null); }}>
                Open Scene…
              </button>
              <div className="sep" />
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'build' }));
                  setOpen(null);
                }}
              >
                Build Settings… <span className="hint">Ctrl+Shift+B</span>
              </button>
              <div className="sep" />
              <button type="button" onClick={() => setOpen(null)}>Exit</button>
            </div>
          )}
          {name === 'Edit' && (
            <div className="menu-drop">
              <button
                type="button"
                disabled={!props.store.canUndo}
                onClick={() => { props.onUndo(); setOpen(null); }}
              >
                Undo{props.store.undoLabel ? ` ${props.store.undoLabel}` : ''} <span className="hint">Ctrl+Z</span>
              </button>
              <button
                type="button"
                disabled={!props.store.canRedo}
                onClick={() => { props.onRedo(); setOpen(null); }}
              >
                Redo{props.store.redoLabel ? ` ${props.store.redoLabel}` : ''} <span className="hint">Ctrl+Shift+Z</span>
              </button>
              <div className="sep" />
              <button type="button" onClick={() => { props.onDuplicate(); setOpen(null); }}>
                Duplicate <span className="hint">Ctrl+D</span>
              </button>
            </div>
          )}
          {name === 'GameObject' && (
            <div className="menu-drop popup-menu" role="menu">
              <PopupMenuItems
                entries={gameObjectItems}
                context={menuContext}
                onSelect={() => setOpen(null)}
              />
            </div>
          )}
          {name === 'Assets' && (
            <div className="menu-drop popup-menu" role="menu">
              {assetItems.length === 0 && (
                <button type="button" disabled>(no asset commands)</button>
              )}
              <PopupMenuItems
                entries={assetItems}
                context={menuContext}
                onSelect={() => setOpen(null)}
              />
            </div>
          )}
          {name === 'Window' && (
            <div className="menu-drop popup-menu" role="menu">
              {windowItems.length === 0 && (
                <button type="button" disabled>
                  (no windows)
                </button>
              )}
              <PopupMenuItems
                entries={windowItems}
                context={menuContext}
                onSelect={() => setOpen(null)}
              />
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
