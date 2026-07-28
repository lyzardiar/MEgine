import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  getActiveEditorDialog,
  initializeEditorDialogSync,
  respondToEditorDialog,
  subscribeEditorDialog,
} from './editorDialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getEditorInstanceId } from './transport/editorTransport';

export function EditorDialogHost() {
  const dialog = useSyncExternalStore(
    subscribeEditorDialog,
    getActiveEditorDialog,
    getActiveEditorDialog,
  );
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let disposed = false;
    let disconnect: (() => void) | null = null;
    void (async () => {
      let windowLabel = 'main';
      try {
        windowLabel = getCurrentWindow().label;
      } catch {
        // Browser development mode has no Tauri window metadata.
      }
      try {
        const instanceId = await getEditorInstanceId();
        if (disposed) return;
        disconnect = initializeEditorDialogSync(windowLabel, instanceId);
      } catch (reason) {
        console.error('Failed to initialize cross-window editor dialogs', reason);
      }
    })();
    return () => {
      disposed = true;
      disconnect?.();
    };
  }, []);

  useEffect(() => {
    setValue(dialog?.defaultValue ?? '');
    if (!dialog) return;
    window.setTimeout(() => {
      if (dialog.kind === 'prompt') {
        input.current?.focus();
        input.current?.select();
      } else {
        confirmButton.current?.focus();
      }
    }, 0);
  }, [dialog?.id, dialog?.defaultValue, dialog?.kind]);

  if (!dialog) return null;

  const accept = () => {
    respondToEditorDialog(dialog.id, 'accept', dialog.kind === 'prompt' ? value : undefined);
  };
  const cancel = () => {
    respondToEditorDialog(dialog.id, 'cancel');
  };

  return (
    <div
      className="editor-dialog-backdrop"
      data-editor-dialog-id={dialog.id}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && dialog.cancelLabel) {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          accept();
        }
      }}
    >
      <section
        className="editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`editor-dialog-title-${dialog.id}`}
        aria-describedby={`editor-dialog-message-${dialog.id}`}
      >
        <h2 id={`editor-dialog-title-${dialog.id}`}>{dialog.title}</h2>
        <div id={`editor-dialog-message-${dialog.id}`} className="editor-dialog-message">
          {dialog.message}
        </div>
        {dialog.kind === 'prompt' && (
          <input
            ref={input}
            className="editor-dialog-input"
            aria-label="Dialog input"
            value={value}
            maxLength={4096}
            onChange={(event) => setValue(event.target.value)}
          />
        )}
        <div className="editor-dialog-actions">
          {dialog.cancelLabel && (
            <button type="button" onClick={cancel}>{dialog.cancelLabel}</button>
          )}
          <button ref={confirmButton} type="button" className="primary" onClick={accept}>
            {dialog.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
