const BROWSER_INSTANCE_ID = 'browser';

let editorInstanceId = BROWSER_INSTANCE_ID;
let initialized = false;

export function initializeEditorInstance(rawInstanceId: string): string {
  const instanceId = rawInstanceId.trim();
  if (!instanceId) throw new Error('Editor instance id must not be empty');
  if (initialized && editorInstanceId !== instanceId) {
    throw new Error('Editor instance id cannot change after initialization');
  }
  editorInstanceId = instanceId;
  initialized = true;
  return editorInstanceId;
}

export function getEditorInstanceIdForChannels(): string {
  return editorInstanceId;
}

export function editorBroadcastChannelName(baseName: string): string {
  if (!initialized) {
    throw new Error('Editor instance must be initialized before opening a channel');
  }
  const normalized = baseName.trim();
  if (!normalized) throw new Error('Editor channel name must not be empty');
  return `${normalized}:${editorInstanceId}`;
}

export function createEditorBroadcastChannel(baseName: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(editorBroadcastChannelName(baseName));
}
