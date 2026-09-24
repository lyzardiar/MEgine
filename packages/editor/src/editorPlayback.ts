// Author: MiYu
import type { EditorStore } from './store';

export type PlaybackAction = 'toggle' | 'pause' | 'step';

export function playbackShortcut(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'repeat' | 'isComposing'>): PlaybackAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'p' || event.repeat || event.isComposing || (event.shiftKey && event.altKey)) return null;
  return event.shiftKey ? 'pause' : event.altKey ? 'step' : 'toggle';
}

export function applyPlaybackAction(store: Pick<EditorStore, 'mode' | 'play' | 'stop' | 'pause' | 'step'>, action: PlaybackAction): boolean {
  if (action === 'toggle') {
    if (store.mode === 'edit') store.play();
    else store.stop();
    return true;
  }
  if (store.mode === 'edit') return false;
  if (action === 'pause') {
    store.pause();
    return true;
  }
  if (store.mode === 'play') store.pause();
  return store.step(1 / 60);
}
