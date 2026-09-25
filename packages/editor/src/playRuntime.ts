import { invoke } from '@tauri-apps/api/core';
import type { WorldSnapshotView } from '@mengine/api';
import { toWorldSnapshotView, type HostWorldSnapshot } from './transport/editorTransport';

export type PlayInput = {
  keys: string[]; pressedKeys: string[]; releasedKeys: string[];
  pointer: [number, number]; viewport: [number, number];
  buttons: number[]; pressedButtons: number[]; releasedButtons: number[];
};

export const emptyPlayInput = (): PlayInput => ({ keys: [], pressedKeys: [], releasedKeys: [], pointer: [0, 0], viewport: [1, 1], buttons: [], pressedButtons: [], releasedButtons: [] });

export type PlayRuntimeDriver = {
  start(snapshot: WorldSnapshotView): Promise<WorldSnapshotView | void>;
  step(snapshot: WorldSnapshotView, input: PlayInput, dt: number): Promise<WorldSnapshotView>;
  stop(): void;
  onError(error: unknown): void;
};

export function createNativePlayRuntime(onError: PlayRuntimeDriver['onError']): PlayRuntimeDriver {
  let sessionId: number | null = null;
  let generation = 0;
  return {
    async start(snapshot) {
      const current = ++generation;
      const result = await invoke<{ sessionId: number; snapshot: HostWorldSnapshot }>('start_editor_play', { snapshot });
      if (current === generation) { sessionId = result.sessionId; return toWorldSnapshotView(result.snapshot); }
    },
    async step(snapshot, input, dt) {
      if (sessionId === null) throw new Error('Play Mode is initializing');
      const world = await invoke<HostWorldSnapshot>('step_editor_play', { sessionId, snapshot, input, dt });
      return toWorldSnapshotView(world);
    },
    stop() { generation++; sessionId = null; void invoke('stop_editor_play').catch(onError); },
    onError,
  };
}
