/** Scene library — disk via Vite `/__mengine/*` (IDE), localStorage fallback. */

import {
  desktopProjectSceneJson,
  getDesktopProject,
  openDesktopScene,
  replaceDesktopSceneJson,
  saveDesktopScene,
} from './transport/desktopProjectSession';
import { listProjectScenes } from './transport/editorTransport';
import type { GameResolution } from './gameResolution';

export type SceneMeta = {
  name: string;
  updatedAt: number;
};

export type EditorPrefs = {
  gameResolution?: GameResolution | null;
  /** Legacy migration fields. */
  gameAspect?: string;
  gameOrientation?: string;
};

const API = '/__mengine';
const SCENES_INDEX_KEY = 'mengine.scenes.index';
const SCENES_ACTIVE_KEY = 'mengine.scenes.active';
const EDITOR_PREFS_KEY = 'mengine.editor.prefs';
const SCENE_DATA_PREFIX = 'mengine.scene.data.';
const LEGACY_SCENE_KEY = 'mengine.scene';
const MIGRATED_FLAG = 'mengine.scenes.migratedToDisk';

type Backend = 'disk' | 'local' | 'desktop';

let _backend: Backend = 'local';
let _index: SceneMeta[] = [];
const _data = new Map<string, string>();
let _active: string | null = null;
let _prefs: EditorPrefs = {};
let _ready = false;

function dataKey(name: string) {
  return `${SCENE_DATA_PREFIX}${name}`;
}

function sortIndex(list: SceneMeta[]) {
  return list.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Sync reads after `initSceneLibrary()`. */
export function listScenes(): SceneMeta[] {
  return sortIndex(_index);
}

export function getActiveSceneName(): string | null {
  return _active;
}

export function getEditorPrefs(): EditorPrefs {
  return { ..._prefs };
}

function loadLocalPrefs() {
  try {
    const raw = localStorage.getItem(EDITOR_PREFS_KEY);
    if (!raw) {
      _prefs = {};
      return;
    }
    const data = JSON.parse(raw) as EditorPrefs;
    _prefs = data && typeof data === 'object' ? data : {};
  } catch {
    _prefs = {};
  }
}

function saveLocalPrefs() {
  try {
    localStorage.setItem(EDITOR_PREFS_KEY, JSON.stringify(_prefs));
  } catch {
    /* quota */
  }
}

export function sceneExists(name: string) {
  return _index.some((s) => s.name === name);
}

export function readSceneJson(name: string): string | null {
  return _data.get(name) ?? null;
}

export function sceneFileName(name: string) {
  return `${name}.mscene`;
}

export function normalizeSceneName(input: string): string | null {
  let n = input.trim().replace(/\.mscene$/i, '');
  n = n.replace(/[\\/:*?"<>|]/g, '').trim();
  if (!n) return null;
  return n;
}

export function isDiskBackend() {
  return _backend === 'disk' || _backend === 'desktop';
}

export function isSceneLibraryReady() {
  return _ready;
}

function applyLocalIndex(list: SceneMeta[]) {
  _index = sortIndex(list);
  try {
    localStorage.setItem(SCENES_INDEX_KEY, JSON.stringify(_index));
  } catch {
    /* quota */
  }
}

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(SCENES_INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as SceneMeta[]) : [];
    _index = Array.isArray(list) ? sortIndex(list) : [];
  } catch {
    _index = [];
  }
  _data.clear();
  for (const s of _index) {
    const json = localStorage.getItem(dataKey(s.name));
    if (json) _data.set(s.name, json);
  }
  _active = localStorage.getItem(SCENES_ACTIVE_KEY);
}

function migrateLegacyLocal(): void {
  const legacy = localStorage.getItem(LEGACY_SCENE_KEY);
  if (!legacy) return;
  const name = 'SampleScene';
  if (!_data.has(name)) {
    try {
      const data = JSON.parse(legacy);
      data.name = name;
      _data.set(name, JSON.stringify(data, null, 2));
    } catch {
      _data.set(name, legacy);
    }
    applyLocalIndex([..._index.filter((s) => s.name !== name), { name, updatedAt: Date.now() }]);
    localStorage.setItem(dataKey(name), _data.get(name)!);
  }
  localStorage.removeItem(LEGACY_SCENE_KEY);
}

function readLocalScenesOnly(): { scenes: Array<{ name: string; updatedAt: number; json: string }>; active: string | null } {
  // Legacy single-slot → SampleScene (local only, don't mutate disk cache)
  const legacy = localStorage.getItem(LEGACY_SCENE_KEY);
  const scenes: Array<{ name: string; updatedAt: number; json: string }> = [];
  try {
    const raw = localStorage.getItem(SCENES_INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as SceneMeta[]) : [];
    if (Array.isArray(list)) {
      for (const s of list) {
        const json = localStorage.getItem(dataKey(s.name));
        if (json) scenes.push({ name: s.name, updatedAt: s.updatedAt, json });
      }
    }
  } catch {
    /* ignore */
  }
  if (legacy && !scenes.some((s) => s.name === 'SampleScene')) {
    try {
      const data = JSON.parse(legacy);
      data.name = 'SampleScene';
      scenes.push({ name: 'SampleScene', updatedAt: Date.now(), json: JSON.stringify(data, null, 2) });
    } catch {
      scenes.push({ name: 'SampleScene', updatedAt: Date.now(), json: legacy });
    }
  }
  return { scenes, active: localStorage.getItem(SCENES_ACTIVE_KEY) };
}

/** One-shot: copy browser scenes that are missing on disk. Never overwrite existing files. */
async function pushLocalToDisk(): Promise<number> {
  if (_backend !== 'disk') return 0;
  if (localStorage.getItem(MIGRATED_FLAG) === '1') return 0;

  const local = readLocalScenesOnly();
  if (!local.scenes.length) {
    localStorage.setItem(MIGRATED_FLAG, '1');
    localStorage.removeItem(LEGACY_SCENE_KEY);
    return 0;
  }

  const onDisk = new Set(_index.map((s) => s.name));
  let n = 0;
  for (const s of local.scenes) {
    if (onDisk.has(s.name)) continue;
    const res = await fetch(`${API}/scenes/${encodeURIComponent(s.name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: s.json,
    });
    if (res.ok) n += 1;
  }
  if (!_active && local.active) {
    await fetch(`${API}/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: local.active }),
    });
  }
  localStorage.setItem(MIGRATED_FLAG, '1');
  localStorage.removeItem(LEGACY_SCENE_KEY);
  return n;
}

