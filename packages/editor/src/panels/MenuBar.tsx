import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  getMenuRevision,
  listMenuItems,
  subscribeMenuItems,
  type MenuItemContext,
} from '../editorWindow';
import {
  focusMenuBoundary,
  moveMenuItemFocus,
} from '../menuKeyboardNavigation';
import type { EditorStore } from '../store';
import { PopupMenuItems } from './PopupMenu';

const MENUS = ['File', 'Edit', 'Assets', 'GameObject', 'Component', 'Window', 'Help'] as const;
type MenuName = (typeof MENUS)[number];

function menuId(name: MenuName): string {
  return `main-menu-${name.toLocaleLowerCase()}`;
}

export function MenuBar(props: {
  onNew: () => void;
  onSave: () => void;
  onSaveAll: () => void;
  onSaveAs: () => void;
  onLoad: () => void;
  onCloseProject: () => void;
  onExit: () => void;
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
  const menuRefs = useRef<Array<HTMLDivElement | null>>([]);

  const focusTopMenu = (index: number, keepOpen: boolean) => {
    const normalizedIndex = (index + MENUS.length) % MENUS.length;
    if (keepOpen) setOpen(MENUS[normalizedIndex]);
    menuRefs.current[normalizedIndex]?.focus({ preventScroll: true });
  };

  const openMenuAndFocus = (name: MenuName, boundary: 'first' | 'last' = 'first') => {
    const index = MENUS.indexOf(name);
    setOpen(name);
    window.requestAnimationFrame(() => {
      const menu = menuRefs.current[index]
        ?.querySelector<HTMLElement>(`:scope > #${menuId(name)}`);
      focusMenuBoundary(menu ?? null, boundary);
    });
  };

  const closeMenuAndRestoreFocus = (name: MenuName) => {
    setOpen(null);
    const index = MENUS.indexOf(name);
    menuRefs.current[index]?.focus({ preventScroll: true });
  };

  const onTopMenuKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    name: MenuName,
    index: number,
  ) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenuAndRestoreFocus(name);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenuAndFocus(name, event.key === 'ArrowDown' ? 'first' : 'last');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open === name) closeMenuAndRestoreFocus(name);
      else openMenuAndFocus(name);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      focusTopMenu(index + (event.key === 'ArrowRight' ? 1 : -1), open !== null);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusTopMenu(event.key === 'Home' ? 0 : MENUS.length - 1, open !== null);
    }
  };

  const onOpenMenuKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    name: MenuName,
    index: number,
  ) => {
    if (moveMenuItemFocus(event.currentTarget, event.target, event.key)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenuAndRestoreFocus(name);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const item = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[role="menuitem"]')
        : null;
      if (event.key === 'ArrowRight' && item?.getAttribute('aria-haspopup') === 'menu') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + MENUS.length)
        % MENUS.length;
      openMenuAndFocus(MENUS[nextIndex]);
    }
  };

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
  const componentItems = listMenuItems('Component');
  const editItems = listMenuItems('Edit');
  const helpItems = listMenuItems('Help');
  const menuContext: MenuItemContext = {
    source: 'menu-bar',
    store: props.store,
    selectedIds: props.selectedIds,
    contextEntity: props.store.selected,
    refresh: props.onRefresh,
    log: props.onLog,
  };

  return (
    <div className="menu-bar" ref={root} role="menubar" aria-label="Main menu">
      {MENUS.map((name, index) => (
        <div
          key={name}
          ref={(element) => {
            menuRefs.current[index] = element;
          }}
          className={`menu-item${open === name ? ' open' : ''}`}
          role="menuitem"
          tabIndex={0}
          aria-label={name}
          aria-haspopup="menu"
          aria-expanded={open === name}
          aria-controls={menuId(name)}
          onMouseEnter={open && open !== name ? () => setOpen(name) : undefined}
          onClick={() => setOpen(open === name ? null : name)}
          onKeyDown={(event) => onTopMenuKeyDown(event, name, index)}
        >
          {name}
          {name === 'File' && (
            <div
              id={menuId(name)}
              className="menu-drop"
              role="menu"
              aria-label={`${name} menu`}
              onKeyDown={(event) => onOpenMenuKeyDown(event, name, index)}
            >
              <button type="button" role="menuitem" onClick={() => { props.onNew(); setOpen(null); }}>
                New Scene <span className="hint">Ctrl+N</span>
              </button>
              <button type="button" role="menuitem" onClick={() => { props.onSave(); setOpen(null); }}>
                Save Scene <span className="hint">Ctrl+S</span>
              </button>
              <button type="button" role="menuitem" onClick={() => { props.onSaveAll(); setOpen(null); }}>
                Save All <span className="hint">Ctrl+Alt+S</span>
              </button>
              <button type="button" role="menuitem" onClick={() => { props.onSaveAs(); setOpen(null); }}>
                Save Scene As…
              </button>
              <button type="button" role="menuitem" onClick={() => { props.onLoad(); setOpen(null); }}>
                Open Scene…
              </button>
              <button
                type="button"
                role="menuitem"
                data-agent-interaction="blocked"
                data-agent-alternative="close_project"
                onClick={() => { props.onCloseProject(); setOpen(null); }}
              >
                Close Project
              </button>
              <div className="sep" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'build' }));
                  setOpen(null);
                }}
              >
                Build Settings… <span className="hint">Ctrl+Shift+B</span>
              </button>
              <div className="sep" />
              <button
                type="button"
                role="menuitem"
                data-agent-interaction="blocked"
                data-agent-alternative="close_project"
                onClick={() => { props.onExit(); setOpen(null); }}
              >
                Exit
              </button>
            </div>
          )}
          {name === 'Edit' && (
            <div
              id={menuId(name)}
              className="menu-drop popup-menu"
              role="menu"
              aria-label={`${name} menu`}
              onKeyDown={(event) => onOpenMenuKeyDown(event, name, index)}
            >
              <button
                type="button"
                role="menuitem"
                disabled={!props.store.canUndo}
                onClick={() => { props.onUndo(); setOpen(null); }}
              >
                Undo{props.store.undoLabel ? ` ${props.store.undoLabel}` : ''} <span className="hint">Ctrl+Z</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!props.store.canRedo}
                onClick={() => { props.onRedo(); setOpen(null); }}
              >
                Redo{props.store.redoLabel ? ` ${props.store.redoLabel}` : ''} <span className="hint">Ctrl+Shift+Z</span>
              </button>
              <div className="sep" />
              <button type="button" role="menuitem" onClick={() => { props.onDuplicate(); setOpen(null); }}>
                Duplicate <span className="hint">Ctrl+D</span>
              </button>
              {editItems.length > 0 && <div className="sep" role="separator" />}
              <PopupMenuItems
                entries={editItems}
                context={menuContext}
                onSelect={() => setOpen(null)}
              />
            </div>
          )}
          {name === 'GameObject' && (
            <div
              id={menuId(name)}
              className="menu-drop popup-menu"
              role="menu"
              aria-label={`${name} menu`}
              onKeyDown={(event) => onOpenMenuKeyDown(event, name, index)}
            >
              <PopupMenuItems
                entries={gameObjectItems}
                context={menuContext}
                onSelect={() => setOpen(null)}
              />
            </div>
          )}
          {name === 'Assets' && (
            <div
              id={menuId(name)}
              className="menu-drop popup-menu"
              role="menu"
              aria-label={`${name} menu`}
              onKeyDown={(event) => onOpenMenuKeyDown(event, name, index)}
            >
              {assetItems.length === 0 && (
                <button type="button" role="menuitem" disabled>(no asset commands)</button>
              )}
              <PopupMenuItems
                entries={assetItems}
                context={menuContext}
                onSelect={() => setOpen(null)}
              />
            </div>
          )}
          {name === 'Component' && (
            <div
              id={menuId(name)}
              className="menu-drop popup-menu"
              role="menu"
              aria-label={`${name} menu`}
              onKeyDown={(event) => onOpenMenuKeyDown(event, name, index)}
            >
              {componentItems.length === 0 && (
                <button type="button" role="menuitem" disabled>(no components)</button>
              )}
              <PopupMenuItems
                entries={componentItems}
                context={menuContext}
                onSelect={() => setOpen(null)}
              />
            </div>
          )}
          {name === 'Window' && (
            <div
              id={menuId(name)}
              className="menu-drop popup-menu"
              role="menu"
              aria-label={`${name} menu`}
              onKeyDown={(event) => onOpenMenuKeyDown(event, name, index)}
            >
              {windowItems.length === 0 && (
                <button type="button" role="menuitem" disabled>
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
            <div
              id={menuId(name)}
              className="menu-drop popup-menu"
              role="menu"
              aria-label={`${name} menu`}
              onKeyDown={(event) => onOpenMenuKeyDown(event, name, index)}
            >
              {helpItems.length === 0 && (
                <button type="button" role="menuitem" disabled>(no help topics)</button>
              )}
              <PopupMenuItems
                entries={helpItems}
                context={menuContext}
                onSelect={() => setOpen(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
