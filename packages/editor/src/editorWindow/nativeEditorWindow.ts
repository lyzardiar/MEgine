import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isDesktopEditor } from '../transport/editorTransport';
import { editorWindowLabelFor } from './editorWindowLabel';

export function editorWindowTypeFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get('editorWindow');
}

export async function openNativeEditorWindow(options: {
  typeId: string;
  title: string;
  width: number;
  height: number;
  activateWindow?: boolean;
}): Promise<boolean> {
  const url = `/?editorWindow=${encodeURIComponent(options.typeId)}`;
  const activateWindow = options.activateWindow !== false;
  if (!isDesktopEditor()) {
    if (!activateWindow) return false;
    return window.open(
      url,
      editorWindowLabelFor(options.typeId),
      `popup=yes,width=${options.width},height=${options.height},resizable=yes`,
    ) != null;
  }

  const label = editorWindowLabelFor(options.typeId);
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    if (activateWindow) {
      await existing.show();
      await existing.setFocus();
    }
    return true;
  }
  return new Promise<boolean>((resolve) => {
    const webview = new WebviewWindow(label, {
      url,
      title: `MEngine - ${options.title}`,
      width: options.width,
      height: options.height,
      resizable: true,
      visible: activateWindow,
      focus: activateWindow,
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