async function loadFromDisk(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/scenes`);
    if (!res.ok) return false;
    const body = (await res.json()) as {
      active: string | null;
      gameResolution?: GameResolution | null;
      gameAspect?: string | null;
      gameOrientation?: string | null;
      scenes: Array<{ name: string; updatedAt: number; json: string }>;
    };
    _backend = 'disk';
    _index = sortIndex(body.scenes.map((s) => ({ name: s.name, updatedAt: s.updatedAt })));
    _data.clear();
    for (const s of body.scenes) {
      if (s.json) _data.set(s.name, s.json);
    }
    _active = body.active;
    _prefs = {};
    if (Object.prototype.hasOwnProperty.call(body, 'gameResolution')) {
      _prefs.gameResolution = body.gameResolution ?? null;
    }
    if (typeof body.gameAspect === 'string') _prefs.gameAspect = body.gameAspect;
    if (typeof body.gameOrientation === 'string') {
      _prefs.gameOrientation = body.gameOrientation;
    }
    return true;
  } catch {
    return false;
  }
}

/** Call once on editor boot. Prefers disk; falls back to localStorage. */
export async function initSceneLibrary(): Promise<{
  backend: Backend;
  migrated: number;
  prefs: EditorPrefs;
}> {
  const desktopProject = getDesktopProject();
  if (desktopProject) {
    const json = desktopProjectSceneJson();
    const name =
      desktopProject.scenePath?.split('/').pop()?.replace(/\.mscene$/i, '') ?? 'Untitled';
    const scenes = await listProjectScenes();
    _backend = 'desktop';
    _index = sortIndex(scenes.map((scene) => ({
      name: scene.name,
      updatedAt: scene.updatedAt,
    })));
    _data.clear();
    for (const scene of scenes) _data.set(scene.name, scene.json);
    if (json) {
      _data.set(name, json);
      if (!_index.some((scene) => scene.name === name)) {
        _index = sortIndex([..._index, { name, updatedAt: Date.now() }]);
      }
    }
    _active = name;
    loadLocalPrefs();
    _ready = true;
    return { backend: _backend, migrated: 0, prefs: getEditorPrefs() };
  }
  const ok = await loadFromDisk();
  let migrated = 0;
  if (ok) {
    migrated = await pushLocalToDisk();
    if (migrated > 0) await loadFromDisk();
  } else {
    _backend = 'local';
    migrateLegacyLocal();
    loadFromLocalStorage();
    loadLocalPrefs();
  }
  _ready = true;
  return { backend: _backend, migrated, prefs: getEditorPrefs() };
}

/** @deprecated use initSceneLibrary */
export function migrateLegacyScene(): string | null {
  migrateLegacyLocal();
  return _data.has('SampleScene') ? 'SampleScene' : null;
}

export async function setActiveSceneName(name: string | null) {
  _active = name;
  if (_backend === 'desktop') {
    if (name) await openDesktopScene(name);
    return;
  }
  if (_backend === 'disk') {
    await fetch(`${API}/active`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return;
  }
  if (name == null) localStorage.removeItem(SCENES_ACTIVE_KEY);
  else localStorage.setItem(SCENES_ACTIVE_KEY, name);
}

/** Persist Game 视图比例 / 横竖屏（立即写入，无需保存场景）. */
export async function setEditorPrefs(partial: EditorPrefs) {
  _prefs = { ..._prefs, ...partial };
  if (_backend === 'desktop') {
    saveLocalPrefs();
    return;
  }
  if (_backend === 'disk') {
    await fetch(`${API}/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_prefs),
    });
    return;
  }
  saveLocalPrefs();
}

