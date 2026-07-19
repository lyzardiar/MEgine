import type { WorldCommand, WorldSnapshotView } from '@mengine/api';
import {
  createBehaviourRunner,
  getBehaviour,
  invokeBehaviourMethodEdit,
  type TransformData,
} from '@mengine/behaviour';
import type { Vec3, Quat } from './math3d';
import {
  add,
  quatAxisAngle,
  quatMul,
  quatNormalize,
} from './math3d';
import {
  componentRequirements,
  createComponentDefaults,
  createParticleEmitter2D,
  createParticleEmitter3D,
  createSpineSkeleton,
  createUiButtonComponents,
  createUiCanvasComponents,
  createUiDropdownComponents,
  createUiImageComponents,
  createUiRawImageComponents,
  createUiInputFieldComponents,
  createUiLayoutGroupComponents,
  createUiListViewComponents,
  createUiPanelComponents,
  createUiProgressBarComponents,
  createUiScrollViewComponents,
  createUiScrollbarComponents,
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
import {
  planRectResize,
  type RectResizeHandle,
  type RectResizeOptions,
} from './rectResize';
import { selectedHierarchyRoots } from './hierarchySelection';
import { planToggleGroupChange } from './ui/toggleGroup';
import { restoreSceneSelection } from './selectionRestore';
import {
  captureEditorUndoState,
  editorUndoStatesEqual,
  restoreEditorUndoState,
  type EditorUndoState,
} from './editorUndo';
import {
  createEditorUndoService,
  type EditorUndoCheckpoint,
  type EditorUndoService,
  type EditorUndoToken,
} from './editorUndoService';
import { sceneContentFingerprint } from './sceneFingerprint';
import type { GizmoMode } from './editorTool';
import {
  rotateTransformAround,
  scaleTransformAlong,
  selectedTransformRoots,
} from './transformSelection';
import { applyAnimationPreview, type AnimationPreviewSample } from './animationPreview';
import { assignMaterialToComponents } from './materialAssignment';
import {
  PREFAB_LINK_COMPONENT,
  clonePrefabLinkedComponents,
  createPrefabId,
  findPrefabInstance,
  flattenPrefabNodes,
  readPrefabLink,
  type PrefabAsset,
} from './prefabAsset';
import {
  buildWorldTransforms,
  parentWorldTransform,
  resolvedTransform,
  worldDeltaToLocal,
  worldAxisScaleDeltaToLocal,
  worldPointToLocal,
  worldRotationToLocal,
  worldTransformToLocal,
} from './worldTransform';
import { createGridComponent, createTilemapComponent } from './tilemapModel';
import { createEnvironmentLightComponent } from './environmentLightModel';
import {
  createSpriteSpawnComponents,
  type SpriteSpawnOptions,
} from './spriteCreation';
import { frameWorldSprite } from './sceneFraming';
import { resetTimelineBindingsOnAssetChange } from './timelineBindings';
import {
  ENTITY_REFERENCE_FIELDS_KEY,
  remapComponentEntityReferences,
  resolvePrefabEntityReferences,
} from './entityReferences';
import './behaviours';
import {
  gameResolutionAspect,
  legacyGameResolution,
  normalizeGameResolution,
  type GameResolution,
} from './gameResolution';

export type EditorMode = 'edit' | 'play' | 'pause';
export type { GizmoMode };
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

export function createEditorStore(undoService: EditorUndoService = createEditorUndoService()) {
  let nextId = 1;
  let mode: EditorMode = 'edit';
  let gizmo: GizmoMode = 'translate';
  let selectedIds: number[] = [];
  let selectionAnchor: number | null = null;
  let playSpin = 0;
  let editEntities: EntityRec[] = [];
  let playEntities: EntityRec[] | null = null;
  let clearColor: [number, number, number, number] = [0.22, 0.24, 0.28, 1];
  let frame = 0;
  let gameResolution: GameResolution | null = { width: 1920, height: 1080 };
  let sceneCamera: SceneCamera = {
    yaw: 35,
    pitch: 25,
    distance: 8,
    pivot: [0, 0.5, 0],
  };
  let gizmoDragging = false;
  let editGestureDepth = 0;
  let gestureUndoState: EditorUndoState<EntityRec> | null = null;
  let gestureUndoToken: EditorUndoToken | null = null;
  let gestureHistoryCheckpoint: EditorUndoCheckpoint | null = null;
  let expanded = new Set<number>();
  let clipboard: ClipboardPayload | null = null;
  let renameRequestId: number | null = null;
  let animationPreview: { root: number; samples: AnimationPreviewSample[] } | null = null;
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
      AudioListener: { primary: true },
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
        BoxCollider3D: { size: [1, 1, 1], center: [0, 0, 0], is_trigger: false, friction: 0.5, restitution: 0 },
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
    gameResolution = { width: 1920, height: 1080 };
    sceneCamera = {
      yaw: 35,
      pitch: 25,
      distance: 8,
      pivot: [0, 0.5, 0],
    };
    mode = 'edit';
    playEntities = null;
    playSpin = 0;
    undoService.clear('scene');
    clipboard = null;
    gizmoDragging = false;
    editGestureDepth = 0;
    gestureUndoState = null;
    gestureUndoToken = null;
    gestureHistoryCheckpoint = null;
    animationPreview = null;
  };

  buildDefaultScene();

  const list = () => (mode === 'edit' ? editEntities : playEntities ?? editEntities);

  const captureUndoState = () => captureEditorUndoState(
    editEntities,
    selectedIds,
    selectionAnchor,
    nextId,
    clearColor,
  );

  const pushUndo = (label = 'Scene Change') => {
    if (mode !== 'edit') return null;
    const state = captureUndoState();
    return undoService.recordSnapshot({
      scope: 'scene',
      label,
      state,
      capture: captureUndoState,
      restore: restoreUndoSnapshot,
    });
  };

  const restoreUndoSnapshot = (state: EditorUndoState<EntityRec>) => {
    const restored = restoreEditorUndoState(state);
    editEntities = restored.entities.map((entity) => normalizeEntity(entity));
    selectedIds = restored.selectedIds;
    selectionAnchor = restored.selectionAnchor;
    nextId = restored.nextId;
    clearColor = restored.clearColor;
  };

  const find = (id: number) => list().find((e) => e.entity === id);

  const translateSelectedRectRoots = (dx: number, dy: number) => {
    if (mode !== 'edit' || !Number.isFinite(dx) || !Number.isFinite(dy)) return false;
    if (Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8) return false;
    const roots = selectedRectRoots(editEntities, selectedIds);
    if (!roots.length) return false;
    if (!gizmoDragging) pushUndo('Move UI Selection');
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

  const withEntityReferenceMetadata = (
    type: string,
    value: Record<string, unknown>,
  ): Record<string, unknown> => {
    const fields = getBehaviour(type)?.fields
      .filter((field) => field.serialize && field.type === 'entity')
      .map((field) => field.key) ?? [];
    if (!fields.length) return value;
    const existing = Array.isArray(value[ENTITY_REFERENCE_FIELDS_KEY])
      ? value[ENTITY_REFERENCE_FIELDS_KEY]
        .filter((field): field is string => typeof field === 'string' && field.length > 0)
      : [];
    return {
      ...value,
      [ENTITY_REFERENCE_FIELDS_KEY]: [...new Set([...existing, ...fields])],
    };
  };

  const withAllEntityReferenceMetadata = (
    source: Record<string, unknown>,
  ): Record<string, unknown> => Object.fromEntries(
    Object.entries(source).map(([type, value]) => [
      type,
      value != null && typeof value === 'object' && !Array.isArray(value)
        ? withEntityReferenceMetadata(type, value as Record<string, unknown>)
        : value,
    ]),
  );

  const spawnAt = (
    name: string,
    components: Record<string, unknown>,
    parent: number | null,
    withUndo: boolean,
  ) => {
    if (withUndo) pushUndo(`Create ${name}`);
    const id = nextId++;
    const e = normalizeEntity({
      entity: id,
      name,
      parent,
      siblingIndex: nextSiblingIndex(parent),
      active: true,
      components: withAllEntityReferenceMetadata(components),
    });
    editEntities.push(e);
    expanded.add(id);
    if (parent != null) expanded.add(parent);
    selectedIds = [id];
    selectionAnchor = id;
    return id;
  };

  const setSiblingPosition = (id: number, parent: number | null, index: number) => {
    const ordered = childrenOf(parent).filter((entity) => entity.entity !== id);
    ordered.splice(Math.max(0, Math.min(index, ordered.length)), 0, find(id)!);
    ordered.forEach((entity, siblingIndex) => {
      entity.siblingIndex = siblingIndex;
    });
  };

  const instantiatePrefabInternal = (
    source: string,
    prefab: PrefabAsset,
    parent: number | null,
    withUndo: boolean,
    atIndex?: number,
    instanceId = createPrefabId('instance'),
  ): number => {
    if (withUndo) pushUndo('Instantiate Prefab');
    const nodes = flattenPrefabNodes(prefab);
    const entitiesByNode = new Map<string, number>();
    let root = -1;
    for (const entry of nodes) {
      const nodeParent = entry.parentNodeId == null
        ? parent
        : (entitiesByNode.get(entry.parentNodeId) ?? parent);
      const components = structuredClone(entry.node.components);
      components[PREFAB_LINK_COMPONENT] = {
        source,
        instance: instanceId,
        node: entry.node.id,
        root: entry.parentNodeId == null,
      };
      const id = spawnAt(entry.node.name, components, nodeParent, false);
      const entity = find(id)!;
      entity.active = entry.node.active;
      entity.siblingIndex = entry.siblingIndex;
      entitiesByNode.set(entry.node.id, id);
      if (entry.parentNodeId == null) root = id;
    }
    for (const entry of nodes) {
      const id = entitiesByNode.get(entry.node.id)!;
      const entity = find(id)!;
      entity.components = resolvePrefabEntityReferences(entity.components, entitiesByNode);
    }
    for (const id of entitiesByNode.values()) {
      reindexSiblings(find(id)?.parent ?? null);
    }
    if (root >= 0 && atIndex != null) setSiblingPosition(root, parent, atIndex);
    selectedIds = root >= 0 ? [root] : [];
    selectionAnchor = root >= 0 ? root : null;
    if (root >= 0) expanded.add(root);
    return root;
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
    pushUndo(`Create ${name}`);
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

  const spawnSpriteAsset = (sprite: string, options: SpriteSpawnOptions = {}): number => {
    const spawn = createSpriteSpawnComponents(sprite, options);
    return spawnAt(spawn.name, spawn.components, spawn.parent, true);
  };

  const getTransform = (entity: number): TransformData | null => {
    const e = find(entity);
    return (e?.components.Transform as TransformData) ?? null;
  };

  const deepCloneRoots = (
    rootIds: readonly number[],
    rootParentOverrides: ReadonlyMap<number, number | null> = new Map(),
  ): number[] => {
    const roots = rootIds.filter((rootId) => find(rootId) != null);
    if (!roots.length) return [];
    const rootSet = new Set(roots);
    const idMap = new Map<number, number>();
    const ids = roots.flatMap((rootId) => collectSubtreeIds(rootId));
    const clonedComponents = clonePrefabLinkedComponents(ids.map((id) => find(id)!));

    for (const oldId of ids) {
      idMap.set(oldId, nextId++);
    }

    for (const oldId of ids) {
      clonedComponents.set(
        oldId,
        remapComponentEntityReferences(clonedComponents.get(oldId)!, idMap),
      );
    }

    for (const oldId of ids) {
      const s = find(oldId)!;
      const newId = idMap.get(oldId)!;
      const isRoot = rootSet.has(oldId);
      const newPar =
        isRoot
          ? (rootParentOverrides.has(oldId) ? rootParentOverrides.get(oldId)! : s.parent ?? null)
          : s.parent != null
            ? (idMap.get(s.parent) ?? null)
            : null;
      const name =
        isRoot
          ? `${s.name ?? 'GameObject'} (1)`
          : (s.name ?? 'GameObject');
      editEntities.push(
        normalizeEntity({
          entity: newId,
          name,
          parent: newPar,
          siblingIndex:
            isRoot ? nextSiblingIndex(newPar) : s.siblingIndex,
          active: s.active,
          components: clonedComponents.get(oldId) ?? structuredClone(s.components),
        }),
      );
      expanded.add(newId);
    }
    for (const parent of new Set(roots.map((root) => (
      rootParentOverrides.has(root) ? rootParentOverrides.get(root)! : find(root)?.parent ?? null
    )))) {
      reindexSiblings(parent);
    }
    return roots.map((root) => idMap.get(root)!);
  };

  const deepCloneSubtree = (rootId: number, newParent: number | null): number => {
    return deepCloneRoots([rootId], new Map([[rootId, newParent]]))[0] ?? -1;
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

  const snapshotEntities = () => {
    const entities = list().map((e) => ({
      entity: e.entity,
      name: e.name,
      parent: e.parent,
      siblingIndex: e.siblingIndex,
      active: e.active,
      components: e.components,
    }));
    return animationPreview && mode === 'edit'
      ? applyAnimationPreview(entities, animationPreview.root, animationPreview.samples)
      : structuredClone(entities);
  };

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
      gameResolution,
    },
    null,
    2,
  );

  const applySceneJson = (
    json: string,
    targetMode: EditorMode,
    recordUndo: boolean,
  ) => {
    const data = JSON.parse(json);
    if (recordUndo) pushUndo('Load Scene');
    else undoService.clear('scene');
    behaviourRunner.unmount();
    const ents = (data.world?.entities ?? data.entities ?? []) as EntityRec[];
    editEntities = ents.map((e, i) =>
      normalizeEntity({
        ...e,
        components: withAllEntityReferenceMetadata(e.components ?? {}),
        siblingIndex: e.siblingIndex ?? i,
        active: e.active ?? true,
      }),
    );
    nextId = Math.max(1, ...editEntities.map((e) => e.entity + 1), 1);
    clearColor = data.world?.clearColor ?? clearColor;
    if (data.sceneCamera) sceneCamera = data.sceneCamera;
    gameResolution = Object.prototype.hasOwnProperty.call(data, 'gameResolution')
      ? normalizeGameResolution(data.gameResolution)
      : legacyGameResolution(data.gameAspect, data.gameOrientation);
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
    animationPreview = null;
    gizmoDragging = false;
    editGestureDepth = 0;
    gestureUndoState = null;
    gestureUndoToken = null;
    gestureHistoryCheckpoint = null;
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
    get gameResolution() {
      return gameResolution ? { ...gameResolution } : null;
    },
    get canUndo() {
      return undoService.canUndo;
    },
    get canRedo() {
      return undoService.canRedo;
    },
    get undoLabel() {
      return undoService.undoLabel;
    },
    get redoLabel() {
      return undoService.redoLabel;
    },
    setGameResolution(resolution: GameResolution | null) {
      gameResolution = normalizeGameResolution(resolution);
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
    authoredEntities() {
      return structuredClone(editEntities);
    },
    sceneContentFingerprint() {
      return sceneContentFingerprint(editEntities, clearColor);
    },
    setAnimationPreview(root: number, samples: AnimationPreviewSample[]) {
      if (mode !== 'edit' || !editEntities.some((entity) => entity.entity === root)) return false;
      animationPreview = { root, samples: structuredClone(samples) };
      return true;
    },
    clearAnimationPreview() {
      if (!animationPreview) return false;
      animationPreview = null;
      return true;
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
      const e = find(id);
      if (!e || e.name === n) return;
      pushUndo('Rename GameObject');
      e.name = n;
    },
    setActive(id: number, activeFlag: boolean) {
      const e = find(id);
      if (!e || e.active === activeFlag) return;
      pushUndo(activeFlag ? 'Activate GameObject' : 'Deactivate GameObject');
      e.active = activeFlag;
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

      if (withUndo) pushUndo('Reparent GameObject');
      const before = buildWorldTransforms(current);
      const preservedWorld = new Map(
        plan.roots.flatMap((id) => {
          const entity = current.find((candidate) => candidate.entity === id);
          if ((entity?.parent ?? null) === plan.parent) return [];
          const transform = resolvedTransform(before, id);
          return transform ? [[id, transform] as const] : [];
        }),
      );
      for (const id of plan.roots) {
        const entity = find(id);
        if (entity) entity.parent = plan.parent;
      }
      if (preservedWorld.size) {
        const after = buildWorldTransforms(editEntities);
        for (const [id, worldTransform] of preservedWorld) {
          const entity = find(id);
          const parentTransform = parentWorldTransform(editEntities, after, id);
          if (!entity?.components.Transform || !parentTransform) continue;
          entity.components.Transform = worldTransformToLocal(parentTransform, worldTransform);
        }
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
    /** Instantiate a disk prefab as one undoable hierarchy operation. */
    instantiatePrefabAsset(source: string, prefab: PrefabAsset, parent: number | null = null) {
      if (mode !== 'edit') return null;
      return instantiatePrefabInternal(source, prefab, parent, true);
    },
    getPrefabInstance(entity = primarySelected()) {
      if (entity == null) return null;
      const instance = findPrefabInstance(editEntities, entity);
      if (!instance) return null;
      const rootEntity = find(instance.root);
      const rootLink = readPrefabLink(rootEntity);
      return rootLink
        ? { root: instance.root, source: rootLink.source, instance: rootLink.instance }
        : null;
    },
    /** Link the current hierarchy to a prefab after Create or Apply succeeds on disk. */
    markPrefabInstance(root: number, source: string, nodeIds: ReadonlyMap<number, string>) {
      if (mode !== 'edit' || !find(root)) return false;
      const ids = collectSubtreeIds(root);
      const existing = readPrefabLink(find(root));
      const instanceId = existing?.instance ?? createPrefabId('instance');
      pushUndo('Link Prefab Instance');
      for (const id of ids) {
        const entity = find(id)!;
        const nodeId = nodeIds.get(id);
        if (!nodeId) continue;
        entity.components[PREFAB_LINK_COMPONENT] = {
          source,
          instance: instanceId,
          node: nodeId,
          root: id === root,
        };
      }
      return true;
    },
    /** Replace an instance with the asset state as one undoable Revert. */
    revertPrefabInstance(entity: number, prefab: PrefabAsset) {
      if (mode !== 'edit') return null;
      const instance = findPrefabInstance(editEntities, entity);
      if (!instance) return null;
      const rootEntity = find(instance.root);
      const rootLink = readPrefabLink(rootEntity);
      if (!rootEntity || !rootLink) return null;
      const parent = rootEntity.parent ?? null;
      const siblingIndex = rootEntity.siblingIndex;
      pushUndo('Revert Prefab Instance');
      deleteIdsWithSubtree([instance.root]);
      return instantiatePrefabInternal(
        rootLink.source,
        prefab,
        parent,
        false,
        siblingIndex,
        rootLink.instance,
      );
    },
    /** Remove prefab metadata while preserving the authored hierarchy and components. */
    unpackPrefabInstance(entity: number) {
      if (mode !== 'edit') return false;
      const instance = findPrefabInstance(editEntities, entity);
      if (!instance) return false;
      pushUndo('Unpack Prefab Instance');
      for (const id of collectSubtreeIds(instance.root)) {
        const child = find(id);
        const link = readPrefabLink(child);
        if (link?.source === instance.link.source && link.instance === instance.link.instance) {
          delete child!.components[PREFAB_LINK_COMPONENT];
        }
      }
      selectedIds = [instance.root];
      selectionAnchor = instance.root;
      return true;
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
      if (!gizmoDragging) pushUndo('Duplicate GameObjects');
      const roots = selectedHierarchyRoots(editEntities, selectedIds);
      const newIds = deepCloneRoots(roots);
      selectedIds = newIds;
      selectionAnchor = newIds[newIds.length - 1] ?? null;
      return primarySelected();
    },
    deleteSelection() {
      if (!selectedIds.length || mode !== 'edit') return;
      pushUndo('Delete GameObjects');
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
      const parent = primarySelected();
      const oldIds = clipboard.roots.map((e) => e.entity);
      const clipSet = new Set(oldIds);
      const actualRoots = clipboard.roots.filter((e) => e.parent == null || !clipSet.has(e.parent));
      if (clipboard.cut) {
        const roots = actualRoots.map((root) => root.entity);
        if (this.setParent(roots, parent)) {
          clipboard = null;
          selectedIds = roots;
          selectionAnchor = roots[roots.length - 1] ?? null;
        }
        return;
      }

      pushUndo('Paste GameObjects');
      const idMap = new Map<number, number>();
      const clonedComponents = clonePrefabLinkedComponents(clipboard.roots, {
        preserveInstanceIds: false,
      });
      for (const oldId of oldIds) idMap.set(oldId, nextId++);
      for (const oldId of oldIds) {
        clonedComponents.set(
          oldId,
          remapComponentEntityReferences(clonedComponents.get(oldId)!, idMap),
        );
      }

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
            components: clonedComponents.get(s.entity) ?? structuredClone(s.components),
          }),
        );
        expanded.add(newId);
      }
      reindexSiblings(parent);
      if (parent != null) expanded.add(parent);

      selectedIds = actualRoots.map((r) => idMap.get(r.entity)!);
      selectionAnchor = selectedIds[selectedIds.length - 1] ?? null;
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
      return undoService.undo();
    },
    redo() {
      return undoService.redo();
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
      pushUndo(`Add ${type}`);
      e.components[type] = value;
      // RequireComponent: auto-add missing deps
      const requirements = componentRequirements(type);
      if (requirements.length) {
        for (const dep of requirements) {
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
      pushUndo(`Remove ${type}`);
      delete e.components[type];
      return true;
    },
    setComponent(entity: number, type: string, value: Record<string, unknown>) {
      const e = find(entity);
      if (!e) return;
      if (mode === 'edit' && !gizmoDragging) pushUndo(`Set ${type}`);
      const normalizedValue = withEntityReferenceMetadata(type, value);
      e.components[type] = type === 'TimelineDirector'
        ? resetTimelineBindingsOnAssetChange(e.components[type], normalizedValue)
        : normalizedValue;
    },
    patchComponent(entity: number, type: string, patch: Record<string, unknown>) {
      const e = find(entity);
      if (!e || e.components[type] == null) return;
      if (mode === 'edit' && !gizmoDragging) pushUndo(`Edit ${type}`);
      const safePatch = type === 'TimelineDirector'
        ? resetTimelineBindingsOnAssetChange(e.components[type], patch)
        : patch;
      e.components[type] = withEntityReferenceMetadata(type, {
        ...(e.components[type] as object),
        ...safePatch,
      });
    },
    assignMaterial(
      entity: number,
      materialPath: string,
      meshRendererValue?: Record<string, unknown>,
    ) {
      if (mode !== 'edit') return null;
      const e = find(entity);
      if (!e) return null;
      const result = assignMaterialToComponents(
        e.components,
        materialPath,
        meshRendererValue,
      );
      if (!result?.changed) return result;
      pushUndo('Assign Material');
      e.components = result.components;
      return result;
    },
    setToggleValue(entity: number, isOn: boolean) {
      const patches = planToggleGroupChange(list(), entity, isOn);
      if (!patches.length) return false;
      if (mode === 'edit' && !gizmoDragging) pushUndo('Set Toggle Value');
      for (const patch of patches) {
        const target = find(patch.entity);
        if (!target?.components.Toggle) continue;
        target.components.Toggle = {
          ...(target.components.Toggle as object),
          is_on: patch.isOn,
        };
      }
      return true;
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
        pushUndo(`${type}.${method}`);
        e.components[type] = next;
      }
    },
    applyCommands(cmds: WorldCommand[]) {
      pushUndo('Apply World Commands');
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
      if (mode === 'edit' && !gizmoDragging) pushUndo('Set Transforms');
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
      if (mode === 'edit' && !gizmoDragging) pushUndo(`Set ${type}`);
      for (const update of applicable) {
        const entity = find(update.entity);
        if (entity) entity.components[type] = structuredClone(update.value);
      }
      return true;
    },
    beginTransformGesture(label = 'Transform Selection') {
      if (editGestureDepth === 0) {
        gestureHistoryCheckpoint = undoService.checkpoint();
        gestureUndoState = captureUndoState();
        gestureUndoToken = pushUndo(label);
        gizmoDragging = true;
      }
      editGestureDepth++;
    },
    endTransformGesture() {
      if (editGestureDepth === 0) return;
      editGestureDepth--;
      if (editGestureDepth > 0) return;
      gizmoDragging = false;
      if (
        gestureUndoState
        && gestureUndoToken
        && undoService.isUndoTop(gestureUndoToken)
        && editorUndoStatesEqual(gestureUndoState, captureUndoState())
      ) {
        if (gestureHistoryCheckpoint) undoService.restoreCheckpoint(gestureHistoryCheckpoint);
      }
      gestureUndoState = null;
      gestureUndoToken = null;
      gestureHistoryCheckpoint = null;
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
      if (kind === 'translate' || kind === 'rect') t.position[i] += amount;
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
    translateSelectedTransformsBy(entity: number, delta: Vec3) {
      if (!delta.every(Number.isFinite)) return;
      const ids = selectedTransformRoots(editEntities, selectedIds, entity);
      const world = buildWorldTransforms(editEntities);
      for (const id of ids) {
        const target = find(id);
        const transform = target?.components.Transform as TransformData | undefined;
        if (!target || !transform) continue;
        const parent = parentWorldTransform(editEntities, world, id);
        if (!parent) continue;
        const localDelta = worldDeltaToLocal(parent, delta);
        target.components.Transform = {
          ...transform,
          position: add(transform.position, localDelta) as TransformData['position'],
        };
      }
    },
    rotateSelectedTransformsAround(
      entity: number,
      pivot: Vec3,
      axis: Vec3,
      degrees: number,
    ) {
      if (
        !pivot.every(Number.isFinite)
        || !axis.every(Number.isFinite)
        || !Number.isFinite(degrees)
        || Math.abs(degrees) < 1e-8
      ) return;
      const ids = selectedTransformRoots(editEntities, selectedIds, entity);
      const world = buildWorldTransforms(editEntities);
      for (const id of ids) {
        const target = find(id);
        const transform = target?.components.Transform as TransformData | undefined;
        const resolved = resolvedTransform(world, id);
        const parent = parentWorldTransform(editEntities, world, id);
        if (!target || !transform || !resolved || !parent) continue;
        const nextWorld = rotateTransformAround(resolved, pivot, axis, degrees);
        target.components.Transform = {
          ...transform,
          position: worldPointToLocal(parent, nextWorld.position) as TransformData['position'],
          rotation: worldRotationToLocal(parent, nextWorld.rotation as Quat) as TransformData['rotation'],
        };
      }
    },
    scaleSelectedTransformsAlong(
      entity: number,
      pivot: Vec3,
      axis: 'x' | 'y' | 'z',
      axisWorld: Vec3,
      amount: number,
    ) {
      const primary = find(entity);
      const primaryTransform = primary?.components.Transform as TransformData | undefined;
      if (
        !primaryTransform
        || !pivot.every(Number.isFinite)
        || !axisWorld.every(Number.isFinite)
        || !Number.isFinite(amount)
      ) return;
      const component = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      const world = buildWorldTransforms(editEntities);
      const primaryParent = parentWorldTransform(editEntities, world, entity);
      if (!primaryParent) return;
      const localAmount = worldAxisScaleDeltaToLocal(primaryParent, component, amount);
      const previous = Math.max(0.01, primaryTransform.scale[component]);
      const next = Math.max(0.01, previous + localAmount);
      const factor = next / previous;
      if (!Number.isFinite(factor) || Math.abs(factor - 1) < 1e-8) return;

      const ids = selectedTransformRoots(editEntities, selectedIds, entity);
      for (const id of ids) {
        const target = find(id);
        const transform = target?.components.Transform as TransformData | undefined;
        const resolved = resolvedTransform(world, id);
        const parent = parentWorldTransform(editEntities, world, id);
        if (!target || !transform || !resolved || !parent) continue;
        const nextWorld = scaleTransformAlong(
          resolved,
          pivot,
          component,
          axisWorld,
          factor,
        );
        const nextScale = [...transform.scale] as TransformData['scale'];
        nextScale[component] = Math.max(0.01, nextScale[component] * factor);
        target.components.Transform = {
          ...transform,
          position: worldPointToLocal(parent, nextWorld.position) as TransformData['position'],
          scale: nextScale,
        };
      }
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
      pushUndo('Move UI Selection');
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
    rotateSelectedRectsBy(deltas: Array<{
      entity: number;
      dx: number;
      dy: number;
      degrees: number;
    }>) {
      const roots = new Set(selectedRectRoots(editEntities, selectedIds));
      for (const delta of deltas) {
        if (
          !roots.has(delta.entity)
          || !Number.isFinite(delta.dx)
          || !Number.isFinite(delta.dy)
          || !Number.isFinite(delta.degrees)
        ) continue;
        const entity = find(delta.entity);
        if (!entity?.components.RectTransform) continue;
        const rt = readRectTransform(entity.components.RectTransform);
        entity.components.RectTransform = {
          ...rt,
          anchored_position: [
            rt.anchored_position[0] + delta.dx,
            rt.anchored_position[1] + delta.dy,
          ],
          local_rotation: rt.local_rotation + delta.degrees,
        };
      }
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
    scaleSelectedRectsBy(deltas: Array<{
      entity: number;
      dx: number;
      dy: number;
      factorX: number;
      factorY: number;
    }>) {
      const roots = new Set(selectedRectRoots(editEntities, selectedIds));
      for (const delta of deltas) {
        if (
          !roots.has(delta.entity)
          || !Number.isFinite(delta.dx)
          || !Number.isFinite(delta.dy)
          || !Number.isFinite(delta.factorX)
          || !Number.isFinite(delta.factorY)
        ) continue;
        const entity = find(delta.entity);
        if (!entity?.components.RectTransform) continue;
        const rt = readRectTransform(entity.components.RectTransform);
        entity.components.RectTransform = {
          ...rt,
          anchored_position: [
            rt.anchored_position[0] + delta.dx,
            rt.anchored_position[1] + delta.dy,
          ],
          local_scale: [
            Math.max(0.01, rt.local_scale[0] * delta.factorX),
            Math.max(0.01, rt.local_scale[1] * delta.factorY),
          ],
        };
      }
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
      options: RectResizeOptions = {},
    ) {
      const e = find(entity);
      if (!e?.components.RectTransform) return null;
      const rt = readRectTransform(e.components.RectTransform);
      const plan = planRectResize(
        handle,
        rt.pivot,
        rt.local_scale,
        rt.local_rotation,
        dLocalX,
        dLocalY,
        options,
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
      return plan;
    },
    getTransform,
    frameSelected() {
      const id = primarySelected();
      if (id == null) return;
      const entity = find(id);
      if (entity?.components.RectTransform) {
        let canvasSize: { w: number; h: number } | undefined;
        let walk: EntityRec | undefined = entity;
        while (walk) {
          if (walk.components.Canvas) {
            canvasSize = gameAlignedCanvasSize(
              walk.components.CanvasScaler,
              gameResolutionAspect(gameResolution),
            );
            break;
          }
          const parentId: number | null = walk.parent ?? null;
          walk = parentId != null ? find(parentId) ?? undefined : undefined;
        }
        const ui = uiEntityWorldPivot(list() as UiEnt[], id, canvasSize);
        if (ui) {
          sceneCamera.pivot = [...ui.position] as Vec3;
          sceneCamera.distance = Math.max(2, ui.size * 2.5);
          return;
        }
      }
      const transform = resolvedTransform(buildWorldTransforms(list()), id);
      if (transform) {
        const renderer = (entity?.components.SpriteRenderer
          ?? entity?.components.AnimatedSprite2D) as Record<string, unknown> | undefined;
        if (renderer) {
          const frame = frameWorldSprite(
            transform.position,
            transform.rotation,
            transform.scale,
            Array.isArray(renderer.size) ? renderer.size : [1, 1],
            Array.isArray(renderer.pivot) ? renderer.pivot : [0.5, 0.5],
          );
          sceneCamera.pivot = frame.pivot;
          sceneCamera.distance = frame.distance;
          return;
        }
        sceneCamera.pivot = [...transform.position] as Vec3;
        sceneCamera.distance = Math.max(3, Math.max(...transform.scale.map(Math.abs), 1) * 4);
        return;
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
      if (name === 'Scrollbar') {
        this.spawnUiScrollbar();
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
      if (name === 'Animated Sprite') {
        this.spawnAnimatedSprite2D();
        return;
      }
      if (name === 'Line 2D') {
        this.spawnLine2D();
        return;
      }
      if (name === 'Grid') {
        this.spawnGrid();
        return;
      }
      if (name === 'Tilemap') {
        this.spawnTilemap();
        return;
      }
      spawnAt(
        name,
        {
          Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          MeshRenderer: { mesh: 'cube', material: 'default' },
          BoxCollider3D: { size: [1, 1, 1], center: [0, 0, 0], is_trigger: false, friction: 0.5, restitution: 0 },
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
            clear_flags: 'scene',
            background_color: [0.1, 0.1, 0.14, 1],
          },
          AudioListener: { primary: true },
        },
        null,
        true,
      );
    },
    spawnCamera2D() {
      spawnAt(
        'Camera 2D',
        {
          Transform: { position: [0, 0, 10], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          Camera2D: {
            size: 5,
            primary: true,
            clear_flags: 'solid_color',
            background_color: [0.1, 0.1, 0.14, 1],
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
    spawnEnvironmentLight() {
      spawnAt(
        'Environment Light',
        {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          EnvironmentLight: createEnvironmentLightComponent(),
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
    spawnLight2D(lightType: 'global' | 'point' = 'point') {
      const global = lightType === 'global';
      spawnAt(
        global ? 'Global Light 2D' : 'Point Light 2D',
        {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          Light2D: {
            light_type: global ? 'global' : 'point',
            color: global ? [1, 1, 1, 1] : [1, 0.86, 0.68, 1],
            intensity: 1,
            radius: 5,
            inner_radius: 0,
            falloff: 1,
            sorting_layers: [],
          },
        },
        null,
        true,
      );
    },
    spawnAudioSource() {
      spawnAt(
        'Audio Source',
        {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          AudioSource: createComponentDefaults('AudioSource'),
        },
        null,
        true,
      );
    },
    spawnAudioListener() {
      spawnAt(
        'Audio Listener',
        {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          AudioListener: createComponentDefaults('AudioListener'),
        },
        null,
        true,
      );
    },
    spawnAudioMixer() {
      spawnAt(
        'Audio Mixer',
        { AudioMixer: createComponentDefaults('AudioMixer') },
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
    spawnUiRawImage(parent?: number | null) {
      return spawnUiControl('Raw Image', createUiRawImageComponents(), parent);
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
    spawnUiScrollbar(parent?: number | null) {
      return spawnUiControl('Scrollbar', createUiScrollbarComponents(), parent);
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
    spawnSpriteAsset,
    spawnSpriteQuad() {
      return spawnSpriteAsset('white', {
        name: 'Sprite',
        position: [0, 0.5, 0],
        color: [0.4, 0.75, 1, 1],
      });
    },
    spawnAnimatedSprite2D() {
      spawnAt(
        'Animated Sprite',
        {
          Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          AnimatedSprite2D: {
            frames: [],
            fps: 12,
            playing: true,
            looped: true,
            frame: 0,
            color: [1, 1, 1, 1],
            size: [1, 1],
            pivot: [0.5, 0.5],
            flip_x: false,
            flip_y: false,
            sorting_layer: 'default',
            sorting_order: 0,
          },
        },
        null,
        true,
      );
    },
    spawnLine2D() {
      spawnAt(
        'Line 2D',
        {
          Transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          Line2D: {
            points: [[-0.5, 0], [0.5, 0]],
            width: 0.1,
            color: [1, 1, 1, 1],
            closed: false,
            sorting_layer: 'default',
            sorting_order: 0,
          },
        },
        null,
        true,
      );
    },
    spawnGrid() {
      return spawnAt(
        'Grid',
        {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          Grid: createGridComponent(),
        },
        null,
        true,
      );
    },
    spawnTilemap() {
      pushUndo('Create Tilemap');
      const grid = spawnAt(
        'Grid',
        {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          Grid: createGridComponent(),
        },
        null,
        false,
      );
      return spawnAt(
        'Tilemap',
        {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          Tilemap: createTilemapComponent(),
        },
        grid,
        false,
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
          BoxCollider3D: { size: [1, 1, 1], center: [0, 0, 0], is_trigger: false, friction: 0.5, restitution: 0 },
        },
        p,
        true,
      );
    },
    spawnModel(path: string) {
      const name = path.split('/').pop()?.replace(/\.(?:gltf|glb)$/i, '') || 'Model';
      spawnAt(
        name,
        {
          Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
          MeshRenderer: { mesh: path, material: 'default' },
        },
        null,
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
