import { createEditorBroadcastChannel } from './editorInstance.ts';

export type EditorDialogKind = 'alert' | 'confirm' | 'prompt';
export type EditorDialogAction = 'accept' | 'cancel';

export type EditorDialogSnapshot = {
  id: string;
  kind: EditorDialogKind;
  title: string;
  message: string;
  defaultValue: string | null;
  confirmLabel: string;
  cancelLabel: string | null;
  createdAt: number;
};

export type EditorDialogOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type EditorDialogResolution = {
  dialogId: string;
  kind: EditorDialogKind;
  action: EditorDialogAction;
  value?: string;
};

export type EditorWindowDialogSnapshot = EditorDialogSnapshot & {
  windowLabel: string;
};

type PendingDialog = {
  snapshot: EditorDialogSnapshot;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

const MAX_QUEUED_DIALOGS = 64;
const MAX_PROMPT_CHARS = 4_096;
const REMOTE_RESPONSE_TIMEOUT_MS = 2_000;
const DIALOG_CHANNEL_NAME = 'mengine-editor-dialogs-v1';
const listeners = new Set<() => void>();
const queue: PendingDialog[] = [];
const remoteDialogs = new Map<string, EditorDialogSnapshot>();
const pendingRemoteResponses = new Map<string, {
  resolve: (value: EditorDialogResolution | null) => void;
  timer: ReturnType<typeof window.setTimeout>;
}>();
let active: PendingDialog | null = null;
let activeSnapshot: EditorDialogSnapshot | null = null;
let localWindowLabel = 'main';
let dialogChannel: BroadcastChannel | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function broadcastLocalState(): void {
  dialogChannel?.postMessage({
    type: 'state',
    source: localWindowLabel,
    dialog: activeSnapshot,
  });
}

function publishLocalState(): void {
  emit();
  broadcastLocalState();
}

function activateNext(): void {
  active = queue.shift() ?? null;
  activeSnapshot = active?.snapshot ?? null;
}

function defaultTitle(kind: EditorDialogKind): string {
  if (kind === 'alert') return 'Notice';
  if (kind === 'prompt') return 'Input Required';
  return 'Confirm';
}

function requestDialog<T>(
  kind: EditorDialogKind,
  message: string,
  defaultValue: string | null,
  options: EditorDialogOptions,
): Promise<T> {
  if (queue.length + (active ? 1 : 0) >= MAX_QUEUED_DIALOGS) {
    return Promise.reject(new Error(`Editor dialog queue is full (${MAX_QUEUED_DIALOGS})`));
  }
  const snapshot: EditorDialogSnapshot = Object.freeze({
    id: crypto.randomUUID(),
    kind,
    title: options.title?.trim() || defaultTitle(kind),
    message: String(message),
    defaultValue: defaultValue?.slice(0, MAX_PROMPT_CHARS) ?? null,
    confirmLabel: options.confirmLabel?.trim() || 'OK',
    cancelLabel: kind === 'alert'
      ? null
      : (options.cancelLabel?.trim() || 'Cancel'),
    createdAt: Date.now(),
  });
  return new Promise<T>((resolve, reject) => {
    queue.push({
      snapshot,
      resolve: (value) => resolve(value as T),
      reject,
    });
    if (!active) {
      activateNext();
      publishLocalState();
    }
  });
}

export function alertEditor(
  message: string,
  options: EditorDialogOptions = {},
): Promise<void> {
  return requestDialog<void>('alert', message, null, options);
}

export function confirmEditor(
  message: string,
  options: EditorDialogOptions = {},
): Promise<boolean> {
  return requestDialog<boolean>('confirm', message, null, options);
}

export function promptEditor(
  message: string,
  defaultValue = '',
  options: EditorDialogOptions = {},
): Promise<string | null> {
  return requestDialog<string | null>('prompt', message, defaultValue, options);
}

export function subscribeEditorDialog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveEditorDialog(): EditorDialogSnapshot | null {
  return activeSnapshot;
}

export function respondToEditorDialog(
  dialogId: string,
  action: EditorDialogAction,
  value?: string,
): EditorDialogResolution | null {
  if (!active || active.snapshot.id !== dialogId) return null;
  const pending = active;
  const snapshot = pending.snapshot;
  const resolution: EditorDialogResolution = {
    dialogId,
    kind: snapshot.kind,
    action,
  };
  if (snapshot.kind === 'prompt' && action === 'accept') {
    const acceptedValue = String(value ?? snapshot.defaultValue ?? '').slice(0, MAX_PROMPT_CHARS);
    resolution.value = acceptedValue;
    pending.resolve(acceptedValue);
  } else if (snapshot.kind === 'prompt') {
    pending.resolve(null);
  } else if (snapshot.kind === 'confirm') {
    pending.resolve(action === 'accept');
  } else {
    pending.resolve(undefined);
  }
  active = null;
  activeSnapshot = null;
  activateNext();
  publishLocalState();
  return resolution;
}

export function getEditorDialogForWindow(
  windowLabel = 'main',
): EditorWindowDialogSnapshot | null {
  const snapshot = windowLabel === localWindowLabel
    ? activeSnapshot
    : (remoteDialogs.get(windowLabel) ?? null);
  return snapshot ? { ...snapshot, windowLabel } : null;
}

export async function respondToEditorDialogInWindow(
  windowLabel: string,
  dialogId: string,
  action: EditorDialogAction,
  value?: string,
): Promise<EditorDialogResolution | null> {
  if (windowLabel === localWindowLabel) {
    return respondToEditorDialog(dialogId, action, value);
  }
  if (!dialogChannel || remoteDialogs.get(windowLabel)?.id !== dialogId) return null;
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      pendingRemoteResponses.delete(requestId);
      resolve(null);
    }, REMOTE_RESPONSE_TIMEOUT_MS);
    pendingRemoteResponses.set(requestId, { resolve, timer });
    dialogChannel?.postMessage({
      type: 'respond',
      source: localWindowLabel,
      target: windowLabel,
      requestId,
      dialogId,
      action,
      value,
    });
  });
}

