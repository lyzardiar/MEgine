import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import './dock.css';

export type PanelKind = 'hierarchy' | 'viewport' | 'inspector' | 'project' | 'console';

export type DockGroup = {
  panels: PanelKind[];
  active: PanelKind | null;
};

type DropZone = 'center' | 'left' | 'right' | 'top' | 'bottom';

type LeafNode = {
  kind: 'tabs';
  id: string;
  panels: PanelKind[];
  active: PanelKind | null;
};

type SplitNode = {
  kind: 'split';
  id: string;
  dir: 'h' | 'v';
  /** first child size ratio 0..1 */
  ratio: number;
  a: DockNode;
  b: DockNode;
};

type DockNode = LeafNode | SplitNode;

type DragPayload = { panel: PanelKind; fromId: string };
type DropTarget = { leafId: string; zone: DropZone };

const LAYOUT_KEY = 'mengine.dock.layout.v3';

const PANEL_TITLE: Record<PanelKind, string> = {
  hierarchy: 'Hierarchy',
  viewport: 'Viewport',
  inspector: 'Inspector',
  project: 'Project',
  console: 'Console',
};

const ALL_PANELS: PanelKind[] = ['hierarchy', 'viewport', 'inspector', 'project', 'console'];

let _idSeq = 0;
function nextId(prefix = 'n'): string {
  _idSeq += 1;
  return `${prefix}${_idSeq}_${Math.random().toString(36).slice(2, 7)}`;
}

function leaf(panels: PanelKind[], id?: string): LeafNode {
  return {
    kind: 'tabs',
    id: id ?? nextId('leaf'),
    panels: [...panels],
    active: panels[0] ?? null,
  };
}

function defaultTree(): DockNode {
  return {
    kind: 'split',
    id: nextId('root'),
    dir: 'v',
    ratio: 0.72,
    a: {
      kind: 'split',
      id: nextId('row'),
      dir: 'h',
      ratio: 0.22,
      a: leaf(['hierarchy']),
      b: {
        kind: 'split',
        id: nextId('row'),
        dir: 'h',
        ratio: 0.7,
        a: leaf(['viewport']),
        b: leaf(['inspector']),
      },
    },
    b: {
      kind: 'split',
      id: nextId('row'),
      dir: 'h',
      ratio: 0.62,
      a: leaf(['project']),
      b: leaf(['console']),
    },
  };
}

function cloneNode(n: DockNode): DockNode {
  if (n.kind === 'tabs') {
    return { ...n, panels: [...n.panels] };
  }
  return { ...n, a: cloneNode(n.a), b: cloneNode(n.b) };
}

function collectPanels(n: DockNode, out: Set<PanelKind> = new Set()): Set<PanelKind> {
  if (n.kind === 'tabs') {
    for (const p of n.panels) out.add(p);
    return out;
  }
  collectPanels(n.a, out);
  collectPanels(n.b, out);
  return out;
}

function mapLeaf(
  n: DockNode,
  leafId: string,
  fn: (leaf: LeafNode) => DockNode | null,
): DockNode | null {
  if (n.kind === 'tabs') {
    if (n.id !== leafId) return n;
    return fn(n);
  }
  const a = mapLeaf(n.a, leafId, fn);
  const b = mapLeaf(n.b, leafId, fn);
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return { ...n, a, b };
}

function removePanel(root: DockNode, panel: PanelKind): DockNode {
  const walk = (n: DockNode): DockNode | null => {
    if (n.kind === 'tabs') {
      if (!n.panels.includes(panel)) return n;
      const panels = n.panels.filter((p) => p !== panel);
      return panels.length
        ? { ...n, panels, active: n.active === panel ? panels[0] : n.active }
        : null;
    }
    const a = walk(n.a);
    const b = walk(n.b);
    if (!a && !b) return null;
    if (!a) return b;
    if (!b) return a;
    return { ...n, a, b };
  };
  return walk(root) ?? leaf([panel]);
}

function findLeaf(n: DockNode, id: string): LeafNode | null {
  if (n.kind === 'tabs') return n.id === id ? n : null;
  return findLeaf(n.a, id) ?? findLeaf(n.b, id);
}

