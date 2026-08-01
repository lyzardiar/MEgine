import type {
  EditorUiSnapshot,
  EditorUiWorkspaceSnapshot,
  EditorWindowInfo,
  EditorWindowUiSnapshotEntry,
} from './protocol';

export interface CollectAllWindowUiSnapshotsOptions {
  maxElementsPerWindow: number;
  readWindows: () => Promise<EditorWindowInfo[]>;
  inspectWindow: (windowLabel: string, maxElements: number) => Promise<EditorUiSnapshot>;
  now?: () => number;
}

function inventorySignature(windows: readonly EditorWindowInfo[]): string {
  return JSON.stringify([...windows].sort((left, right) => left.label.localeCompare(right.label)));
}

function snapshotError(error: unknown): { code: string; message: string } {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = typeof value?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value.code)
    ? value.code
    : 'INTERNAL';
  const message = typeof value?.message === 'string' && value.message
    ? value.message
    : String(error);
  return {
    code,
    message: message.slice(0, 1_000),
  };
}

/**
 * Collect windows serially to keep CDP/WebView pressure bounded. A second
 * inventory read proves whether the aggregate still covers the complete
 * native window set by the time collection finishes.
 */
export async function collectAllWindowUiSnapshots(
  options: CollectAllWindowUiSnapshotsOptions,
): Promise<EditorUiWorkspaceSnapshot> {
  const initialWindows = await options.readWindows();
  const windows: EditorWindowUiSnapshotEntry[] = [];
  for (const window of initialWindows) {
    try {
      const snapshot = await options.inspectWindow(window.label, options.maxElementsPerWindow);
      if (snapshot.windowLabel !== window.label) {
        throw new Error(
          `Semantic snapshot label ${snapshot.windowLabel} did not match requested window ${window.label}`,
        );
      }
      windows.push({ window, snapshot, error: null });
    } catch (error) {
      windows.push({ window, snapshot: null, error: snapshotError(error) });
    }
  }
  const finalWindows = await options.readWindows();
  const inventoryStable = inventorySignature(initialWindows) === inventorySignature(finalWindows);
  const snapshots = windows.flatMap((entry) => (entry.snapshot ? [entry.snapshot] : []));
  const failedWindowCount = windows.length - snapshots.length;
  const hasMore = snapshots.some((snapshot) => snapshot.hasMore);
  // A failed capture is unknown, not proof of safety. Propagate every
  // per-window attestation instead of unconditionally blessing the aggregate.
  const backgroundSafe = failedWindowCount === 0
    && snapshots.every((snapshot) => snapshot.backgroundSafe);

  return {
    version: 1,
    capturedAt: (options.now ?? Date.now)(),
    backgroundSafe,
    inventoryStable,
    complete: inventoryStable && !hasMore && backgroundSafe,
    initialWindowCount: initialWindows.length,
    finalWindowCount: finalWindows.length,
    capturedWindowCount: snapshots.length,
    failedWindowCount,
    totalSemanticElements: snapshots.reduce(
      (total, snapshot) => total + snapshot.totalSemanticElements,
      0,
    ),
    returnedSemanticElements: snapshots.reduce((total, snapshot) => total + snapshot.count, 0),
    hasMore,
    windows,
  };
}
