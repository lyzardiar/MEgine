/** Script assets in Project → active native project on desktop, Vite bridge in browser preview. */

import {
  desktopScriptAssets,
  vscodeFileUri,
  type IndexedScriptAsset,
  type ScriptAsset,
} from './scriptLibraryModel.ts';
import { isDesktopEditor } from './transport/editorTransport.ts';
import { getDesktopProject } from './transport/desktopProjectSession.ts';
import { projectAssetSessionGeneration, refreshProjectFiles } from './projectAssets.ts';

const API = '/__mengine';

export type { ScriptAsset } from './scriptLibraryModel.ts';

let _scripts: ScriptAsset[] = [];
let _ready = false;

export function listScripts(): ScriptAsset[] {
  return _scripts;
}

export async function refreshScripts(indexedAssets?: IndexedScriptAsset[]): Promise<ScriptAsset[]> {
  const generation = projectAssetSessionGeneration();
  try {
    if (isDesktopEditor()) {
      const assets = indexedAssets ?? await refreshProjectFiles();
      if (generation !== projectAssetSessionGeneration()) return _scripts;
      const project = getDesktopProject();
      if (!project) { _scripts = []; _ready = true; return _scripts; }
      _scripts = desktopScriptAssets(project.projectRoot, assets);
    } else {
      const res = await fetch(`${API}/scripts`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { scripts: ScriptAsset[] };
      if (generation !== projectAssetSessionGeneration()) return _scripts;
      _scripts = Array.isArray(body.scripts) ? body.scripts : [];
    }
  } catch {
    if (generation !== projectAssetSessionGeneration()) return _scripts;
    _scripts = [];
  }
  _ready = true;
  return _scripts;
}

export function isScriptLibraryReady() {
  return _ready;
}

/** Open a script in Cursor / VS Code (same IDE). */
export async function openScriptInIde(script: ScriptAsset): Promise<boolean> {
  if (isDesktopEditor()) {
    if (!script.id.startsWith('project/')) return false;
    const indexed = _scripts.find((candidate) => (
      candidate.id === script.id
      && candidate.absPath === script.absPath
    ));
    const uri = indexed ? vscodeFileUri(indexed.absPath) : null;
    if (!uri) return false;
    const anchor = document.createElement('a');
    anchor.href = uri;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  }
  try {
    const res = await fetch(`${API}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: script.id }),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as {
      ok: boolean;
      vscodeUri?: string;
      absPath?: string;
    };

    // vscode:// 让 Cursor / VS Code 在当前窗口打开（不跳转 Simple Browser）
    if (body.vscodeUri) {
      const a = document.createElement('a');
      a.href = body.vscodeUri;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    return body.ok || !!body.vscodeUri;
  } catch {
    return false;
  }
}