/** Apply drop: center=tab merge; edges=split relative to target leaf */
function applyDrop(
  root: DockNode,
  panel: PanelKind,
  _fromId: string,
  target: DropTarget,
): DockNode {
  let tree = removePanel(cloneNode(root), panel);

  // If from leaf is also target and only that panel was there, ids may have collapsed —
  // find a leaf that still exists for target
  const targetLeaf = findLeaf(tree, target.leafId);

  if (target.zone === 'center') {
    if (!targetLeaf) {
      // target leaf vanished (dragged last tab onto itself) — put panel back as alone leaf
      return ensureAllPanels(tree, panel);
    }
    const next = mapLeaf(tree, target.leafId, (l) => {
      if (l.panels.includes(panel)) return { ...l, active: panel };
      return { ...l, panels: [...l.panels, panel], active: panel };
    });
    return ensureAllPanels(next ?? leaf([panel]), panel);
  }

  const newLeaf = leaf([panel]);

  if (!targetLeaf) {
    // Target gone — attach as sibling of root
    return ensureAllPanels(
      {
        kind: 'split',
        id: nextId('split'),
        dir: target.zone === 'top' || target.zone === 'bottom' ? 'v' : 'h',
        ratio: 0.5,
        a: target.zone === 'left' || target.zone === 'top' ? newLeaf : tree,
        b: target.zone === 'left' || target.zone === 'top' ? tree : newLeaf,
      },
      panel,
    );
  }

  // Don't split if dropping edge onto the same leaf we emptied and it's the only remaining
  // (target still exists with other tabs, or different leaf)
  const splitResult = mapLeaf(tree, target.leafId, (l) => {
    // If somehow still containing panel, treat as center
    if (l.panels.includes(panel)) return { ...l, active: panel };

    const dir: 'h' | 'v' =
      target.zone === 'left' || target.zone === 'right' ? 'h' : 'v';
    const panelFirst =
      target.zone === 'left' || target.zone === 'top';

    return {
      kind: 'split',
      id: nextId('split'),
      dir,
      ratio: 0.5,
      a: panelFirst ? newLeaf : l,
      b: panelFirst ? l : newLeaf,
    };
  });

  return ensureAllPanels(splitResult ?? tree, panel);
}

function ensureAllPanels(root: DockNode, preferActive?: PanelKind): DockNode {
  const seen = collectPanels(root);
  let tree: DockNode = root;
  for (const p of ALL_PANELS) {
    if (seen.has(p)) continue;
    // attach missing to first leaf
    const attach = (n: DockNode): DockNode => {
      if (n.kind === 'tabs') {
        return {
          ...n,
          panels: [...n.panels, p],
          active: preferActive === p ? p : n.active,
        };
      }
      return { ...n, a: attach(n.a) };
    };
    tree = attach(tree);
    seen.add(p);
  }
  return tree;
}

function hitZone(clientX: number, clientY: number, el: HTMLElement): DropZone {
  const r = el.getBoundingClientRect();
  const x = (clientX - r.left) / Math.max(1, r.width);
  const y = (clientY - r.top) / Math.max(1, r.height);
  const edge = 0.28;
  const dL = x;
  const dR = 1 - x;
  const dT = y;
  const dB = 1 - y;
  const min = Math.min(dL, dR, dT, dB);
  if (min > edge) return 'center';
  if (min === dL) return 'left';
  if (min === dR) return 'right';
  if (min === dT) return 'top';
  return 'bottom';
}

