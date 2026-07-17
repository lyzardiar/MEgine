import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import {
  getMenuRevision,
  listMenuItems,
  subscribeMenuItems,
  type MenuItemContext,
} from '../editorWindow';
import { PopupMenuItems } from './PopupMenu';

export type CtxAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'rename'
  | 'duplicate'
  | 'delete'
  | 'selectChildren'
  | 'frame'
  | 'expandAll'
  | 'collapseAll';

export function HierarchyContextMenu(props: {
  x: number;
  y: number;
  hasSelection: boolean;
  menuContext: MenuItemContext;
  onAction: (a: CtxAction) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: props.x, top: props.y });
  const onCloseRef = useRef(props.onClose);
  const onActionRef = useRef(props.onAction);
  onCloseRef.current = props.onClose;
  onActionRef.current = props.onAction;

  const menuRevision = useSyncExternalStore(
    subscribeMenuItems,
    getMenuRevision,
    getMenuRevision,
  );
  const gameObjectItems = listMenuItems('GameObject');

  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 4;
    setPosition({
      left: Math.max(padding, Math.min(props.x, window.innerWidth - rect.width - padding)),
      top: Math.max(padding, Math.min(props.y, window.innerHeight - rect.height - padding)),
    });
  }, [props.x, props.y, menuRevision]);

  useEffect(() => {
    // Defer so the opening contextmenu / mouseup does not instantly dismiss
    let remove: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const onPointerDown = (e: PointerEvent) => {
        if (ref.current?.contains(e.target as Node)) return;
        onCloseRef.current();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCloseRef.current();
      };
      window.addEventListener('pointerdown', onPointerDown, true);
      window.addEventListener('keydown', onKey);
      remove = () => {
        window.removeEventListener('pointerdown', onPointerDown, true);
        window.removeEventListener('keydown', onKey);
      };
    }, 0);
    return () => {
      window.clearTimeout(timer);
      remove?.();
    };
  }, []);

  const fire = (action: CtxAction, disabled?: boolean) => {
    if (disabled) return;
    onActionRef.current(action);
  };

  const Item = (p: { action: CtxAction; label: string; hint?: string; disabled?: boolean }) => (
    <button
      type="button"
      disabled={p.disabled}
      role="menuitem"
      onPointerDown={(e) => {
        // Prefer pointerdown so action runs before outside-close handlers
        e.preventDefault();
        e.stopPropagation();
        fire(p.action, p.disabled);
      }}
    >
      {p.label}
      {p.hint && <span className="hint">{p.hint}</span>}
    </button>
  );

  const menu = (
    <div
      ref={ref}
      className="hier-ctx popup-menu"
      style={position}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Item action="cut" label="Cut" hint="Ctrl+X" disabled={!props.hasSelection} />
      <Item action="copy" label="Copy" hint="Ctrl+C" disabled={!props.hasSelection} />
      <Item action="paste" label="Paste" hint="Ctrl+V" />
      <div className="sep" />
      <Item action="rename" label="Rename" hint="F2" disabled={!props.hasSelection} />
      <Item action="duplicate" label="Duplicate" hint="Ctrl+D" disabled={!props.hasSelection} />
      <Item action="delete" label="Delete" hint="Del" disabled={!props.hasSelection} />
      <div className="sep" />
      <PopupMenuItems
        entries={gameObjectItems}
        context={props.menuContext}
        onSelect={props.onClose}
      />
      <div className="sep" />
      <Item action="selectChildren" label="Select Children" disabled={!props.hasSelection} />
      <Item action="frame" label="Frame Selected" hint="F" disabled={!props.hasSelection} />
      <div className="sep" />
      <Item action="expandAll" label="Expand All" />
      <Item action="collapseAll" label="Collapse All" />
    </div>
  );

  return createPortal(menu, document.body);
}
