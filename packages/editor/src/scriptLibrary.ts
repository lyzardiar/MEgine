/** Script assets in Project → open in current IDE via Vite bridge. */

const API = '/__mengine';

export type ScriptAsset = {
  id: string;
  name: string;
  folder: string;
  absPath: string;
};

let _scripts: ScriptAsset[] = [];
let _ready = false;

export function listScripts(): ScriptAsset[] {
  return _scripts;
}

export async function refreshScripts(): Promise<ScriptAsset[]> {
  try {
    const res = await fetch(`${API}/scripts`);
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { scripts: ScriptAsset[] };
    _scripts = Array.isArray(body.scripts) ? body.scripts : [];
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