/** Migrate old A–E slot layout if present */
function migrateV2(): DockNode | null {
  try {
    const raw = localStorage.getItem('mengine.dock.layout.v2');
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      sizes?: { left?: number; right?: number; bottom?: number; bottomSplit?: number };
      assign?: Record<string, { panels?: PanelKind[]; active?: PanelKind | null } | PanelKind>;
    };
    if (!data.assign) return null;

    const group = (key: string): PanelKind[] => {
      const g = data.assign![key];
      if (!g) return [];
      if (typeof g === 'string') return ALL_PANELS.includes(g) ? [g] : [];
      return (g.panels ?? []).filter((p) => ALL_PANELS.includes(p));
    };

    const A = group('A');
    const B = group('B');
    const C = group('C');
    const D = group('D');
    const E = group('E');
    const sizes = data.sizes ?? {};
    const leftRatio = Math.min(0.4, Math.max(0.12, (sizes.left ?? 260) / 1200));
    const rightW = sizes.right ?? 320;
    const midRatio = Math.min(0.85, Math.max(0.4, 1 - rightW / 900));
    const bottomH = sizes.bottom ?? 220;
    const vRatio = Math.min(0.85, Math.max(0.4, 1 - bottomH / 800));
    const bottomSplit = Math.min(0.85, Math.max(0.2, sizes.bottomSplit ?? 0.62));

    const topChildren: DockNode[] = [];
    if (A.length) topChildren.push(leaf(A));
    if (B.length) topChildren.push(leaf(B));
    if (C.length) topChildren.push(leaf(C));

    const bottomChildren: DockNode[] = [];
    if (D.length) bottomChildren.push(leaf(D));
    if (E.length) bottomChildren.push(leaf(E));

    const packRow = (nodes: DockNode[], ratios: number[]): DockNode | null => {
      if (!nodes.length) return null;
      if (nodes.length === 1) return nodes[0];
      let cur = nodes[nodes.length - 1];
      for (let i = nodes.length - 2; i >= 0; i--) {
        cur = {
          kind: 'split',
          id: nextId('split'),
          dir: 'h',
          ratio: ratios[i] ?? 0.5,
          a: nodes[i],
          b: cur,
        };
      }
      return cur;
    };

    // Approximate ratios for 3-col: left | mid+right
    let top: DockNode | null = null;
    if (topChildren.length === 3) {
      top = {
        kind: 'split',
        id: nextId('split'),
        dir: 'h',
        ratio: leftRatio,
        a: topChildren[0],
        b: {
          kind: 'split',
          id: nextId('split'),
          dir: 'h',
          ratio: midRatio,
          a: topChildren[1],
          b: topChildren[2],
        },
      };
    } else {
      top = packRow(topChildren, [0.3, 0.5]);
    }

    let bottom: DockNode | null = null;
    if (bottomChildren.length === 2) {
      bottom = {
        kind: 'split',
        id: nextId('split'),
        dir: 'h',
        ratio: bottomSplit,
        a: bottomChildren[0],
        b: bottomChildren[1],
      };
    } else {
      bottom = packRow(bottomChildren, [0.5]);
    }

    if (top && bottom) {
      return {
        kind: 'split',
        id: nextId('root'),
        dir: 'v',
        ratio: vRatio,
        a: top,
        b: bottom,
      };
    }
    return ensureAllPanels(top ?? bottom ?? defaultTree());
  } catch {
    return null;
  }
}

function loadTree(): DockNode {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { tree?: DockNode };
      if (data.tree) return ensureAllPanels(reviveIds(data.tree));
    }
  } catch {
    /* ignore */
  }
  return migrateV2() ?? defaultTree();
}

function reviveIds(n: DockNode): DockNode {
  if (n.kind === 'tabs') {
    const panels = n.panels.filter((p) => ALL_PANELS.includes(p));
    return {
      kind: 'tabs',
      id: n.id || nextId('leaf'),
      panels,
      active: n.active && panels.includes(n.active) ? n.active : panels[0] ?? null,
    };
  }
  return {
    kind: 'split',
    id: n.id || nextId('split'),
    dir: n.dir === 'v' ? 'v' : 'h',
    ratio: typeof n.ratio === 'number' ? Math.min(0.85, Math.max(0.15, n.ratio)) : 0.5,
    a: reviveIds(n.a),
    b: reviveIds(n.b),
  };
}

function saveTree(tree: DockNode) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify({ tree }));
}

