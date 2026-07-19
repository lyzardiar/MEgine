import {
  cloneElement,
  isValidElement,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import {
  CORE_PANEL_IDS,
  closeAllDetachedPanelWindows,
  closeDetachedPanelWindow,
  createPanelChannel,
  detachPanelWindow,
  dragDetachedPanelWindow,
  readDetachedPanels,
  reconcileDetachedPanels,
  requestPanelDock,
  setDetachedPanelOpen,
  type CorePanelId,
  type PanelWindowMessage,
} from './detachedPanelWindow';
import { isDesktopEditor } from '../transport/editorTransport';
import { dockPanelShouldMount } from '../dockPanelMounting';
import { registerMenuItem } from '../editorWindow';
import './dock.css';

export type PanelKind = CorePanelId;

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

const DOCK_DRAG_TYPE = 'text/mengine-dock';
const RESET_DOCK_LAYOUT_EVENT = 'mengine:reset-dock-layout';

export type DockPanelContents = Omit<Record<PanelKind, ReactNode>, 'scene' | 'game'> & {
  /** Legacy authoring element; Dock clones it with an independent Scene/Game tab prop. */
  viewport: ReactElement<{ tab: 'scene' | 'game' }>;
};

const LAYOUT_KEY = 'mengine.dock.layout.v4';

const PANEL_TITLE: Record<PanelKind, string> = {
  hierarchy: 'Hierarchy',
  scene: 'Scene',
  game: 'Game',
  inspector: 'Inspector / Property',
  project: 'Project',
  console: 'Console',
  timeline: 'Timeline',
  animator: 'Animator',
  material: 'Material',
  shader: 'Surface Shader',
  spriteEditor: 'Sprite Editor',
  spriteAtlas: 'Sprite Atlas',
  build: 'Build Settings',
  projectSettings: 'Project Settings',
};

const ALL_PANELS: PanelKind[] = [...CORE_PANEL_IDS];

CORE_PANEL_IDS.forEach((panel, index) => {
  registerMenuItem(
    `Window/General/${PANEL_TITLE[panel]}`,
    () => {
      window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: panel }));
    },
    { priority: 100 + index },
  );
});

registerMenuItem(
  'Window/Layout/Reset Default Layout',
  () => {
    window.dispatchEvent(new CustomEvent(RESET_DOCK_LAYOUT_EVENT));
  },
  { priority: 850 },
);

registerMenuItem(
  'Edit/Project Settings...',
  () => {
    window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'projectSettings' }));
  },
  { priority: 900 },
);

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
    ratio: 0.68,
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
        a: leaf(['scene', 'game']),
        b: leaf(['inspector', 'material', 'shader', 'build', 'projectSettings']),
      },
    },
    b: leaf(['project', 'console', 'timeline', 'animator', 'spriteEditor', 'spriteAtlas']),
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

function stripPanel(root: DockNode, panel: PanelKind): DockNode | null {
  if (root.kind === 'tabs') {
    if (!root.panels.includes(panel)) return root;
    const panels = root.panels.filter((candidate) => candidate !== panel);
    if (!panels.length) return null;
    return {
      ...root,
      panels,
      active: root.active === panel ? panels[0] : root.active,
    };
  }
  const a = stripPanel(root.a, panel);
  const b = stripPanel(root.b, panel);
  if (!a) return b;
  if (!b) return a;
  return { ...root, a, b };
}

function attachPanel(root: DockNode, panel: PanelKind): DockNode {
  if (collectPanels(root).has(panel)) return root;
  if (root.kind === 'tabs') {
    return { ...root, panels: [...root.panels, panel], active: panel };
  }
  return { ...root, a: attachPanel(root.a, panel) };
}

function findLeaf(n: DockNode, id: string): LeafNode | null {
  if (n.kind === 'tabs') return n.id === id ? n : null;
  return findLeaf(n.a, id) ?? findLeaf(n.b, id);
}

function findLeafContaining(n: DockNode, panel: PanelKind): LeafNode | null {
  if (n.kind === 'tabs') return n.panels.includes(panel) ? n : null;
  return findLeafContaining(n.a, panel) ?? findLeafContaining(n.b, panel);
}