export async function writeScene(name: string, json: string) {
  _data.set(name, json);
  const meta = { name, updatedAt: Date.now() };
  _index = sortIndex([..._index.filter((s) => s.name !== name), meta]);
  _active = name;

  if (_backend === 'desktop') {
    await replaceDesktopSceneJson(json);
    const saved = await saveDesktopScene(name);
    const savedName = saved.scenePath?.split('/').pop()?.replace(/\.mscene$/i, '') ?? name;
    _index = sortIndex([
      ..._index.filter((scene) => scene.name !== savedName),
      { name: savedName, updatedAt: Date.now() },
    ]);
    _data.set(savedName, json);
    _active = savedName;
    return;
  }

  if (_backend === 'disk') {
    const res = await fetch(`${API}/scenes/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    });
    if (!res.ok) throw new Error(`disk write failed: ${res.status}`);
    const out = (await res.json()) as { updatedAt?: number };
    if (out.updatedAt) {
      _index = sortIndex([
        ..._index.filter((s) => s.name !== name),
        { name, updatedAt: out.updatedAt },
      ]);
    }
    return;
  }

  localStorage.setItem(dataKey(name), json);
  applyLocalIndex(_index);
  localStorage.setItem(SCENES_ACTIVE_KEY, name);
}

export async function deleteScene(name: string) {
  if (_backend === 'desktop') {
    throw new Error('desktop scene deletion is not implemented yet');
  }
  _data.delete(name);
  _index = _index.filter((s) => s.name !== name);
  if (_active === name) _active = null;

  if (_backend === 'disk') {
    await fetch(`${API}/scenes/${encodeURIComponent(name)}`, { method: 'DELETE' });
    return;
  }
  localStorage.removeItem(dataKey(name));
  applyLocalIndex(_index);
  if (localStorage.getItem(SCENES_ACTIVE_KEY) === name) {
    localStorage.removeItem(SCENES_ACTIVE_KEY);
  }
}

/** Rename scene asset. Returns null on failure; oldName if unchanged; newName on success. */
export async function renameScene(oldName: string, newNameRaw: string): Promise<string | null> {
  const newName = normalizeSceneName(newNameRaw);
  if (!newName) return null;
  if (newName === oldName) return oldName;
  if (!_data.has(oldName) && !readSceneJson(oldName)) return null;
  if (sceneExists(newName)) return null;

  if (_backend === 'desktop') return null;

  if (_backend === 'disk') {
    const res = await fetch(`${API}/scenes/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: oldName, to: newName }),
    });
    if (!res.ok) return null;
    const json = _data.get(oldName);
    if (json) {
      try {
        const data = JSON.parse(json);
        data.name = newName;
        _data.set(newName, JSON.stringify(data, null, 2));
      } catch {
        _data.set(newName, json);
      }
      _data.delete(oldName);
    }
    _index = sortIndex([
      ..._index.filter((s) => s.name !== oldName && s.name !== newName),
      { name: newName, updatedAt: Date.now() },
    ]);
    if (_active === oldName) _active = newName;
    return newName;
  }

  const json = readSceneJson(oldName)!;
  let payload = json;
  try {
    const data = JSON.parse(json);
    data.name = newName;
    payload = JSON.stringify(data, null, 2);
  } catch {
    /* keep raw */
  }
  localStorage.setItem(dataKey(newName), payload);
  localStorage.removeItem(dataKey(oldName));
  _data.set(newName, payload);
  _data.delete(oldName);
  applyLocalIndex([
    ..._index.filter((s) => s.name !== oldName && s.name !== newName),
    { name: newName, updatedAt: Date.now() },
  ]);
  if (_active === oldName) {
    _active = newName;
    localStorage.setItem(SCENES_ACTIVE_KEY, newName);
  }
  return newName;
}