function Splitter(props: {
  direction: 'horizontal' | 'vertical';
  onDrag: (delta: number) => void;
}) {
  const dragging = useRef(false);
  const last = useRef(0);
  const onDragRef = useRef(props.onDrag);
  onDragRef.current = props.onDrag;

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const cur = props.direction === 'horizontal' ? e.clientX : e.clientY;
      const delta = cur - last.current;
      last.current = cur;
      if (delta) onDragRef.current(delta);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.classList.remove('dock-resizing-x', 'dock-resizing-y');
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [props.direction]);

  return (
    <div
      className={`dock-splitter ${props.direction}`}
      onMouseDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        last.current = props.direction === 'horizontal' ? e.clientX : e.clientY;
        document.body.classList.add(
          props.direction === 'horizontal' ? 'dock-resizing-x' : 'dock-resizing-y',
        );
      }}
    />
  );
}

function DropOverlay(props: { zone: DropZone | null }) {
  if (!props.zone) return null;
  return (
    <div className="dock-drop-overlay" aria-hidden>
      <div className={`dock-drop-fill zone-${props.zone}`} />
      <div className="dock-drop-hint">
        {props.zone === 'center' ? '合并为页签' : '在此侧拆分'}
      </div>
    </div>
  );
}

function DockLeaf(props: {
  node: LeafNode;
  panels: Record<PanelKind, ReactNode>;
  viewportTabs?: ReactNode;
  dragging: boolean;
  drop: DropTarget | null;
  onActivate: (leafId: string, panel: PanelKind) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDragOver: (target: DropTarget | null) => void;
  onDrop: (target: DropTarget) => void;
}) {
  const { node } = props;
  const active = node.active;
  const showViewportChrome = active === 'viewport' && props.viewportTabs;
  const isDropHere = props.drop?.leafId === node.id;
  const zone = isDropHere ? props.drop!.zone : null;
  const frameRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="dock-pane"
      ref={frameRef}
      onDragOver={(e) => {
        if (!props.dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const z = hitZone(e.clientX, e.clientY, e.currentTarget);
        props.onDragOver({ leafId: node.id, zone: z });
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) props.onDragOver(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const z = hitZone(e.clientX, e.clientY, e.currentTarget);
        props.onDrop({ leafId: node.id, zone: z });
      }}
    >
      <div className={`dock${isDropHere ? ' dock-drop-target' : ''}`}>
        <div className="dock-tabs">
          {node.panels.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`dock-tab dock-tab-drag${active === kind ? ' active' : ''}`}
              draggable
              title="拖到面板中间=叠页签；拖到边缘=上下左右拆分"
              onClick={() => props.onActivate(node.id, kind)}
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'text/mengine-dock',
                  JSON.stringify({ panel: kind, fromId: node.id }),
                );
                e.dataTransfer.effectAllowed = 'move';
                props.onDragStart({ panel: kind, fromId: node.id });
              }}
              onDragEnd={props.onDragEnd}
            >
              {PANEL_TITLE[kind]}
            </button>
          ))}
          {showViewportChrome && <div className="dock-tabs-extra">{props.viewportTabs}</div>}
        </div>
        <div className="dock-content">{active ? props.panels[active] : null}</div>
        {props.dragging && <DropOverlay zone={zone} />}
      </div>
    </div>
  );
}

function DockNodeView(props: {
  node: DockNode;
  panels: Record<PanelKind, ReactNode>;
  viewportTabs?: ReactNode;
  dragging: boolean;
  drop: DropTarget | null;
  onActivate: (leafId: string, panel: PanelKind) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDragOver: (target: DropTarget | null) => void;
  onDrop: (target: DropTarget) => void;
  onRatio: (splitId: string, ratio: number) => void;
}) {
  const { node } = props;

  if (node.kind === 'tabs') {
    return (
      <DockLeaf
        node={node}
        panels={props.panels}
        viewportTabs={props.viewportTabs}
        dragging={props.dragging}
        drop={props.drop}
        onActivate={props.onActivate}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onDragOver={props.onDragOver}
        onDrop={props.onDrop}
      />
    );
  }

  const horizontal = node.dir === 'h';
  const boxRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={`dock-split ${horizontal ? 'dir-h' : 'dir-v'}`}
      ref={boxRef}
    >
      <div
        className="dock-split-child"
        style={
          horizontal
            ? { flex: `${node.ratio} 1 0`, minWidth: 0 }
            : { flex: `${node.ratio} 1 0`, minHeight: 0 }
        }
      >
        <DockNodeView {...props} node={node.a} />
      </div>
      <Splitter
        direction={horizontal ? 'horizontal' : 'vertical'}
        onDrag={(delta) => {
          const box = boxRef.current;
          if (!box) return;
          const size = horizontal ? box.clientWidth : box.clientHeight;
          if (size <= 0) return;
          const next = Math.min(0.85, Math.max(0.15, node.ratio + delta / size));
          props.onRatio(node.id, next);
        }}
      />
      <div
        className="dock-split-child"
        style={
          horizontal
            ? { flex: `${1 - node.ratio} 1 0`, minWidth: 0 }
            : { flex: `${1 - node.ratio} 1 0`, minHeight: 0 }
        }
      >
        <DockNodeView {...props} node={node.b} />
      </div>
    </div>
  );
}