/** Move only the old default Sprite authoring tabs; custom dock arrangements stay intact. */
function migrateLegacySpriteAuthoringPanels(root: DockNode): DockNode {
  const inspectorLeaf = findLeafContaining(root, 'inspector');
  const projectLeaf = findLeafContaining(root, 'project');
  const legacyInspectorPanels: PanelKind[] = [
    'inspector',
    'material',
    'shader',
    'spriteEditor',
    'spriteAtlas',
    'build',
    'projectSettings',
  ];
  const legacyBottomPanels: PanelKind[] = ['project', 'console', 'timeline', 'animator'];
  if (
    !inspectorLeaf
    || !projectLeaf
    || inspectorLeaf.id === projectLeaf.id
    || inspectorLeaf.panels.length !== legacyInspectorPanels.length
    || !legacyInspectorPanels.every((panel, index) => inspectorLeaf.panels[index] === panel)
    || projectLeaf.panels.length !== legacyBottomPanels.length
    || !legacyBottomPanels.every((panel, index) => projectLeaf.panels[index] === panel)
  ) return root;

  const migrated = (['spriteEditor', 'spriteAtlas'] as PanelKind[])
    .filter((panel) => inspectorLeaf.panels.includes(panel));
  if (!migrated.length) return root;
  const makeActive = inspectorLeaf.active && migrated.includes(inspectorLeaf.active)
    ? inspectorLeaf.active
    : null;
  let tree = cloneNode(root);
  for (const panel of migrated) tree = stripPanel(tree, panel) ?? tree;
  const target = findLeafContaining(tree, 'project');
  if (!target) return root;
  return mapLeaf(tree, target.id, (leafNode) => ({
    ...leafNode,
    panels: [...leafNode.panels, ...migrated.filter((panel) => !leafNode.panels.includes(panel))],
    active: makeActive ?? leafNode.active,
  })) ?? root;
}