export function initializeEditorDialogSync(
  windowLabel: string,
): () => void {
  const normalized = windowLabel.trim();
  if (!normalized) throw new Error('Editor dialog window label must not be empty');
  localWindowLabel = normalized;
  const channel = createEditorBroadcastChannel(DIALOG_CHANNEL_NAME);
  if (!channel) return () => {};
  dialogChannel?.close();
  dialogChannel = channel;
  channel.addEventListener('message', (event: MessageEvent<{
    type?: string;
    source?: string;
    target?: string;
    requestId?: string;
    dialogId?: string;
    action?: EditorDialogAction;
    value?: string;
    dialog?: EditorDialogSnapshot | null;
    result?: EditorDialogResolution | null;
  }>) => {
    const message = event.data;
    if (!message || message.source === localWindowLabel) return;
    if (message.type === 'state' && message.source) {
      if (message.dialog) remoteDialogs.set(message.source, message.dialog);
      else remoteDialogs.delete(message.source);
      return;
    }
    if (message.type === 'closed' && message.source) {
      remoteDialogs.delete(message.source);
      return;
    }
    if (message.type === 'request-state') {
      broadcastLocalState();
      return;
    }
    if (
      message.type === 'respond'
      && message.target === localWindowLabel
      && message.source
      && message.requestId
      && message.dialogId
      && (message.action === 'accept' || message.action === 'cancel')
    ) {
      const result = respondToEditorDialog(
        message.dialogId,
        message.action,
        message.value,
      );
      channel.postMessage({
        type: 'respond-result',
        source: localWindowLabel,
        target: message.source,
        requestId: message.requestId,
        result,
      });
      return;
    }
    if (
      message.type === 'respond-result'
      && message.target === localWindowLabel
      && message.requestId
    ) {
      const pending = pendingRemoteResponses.get(message.requestId);
      if (!pending) return;
      pendingRemoteResponses.delete(message.requestId);
      window.clearTimeout(pending.timer);
      pending.resolve(message.result ?? null);
    }
  });
  channel.postMessage({ type: 'request-state', source: localWindowLabel });
  broadcastLocalState();
  return () => {
    if (dialogChannel !== channel) return;
    channel.postMessage({ type: 'closed', source: localWindowLabel });
    channel.close();
    dialogChannel = null;
    remoteDialogs.clear();
    for (const [requestId, pending] of pendingRemoteResponses) {
      window.clearTimeout(pending.timer);
      pending.resolve(null);
      pendingRemoteResponses.delete(requestId);
    }
  };
}

export function rejectEditorDialogs(reason: unknown): void {
  const pending = [active, ...queue].filter((item): item is PendingDialog => item != null);
  active = null;
  activeSnapshot = null;
  queue.length = 0;
  for (const dialog of pending) dialog.reject(reason);
  publishLocalState();
}

export function resetEditorDialogsForTests(): void {
  rejectEditorDialogs(new Error('Editor dialogs reset for test'));
  listeners.clear();
  remoteDialogs.clear();
}