export function DockWorkspace(props: {
  panels: Record<PanelKind, ReactNode>;
  viewportTabs?: ReactNode;
}) {
  const boot = useRef(loadTree());
  const [tree, setTree] = useState<DockNode>(boot.current);
  const dragRef = useRef<DragPayload | null>(null);
  const [dragging, setDragging] = useState(false);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  // Stable key prefix for remount after reset
  const resetKey = useId();
  const [layoutKey, setLayoutKey] = useState(0);

  useEffect(() => {
    saveTree(tree);
  }, [tree]);

  useEffect(() => {
    const onFocus = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as PanelKind | undefined;
      if (detail !== 'hierarchy' && detail !== 'project') return;
      setTree((prev) => {
        const walk = (n: DockNode): DockNode => {
          if (n.kind === 'tabs') {
            if (n.panels.includes(detail)) return { ...n, active: detail };
            return n;
          }
          return { ...n, a: walk(n.a), b: walk(n.b) };
        };
        return walk(prev);
      });
    };
    window.addEventListener('mengine:focus-panel', onFocus);
    return () => window.removeEventListener('mengine:focus-panel', onFocus);
  }, []);

  const setRatio = useCallback((splitId: string, ratio: number) => {
    setTree((prev) => {
      const walk = (n: DockNode): DockNode => {
        if (n.kind === 'tabs') return n;
        if (n.id === splitId) return { ...n, ratio };
        return { ...n, a: walk(n.a), b: walk(n.b) };
      };
      return walk(prev);
    });
  }, []);

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
    setDrop(null);
  };

  const onDrop = (target: DropTarget) => {
    const payload = dragRef.current;
    if (!payload) {
      endDrag();
      return;
    }
    // Same leaf + center → just activate
    if (payload.fromId === target.leafId && target.zone === 'center') {
      setTree((prev) => {
        const next = mapLeaf(prev, target.leafId, (l) =>
          l.panels.includes(payload.panel) ? { ...l, active: payload.panel } : l,
        );
        return next ?? prev;
      });
      endDrag();
      return;
    }
    // Same leaf edge with multiple tabs → split out this tab
    setTree((prev) => applyDrop(prev, payload.panel, payload.fromId, target));
    endDrag();
  };

  return (
    <div className={`dock-workspace${dragging ? ' is-dragging' : ''}`} key={`${resetKey}-${layoutKey}`}>
      <DockNodeView
        node={tree}
        panels={props.panels}
        viewportTabs={props.viewportTabs}
        dragging={dragging}
        drop={drop}
        onActivate={(leafId, panel) => {
          setTree((prev) => {
            const next = mapLeaf(prev, leafId, (l) =>
              l.panels.includes(panel) ? { ...l, active: panel } : l,
            );
            return next ?? prev;
          });
        }}
        onDragStart={(payload) => {
          dragRef.current = payload;
          setDragging(true);
        }}
        onDragEnd={endDrag}
        onDragOver={setDrop}
        onDrop={onDrop}
        onRatio={setRatio}
      />

      <button
        type="button"
        className="dock-reset"
        title="恢复默认布局"
        onClick={() => {
          const t = defaultTree();
          setTree(t);
          setLayoutKey((k) => k + 1);
        }}
      >
        重置布局
      </button>
    </div>
  );
}