/** Apply drop: center=tab merge; edges=split relative to target leaf */
function applyDrop(
  root: DockNode,
  panel: PanelKind,
  _fromId: string,
  target: DropTarget,
): DockNode {
  const stripped = stripPanel(cloneNode(root), panel);
  // A single remaining panel cannot be split against itself.
  if (!stripped) return root;
  const tree = stripped;

  // If from leaf is also target and only that panel was there, ids may have collapsed —
  // find a leaf that still exists for target
  const targetLeaf = findLeaf(tree, target.leafId);

  if (target.zone === 'center') {
    if (!targetLeaf) {
      // target leaf vanished (dragged last tab onto itself) — put panel back as alone leaf
      return leaf([panel]);
    }
    const next = mapLeaf(tree, target.leafId, (l) => {
      if (l.panels.includes(panel)) return { ...l, active: panel };
      return { ...l, panels: [...l.panels, panel], active: panel };
    });
    return next ?? leaf([panel]);
  }

  const newLeaf = leaf([panel]);

  if (!targetLeaf) {
    // Target gone — attach as sibling of root
    return {
      kind: 'split',
      id: nextId('split'),
      dir: target.zone === 'top' || target.zone === 'bottom' ? 'v' : 'h',
      ratio: 0.5,
      a: target.zone === 'left' || target.zone === 'top' ? newLeaf : tree,
      b: target.zone === 'left' || target.zone === 'top' ? tree : newLeaf,
    };
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

  return splitResult ?? tree;
}

function firstLeafId(n: DockNode): string {
  return n.kind === 'tabs' ? n.id : firstLeafId(n.a);
}

function readDragPayload(dataTransfer: DataTransfer): DragPayload | null {
  try {
    const raw = dataTransfer.getData(DOCK_DRAG_TYPE) || dataTransfer.getData('text/plain');
    const value = JSON.parse(raw) as Partial<DragPayload>;
    if (!CORE_PANEL_IDS.includes(value.panel as PanelKind) || typeof value.fromId !== 'string') {
      return null;
    }
    return { panel: value.panel as PanelKind, fromId: value.fromId };
  } catch {
    return null;
  }
}

function ensureAllPanels(
  root: DockNode,
  preferActive?: PanelKind,
  excluded: ReadonlySet<PanelKind> = new Set(),
): DockNode {
  const seen = collectPanels(root);
  let tree: DockNode = root;
  for (const p of ALL_PANELS) {
    if (seen.has(p) || excluded.has(p)) continue;
    const preferredLeaf = p === 'timeline' || p === 'animator' || p === 'spriteEditor' || p === 'spriteAtlas'
      ? findLeafContaining(tree, 'console')
      : p === 'material' || p === 'shader' || p === 'build' || p === 'projectSettings'
        ? findLeafContaining(tree, 'inspector')
        : null;
    if (preferredLeaf) {
      tree = mapLeaf(tree, preferredLeaf.id, (candidate) => ({
        ...candidate,
        panels: [...candidate.panels, p],
      })) ?? tree;
      seen.add(p);
      continue;
    }
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

function dropTargetAtPoint(clientX: number, clientY: number): DropTarget | null {
  const element = document.elementFromPoint(clientX, clientY);
  const pane = element?.closest<HTMLElement>('[data-dock-leaf-id]');
  if (!pane?.dataset.dockLeafId) return null;
  return {
    leafId: pane.dataset.dockLeafId,
    zone: hitZone(clientX, clientY, pane),
  };
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
  const detached = readDetachedPanels();
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { tree?: DockNode };
      if (data.tree) {
        let tree: DockNode = migrateLegacySpriteAuthoringPanels(reviveIds(data.tree));
        for (const panel of detached) tree = stripPanel(tree, panel) ?? leaf([]);
        return ensureAllPanels(tree, undefined, detached);
      }
    }
  } catch {
    /* ignore */
  }
  let tree = migrateV2() ?? defaultTree();
  for (const panel of detached) tree = stripPanel(tree, panel) ?? leaf([]);
  return ensureAllPanels(tree, undefined, detached);
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
  panelContent: (panel: PanelKind) => ReactNode;
  dirtyPanels: ReadonlySet<PanelKind>;
  dragging: boolean;
  drop: DropTarget | null;
  onActivate: (leafId: string, panel: PanelKind) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDragOver: (target: DropTarget | null) => void;
  onDrop: (target: DropTarget, payload?: DragPayload | null) => void;
  onDetach: (panel: PanelKind, position?: { x: number; y: number }) => void;
}) {
  const { node } = props;
  const active = node.active;
  const [mountedPanels, setMountedPanels] = useState<ReadonlySet<PanelKind>>(
    () => new Set(active ? [active] : []),
  );
  const isDropHere = props.drop?.leafId === node.id;
  const zone = isDropHere ? props.drop!.zone : null;
  const frameRef = useRef<HTMLDivElement>(null);
  const pointerDrag = useRef<{
    pointerId: number;
    panel: PanelKind;
    startX: number;
    startY: number;
    started: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (!active) return;
    setMountedPanels((current) => {
      if (current.has(active)) return current;
      return new Set([...current, active]);
    });
  }, [active]);

  return (
    <div
      className="dock-pane"
      ref={frameRef}
      data-dock-leaf-id={node.id}
      onDragOver={(e) => {
        if (!props.dragging && !Array.from(e.dataTransfer.types).includes(DOCK_DRAG_TYPE)) return;
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
        props.onDrop({ leafId: node.id, zone: z }, readDragPayload(e.dataTransfer));
      }}
    >
      <div className={`dock${isDropHere ? ' dock-drop-target' : ''}`}>
        <div className="dock-tabs">
          {node.panels.map((kind) => {
            const dirty = props.dirtyPanels.has(kind);
            return (
              <button
                key={kind}
                type="button"
                className={`dock-tab dock-tab-drag${active === kind ? ' active' : ''}${dirty ? ' dirty' : ''}`}
                title={dirty
                  ? `Save ${PANEL_TITLE[kind]} before moving or detaching it`
                  : '拖到面板中间=叠页签；拖到边缘=上下左右拆分'}
                onClick={(event) => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    event.preventDefault();
                    return;
                  }
                  props.onActivate(node.id, kind);
                }}
                onPointerDown={(event) => {
                  if (event.button !== 0 || dirty) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  pointerDrag.current = {
                    pointerId: event.pointerId,
                    panel: kind,
                    startX: event.clientX,
                    startY: event.clientY,
                    started: false,
                  };
                }}
                onPointerMove={(event) => {
                  const current = pointerDrag.current;
                  if (!current || current.pointerId !== event.pointerId) return;
                  if (!current.started) {
                    const distance = Math.hypot(
                      event.clientX - current.startX,
                      event.clientY - current.startY,
                    );
                    if (distance < 5) return;
                    current.started = true;
                    suppressClick.current = true;
                    props.onDragStart({ panel: current.panel, fromId: node.id });
                  }
                  event.preventDefault();
                  const outside = event.clientX <= 0
                    || event.clientY <= 0
                    || event.clientX >= window.innerWidth - 1
                    || event.clientY >= window.innerHeight - 1;
                  if (outside) {
                    pointerDrag.current = null;
                    props.onDetach(current.panel, {
                      x: Math.max(0, event.screenX - 40),
                      y: Math.max(0, event.screenY - 16),
                    });
                    return;
                  }
                  props.onDragOver(dropTargetAtPoint(event.clientX, event.clientY));
                }}
                onPointerUp={(event) => {
                  const current = pointerDrag.current;
                  pointerDrag.current = null;
                  if (!current || current.pointerId !== event.pointerId || !current.started) return;
                  event.preventDefault();
                  const target = dropTargetAtPoint(event.clientX, event.clientY);
                  if (target) props.onDrop(target, { panel: current.panel, fromId: node.id });
                  else props.onDragEnd();
                }}
                onPointerCancel={() => {
                  pointerDrag.current = null;
                  props.onDragEnd();
                }}
                onLostPointerCapture={() => {
                  const current = pointerDrag.current;
                  pointerDrag.current = null;
                  if (current?.started) props.onDragEnd();
                }}
              >
                {PANEL_TITLE[kind]}{dirty ? ' *' : ''}
              </button>
            );
          })}
          {active && (
            <button
              type="button"
              className="dock-popout"
              title={props.dirtyPanels.has(active)
                ? `Save ${PANEL_TITLE[active]} before detaching it`
                : `Open ${PANEL_TITLE[active]} as a native window`}
              aria-label={`Detach ${PANEL_TITLE[active]}`}
              disabled={props.dirtyPanels.has(active)}
              onClick={() => props.onDetach(active)}
            >
              ↗
            </button>
          )}
        </div>
        <div className="dock-content">
          {node.panels.map((panel) => {
            if (!dockPanelShouldMount(panel, active, mountedPanels)) return null;
            return (
              <div
                key={panel}
                className={`dock-panel-slot${active === panel ? '' : ' hidden'}`}
                aria-hidden={active !== panel}
              >
                <Suspense fallback={<div className="dock-panel-loading">Loading {PANEL_TITLE[panel]}…</div>}>
                  {props.panelContent(panel)}
                </Suspense>
              </div>
            );
          })}
        </div>
        {props.dragging && <DropOverlay zone={zone} />}
      </div>
    </div>
  );
}

