import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import { expandIntent } from '@mengine/agent';
import {
  createEditorStore,
  type EditorMode,
  type GameAspect,
  type GameOrientation,
  type GizmoMode,
} from './store';
import { getBehaviour } from '@mengine/behaviour';
import {
  getActiveSceneName,
  initSceneLibrary,
  isDiskBackend,
  listScenes,
  normalizeSceneName,
  readSceneJson,
  renameScene,
  sceneExists,
  sceneFileName,
  setActiveSceneName,
  setEditorPrefs,
  writeScene,
} from './sceneLibrary';
import { MenuBar } from './panels/MenuBar';
import { ToolBar } from './panels/ToolBar';
import { Hierarchy } from './panels/Hierarchy';
import { Inspector } from './panels/Inspector';
import { Project } from './panels/Project';
import { Console } from './panels/Console';
import { Viewport } from './panels/Viewport';
import { DockWorkspace } from './panels/DockWorkspace';
import { EditorWindowHost } from './editorWindow';
import { resolveUnityAction } from './panels/uiFieldEditors';
import { refreshSprites } from './spriteLibrary';
import './editorWindow'; // MenuItem side-effects

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function askSceneName(title: string, initial: string): string | null {
  const raw = window.prompt(title, initial);
  if (raw == null) return null;
  return normalizeSceneName(raw);
}

const ASPECTS: GameAspect[] = ['free', '16:9', '16:10', '4:3', '1:1'];

function parseGameAspect(v: unknown): GameAspect | null {
  return typeof v === 'string' && (ASPECTS as string[]).includes(v) ? (v as GameAspect) : null;
}

function parseGameOrientation(v: unknown): GameOrientation | null {
  return v === 'landscape' || v === 'portrait' ? v : null;
}

