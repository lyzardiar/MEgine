import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isDesktopEditor } from '../transport/editorTransport';

function labelFor(typeId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < typeId.length; index += 1) {
    hash ^= typeId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `editor-${(hash >>> 0).toString(16)}`;
}

export function editorWindowTypeFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('editorWindow');
}

export async function openNativeEditorWindow(options: {
  typeId: string;
  title: string;
  width: number;
  height: number;
}): Promise<boolean> {
  const url = `/?editorWindow=${encodeURIComponent(options.typeId)}`;
  if (!isDesktopEditor()) {
    return window.open(
      url,
      labelFor(options.typeId),
      `popup=yes,width=${options.width},height=${options.height},resizable=yes`,
    ) != null;
  }

  const label = labelFor(options.typeId);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return true;
  }
  return new Promise<boolean>((resolve) => {
    const webview = new WebviewWindow(label, {
      url,
      title: `MEngine - ${options.title}`,
      width: options.width,
      height: options.height,
      resizable: true,
      focus: true,
    });
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    void webview.once('tauri://created', () => finish(true));
    void webview.once('tauri://error', () => finish(false));
    window.setTimeout(() => finish(false), 5000);
  });
}