function DockNodeView(props: {
  node: DockNode;
  panelContent: (panel: PanelKind) => ReactNode;
  dirtyPanels: ReadonlySet<PanelKind>;
  dragging: boolean;
  drop: DropTarget | null;
  onActivate: (leafId: string, panel: PanelKind) => void;
  onDragStart: (payload: DragPayload) => void;
  onDragEnd: () => void;
  onDragOver: (target: DropTarget | null) => void;
  onDrop: (target: DropTarget, payload?: DragPayload | null) => void;
  onRatio: (splitId: string, ratio: number) => void;
  onDetach: (panel: PanelKind, position?: { x: number; y: number }) => void;
}) {
  const { node } = props;

  if (node.kind === 'tabs') {
    return (
      <DockLeaf
        node={node}
        panelContent={props.panelContent}
        dirtyPanels={props.dirtyPanels}
        dragging={props.dragging}
        drop={props.drop}
        onActivate={props.onActivate}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onDragOver={props.onDragOver}
        onDrop={props.onDrop}
        onDetach={props.onDetach}
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
  panels: DockPanelContents;
  detachedPanel?: PanelKind | null;
  dirtyPanels?: ReadonlySet<PanelKind>;
}) {
  const boot = useRef(loadTree());
  const [tree, setTree] = useState<DockNode>(boot.current);
  const dragRef = useRef<DragPayload | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [dragging, setDragging] = useState(false);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [externalDragging, setExternalDragging] = useState<PanelKind | null>(null);

  const panelContent = useCallback((panel: PanelKind): ReactNode => {
    if (panel === 'scene' || panel === 'game') {
      return isValidElement(props.panels.viewport)
        ? cloneElement(
            props.panels.viewport as ReactElement<{ tab: 'scene' | 'game' }>,
            { tab: panel },
          )
        : null;
    }
    return props.panels[panel];
  }, [props.panels]);

  const setDropTarget = useCallback((target: DropTarget | null) => {
    dropRef.current = target;
    setDrop(target);
  }, []);

  const cursorInMainWindow = useCallback(async (): Promise<{ x: number; y: number } | null> => {
    if (!isDesktopEditor()) return null;
    const current = getCurrentWindow();
    const [cursor, inner, scale] = await Promise.all([
      cursorPosition(),
      current.innerPosition(),
      current.scaleFactor(),
    ]);
    const x = (cursor.x - inner.x) / scale;
    const y = (cursor.y - inner.y) / scale;
    return x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight
      ? { x, y }
      : null;
  }, []);

  const dockTargetAtCursor = useCallback(async (): Promise<DropTarget | null> => {
    const cursor = await cursorInMainWindow();
    if (!cursor) return null;
    const panes = document.querySelectorAll<HTMLElement>('[data-dock-leaf-id]');
    for (const pane of panes) {
      const rect = pane.getBoundingClientRect();
      if (
        cursor.x >= rect.left
        && cursor.x <= rect.right
        && cursor.y >= rect.top
        && cursor.y <= rect.bottom
      ) {
        return {
          leafId: pane.dataset.dockLeafId!,
          zone: hitZone(cursor.x, cursor.y, pane),
        };
      }
    }
    return null;
  }, [cursorInMainWindow]);

  useEffect(() => {
    if (!props.detachedPanel) saveTree(tree);
  }, [props.detachedPanel, tree]);

  useEffect(() => {
    if (props.detachedPanel) return;
    const resetLayout = () => {
      void closeAllDetachedPanelWindows();
      setTree(defaultTree());
    };
    window.addEventListener(RESET_DOCK_LAYOUT_EVENT, resetLayout);
    return () => window.removeEventListener(RESET_DOCK_LAYOUT_EVENT, resetLayout);
  }, [props.detachedPanel]);

  useEffect(() => {
    const channel = createPanelChannel();
    if (!channel) return;
    if (props.detachedPanel) {
      setDetachedPanelOpen(props.detachedPanel, true);
      channel.postMessage({
        type: 'panel-opened',
        panel: props.detachedPanel,
      } satisfies PanelWindowMessage);
      const onUnload = () => {
        setDetachedPanelOpen(props.detachedPanel!, false);
        channel.postMessage({
          type: 'panel-closed',
          panel: props.detachedPanel!,
        } satisfies PanelWindowMessage);
      };
      window.addEventListener('beforeunload', onUnload);
      return () => {
        window.removeEventListener('beforeunload', onUnload);
        channel.close();
      };
    }
    channel.onmessage = (event: MessageEvent<PanelWindowMessage>) => {
      const message = event.data;
      if (!message || !CORE_PANEL_IDS.includes(message.panel)) return;
      if (message.type === 'panel-opened') {
        setTree((previous) => stripPanel(previous, message.panel) ?? leaf([]));
      } else if (message.type === 'panel-closed') {
        setTree((previous) => attachPanel(previous, message.panel));
      } else if (message.type === 'panel-drag-started') {
        dragRef.current = { panel: message.panel, fromId: '__detached__' };
        setExternalDragging(message.panel);
        setDragging(true);
      } else if (message.type === 'panel-drag-finished') {
        void dockTargetAtCursor().then((target) => {
          const payload = dragRef.current;
          if (!payload || payload.panel !== message.panel || payload.fromId !== '__detached__') return;
          if (target) {
            setTree((previous) => applyDrop(previous, message.panel, payload.fromId, target));
            void closeDetachedPanelWindow(message.panel);
          }
          dragRef.current = null;
          dropRef.current = null;
          setDrop(null);
          setDragging(false);
          setExternalDragging(null);
        });
      } else if (message.type === 'panel-dock-requested') {
        setTree((previous) => applyDrop(
          previous,
          message.panel,
          '__detached__',
          { leafId: firstLeafId(previous), zone: 'center' },
        ));
        dragRef.current = null;
        dropRef.current = null;
        setDrop(null);
        setDragging(false);
        setExternalDragging(null);
        void closeDetachedPanelWindow(message.panel);
      }
    };
    void reconcileDetachedPanels().then((stale) => {
      if (stale.length) {
        setTree((previous) => stale.reduce(attachPanel, previous));
      }
    });
    return () => channel.close();
  }, [dockTargetAtCursor, props.detachedPanel]);

  useEffect(() => {
    if (!externalDragging || props.detachedPanel) return;
    let cancelled = false;
    let timer: number | null = null;
    const sample = async () => {
      const target = await dockTargetAtCursor();
      if (cancelled) return;
      setDropTarget(target);
      timer = window.setTimeout(() => void sample(), 40);
    };
    void sample();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [dockTargetAtCursor, externalDragging, props.detachedPanel, setDropTarget]);

  useEffect(() => {
    if (!dragging || externalDragging || props.detachedPanel) return;

    const clearInternalDrag = () => {
      dragRef.current = null;
      dropRef.current = null;
      setDragging(false);
      setDrop(null);
    };
    const finishInternalDrag = () => {
      // DockLeaf handles the normal path first. This window-level fallback
      // covers pointer capture loss at WebView/window boundaries.
      window.setTimeout(() => {
        const payload = dragRef.current;
        const target = dropRef.current;
        if (payload && target) {
          setTree((previous) => applyDrop(
            previous,
            payload.panel,
            payload.fromId,
            target,
          ));
        }
        clearInternalDrag();
      }, 0);
    };

    window.addEventListener('pointerup', finishInternalDrag);
    window.addEventListener('pointercancel', clearInternalDrag);
    window.addEventListener('blur', clearInternalDrag);
    return () => {
      window.removeEventListener('pointerup', finishInternalDrag);
      window.removeEventListener('pointercancel', clearInternalDrag);
      window.removeEventListener('blur', clearInternalDrag);
    };
  }, [dragging, externalDragging, props.detachedPanel]);

  useEffect(() => {
    const onFocus = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as PanelKind | undefined;
      if (!detail || !CORE_PANEL_IDS.includes(detail)) return;
      if (readDetachedPanels().has(detail)) {
        void detachPanelWindow(detail);
        return;
      }
      setTree((prev) => {
        const tree = collectPanels(prev).has(detail) ? prev : attachPanel(prev, detail);
        const walk = (n: DockNode): DockNode => {
          if (n.kind === 'tabs') {
            if (n.panels.includes(detail)) return { ...n, active: detail };
            return n;
          }
          return { ...n, a: walk(n.a), b: walk(n.b) };
        };
        return walk(tree);
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
    dropRef.current = null;
    setDragging(false);
    setDrop(null);
    setExternalDragging(null);
  };

  const detach = async (
    panel: PanelKind,
    position?: { x: number; y: number },
  ) => {
    if (props.dirtyPanels?.has(panel)) {
      endDrag();
      return;
    }
    const opened = await detachPanelWindow(panel, position);
    if (opened) {
      setTree((previous) => stripPanel(previous, panel) ?? leaf([]));
    }
    endDrag();
  };

  const onDrop = (target: DropTarget, transferred?: DragPayload | null) => {
    const payload = transferred ?? dragRef.current;
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

  if (props.detachedPanel) {
    const detachedDirty = props.dirtyPanels?.has(props.detachedPanel) ?? false;
    return (
      <div className="dock-workspace detached-panel-workspace">
        <div className="detached-dock-header">
          <button
            type="button"
            className="detached-dock-drag"
            title={detachedDirty
              ? `Save ${PANEL_TITLE[props.detachedPanel]} before moving it`
              : '拖回主窗口中的目标区域即可重新停靠'}
            disabled={detachedDirty}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              void dragDetachedPanelWindow(props.detachedPanel!);
            }}
          >
            <span className="detached-dock-tab">{PANEL_TITLE[props.detachedPanel]}</span>
          </button>
          <div className="detached-dock-controls">
            <button
              type="button"
              className="detached-dock-return"
              title={detachedDirty
                ? `Save ${PANEL_TITLE[props.detachedPanel]} before docking it`
                : '停靠回主窗口'}
              aria-label="停靠回主窗口"
              disabled={detachedDirty}
              onClick={() => requestPanelDock(props.detachedPanel!)}
            >
              ↙
            </button>
            <button
              type="button"
              className="detached-dock-maximize"
              title="最大化 / 还原"
              aria-label="最大化或还原"
              onClick={() => {
                if (isDesktopEditor()) void getCurrentWindow().toggleMaximize();
              }}
            >
              □
            </button>
            <button
              type="button"
              className="detached-dock-close"
              title="关闭"
              aria-label="关闭"
              onClick={() => {
                if (isDesktopEditor()) void getCurrentWindow().close();
                else window.close();
              }}
            >
              ×
            </button>
          </div>
        </div>
        <div className="detached-panel-content">
          <Suspense fallback={<div className="dock-panel-loading">Loading {PANEL_TITLE[props.detachedPanel]}…</div>}>
            {panelContent(props.detachedPanel)}
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className={`dock-workspace${dragging ? ' is-dragging' : ''}`}>
      <DockNodeView
        node={tree}
        panelContent={panelContent}
        dirtyPanels={props.dirtyPanels ?? new Set<PanelKind>()}
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
        onDragOver={setDropTarget}
        onDrop={onDrop}
        onRatio={setRatio}
        onDetach={(panel, position) => void detach(panel, position)}
      />

    </div>
  );
}