export function App() {
  const store = useMemo(() => createEditorStore(), []);
  const [snap, setSnap] = useState<WorldSnapshotView & { selectedIds?: number[] }>(store.snapshot());
  const [mode, setMode] = useState<EditorMode>('edit');
  const [gizmo, setGizmo] = useState<GizmoMode>('translate');
  const [viewTab, setViewTab] = useState<'scene' | 'game'>('scene');
  const [gameAspect, setGameAspect] = useState(store.gameAspect);
  const [gameOrientation, setGameOrientation] = useState(store.gameOrientation);
  const [hierFilter, setHierFilter] = useState('');
  const [pendingRenameId, setPendingRenameId] = useState<number | null>(null);
  const [treeTick, setTreeTick] = useState(0);
  const [sceneTick, setSceneTick] = useState(0);
  const [sceneName, setSceneName] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    'MEngine Editor',
    '场景落盘：packages/editor/project/Assets/Scenes/*.mscene',
    '新建会弹出命名；双击 .mscene 打开；Ctrl+S 保存',
  ]);
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const logEnd = useRef(0);
  const booted = useRef(false);
  const sceneNameRef = useRef<string | null>(null);
  sceneNameRef.current = sceneName;

  const refresh = () => {
    setSnap(store.snapshot());
    setMode(store.mode);
    setGizmo(store.gizmo);
    setSelected(store.selected);
    setSelectedIds(store.selectedIds);
    setGameAspect(store.gameAspect);
    setGameOrientation(store.gameOrientation);
    setTreeTick((t) => t + 1);
  };

  const bumpScenes = () => setSceneTick((t) => t + 1);

  const log = (msg: string, level: 'info' | 'warn' | 'error' = 'info') => {
    const prefix = level === 'info' ? '' : level === 'warn' ? '[Warn] ' : '[Error] ';
    setLogs((l) => {
      const next = [...l, `${prefix}${msg}`];
      logEnd.current = next.length;
      return next.slice(-300);
    });
  };

  const openSceneByName = async (name: string, silent = false) => {
    const json = readSceneJson(name);
    if (!json) {
      if (!silent) log(`Scene not found: ${name}`, 'warn');
      return false;
    }
    try {
      store.loadSceneJson(json);
      setSceneName(name);
      await setActiveSceneName(name);
      if (!silent) log(`Opened ${sceneFileName(name)}`);
      refresh();
      bumpScenes();
      return true;
    } catch (err) {
      log(`Failed to open scene: ${err}`, 'error');
      return false;
    }
  };

  const persistScene = async (name: string) => {
    try {
      await writeScene(name, store.saveSceneJson(name));
      setSceneName(name);
      bumpScenes();
      const where = isDiskBackend()
        ? 'project/Assets/Scenes'
        : 'localStorage（磁盘 API 不可用）';
      log(`Saved ${sceneFileName(name)} → ${where}`);
    } catch (err) {
      log(`保存失败: ${err}`, 'error');
    }
  };

  const saveScene = () => {
    const current = sceneNameRef.current;
    if (current) {
      void persistScene(current);
      return;
    }
    const name = askSceneName('保存场景 — 请输入名称', 'Untitled');
    if (!name) return;
    if (sceneExists(name) && !window.confirm(`场景「${name}」已存在，要覆盖吗？`)) return;
    void persistScene(name);
  };

  const saveSceneAs = () => {
    const name = askSceneName('另存为 — 请输入新名称', sceneNameRef.current ?? 'Untitled');
    if (!name) return;
    if (sceneExists(name) && name !== sceneNameRef.current) {
      if (!window.confirm(`场景「${name}」已存在，要覆盖吗？`)) return;
    }
    void persistScene(name);
  };

  const newScene = () => {
    const name = askSceneName('新建场景 — 请输入名称', 'NewScene');
    if (!name) return;
    if (sceneExists(name) && !window.confirm(`场景「${name}」已存在，要覆盖吗？`)) return;
    store.newScene();
    void persistScene(name).then(() => refresh());
  };

  const openSceneDialog = () => {
    const scenes = listScenes();
    if (!scenes.length) {
      log('还没有已保存的场景。先 File → New Scene 并命名。', 'warn');
      return;
    }
    const hint = scenes.map((s) => s.name).join(', ');
    const name = askSceneName(`打开场景（已有: ${hint}）`, scenes[0].name);
    if (!name) return;
    void openSceneByName(name);
  };

  const applyEditorPrefs = (prefs: { gameAspect?: string; gameOrientation?: string }) => {
    const aspect = parseGameAspect(prefs.gameAspect);
    const orient = parseGameOrientation(prefs.gameOrientation);
    if (aspect) store.setGameAspect(aspect);
    if (orient) store.setGameOrientation(orient);
  };

  const persistGameViewPrefs = () => {
    void setEditorPrefs({
      gameAspect: store.gameAspect,
      gameOrientation: store.gameOrientation,
    });
  };

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const { backend, migrated, prefs } = await initSceneLibrary();
      await refreshSprites();
      bumpScenes();
      if (backend === 'disk') {
        log('场景存储：磁盘 project/Assets/Scenes');
      } else {
        log('场景存储：localStorage（请用 Vite dev 启动以启用磁盘）', 'warn');
      }
      if (migrated > 0) {
        log(`已从浏览器迁移 ${migrated} 个场景到磁盘`);
      }
      const active = getActiveSceneName() ?? listScenes()[0]?.name;
      if (active && (await openSceneByName(active, true))) {
        log(`已恢复场景 ${sceneFileName(active)}`);
      }
      // 编辑器偏好覆盖场景里的值（改横竖屏无需 Ctrl+S）
      applyEditorPrefs(prefs);
      refresh();
    })();
  }, [store]);

  useEffect(() => {
    const id = setInterval(() => {
      // Edit 模式不要每帧 refresh，否则整树 60fps 重绘会卡死
      if (store.mode !== 'play') return;
      store.tick(1 / 60);
      refresh();
    }, 1000 / 60);
    return () => clearInterval(id);
  }, [store]);

  const spawnCube = () => {
    const cmds = expandIntent({
      kind: 'SpawnMesh',
      mesh: 'cube',
      at: [Math.random() * 2 - 1, 0.5, Math.random() * 2 - 1],
      name: 'Cube',
    });
    store.applyCommands(cmds);
    log('GameObject/3D Object/Cube');
    refresh();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        store.undo();
        refresh();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        newScene();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveScene();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openSceneDialog();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        store.duplicateSelection();
        log('Duplicate');
        refresh();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        store.copySelection();
        log('Copy');
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        store.cutSelection();
        log('Cut');
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        store.paste();
        log('Paste');
        refresh();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        store.selectAllVisible();
        refresh();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelection();
        log('Delete');
        refresh();
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        const id = store.selected;
        if (id != null) setPendingRenameId(id);
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        store.frameSelected();
        refresh();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        store.navigateVisible(-1);
        refresh();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        store.navigateVisible(1);
        refresh();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        store.navigateHorizontal(-1);
        refresh();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        store.navigateHorizontal(1);
        refresh();
        return;
      }
      if (e.key === 'w' || e.key === 'W') {
        store.setGizmo('translate');
        refresh();
      } else if (e.key === 'e' || e.key === 'E') {
        store.setGizmo('rotate');
        refresh();
      } else if (e.key === 'r' || e.key === 'R') {
        store.setGizmo('scale');
        refresh();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  const treeNodes = useMemo(() => store.getVisibleFlat(), [store, snap, treeTick]);

  return (
    <div className="unity-shell">
      <MenuBar
        onNew={newScene}
        onSave={saveScene}
        onSaveAs={saveSceneAs}
        onLoad={openSceneDialog}
        onUndo={() => {
          store.undo();
          refresh();
        }}
        onCreateEmpty={() => {
          store.createEmpty(null);
          log('GameObject/Create Empty');
          refresh();
        }}
        onCreateEmptyChild={() => {
          store.createEmptyChild();
          log('GameObject/Create Empty Child');
          refresh();
        }}
        onCreateCube={spawnCube}
        onCreateCamera={() => {
          store.spawnCamera();
          log('GameObject/Camera');
          refresh();
        }}
        onCreateSprite={() => {
          store.spawnSpriteQuad();
          log('GameObject/3D Object/Sprite Quad');
          refresh();
        }}
        onCreateUiCanvas={() => {
          store.spawnUiCanvas();
          log('GameObject/UI/Canvas');
          refresh();
        }}
        onCreateUiImage={() => {
          store.spawnUiImage();
          log('GameObject/UI/Image');
          refresh();
        }}
        onCreateUiButton={() => {
          store.spawnUiButton();
          log('GameObject/UI/Button');
          refresh();
        }}
        onDuplicate={() => {
          store.duplicateSelection();
          log('Duplicate');
          refresh();
        }}
      />

      <ToolBar
        mode={mode}
        gizmo={gizmo}
        onGizmo={(m) => {
          store.setGizmo(m);
          refresh();
        }}
        onPlay={() => {
          store.play();
          setViewTab('game');
          log('Entered Play Mode → Game');
          refresh();
        }}
        onPause={() => {
          store.pause();
          log(store.mode === 'pause' ? 'Paused' : 'Resumed');
          refresh();
        }}
        onStop={() => {
          store.stop();
          setViewTab('scene');
          log('Exited Play Mode → Scene');
          refresh();
        }}
      />

      <DockWorkspace
        viewportTabs={
          <>
            <button
              className={`dock-tab${viewTab === 'scene' ? ' active' : ''}`}
              type="button"
              onClick={() => setViewTab('scene')}
            >
              Scene
            </button>
            <button
              className={`dock-tab${viewTab === 'game' ? ' active' : ''}`}
              type="button"
              onClick={() => setViewTab('game')}
            >
              Game
            </button>
          </>
        }
        panels={{
          hierarchy: (
            <Hierarchy
              store={store}
              nodes={treeNodes}
              selectedIds={selectedIds}
              filter={hierFilter}
              pendingRenameId={pendingRenameId}
              onFilter={setHierFilter}
              onPendingRenameConsumed={() => setPendingRenameId(null)}
              onRefresh={refresh}
              onLog={log}
              onFrame={() => {
                store.frameSelected();
                refresh();
              }}
            />
          ),
          viewport: (
            <Viewport
              tab={viewTab}
              clearColor={snap.clearColor}
              entities={snap.entities}
              selected={selected}
              selectedIds={selectedIds}
              angle={store.viewAngle}
              gizmo={gizmo}
              playing={mode !== 'edit'}
              sceneCamera={store.sceneCamera}
              gameAspect={gameAspect}
              gameOrientation={gameOrientation}
              activeInHierarchy={(id) => store.activeInHierarchy(id)}
              onPick={(id) => {
                store.select(id);
                refresh();
              }}
              onSceneCamera={(partial) => {
                store.setSceneCamera(partial);
                refresh();
              }}
              onBeginGesture={() => store.beginTransformGesture()}
              onEndGesture={() => store.endTransformGesture()}
              onTranslate={(entity, delta) => {
                store.translateBy(entity, delta);
                refresh();
              }}
              onGizmoAxis={(entity, axis, amount) => {
                store.applyTransformDelta(entity, gizmo, axis, amount);
                refresh();
              }}
              onRotateWorld={(entity, axis, degrees) => {
                store.rotateByWorldAxis(entity, axis, degrees);
                refresh();
              }}
              onRectTranslate={(entity, dx, dy) => {
                store.translateRectBy(entity, dx, dy);
                refresh();
              }}
              onRectRotate={(entity, degrees) => {
                store.rotateRectBy(entity, degrees);
                refresh();
              }}
              onRectScale={(entity, axis, amount) => {
                store.scaleRectBy(entity, axis, amount);
                refresh();
              }}
              onUiClick={(entity, onClick) => {
                const action = resolveUnityAction(entity, onClick);
                if (action) {
                  const ents = store.snapshot().entities as Array<{
                    entity: number;
                    components: Record<string, unknown>;
                  }>;
                  const target = ents.find((x) => x.entity === action.entity);
                  if (target) {
                    if (action.component && target.components[action.component]) {
                      store.invokeBehaviourMethod(
                        action.entity,
                        action.component,
                        action.method,
                      );
                      log(`Button onClick → ${action.component}.${action.method}()`);
                      refresh();
                      return;
                    }
                    for (const type of Object.keys(target.components)) {
                      const b = getBehaviour(type);
                      if (b?.methods.some((m) => m.key === action.method)) {
                        store.invokeBehaviourMethod(action.entity, type, action.method);
                        log(`Button onClick → ${type}.${action.method}()`);
                        refresh();
                        return;
                      }
                    }
                  }
                  log(
                    `Button onClick → ${action.component || '?'}.${action.method}() (not found)`,
                    'warn',
                  );
                } else {
                  log(`Button clicked (entity ${entity})`);
                }
                refresh();
              }}
              onAspect={(a) => {
                store.setGameAspect(a);
                setGameAspect(a);
                persistGameViewPrefs();
                refresh();
              }}
              onOrientation={(o) => {
                store.setGameOrientation(o);
                setGameOrientation(o);
                if (o === 'portrait' && store.gameAspect === 'free') {
                  store.setGameAspect('16:9');
                  setGameAspect('16:9');
                }
                persistGameViewPrefs();
                refresh();
              }}
              onFrame={() => {
                store.frameSelected();
                refresh();
              }}
            />
          ),
          inspector: (
            <Inspector
              entity={snap.entities.find((e) => e.entity === selected) ?? null}
              entities={snap.entities}
              selectionCount={selectedIds.length}
              onChangeTransform={(entity, transform) => {
                store.setTransform(entity, transform);
                refresh();
              }}
              onAddComponent={(entity, type, value) => {
                if (store.addComponent(entity, type, value)) {
                  log(`Added ${type}`);
                  refresh();
                } else {
                  log(`Cannot add ${type}`, 'warn');
                }
              }}
              onRemoveComponent={(entity, type) => {
                if (store.removeComponent(entity, type)) {
                  log(`Removed ${type}`);
                  refresh();
                }
              }}
              onSetComponent={(entity, type, value) => {
                store.setComponent(entity, type, value);
                refresh();
              }}
              onPatchComponent={(entity, type, patch) => {
                store.patchComponent(entity, type, patch);
                refresh();
              }}
              onInvokeBehaviourMethod={(entity, type, method) => {
                store.invokeBehaviourMethod(entity, type, method);
                refresh();
              }}
            />
          ),
          project: (
            <Project
              activeScene={sceneName}
              sceneTick={sceneTick}
              onSpawnPrefab={(name) => {
                store.spawnPrefab(name);
                log(`Instantiated ${name}`);
                refresh();
              }}
              onOpenScene={(name) => {
                void openSceneByName(name);
              }}
              onRenameScene={async (oldName, newName) => {
                const next = await renameScene(oldName, newName);
                if (next == null) {
                  log(
                    `重命名失败：名称无效或「${normalizeSceneName(newName) ?? newName}」已存在`,
                    'warn',
                  );
                  bumpScenes();
                  return false;
                }
                if (next !== oldName) {
                  if (sceneNameRef.current === oldName) setSceneName(next);
                  bumpScenes();
                  log(`Renamed ${sceneFileName(oldName)} → ${sceneFileName(next)}`);
                }
                return true;
              }}
              onLog={log}
            />
          ),
          console: <Console lines={logs} />,
        }}
      />

      <div className="status-bar">
        <span>
          {mode === 'edit' ? 'Edit Mode' : mode === 'play' ? (
            <span className="on">Play Mode</span>
          ) : (
            <span className="on">Paused</span>
          )}
          {' · '}
          {sceneName ? sceneFileName(sceneName) : '未命名场景'}
          {' · '}
          {snap.entities.length} objects
          {' · '}
          {selectedIds.length > 1 ? `${selectedIds.length} selected · ` : ''}
          gizmo: {gizmo}
        </span>
        <span>MEngine · Project/Assets/Scenes</span>
      </div>

      <EditorWindowHost />
    </div>
  );
}
