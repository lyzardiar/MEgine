import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import type { EditorStore, EntityRec, TreeNode } from '../store';
import { HierarchyContextMenu, type CtxAction } from './HierarchyContextMenu';
import { subscribePing } from '../pingBus';

function iconFor(e: EntityRec) {
  const c = e.components;
  if (c.Canvas) return '🖼️';
  if (c.Button) return '🔘';
  if (c.Image) return '▭';
  if (c.Camera3D || c.Camera2D) return '🎥';
  if (c.DirectionalLight) return '💡';
  if (c.MeshRenderer) return '🧊';
  if (c.SpriteRenderer) return '🎴';
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
}) {
  const [ctx, setCtx] = useState<{ x: number; y: number; id: number | null } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; pos: DropPos } | null>(null);
  const [pingId, setPingId] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
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
      case 'createEmptyChild':
        s.createEmptyChild();
        props.onLog('Create Empty Child');
        break;
      case 'createCube':
        s.spawnCubeChild();
        props.onLog('Create Cube');
        break;
      case 'createSprite':
        s.spawnSpriteQuad();
        props.onLog('3D Object / Sprite Quad');
        break;
      case 'createCamera':
        s.spawnCamera();
        props.onLog('Create Camera');
        break;
      case 'createUiCanvas':
        s.spawnUiCanvas();
        props.onLog('UI / Canvas');
        break;
      case 'createUiImage':
        s.spawnUiImage();
        props.onLog('UI / Image');
        break;
      case 'createUiButton':
        s.spawnUiButton();
        props.onLog('UI / Button');
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
    setDragId(id);
    // 勿在拖拽时改选中：否则 Inspector 切走，Object 槽（如 On Click）会消失
    ev.dataTransfer.setData('text/mengine-entity', String(id));
    ev.dataTransfer.setData('text/plain', String(id));
    ev.dataTransfer.effectAllowed = 'copyMove';
  };

  const onDragOver = (ev: DragEvent, id: number) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const y = ev.clientY - rect.top;
    const ratio = y / rect.height;
    const pos: DropPos = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'into';
    setDropTarget({ id, pos });
  };

  const onDrop = (ev: DragEvent, targetId: number) => {
    ev.preventDefault();
    const pos = dropTarget?.id === targetId ? dropTarget.pos : 'into';
    setDropTarget(null);
    setDragId(null);
    const raw = Number(
      ev.dataTransfer.getData('text/mengine-entity') ||
        ev.dataTransfer.getData('text/plain'),
    );
    if (!Number.isFinite(raw)) return;
    // 多选拖其一：整组重挂；否则只挂被拖的那个
    const ids =
      props.selectedIds.includes(raw) && props.selectedIds.length > 1
        ? props.selectedIds
        : [raw];
    const target = props.nodes.find((n) => n.entity.entity === targetId)?.entity;
    if (!target) return;

    if (pos === 'into') {
      props.store.setParent(ids, targetId);
    } else {
      const parent = target.parent ?? null;
      const siblings = props.nodes.filter((n) => (n.entity.parent ?? null) === parent);
      const idx = siblings.findIndex((n) => n.entity.entity === targetId);
      const insertAt = pos === 'before' ? idx : idx + 1;
      props.store.setParent(ids, parent, Math.max(0, insertAt));
    }
    props.onLog('Reparent');
    props.onRefresh();
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
        className="dock-body hier-body"
        tabIndex={0}
        onContextMenu={(e) => onContext(e, null)}
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
              draggable={editing !== id}
              onClick={(e) => onRowClick(id, e)}
              onContextMenu={(e) => onContext(e, id)}
              onDragStart={(e) => onDragStart(e, id)}
              onDragOver={(e) => onDragOver(e, id)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => onDrop(e, id)}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
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
              <span className="hier-icon">{iconFor(n.entity)}</span>
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
          hasSelection={props.selectedIds.length > 0}
          onAction={runAction}
          onClose={() => setCtx(null)}
        />
      )}
    </>
  );
}
