import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { EditorStore, EntityRec, TreeNode } from '../store';
import { HierarchyContextMenu, type CtxAction } from './HierarchyContextMenu';
import { subscribePing } from '../pingBus';

function iconFor(e: EntityRec) {
  const c = e.components;
  if (c.Tilemap) return '▦';
  if (c.Grid) return '⌗';
  if (c.AudioSource || c.AudioListener || c.AudioMixer) return '♪';
  if (c.RawImage) return '\u25a1';
  if (c.Canvas) return '🖼️';
  if (c.Button) return '🔘';
  if (c.Image) return '▭';
  if (c.Camera3D || c.Camera2D) return '🎥';
  if (c.DirectionalLight) return '💡';
  if (c.EnvironmentLight) return '\u25c9';
  if (c.MeshRenderer) return '🧊';
  if (c.SpriteRenderer) return '🎴';
  if (c.AnimatedSprite2D) return '🎞';
  if (c.Line2D) return '⌁';
  if (c.SpineSkeleton) return '🦴';
  if (c.ParticleEmitter2D || c.ParticleEmitter3D) return '✨';
  if ((e.name ?? '').toLowerCase().includes('light')) return '💡';
  return '○';
}

type DropPos = 'before' | 'after' | 'into';

export function Hierarchy(props: {
  store: EditorStore;
  nodes: TreeNode[];
  selectedIds: number[];
  filter: string;
  pendingRenameId: number | null;
  onFilter: (v: string) => void;
  onPendingRenameConsumed: () => void;
  onRefresh: () => void;
  onLog: (msg: string) => void;
  onFrame: () => void;
  onInstantiatePrefab?: (path: string, parent: number | null) => void;
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number; id: number | null } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; pos: DropPos } | null>(null);
  const [rootDrop, setRootDrop] = useState(false);
  const [pingId, setPingId] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const hierarchyBodyRef = useRef<HTMLDivElement>(null);
  const pointerDrag = useRef<{
    id: number;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const pointerDropTarget = useRef<{ id: number; pos: DropPos } | null>(null);
  const pointerRootDrop = useRef(false);
  const suppressClick = useRef(false);
  const lastClick = useRef<{ id: number; t: number }>({ id: -1, t: 0 });

  useEffect(() => {
    return subscribePing((e) => {
      if (e.kind !== 'entity') return;
      props.store.revealEntity(e.id);
      props.onRefresh();
      setPingId(e.id);
      window.setTimeout(() => setPingId((cur) => (cur === e.id ? null : cur)), 900);
      requestAnimationFrame(() => {
        rowRefs.current.get(e.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
  }, [props.store, props.onRefresh]);

  const filtered = useMemo(() => {
    const q = props.filter.trim().toLowerCase();
    if (!q) return props.nodes;
    return props.nodes.filter((n) =>
      (n.entity.name ?? `Entity ${n.entity.entity}`).toLowerCase().includes(q),
    );
  }, [props.nodes, props.filter]);

  useEffect(() => {
    if (props.pendingRenameId == null) return;
    const id = props.pendingRenameId;
    const e = props.nodes.find((n) => n.entity.entity === id)?.entity;
    setEditing(id);
    setEditValue(e?.name ?? '');
    props.onPendingRenameConsumed();
  }, [props.pendingRenameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginRename = (id: number, name: string) => {
    setEditing(id);
    setEditValue(name);
  };

  const commitRename = () => {
    if (editing == null) return;
    props.store.rename(editing, editValue);
    setEditing(null);
    props.onRefresh();
  };

  const onRowClick = (id: number, ev: MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (editing === id) return;
    const now = Date.now();
    const slowDbl =
      lastClick.current.id === id &&
      now - lastClick.current.t > 250 &&
      now - lastClick.current.t < 700 &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.shiftKey;
    lastClick.current = { id, t: now };

    if (slowDbl) {
      const e = props.nodes.find((n) => n.entity.entity === id)?.entity;
      beginRename(id, e?.name ?? '');
      return;
    }

    props.store.selectClick(id, { ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey });
    props.onRefresh();
  };

  const onContext = (ev: MouseEvent, id: number | null) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (id != null && !props.selectedIds.includes(id)) {
      props.store.select(id);
      props.onRefresh();
    }
    setCtx({ x: ev.clientX, y: ev.clientY, id });
  };

  const runAction = (action: CtxAction) => {
    setCtx(null);
    const s = props.store;
    switch (action) {
      case 'cut':
        s.cutSelection();
        props.onLog('Cut');
        break;
      case 'copy':
        s.copySelection();
        props.onLog('Copy');
        break;
      case 'paste':
        s.paste();
        props.onLog('Paste');
        break;
      case 'rename': {
        const id = s.selected;
        if (id != null) {
          const e = props.nodes.find((n) => n.entity.entity === id)?.entity;
          beginRename(id, e?.name ?? '');
        }
        break;
      }
      case 'duplicate':
        s.duplicateSelection();
        props.onLog('Duplicate');
        break;
      case 'delete':
        s.deleteSelection();
        props.onLog('Delete');
        break;
      case 'selectChildren':
        s.selectChildren();
        break;
      case 'frame':
        props.onFrame();
        break;
      case 'expandAll':
        s.expandAll();
        break;
      case 'collapseAll':
        s.collapseAll();
        break;
    }
    props.onRefresh();
  };

  const onDragStart = (ev: DragEvent, id: number) => {
    pointerDrag.current = null;
    setDragId(id);
    // 勿在拖拽时改选中：否则 Inspector 切走，Object 槽（如 On Click）会消失
    ev.dataTransfer.setData('text/mengine-entity', String(id));
    ev.dataTransfer.setData('text/plain', String(id));
    ev.dataTransfer.effectAllowed = 'move';
  };

  const isEntityDrag = (ev: DragEvent) =>
    Array.from(ev.dataTransfer.types).includes('text/mengine-entity');

  const isPrefabDrag = (ev: DragEvent) =>
    Array.from(ev.dataTransfer.types).includes('text/mengine-prefab');

  const selectedDragIds = (id: number) =>
    props.selectedIds.includes(id) && props.selectedIds.length > 1
      ? props.selectedIds
      : [id];

  const draggedIds = (ev: DragEvent): number[] => {
    const raw = Number(
      ev.dataTransfer.getData('text/mengine-entity') ||
        ev.dataTransfer.getData('text/plain'),
    );
    if (!Number.isFinite(raw)) return [];
    return selectedDragIds(raw);
  };

  const finishDrop = (ids: number[], parent: number | null, atIndex?: number) => {
    const changed = props.store.setParent(ids, parent, atIndex);
    setDropTarget(null);
    setRootDrop(false);
    setDragId(null);
    if (!changed) return;
    props.onLog(parent == null ? 'Move to root' : 'Reparent');
    props.onRefresh();
  };

  const placeAtTarget = (ids: number[], targetId: number, pos: DropPos) => {
    const target = props.nodes.find((node) => node.entity.entity === targetId)?.entity;
    if (!target) return;
    if (pos === 'into') {
      finishDrop(ids, targetId);
      return;
    }
    const parent = target.parent ?? null;
    const moving = new Set(ids);
    const siblings = props.nodes.filter(
      (node) => (node.entity.parent ?? null) === parent && !moving.has(node.entity.entity),
    );
    const index = siblings.findIndex((node) => node.entity.entity === targetId);
    if (index < 0) return;
    finishDrop(ids, parent, pos === 'before' ? index : index + 1);
  };

  const onDragOver = (ev: DragEvent, id: number) => {
    if (isPrefabDrag(ev)) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = 'copy';
      setRootDrop(false);
      setDropTarget({ id, pos: 'into' });
      return;
    }
    if (!isEntityDrag(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = 'move';
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const y = ev.clientY - rect.top;
    const ratio = y / rect.height;
    const pos: DropPos = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'into';
    setRootDrop(false);
    setDropTarget({ id, pos });
  };

  const onDrop = (ev: DragEvent, targetId: number) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (isPrefabDrag(ev)) {
      const path = ev.dataTransfer.getData('text/mengine-prefab');
      setDropTarget(null);
      if (path) props.onInstantiatePrefab?.(path, targetId);
      return;
    }
    const pos = dropTarget?.id === targetId ? dropTarget.pos : 'into';
    const ids = draggedIds(ev);
    if (!ids.length) return;
    placeAtTarget(ids, targetId, pos);
  };

  const clearPointerDrag = () => {
    pointerDrag.current = null;
    pointerDropTarget.current = null;
    pointerRootDrop.current = false;
    setDragId(null);
    setDropTarget(null);
    setRootDrop(false);
  };

  const onPointerDown = (ev: ReactPointerEvent, id: number) => {
    if (ev.button !== 0) return;
    hierarchyBodyRef.current?.focus({ preventScroll: true });
    if (editing === id) return;
    const target = ev.target as HTMLElement;
    if (target.closest('button, input, textarea, select, .hier-icon')) return;
    pointerDrag.current = {
      id,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
    };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: ReactPointerEvent) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 4) return;
      drag.active = true;
      setDragId(drag.id);
    }
    ev.preventDefault();

    const body = hierarchyBodyRef.current;
    const hit = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const row = hit?.closest<HTMLElement>('.hier-row') ?? null;
    if (row && body?.contains(row)) {
      const targetId = Number(row.dataset.entityId);
      if (!Number.isFinite(targetId) || targetId === drag.id) {
        pointerDropTarget.current = null;
        pointerRootDrop.current = false;
        setDropTarget(null);
        setRootDrop(false);
        return;
      }
      const rect = row.getBoundingClientRect();
      const ratio = (ev.clientY - rect.top) / rect.height;
      const pos: DropPos = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'into';
      pointerRootDrop.current = false;
      pointerDropTarget.current = { id: targetId, pos };
      setRootDrop(false);
      setDropTarget({ id: targetId, pos });
      return;
    }
    if (body && hit && body.contains(hit)) {
      pointerDropTarget.current = null;
      pointerRootDrop.current = true;
      setDropTarget(null);
      setRootDrop(true);
      return;
    }
    pointerDropTarget.current = null;
    pointerRootDrop.current = false;
    setDropTarget(null);
    setRootDrop(false);
  };

  const onPointerUp = (ev: ReactPointerEvent) => {
    const drag = pointerDrag.current;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
    if (!drag.active) {
      clearPointerDrag();
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    const ids = selectedDragIds(drag.id);
    const target = pointerDropTarget.current;
    const moveToRoot = pointerRootDrop.current;
    clearPointerDrag();
    if (target) placeAtTarget(ids, target.id, target.pos);
    else if (moveToRoot) finishDrop(ids, null);
  };

  return (
    <>
      <div className="dock-toolbar">
        <input
          className="search"
          placeholder="Search…"
          value={props.filter}
          onChange={(e) => props.onFilter(e.target.value)}
        />
        <button
          type="button"
          className="hier-add"
          title="Create Empty"
          onClick={() => {
            props.store.createEmpty(null);
            props.onRefresh();
          }}
        >
          +
        </button>
      </div>
      <div
        ref={hierarchyBodyRef}
        className={`dock-body hier-body${rootDrop ? ' drop-root' : ''}`}
        tabIndex={0}
        title="拖到节点中部更改父级；拖到上下边缘调整顺序；拖到空白处移到根节点"
        onContextMenu={(e) => onContext(e, null)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={clearPointerDrag}
        onDragOver={(e) => {
          if (isPrefabDrag(e)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setDropTarget(null);
            setRootDrop(true);
            return;
          }
          if (!isEntityDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropTarget(null);
          setRootDrop(true);
        }}
        onDragLeave={(e) => {
          if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
            setRootDrop(false);
          }
        }}
        onDrop={(e) => {
          if (isPrefabDrag(e)) {
            e.preventDefault();
            const path = e.dataTransfer.getData('text/mengine-prefab');
            setRootDrop(false);
            if (path) props.onInstantiatePrefab?.(path, null);
            return;
          }
          if (!isEntityDrag(e)) return;
          e.preventDefault();
          const ids = draggedIds(e);
          if (ids.length) finishDrop(ids, null);
        }}
      >
        {filtered.map((n) => {
          const id = n.entity.entity;
          const selected = props.selectedIds.includes(id);
          const inactive = !n.entity.active;
          const drop = dropTarget?.id === id ? dropTarget.pos : null;
          return (
            <div
              key={id}
              ref={(el) => {
                if (el) rowRefs.current.set(id, el);
                else rowRefs.current.delete(id);
              }}
              className={[
                'hier-row',
                selected ? 'selected' : '',
                inactive ? 'inactive' : '',
                dragId === id ? 'dragging' : '',
                pingId === id ? 'ping' : '',
                drop === 'into' ? 'drop-into' : '',
                drop === 'before' ? 'drop-before' : '',
                drop === 'after' ? 'drop-after' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ paddingLeft: 8 + n.depth * 14 }}
              data-entity-id={id}
              data-depth={n.depth}
              aria-selected={selected}
              onClick={(e) => onRowClick(id, e)}
              onContextMenu={(e) => onContext(e, id)}
              onPointerDown={(e) => onPointerDown(e, id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={clearPointerDrag}
              onDragOver={(e) => onDragOver(e, id)}
              onDragLeave={(e) => {
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
                  setDropTarget(null);
                }
              }}
              onDrop={(e) => onDrop(e, id)}
            >
              <button
                type="button"
                className="hier-twist"
                onClick={(e) => {
                  e.stopPropagation();
                  if (n.hasChildren) {
                    props.store.toggleExpand(id);
                    props.onRefresh();
                  }
                }}
              >
                {n.hasChildren ? (n.expanded ? '▾' : '▸') : '·'}
              </button>
              <input
                type="checkbox"
                className="hier-active"
                checked={n.entity.active}
                title="Active"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  props.store.setActive(id, e.target.checked);
                  props.onRefresh();
                }}
              />
              <span
                className="hier-icon"
                draggable={editing !== id}
                title="拖动节点行调整层级；拖动图标可赋值给对象引用"
                onDragStart={(e) => onDragStart(e, id)}
                onDragEnd={clearPointerDrag}
              >
                {iconFor(n.entity)}
              </span>
              {editing === id ? (
                <input
                  className="hier-rename"
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <span className="hier-name">{n.entity.name ?? `Entity ${id}`}</span>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="empty-state">No GameObjects</div>}
      </div>
      {ctx && (
        <HierarchyContextMenu
          x={ctx.x}
          y={ctx.y}
          hasSelection={props.store.selectedIds.length > 0}
          menuContext={{
            source: 'hierarchy',
            store: props.store,
            selectedIds: props.store.selectedIds,
            contextEntity: ctx.id,
            refresh: props.onRefresh,
            log: props.onLog,
          }}
          onAction={runAction}
          onClose={() => setCtx(null)}
        />
      )}
    </>
  );
}
