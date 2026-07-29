/** Script assets in Project → active native project on desktop, Vite bridge in browser preview. */

import { invoke } from '@tauri-apps/api/core';
import {
  desktopScriptAssets,
  vscodeFileUri,
  type IndexedScriptAsset,
  type ScriptAsset,
} from './scriptLibraryModel.ts';
import { isDesktopEditor, type ProjectSnapshot } from './transport/editorTransport.ts';

const API = '/__mengine';

export type { ScriptAsset } from './scriptLibraryModel.ts';

let _scripts: ScriptAsset[] = [];
let _ready = false;

export function listScripts(): ScriptAsset[] {
  return _scripts;
}

export async function refreshScripts(): Promise<ScriptAsset[]> {
  try {
    if (isDesktopEditor()) {
      const [project, assets] = await Promise.all([
        invoke<ProjectSnapshot>('get_project_snapshot'),
        invoke<IndexedScriptAsset[]>('list_project_assets'),
      ]);
      _scripts = desktopScriptAssets(project.projectRoot, assets);
    } else {
      const res = await fetch(`${API}/scripts`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { scripts: ScriptAsset[] };
      _scripts = Array.isArray(body.scripts) ? body.scripts : [];
    }
  } catch {
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
