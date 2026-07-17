import type { WorldCommand, WorldSnapshotView } from '@mengine/api';
import {
  createBehaviourRunner,
  getBehaviour,
  invokeBehaviourMethodEdit,
  type TransformData,
} from '@mengine/behaviour';
import type { Vec3, Quat } from './math3d';
import { add, quatAxisAngle, quatMul, quatNormalize } from './math3d';
import {
  createComponentDefaults,
  createParticleEmitter2D,
  createParticleEmitter3D,
  createSpineSkeleton,
  createUiButtonComponents,
  createUiCanvasComponents,
  createUiDropdownComponents,
  createUiImageComponents,
  createUiInputFieldComponents,
  createUiLayoutGroupComponents,
  createUiListViewComponents,
  createUiPanelComponents,
  createUiProgressBarComponents,
  createUiScrollViewComponents,
  createUiSliderComponents,
  createUiTabViewComponents,
  createUiTextComponents,
  createUiToggleComponents,
} from './componentCatalog';
import { readRectTransform } from './ui/rectLayout';
import { applyAnchorsKeepingRect, applyPivotKeepingVisualRect } from './ui/rectTransformModel';
import {
  gameAlignedCanvasSize,
  uiEntityWorldPivot,
  type UiEnt,
} from './ui/uiLayout';
import { planHierarchyMove } from './hierarchyMove';
import { selectedRectRoots } from './rectSelection';
import { planRectResize, type RectResizeHandle } from './rectResize';
import { selectedHierarchyRoots } from './hierarchySelection';
import { restoreSceneSelection } from './selectionRestore';
import {
  captureEditorUndoState,
  restoreEditorUndoState,
  type EditorUndoState,
} from './editorUndo';
import './behaviours';

export type EditorMode = 'edit' | 'play' | 'pause';
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type GameAspect = 'free' | '16:9' | '16:10' | '4:3' | '1:1';
export type GameOrientation = 'landscape' | 'portrait';
export type SelectMode = 'replace' | 'add' | 'toggle' | 'range';

export type { TransformData };

export interface SceneCamera {
  yaw: number;
  pitch: number;
  distance: number;
  pivot: Vec3;
}

export interface EntityRec {
  entity: number;
  name?: string | null;
  parent?: number | null;
  siblingIndex: number;
  active: boolean;
  components: Record<string, unknown>;
}

export interface TreeNode {
  entity: EntityRec;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

interface ClipboardPayload {
  roots: EntityRec[];
  cut: boolean;
}

function normalizeEntity(e: Partial<EntityRec> & { entity: number; components: Record<string, unknown> }): EntityRec {
  return {
    entity: e.entity,
    name: e.name ?? 'GameObject',
    parent: e.parent ?? null,
    siblingIndex: e.siblingIndex ?? 0,
    active: e.active ?? true,
    components: e.components,
  };
}

export function createEditorStore() {
  let nextId = 1;
  let mode: EditorMode = 'edit';
  let gizmo: GizmoMode = 'translate';
  let selectedIds: number[] = [];
  let selectionAnchor: number | null = null;
  let playSpin = 0;
  let editEntities: EntityRec[] = [];
  let playEntities: EntityRec[] | null = null;
  let undoStack: Array<EditorUndoState<EntityRec>> = [];
  let clearColor: [number, number, number, number] = [0.22, 0.24, 0.28, 1];
  let frame = 0;
  let gameAspect: GameAspect = '16:9';
  let gameOrientation: GameOrientation = 'landscape';
  let sceneCamera: SceneCamera = {
    yaw: 35,
    pitch: 25,
    distance: 8,
    pivot: [0, 0.5, 0],
  };
  let gizmoDragging = false;
  let expanded = new Set<number>();
  let clipboard: ClipboardPayload | null = null;
  let renameRequestId: number | null = null;
  const behaviourRunner = createBehaviourRunner();

  const boot = (name: string, components: Record<string, unknown>, siblingIndex: number): EntityRec => {
    const id = nextId++;
    const e = normalizeEntity({ entity: id, name, components, siblingIndex, active: true });
    expanded.add(id);
    return e;
  };

  const buildDefaultScene = () => {
    nextId = 1;
    expanded = new Set();
    editEntities = [
    boot('Main Camera', {
      Transform: { position: [0, 1.5, 4], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      Camera3D: {
        fov_y_degrees: 60,
        near: 0.3,
        far: 50,
        primary: true,
        projection: 'perspective',
        orthographic_size: 5,
        aspect: 16 / 9,
      },
    }, 0),
    boot('Directional Light', {
      Transform: {
        position: [2, 4, 1],
        // Tilted down toward scene (approx -45° around X)
        rotation: [-0.3827, 0, 0, 0.9239],
        scale: [1, 1, 1],
      },
      DirectionalLight: { color: [1, 1, 0.95, 1], intensity: 1 },
    }, 1),
      boot('Cube', {
        Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        MeshRenderer: { mesh: 'cube', material: 'default' },
        AutoRotate: getBehaviour('AutoRotate')?.defaults() ?? {
          axis: [0, 1, 0],
          angle: 90,
          speed: 1,
        },
      }, 2),
    ];
    selectedIds = [editEntities[2].entity];
    selectionAnchor = editEntities[2].entity;
    clearColor = [0.22, 0.24, 0.28, 1];
    gameAspect = '16:9';
    gameOrientation = 'landscape';
    sceneCamera = {
      yaw: 35,
      pitch: 25,
      distance: 8,
      pivot: [0, 0.5, 0],
    };
    mode = 'edit';
    playEntities = null;
    playSpin = 0;
    undoStack = [];
    clipboard = null;
    gizmoDragging = false;
  };

  buildDefaultScene();

  const list = () => (mode === 'edit' ? editEntities : playEntities ?? editEntities);

  const pushUndo = () => {
    if (mode !== 'edit') return;
    undoStack.push(captureEditorUndoState(
      editEntities,
      selectedIds,
      selectionAnchor,
      nextId,
      clearColor,
    ));
    if (undoStack.length > 64) undoStack.shift();
  };

  const find = (id: number) => list().find((e) => e.entity === id);

  const translateSelectedRectRoots = (dx: number, dy: number) => {
    if (mode !== 'edit' || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    if (Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8) return false;
    const roots = selectedRectRoots(editEntities, selectedIds);
    if (!roots.length) return false;
    if (!gizmoDragging) pushUndo();
    for (const id of roots) {
      const entity = find(id);
      if (!entity?.components.RectTransform) continue;
      const rt = readRectTransform(entity.components.RectTransform);
      entity.components.RectTransform = {
        ...rt,
        anchored_position: [
          rt.anchored_position[0] + dx,
          rt.anchored_position[1] + dy,
        ],
      };
    }
    return true;
  };

  const childrenOf = (parent: number | null, source = list()) =>
    source
      .filter((e) => (e.parent ?? null) === parent)
      .sort((a, b) => a.siblingIndex - b.siblingIndex || a.entity - b.entity);

  const isDescendant = (ancestor: number, node: number): boolean => {
    let cur: number | null | undefined = node;
    const guard = new Set<number>();
    while (cur != null) {
      if (cur === ancestor) return true;
      if (guard.has(cur)) break;
      guard.add(cur);
      cur = find(cur)?.parent ?? null;
    }
    return false;
  };

  const collectSubtreeIds = (rootId: number): number[] => {
    const out: number[] = [];
    const walk = (id: number) => {
      out.push(id);
      for (const c of childrenOf(id)) walk(c.entity);
    };
    walk(rootId);
    return out;
  };

  const reindexSiblings = (parent: number | null) => {
    childrenOf(parent).forEach((e, i) => {
      e.siblingIndex = i;
    });
  };

  const nextSiblingIndex = (parent: number | null) => childrenOf(parent).length;

  const primarySelected = () =>
    selectedIds.length ? selectedIds[selectedIds.length - 1] : null;

  const getVisibleFlat = (): TreeNode[] => {
    const out: TreeNode[] = [];
    const walk = (parent: number | null, depth: number) => {
      for (const e of childrenOf(parent)) {
        const kids = childrenOf(e.entity);
        const exp = expanded.has(e.entity);
        out.push({
          entity: e,
          depth,
          hasChildren: kids.length > 0,
          expanded: exp,
        });
        if (exp && kids.length) walk(e.entity, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  };

  const activeInHierarchy = (id: number): boolean => {
    let cur: number | null | undefined = id;
    const guard = new Set<number>();
    while (cur != null) {
      const e = find(cur);
      if (!e || e.active === false) return false;
      if (guard.has(cur)) break;
      guard.add(cur);
      cur = e.parent ?? null;
    }
    return true;
  };

  const selectInternal = (ids: number[], modeSel: SelectMode, clicked?: number) => {
    if (modeSel === 'replace') {
      selectedIds = [...ids];
      selectionAnchor = ids[ids.length - 1] ?? null;
    } else if (modeSel === 'add') {
      const set = new Set(selectedIds);
      for (const id of ids) set.add(id);
      selectedIds = [...set];
      selectionAnchor = ids[ids.length - 1] ?? selectionAnchor;
    } else if (modeSel === 'toggle' && clicked != null) {
      if (selectedIds.includes(clicked)) {
        selectedIds = selectedIds.filter((x) => x !== clicked);
      } else {
        selectedIds = [...selectedIds, clicked];
      }
      selectionAnchor = clicked;
    } else if (modeSel === 'range' && clicked != null) {
      const flat = getVisibleFlat().map((n) => n.entity.entity);
      const anchor = selectionAnchor ?? clicked;
      const a = flat.indexOf(anchor);
      const b = flat.indexOf(clicked);
      if (a < 0 || b < 0) {
        selectedIds = [clicked];
        selectionAnchor = clicked;
      } else {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        selectedIds = flat.slice(lo, hi + 1);
      }
    }
    if (selectedIds.length === 0) selectionAnchor = null;
  };

  const spawnAt = (
    name: string,
    components: Record<string, unknown>,
    parent: number | null,
    withUndo: boolean,
  ) => {
    if (withUndo) pushUndo();
    const id = nextId++;
    const e = normalizeEntity({
      entity: id,
      name,
      parent,
      siblingIndex: nextSiblingIndex(parent),
      active: true,
      components,
    });
    editEntities.push(e);
    expanded.add(id);
    if (parent != null) expanded.add(parent);
    selectedIds = [id];
    selectionAnchor = id;
    return id;
  };

  const ensureUiCanvasInternal = (withUndo: boolean): number => {
    const existing = editEntities.find((e) => e.components.Canvas);
    if (existing) return existing.entity;
    return spawnAt('Canvas', createUiCanvasComponents(), null, withUndo);
  };

  /** Spawn a UI control as one undoable transaction, including implicit Canvas creation. */
  const spawnUiControl = (
    name: string,
    components: Record<string, unknown>,
    requestedParent?: number | null,
  ): number => {
    pushUndo();
    let parent = requestedParent;
    if (parent === undefined) {
      const selected = primarySelected();
      const selectedEntity = selected != null ? find(selected) : null;
      parent = selectedEntity && (selectedEntity.components.Canvas || selectedEntity.components.RectTransform)
        ? selected
        : ensureUiCanvasInternal(false);
    }
    return spawnAt(name, components, parent ?? null, false);
  };

  const getTransform = (entity: number): TransformData | null => {
    const e = find(entity);
    return (e?.components.Transform as TransformData) ?? null;
  };

  const deepCloneSubtree = (rootId: number, newParent: number | null): number => {
    const src = find(rootId);
    if (!src) return -1;
    const idMap = new Map<number, number>();
    const ids = collectSubtreeIds(rootId);

    for (const oldId of ids) {
      idMap.set(oldId, nextId++);
    }

    for (const oldId of ids) {
      const s = find(oldId)!;
      const newId = idMap.get(oldId)!;
      const newPar =
        oldId === rootId
          ? newParent
          : s.parent != null
            ? (idMap.get(s.parent) ?? null)
            : null;
      const name =
        oldId === rootId
          ? `${s.name ?? 'GameObject'} (1)`
          : (s.name ?? 'GameObject');
      editEntities.push(
        normalizeEntity({
          entity: newId,
          name,
          parent: newPar,
          siblingIndex:
            oldId === rootId ? nextSiblingIndex(newParent) : s.siblingIndex,
          active: s.active,
          components: structuredClone(s.components),
        }),
      );
      expanded.add(newId);
    }
    reindexSiblings(newParent);
    return idMap.get(rootId)!;
  };

  const deleteIdsWithSubtree = (roots: number[]) => {
    const toDelete = new Set<number>();
    for (const r of roots) {
      for (const id of collectSubtreeIds(r)) toDelete.add(id);
    }
    const parents = new Set(
      editEntities.filter((e) => toDelete.has(e.entity)).map((e) => e.parent ?? null),
    );
    editEntities = editEntities.filter((e) => !toDelete.has(e.entity));
    for (const p of parents) reindexSiblings(p);
    selectedIds = selectedIds.filter((id) => !toDelete.has(id));
    if (selectionAnchor != null && toDelete.has(selectionAnchor)) {
      selectionAnchor = selectedIds[selectedIds.length - 1] ?? null;
    }
  };

  const snapshotEntities = () =>
    structuredClone(list()).map((e) => ({
      entity: e.entity,
      name: e.name,
      parent: e.parent,
      siblingIndex: e.siblingIndex,
      active: e.active,
      components: e.components,
    }));

  const serializeScene = (sceneName: string, source: EntityRec[]) => JSON.stringify(
    {
      version: 1,
      name: sceneName,
      world: {
        entities: structuredClone(source).map((e) => ({
          entity: e.entity,
          name: e.name,
          parent: e.parent,
          siblingIndex: e.siblingIndex,
          active: e.active,
          components: e.components,
        })),
        frame,
        clearColor,
        selected: primarySelected(),
        selectedIds: [...selectedIds],
      },
      sceneCamera,
      gameAspect,
      gameOrientation,
    },
    null,
    2,
  );

  const applySceneJson = (
    json: string,
    targetMode: EditorMode,
    recordUndo: boolean,
  ) => {
    if (recordUndo) pushUndo();
    behaviourRunner.unmount();
    const data = JSON.parse(json);
    const ents = (data.world?.entities ?? data.entities ?? []) as EntityRec[];
    editEntities = ents.map((e, i) =>
      normalizeEntity({
        ...e,
        siblingIndex: e.siblingIndex ?? i,
        active: e.active ?? true,
      }),
    );
    nextId = Math.max(1, ...editEntities.map((e) => e.entity + 1), 1);
    clearColor = data.world?.clearColor ?? clearColor;
    if (data.sceneCamera) sceneCamera = data.sceneCamera;
    if (data.gameAspect) gameAspect = data.gameAspect;
    if (data.gameOrientation === 'landscape' || data.gameOrientation === 'portrait') {
      gameOrientation = data.gameOrientation;
    }
    expanded = new Set(editEntities.map((e) => e.entity));
    selectedIds = restoreSceneSelection(
      editEntities.map((entity) => entity.entity),
      data.world?.selectedIds,
      data.world?.selected,
    );
    selectionAnchor = selectedIds[selectedIds.length - 1] ?? null;
    playEntities = targetMode === 'edit' ? null : structuredClone(editEntities);
    mode = targetMode;
    playSpin = 0;
  };

  return {
    get mode() {
      return mode;
    },
    get gizmo() {
      return gizmo;
    },
    get selected() {
      return primarySelected();
    },
    get selectedIds() {
      return [...selectedIds];
    },
    get renameRequestId() {
      const id = renameRequestId;
      renameRequestId = null;
      return id;
    },
    get viewAngle() {
      return playSpin;
    },
    get sceneCamera() {
      return { ...sceneCamera, pivot: [...sceneCamera.pivot] as Vec3 };
    },
    get gameAspect() {
      return gameAspect;
    },
    get gameOrientation() {
      return gameOrientation;
    },
    setGameAspect(a: GameAspect) {
      gameAspect = a;
    },
    setGameOrientation(o: GameOrientation) {
      gameOrientation = o;
    },
    setGizmo(m: GizmoMode) {
      gizmo = m;
    },
    setSceneCamera(partial: Partial<SceneCamera>) {
      sceneCamera = {
        ...sceneCamera,
        ...partial,
        pivot: partial.pivot ? ([...partial.pivot] as Vec3) : sceneCamera.pivot,
      };
      sceneCamera.pitch = Math.max(-89, Math.min(89, sceneCamera.pitch));
      sceneCamera.distance = Math.max(0.5, Math.min(200, sceneCamera.distance));
    },
    snapshot(): WorldSnapshotView & { selectedIds: number[] } {
      return {
        entities: snapshotEntities(),
        frame,
        simFrame: frame,
        clearColor,
        selected: primarySelected(),
        selectedIds: [...selectedIds],
      };
    },
    getVisibleFlat,
    activeInHierarchy,
    isExpanded(id: number) {
      return expanded.has(id);
    },
    select(id: number | null) {
      selectedIds = id == null ? [] : [id];
      selectionAnchor = id;
    },
    /** Select entity and expand all ancestors (Unity Ping). */
    revealEntity(id: number) {
      let cur = find(id)?.parent ?? null;
      while (cur != null) {
        expanded.add(cur);
        cur = find(cur)?.parent ?? null;
      }
      selectedIds = [id];
      selectionAnchor = id;
    },
    selectMany(ids: number[], selMode: SelectMode, clicked?: number) {
      selectInternal(ids, selMode, clicked);
    },
    selectClick(id: number, ev: { ctrl: boolean; shift: boolean }) {
      if (ev.shift) selectInternal([], 'range', id);
      else if (ev.ctrl) selectInternal([], 'toggle', id);
      else selectInternal([id], 'replace');
    },
    selectAllVisible() {
      selectedIds = getVisibleFlat().map((n) => n.entity.entity);
      selectionAnchor = selectedIds[selectedIds.length - 1] ?? null;
    },
    selectChildren() {
      const p = primarySelected();
      if (p == null) return;
      selectedIds = childrenOf(p).map((c) => c.entity);
      selectionAnchor = selectedIds[0] ?? p;
    },
    toggleExpand(id: number) {
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
    },
    expand(id: number) {
      expanded.add(id);
    },
    collapse(id: number) {
      expanded.delete(id);
    },
    expandAll() {
      for (const e of editEntities) expanded.add(e.entity);
    },
    collapseAll() {
      expanded.clear();
    },
    requestRename(id?: number) {
      renameRequestId = id ?? primarySelected();
    },
    rename(id: number, name: string) {
      const n = name.trim();
      if (!n) return;
      pushUndo();
      const e = find(id);
      if (e) e.name = n;
    },
    setActive(id: number, activeFlag: boolean) {
      pushUndo();
      const e = find(id);
      if (e) e.active = activeFlag;
    },
    setParent(ids: number[], parent: number | null, atIndex?: number, withUndo = true) {
      const current = list();
      const plan = planHierarchyMove(
        current.map((entity) => ({
          id: entity.entity,
          parent: entity.parent ?? null,
          siblingIndex: entity.siblingIndex,
        })),
        ids,
        parent,
        atIndex,
      );
      if (!plan) return false;

      if (withUndo) pushUndo();
      for (const id of plan.roots) {
        const entity = find(id);
        if (entity) entity.parent = plan.parent;
      }
      plan.destinationOrder.forEach((id, index) => {
        const entity = find(id);
        if (entity) entity.siblingIndex = index;
      });
      for (const oldParent of plan.oldParents) {
        if (oldParent !== parent) reindexSiblings(oldParent);
      }
      if (parent != null) expanded.add(parent);
      return true;
    },
    reorderSibling(id: number, index: number) {
      const e = find(id);
      if (!e) return;
      this.setParent([id], e.parent ?? null, index);
    },
    createEmpty(parent?: number | null) {
      const p = parent === undefined ? null : parent;
      return spawnAt(
        'GameObject',
        { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
        p,
        true,
      );
    },
    /** Extension API: create an arbitrary GameObject from a MenuItem or editor tool. */
    createGameObject(
      name: string,
      components: Record<string, unknown>,
      parent: number | null = null,
    ) {
      return spawnAt(
        name.trim() || 'GameObject',
        structuredClone(components),
        parent,
        true,
      );
    },
    /** Extension API: create a custom UI control and ensure it has a Canvas parent. */
    createUiControl(
      name: string,
      components: Record<string, unknown>,
      parent?: number | null,
    ) {
      return spawnUiControl(
        name.trim() || 'UI Control',
        structuredClone(components),
        parent,
      );
    },
    createEmptyChild() {
      const p = primarySelected();
      return this.createEmpty(p);
    },
    duplicateSelection() {
      if (!selectedIds.length || mode !== 'edit') return null;
      if (!gizmoDragging) pushUndo();
      const roots = selectedHierarchyRoots(editEntities, selectedIds);
      const newIds: number[] = [];
      for (const r of roots) {
        const parent = find(r)?.parent ?? null;
        const nid = deepCloneSubtree(r, parent);
        if (nid >= 0) newIds.push(nid);
      }
      selectedIds = newIds;
      selectionAnchor = newIds[newIds.length - 1] ?? null;
      return primarySelected();
    },
    deleteSelection() {
      if (!selectedIds.length || mode !== 'edit') return;
      pushUndo();
      const roots = selectedHierarchyRoots(editEntities, selectedIds);
      deleteIdsWithSubtree(roots);
    },
    deleteSelected() {
      this.deleteSelection();
    },
    copySelection() {
      const roots = selectedHierarchyRoots(editEntities, selectedIds);
      const payload: EntityRec[] = [];
      for (const r of roots) {
        for (const id of collectSubtreeIds(r)) {
          const e = find(id);
          if (e) payload.push(structuredClone(e));
        }
      }
      clipboard = { roots: payload, cut: false };
    },
    cutSelection() {
      this.copySelection();
      if (clipboard) clipboard.cut = true;
    },
    paste() {
      if (!clipboard || mode !== 'edit') return;
      pushUndo();
      const parent = primarySelected();
      const idMap = new Map<number, number>();
      const oldIds = clipboard.roots.map((e) => e.entity);
      for (const oldId of oldIds) idMap.set(oldId, nextId++);

      const rootOldIds = clipboard.roots
        .filter((e) => e.parent == null || !idMap.has(e.parent) || !oldIds.includes(e.parent))
        .map((e) => e.entity);
      // Fix: roots are those whose parent is not in clipboard set
      const clipSet = new Set(oldIds);
      const actualRoots = clipboard.roots.filter((e) => e.parent == null || !clipSet.has(e.parent));

      for (const s of clipboard.roots) {
        const newId = idMap.get(s.entity)!;
        const isRoot = actualRoots.some((r) => r.entity === s.entity);
        const newPar = isRoot
          ? parent
          : s.parent != null
            ? (idMap.get(s.parent) ?? null)
            : null;
        editEntities.push(
          normalizeEntity({
            entity: newId,
            name: s.name,
            parent: newPar,
            siblingIndex: isRoot ? nextSiblingIndex(parent) : s.siblingIndex,
            active: s.active,
            components: structuredClone(s.components),
          }),
        );
        expanded.add(newId);
      }
      reindexSiblings(parent);
      if (parent != null) expanded.add(parent);

      if (clipboard.cut) {
        deleteIdsWithSubtree(actualRoots.map((r) => r.entity));
        clipboard = null;
      }

      selectedIds = actualRoots.map((r) => idMap.get(r.entity)!);
      selectionAnchor = selectedIds[selectedIds.length - 1] ?? null;
      void rootOldIds;
    },
    navigateVisible(delta: number) {
      const flat = getVisibleFlat().map((n) => n.entity.entity);
      if (!flat.length) return;
      const cur = primarySelected();
      const idx = cur == null ? -1 : flat.indexOf(cur);
      const next = flat[Math.max(0, Math.min(flat.length - 1, (idx < 0 ? 0 : idx) + delta))];
      selectInternal([next], 'replace');
    },
    navigateHorizontal(dir: -1 | 1) {
      const cur = primarySelected();
      if (cur == null) return;
      const e = find(cur);
      if (!e) return;
      if (dir < 0) {
        if (expanded.has(cur) && childrenOf(cur).length) {
          expanded.delete(cur);
        } else if (e.parent != null) {
          selectInternal([e.parent], 'replace');
        }
      } else {
        if (childrenOf(cur).length) {
          if (!expanded.has(cur)) expanded.add(cur);
          else {
            const first = childrenOf(cur)[0];
            if (first) selectInternal([first.entity], 'replace');
          }
        }
      }
    },
    play() {
      playEntities = structuredClone(editEntities);
      mode = 'play';
      playSpin = 0;
      behaviourRunner.mount(playEntities);
    },
    stop() {
      behaviourRunner.unmount();
      playEntities = null;
      mode = 'edit';
      playSpin = 0;
    },
    pause() {
      mode = mode === 'play' ? 'pause' : mode === 'pause' ? 'play' : mode;
    },
    undo() {
      const prev = undoStack.pop();
      if (prev) {
        const restored = restoreEditorUndoState(prev);
        editEntities = restored.entities.map((entity) => normalizeEntity(entity));
        selectedIds = restored.selectedIds;
        selectionAnchor = restored.selectionAnchor;
        nextId = restored.nextId;
        clearColor = restored.clearColor;
      }
    },
    tick(dt: number) {
      frame++;
      if (mode !== 'play') return;
      playSpin += dt;
      const src = playEntities ?? editEntities;
      behaviourRunner.tick(src, dt);
    },
    addComponent(entity: number, type: string, value: Record<string, unknown>) {
      if (mode !== 'edit') return false;
      const e = find(entity);
      if (!e) return false;
      if (e.components[type] != null) return false;
      const entry = getBehaviour(type);
      pushUndo();
      e.components[type] = value;
      // RequireComponent: auto-add missing deps
      if (entry?.requires?.length) {
        for (const dep of entry.requires) {
          if (e.components[dep] != null) continue;
          const defaults = createComponentDefaults(dep);
          if (defaults) e.components[dep] = defaults;
        }
      }
      return true;
    },
    removeComponent(entity: number, type: string) {
      if (mode !== 'edit') return false;
      if (type === 'Transform') return false;
      const e = find(entity);
      if (!e || e.components[type] == null) return false;
      pushUndo();
      delete e.components[type];
      return true;
    },
    setComponent(entity: number, type: string, value: Record<string, unknown>) {
      const e = find(entity);
      if (!e) return;
      if (mode === 'edit' && !gizmoDragging) pushUndo();
      e.components[type] = value;
    },
    patchComponent(entity: number, type: string, patch: Record<string, unknown>) {
      const e = find(entity);
      if (!e || e.components[type] == null) return;
      if (mode === 'edit' && !gizmoDragging) pushUndo();
      e.components[type] = { ...(e.components[type] as object), ...patch };
    },
    invokeBehaviourMethod(entity: number, type: string, method: string) {
      const e = find(entity);
      if (!e) return;
      const data = (e.components[type] as Record<string, unknown>) ?? {};
      if (mode === 'play' || mode === 'pause') {
        const src = playEntities ?? editEntities;
        const next = behaviourRunner.invoke(entity, type, method, src);
        if (next) e.components[type] = next;
        return;
      }
      const next = invokeBehaviourMethodEdit(type, data, method);
      if (next) {
        pushUndo();
        e.components[type] = next;
      }
    },
    applyCommands(cmds: WorldCommand[]) {
      pushUndo();
      for (const cmd of cmds) {
        if (cmd.op === 'spawn') {
          spawnAt(
            cmd.name ?? 'GameObject',
            { ...cmd.components },
            null,
            false,
          );
        } else if (cmd.op === 'setComponent') {
          const e = editEntities.find((x) => x.entity === cmd.entity);
          if (e) e.components[cmd.component] = cmd.value;
        } else if (cmd.op === 'despawn') {
          deleteIdsWithSubtree([cmd.entity]);
        } else if (cmd.op === 'setParent') {
          this.setParent([cmd.entity], cmd.parent ?? null, undefined, false);
        } else if (cmd.op === 'setClearColor') {
          clearColor = [cmd.r, cmd.g, cmd.b, cmd.a];
        }
      }
    },
    setTransform(entity: number, transform: TransformData) {
      this.setTransforms([{ entity, transform }]);
    },
    setTransforms(updates: Array<{ entity: number; transform: TransformData }>) {
      const applicable = updates.filter((update) => find(update.entity)?.components.Transform != null);
      if (!applicable.length) return false;
      if (mode === 'edit' && !gizmoDragging) pushUndo();
      for (const update of applicable) {
        const entity = find(update.entity);
        if (entity) entity.components.Transform = structuredClone(update.transform);
      }
      return true;
    },
    setComponents(
      type: string,
      updates: Array<{ entity: number; value: Record<string, unknown> }>,
    ) {
      const applicable = updates.filter((update) => find(update.entity)?.components[type] != null);
      if (!applicable.length) return false;
      if (mode === 'edit' && !gizmoDragging) pushUndo();
      for (const update of applicable) {
        const entity = find(update.entity);
        if (entity) entity.components[type] = structuredClone(update.value);
      }
      return true;
    },
    beginTransformGesture() {
      if (!gizmoDragging) {
        pushUndo();
        gizmoDragging = true;
      }
    },
    endTransformGesture() {
      gizmoDragging = false;
    },
    applyTransformDelta(
      entity: number,
      kind: GizmoMode,
      axis: 'x' | 'y' | 'z',
      amount: number,
    ) {
      const e = find(entity);
      if (!e) return;
      const src = e.components.Transform as TransformData;
      const t: TransformData = {
        position: [...src.position] as TransformData['position'],
        rotation: [...src.rotation] as TransformData['rotation'],
        scale: [...src.scale] as TransformData['scale'],
      };
      const i = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      if (kind === 'translate') t.position[i] += amount;
      else if (kind === 'scale') t.scale[i] = Math.max(0.01, t.scale[i] + amount);
      else {
        // amount = degrees；本地轴（与 Transform 本地 XYZ / 移动箭头一致）
        // Z 与 transformBasis.forward 同向 → 本地 (0,0,-1)
        const local: Vec3 =
          axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, -1];
        const delta = quatAxisAngle(local, amount);
        t.rotation = quatNormalize(
          quatMul(t.rotation as Quat, delta),
        ) as TransformData['rotation'];
      }
      e.components.Transform = t;
    },
    rotateByWorldAxis(entity: number, axis: Vec3, degrees: number) {
      const e = find(entity);
      if (!e || !Number.isFinite(degrees) || Math.abs(degrees) < 1e-8) return;
      const src = e.components.Transform as TransformData;
      const delta = quatAxisAngle(axis, degrees);
      // world-space: delta * current
      e.components.Transform = {
        ...src,
        rotation: quatNormalize(
          quatMul(delta, src.rotation as Quat),
        ) as TransformData['rotation'],
      };
    },
    translateBy(entity: number, delta: Vec3) {
      const e = find(entity);
      if (!e) return;
      const t = e.components.Transform as TransformData;
      e.components.Transform = {
        ...t,
        position: add(t.position, delta) as TransformData['position'],
      };
    },
    /** Screen-space UI move → anchored_position (delta already in layout units). */
    translateRectBy(entity: number, dx: number, dy: number) {
      const e = find(entity);
      if (!e?.components.RectTransform) return;
      const rt = readRectTransform(e.components.RectTransform);
      e.components.RectTransform = {
        ...rt,
        anchored_position: [
          rt.anchored_position[0] + dx,
          rt.anchored_position[1] + dy,
        ],
      };
    },
    setRectPivot(
      entity: number,
      pivot: [number, number],
      parentSize: [number, number],
    ) {
      const e = find(entity);
      if (!e?.components.RectTransform) return;
      const rt = readRectTransform(e.components.RectTransform);
      e.components.RectTransform = applyPivotKeepingVisualRect(rt, pivot, parentSize);
    },
    setRectAnchors(
      entity: number,
      anchorMin: [number, number],
      anchorMax: [number, number],
      parentSize: [number, number],
    ) {
      const e = find(entity);
      if (!e?.components.RectTransform) return;
      const rt = readRectTransform(e.components.RectTransform);
      e.components.RectTransform = applyAnchorsKeepingRect(
        rt,
        anchorMin,
        anchorMax,
        parentSize,
      );
    },
    translateSelectedRectsBy(dx: number, dy: number) {
      return translateSelectedRectRoots(dx, dy);
    },
    nudgeSelectedRects(dx: number, dy: number) {
      return translateSelectedRectRoots(dx, dy);
    },
    applySelectedRectDeltas(deltas: Array<{ entity: number; dx: number; dy: number }>) {
      if (mode !== 'edit') return false;
      const roots = new Set(selectedRectRoots(editEntities, selectedIds));
      const applicable = deltas.filter((delta) =>
        roots.has(delta.entity) &&
        Number.isFinite(delta.dx) &&
        Number.isFinite(delta.dy) &&
        (Math.abs(delta.dx) >= 1e-8 || Math.abs(delta.dy) >= 1e-8),
      );
      if (!applicable.length) return false;
      pushUndo();
      for (const delta of applicable) {
        const entity = find(delta.entity);
        if (!entity?.components.RectTransform) continue;
        const rt = readRectTransform(entity.components.RectTransform);
        entity.components.RectTransform = {
          ...rt,
          anchored_position: [
            rt.anchored_position[0] + delta.dx,
            rt.anchored_position[1] + delta.dy,
          ],
        };
      }
      return true;
    },
    rotateRectBy(entity: number, degrees: number) {
      const e = find(entity);
      if (!e?.components.RectTransform || !Number.isFinite(degrees)) return;
      const rt = readRectTransform(e.components.RectTransform);
      e.components.RectTransform = {
        ...rt,
        local_rotation: rt.local_rotation + degrees,
      };
    },
    scaleRectBy(entity: number, axis: 'x' | 'y' | 'both', amount: number) {
      const e = find(entity);
      if (!e?.components.RectTransform) return;
      const rt = readRectTransform(e.components.RectTransform);
      const sx = rt.local_scale[0];
      const sy = rt.local_scale[1];
      const next: [number, number] = [
        axis === 'y' ? sx : Math.max(0.01, sx + amount),
        axis === 'x' ? sy : Math.max(0.01, sy + amount),
      ];
      e.components.RectTransform = { ...rt, local_scale: next };
    },
    /**
     * Unity Rect size handles → size_delta + anchored_position.
     * dLocalX/Y: 布局像素，沿 UI 局部轴（X+ 右，Y+ 下）。
     * 对边固定：pivot≠角点时轴心会跟着动（与 Unity 一致）。
     *
     * 注意：width = size_delta.x * |local_scale.x|，而 anchored_position
     * 不乘 local_scale，故 Δap 不能再除以 scale。
     */
    resizeRectBy(
      entity: number,
      handle: RectResizeHandle,
      dLocalX: number,
      dLocalY: number,
    ) {
      const e = find(entity);
      if (!e?.components.RectTransform) return;
      const rt = readRectTransform(e.components.RectTransform);
      const plan = planRectResize(
        handle,
        rt.pivot,
        rt.local_scale,
        rt.local_rotation,
        dLocalX,
        dLocalY,
      );

      e.components.RectTransform = {
        ...rt,
        size_delta: [
          rt.size_delta[0] + plan.sizeDelta[0],
          rt.size_delta[1] + plan.sizeDelta[1],
        ],
        anchored_position: [
          rt.anchored_position[0] + plan.positionDelta[0],
          rt.anchored_position[1] + plan.positionDelta[1],
        ],
      };
    },
    getTransform,
    frameSelected() {
      const id = primarySelected();
      if (id == null) return;
      const t = getTransform(id);
      if (t) {
        sceneCamera.pivot = [...t.position] as Vec3;
        sceneCamera.distance = Math.max(3, Math.max(...t.scale, 1) * 4);
        return;
      }
      // UI RectTransform → Overlay world plane（与 Game 横竖屏对齐）
      const e = find(id);
      let canvasSize: { w: number; h: number } | undefined;
      if (e) {
        let walk: EntityRec | undefined = e;
        while (walk) {
          if (walk.components.Canvas) {
            const ASPECTS: Record<string, number> = {
              '16:9': 16 / 9,
              '16:10': 16 / 10,
              '4:3': 4 / 3,
              '1:1': 1,
            };
            let ratio: number | null = null;
            const effective =
              gameAspect === 'free' && gameOrientation === 'portrait' ? '16:9' : gameAspect;
            if (effective !== 'free') {
              ratio = ASPECTS[effective] ?? null;
              if (ratio != null && gameOrientation === 'portrait' && effective !== '1:1') {
                ratio = 1 / ratio;
              }
            }
            canvasSize = gameAlignedCanvasSize(walk.components.CanvasScaler, ratio);
            break;
          }
          const pid: number | null = walk.parent ?? null;
          walk = pid != null ? find(pid) ?? undefined : undefined;
        }
      }
      const ui = uiEntityWorldPivot(list() as UiEnt[], id, canvasSize);
      if (ui) {
        sceneCamera.pivot = [...ui.position] as Vec3;
        sceneCamera.distance = Math.max(2, ui.size * 2.5);
      }
    },
    spawnPrefab(name: string) {
      if (name === 'Camera') {
        this.spawnCamera();
        return;
      }
      if (name === 'Empty') {
        this.spawnEmpty();
        return;
      }
      if (name === 'Canvas') {
        this.spawnUiCanvas();
        return;
      }
      if (name === 'Image') {
        this.spawnUiImage();
        return;
      }
      if (name === 'Button') {
        this.spawnUiButton();
        return;
      }
      if (name === 'Text') {
        this.spawnUiText();
        return;
      }
      if (name === 'Toggle') {
        this.spawnUiToggle();
        return;
      }
      if (name === 'Slider') {
        this.spawnUiSlider();
        return;
      }
      if (name === 'Panel') {
        this.spawnUiPanel();
        return;
      }
      if (name === 'Layout Group') {
        this.spawnUiLayoutGroup();
        return;
      }
      if (name === 'Progress Bar') {
        this.spawnUiProgressBar();
        return;
      }
      if (name === 'Input Field') {
        this.spawnUiInputField();
        return;
      }
      if (name === 'Dropdown') {
        this.spawnUiDropdown();
        return;
      }
      if (name === 'List View') {
        this.spawnUiListView();
        return;
      }
      if (name === 'Scroll View') {
        this.spawnUiScrollView();
        return;
      }
      if (name === 'Tab View') {
        this.spawnUiTabView();
        return;
      }
      if (name === 'Sprite') {
        this.spawnSpriteQuad();
        return;
      }
      spawnAt(
        name,
        {
          Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          MeshRenderer: { mesh: 'cube', material: 'default' },
        },
        null,
        true,
      );
    },
    spawnEmpty() {
      this.createEmpty(null);
    },
    spawnCamera() {
      spawnAt(
        'Camera',
        {
          Transform: { position: [0, 1, -4], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          Camera3D: {
            fov_y_degrees: 60,
            near: 0.3,
            far: 50,
            primary: false,
            projection: 'perspective',
            orthographic_size: 5,
            aspect: 16 / 9,
          },
        },
        null,
        true,
      );
    },
    spawnDirectionalLight() {
      spawnAt(
        'Directional Light',
        {
          Transform: {
            position: [0, 3, 0],
            rotation: [-0.3827, 0, 0, 0.9239],
            scale: [1, 1, 1],
          },
          DirectionalLight: { color: [1, 1, 0.95, 1], intensity: 1 },
        },
        null,
        true,
      );
    },
    spawnPointLight() {
      spawnAt(
        'Point Light',
        {
          Transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          PointLight: { color: [1, 0.82, 0.65, 1], intensity: 8, range: 10 },
        },
        null,
        true,
      );
    },
    spawnSpotLight() {
      spawnAt(
        'Spot Light',
        {
          Transform: {
            position: [0, 3, 1],
            rotation: [-0.7071, 0, 0, 0.7071],
            scale: [1, 1, 1],
          },
          SpotLight: {
            color: [0.7, 0.82, 1, 1],
            intensity: 12,
            range: 12,
            inner_angle_degrees: 25,
            outer_angle_degrees: 40,
          },
        },
        null,
        true,
      );
    },
    /** Ensure a Canvas exists; return its entity id. */
    ensureUiCanvas(): number {
      return ensureUiCanvasInternal(true);
    },
    spawnUiCanvas() {
      return spawnAt('Canvas', createUiCanvasComponents(), null, true);
    },
    spawnUiImage(parent?: number | null) {
      return spawnUiControl('Image', createUiImageComponents([1, 1, 1, 0.92]), parent);
    },
    spawnUiButton(parent?: number | null) {
      return spawnUiControl('Button', createUiButtonComponents(), parent);
    },
    spawnUiText(parent?: number | null) {
      return spawnUiControl('Text', createUiTextComponents(), parent);
    },
    spawnUiToggle(parent?: number | null) {
      return spawnUiControl('Toggle', createUiToggleComponents(), parent);
    },
    spawnUiSlider(parent?: number | null) {
      return spawnUiControl('Slider', createUiSliderComponents(), parent);
    },
    spawnUiPanel(parent?: number | null) {
      return spawnUiControl('Panel', createUiPanelComponents(), parent);
    },
    spawnUiLayoutGroup(parent?: number | null) {
      return spawnUiControl('Layout Group', createUiLayoutGroupComponents(), parent);
    },
    spawnUiProgressBar(parent?: number | null) {
      return spawnUiControl('Progress Bar', createUiProgressBarComponents(), parent);
    },
    spawnUiInputField(parent?: number | null) {
      return spawnUiControl('Input Field', createUiInputFieldComponents(), parent);
    },
    spawnUiDropdown(parent?: number | null) {
      return spawnUiControl('Dropdown', createUiDropdownComponents(), parent);
    },
    spawnUiListView(parent?: number | null) {
      return spawnUiControl('List View', createUiListViewComponents(), parent);
    },
    spawnUiScrollView(parent?: number | null) {
      return spawnUiControl('Scroll View', createUiScrollViewComponents(), parent);
    },
    spawnUiTabView(parent?: number | null) {
      return spawnUiControl('Tab View', createUiTabViewComponents(), parent);
    },
    spawnSpriteQuad() {
      spawnAt(
        'Sprite',
        {
          Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          SpriteRenderer: {
            sprite: 'white',
            color: [0.4, 0.75, 1, 1],
            size: [1, 1],
            sorting_order: 0,
          },
        },
        null,
        true,
      );
    },
    spawnParticleEmitter2D() {
      spawnAt(
        'Particle System 2D',
        {
          Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          ParticleEmitter2D: createParticleEmitter2D(),
        },
        null,
        true,
      );
    },
    spawnParticleEmitter3D() {
      spawnAt(
        'Particle System 3D',
        {
          Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          ParticleEmitter3D: createParticleEmitter3D(),
        },
        null,
        true,
      );
    },
    spawnSpineSkeleton() {
      spawnAt(
        'Spine Skeleton',
        {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          SpineSkeleton: createSpineSkeleton(),
        },
        null,
        true,
      );
    },
    spawnCubeChild() {
      const p = primarySelected();
      spawnAt(
        'Cube',
        {
          Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          MeshRenderer: { mesh: 'cube', material: 'default' },
        },
        p,
        true,
      );
    },
    saveSceneJson(sceneName = 'Untitled') {
      // Always persist edit state so Play mode clones never overwrite authoring data.
      return serializeScene(sceneName, editEntities);
    },
    /** Session-only serialization used to mirror live Play state to detached windows. */
    saveSessionSceneJson(sceneName = 'Untitled') {
      return serializeScene(sceneName, list());
    },
    newScene() {
      buildDefaultScene();
    },
    loadSceneJson(json: string) {
      applySceneJson(json, 'edit', true);
    },
    loadRemoteSceneJson(json: string, remoteMode: EditorMode) {
      applySceneJson(json, remoteMode, false);
    },
  };
}

export type EditorStore = ReturnType<typeof createEditorStore>;
